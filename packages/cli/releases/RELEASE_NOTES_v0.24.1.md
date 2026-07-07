# Release Notes — v0.24.1

**Release date:** 2026-02-25  
**Type:** Patch

## Summary

v0.24.1 stabilizes the setup/runtime contract, hardens cross-OS CI reliability for optional Rollup binaries, and aligns profile-first create flows with configured defaults.

## Fixed

- Restored setup contract behavior so `rapidkit setup <python|node|go>` works without requiring `RAPIDKIT_ENABLE_RUNTIME_ADAPTERS=1`.
- Added macOS arm64 Rollup optional dependency workaround in matrix CI to prevent install-time failures on platform-native runners:
  - `.github/workflows/workspace-e2e-matrix.yml`

## Changed

- Updated create prompt defaults to respect configured values for:
  - `pythonVersion`
  - `defaultInstallMethod`
- Python runtime adapter prereq checks now attempt `doctor check` first, then gracefully fall back to legacy `doctor`.
- Updated command/runtime/create tests to match current wrapper behavior and profile-first create flow.
- Added `.rapidkit/` to `.gitignore` to avoid accidental commits of local generated artifacts.

## Verification

Validated in local checks:

```bash
npm run test -- src/__tests__/phase3-commands.test.ts
bash ../../Tests/e2e-workspace-test.sh
```

Workspace E2E result: **181 passed / 0 failed**.

## Upgrade

```bash
npm install -g rapidkit@0.24.1
```
