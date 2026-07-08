# Workspai CLI v0.43.1 Release Notes

Released: July 8, 2026

## Summary

Workspai CLI v0.43.1 is a patch release that tightens the monorepo package
surface after the first `workspai` and `wspai` publish.

The release adds a Workspai-native debug environment flag while preserving the
legacy RapidKit npm debug flag for existing local workflows. It also keeps the
private monorepo, canonical CLI package, and short alias package on the same
version.

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

## Install

```bash
npm install -g workspai@0.43.1
npx wspai --help
```
