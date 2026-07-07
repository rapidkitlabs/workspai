# Release Notes — v0.21.2

**Release date:** 2026-02-20  
**Type:** Patch

## Summary

v0.21.2 improves trust and publishability for rapidkit-npm maintainers and contributors by modernizing release automation, enforcing npm-only contributor workflow, and aligning security/support documentation with the active release line.

## Added

- NPM release shortcuts:
  - `npm run release:dry`
  - `npm run release:patch`
  - `npm run release:minor`
  - `npm run release:major`
- New package manager policy document:
  - `docs/PACKAGE_MANAGER_POLICY.md`

## Changed

- `scripts/release.sh` was redesigned:
  - Removed hardcoded version/tag/release-note references
  - Added semver bump args: `patch|minor|major|x.y.z`
  - Added safety/UX flags: `--no-publish`, `--yes`, `--allow-dirty`
  - Uses dynamic release tag from `package.json` version
- Contributor flow standardized to npm-only in docs and E2E scripts.

## Fixed

- Added preinstall guard to block non-npm package managers in this repo.
- Security policy wording aligned for current `0.x` support model.
- `release:dry` now supports local preflight on dirty trees while preserving strict checks for real publish flow.
- Doctor workspace scan now ignores common build artifact directories (`dist*`, `build*`) to prevent false-positive project detection.

## Upgrade

```bash
npm install -g rapidkit@0.21.2
```

## Verification

Recommended maintainer pre-publish checks:

```bash
npm run release:dry
npm run test:e2e
```
