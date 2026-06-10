import { Command } from 'commander';
import fsExtra from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';
import { registerInfraCommands } from '../../commands/infra.js';
import { buildInfraPlan, writeInfraArtifacts } from '../../utils/infra-plan.js';

const tempDirs: string[] = [];
const mockExeca = execa as unknown as ReturnType<typeof vi.fn>;

function expectDockerComposeCall(expectedArgs: string[], workspacePath: string): void {
  const match = mockExeca.mock.calls.find(
    ([cmd, args, options]) =>
      cmd === 'docker' &&
      args[0] === 'compose' &&
      expectedArgs.every((item) => args.includes(item)) &&
      path.resolve(String(options?.cwd ?? '')) === path.resolve(workspacePath)
  );

  expect(match, `docker compose call with ${expectedArgs.join(' ')}`).toBeDefined();

  const composeFileArg = match![1][match![1].indexOf('-f') + 1];
  expect(composeFileArg).toMatch(/docker-compose\.yml$/);
  expect(String(composeFileArg).replace(/\\/g, '/')).toContain(
    '.rapidkit/infra/docker-compose.yml'
  );
}

async function createWorkspace(): Promise<string> {
  const dir = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-infra-command-'));
  tempDirs.push(dir);

  await fsExtra.ensureDir(path.join(dir, '.rapidkit'));
  await fsExtra.writeJson(path.join(dir, '.rapidkit', 'workspace.json'), {
    workspace_name: 'infra-test',
  });

  const projectRoot = path.join(dir, 'api');
  await fsExtra.ensureDir(path.join(projectRoot, '.rapidkit'));
  await fsExtra.writeJson(path.join(projectRoot, '.rapidkit', 'project.json'), {
    slug: 'api',
    kit: 'fastapi.standard',
  });
  await fsExtra.writeJson(path.join(projectRoot, 'registry.json'), {
    installed_modules: [{ slug: 'free/cache/redis' }],
  });

  return dir;
}

describe('infra command', () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockExeca.mockReset();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) await fsExtra.remove(dir);
    }
  });

  it('runs infra plan and writes artifacts from commander action', async () => {
    const workspacePath = await createWorkspace();
    process.chdir(workspacePath);

    const program = new Command();
    registerInfraCommands(program);

    await program.parseAsync(['node', 'rapidkit', 'infra', 'plan']);

    await expect(
      fsExtra.pathExists(path.join(workspacePath, '.rapidkit', 'infra', 'docker-compose.yml'))
    ).resolves.toBe(true);
    await expect(
      fsExtra.pathExists(path.join(workspacePath, '.rapidkit', 'reports', 'infra-plan.json'))
    ).resolves.toBe(true);
  });

  it('runs docker compose up with generated compose file', async () => {
    const workspacePath = await createWorkspace();
    process.chdir(workspacePath);

    const plan = await buildInfraPlan({ workspacePath });
    await writeInfraArtifacts({ workspacePath, plan });

    mockExeca.mockImplementation(async (cmd: string, args: string[]) => {
      if (
        cmd === 'docker' &&
        (args[0] === 'version' || (args[0] === 'compose' && args[1] === 'version'))
      ) {
        return { exitCode: 0, stdout: 'ok', stderr: '' };
      }
      if (cmd === 'docker-compose' && args[0] === 'version') {
        return { exitCode: 1, stdout: '', stderr: '' };
      }
      return { exitCode: 0, stdout: 'Started\n', stderr: '' };
    });

    const program = new Command();
    registerInfraCommands(program);
    await program.parseAsync(['node', 'rapidkit', 'infra', 'up', '--no-plan']);

    expectDockerComposeCall(['up', '-d'], workspacePath);
  });

  it('runs docker compose down with optional volume cleanup', async () => {
    const workspacePath = await createWorkspace();
    process.chdir(workspacePath);

    const plan = await buildInfraPlan({ workspacePath });
    await writeInfraArtifacts({ workspacePath, plan });

    mockExeca.mockImplementation(async (cmd: string, args: string[]) => {
      if (
        cmd === 'docker' &&
        (args[0] === 'version' || (args[0] === 'compose' && args[1] === 'version'))
      ) {
        return { exitCode: 0, stdout: 'ok', stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    const program = new Command();
    registerInfraCommands(program);
    await program.parseAsync(['node', 'rapidkit', 'infra', 'down', '--volumes']);

    expectDockerComposeCall(['down', '-v'], workspacePath);
  });
});
