# Workspai CLI v0.43.1 Release Notes

Released: July 9, 2026

## Summary

Workspai CLI v0.43.1 is a patch release that tightens the monorepo package
surface after the first `workspai` and `wspai` publish, and hardens the Doctor
plus Workspace Intelligence repair chain before the first stable Workspai CLI
release.

The release adds a Workspai-native debug environment flag while preserving the
legacy RapidKit npm debug flag for existing local workflows. It also keeps the
private monorepo, canonical CLI package, and short alias package on the same
version. It also improves project-scope Doctor fix evidence, guarded Python
repair behavior, and Workspace Run diagnostics for Python wrapper failures.

## What's New

### Workspai-native debug flag

CLI argument and bridge diagnostics can now be enabled with:

```bash
WORKSPAI_DEBUG_ARGS=1 npx workspai --help
```

The legacy flag remains supported:

```bash
RAPIDKIT_NPM_DEBUG_ARGS=1 npx workspai --help
```

### Version alignment

The release keeps these versions aligned:

- `workspai-monorepo@0.43.1`
- `workspai@0.43.1`
- `wspai@0.43.1`
- `wspai` dependency on `workspai@0.43.1`

### Doctor repair evidence routing

Project-level Doctor fix runs now persist their fix result under the project
report directory:

```text
<project>/.workspai/reports/doctor-fix-result-last-run.json
```

Workspace-level Doctor fix evidence stays under:

```text
<workspace>/.workspai/reports/doctor-fix-result-last-run.json
```

This keeps Workspai Studio, CLI users, and agent consumers from confusing a
project repair attempt with workspace-level Doctor evidence.

### Guarded Python repair behavior

Python dependency sync repair is now guarded by default. Without explicit
dependency-install opt-in, Doctor emits deterministic guidance instead of
running package-manager installs automatically.

This keeps open-source and local repair flows safe while still giving Studio
and agents a clear next command to verify.

### Workspace Intelligence chain validation

The release was validated against both minimal and polyglot test workspaces
through the main Workspace Intelligence chain:

- `workspace sync`
- `workspace contract inspect`
- `workspace contract verify`
- `workspace model`
- `workspace context`
- `workspace agent-sync`
- `workspace graph`
- `workspace diff`
- `workspace impact`
- `workspace verify`
- `workspace trace`
- `workspace explain`
- `workspace run`
- `workspace share`
- `workspace export`
- `workspace feedback record`

The `wspai` alias was also verified against the same canonical Workspai CLI
surface.

### Workspace Run diagnostics

Python wrapper failures such as:

```text
No module named pytest
```

are now classified as setup failures instead of `unknown`, making Doctor,
Studio, and CI output more actionable.

## Breaking Changes

None.

## Verification

- `corepack npm --workspace workspai run typecheck`
- `corepack npm --workspace workspai run lint`
- `corepack npm --workspace workspai run format:check`
- `corepack npm --workspace workspai run build`
- `corepack npm --workspace workspai run smoke:enterprise-package`
- `corepack npm --workspace wspai run smoke`
- `corepack npm --workspace workspai run test -- src/__tests__/index.test.ts src/__tests__/package-publish-contract.test.ts`
- `corepack npm --workspace workspai run test`
- `corepack npm --workspace workspai run test -- src/__tests__/doctor.test.ts`
- `corepack npm --workspace workspai run test -- src/__tests__/doctor-canary-matrix.test.ts`
- `corepack npm --workspace workspai run test -- src/__tests__/workspace-run.test.ts`

## Install

```bash
npm install -g workspai@0.43.1
npx wspai --help
```
