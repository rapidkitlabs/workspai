/**
 * Tests for CLI entry point (index.ts)
 * Tests command parsing, option handling, and workflow orchestration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execa } from 'execa';
import * as path from 'path';
import * as fs from 'fs-extra';
import { spawnSync } from 'child_process';

function ensureDistBuilt(): string {
  const repoRoot = process.cwd();
  const distPath = path.join(repoRoot, 'dist', 'index.js');
  const srcEntryPath = path.join(repoRoot, 'src', 'index.ts');

  const shouldBuild = (() => {
    if (!fs.existsSync(distPath)) return true;
    if (!fs.existsSync(srcEntryPath)) return false;

    const distMtime = fs.statSync(distPath).mtimeMs;
    const srcMtime = fs.statSync(srcEntryPath).mtimeMs;
    return srcMtime > distMtime;
  })();

  if (shouldBuild) {
    const build = spawnSync('npm', ['run', 'build'], {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    if (build.status !== 0) {
      throw new Error('Failed to build dist/index.js for CLI entry point tests');
    }
  }

  return distPath;
}

const CLI_PATH = ensureDistBuilt();
const TEST_DIR = path.join(process.cwd(), 'test-cli-output');

describe('CLI Entry Point', () => {
  beforeEach(async () => {
    await fs.ensureDir(TEST_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  describe('Version and Help', () => {
    it('should display version with --version flag', async () => {
      const { stdout } = await execa('node', [CLI_PATH, '--version']);
      expect(stdout).toMatch(/\d+\.\d+\.\d+/);
    }, 15000);

    it('should display version with -V flag', async () => {
      const { stdout } = await execa('node', [CLI_PATH, '-V']);
      expect(stdout).toMatch(/\d+\.\d+\.\d+/);
    }, 15000);

    it('should display help with --help flag', async () => {
      const { stdout } = await execa('node', [CLI_PATH, '--help']);

      // CLI identity
      expect(stdout).toContain('Welcome to RapidKit NPM CLI');
      expect(stdout).toContain('Usage:');

      // Core sections
      expect(stdout).toContain('Workspace commands (inside a workspace):');
      expect(stdout).toContain('Project commands (inside a project):');

      // Known commands
      expect(stdout).toContain('rapidkit create');
      expect(stdout).toContain('rapidkit init');
      expect(stdout).toContain('rapidkit dev');
      expect(stdout).toContain('rapidkit workspace list');
      expect(stdout).toContain('mirror [status|sync|verify|rotate]');
      expect(stdout).toContain('cache [status|clear|prune|repair]');

      // Legacy options should remain hidden from option list
      expect(stdout).not.toContain('Legacy (shown because RAPIDKIT_SHOW_LEGACY=1):');

      // Clarification note must be visible in help text
      expect(stdout).toContain(
        '--skip-install              npm fast-path for lock/dependency steps'
      );
      expect(stdout).toContain(
        '--skip-essentials           core flag for skipping essential module installation'
      );
    }, 15000);

    it('should show legacy flags when legacy env is enabled', async () => {
      const { stdout } = await execa('node', [CLI_PATH, '--help'], {
        env: { ...process.env, RAPIDKIT_SHOW_LEGACY: '1' },
      });

      expect(stdout).toContain('Legacy (shown because RAPIDKIT_SHOW_LEGACY=1):');
      expect(stdout).toContain('npx rapidkit my-project --template fastapi');
      expect(stdout).not.toContain(
        'Tip: set RAPIDKIT_SHOW_LEGACY=1 to show legacy template flags in help.'
      );
      expect(stdout).toContain(
        '--skip-essentials           core flag for skipping essential module installation'
      );
    });

    it('should display the same help output with -h flag', async () => {
      const { stdout } = await execa('node', [CLI_PATH, '-h']);

      expect(stdout).toContain('Welcome to RapidKit NPM CLI');
      expect(stdout).toContain('Workspace commands (inside a workspace):');
      expect(stdout).toContain('Project commands (inside a project):');
      expect(stdout).toContain('npx rapidkit workspace list');
    });

    it('should keep workspace help command variants aligned with supported actions', async () => {
      const { stdout } = await execa('node', [CLI_PATH, '--help']);

      expect(stdout).toContain(
        'npx rapidkit workspace list               List registered workspaces'
      );
      expect(stdout).toContain(
        'npx rapidkit mirror [status|sync|verify|rotate] Registry mirror management'
      );
      expect(stdout).toContain(
        'npx rapidkit cache [status|clear|prune|repair]  Package cache management'
      );
    });

    it('should match workspace command block snapshot', async () => {
      const { stdout } = await execa('node', [CLI_PATH, '--help']);
      const block = stdout.match(
        /Workspace commands \(inside a workspace\):[\s\S]*?Options \(workspace creation\):/
      );

      expect(block?.[0].replace(/\r/g, '')).toMatchInlineSnapshot(`
        "Workspace commands (inside a workspace):
          npx rapidkit bootstrap [--profile <p>]   Re-bootstrap toolchains
          npx rapidkit workspace list               List registered workspaces
          npx rapidkit workspace share [--output <file>] Export collaboration bundle
          npx rapidkit workspace policy show        Show effective workspace policies
          npx rapidkit workspace policy set <k> <v> Update workspace policy values
          npx rapidkit setup python|node|go|java [--warm-deps]  Set up runtime (+ optional deps warm-up)
          npx rapidkit mirror [status|sync|verify|rotate] Registry mirror management
          npx rapidkit cache [status|clear|prune|repair]  Package cache management

        Options (workspace creation):"
      `);
    });

    it('should render identical output for no-arg, --help, and help at root', async () => {
      const noArg = await execa('node', [CLI_PATH]);
      const withHelp = await execa('node', [CLI_PATH, '--help']);
      const withHelpCommand = await execa('node', [CLI_PATH, 'help']);

      expect(noArg.stdout.replace(/\r/g, '')).toBe(withHelp.stdout.replace(/\r/g, ''));
      expect(noArg.stdout.replace(/\r/g, '')).toBe(withHelpCommand.stdout.replace(/\r/g, ''));
    });
  });

  describe('Dry-run Mode', () => {
    it('should show what would be created in FastAPI template dry-run mode', async () => {
      const { stdout } = await execa(
        'node',
        [CLI_PATH, 'test-project', '--template', 'fastapi', '--dry-run', '--no-update-check'],
        { cwd: TEST_DIR }
      );

      expect(stdout).toContain('Dry-run mode');
      expect(stdout).toContain('test-project');
      expect(stdout).toMatch(/fastapi/i);

      // Should not create any files
      const projectPath = path.join(TEST_DIR, 'test-project');
      expect(await fs.pathExists(projectPath)).toBe(false);
    });

    it('should show what would be created in NestJS template dry-run mode', async () => {
      const { stdout } = await execa(
        'node',
        [CLI_PATH, 'test-project', '--template', 'nestjs', '--dry-run', '--no-update-check'],
        { cwd: TEST_DIR }
      );

      expect(stdout).toContain('Dry-run mode');
      expect(stdout).toContain('test-project');
      expect(stdout).toMatch(/nestjs/i);

      // Should not create any files
      const projectPath = path.join(TEST_DIR, 'test-project');
      expect(await fs.pathExists(projectPath)).toBe(false);
    });

    it('should show what would be created in workspace dry-run mode', async () => {
      const { stdout } = await execa(
        'node',
        [CLI_PATH, 'test-workspace', '--dry-run', '--no-update-check'],
        { cwd: TEST_DIR }
      );

      expect(stdout).toContain('Dry-run mode');
      expect(stdout).toContain('test-workspace');
      expect(stdout).toMatch(/workspace/i);

      // Should not create any files
      const workspacePath = path.join(TEST_DIR, 'test-workspace');
      expect(await fs.pathExists(workspacePath)).toBe(false);
    });
  });

  describe('Debug Mode', () => {
    it('should enable debug logging with --debug flag', async () => {
      const { stdout } = await execa(
        'node',
        [
          CLI_PATH,
          'test-project',
          '--template',
          'fastapi',
          '--dry-run',
          '--debug',
          '--no-update-check',
        ],
        { cwd: TEST_DIR }
      );

      expect(stdout).toContain('Debug mode enabled');
    });
  });

  describe('Template Mode (--template)', () => {
    it('should validate project name in template mode', async () => {
      try {
        await execa(
          'node',
          [CLI_PATH, 'Invalid-Name!', '--template', 'fastapi', '--dry-run', '--no-update-check'],
          { cwd: TEST_DIR }
        );
        expect.fail('Should have thrown validation error');
      } catch (error: any) {
        expect(error.exitCode).toBe(1);
        // Check for validation error message
        const output = error.stdout || error.stderr;
        expect(output).toMatch(/validation|lowercase|capital|special|URL-friendly/i);
      }
    });

    it('should accept fastapi template', async () => {
      const { stdout } = await execa(
        'node',
        [CLI_PATH, 'my-api', '--template', 'fastapi', '--dry-run', '--no-update-check'],
        { cwd: TEST_DIR }
      );

      expect(stdout).toMatch(/fastapi/i);
    });

    it('should accept nestjs template', async () => {
      const { stdout } = await execa(
        'node',
        [CLI_PATH, 'my-api', '--template', 'nestjs', '--dry-run', '--no-update-check'],
        { cwd: TEST_DIR }
      );

      expect(stdout).toMatch(/nestjs/i);
    });

    it('should use short flag -t for template', async () => {
      const { stdout } = await execa(
        'node',
        [CLI_PATH, 'my-api', '-t', 'fastapi', '--dry-run', '--no-update-check'],
        { cwd: TEST_DIR }
      );

      expect(stdout).toMatch(/fastapi/i);
    });
  });

  describe('Workspace Mode (no --template)', () => {
    it('should validate workspace name', async () => {
      try {
        await execa('node', [CLI_PATH, 'Invalid Name!', '--dry-run', '--no-update-check'], {
          cwd: TEST_DIR,
        });
        expect.fail('Should have thrown validation error');
      } catch (error: any) {
        expect(error.exitCode).toBe(1);
      }
    });

    it('should create workspace without --template flag', async () => {
      const { stdout } = await execa(
        'node',
        [CLI_PATH, 'test-ws', '--dry-run', '--no-update-check'],
        { cwd: TEST_DIR }
      );

      expect(stdout).toMatch(/workspace/i);
    });
  });

  describe('Option Combinations', () => {
    it('should handle --skip-git option', async () => {
      const { stdout } = await execa(
        'node',
        [CLI_PATH, 'test-ws', '--skip-git', '--dry-run', '--no-update-check'],
        { cwd: TEST_DIR }
      );

      expect(stdout).toContain('Dry-run mode');
    });

    it('should handle --skip-install option for NestJS', async () => {
      const { stdout } = await execa(
        'node',
        [
          CLI_PATH,
          'test-api',
          '--template',
          'nestjs',
          '--skip-install',
          '--dry-run',
          '--no-update-check',
        ],
        { cwd: TEST_DIR }
      );

      expect(stdout).toMatch(/nestjs/i);
    });

    it('should handle --no-update-check option', async () => {
      const { stdout } = await execa('node', [CLI_PATH, '--version', '--no-update-check'], {
        cwd: TEST_DIR,
      });

      // Should still show version
      expect(stdout).toMatch(/\d+\.\d+\.\d+/);
    });

    it('should handle multiple flags together', async () => {
      const { stdout } = await execa(
        'node',
        [
          CLI_PATH,
          'test-proj',
          '--template',
          'fastapi',
          '--debug',
          '--dry-run',
          '--no-update-check',
        ],
        { cwd: TEST_DIR }
      );

      expect(stdout).toContain('Debug mode enabled');
      expect(stdout).toContain('Dry-run mode');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid project names gracefully', async () => {
      try {
        await execa(
          'node',
          [CLI_PATH, '123invalid', '--template', 'fastapi', '--dry-run', '--no-update-check'],
          { cwd: TEST_DIR }
        );
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.exitCode).toBe(1);
      }
    });

    it('should handle special characters in names', async () => {
      try {
        await execa(
          'node',
          [CLI_PATH, 'test@project!', '--template', 'fastapi', '--dry-run', '--no-update-check'],
          { cwd: TEST_DIR }
        );
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.exitCode).toBe(1);
      }
    });

    it('should handle uppercase in names', async () => {
      try {
        await execa(
          'node',
          [CLI_PATH, 'TestProject', '--template', 'fastapi', '--dry-run', '--no-update-check'],
          { cwd: TEST_DIR }
        );
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.exitCode).toBe(1);
      }
    });
  });

  describe('Welcome Message', () => {
    it('should display welcome message', async () => {
      const { stdout } = await execa(
        'node',
        [CLI_PATH, 'test-ws', '--dry-run', '--no-update-check'],
        { cwd: TEST_DIR }
      );

      expect(stdout).toContain('Welcome to RapidKit');
    });
  });

  describe('Update Checker', () => {
    it('should skip update check with --no-update-check', async () => {
      const { stdout } = await execa('node', [CLI_PATH, '--version', '--no-update-check'], {
        cwd: TEST_DIR,
      });

      // Should not contain update check messages
      expect(stdout).not.toContain('Checking for updates');
      expect(stdout).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('Config Loading', () => {
    it('should load user config in debug mode', async () => {
      const { stdout } = await execa(
        'node',
        [CLI_PATH, 'test-ws', '--dry-run', '--debug', '--no-update-check'],
        { cwd: TEST_DIR }
      );

      expect(stdout).toContain('Debug mode enabled');
    });
  });

  describe('Path Resolution', () => {
    it('should resolve project path correctly in template mode', async () => {
      const { stdout } = await execa(
        'node',
        [CLI_PATH, 'my-test-project', '--template', 'fastapi', '--dry-run', '--no-update-check'],
        { cwd: TEST_DIR }
      );

      expect(stdout).toContain('my-test-project');
    });

    it('should reject relative paths with dots', async () => {
      try {
        await execa(
          'node',
          [CLI_PATH, './test-project', '--template', 'fastapi', '--dry-run', '--no-update-check'],
          { cwd: TEST_DIR }
        );
        expect.fail('Should reject path starting with dot');
      } catch (error: any) {
        expect(error.exitCode).toBe(1);
        const output = error.stdout || error.stderr;
        expect(output).toMatch(/cannot start with|URL-friendly/);
      }
    });
  });

  describe('Command Name', () => {
    it('should use "rapidkit" as command name', async () => {
      const { stdout } = await execa('node', [CLI_PATH, '--help']);

      expect(stdout).toContain('rapidkit');
    });
  });

  describe('Argument Parsing', () => {
    it('should accept directory name as positional argument', async () => {
      const { stdout } = await execa(
        'node',
        [CLI_PATH, 'my-custom-name', '--dry-run', '--no-update-check'],
        { cwd: TEST_DIR }
      );

      expect(stdout).toContain('my-custom-name');
    });

    it('should handle kebab-case directory names', async () => {
      const { stdout } = await execa(
        'node',
        [CLI_PATH, 'my-test-workspace', '--dry-run', '--no-update-check'],
        { cwd: TEST_DIR }
      );

      expect(stdout).toContain('my-test-workspace');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long valid names', async () => {
      const longName = 'my-very-long-project-name-that-is-still-valid';
      const { stdout } = await execa(
        'node',
        [CLI_PATH, longName, '--dry-run', '--no-update-check'],
        { cwd: TEST_DIR }
      );

      expect(stdout).toContain(longName);
    });

    it('should handle minimum valid name length (2 chars)', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'ab', '--dry-run', '--no-update-check'], {
        cwd: TEST_DIR,
      });

      expect(stdout).toContain('Dry-run mode');
    });

    it('should reject single character names', async () => {
      try {
        await execa('node', [CLI_PATH, 'a', '--dry-run', '--no-update-check'], {
          cwd: TEST_DIR,
        });
        expect.fail('Should reject single character name');
      } catch (error: any) {
        expect(error.exitCode).toBe(1);
        const output = error.stdout || error.stderr;
        expect(output).toContain('at least 2 characters');
      }
    });

    it('should reject names starting with numbers', async () => {
      try {
        await execa('node', [CLI_PATH, '1project', '--dry-run', '--no-update-check'], {
          cwd: TEST_DIR,
        });
        expect.fail('Should reject name starting with number');
      } catch (error: any) {
        expect(error.exitCode).toBe(1);
      }
    });

    it('should reject names with spaces', async () => {
      try {
        await execa('node', [CLI_PATH, 'my project', '--dry-run', '--no-update-check'], {
          cwd: TEST_DIR,
        });
        expect.fail('Should reject name with spaces');
      } catch (error: any) {
        expect(error.exitCode).toBe(1);
      }
    });

    it('should accept names with hyphens', async () => {
      const { stdout } = await execa(
        'node',
        [CLI_PATH, 'my-project', '--dry-run', '--no-update-check'],
        { cwd: TEST_DIR }
      );

      expect(stdout).toContain('my-project');
    });
  });
});
