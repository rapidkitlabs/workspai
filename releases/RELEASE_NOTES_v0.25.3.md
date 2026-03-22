# Release Notes — v0.25.3

**Release date:** 2026-03-22  
**Type:** Patch

## Summary

v0.25.3 improves `rapidkit doctor workspace` with repeat-run caching, machine-readable evidence output, and safer auto-fix behavior for Go projects when toolchains are missing.

## Added

- Workspace doctor project-scan cache with signature invalidation and reuse metadata:
  - `.rapidkit/reports/doctor-workspace-cache.json`
- Doctor evidence artifact written on each workspace health run:
  - `.rapidkit/reports/doctor-last-run.json`
- Extended workspace doctor regression coverage for:
  - cache reuse + evidence refresh behavior
  - Go toolchain-missing fix gating (`go mod tidy` skip)

## Changed

- Workspace doctor system checks now run in parallel for faster diagnostics.
- `rapidkit doctor workspace --fix` now performs post-fix verification and refreshes evidence automatically.
- CLI/docs messaging clarified for scope ownership:
  - `rapidkit doctor` = host/system check
  - `rapidkit doctor workspace` = full workspace/project health

## Fixed

- Fixed project fix-command parsing so project-scoped command detection (`cd <project> && ...`) is reliable.
- Fixed Go auto-fix behavior to skip `go mod tidy` when Go is not available instead of attempting execution and failing.
- URL-based fix commands are now consistently treated as manual guidance and never executed as shell commands.

## Verification

Validated with:

```bash
npm test -- --run src/__tests__/doctor.test.ts
```

Result: all doctor tests passed, including new regression for Go toolchain-missing skip path.

## Upgrade

```bash
npm install -g rapidkit@0.25.3
```
