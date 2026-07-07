# RapidKit v0.38.0 Release Notes

**Release Date:** June 21, 2026

## Overview

RapidKit v0.38.0 introduces the Create Planner capability contract: the shared
decision layer that tells the CLI, CI, VS Code, and AI surfaces which stacks can
be created natively, which ecosystems should use an external create-then-adopt
flow, and which projects should enter Workspace Intelligence through adopt-only
governance.

This keeps RapidKit dynamic and polyglot without letting AI planners invent
unsupported native scaffolds. The product rule is now explicit:

- If RapidKit owns the scaffold contract, use `native-create`.
- If the ecosystem has a stable external generator but RapidKit does not own the
  post-create contract yet, use `external-create-adopt`.
- If the project already exists or native create is not supported, use
  `adopt-only`.

## What Changed

### Create Planner Capability Contract

Added:

```text
contracts/create-planner-capabilities.v1.json
```

The contract defines:

- `native-create` lanes for RapidKit-owned backend and frontend scaffold kits.
- `external-create-adopt` planned lanes for WordPress, Laravel, Symfony, and
  Rails.
- `adopt-only` lanes for runtimes such as PHP, Ruby, Rust, Elixir, Clojure,
  Scala, and Kotlin.

The same capability summary is also exposed through:

```text
contracts/runtime-command-surface.v1.json
```

so downstream consumers can read the broader runtime command surface and the
create planner rules from one generated contract family.

### CLI Guardrails

`rapidkit create project` now checks the create planner before delegating to the
native scaffolder.

This prevents requests such as WordPress, Laravel, or generic PHP from falling
through to an unrelated RapidKit kit. Instead, RapidKit returns explicit
guidance for external-create-adopt or adopt-only governance.

### Workspace Intelligence Propagation

Workspace model and workspace context project summaries now include
`createCapability`.

That gives humans, CI, IDEs, and AI agents a stable way to answer:

- Was this project created by a RapidKit native kit?
- Is this an external ecosystem planned for create-then-adopt?
- Should this project be governed through adopt/import only?

### Contract Generation and Parity

The shared contract generation flow now writes and checks
`create-planner-capabilities.v1.json`.

Parity sync includes the new contract so VS Code and monorepo consumers can stay
aligned with the npm package source of truth.

### Documentation

Added:

```text
docs/create-planner-capabilities.md
```

Updated:

- `docs/README.md`
- `docs/contracts/README.md`
- `docs/contracts/ARTIFACT_CATALOG.md`

## Why This Matters

Workspace Intelligence must be dynamic, but not vague.

RapidKit should support polyglot workspaces, external ecosystems, and existing
projects without pretending every stack is a native scaffold. This release makes
that boundary explicit and machine-readable.

AI agents can now plan against the same contract the CLI uses. That means fewer
wrong stack guesses, fewer accidental scaffold mismatches, and a cleaner path
from project creation to governed workspace intelligence.

## Breaking Changes

None.

This release adds new contracts and stricter unsupported-native-create
guardrails, but it does not remove existing native RapidKit scaffold support.

## Upgrade

```bash
npm install -g rapidkit@0.38.0
```

Or within a project:

```bash
npm install --save-dev rapidkit@0.38.0
```

## Verification

Validated with:

```bash
./node_modules/.bin/vitest run src/__tests__/create-planner-capabilities.test.ts src/__tests__/handle-create-flags.test.ts src/__tests__/contracts/generated-contracts.test.ts src/__tests__/contracts/npm-contracts-parity.test.ts src/__tests__/workspace-model.test.ts src/__tests__/workspace-context.test.ts
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/prettier --check src/utils/create-planner-capabilities.ts src/contracts/create-planner-capabilities-contract.ts src/contracts/runtime-command-surface-contract.ts src/workspace-model.ts src/workspace-context.ts src/__tests__/create-planner-capabilities.test.ts src/__tests__/handle-create-flags.test.ts src/__tests__/contracts/generated-contracts.test.ts src/__tests__/contracts/npm-contracts-parity.test.ts src/__tests__/workspace-model.test.ts src/__tests__/workspace-context.test.ts docs/create-planner-capabilities.md docs/contracts/README.md docs/contracts/ARTIFACT_CATALOG.md
```

Full-suite note: targeted contract, CLI guardrail, workspace model, workspace
context, typecheck, and formatting validations passed locally. Run the full
package quality gate in CI or a developer shell before publishing.
