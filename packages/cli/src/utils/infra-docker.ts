import path from 'path';
import { execa } from 'execa';

export type DockerComposeInvocation = {
  command: string;
  prefixArgs: string[];
};

export function normalizeComposeFilePath(composePath: string): string {
  return path.resolve(composePath).split(path.sep).join('/');
}

export async function resolveDockerComposeInvocation(): Promise<DockerComposeInvocation> {
  const composeV2 = await execa('docker', ['compose', 'version'], {
    reject: false,
    timeout: 5000,
  });
  if (composeV2.exitCode === 0) {
    return { command: 'docker', prefixArgs: ['compose'] };
  }

  const composeV1 = await execa('docker-compose', ['version'], {
    reject: false,
    timeout: 5000,
  });
  if (composeV1.exitCode === 0) {
    return { command: 'docker-compose', prefixArgs: [] };
  }

  throw new Error(
    'Docker Compose is not available. Install Docker Desktop or the docker-compose plugin, then verify with: docker compose version'
  );
}

export async function assertDockerAvailable(): Promise<void> {
  const docker = await execa('docker', ['version'], { reject: false, timeout: 5000 });
  if (docker.exitCode !== 0) {
    throw new Error(
      'Docker is not available in PATH. Install Docker and ensure the daemon is running before using rapidkit infra.'
    );
  }

  await resolveDockerComposeInvocation();
}

export function explainDockerFailure(stderr: string): string | null {
  const normalized = stderr.toLowerCase();
  if (normalized.includes('no space left on device')) {
    return 'Docker failed because the disk is full. Free space with: docker system prune -f (or docker system prune -a --volumes -f).';
  }
  if (normalized.includes('address already in use') || normalized.includes('bind')) {
    return 'Docker failed to bind a host port. Stop the conflicting service or adjust ports in contracts/infra-stack.v1.json via .workspai/infra/overrides.json.';
  }
  if (normalized.includes('cannot connect to the docker daemon')) {
    return 'Docker daemon is not running. Start Docker Desktop or the docker service, then retry.';
  }
  return null;
}

export async function runDockerComposeCommand(input: {
  composePath: string;
  workspacePath: string;
  args: string[];
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  await assertDockerAvailable();
  const invocation = await resolveDockerComposeInvocation();
  const composeFile = normalizeComposeFilePath(input.composePath);

  const result = await execa(
    invocation.command,
    [...invocation.prefixArgs, '-f', composeFile, ...input.args],
    {
      cwd: input.workspacePath,
      reject: false,
    }
  );

  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
