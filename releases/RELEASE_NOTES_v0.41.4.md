# RapidKit v0.41.4 Release Notes

**Release Date:** July 3, 2026

## Overview

RapidKit v0.41.4 adds a workspace-level artifact remediation plan for Workspai Studio,
IDE dashboards, and agent consumers. Where `doctor-remediation-plan.v1` covers
Doctor-specific repair steps, this release introduces a cross-card plan that reads
blocked governance artifacts and returns one ordered Studio handoff instead of
forcing consumers to infer repair logic card by card.

## What Changed

### `workspace remediation-plan`

New Workspace Intelligence command:

```bash
rapidkit workspace remediation-plan --json --write
rapidkit workspace remediation-plan --ci --json --write
```

The command scans `.rapidkit/reports/` and builds an ordered action list for blocked
governance cards, including:

- Bootstrap compliance
- Doctor workspace evidence
- Analyze
- Readiness
- Pipeline
- Workspace Run
- Workspace Verify

Each action carries scope, phase, risk (`safe` / `guarded` / `invasive`), approval
state, verify command, optional deterministic file operation, and rollback strategy.

Use `--ci` when CI-oriented verify commands are preferred over local refresh paths.

### `artifact-remediation-plan.v1`

New contract: `contracts/artifact-remediation-plan.v1.json`

Persisted artifact:

`.rapidkit/reports/artifact-remediation-plan-last-run.json`

This is the npm source-of-truth handoff for Studio repair flows that span multiple
dashboard cards. Consumers should request this plan before inventing per-card repair
logic.

### Published Surface Updates

The release wires the new artifact through:

- `runtime-command-surface.v1` — publishes `remediation-plan`
- `extension-cli-compatibility.v1` — maps `artifactRemediationPlan`
- `agent-customization-pack.v1` — includes the report path in agent packs
- `workspace-model` evidence refs — exposes `artifactRemediationPlan`
- `workspace agent-sync` catalog — advertises the report to IDE/agent consumers
- operational skills — directs agents to read the cross-artifact plan first

Documentation updates:

- `README.md` quick-reference and artifact table
- `docs/commands-reference.md`
- `docs/contracts/ARTIFACT_CATALOG.md`

## Breaking Changes

None.

## Upgrade

```bash
npm install -g rapidkit@0.41.4
```

Or without global install:

```bash
npx rapidkit@0.41.4 --version --json
```

## Verification

```bash
npm run typecheck
npm run validate:contracts
npm test
npm run smoke:enterprise-package
npm run prepack
```
