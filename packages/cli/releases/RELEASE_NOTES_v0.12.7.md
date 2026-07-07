# Release Notes - v0.12.7

**Release Date:** December 13, 2025

## 🪟 Windows Support

This release adds full Windows compatibility for `rapidkit` CLI commands, fixing the "rapidkit is not recognized" error that Windows users experienced.

## What's New

### Windows Batch Wrappers

**FastAPI Projects (`rapidkit.cmd`):**
- Intelligent Python detection chain: `.venv` → `poetry run` → system Python
- Full command support: init, dev, start, test, lint, format
- Delegates to `.rapidkit/cli.py` for actual execution

**NestJS Projects (`rapidkit.cmd`):**
- Node.js detection with npm/pnpm support
- Full command support: init, dev, start, build, test, lint, format
- Delegates to `.rapidkit/rapidkit.cmd` for actual execution

### Global CLI Improvements

The global `rapidkit` npm command now properly detects Windows and delegates to local `.cmd` files:

- `findLocalLauncherUpSync()` - Checks `.cmd` files first on Windows
- `delegateToLocalCLI()` - Checks `.cmd` files first on Windows
- Early pip engine detection - Updated for Windows compatibility

## Bug Fixes

- **Fixed:** "rapidkit is not recognized" error on Windows PowerShell
- **Fixed:** CLI delegation to local project scripts on Windows
- **Fixed:** Cross-platform script detection in project directories

## Usage

### Windows Users

After creating a project:
```powershell
npx rapidkit my-api --template fastapi
cd my-api
rapidkit init    # ✅ Works! (no .\ prefix needed)
rapidkit dev     # ✅ Start development server
rapidkit test    # ✅ Run tests
```

### Unix/macOS Users

No changes needed - existing bash scripts continue to work.

## Technical Details

### Files Added

**FastAPI Template:**
- `templates/kits/fastapi-standard/rapidkit.cmd.j2`

**NestJS Template:**
- `templates/kits/nestjs-standard/rapidkit.cmd.j2`
- `templates/kits/nestjs-standard/.rapidkit/rapidkit.cmd.j2`

### Code Changes

**src/index.ts:**
- Added `process.platform === 'win32'` checks
- Extended `localScriptCandidates` arrays to include `.cmd` files
- Windows-first detection order for better performance

## Upgrade

```bash
npm install -g rapidkit@0.12.7
# or
npx rapidkit@latest --version  # Should show 0.12.7
```

## Compatibility

- **Node.js:** 18.0.0+
- **Windows:** Windows 10/11 (PowerShell, CMD)
- **macOS:** 10.15+
- **Linux:** All major distributions
