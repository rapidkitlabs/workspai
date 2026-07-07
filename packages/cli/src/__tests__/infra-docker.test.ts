import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';
import {
  assertDockerAvailable,
  explainDockerFailure,
  normalizeComposeFilePath,
  resolveDockerComposeInvocation,
  runDockerComposeCommand,
} from '../utils/infra-docker.js';

const mockExeca = execa as unknown as ReturnType<typeof vi.fn>;

describe('infra docker helpers', () => {
  beforeEach(() => {
    mockExeca.mockReset();
  });

  it('normalizes compose file paths for cross-platform docker -f arguments', () => {
    const normalized = normalizeComposeFilePath(
      path.join('/tmp', 'workspace', '.rapidkit', 'infra', 'docker-compose.yml')
    );

    expect(normalized).not.toContain('\\');
    expect(normalized.endsWith('.rapidkit/infra/docker-compose.yml')).toBe(true);

    if (process.platform === 'win32') {
      expect(normalized).toMatch(/^[A-Za-z]:\//);
    } else {
      expect(normalized).toBe('/tmp/workspace/.rapidkit/infra/docker-compose.yml');
    }
  });

  it('prefers docker compose v2 when available', async () => {
    mockExeca.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === 'docker' && args[0] === 'compose' && args[1] === 'version') {
        return { exitCode: 0, stdout: 'v2', stderr: '' };
      }
      return { exitCode: 1, stdout: '', stderr: '' };
    });

    await expect(resolveDockerComposeInvocation()).resolves.toEqual({
      command: 'docker',
      prefixArgs: ['compose'],
    });
  });

  it('falls back to docker-compose v1 when compose plugin is unavailable', async () => {
    mockExeca.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === 'docker' && args[0] === 'compose') {
        return { exitCode: 1, stdout: '', stderr: '' };
      }
      if (cmd === 'docker-compose' && args[0] === 'version') {
        return { exitCode: 0, stdout: 'v1', stderr: '' };
      }
      return { exitCode: 1, stdout: '', stderr: '' };
    });

    await expect(resolveDockerComposeInvocation()).resolves.toEqual({
      command: 'docker-compose',
      prefixArgs: [],
    });
  });

  it('throws when neither docker compose nor docker-compose is available', async () => {
    mockExeca.mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' });

    await expect(resolveDockerComposeInvocation()).rejects.toThrow(
      'Docker Compose is not available'
    );
  });

  it('assertDockerAvailable requires docker and compose', async () => {
    mockExeca.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === 'docker' && args[0] === 'version') {
        return { exitCode: 1, stdout: '', stderr: 'daemon down' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    await expect(assertDockerAvailable()).rejects.toThrow('Docker is not available in PATH');
  });

  it('assertDockerAvailable succeeds when docker and compose are reachable', async () => {
    mockExeca.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === 'docker' && args[0] === 'version') {
        return { exitCode: 0, stdout: 'ok', stderr: '' };
      }
      if (cmd === 'docker' && args[0] === 'compose' && args[1] === 'version') {
        return { exitCode: 0, stdout: 'ok', stderr: '' };
      }
      return { exitCode: 1, stdout: '', stderr: '' };
    });

    await expect(assertDockerAvailable()).resolves.toBeUndefined();
  });

  it('explains common docker failure modes', () => {
    expect(explainDockerFailure('no space left on device')).toContain('disk is full');
    expect(explainDockerFailure('address already in use')).toContain('bind a host port');
    expect(explainDockerFailure('cannot connect to the docker daemon')).toContain(
      'Docker daemon is not running'
    );
    expect(explainDockerFailure('some other error')).toBeNull();
  });

  it('runs docker compose with normalized compose file path', async () => {
    const composePath = path.join('/tmp', 'workspace', '.rapidkit', 'infra', 'docker-compose.yml');
    const workspacePath = path.join('/tmp', 'workspace');

    mockExeca.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === 'docker' && args[0] === 'version') {
        return { exitCode: 0, stdout: 'ok', stderr: '' };
      }
      if (cmd === 'docker' && args[0] === 'compose' && args[1] === 'version') {
        return { exitCode: 0, stdout: 'ok', stderr: '' };
      }
      if (cmd === 'docker' && args[0] === 'compose' && args.includes('up')) {
        return { exitCode: 0, stdout: 'started', stderr: '' };
      }
      return { exitCode: 1, stdout: '', stderr: '' };
    });

    const result = await runDockerComposeCommand({
      composePath,
      workspacePath,
      args: ['up', '-d'],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('started');

    const composeCall = mockExeca.mock.calls.find(
      ([cmd, args]) => cmd === 'docker' && (args as string[]).includes('up')
    );
    expect(composeCall).toBeDefined();
    const composeArgs = composeCall![1] as string[];
    expect(composeArgs).toContain('-f');
    expect(composeArgs[composeArgs.indexOf('-f') + 1]).toBe(normalizeComposeFilePath(composePath));
  });
});
