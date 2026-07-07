# Release Notes — v0.25.1

**Release date:** 2026-02-27  
**Type:** Patch

## Summary

v0.25.1 stabilizes Poetry-missing behavior by enforcing non-blocking auto-fallback to `venv`, hardens cross-platform tool detection in `doctor`, and closes the remaining legacy Windows workspace launcher gap.

## Added

- Windows workspace-local launcher generation:
  - `rapidkit.cmd` alongside `rapidkit`
- Cross-platform local-bin candidate helper updates:
  - `src/utils/platform-capabilities.ts`

## Changed

- **Poetry fallback behavior (create/register):**
  - Selecting Poetry no longer blocks when Poetry is absent.
  - Flow auto-falls back to `venv` and proceeds with workspace setup.
- **Doctor multi-platform probing:**
  - Added `python -m poetry` probing across Python candidates.
  - Added `python -m pipx` probing when `pipx` binary is unavailable.
  - Consolidated candidate path probing through platform capability utilities.
- **Legacy workspace UX parity:**
  - Workspace scaffolding now exposes a Windows-native local wrapper path (`.\rapidkit.cmd`).
- **Test alignment:**
  - Updated create-internal Poetry-flow tests to validate fallback semantics.
  - Preserved pipx-flow behavior contracts.

## Fixed

- Removed outdated test assumptions expecting Poetry/pipx install prompts during Poetry-missing fallback paths.
- Eliminated Unix-only hardcoded Python path assumptions in create-flow Python discovery.
- Closed Windows legacy workspace launcher parity gap.

## Verification

Validated with:

```bash
npm -C rapidkit-npm run typecheck
npm -C rapidkit-npm run test -- src/__tests__/doctor.test.ts
npm -C rapidkit-npm run test -- src/__tests__/create-internal.test.ts -t "Poetry Installation Flow"
npm -C rapidkit-npm run test -- src/__tests__/create-internal.test.ts -t "Pipx Installation Flow"
npm -C rapidkit-npm run test
```

Result:
- TypeScript typecheck ✅
- Doctor test suite ✅
- Targeted Poetry flow tests ✅
- Targeted pipx flow tests ✅
- Full test suite ✅

## Upgrade

```bash
npm install -g rapidkit@0.25.1
```
