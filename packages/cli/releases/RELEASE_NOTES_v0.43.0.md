# Workspai CLI v0.43.0 Release Notes

**Release Date:** July 7, 2026

## Overview

Workspai CLI v0.43.0 is the first release from the new Workspai monorepo package
layout. The canonical npm package remains `workspai`, and the release adds a
short alias package, `wspai`, for users who prefer compact `npx` workflows.

```bash
npx workspai --help
npx wspai --help
```

`wspai` is intentionally small: it delegates to the matching `workspai` version
instead of carrying a second CLI implementation.

## What Changed

### Workspai monorepo package layout

The CLI now lives under `packages/cli` inside the Workspai monorepo. This keeps
the repository ready for future package boundaries while publishing only the
stable npm surfaces that users need today.

Published packages for this release:

- `workspai`
- `wspai`

### Short alias package

The new `wspai` package provides:

```bash
npx wspai <command>
```

The alias package depends on the matching `workspai` version and forwards all
arguments to the canonical CLI entrypoint.

### Release safety

The release scripts and manual GitHub release workflow now verify:

- `workspai` and `wspai` versions match.
- `wspai` depends on the same `workspai` version.
- both package versions are available on npm before publish.
- both packages dry-run before production publish.

The unavailable `wai` alias path was removed so the product has one canonical
short npm alias: `wspai`.

## Compatibility

No breaking changes are introduced.

- Use `npx workspai ...` for the canonical CLI.
- Use `npx wspai ...` for the short alias.
- RapidKit Core remains the Python engine bridge behind Workspai workflows.

## Verification

- `corepack npm --workspace workspai test -- src/__tests__/package-publish-contract.test.ts`
- `corepack npm run smoke:alias-package`
- `node scripts/enterprise-package-smoke.mjs`
- `corepack npm publish --dry-run --access public --workspace wspai`
