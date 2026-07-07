# RapidKit v0.41.1 Release Notes

**Release Date:** June 28, 2026

## Overview

RapidKit v0.41.1 is an enterprise stability patch for the npm CLI release
surface. It focuses on package publish safety, extension-host execution
reliability, pipe-safe CLI output, and richer Workspace Intelligence graph
metadata for Workspai dashboard consumers.

This release does not introduce breaking CLI changes. It makes existing
workspace, scaffold, lifecycle, and package workflows safer in the environments
where RapidKit is most often embedded: VS Code extension hosts, CI runners,
`npx` execution, locally linked npm packages, and npm publish pipelines.

## What Changed

### Enterprise Package Smoke and Prepack Gates

`prepack` now runs the enterprise release gate before npm packaging:

```bash
node scripts/prepack-enterprise.mjs
```

The gate builds `dist`, prepares packaged mock embeddings, verifies npm-owned
CLI command ownership, and runs the enterprise package smoke:

```bash
node scripts/enterprise-package-smoke.mjs
```

The smoke verifies:

- npm pack payload policy.
- CLI contract surfaces and `--version --json`.
- npm-backed create scenarios.
- offline fallback create scenarios.
- publish-critical runtime assets included in `package.json#files`.

### Package Runner Hardening

RapidKit now resolves npm-family subprocesses through a command-safe invocation
contract instead of assuming `npm` or `npx` is directly available on PATH.

Resolution supports:

- npm/npx next to the active Node binary.
- `npm_execpath` from npm/npx parent processes.
- well-known npm CLI install locations.
- `corepack npm` fallback for npm execution.

Subprocess environments also strip inherited `npx --package` pins and set a
writable `COREPACK_HOME`, preventing nested generators and lifecycle commands
from accidentally resolving through the parent package execution context.

### Pipe-Safe CLI Output

The CLI entrypoint now writes piped stdout/stderr synchronously before fast
exits. This prevents spawned commands from returning status `0` while producing
empty captured output.

Covered surfaces include:

- `rapidkit --version --json`
- workspace policy commands
- cache/mirror/setup commands
- project lifecycle commands
- integration commands launched by Workspai and CI

### Workspace Run and Lifecycle Reliability

Workspace-root `rapidkit init` now aligns its fleet-run preflight with the same
npm-aware package runner behavior used by project lifecycle commands.

This fixes cases where child Node projects failed init because a raw `which npm`
preflight could not see npm even though npm was executable through Node,
`npm_execpath`, or Corepack.

### Workspace Dependency Graph Metadata

`workspace-dependency-graph.v1` now carries richer operational metadata for
enterprise dashboard and agent consumers:

- operational profile per node
- topology and density stats
- evidence coverage
- graph diagnostics
- hotspot and low-confidence indicators

These additions are additive and remain compatible with existing graph
consumers.

## Breaking Changes

None.

## Upgrade

```bash
npm install -g rapidkit@0.41.1
```

Or without global install:

```bash
npx rapidkit@0.41.1 --version --json
```

## Verification

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
node scripts/enterprise-package-smoke.mjs
node scripts/prepack-enterprise.mjs
```

Verified full test suite: **1573 passed, 8 skipped**.
