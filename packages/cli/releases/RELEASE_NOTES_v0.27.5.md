# Release Notes v0.27.5

**Release Date:** 2026-05-15
**Type:** Patch

## Summary

This patch focuses on enterprise-grade stabilization across workspace bootstrap and diagnostics. It adds version-aware global RapidKit Core reuse logic, improves doctor guidance for optional workspace-local installs, and introduces live progress visibility for workspace fleet init runs.

## Highlights

- Added version-aware global RapidKit Core reuse in create flows:
  - Reuse of global installs is now gated by compatibility checks against required package constraints.
  - Incompatible/missing constraint cases now produce actionable warnings and safe fallback behavior.

- Improved doctor workspace guidance for global-only Core setups:
  - When RapidKit Core is globally available but not installed in workspace `.venv`, doctor keeps status `ok`.
  - Doctor now shows explicit optional advisory guidance to run:
    - `npx rapidkit workspace run init`

- Added live progress visibility for `workspace run init`:
  - Non-JSON runs now display start banner, per-project start lines, and completion lines with percentage and duration.
  - Eliminates "silent wait" during long bootstrap/install phases.

- Extended regression coverage:
  - Added doctor regression coverage for global-only Core + optional workspace `.venv` advisory behavior.
  - Preserved workspace-run and doctor contract behavior under existing test suites.

## User Impact

### Workspace Operators

You get clearer diagnostics for global-vs-workspace RapidKit Core installation modes, with explicit optional guidance rather than hard warnings.

### Bootstrap UX

`npx rapidkit workspace run init` now provides continuous execution visibility, making long-running initialization easier to monitor in terminals and CI logs.

### Stability and Safety

Global RapidKit Core reuse is now safer and deterministic due to version-compatibility checks before reuse.

## Upgrade

```bash
npm install -g rapidkit@0.27.5
```
