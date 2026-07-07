# RapidKit v0.41.0 Release Notes

**Release Date:** June 23, 2026

## Overview

RapidKit v0.41.0 closes **Phase 4 Workspace Intelligence**: operational
narratives (explain / why / trace), agent feedback history, read-mostly MCP
serve, operational skills, structured doctor-fix evidence, and tighter verify +
fleet-run gates — all backed by versioned contracts that Workspai, CI, and AI
agents can consume deterministically.

This release turns the intelligence chain from “model + impact + verify” into a
full **operational loop**: diagnose blockers in human language, record agent
outcomes, expose safe read tools over stdio MCP, and gate release on init/start
fleet evidence and doctor-fix closure when present.

## What Changed

### Explain, Why, and Trace

| Command | Purpose |
| ------- | ------- |
| `workspace explain <target>` | Unified narrative for release blockers, projects, or blockers |
| `workspace why <target>` | Alias of `explain` (same parser and artifact) |
| `workspace trace --from <diff>` | Diff → blast radius → gates narrative (`kind: trace`) |

Artifact: `.rapidkit/reports/workspace-explain-last-run.json`  
Contract: `contracts/workspace-intelligence/workspace-explain.v1.json`

Coexistence with `workspace graph explain <project>` is documented in
`docs/contracts/NAMING_AND_COEXISTENCE.md` — graph explain stays the topology
slice; unified explain composes reports and verification plans.

### MCP Serve (Read-Mostly)

```bash
npx rapidkit workspace mcp serve
```

Stdio JSON-RPC bridge over workspace evidence (model, INDEX, blockers, safe
commands, explain). Write/fix tools remain approval-gated per
`.rapidkit/reports/rapidkit-mcp-design.json`.

### Agent Feedback and Operational Skills

```bash
npx rapidkit workspace feedback record --json
```

Appends structured `agent-action` entries to
`.rapidkit/reports/workspace-intelligence-history.json`.

Operational playbooks (`.rapidkit/skills/rapidkit-*.md`) and
`workspace-skills-index.json` are produced by **`workspace agent-sync --write`**
— not a standalone generator command.

### Doctor Fix Result Contract

`doctor workspace --fix --json` now emits structured `fixResult`
(`rapidkit-doctor-fix-result-v1`) with `appliedFixes`, `remainingBlockers`, and
`verifyRecommended` — consumed by Workspai Studio fix loops and optional
`workspace verify` doctor-fix step.

### Workspace Verify Extensions

- Per-project **init** and **start** verification steps when `fleetStages`
  includes those stages (evidence from `workspace-run-last.json`).
- Optional **doctor-fix** step when `fixResult` is present in
  `doctor-last-run.json`.
- **Resolution hints** on blocking verify steps for IDE/CI remediation.

### Workspace Run Enterprise Controls

- **Custom stages** via `.rapidkit/context.json` `commands` (e.g. `lint`).
- **`--reuse-passed`** skips projects that already passed the stage in cached
  fleet evidence.
- **Stage dependencies** from framework registry metadata (requires prior stage
  evidence in `workspace-run-last.json`).

Documented in [docs/workspace-run.md](../docs/workspace-run.md).

### New and Updated Contracts

Published under `contracts/workspace-intelligence/` and advertised in
`contracts/extension-cli-compatibility.v1.json`:

- `workspace-explain.v1`
- `workspace-contract-verify.v1`
- `blocker-resolution.v1`
- `doctor-fix-result.v1`
- `studio-blocker-handoff.v1`
- `agent-action-outcome.v1`
- `workspace-skills-index.v1`
- `workspace-operational-skill.v1`

Run `npm run sync:shared-contracts` after upgrading npm so Workspai contract
mirrors stay aligned.

## Breaking Changes

None. New commands and contracts are additive; existing pipelines and artifacts
remain valid.

## Upgrade

```bash
npm install -g rapidkit@0.41.0
```

Or without global install:

```bash
npx rapidkit@0.41.0 workspace explain release-blocked --json --write
```

## Verification

```bash
npm run build
npx vitest run
npm run validate:contracts
```
