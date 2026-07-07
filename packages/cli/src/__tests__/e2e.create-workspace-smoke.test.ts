import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, access } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { execa } from 'execa';

describe('E2E Smoke: Create Workspace', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'rapidkit-e2e-smoke-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it.skip('creates a workspace and installs rapidkit-core into .venv', async () => {
    const workspaceName = 'smoke-workspace';
    const workspacePath = join(tempDir, workspaceName);

    // Create workspace non-interactively
    await execa(
      'node',
      [join(process.cwd(), 'dist/index.js'), workspaceName, '--yes', '--skip-git'],
      {
        cwd: tempDir,
        // Keep environment minimal so we run as a "clean-like" invocation
        env: { ...process.env },
      }
    );

    // Ensure workspace .venv Python exists (cross-platform)
    const venvPython = join(
      workspacePath,
      '.venv',
      process.platform === 'win32' ? 'Scripts' : 'bin',
      process.platform === 'win32' ? 'python.exe' : 'python'
    );
    await expect(fileExists(venvPython)).resolves.toBe(true);

    // Verify rapidkit-core is installed in the workspace venv
    const result = await execa(venvPython, ['-m', 'pip', 'show', 'rapidkit-core'], {
      cwd: workspacePath,
    });
    expect(result.stdout).toContain('Name: rapidkit-core');
    expect(result.exitCode).toBe(0);
  }, 120000);
});

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
