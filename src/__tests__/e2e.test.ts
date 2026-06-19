import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, access } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { execa } from 'execa';
import { ensureDistBuilt } from './helpers/dist';

describe('E2E Tests', () => {
  let tempDir: string;
  let cliPath: string;

  function cliEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    delete env.NODE_ENV;
    delete env.NODE_OPTIONS;
    for (const key of Object.keys(env)) {
      if (key.startsWith('VITEST')) {
        delete env[key];
      }
    }
    return env;
  }

  beforeEach(async () => {
    cliPath = ensureDistBuilt('E2E tests');
    tempDir = await mkdtemp(join(tmpdir(), 'rapidkit-e2e-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it.skip('creates FastAPI project successfully', async () => {
    const projectName = 'test-api';
    const projectPath = join(tempDir, projectName);

    // Run rapidkit create command with --template fastapi
    await execa('node', [cliPath, projectName, '--template', 'fastapi', '--skip-git'], {
      cwd: tempDir,
    });

    // Verify project structure
    await expect(fileExists(join(projectPath, 'pyproject.toml'))).resolves.toBe(true);
    await expect(fileExists(join(projectPath, 'rapidkit'))).resolves.toBe(true);
    await expect(fileExists(join(projectPath, '.rapidkit', 'cli.py'))).resolves.toBe(true);
    await expect(fileExists(join(projectPath, '.rapidkit', 'activate'))).resolves.toBe(true);
    await expect(fileExists(join(projectPath, 'src', 'main.py'))).resolves.toBe(true);
    await expect(fileExists(join(projectPath, 'README.md'))).resolves.toBe(true);
  }, 60000);

  it.skip('creates NestJS project successfully', async () => {
    const projectName = 'test-nest';
    const projectPath = join(tempDir, projectName);

    // Run rapidkit create command with --template nestjs
    await execa(
      'node',
      [cliPath, projectName, '--template', 'nestjs', '--skip-git', '--skip-install'],
      {
        cwd: tempDir,
      }
    );

    // Verify project structure
    await expect(fileExists(join(projectPath, 'package.json'))).resolves.toBe(true);
    await expect(fileExists(join(projectPath, 'rapidkit'))).resolves.toBe(true);
    await expect(fileExists(join(projectPath, '.rapidkit', 'rapidkit'))).resolves.toBe(true);
    await expect(fileExists(join(projectPath, '.rapidkit', 'activate'))).resolves.toBe(true);
    await expect(fileExists(join(projectPath, 'src', 'main.ts'))).resolves.toBe(true);
    await expect(fileExists(join(projectPath, 'README.md'))).resolves.toBe(true);

    // Verify package.json content
    const packageJson = JSON.parse(await readFile(join(projectPath, 'package.json'), 'utf-8'));
    expect(packageJson.name).toBe('test-nest');
  }, 60000);

  it.skip('creates workspace successfully', async () => {
    const workspaceName = 'test-workspace';
    const workspacePath = join(tempDir, workspaceName);

    // Run rapidkit create command without --template (workspace mode)
    await execa('node', [cliPath, workspaceName, '--skip-git'], {
      cwd: tempDir,
    });

    // Verify workspace structure
    await expect(fileExists(join(workspacePath, 'rapidkit'))).resolves.toBe(true);
    await expect(fileExists(join(workspacePath, 'README.md'))).resolves.toBe(true);
    await expect(fileExists(join(workspacePath, 'templates'))).resolves.toBe(true);
  }, 30000);

  it('rejects invalid project names', async () => {
    const invalidNames = ['invalid name', '123-start', 'test@project', 'test project'];

    for (const invalidName of invalidNames) {
      await expect(
        execa('node', [cliPath, invalidName, '--template', 'fastapi', '--skip-git'], {
          cwd: tempDir,
          env: cliEnv(),
          reject: false,
        })
      ).resolves.toHaveProperty('exitCode', 1);
    }
  }, 30000);

  it('handles dry-run mode correctly for templates', async () => {
    const projectName = 'test-project';

    const { stdout } = await execa(
      'node',
      [cliPath, projectName, '--template', 'fastapi', '--dry-run'],
      {
        cwd: tempDir,
        env: cliEnv(),
      }
    );

    expect(stdout).toContain('Dry-run mode');
    expect(stdout.toLowerCase()).toContain('fastapi');
    expect(stdout).toContain(projectName);

    // Verify nothing was created
    await expect(fileExists(join(tempDir, projectName))).resolves.toBe(false);
  }, 15000);

  it('handles dry-run mode correctly for workspace', async () => {
    const workspaceName = 'test-workspace';

    const { stdout } = await execa('node', [cliPath, workspaceName, '--dry-run'], {
      cwd: tempDir,
      env: cliEnv(),
    });

    expect(stdout).toContain('Dry-run mode');
    expect(stdout.toLowerCase()).toContain('workspace');
    expect(stdout).toContain(workspaceName);

    // Verify nothing was created
    await expect(fileExists(join(tempDir, workspaceName))).resolves.toBe(false);
  }, 15000);

  it('shows version correctly', async () => {
    const { stdout } = await execa('node', [cliPath, '--version'], { env: cliEnv() });

    expect(stdout).toMatch(/\d+\.\d+\.\d+/);
  }, 5000);

  it('shows help correctly', async () => {
    const { stdout } = await execa('node', [cliPath, '--help'], { env: cliEnv() });

    expect(stdout).toContain('rapidkit');
    // Accept either npm wrapper help (--skip-git) or Core help (create/add/version)
    const hasNpmHelp = stdout.includes('--skip-git');
    const hasCoreHelp = /create|add|version|help/.test(stdout);
    expect(hasNpmHelp || hasCoreHelp).toBe(true);
  }, 5000);
});

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
