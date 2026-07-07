# Release Notes - v0.12.8

**Release Date:** December 13, 2025

## 🐛 Windows Spawn Fix

This release fixes the `spawn EINVAL` error on Windows and improves Python detection messages.

## Bug Fixes

### spawn EINVAL Error
- **Issue:** Running `rapidkit init` on Windows threw `spawn EINVAL` error
- **Cause:** Windows requires `shell: true` to execute `.cmd` batch files
- **Fix:** Added `shell: isWindows` option to `spawn()` call in delegation logic

## Improvements

### Python Not Found Message
When Python is not installed on Windows, users now see a comprehensive help message:

```
============================================================
  Python not found!
============================================================

  RapidKit FastAPI projects require Python 3.11 or newer.

  Install Python using one of these methods:

  1. Microsoft Store (recommended):
     https://apps.microsoft.com/detail/9NRWMJP3717K

  2. Official installer:
     https://www.python.org/downloads/
     (Check "Add Python to PATH" during installation)

  3. Using winget:
     winget install Python.Python.3.12

  4. Using chocolatey:
     choco install python

  After installing, restart your terminal and try again.
============================================================
```

## Technical Details

### Files Changed

**src/index.ts:**
```typescript
const child = spawn(localScript, args, {
  stdio: 'inherit',
  cwd,
  shell: isWindows, // Required on Windows to run .cmd files
});
```

**templates/kits/fastapi-standard/rapidkit.cmd.j2:**
- Enhanced Python not found error message with installation options

## Upgrade

```bash
npm install -g rapidkit@0.12.8
# or
npx rapidkit@latest --version  # Should show 0.12.8
```

## Compatibility

- **Node.js:** 18.0.0+
- **Windows:** Windows 10/11 (PowerShell, CMD, Git Bash)
- **macOS:** 10.15+
- **Linux:** All major distributions
