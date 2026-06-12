# Release Notes - v0.33.2

## v0.33.2 (June 12, 2026)

### Windows Workspace Launcher and Core Resolver Hardening

This patch closes cross-platform command resolution gaps for workspace-based RapidKit usage. It hardens Windows `rapidkit.cmd` behavior, supports workspace-local Core installs outside the default `.venv`, and makes user-local/pipx Core discovery deterministic even when those paths are not on `PATH`.

## Highlights

- **Windows launcher shadowing**
  - Generated `rapidkit.cmd` launchers now fall back to a non-local npm wrapper before reporting that Core is missing.
  - Forwarded calls set `RAPIDKIT_LOCAL_LAUNCHER_BYPASS=1`, preventing the npm wrapper from delegating back into the same workspace launcher.
  - POSIX launchers use the same recursion guard for local `rapidkit` and `.rapidkit/rapidkit` shadows.

- **Workspace-local Core discovery**
  - The npm bridge now prefers workspace-local Core runners from the current directory and parent workspaces.
  - `.rapidkit-workspace` `metadata.python.venvPath` is honored, so imported or example workspaces can keep Core in non-standard workspace-local virtualenvs.
  - Python version metadata from workspace markers can set the resolver context consistently.

- **User-local / pipx fallback**
  - The bridge scans deterministic user-local Core launcher paths, including Windows `%USERPROFILE%\.local\bin`, `%APPDATA%\Python\Scripts`, and `%LOCALAPPDATA%\Programs\Python\Scripts`.
  - This keeps global npm and `npx` commands working when Core exists via pipx or user-level Python scripts but is not on `PATH`.

- **Regression coverage**
  - Added launcher and resolver tests for Windows, Linux, and macOS path layouts.
  - Added workspace marker virtualenv coverage and user-local Core fallback coverage.
  - The Windows bridge E2E workflow now runs the focused resolver regression suite before native smoke tests.

## Upgrade

```bash
npm install -g rapidkit@0.33.2
```

Or run without a global install:

```bash
npx rapidkit --version
```

## Recommended Validation

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:coverage
```

Focused bridge regression suite:

```bash
npm test -- \
  src/__tests__/platform-capabilities.test.ts \
  src/__tests__/workspace-launcher-windows.test.ts \
  src/__tests__/pythonRapidkitExec-workspace-runner.test.ts \
  src/__tests__/pythonRapidkitExec.test.ts
```
