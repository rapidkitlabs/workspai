import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'path';

vi.mock('fs-extra', () => {
  return {
    default: {
      pathExists: vi.fn(),
      readJson: vi.fn(),
    },
    pathExists: vi.fn(),
    readJson: vi.fn(),
  };
});

vi.mock('execa', () => {
  return {
    execa: vi.fn(),
  };
});

import * as fsExtra from 'fs-extra';
import { execa } from 'execa';
import { __test__, runCoreRapidkitCapture } from '../core-bridge/pythonRapidkitExec';

describe('pythonRapidkitExec workspace runner preference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PYENV_VERSION;
  });

  it('prefers .venv/bin/rapidkit when present and valid', async () => {
    const pathExists = fsExtra.pathExists as unknown as ReturnType<typeof vi.fn>;
    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;

    const cwd = '/work/ws/projects/api';
    // Use platform-appropriate venv path
    const venvRapidkit =
      process.platform === 'win32'
        ? join(cwd, '.venv', 'Scripts', 'rapidkit.exe')
        : join(cwd, '.venv', 'bin', 'rapidkit');

    pathExists.mockImplementation(async (p: string) => p === venvRapidkit);

    execaMock
      // Probe --version --json
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({ version: '0.2.0rc1' }),
        stderr: '',
      })
      // Actual command execution
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      });

    const res = await runCoreRapidkitCapture(['list', '--json'], { cwd });

    expect(res.exitCode).toBe(0);
    expect(execaMock).toHaveBeenCalledTimes(2);
    expect(execaMock.mock.calls[0][0]).toBe(venvRapidkit);
    expect(execaMock.mock.calls[1][0]).toBe(venvRapidkit);
  });

  it('uses marker metadata python.venvPath when workspace engine is installed outside default .venv', async () => {
    const pathExists = fsExtra.pathExists as unknown as ReturnType<typeof vi.fn>;
    const readJson = fsExtra.readJson as unknown as ReturnType<typeof vi.fn>;
    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;

    const cwd = '/work/ws/projects/api';
    const workspaceRoot = '/work/ws';
    const markerPath = join(workspaceRoot, '.rapidkit-workspace');
    const customVenvRapidkit =
      process.platform === 'win32'
        ? join(workspaceRoot, '.rapidkit', 'python', 'Scripts', 'rapidkit.exe')
        : join(workspaceRoot, '.rapidkit', 'python', 'bin', 'rapidkit');

    pathExists.mockImplementation(
      async (p: string) => p === markerPath || p === customVenvRapidkit
    );
    readJson.mockResolvedValue({
      signature: 'RAPIDKIT_WORKSPACE',
      metadata: {
        python: {
          venvPath: '.rapidkit/python',
        },
      },
    });

    execaMock
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({ version: '0.5.4' }),
        stderr: '',
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      });

    const res = await runCoreRapidkitCapture(['doctor', 'workspace'], { cwd });

    expect(res.exitCode).toBe(0);
    expect(execaMock.mock.calls[0][0]).toBe(customVenvRapidkit);
    expect(execaMock.mock.calls[1][0]).toBe(customVenvRapidkit);
  });

  it.each([
    { platform: 'win32' as NodeJS.Platform, binDir: 'Scripts', executable: 'rapidkit.exe' },
    { platform: 'linux' as NodeJS.Platform, binDir: 'bin', executable: 'rapidkit' },
    { platform: 'darwin' as NodeJS.Platform, binDir: 'bin', executable: 'rapidkit' },
  ])(
    'resolves marker metadata python.venvPath with $platform venv layout',
    async ({ platform, binDir, executable }) => {
      const pathExists = fsExtra.pathExists as unknown as ReturnType<typeof vi.fn>;
      const readJson = fsExtra.readJson as unknown as ReturnType<typeof vi.fn>;
      const execaMock = execa as unknown as ReturnType<typeof vi.fn>;

      const cwd = '/work/ws/projects/api';
      const workspaceRoot = '/work/ws';
      const markerPath = join(workspaceRoot, '.rapidkit-workspace');
      const customVenvRapidkit = join(workspaceRoot, '.rapidkit', 'python', binDir, executable);

      pathExists.mockImplementation(
        async (p: string) => p === markerPath || p === customVenvRapidkit
      );
      readJson.mockResolvedValue({
        signature: 'RAPIDKIT_WORKSPACE',
        metadata: {
          python: {
            venvPath: '.rapidkit/python',
            pythonVersion: '3.14',
          },
        },
      });

      execaMock.mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({ version: '0.5.4' }),
        stderr: '',
      });

      const runner = await __test__.findWorkspaceRunner(cwd, platform);

      expect(runner).toEqual({
        cmd: customVenvRapidkit,
        baseArgs: [],
        workspaceDir: workspaceRoot,
      });
    }
  );
});
