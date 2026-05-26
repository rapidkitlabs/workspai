/**
 * Tests for CLI entry point (index.ts)
 * Tests command parsing, option handling, and workflow orchestration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs-extra';
import os from 'os';
import { spawnSync } from 'child_process';

import { handleImportCommand } from '../index';

interface CliExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  reject?: boolean;
}

interface CliExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function execa(
  command: string,
  args: string[] = [],
  options: CliExecOptions = {}
): Promise<CliExecResult> {
  const captureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rapidkit-cli-test-'));
  const stdoutPath = path.join(captureDir, 'stdout.log');
  const stderrPath = path.join(captureDir, 'stderr.log');
  const stdoutFd = fs.openSync(stdoutPath, 'w');
  const stderrFd = fs.openSync(stderrPath, 'w');

  try {
    const child = spawnSync(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', stdoutFd, stderrFd],
      windowsHide: true,
    });

    const result = {
      stdout: await fs.readFile(stdoutPath, 'utf-8'),
      stderr: await fs.readFile(stderrPath, 'utf-8'),
      exitCode: child.status ?? (child.error ? 1 : 0),
    };

    if ((child.error || result.exitCode !== 0) && options.reject !== false) {
      throw Object.assign(child.error ?? new Error(`Command failed: ${command}`), result);
    }

    return result;
  } finally {
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);
    await fs.remove(captureDir);
  }
}

function ensureDistBuilt(): string {
  const repoRoot = process.cwd();
  const distPath = path.join(repoRoot, 'dist', 'index.js');
  const sourcePaths = [
    path.join(repoRoot, 'src', 'index.ts'),
    path.join(repoRoot, 'src', 'import-project.ts'),
    path.join(repoRoot, 'src', 'imported-projects-registry.ts'),
    path.join(repoRoot, 'src', 'workspace-snapshot.ts'),
  ];

  const shouldBuild = (() => {
    if (!fs.existsSync(distPath)) return true;
    const distMtime = fs.statSync(distPath).mtimeMs;

    return sourcePaths.some((sourcePath) => {
      if (!fs.existsSync(sourcePath)) {
        return false;
      }

      return fs.statSync(sourcePath).mtimeMs > distMtime;
    });
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
      expect(stdout).toContain('rapidkit import <path|git-url>');
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
          npx rapidkit import <path|git-url>        Copy or clone a backend project into this workspace
          npx rapidkit snapshot create [name]      Create a recoverable workspace snapshot
          npx rapidkit snapshot restore <name>     Restore snapshot metadata with safety guard
          npx rapidkit snapshot inspect <name>     Inspect snapshot manifest and size
          npx rapidkit project archive <name>      Archive a project with a safety snapshot
          npx rapidkit project restore <archive>   Restore an archived project safely
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

  describe('Autopilot Command (CLI Entrypoint)', () => {
    it('should reject unknown autopilot action from CLI entrypoint', async () => {
      const result = await execa('node', [CLI_PATH, 'autopilot', 'unknown'], {
        cwd: TEST_DIR,
        reject: false,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('Unknown autopilot action: unknown');
      expect(result.stdout).toContain('Available: release');
    }, 15000);

    it('should reject invalid autopilot mode from CLI entrypoint', async () => {
      const result = await execa('node', [CLI_PATH, 'autopilot', 'release', '--mode', 'invalid'], {
        cwd: TEST_DIR,
        reject: false,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('Invalid autopilot mode: invalid');
      expect(result.stdout).toContain('Allowed modes: audit | safe-fix | enforce');
    }, 15000);
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
    it('should roll back imported files when workspace sync fails after import', async () => {
      const workspaceRoot = await fs.mkdtemp(path.join(TEST_DIR, 'workspace-import-fail-'));
      const sourceDir = await fs.mkdtemp(path.join(TEST_DIR, 'source-import-fail-'));

      await fs.ensureDir(path.join(workspaceRoot, '.rapidkit'));
      await fs.writeJson(path.join(workspaceRoot, '.rapidkit', 'workspace.json'), {
        workspace_name: 'demo-workspace',
      });
      await fs.writeFile(path.join(workspaceRoot, '.rapidkit-workspace'), '{}');
      await fs.writeJson(path.join(sourceDir, 'package.json'), {
        name: 'orders-api',
        dependencies: {
          express: '^4.19.2',
        },
      });

      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      try {
        const exitCode = await handleImportCommand(
          sourceDir,
          {
            workspace: workspaceRoot,
            name: 'orders-api',
            json: true,
          },
          {
            syncWorkspaceProjects: async () => {
              throw new Error('sync failed');
            },
          }
        );

        expect(exitCode).toBe(1);
        expect(await fs.pathExists(path.join(workspaceRoot, 'orders-api'))).toBe(false);

        const registry = await fs.readJson(
          path.join(workspaceRoot, '.rapidkit', 'imported-projects.json')
        );
        expect(registry.projects).toEqual([]);
        expect(consoleLog).toHaveBeenCalledWith(
          JSON.stringify(
            {
              error:
                'Workspace sync failed after import and the imported project was rolled back: sync failed',
            },
            null,
            2
          )
        );
      } finally {
        consoleLog.mockRestore();
        await fs.remove(workspaceRoot);
        await fs.remove(sourceDir);
      }
    });

    it('should import a local project through the CLI wrapper and emit registry JSON', async () => {
      const workspaceRoot = await fs.mkdtemp(path.join(TEST_DIR, 'workspace-import-'));
      const sourceDir = await fs.mkdtemp(path.join(TEST_DIR, 'source-import-'));

      await fs.ensureDir(path.join(workspaceRoot, '.rapidkit'));
      await fs.writeJson(path.join(workspaceRoot, '.rapidkit', 'workspace.json'), {
        workspace_name: 'demo-workspace',
      });
      await fs.writeFile(path.join(workspaceRoot, '.rapidkit-workspace'), '{}');
      await fs.writeJson(path.join(sourceDir, 'package.json'), {
        name: 'orders-api',
        dependencies: {
          express: '^4.19.2',
        },
      });

      try {
        const { stdout, exitCode } = await execa('node', [
          CLI_PATH,
          'import',
          sourceDir,
          '--workspace',
          workspaceRoot,
          '--name',
          'orders-api',
          '--json',
        ]);

        expect(exitCode).toBe(0);

        const payload = JSON.parse(stdout) as {
          workspacePath: string;
          importedProject: { name: string; stack: string; source: string; path: string };
        };

        expect(payload.workspacePath).toBe(workspaceRoot);
        expect(payload.importedProject).toMatchObject({
          name: 'orders-api',
          stack: 'express',
          source: 'local-folder',
        });
        expect(await fs.pathExists(path.join(payload.importedProject.path, 'package.json'))).toBe(
          true
        );

        const registry = await fs.readJson(
          path.join(workspaceRoot, '.rapidkit', 'imported-projects.json')
        );
        expect(registry.projects).toEqual([
          expect.objectContaining({
            name: 'orders-api',
            stack: 'express',
            source: 'local-folder',
          }),
        ]);
      } finally {
        await fs.remove(workspaceRoot);
        await fs.remove(sourceDir);
      }
    }, 20000);

    it('should import a git repository through the CLI wrapper with --git', async () => {
      const workspaceRoot = await fs.mkdtemp(path.join(TEST_DIR, 'workspace-import-git-'));
      const gitSource = await fs.mkdtemp(path.join(TEST_DIR, 'source-import-git-'));

      await fs.ensureDir(path.join(workspaceRoot, '.rapidkit'));
      await fs.writeJson(path.join(workspaceRoot, '.rapidkit', 'workspace.json'), {
        workspace_name: 'demo-workspace',
      });
      await fs.writeFile(path.join(workspaceRoot, '.rapidkit-workspace'), '{}');
      await fs.writeJson(path.join(gitSource, 'package.json'), {
        name: 'git-orders-api',
        dependencies: {
          express: '^4.19.2',
        },
      });
      await fs.writeFile(path.join(gitSource, 'README.md'), '# git import\n');
      await execa('git', ['init'], { cwd: gitSource });
      await execa('git', ['config', 'user.email', 'rapidkit@example.com'], { cwd: gitSource });
      await execa('git', ['config', 'user.name', 'RapidKit Test'], { cwd: gitSource });
      await execa('git', ['add', '.'], { cwd: gitSource });
      await execa('git', ['-c', 'commit.gpgsign=false', 'commit', '-m', 'init'], {
        cwd: gitSource,
      });

      try {
        const { stdout, exitCode } = await execa('node', [
          CLI_PATH,
          'import',
          gitSource,
          '--git',
          '--workspace',
          workspaceRoot,
          '--name',
          'git-orders-api',
          '--json',
        ]);

        expect(exitCode).toBe(0);

        const payload = JSON.parse(stdout) as {
          workspacePath: string;
          importedProject: { name: string; stack: string; source: string; path: string };
        };

        expect(payload.workspacePath).toBe(workspaceRoot);
        expect(payload.importedProject).toMatchObject({
          name: 'git-orders-api',
          stack: 'express',
          source: 'git-url',
        });
        expect(await fs.pathExists(path.join(payload.importedProject.path, '.git'))).toBe(true);
      } finally {
        await fs.remove(workspaceRoot);
        await fs.remove(gitSource);
      }
    }, 20000);

    it('should auto-create or reuse the default workspace when import runs outside any workspace', async () => {
      const fakeHome = await fs.mkdtemp(path.join(TEST_DIR, 'home-import-default-'));
      const cwdOutsideWorkspace = await fs.mkdtemp(path.join(TEST_DIR, 'cwd-import-default-'));
      const sourceDir = await fs.mkdtemp(path.join(TEST_DIR, 'source-import-default-'));

      await fs.writeJson(path.join(sourceDir, 'package.json'), {
        name: 'default-orders-api',
        dependencies: {
          express: '^4.19.2',
        },
      });

      try {
        const { stdout, exitCode } = await execa(
          'node',
          [CLI_PATH, 'import', sourceDir, '--name', 'default-orders-api', '--json'],
          {
            cwd: cwdOutsideWorkspace,
            env: {
              ...process.env,
              HOME: fakeHome,
              USERPROFILE: fakeHome,
            },
          }
        );

        expect(exitCode).toBe(0);

        const expectedWorkspacePath = path.join(
          fakeHome,
          'Workspai',
          'rapidkits',
          'default-workspace'
        );
        const payload = JSON.parse(stdout) as {
          workspacePath: string;
          workspaceResolution: string;
          defaultWorkspaceCreated: boolean;
          suggestedCdCommand: string;
          importedProject: { name: string; stack: string; source: string; path: string };
        };

        expect(payload.workspacePath).toBe(expectedWorkspacePath);
        expect(payload.workspaceResolution).toBe('default-auto');
        expect(payload.defaultWorkspaceCreated).toBe(true);
        expect(payload.suggestedCdCommand).toBe(`cd ${expectedWorkspacePath}`);
        expect(payload.importedProject).toMatchObject({
          name: 'default-orders-api',
          stack: 'express',
          source: 'local-folder',
        });
        expect(await fs.pathExists(path.join(expectedWorkspacePath, '.rapidkit-workspace'))).toBe(
          true
        );
        expect(
          await fs.pathExists(path.join(expectedWorkspacePath, '.rapidkit', 'workspace.json'))
        ).toBe(true);
      } finally {
        await fs.remove(fakeHome);
        await fs.remove(cwdOutsideWorkspace);
        await fs.remove(sourceDir);
      }
    }, 20000);

    it('should not silently fall back when an explicit workspace path is invalid', async () => {
      const fakeHome = await fs.mkdtemp(path.join(TEST_DIR, 'home-import-explicit-'));
      const cwdOutsideWorkspace = await fs.mkdtemp(path.join(TEST_DIR, 'cwd-import-explicit-'));
      const sourceDir = await fs.mkdtemp(path.join(TEST_DIR, 'source-import-explicit-'));
      const invalidWorkspace = path.join(cwdOutsideWorkspace, 'not-a-workspace');

      await fs.ensureDir(invalidWorkspace);
      await fs.writeJson(path.join(sourceDir, 'package.json'), {
        name: 'explicit-orders-api',
        dependencies: {
          express: '^4.19.2',
        },
      });

      try {
        await execa(
          'node',
          [CLI_PATH, 'import', sourceDir, '--workspace', invalidWorkspace, '--json'],
          {
            cwd: cwdOutsideWorkspace,
            env: {
              ...process.env,
              HOME: fakeHome,
            },
            reject: false,
          }
        ).then(({ stdout, exitCode }) => {
          expect(exitCode).toBe(1);
          const payload = JSON.parse(stdout) as { error: string };
          expect(payload.error).toContain('Workspace path is not a valid RapidKit workspace');
        });

        expect(
          await fs.pathExists(path.join(fakeHome, 'Workspai', 'rapidkits', 'default-workspace'))
        ).toBe(false);
      } finally {
        await fs.remove(fakeHome);
        await fs.remove(cwdOutsideWorkspace);
        await fs.remove(sourceDir);
      }
    }, 20000);

    it('should roll back imported local project via dist CLI when sync fails by injected test hook', async () => {
      const workspaceRoot = await fs.mkdtemp(
        path.join(TEST_DIR, 'workspace-import-injected-fail-')
      );
      const sourceDir = await fs.mkdtemp(path.join(TEST_DIR, 'source-import-injected-fail-'));

      await fs.ensureDir(path.join(workspaceRoot, '.rapidkit'));
      await fs.writeJson(path.join(workspaceRoot, '.rapidkit', 'workspace.json'), {
        workspace_name: 'demo-workspace',
      });
      await fs.writeFile(path.join(workspaceRoot, '.rapidkit-workspace'), '{}');
      await fs.writeJson(path.join(sourceDir, 'package.json'), {
        name: 'orders-api-injected-fail',
        dependencies: {
          express: '^4.19.2',
        },
      });

      try {
        const { stdout, exitCode } = await execa(
          'node',
          [
            CLI_PATH,
            'import',
            sourceDir,
            '--workspace',
            workspaceRoot,
            '--name',
            'orders-api-injected-fail',
            '--json',
          ],
          {
            reject: false,
            env: {
              ...process.env,
              RAPIDKIT_TEST_IMPORT_SYNC_FAIL: '1',
            },
          }
        );

        expect(exitCode).toBe(1);
        const payload = JSON.parse(stdout) as { error: string };
        expect(payload.error).toContain(
          'Workspace sync failed after import and the imported project was rolled back'
        );
        expect(payload.error).toContain(
          'forced sync failure for command-level import rollback test'
        );

        expect(await fs.pathExists(path.join(workspaceRoot, 'orders-api-injected-fail'))).toBe(
          false
        );

        const registry = await fs.readJson(
          path.join(workspaceRoot, '.rapidkit', 'imported-projects.json')
        );
        expect(registry.projects).toEqual([]);
      } finally {
        await fs.remove(workspaceRoot);
        await fs.remove(sourceDir);
      }
    }, 20000);

    it('should route workspace-root init through the same full-init flow without misreading flags', async () => {
      const workspaceRoot = await fs.mkdtemp(path.join(TEST_DIR, 'workspace-root-'));
      await fs.writeFile(path.join(workspaceRoot, '.rapidkit-workspace'), '');

      try {
        const { stdout, stderr, exitCode } = await execa(
          'node',
          [CLI_PATH, 'init', '--no-update-check'],
          { cwd: workspaceRoot }
        );

        expect(exitCode).toBe(0);
        const output = `${stdout || ''}\n${stderr || ''}`;
        expect(output).toContain('workspace root');
        expect(output).toContain('same full-init flow');
        expect(output).toContain('Workspace run (init)');
        expect(output).not.toContain('No such option: --no-update-check');
      } finally {
        await fs.remove(workspaceRoot);
      }
    }, 30000);

    it('should redirect workspace init to workspace run init with a hint', async () => {
      try {
        await execa('node', [CLI_PATH, 'workspace', 'init'], {
          cwd: TEST_DIR,
        });
        expect.fail('Should have thrown because test dir is not a workspace');
      } catch (error: any) {
        expect(error.exitCode).toBe(1);
        const output = `${error.stdout || ''}\n${error.stderr || ''}`;
        expect(output).toContain('workspace init');
        expect(output).toContain('workspace run init');
        expect(output).not.toContain('Unknown workspace action: init');
      }
    });

    it('should require workspace root for workspace run init when called from a nested directory', async () => {
      const workspaceRoot = await fs.mkdtemp(path.join(TEST_DIR, 'workspace-root-nested-'));
      const nestedDir = path.join(workspaceRoot, 'my-nest-services');
      await fs.ensureDir(nestedDir);
      await fs.writeFile(path.join(workspaceRoot, '.rapidkit-workspace'), '');

      try {
        await execa('node', [CLI_PATH, 'workspace', 'run', 'init'], {
          cwd: nestedDir,
        });
        expect.fail('Should have thrown because command is not executed from workspace root');
      } catch (error: any) {
        expect(error.exitCode).toBe(1);
        const output = `${error.stdout || ''}\n${error.stderr || ''}`;
        expect(output).toContain('must be run from workspace root');
        expect(output).toContain(workspaceRoot);
        expect(output).toContain('For project-only init');
      } finally {
        await fs.remove(workspaceRoot);
      }
    });

    it('should require workspace root for workspace init when called from a nested directory', async () => {
      const workspaceRoot = await fs.mkdtemp(path.join(TEST_DIR, 'workspace-root-nested-init-'));
      const nestedDir = path.join(workspaceRoot, 'my-nest-services');
      await fs.ensureDir(nestedDir);
      await fs.writeFile(path.join(workspaceRoot, '.rapidkit-workspace'), '');

      try {
        await execa('node', [CLI_PATH, 'workspace', 'init'], {
          cwd: nestedDir,
        });
        expect.fail('Should have thrown because command is not executed from workspace root');
      } catch (error: any) {
        expect(error.exitCode).toBe(1);
        const output = `${error.stdout || ''}\n${error.stderr || ''}`;
        expect(output).toContain('workspace init is an alias');
        expect(output).toContain('must be run from workspace root');
        expect(output).toContain(workspaceRoot);
        expect(output).toContain('For project-only init');
      } finally {
        await fs.remove(workspaceRoot);
      }
    });

    it('should list workspace init in unknown workspace action help', async () => {
      try {
        await execa('node', [CLI_PATH, 'workspace', 'unknown-action']);
        expect.fail('Should have thrown for unknown workspace action');
      } catch (error: any) {
        expect(error.exitCode).toBe(1);
        const output = `${error.stdout || ''}\n${error.stderr || ''}`;
        expect(output).toContain('Unknown workspace action: unknown-action');
        expect(output).toContain('Available: list, sync, policy, share, run');
      }
    });

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
