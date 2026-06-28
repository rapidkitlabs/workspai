# RapidKit v0.41.2 Release Notes

**Release Date:** June 28, 2026

## Overview

RapidKit v0.41.2 is a patch release for the npm source-of-truth layer behind
Workspai, CI, and agent-facing Workspace Intelligence workflows.

It closes small but important enterprise gaps: the published runtime command
surface now advertises `workspace why` and `workspace trace`, Studio handoff
contracts carry structured incident metadata, package smoke is resilient in
read-only npm-cache environments, and README/docs now explain the product
category more clearly.

## What Changed

### Workspace Intelligence Command Surface

`runtime-command-surface.v1` now includes `why` and `trace` in
`workspaceIntelligenceSubcommands`.

This keeps IDEs, Workspai, CI, and agent tooling from under-detecting the
current Workspace Intelligence surface:

- `workspace explain`
- `workspace why`
- `workspace trace`

Contract tests now assert those commands remain part of the published
capability surface.

### Studio Incident Handoff Contract

`studio-blocker-handoff.v1` now includes additive `incidentSummary` metadata:

- incident title
- phase (`detect`, `diagnose`, `fix`, `verify`, `audit`)
- primary action
- verification requirement
- audit status

This gives Workspai Studio and agent handoff consumers a stable, structured
summary without scraping display text.

### Enterprise Package Smoke Hardening

`scripts/enterprise-package-smoke.mjs` is now more robust in CI and local
publish gates:

- Uses an isolated writable npm cache for `npm pack --dry-run --json`.
- Parses trailing JSON arrays from `npm pack` output even when npm lifecycle
  scripts write informational output before the JSON payload.

This prevents false package-smoke failures in read-only cache environments and
keeps publish validation focused on the actual npm artifact payload.

### README and Contract Documentation

The README now leads with clearer category positioning:

```text
Open-Source Workspace Intelligence for Software Systems
```

It also clarifies that RapidKit is not another AI coding assistant, agent
framework, or context engine. RapidKit is the workspace intelligence layer that
aligns humans, CI, IDEs, and AI agents around one evidence-backed workspace
truth.

The mental model now makes framework coverage explicit: Workspace Intelligence
applies to RapidKit-created projects, imported projects, adopted repositories,
frontend apps, backend apps, and polyglot workspaces. Generation depth may vary
by stack, but the governance, evidence, context, impact, and release-readiness
layer is workspace-wide.

Contract docs were also updated to include the current Workspace Intelligence
schemas and the canonical `.rapidkit/AGENT-GROUNDING.md` artifact path.

### Workspace Impact Quality

Workspace impact centrality and critical-path hotspot handling no longer rely
on non-null assertions. This keeps the graph-aware impact code lint-clean and
safer around additive graph metadata.

## Breaking Changes

None.

## Upgrade

```bash
npm install -g rapidkit@0.41.2
```

Or without global install:

```bash
npx rapidkit@0.41.2 --version --json
```

## Verification

```bash
npm run lint
npm run typecheck
npm run format:check
npm run validate:docs
npm run check:generated-contracts
npm run check:shared-contracts
npm test
npm run smoke:enterprise-package
npm run prepack
```

Verified full test suite: **1573 passed, 8 skipped**.
