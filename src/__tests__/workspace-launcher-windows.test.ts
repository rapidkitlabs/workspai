import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeWorkspaceLauncher } from '../create.js';

const createdDirs: string[] = [];

async function tempWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rapidkit-launcher-'));
  createdDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of createdDirs.splice(0)) {
    await fs.remove(dir);
  }
});

describe('Windows workspace launcher', () => {
  it('forwards POSIX launchers to a non-local npm wrapper without recursing into workspace shadows', async () => {
    const workspace = await tempWorkspace();

    await writeWorkspaceLauncher(workspace, 'pipx');

    const launcher = await fs.readFile(path.join(workspace, 'rapidkit'), 'utf8');

    expect(launcher).toContain('RAPIDKIT_LOCAL_LAUNCHER_BYPASS=1');
    expect(launcher).toContain('[ "$RAPIDKIT_CMD" != "$SCRIPT_DIR/rapidkit" ]');
    expect(launcher).toContain('[ "$RAPIDKIT_CMD" != "$SCRIPT_DIR/.rapidkit/rapidkit" ]');
    expect(launcher).toContain('$HOME/.local/bin/rapidkit');
  });

  it('forwards to a non-local npm wrapper before falling back to core launchers', async () => {
    const workspace = await tempWorkspace();

    await writeWorkspaceLauncher(workspace, 'pipx');

    const launcher = await fs.readFile(path.join(workspace, 'rapidkit.cmd'), 'utf8');

    expect(launcher).toContain(':rapidkit_npm_wrapper_fallback');
    expect(launcher).toContain('where rapidkit.cmd');
    expect(launcher).toContain('RAPIDKIT_LOCAL_LAUNCHER_BYPASS=1');
    expect(launcher).toContain('if /I not "%%~fR"=="%SCRIPT_DIR%rapidkit.cmd"');
  });

  it('marks forwarded calls so the npm wrapper does not delegate back to the same local launcher', async () => {
    const workspace = await tempWorkspace();

    await writeWorkspaceLauncher(workspace, 'pipx');

    const launcher = await fs.readFile(path.join(workspace, 'rapidkit.cmd'), 'utf8');

    expect(launcher).toContain('RAPIDKIT_LOCAL_LAUNCHER_BYPASS=1');
  });

  it('npm wrapper disables local launcher delegation when bypass marker is present', async () => {
    const source = await fs.readFile(path.resolve('src/index.ts'), 'utf8');

    expect(source).toContain(
      "const bypassLocalWorkspaceLauncher = process.env.RAPIDKIT_LOCAL_LAUNCHER_BYPASS === '1'"
    );
    expect(source).toContain('const localScriptCandidates = bypassLocalWorkspaceLauncher');
    expect(source).toContain('const localScriptCandidatesEarly = bypassLocalWorkspaceLauncher');
  });

  it('falls back to pipx/user-local rapidkit-core launchers when no local venv exists', async () => {
    const workspace = await tempWorkspace();

    await writeWorkspaceLauncher(workspace, 'pipx');

    const launcher = await fs.readFile(path.join(workspace, 'rapidkit.cmd'), 'utf8');

    expect(launcher).toContain('%USERPROFILE%\\.local\\bin\\rapidkit.exe');
    expect(launcher).toContain('%APPDATA%\\Python\\Scripts\\rapidkit.exe');
    expect(launcher).toContain('%LOCALAPPDATA%\\Programs\\Python\\Scripts\\rapidkit.exe');
  });
});
