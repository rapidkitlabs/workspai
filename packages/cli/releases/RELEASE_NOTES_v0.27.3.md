# Release Notes v0.27.3

**Release Date:** 2026-05-09
**Type:** Patch

## Summary

This patch introduces project-scoped doctor diagnostics (`doctor project`), adds deterministic doctor evidence metadata for automation and audit consumers, lands workspace fleet-stage orchestration (`workspace run`), and cleans OSS-facing documentation from enterprise-internal path references.

## Highlights

- Added canonical project doctor scope:
  - `npx rapidkit doctor project`
  - Supports nested directory resolution to nearest parent project.
  - Supports JSON output and project-scoped `--fix`.

- Expanded doctor contract/evidence output with deterministic metadata:
  - `contract`
  - `scoreBreakdown`
  - `summary.scopeProvenance`
  - `driftDelta`

- Added workspace stage orchestrator + registry implementation and test coverage:
  - `src/workspace-run.ts`
  - `src/framework-registry.ts`
  - `src/__tests__/workspace-run.test.ts`

- Unified workspace-root init aliases into mirrored full-init behavior:
  - `npx rapidkit init`
  - `npx rapidkit workspace init`
  - `npx rapidkit workspace run init`

- Expanded workspace CLI surface for fleet execution controls:
  - `--affected`, `--blast-radius`, `--since`, `--parallel`, `--max-workers`, `--json`, `--strict`, `--no-gates`

- OSS docs cleanup:
  - Removed enterprise-internal path references from OSS README/doc index.
  - Removed duplicate `docs/ENTERPRISE_GOVERNANCE_RUNBOOK.md` from npm docs path.

## User Impact

### Doctor Consumers (CLI/CI/Extensions)

`doctor project --json` now emits richer deterministic metadata for scoped diagnostics and explainable scoring, enabling stronger CI policy checks and extension rendering consistency.

### Workspace Operators

Workspace root init aliases now behave consistently, and `workspace run` provides a controlled fleet execution surface for polyglot repos with affected-only and dependency-graph expansion support.

### OSS Documentation Readers

Open-source docs no longer reference internal filesystem-style enterprise paths and remain focused on publicly consumable documentation.

## Upgrade

```bash
npm install -g rapidkit@0.27.3
```
