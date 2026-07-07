# Release Notes - v0.12.5

**Release Date:** December 6, 2025

## 🔧 CI/CD Infrastructure Fixes

This release focuses on fixing cross-platform build compatibility in GitHub Actions.

## What's Fixed

### CI/CD Cross-Platform Compatibility
- **npm optional dependency bug** — Fixed the persistent issue where npm fails to install platform-specific rollup binaries on macOS and Windows CI runners
- **Platform-specific binaries** — Now explicitly installs:
  - `@rollup/rollup-darwin-arm64` on macOS
  - `@rollup/rollup-win32-x64-msvc` on Windows
- **Cross-platform scripts** — Added explicit `shell: bash` for GitHub Actions steps
- **Node.js 20 only** — Removed Node.js 18 from test matrix since vitest 4.0.15+ requires `node:inspector/promises` module (Node 19+)

## Technical Details

The npm bug ([npm/cli#4828](https://github.com/npm/cli/issues/4828)) prevents optional dependencies from being installed correctly on different platforms. Our workaround installs the required platform-specific rollup binaries after `npm ci`.

## Upgrade

```bash
# Check version
npx rapidkit@0.12.5 --version

# Or update globally
npm install -g rapidkit@latest
```

## Full Changelog

See [CHANGELOG.md](../CHANGELOG.md) for complete history.
