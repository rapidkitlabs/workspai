# RapidKit v0.41.5 Release Notes

**Release Date:** July 4, 2026

## Overview

RapidKit v0.41.5 is a stability patch for workspace creation, Doctor workspace
discovery, and Workspace Verify gate semantics. It keeps the Workspai and CLI
flows aligned when users create workspaces outside the managed home, inspect
empty workspace shells, or rely on non-strict verification exit codes.

## What Changed

### Workspace creation target handling

`create workspace` now scopes duplicate-name checks to the selected target
parent when the user explicitly chooses a location.

Supported custom-location paths:

```bash
rapidkit create workspace my-workspace --here
rapidkit create workspace my-workspace --output /path/to/parent
```

Interactive `Current directory` selection uses the same behavior.

This means a workspace named `my-workspace` in the managed home no longer blocks
creating another `my-workspace` in an explicit custom parent. RapidKit still
blocks creation when the actual target directory already exists.

### Doctor empty workspace shell handling

`doctor workspace` no longer promotes an empty workspace shell into a project
only because root-level toolchain files exist. This prevents newly created
workspace roots from being reported as Python projects when they only contain
workspace governance and setup files.

Empty workspace shells now report:

- zero discovered projects
- a workspace project-discovery warning
- no misleading project-level health card for the workspace root itself

### Workspace Verify gate exit codes

Workspace Verify default mode now treats `needs-attention` as a passing gate
with exit code `0`. Strict mode remains strict: non-ready verification still
fails as expected.

## Breaking Changes

None.

## Upgrade

```bash
npm install -g rapidkit@0.41.5
```

Or without global install:

```bash
npx rapidkit@0.41.5 --version --json
```

## Verification

```bash
npm exec -- vitest run src/__tests__/workspace-create-location.test.ts
npm run typecheck -- --pretty false
npm run build
```
