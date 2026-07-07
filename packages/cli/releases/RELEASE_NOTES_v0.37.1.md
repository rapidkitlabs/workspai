# RapidKit v0.37.1 Release Notes

**Release Date:** June 19, 2026

## Overview

RapidKit v0.37.1 is a patch release focused on Workspace Intelligence stability,
verification correctness, and npm package presentation. It hardens the existing
enterprise evidence loop without introducing breaking changes.

The main theme is simple: verification evidence must be project-specific,
fresh, and consumable by humans, CI, IDEs, and AI agents from the same
workspace source of truth.

## What's Improved

### Workspace Verify Evidence Correctness

`workspace verify` now validates project-scoped workspace run evidence against
the affected project before treating a verification step as passing.

Evidence is matched by:

- Project name
- Project relative path
- Project path

This prevents a passing `workspace-run-last.json` entry for one project from
satisfying a required verification gate for a different affected project.

### Freshness-Aware Verification Gates

`workspace verify` now treats evidence generated before the current impact
report as stale. Required stale evidence is blocking.

This protects CI and agent workflows from reusing an old passing test/build
artifact after a newer workspace impact was produced.

### Agent and IDE Alignment

Workspace agent context packs now include:

```bash
npx rapidkit workspace verify --json
```

as a safe command. This gives AI agents and IDE surfaces a direct path to the
official evidence gate before making release, apply, rollback, or remediation
recommendations.

### npm README and Package Surface

The npm README now uses a raw GitHub image URL for the "From Code to Shared
Understanding" visual so it can render on npm. The Mermaid source remains
available in internal documentation for GitHub readers and maintainers.

The npm package now publishes the full `docs/` directory so README-linked docs
and image assets are included in the package artifact.

### Package Metadata

The package description now aligns with RapidKit's Workspace Intelligence
positioning:

> Open-source workspace intelligence CLI for software systems: create, adopt,
> govern, verify, and align polyglot workspaces for humans, CI, IDEs, and AI
> agents.

## Test Coverage

This release adds regression coverage for:

- Project-specific workspace run evidence matching
- Stale evidence blocking in `workspace verify`
- Agent context safe command parity
- README raw GitHub image asset publishing
- README-linked docs inclusion in npm package files
- Child CLI process test isolation from Vitest environment variables

## Breaking Changes

None. This is a backward-compatible patch release.

## Upgrade

```bash
npm install -g rapidkit@0.37.1
```

Or within a project:

```bash
npm install --save-dev rapidkit@0.37.1
```

## Verification

Validated with:

```bash
node node_modules/vitest/vitest.mjs run src/__tests__/workspace-context.test.ts src/__tests__/workspace-verify.test.ts src/__tests__/workspace-intelligence.test.ts src/__tests__/workspace-intelligence-cli-chain.test.ts src/__tests__/contracts src/__tests__/package-publish-contract.test.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src --ext .ts
node scripts/check-markdown-links.mjs
node scripts/docs-drift-guard.mjs
node node_modules/tsup/dist/cli-default.js
node scripts/verify-package-cli.mjs
node scripts/smoke-readme-commands.mjs
```

Full-suite note: the local Codex sandbox blocks some nested child-process and
localhost listener scenarios (`EPERM`). Those tests should be run in CI or a
developer shell with npm and localhost permissions before publishing.
