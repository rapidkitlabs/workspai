# Release Notes — v0.25.0

**Release date:** 2026-02-26  
**Type:** Minor

## Summary

v0.25.0 unifies root help behavior across entry modes, completes workspace command contract coverage (`workspace list` and policy flows) across docs/tests/help surfaces, and strengthens runtime/workspace reliability for production usage.

## Added

- Extended workspace contract coverage for:
  - `npx rapidkit workspace list`
  - `npx rapidkit workspace policy show`
  - `npx rapidkit workspace policy set <key> <value>`
- Expanded process-level integration and command contract tests for workspace list/policy and lifecycle policies.
- Deterministic dist-refresh behavior in CLI entry process tests when `dist/index.js` is missing or stale.
- New platform capability utility module:
  - `src/utils/platform-capabilities.ts`

## Changed

- Unified root help output across:
  - `rapidkit`
  - `rapidkit --help`
  - `rapidkit help`
- Updated command/docs alignment for workspace-first operations in:
  - `README.md`
  - `docs/README.md`
  - `docs/SETUP.md`
  - `docs/doctor-command.md`
  - `docs/OPEN_SOURCE_USER_SCENARIOS.md`
  - `docs/ENTERPRISE_GOVERNANCE_RUNBOOK.md`
  - `docs/config-file-guide.md`
  - `docs/policies.workspace.example.yml`
- Runtime adapter and bridge integration paths updated for stronger workspace-aware behavior:
  - `src/runtime-adapters/python.ts`
  - `src/runtime-adapters/node.ts`
  - `src/runtime-adapters/go.ts`
  - `src/core-bridge/pythonRapidkit.ts`
  - `src/core-bridge/pythonRapidkitExec.ts`

## Fixed

- Reduced instability in process-level CLI tests caused by missing build artifacts.
- Reduced noisy workspace registration/debug output and improved registry hygiene handling.

## Verification

Validated with:

```bash
npm run test
npm run validate:docs
```

Result:
- test suite ✅ (903 total, no failures)
- markdown links ✅
- docs drift guard ✅
- docs examples validation ✅
- README command smoke ✅

## Upgrade

```bash
npm install -g rapidkit@0.25.0
```
