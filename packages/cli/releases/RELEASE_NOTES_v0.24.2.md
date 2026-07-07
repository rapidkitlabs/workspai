# Release Notes — v0.24.2

**Release date:** 2026-02-25  
**Type:** Patch

## Summary

v0.24.2 finalizes workspace-based documentation and adds docs governance automation so release-facing docs stay aligned with actual CLI behavior and CI workflow ownership.

## Added

- Docs governance scripts:
  - `scripts/check-markdown-links.mjs`
  - `scripts/docs-drift-guard.mjs`
  - `scripts/smoke-readme-commands.mjs`
- Docs validation command bundle in npm scripts:
  - `check:markdown-links`
  - `check:docs-drift`
  - `smoke:readme`
  - `validate:docs`

## Changed

- Updated workspace architecture docs for current lifecycle and contracts:
  - `docs/SETUP.md`
  - `docs/doctor-command.md`
  - `docs/README.md`
  - `docs/OPEN_SOURCE_USER_SCENARIOS.md`
- CI docs validation integrated into Linux lane of:
  - `.github/workflows/ci.yml`
- Workspace CI ownership tuning:
  - `.github/workflows/workspace-e2e-matrix.yml` expanded for lifecycle/chaos confidence
  - `.github/workflows/e2e-smoke.yml` narrowed to focused bridge regression scope
- Runtime/setup contract alignment:
  - setup usage includes `--warm-deps`
  - node/go runtime adapters include setup cache warm hooks
  - doctor hints aligned to canonical `doctor workspace`

## Verification

Validated with:

```bash
npm run validate:docs
```

Result:
- markdown links ✅
- docs drift guard ✅
- docs examples validation ✅
- README command smoke ✅

## Upgrade

```bash
npm install -g rapidkit@0.24.2
```
