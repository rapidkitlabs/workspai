import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execa } from 'execa';
import fsExtra from 'fs-extra';
import os from 'os';
import path from 'path';

// Mock modules
vi.mock('execa');
const promptMock = vi.hoisted(() => vi.fn());
vi.mock('inquirer', () => ({
  default: {
    prompt: promptMock,
  },
}));
const mockedExeca = vi.mocked(execa as any);

describe('Doctor Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should pass basic import test', async () => {
    // Basic test to get coverage started
    const { runDoctor } = await import('../doctor.js');
    expect(runDoctor).toBeDefined();
    expect(typeof runDoctor).toBe('function');
  });

  it('should handle doctor command with mocked successful checks', async () => {
    // Mock successful command executions
    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return {
            stdout: 'Python 3.11.0',
            stderr: '',
            exitCode: 0,
          } as any;
        }
        if (args?.[0] === '-c') {
          return {
            stdout: '3.11.0',
            stderr: '',
            exitCode: 0,
          } as any;
        }
      }
      if (cmd === 'pip' || cmd === 'pip3') {
        return {
          stdout: 'pip 24.0',
          stderr: '',
          exitCode: 0,
        } as any;
      }
      if (cmd === 'pipx') {
        if (args?.[0] === '--version') {
          return {
            stdout: '1.4.0',
            stderr: '',
            exitCode: 0,
          } as any;
        }
        if (args?.[0] === 'list') {
          return {
            stdout: 'rapidkit-core 0.2.3',
            stderr: '',
            exitCode: 0,
          } as any;
        }
      }
      if (cmd === 'poetry') {
        return {
          stdout: 'Poetry version 1.7.0',
          stderr: '',
          exitCode: 0,
        } as any;
      }
      if (cmd === 'rapidkit') {
        return {
          stdout: '0.2.3',
          stderr: '',
          exitCode: 0,
        } as any;
      }
      return {
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as any;
    });

    const { runDoctor } = await import('../doctor.js');

    // Run doctor with json output to avoid console output
    await expect(runDoctor({ json: true })).resolves.not.toThrow();
  });

  it('should handle doctor command with some failed checks', async () => {
    // Mock some failed checks
    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return {
            stdout: 'Python 3.11.0',
            stderr: '',
            exitCode: 0,
          } as any;
        }
        if (args?.[0] === '-c') {
          return {
            stdout: '3.11.0',
            stderr: '',
            exitCode: 0,
          } as any;
        }
      }
      if (cmd === 'pip' || cmd === 'pip3') {
        throw new Error('pip not found');
      }
      if (cmd === 'pipx') {
        throw new Error('pipx not found');
      }
      if (cmd === 'poetry') {
        throw new Error('poetry not found');
      }
      if (cmd === 'rapidkit') {
        throw new Error('rapidkit not found');
      }
      throw new Error('Command not found');
    });

    const { runDoctor } = await import('../doctor.js');

    // Should not throw even with failed checks
    await expect(runDoctor({ json: true })).resolves.not.toThrow();
  });

  it('should handle doctor command with all failed checks', async () => {
    // Mock all checks failing
    mockedExeca.mockImplementation(async () => {
      throw new Error('Command not found');
    });

    const { runDoctor } = await import('../doctor.js');

    // Should not throw even with all failed checks
    await expect(runDoctor({ json: true })).resolves.not.toThrow();
  });

  it('should handle doctor with verbose output', async () => {
    mockedExeca.mockImplementation(async (cmd: string) => {
      if (cmd === 'python3' || cmd === 'python') {
        return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const { runDoctor } = await import('../doctor.js');
    await expect(runDoctor({ json: false })).resolves.not.toThrow();
  });

  it('should handle doctor with fix option', async () => {
    mockedExeca.mockImplementation(async (cmd: string) => {
      if (cmd === 'python3' || cmd === 'python') {
        return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const { runDoctor } = await import('../doctor.js');
    await expect(runDoctor({ json: false, fix: true })).resolves.not.toThrow();
  });

  it('should handle different python versions', async () => {
    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '-c') {
          return { stdout: '3.9.0', stderr: '', exitCode: 0 } as any;
        }
        return { stdout: 'Python 3.9.0', stderr: '', exitCode: 0 } as any;
      }
      throw new Error('Command not found');
    });

    const { runDoctor } = await import('../doctor.js');
    await expect(runDoctor({ json: true })).resolves.not.toThrow();
  });

  it('should handle old python version warnings', async () => {
    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '-c') {
          return { stdout: '3.8.0', stderr: '', exitCode: 0 } as any;
        }
        return { stdout: 'Python 3.8.0', stderr: '', exitCode: 0 } as any;
      }
      throw new Error('Command not found');
    });

    const { runDoctor } = await import('../doctor.js');
    await expect(runDoctor({ json: true })).resolves.not.toThrow();
  });

  it('should check pip installation', async () => {
    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pip' || cmd === 'pip3') {
        if (args?.[0] === '--version') {
          return { stdout: 'pip 24.0 from /usr/lib/python3.11', stderr: '', exitCode: 0 } as any;
        }
      }
      throw new Error('Command not found');
    });

    const { runDoctor } = await import('../doctor.js');
    await expect(runDoctor({ json: true })).resolves.not.toThrow();
  });

  it('should handle workspace checks', async () => {
    mockedExeca.mockImplementation(async (cmd: string) => {
      if (cmd === 'python3' || cmd === 'python') {
        return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pip' || cmd === 'pip3') {
        return { stdout: 'pip 24.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 1.7.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx') {
        return { stdout: '1.4.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'rapidkit') {
        return { stdout: '0.2.3', stderr: '', exitCode: 0 } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const { runDoctor } = await import('../doctor.js');
    await expect(runDoctor({ json: false })).resolves.not.toThrow();
  });

  it('should handle error states gracefully', async () => {
    mockedExeca.mockRejectedValue(new Error('ENOENT: command not found') as never);

    const { runDoctor } = await import('../doctor.js');
    await expect(runDoctor({ json: true })).resolves.not.toThrow();
  });

  it('should detect rapidkit core via pipx', async () => {
    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3') {
        return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx' && args?.[0] === 'list') {
        return {
          stdout: '  package rapidkit-core 0.2.3, installed using Python 3.11.0\n    - rapidkit',
          stderr: '',
          exitCode: 0,
        } as any;
      }
      if (cmd === 'rapidkit' && args?.[0] === '--version') {
        return { stdout: '0.2.3', stderr: '', exitCode: 0 } as any;
      }
      throw new Error('Command not found');
    });

    const { runDoctor } = await import('../doctor.js');
    await expect(runDoctor({ json: true })).resolves.not.toThrow();
  });

  it('should report workspace .venv as optional advisory when only global RapidKit Core is installed', async () => {
    const tempRoot = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rapidkit-doctor-global-only-'));
    const workspacePath = path.join(tempRoot, 'workspace');
    const tempHome = path.join(tempRoot, 'home');
    const globalRapidkitPath = path.join(tempHome, '.local', 'bin', 'rapidkit');

    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit', 'reports'));
    await fsExtra.writeJSON(path.join(workspacePath, '.rapidkit-workspace'), {
      name: 'workspace',
      version: '1.0',
    });
    await fsExtra.ensureDir(path.dirname(globalRapidkitPath));
    await fsExtra.writeFile(globalRapidkitPath, '#!/usr/bin/env bash\n');

    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
        }
        if (args?.[0] === '-c') {
          return { stdout: '3.11.0', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 2.3.2', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx' && args?.[0] === '--version') {
        return { stdout: '1.8.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'go' && args?.[0] === 'version') {
        return { stdout: 'go version go1.22.0 linux/amd64', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === globalRapidkitPath && args?.[0] === '--version') {
        return { stdout: 'RapidKit Version: 0.4.0', stderr: '', exitCode: 0 } as any;
      }
      throw new Error('Command not found');
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalCwd = process.cwd();
    const originalHome = process.env.HOME;

    try {
      process.env.HOME = tempHome;
      process.chdir(workspacePath);
      const { runDoctor } = await import('../doctor.js');
      await runDoctor({ workspace: true, json: true });

      const jsonLine = logSpy.mock.calls
        .map((call) => call[0])
        .find((msg) => typeof msg === 'string' && msg.trim().startsWith('{')) as string | undefined;

      expect(jsonLine).toBeDefined();
      const payload = JSON.parse(jsonLine as string);
      expect(payload.system.rapidkitCore.status).toBe('ok');
      expect(payload.system.rapidkitCore.paths).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: globalRapidkitPath,
            version: '0.4.0',
          }),
        ])
      );
      expect(
        (payload.system.rapidkitCore.paths as Array<{ location: string }>).some((p) =>
          p.location.startsWith('Global (')
        )
      ).toBe(true);
      expect(payload.system.rapidkitCore.paths).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ location: 'Workspace (.venv)' })])
      );
      expect(payload.system.rapidkitCore.details).toContain('Workspace (.venv): not installed');
      expect(payload.system.rapidkitCore.details).toContain('optional');
    } finally {
      process.chdir(originalCwd);
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
      logSpy.mockRestore();
      await fsExtra.remove(tempRoot);
    }
  });

  it('should handle normal output format', async () => {
    mockedExeca.mockImplementation(async (cmd: string) => {
      if (cmd === 'python3') {
        return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pip3') {
        return { stdout: 'pip 24.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 1.7.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx') {
        return { stdout: '1.4.0', stderr: '', exitCode: 0 } as any;
      }
      throw new Error('not found');
    });

    const { runDoctor } = await import('../doctor.js');
    await expect(runDoctor({ json: false })).resolves.not.toThrow();
  });

  it('should not count workspace root .rapidkit as a project', async () => {
    const tempRoot = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rapidkit-doctor-'));
    const workspacePath = path.join(tempRoot, 'workspace');
    const apiPath = path.join(workspacePath, 'saas-api');
    const adminPath = path.join(workspacePath, 'saas-admin');

    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fsExtra.writeFile(path.join(workspacePath, '.rapidkit', 'users_core.db'), '');
    await fsExtra.writeJSON(path.join(workspacePath, '.rapidkit-workspace'), {
      name: 'workspace',
      version: '1.0',
    });

    await fsExtra.ensureDir(path.join(apiPath, '.rapidkit'));
    await fsExtra.ensureDir(path.join(adminPath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(apiPath, '.rapidkit', 'project.json'), {
      name: 'saas-api',
      framework: 'fastapi',
    });
    await fsExtra.writeJSON(path.join(adminPath, '.rapidkit', 'project.json'), {
      name: 'saas-admin',
      framework: 'fastapi',
    });
    await fsExtra.writeFile(
      path.join(apiPath, 'pyproject.toml'),
      '[tool.poetry]\nname = "saas-api"\n'
    );
    await fsExtra.writeFile(
      path.join(adminPath, 'pyproject.toml'),
      '[tool.poetry]\nname = "saas-admin"\n'
    );
    await fsExtra.ensureDir(path.join(apiPath, '.venv'));
    await fsExtra.ensureDir(path.join(adminPath, '.venv'));

    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
        }
        if (args?.[0] === '-m' && args?.[1] === 'rapidkit') {
          return { stdout: 'RapidKit Version: 0.3.8', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 2.3.2', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx') {
        if (args?.[0] === '--version') {
          return { stdout: '1.8.0', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'rapidkit') {
        return { stdout: 'RapidKit Version: 0.3.8', stderr: '', exitCode: 0 } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    promptMock.mockImplementation(async () => ({ confirm: true }));
    const originalCwd = process.cwd();

    try {
      process.chdir(workspacePath);
      const { runDoctor } = await import('../doctor.js');
      await runDoctor({ workspace: true, json: true, fix: true });

      const jsonLine = logSpy.mock.calls
        .map((call) => call[0])
        .find((msg) => typeof msg === 'string' && msg.trim().startsWith('{')) as string | undefined;

      expect(jsonLine).toBeDefined();
      const payload = JSON.parse(jsonLine as string);
      expect(payload.summary.totalProjects).toBe(2);
      expect(payload.projects.map((p: { name: string }) => p.name).sort()).toEqual([
        'saas-admin',
        'saas-api',
      ]);
    } finally {
      process.chdir(originalCwd);
      promptMock.mockReset();
      logSpy.mockRestore();
      await fsExtra.remove(tempRoot);
    }
  });

  it('should detect workspace root with .rapidkit-workspace marker only', async () => {
    const tempRoot = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rapidkit-doctor-marker-only-'));
    const workspacePath = path.join(tempRoot, 'workspace');
    const apiPath = path.join(workspacePath, 'saas-api');

    await fsExtra.ensureDir(workspacePath);
    await fsExtra.writeJSON(path.join(workspacePath, '.rapidkit-workspace'), {
      name: 'workspace',
      version: '1.0',
    });

    await fsExtra.ensureDir(path.join(apiPath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(apiPath, '.rapidkit', 'project.json'), {
      name: 'saas-api',
      framework: 'fastapi',
    });
    await fsExtra.writeFile(
      path.join(apiPath, 'pyproject.toml'),
      '[tool.poetry]\nname = "saas-api"\n'
    );
    await fsExtra.ensureDir(path.join(apiPath, '.venv'));

    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
        }
        if (args?.[0] === '-m' && args?.[1] === 'rapidkit') {
          return { stdout: 'RapidKit Version: 0.4.0', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 2.3.2', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx') {
        if (args?.[0] === '--version') {
          return { stdout: '1.11.1', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'rapidkit') {
        return { stdout: 'RapidKit Version: 0.4.0', stderr: '', exitCode: 0 } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalCwd = process.cwd();

    try {
      process.chdir(workspacePath);
      const { runDoctor } = await import('../doctor.js');
      await runDoctor({ workspace: true, json: true });

      const jsonLine = logSpy.mock.calls
        .map((call) => call[0])
        .find((msg) => typeof msg === 'string' && msg.trim().startsWith('{')) as string | undefined;

      expect(jsonLine).toBeDefined();
      const payload = JSON.parse(jsonLine as string);
      expect(payload.workspace.path).toBe(fsExtra.realpathSync(workspacePath));
      expect(payload.summary.totalProjects).toBe(1);
      expect(payload.projects[0].name).toBe('saas-api');
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
      await fsExtra.remove(tempRoot);
    }
  });

  it('should ignore dist artifact directories during workspace scan', async () => {
    const tempRoot = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rapidkit-doctor-dist-'));
    const workspacePath = path.join(tempRoot, 'workspace');
    const apiPath = path.join(workspacePath, 'saas-api');
    const distApiPath = path.join(workspacePath, 'dist-customer-release', 'saas-api');

    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(workspacePath, '.rapidkit-workspace'), {
      name: 'workspace',
      version: '1.0',
    });

    await fsExtra.ensureDir(path.join(apiPath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(apiPath, '.rapidkit', 'project.json'), {
      name: 'saas-api',
      framework: 'fastapi',
    });
    await fsExtra.writeFile(
      path.join(apiPath, 'pyproject.toml'),
      '[tool.poetry]\nname = "saas-api"\n'
    );
    await fsExtra.ensureDir(path.join(apiPath, '.venv'));

    await fsExtra.ensureDir(path.join(distApiPath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(distApiPath, '.rapidkit', 'project.json'), {
      name: 'saas-api-dist',
      framework: 'fastapi',
    });
    await fsExtra.writeFile(
      path.join(distApiPath, 'pyproject.toml'),
      '[tool.poetry]\nname = "saas-api-dist"\n'
    );

    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
        }
        if (args?.[0] === '-m' && args?.[1] === 'rapidkit') {
          return { stdout: 'RapidKit Version: 0.3.8', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 2.3.2', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx') {
        if (args?.[0] === '--version') {
          return { stdout: '1.8.0', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'rapidkit') {
        return { stdout: 'RapidKit Version: 0.3.8', stderr: '', exitCode: 0 } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalCwd = process.cwd();

    try {
      process.chdir(workspacePath);
      const { runDoctor } = await import('../doctor.js');
      await runDoctor({ workspace: true, json: true });

      const jsonLine = logSpy.mock.calls
        .map((call) => call[0])
        .find((msg) => typeof msg === 'string' && msg.trim().startsWith('{')) as string | undefined;

      expect(jsonLine).toBeDefined();
      const payload = JSON.parse(jsonLine as string);
      expect(payload.summary.totalProjects).toBe(1);
      expect(payload.projects.map((p: { name: string }) => p.name)).toEqual(['saas-api']);
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
      await fsExtra.remove(tempRoot);
    }
  });

  it('should cache workspace project scans and write evidence on repeat runs', async () => {
    const tempRoot = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rapidkit-doctor-cache-'));
    const workspacePath = path.join(tempRoot, 'workspace');
    const apiPath = path.join(workspacePath, 'saas-api');

    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(workspacePath, '.rapidkit-workspace'), {
      name: 'workspace',
      version: '1.0',
    });

    await fsExtra.ensureDir(path.join(apiPath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(apiPath, '.rapidkit', 'project.json'), {
      name: 'saas-api',
      framework: 'fastapi',
    });
    await fsExtra.writeFile(
      path.join(apiPath, 'pyproject.toml'),
      '[tool.poetry]\nname = "saas-api"\n'
    );
    await fsExtra.ensureDir(path.join(apiPath, '.venv'));

    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
        }
        if (args?.[0] === '-c' && String(args?.[1] || '').includes('rapidkit_core')) {
          return { stdout: '0.3.8', stderr: '', exitCode: 0 } as any;
        }
        if (args?.[0] === '-c' && String(args?.[1] || '').includes('fastapi')) {
          return { stdout: '', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 2.3.2', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx') {
        if (args?.[0] === '--version') {
          return { stdout: '1.8.0', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'rapidkit') {
        return { stdout: 'RapidKit Version: 0.3.8', stderr: '', exitCode: 0 } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalCwd = process.cwd();

    try {
      process.chdir(workspacePath);
      const { runDoctor } = await import('../doctor.js');

      await runDoctor({ workspace: true, json: true });
      logSpy.mockClear();

      await runDoctor({ workspace: true, json: true });

      const jsonLine = logSpy.mock.calls
        .map((call) => call[0])
        .find((msg) => typeof msg === 'string' && msg.trim().startsWith('{')) as string | undefined;

      expect(jsonLine).toBeDefined();
      const payload = JSON.parse(jsonLine as string);
      expect(payload.cache.projectScan).toBe(true);
      expect(payload.cache.evidencePath).toContain('doctor-last-run.json');
      expect(
        await fsExtra.pathExists(
          path.join(workspacePath, '.rapidkit', 'reports', 'doctor-workspace-cache.json')
        )
      ).toBe(true);
      expect(
        await fsExtra.pathExists(
          path.join(workspacePath, '.rapidkit', 'reports', 'doctor-last-run.json')
        )
      ).toBe(true);

      const workspaceCache = await fsExtra.readJSON(
        path.join(workspacePath, '.rapidkit', 'reports', 'doctor-workspace-cache.json')
      );
      const workspaceEvidence = await fsExtra.readJSON(
        path.join(workspacePath, '.rapidkit', 'reports', 'doctor-last-run.json')
      );
      expect(workspaceCache.schemaVersion).toBe('doctor-workspace-cache-v1');
      expect(workspaceEvidence.schemaVersion).toBe('doctor-workspace-evidence-v1');
      expect(workspaceEvidence.evidenceType).toBe('workspace');
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
      await fsExtra.remove(tempRoot);
    }
  });

  it('should count advisory warnings from env/security in workspace health score', async () => {
    const tempRoot = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rapidkit-doctor-advisory-'));
    const workspacePath = path.join(tempRoot, 'workspace');
    const nodeProjectPath = path.join(workspacePath, 'rapidkit-front-pro');

    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(workspacePath, '.rapidkit-workspace'), {
      name: 'workspace',
      version: '1.0',
    });

    await fsExtra.ensureDir(path.join(nodeProjectPath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(nodeProjectPath, '.rapidkit', 'project.json'), {
      name: 'rapidkit-front-pro',
      kit_name: 'generic.imported',
      runtime: 'unknown',
    });
    await fsExtra.writeJSON(path.join(nodeProjectPath, 'package.json'), {
      name: 'rapidkit-front-pro',
      version: '1.0.0',
      dependencies: {
        '@nestjs/core': '^10.0.0',
      },
    });
    await fsExtra.ensureDir(path.join(nodeProjectPath, 'node_modules', '@nestjs'));

    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
        }
        if (args?.[0] === '-m' && args?.[1] === 'rapidkit') {
          return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 2.3.2', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx' && args?.[0] === '--version') {
        return { stdout: '1.8.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'go' && args?.[0] === 'version') {
        return { stdout: 'go version go1.22.0 linux/amd64', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'rapidkit') {
        return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'npm' && Array.isArray(args) && args[0] === 'audit') {
        return {
          stdout: JSON.stringify({
            metadata: {
              vulnerabilities: {
                info: 0,
                low: 1,
                moderate: 2,
                high: 1,
                critical: 0,
                total: 4,
              },
            },
          }),
          stderr: '',
          exitCode: 0,
        } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalCwd = process.cwd();

    try {
      process.chdir(workspacePath);
      const { runDoctor } = await import('../doctor.js');
      await runDoctor({ workspace: true, json: true });

      const jsonLine = logSpy.mock.calls
        .map((call) => call[0])
        .find((msg) => typeof msg === 'string' && msg.trim().startsWith('{')) as string | undefined;

      expect(jsonLine).toBeDefined();
      const payload = JSON.parse(jsonLine as string);
      expect(payload.summary.totalIssues).toBe(0);
      expect(payload.summary.projectAdvisoryWarningProjects).toBe(1);
      expect(payload.summary.projectAdvisoryWarnings).toBeGreaterThanOrEqual(1);
      expect(payload.healthScore.warnings).toBeGreaterThan(0);
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
      await fsExtra.remove(tempRoot);
    }
  });

  it('should detect Next.js projects without mislabeling as NestJS', async () => {
    const tempRoot = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rapidkit-doctor-nextjs-'));
    const workspacePath = path.join(tempRoot, 'workspace');
    const projectPath = path.join(workspacePath, 'web-app');

    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(workspacePath, '.rapidkit-workspace'), {
      name: 'workspace',
      version: '1.0',
    });

    await fsExtra.ensureDir(path.join(projectPath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(projectPath, '.rapidkit', 'project.json'), {
      name: 'web-app',
      kit_name: 'generic.imported',
      runtime: 'unknown',
    });
    await fsExtra.writeJSON(path.join(projectPath, 'package.json'), {
      name: 'web-app',
      version: '1.0.0',
      dependencies: {
        next: '14.2.0',
      },
    });
    await fsExtra.ensureDir(path.join(projectPath, 'node_modules', 'next'));

    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
        }
        if (args?.[0] === '-m' && args?.[1] === 'rapidkit') {
          return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 2.3.2', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx' && args?.[0] === '--version') {
        return { stdout: '1.8.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'go' && args?.[0] === 'version') {
        return { stdout: 'go version go1.22.0 linux/amd64', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'rapidkit') {
        return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'npm' && Array.isArray(args) && args[0] === 'audit') {
        return {
          stdout: JSON.stringify({ metadata: { vulnerabilities: { total: 0 } } }),
          stderr: '',
          exitCode: 0,
        } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalCwd = process.cwd();

    try {
      process.chdir(workspacePath);
      const { runDoctor } = await import('../doctor.js');
      await runDoctor({ workspace: true, json: true });

      const jsonLine = logSpy.mock.calls
        .map((call) => call[0])
        .find((msg) => typeof msg === 'string' && msg.trim().startsWith('{')) as string | undefined;

      expect(jsonLine).toBeDefined();
      const payload = JSON.parse(jsonLine as string);
      expect(payload.contract?.version).toBe('doctor-evidence-v1');
      expect(payload.contract?.scoringPolicyVersion).toBe('doctor-score-policy-v1');
      expect(payload.projects[0].framework).toBe('Next.js');
      expect(payload.projects[0].framework).not.toBe('NestJS');
      expect(payload.projects[0].runtimeFamily).toBe('node');
      expect(payload.projects[0].projectKind).toBe('frontend');
      expect(payload.projects[0].supportTier).toBe('observed');
      expect(payload.projects[0].frameworkConfidence).toBe('high');
      expect(payload.scoreBreakdown[0].policyRuleId).toBeDefined();
      expect(payload.summary.scopeProvenance).toBeDefined();
      expect(payload.summary.scopeProvenance.aggregatedCount).toBeGreaterThan(0);
      expect(payload.driftDelta).toBeDefined();
      expect(payload.driftDelta.baselineAvailable).toBe(false);
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
      await fsExtra.remove(tempRoot);
    }
  });

  it('should skip go mod tidy fix when go toolchain is missing', async () => {
    const tempRoot = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rapidkit-doctor-go-skip-'));
    const workspacePath = path.join(tempRoot, 'workspace');
    const goApiPath = path.join(workspacePath, 'go-api');

    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(workspacePath, '.rapidkit-workspace'), {
      name: 'workspace',
      version: '1.0',
    });

    await fsExtra.ensureDir(path.join(goApiPath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(goApiPath, '.rapidkit', 'project.json'), {
      name: 'go-api',
      runtime: 'go',
      kit_name: 'gofiber.standard',
    });
    await fsExtra.writeFile(path.join(goApiPath, 'go.mod'), 'module example.com/go-api\n');

    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
        }
        if (args?.[0] === '-m' && args?.[1] === 'rapidkit') {
          return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 2.3.2', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx' && args?.[0] === '--version') {
        return { stdout: '1.8.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'rapidkit') {
        return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'go' && args?.[0] === 'version') {
        throw new Error('go not found');
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalCwd = process.cwd();

    try {
      process.chdir(workspacePath);
      const { runDoctor } = await import('../doctor.js');
      await runDoctor({ workspace: true, fix: true });

      expect(promptMock).not.toHaveBeenCalled();

      const executedCommands = mockedExeca.mock.calls.map(([cmd, args]) => ({ cmd, args }));
      expect(
        executedCommands.some(
          ({ cmd, args }) =>
            cmd === 'go' && Array.isArray(args) && args[0] === 'mod' && args[1] === 'tidy'
        )
      ).toBe(false);
      expect(
        executedCommands.some(({ cmd }) => typeof cmd === 'string' && cmd.includes('go mod tidy'))
      ).toBe(false);
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
      await fsExtra.remove(tempRoot);
    }
  });

  it('should support doctor project scope with JSON output', async () => {
    const tempRoot = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rapidkit-doctor-project-'));
    const workspacePath = path.join(tempRoot, 'workspace');
    const projectPath = path.join(workspacePath, 'my-nest-services');

    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(workspacePath, '.rapidkit-workspace'), {
      name: 'workspace',
      version: '1.0',
    });

    await fsExtra.ensureDir(path.join(projectPath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(projectPath, '.rapidkit', 'project.json'), {
      name: 'my-nest-services',
      kit_name: 'nestjs.standard',
      runtime: 'node',
    });
    await fsExtra.writeJSON(path.join(projectPath, 'package.json'), {
      name: 'my-nest-services',
      version: '1.0.0',
      dependencies: {
        '@nestjs/core': '^10.0.0',
      },
    });
    await fsExtra.ensureDir(path.join(projectPath, 'node_modules', '@nestjs', 'core'));

    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 2.3.2', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx' && args?.[0] === '--version') {
        return { stdout: '1.8.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'go' && args?.[0] === 'version') {
        return { stdout: 'go version go1.22.0 linux/amd64', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'rapidkit') {
        return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalCwd = process.cwd();

    try {
      process.chdir(projectPath);
      const { runDoctor } = await import('../doctor.js');
      await runDoctor({ project: true, json: true });

      const jsonLine = logSpy.mock.calls
        .map((call) => call[0])
        .find((msg) => typeof msg === 'string' && msg.trim().startsWith('{')) as string | undefined;

      expect(jsonLine).toBeDefined();
      const payload = JSON.parse(jsonLine as string);
      expect(payload.scope).toBe('project');
      expect(payload.contract?.version).toBe('doctor-evidence-v1');
      expect(payload.contract?.scoringPolicyVersion).toBe('doctor-score-policy-v1');
      expect(payload.project.name).toBe('my-nest-services');
      expect(payload.project.framework).toBe('NestJS');
      expect(payload.project.frameworkKey).toBe('nestjs');
      expect(payload.project.importStack).toBe('nestjs');
      expect(payload.summary.totalProjects).toBe(1);
      expect(payload.evidencePath).toContain('doctor-project-last-run.json');
      expect(Array.isArray(payload.project.probes)).toBe(true);
      expect(Array.isArray(payload.scoreBreakdown)).toBe(true);
      expect(payload.scoreBreakdown.length).toBeGreaterThan(0);
      expect(payload.scoreBreakdown[0].policyRuleId).toBeDefined();
      expect(payload.summary.scopeProvenance).toBeDefined();
      expect(payload.summary.scopeProvenance.scopedCount).toBeGreaterThan(0);
      expect(payload.driftDelta).toBeDefined();
      expect(payload.driftDelta.baselineAvailable).toBe(false);

      const projectEvidence = await fsExtra.readJSON(
        path.join(workspacePath, '.rapidkit', 'reports', 'doctor-project-last-run.json')
      );
      expect(projectEvidence.schemaVersion).toBe('doctor-project-evidence-v1');
      expect(projectEvidence.evidenceType).toBe('project');
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
      await fsExtra.remove(tempRoot);
    }
  });

  it('should report command capabilities for nested ASP.NET Core project files', async () => {
    const tempRoot = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rapidkit-doctor-dotnet-'));
    const workspacePath = path.join(tempRoot, 'workspace');
    const projectPath = path.join(workspacePath, 'orders-api');

    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(workspacePath, '.rapidkit-workspace'), {
      name: 'workspace',
      version: '1.0',
    });

    await fsExtra.ensureDir(path.join(projectPath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(projectPath, '.rapidkit', 'project.json'), {
      name: 'orders-api',
      kit_name: 'dotnet.webapi.clean',
      runtime: 'dotnet',
      module_support: false,
    });
    await fsExtra.writeJSON(path.join(projectPath, '.rapidkit', 'context.json'), {
      engine: 'npm',
      runtime: 'dotnet',
    });
    await fsExtra.outputFile(
      path.join(projectPath, 'src', 'orders-api.csproj'),
      '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>'
    );
    await fsExtra.ensureDir(path.join(projectPath, 'src', 'obj'));
    await fsExtra.outputFile(path.join(projectPath, 'tests', 'orders-api.Tests.csproj'), '');

    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 2.3.2', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx' && args?.[0] === '--version') {
        return { stdout: '1.8.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'go' && args?.[0] === 'version') {
        return { stdout: 'go version go1.22.0 linux/amd64', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'rapidkit') {
        return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalCwd = process.cwd();

    try {
      process.chdir(projectPath);
      const { runDoctor } = await import('../doctor.js');
      await runDoctor({ project: true, json: true });

      const jsonLine = logSpy.mock.calls
        .map((call) => call[0])
        .find((msg) => typeof msg === 'string' && msg.trim().startsWith('{')) as string | undefined;

      expect(jsonLine).toBeDefined();
      const payload = JSON.parse(jsonLine as string);
      expect(payload.project.frameworkKey).toBe('dotnet');
      expect(payload.project.runtimeFamily).toBe('dotnet');
      expect(payload.project.commandCapabilities.runtime).toBe('dotnet');
      expect(payload.project.commandCapabilities.moduleSupport).toBe(false);
      expect(payload.project.commandCapabilities.commandMap.build).toMatchObject({
        status: 'supported',
        owner: 'runtime',
      });
      expect(payload.project.commandCapabilities.commandMap.modules).toMatchObject({
        status: 'unsupported',
        owner: 'none',
      });
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
      await fsExtra.remove(tempRoot);
    }
  });

  it('should detect Rust project in doctor project mode', async () => {
    const tempRoot = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rapidkit-doctor-rust-'));
    const projectPath = path.join(tempRoot, 'ledger-service');

    await fsExtra.ensureDir(projectPath);
    await fsExtra.writeFile(
      path.join(projectPath, 'Cargo.toml'),
      '[package]\nname = "ledger-service"\nversion = "0.1.0"\n'
    );
    await fsExtra.writeFile(path.join(projectPath, 'Cargo.lock'), '# lockfile');

    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 2.3.2', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx' && args?.[0] === '--version') {
        return { stdout: '1.8.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'go' && args?.[0] === 'version') {
        return { stdout: 'go version go1.22.0 linux/amd64', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'rapidkit') {
        return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalCwd = process.cwd();

    try {
      process.chdir(projectPath);
      const { runDoctor } = await import('../doctor.js');
      await runDoctor({ project: true, json: true });

      const jsonLine = logSpy.mock.calls
        .map((call) => call[0])
        .find((msg) => typeof msg === 'string' && msg.trim().startsWith('{')) as string | undefined;

      expect(jsonLine).toBeDefined();
      const payload = JSON.parse(jsonLine as string);
      expect(payload.project.framework).toBe('Rust');
      expect(payload.project.frameworkKey).toBe('rust');
      expect(payload.project.importStack).toBe('unknown');
      expect(payload.project.runtimeFamily).toBe('rust');
      expect(payload.project.depsInstalled).toBe(true);
      expect(Array.isArray(payload.project.probes)).toBe(true);
      expect(payload.project.probes.some((p: { id: string }) => p.id === 'migration-surface')).toBe(
        true
      );
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
      await fsExtra.remove(tempRoot);
    }
  });

  it('should detect Deno project contract metadata in doctor project mode', async () => {
    const tempRoot = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rapidkit-doctor-deno-'));
    const projectPath = path.join(tempRoot, 'edge-deno-service');

    await fsExtra.ensureDir(projectPath);
    await fsExtra.writeJSON(path.join(projectPath, 'deno.json'), {
      tasks: {
        dev: 'deno run --watch src/main.ts',
      },
    });

    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 2.3.2', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx' && args?.[0] === '--version') {
        return { stdout: '1.8.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'go' && args?.[0] === 'version') {
        return { stdout: 'go version go1.22.0 linux/amd64', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'rapidkit') {
        return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalCwd = process.cwd();

    try {
      process.chdir(projectPath);
      const { runDoctor } = await import('../doctor.js');
      await runDoctor({ project: true, json: true });

      const jsonLine = logSpy.mock.calls
        .map((call) => call[0])
        .find((msg) => typeof msg === 'string' && msg.trim().startsWith('{')) as string | undefined;

      expect(jsonLine).toBeDefined();
      const payload = JSON.parse(jsonLine as string);
      expect(payload.project.framework).toBe('Deno');
      expect(payload.project.frameworkKey).toBe('deno');
      expect(payload.project.importStack).toBe('unknown');
      expect(payload.project.runtimeFamily).toBe('deno');
      expect(payload.project.projectKind).toBe('generic');
      expect(payload.project.supportTier).toBe('extended');
      expect(payload.project.frameworkConfidence).toBe('high');
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
      await fsExtra.remove(tempRoot);
    }
  });

  it('should resolve nearest parent backend project when doctor project runs in nested directory', async () => {
    const tempRoot = await fsExtra.mkdtemp(
      path.join(os.tmpdir(), 'rapidkit-doctor-nested-parent-')
    );
    const projectPath = path.join(tempRoot, 'my-node-service');
    const nestedPath = path.join(projectPath, 'src', 'modules');

    await fsExtra.ensureDir(nestedPath);
    await fsExtra.writeJSON(path.join(projectPath, 'package.json'), {
      name: 'my-node-service',
      version: '1.0.0',
      dependencies: {
        express: '^4.19.0',
      },
    });
    await fsExtra.ensureDir(path.join(projectPath, 'node_modules', 'express'));

    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 2.3.2', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx' && args?.[0] === '--version') {
        return { stdout: '1.8.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'go' && args?.[0] === 'version') {
        return { stdout: 'go version go1.22.0 linux/amd64', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'rapidkit') {
        return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalCwd = process.cwd();

    try {
      process.chdir(nestedPath);
      const { runDoctor } = await import('../doctor.js');
      await runDoctor({ project: true, json: true });

      const jsonLine = logSpy.mock.calls
        .map((call) => call[0])
        .find((msg) => typeof msg === 'string' && msg.trim().startsWith('{')) as string | undefined;

      expect(jsonLine).toBeDefined();
      const payload = JSON.parse(jsonLine as string);
      expect(payload.scope).toBe('project');
      expect(payload.project.path).toBe(projectPath);
      expect(payload.project.name).toBe('my-node-service');
      expect(payload.project.runtimeFamily).toBe('node');
      expect(payload.project.framework).not.toBe('Unknown');
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
      await fsExtra.remove(tempRoot);
    }
  });

  it('should not resolve workspace root backend markers as project scope target', async () => {
    const tempRoot = await fsExtra.mkdtemp(
      path.join(os.tmpdir(), 'rapidkit-doctor-project-scope-guard-')
    );
    const workspacePath = path.join(tempRoot, 'workspace');
    const nestedPath = path.join(workspacePath, 'tests', 'fixtures');

    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(workspacePath, '.rapidkit-workspace'), {
      name: 'workspace',
      version: '1.0',
    });
    await fsExtra.writeFile(
      path.join(workspacePath, 'pyproject.toml'),
      '[tool.poetry]\nname = "workspace-shell"\n'
    );
    await fsExtra.ensureDir(nestedPath);

    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 2.3.2', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx' && args?.[0] === '--version') {
        return { stdout: '1.8.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'go' && args?.[0] === 'version') {
        return { stdout: 'go version go1.22.0 linux/amd64', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'rapidkit') {
        return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__EXIT__${code ?? 0}`);
    }) as never);
    const originalCwd = process.cwd();

    try {
      process.chdir(nestedPath);
      const { runDoctor } = await import('../doctor.js');
      await expect(runDoctor({ project: true, json: true })).rejects.toThrow('__EXIT__1');
    } finally {
      process.chdir(originalCwd);
      exitSpy.mockRestore();
      await fsExtra.remove(tempRoot);
    }
  });

  it('should accept workspace mode when .rapidkit-workspace marker exists without .rapidkit dir', async () => {
    const tempRoot = await fsExtra.mkdtemp(
      path.join(os.tmpdir(), 'rapidkit-doctor-workspace-guard-')
    );

    await fsExtra.writeJSON(path.join(tempRoot, '.rapidkit-workspace'), {
      name: 'invalid-workspace',
      version: '1.0',
    });

    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 2.3.2', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx' && args?.[0] === '--version') {
        return { stdout: '1.8.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'go' && args?.[0] === 'version') {
        return { stdout: 'go version go1.22.0 linux/amd64', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'rapidkit') {
        return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalCwd = process.cwd();

    try {
      process.chdir(tempRoot);
      const { runDoctor } = await import('../doctor.js');
      await runDoctor({ workspace: true, json: true });

      const jsonLine = logSpy.mock.calls
        .map((call) => call[0])
        .find((msg) => typeof msg === 'string' && msg.trim().startsWith('{')) as string | undefined;

      expect(jsonLine).toBeDefined();
      const payload = JSON.parse(jsonLine as string);
      expect(payload.workspace.path).toBe(fsExtra.realpathSync(tempRoot));
      expect(payload.summary.totalProjects).toBe(0);
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
      await fsExtra.remove(tempRoot);
    }
  });

  it('should load custom adapter checks from doctor.adapters.json', async () => {
    const tempRoot = await fsExtra.mkdtemp(
      path.join(os.tmpdir(), 'rapidkit-doctor-adapter-contract-')
    );
    const projectPath = path.join(tempRoot, 'adapter-node-service');

    await fsExtra.ensureDir(path.join(projectPath, 'src'));
    await fsExtra.writeJSON(path.join(projectPath, 'package.json'), {
      name: 'adapter-node-service',
      version: '1.0.0',
      dependencies: {
        express: '^4.19.0',
      },
    });
    await fsExtra.ensureDir(path.join(projectPath, 'node_modules', 'express'));
    await fsExtra.writeJSON(path.join(projectPath, 'doctor.adapters.json'), {
      checks: [
        {
          id: 'boot-probe-contract',
          label: 'Boot probe contract',
          severity: 'error',
          runtimes: ['node'],
          anyOfPaths: ['src/main.ts'],
          recommendation: 'Add src/main.ts bootstrap entrypoint.',
        },
      ],
    });

    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 2.3.2', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx' && args?.[0] === '--version') {
        return { stdout: '1.8.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'go' && args?.[0] === 'version') {
        return { stdout: 'go version go1.22.0 linux/amd64', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'rapidkit') {
        return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalCwd = process.cwd();

    try {
      process.chdir(projectPath);
      const { runDoctor } = await import('../doctor.js');
      await runDoctor({ project: true, json: true });

      const jsonLine = logSpy.mock.calls
        .map((call) => call[0])
        .find((msg) => typeof msg === 'string' && msg.trim().startsWith('{')) as string | undefined;

      expect(jsonLine).toBeDefined();
      const payload = JSON.parse(jsonLine as string);
      const adapterProbe = payload.project.probes.find(
        (p: { id: string }) => p.id === 'boot-probe-contract'
      );
      expect(adapterProbe).toBeDefined();
      expect(adapterProbe.status).toBe('fail');
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
      await fsExtra.remove(tempRoot);
    }
  });

  it('should accept legacy workspace evidence without schemaVersion when computing drift', async () => {
    const tempRoot = await fsExtra.mkdtemp(
      path.join(os.tmpdir(), 'rapidkit-doctor-legacy-evidence-')
    );
    const workspacePath = path.join(tempRoot, 'workspace');
    const nodeProjectPath = path.join(workspacePath, 'legacy-api');

    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit', 'reports'));
    await fsExtra.writeJSON(path.join(workspacePath, '.rapidkit-workspace'), {
      name: 'workspace',
      version: '1.0',
    });

    await fsExtra.ensureDir(path.join(nodeProjectPath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(nodeProjectPath, '.rapidkit', 'project.json'), {
      name: 'legacy-api',
      kit_name: 'generic.imported',
      runtime: 'unknown',
    });
    await fsExtra.writeJSON(path.join(nodeProjectPath, 'package.json'), {
      name: 'legacy-api',
      version: '1.0.0',
      dependencies: {
        express: '^4.19.2',
      },
    });
    await fsExtra.ensureDir(path.join(nodeProjectPath, 'node_modules', 'express'));

    await fsExtra.writeJSON(
      path.join(workspacePath, '.rapidkit', 'reports', 'doctor-last-run.json'),
      {
        generatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        workspacePath,
        healthScore: {
          total: 5,
          passed: 4,
          warnings: 1,
          errors: 0,
        },
        projects: [
          {
            name: 'legacy-api',
            path: nodeProjectPath,
            issues: [],
          },
        ],
        summary: {
          totalIssues: 0,
        },
        system: {
          python: { status: 'ok', message: 'Python 3.11.0' },
          poetry: { status: 'ok', message: 'Poetry 2.3.2' },
          pipx: { status: 'ok', message: 'pipx 1.8.0' },
          go: { status: 'warn', message: 'Go not installed' },
          rapidkitCore: { status: 'ok', message: 'RapidKit Core 0.3.9' },
        },
      }
    );

    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
        }
        if (args?.[0] === '-m' && args?.[1] === 'rapidkit') {
          return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 2.3.2', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx' && args?.[0] === '--version') {
        return { stdout: '1.8.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'go' && args?.[0] === 'version') {
        return { stdout: 'go version go1.22.0 linux/amd64', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'rapidkit') {
        return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'npm' && Array.isArray(args) && args[0] === 'audit') {
        return {
          stdout: JSON.stringify({ metadata: { vulnerabilities: { total: 0 } } }),
          stderr: '',
          exitCode: 0,
        } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalCwd = process.cwd();

    try {
      process.chdir(workspacePath);
      const { runDoctor } = await import('../doctor.js');
      await runDoctor({ workspace: true, json: true });

      const jsonLine = logSpy.mock.calls
        .map((call) => call[0])
        .find((msg) => typeof msg === 'string' && msg.trim().startsWith('{')) as string | undefined;

      expect(jsonLine).toBeDefined();
      const payload = JSON.parse(jsonLine as string);
      expect(payload.driftDelta).toBeDefined();
      expect(payload.driftDelta.baselineAvailable).toBe(true);
      expect(payload.cache.evidencePath).toContain('doctor-last-run.json');
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
      await fsExtra.remove(tempRoot);
    }
  });

  it('should invalidate unknown workspace evidence schema safely and treat baseline as unavailable', async () => {
    const tempRoot = await fsExtra.mkdtemp(
      path.join(os.tmpdir(), 'rapidkit-doctor-unknown-schema-')
    );
    const workspacePath = path.join(tempRoot, 'workspace');
    const nodeProjectPath = path.join(workspacePath, 'unknown-schema-api');

    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit', 'reports'));
    await fsExtra.writeJSON(path.join(workspacePath, '.rapidkit-workspace'), {
      name: 'workspace',
      version: '1.0',
    });

    await fsExtra.ensureDir(path.join(nodeProjectPath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(nodeProjectPath, '.rapidkit', 'project.json'), {
      name: 'unknown-schema-api',
      kit_name: 'generic.imported',
      runtime: 'unknown',
    });
    await fsExtra.writeJSON(path.join(nodeProjectPath, 'package.json'), {
      name: 'unknown-schema-api',
      version: '1.0.0',
      dependencies: {
        express: '^4.19.2',
      },
    });
    await fsExtra.ensureDir(path.join(nodeProjectPath, 'node_modules', 'express'));

    await fsExtra.writeJSON(
      path.join(workspacePath, '.rapidkit', 'reports', 'doctor-last-run.json'),
      {
        schemaVersion: 'doctor-workspace-evidence-v999',
        evidenceType: 'workspace',
        generatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        workspacePath,
        healthScore: {
          total: 5,
          passed: 5,
          warnings: 0,
          errors: 0,
        },
        projects: [],
        summary: {
          totalIssues: 0,
        },
        system: {
          python: { status: 'ok', message: 'Python 3.11.0' },
          poetry: { status: 'ok', message: 'Poetry 2.3.2' },
          pipx: { status: 'ok', message: 'pipx 1.8.0' },
          go: { status: 'warn', message: 'Go not installed' },
          rapidkitCore: { status: 'ok', message: 'RapidKit Core 0.3.9' },
        },
      }
    );

    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
        }
        if (args?.[0] === '-m' && args?.[1] === 'rapidkit') {
          return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 2.3.2', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx' && args?.[0] === '--version') {
        return { stdout: '1.8.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'go' && args?.[0] === 'version') {
        return { stdout: 'go version go1.22.0 linux/amd64', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'rapidkit') {
        return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'npm' && Array.isArray(args) && args[0] === 'audit') {
        return {
          stdout: JSON.stringify({ metadata: { vulnerabilities: { total: 0 } } }),
          stderr: '',
          exitCode: 0,
        } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalCwd = process.cwd();

    try {
      process.chdir(workspacePath);
      const { runDoctor } = await import('../doctor.js');
      await runDoctor({ workspace: true, json: true });

      const jsonLine = logSpy.mock.calls
        .map((call) => call[0])
        .find((msg) => typeof msg === 'string' && msg.trim().startsWith('{')) as string | undefined;

      expect(jsonLine).toBeDefined();
      const payload = JSON.parse(jsonLine as string);
      expect(payload.driftDelta).toBeDefined();
      expect(payload.driftDelta.baselineAvailable).toBe(false);
      expect(payload.cache.evidencePath).toContain('doctor-last-run.json');
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
      await fsExtra.remove(tempRoot);
    }
  });

  it('should emit remediationPlan in workspace json output when plan mode is enabled', async () => {
    const tempRoot = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rapidkit-doctor-plan-'));
    const workspacePath = path.join(tempRoot, 'workspace');
    const nodeProjectPath = path.join(workspacePath, 'node-api');

    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(workspacePath, '.rapidkit-workspace'), {
      name: 'workspace',
      version: '1.0',
    });

    await fsExtra.ensureDir(path.join(nodeProjectPath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(nodeProjectPath, '.rapidkit', 'project.json'), {
      name: 'node-api',
      runtime: 'node',
      framework: 'nestjs',
    });
    await fsExtra.writeJSON(path.join(nodeProjectPath, 'package.json'), {
      name: 'node-api',
      version: '1.0.0',
      dependencies: {
        express: '^4.19.2',
      },
    });
    await fsExtra.writeFile(path.join(nodeProjectPath, '.env.example'), 'PORT=3000\n');

    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
        }
        if (args?.[0] === '-m' && args?.[1] === 'rapidkit') {
          return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 2.3.2', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx' && args?.[0] === '--version') {
        return { stdout: '1.8.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'go' && args?.[0] === 'version') {
        return { stdout: 'go version go1.22.0 linux/amd64', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'rapidkit') {
        return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'npm' && Array.isArray(args) && args[0] === 'audit') {
        return {
          stdout: JSON.stringify({ metadata: { vulnerabilities: { total: 0 } } }),
          stderr: '',
          exitCode: 0,
        } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalCwd = process.cwd();

    try {
      process.chdir(workspacePath);
      const { runDoctor } = await import('../doctor.js');
      await runDoctor({ workspace: true, json: true, plan: true });

      const jsonLine = logSpy.mock.calls
        .map((call) => call[0])
        .find((msg) => typeof msg === 'string' && msg.trim().startsWith('{')) as string | undefined;

      expect(jsonLine).toBeDefined();
      const payload = JSON.parse(jsonLine as string);
      expect(payload.remediationPlan).toBeDefined();
      expect(payload.remediationPlan.totalSteps).toBeGreaterThan(0);
      expect(Array.isArray(payload.remediationPlan.steps)).toBe(true);
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
      await fsExtra.remove(tempRoot);
    }
  });

  it('should apply remediation without prompt when apply mode is enabled', async () => {
    const tempRoot = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rapidkit-doctor-apply-'));
    const workspacePath = path.join(tempRoot, 'workspace');
    const nodeProjectPath = path.join(workspacePath, 'node-api');

    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(workspacePath, '.rapidkit-workspace'), {
      name: 'workspace',
      version: '1.0',
    });

    await fsExtra.ensureDir(path.join(nodeProjectPath, '.rapidkit'));
    await fsExtra.writeJSON(path.join(nodeProjectPath, '.rapidkit', 'project.json'), {
      name: 'node-api',
      runtime: 'node',
      framework: 'nestjs',
    });
    await fsExtra.writeJSON(path.join(nodeProjectPath, 'package.json'), {
      name: 'node-api',
      version: '1.0.0',
      dependencies: {
        express: '^4.19.2',
      },
    });
    await fsExtra.writeFile(path.join(nodeProjectPath, '.env.example'), 'PORT=3000\n');

    mockedExeca.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'python3' || cmd === 'python') {
        if (args?.[0] === '--version') {
          return { stdout: 'Python 3.11.0', stderr: '', exitCode: 0 } as any;
        }
        if (args?.[0] === '-m' && args?.[1] === 'rapidkit') {
          return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
        }
      }
      if (cmd === 'poetry') {
        return { stdout: 'Poetry version 2.3.2', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'pipx' && args?.[0] === '--version') {
        return { stdout: '1.8.0', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'go' && args?.[0] === 'version') {
        return { stdout: 'go version go1.22.0 linux/amd64', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'rapidkit') {
        return { stdout: 'RapidKit Version: 0.3.9', stderr: '', exitCode: 0 } as any;
      }
      if (cmd === 'npm' && Array.isArray(args) && args[0] === 'audit') {
        return {
          stdout: JSON.stringify({ metadata: { vulnerabilities: { total: 0 } } }),
          stderr: '',
          exitCode: 0,
        } as any;
      }
      if (cmd === 'npm' && Array.isArray(args) && (args[0] === 'install' || args[0] === 'ci')) {
        return {
          stdout: 'dependencies installed',
          stderr: '',
          exitCode: 0,
        } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalCwd = process.cwd();

    try {
      process.chdir(workspacePath);
      const { runDoctor } = await import('../doctor.js');
      await runDoctor({ workspace: true, apply: true });

      expect(promptMock).not.toHaveBeenCalled();
      expect(mockedExeca.mock.calls.length).toBeGreaterThan(0);
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
      await fsExtra.remove(tempRoot);
    }
  });
});
