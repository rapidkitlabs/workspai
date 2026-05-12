# Release Notes v0.27.4

**Release Date:** 2026-05-11
**Type:** Patch

## Summary

This patch introduces workspace import flows in the npm wrapper, hardens shared import-stack parity contract enforcement, and strengthens doctor/readiness evidence schema compatibility behavior for safer CI and automation.

## Highlights

- Added workspace import command support:
  - `npx rapidkit import <path|git-url> [--workspace <path>] [--name <project-name>] [--git] [--json]`
  - Local-folder copy and git clone import paths.
  - Rollback-safe cleanup when post-import workspace sync fails.
  - Deterministic JSON output with workspace resolution details and suggested next-step `cd` command.

- Added shared parity contract hardening and CI gate:
  - `src/__tests__/contracts/import-stack-parity.snapshot.test.ts`
  - Strict schema pinning: `backend-import-stack-parity-v1`
  - Bidirectional key-set parity checks for framework/runtime mappings.
  - Resilient shared snapshot path lookup with optional env override:
    - `RAPIDKIT_BACKEND_IMPORT_PARITY_SNAPSHOT`
  - CI now runs `npm run test:parity-contract` as a dedicated contract gate.

- Added shared backend framework contract utilities and coverage:
  - `src/utils/backend-framework-contract.ts`
  - `src/__tests__/backend-framework-contract.test.ts`

- Hardened doctor/readiness/workspace-share schema compatibility:
  - Unknown/incompatible doctor evidence schemas are safely treated as invalid evidence.
  - Legacy evidence payloads (without schema tags) remain accepted for backward compatibility.

- Expanded canonical metadata in doctor JSON outputs:
  - `frameworkKey`
  - `importStack`

## User Impact

### Workspace Operators

You can now import existing backend codebases into RapidKit workspaces with deterministic rollback behavior and machine-readable output for automation.

### CI and Release Automation

Shared import-stack contract drift is now fail-fast in CI through schema/key-set checks and dedicated parity contract test gates.

### Doctor/Readiness Consumers

Evidence parsing is now safer against unknown schema versions while preserving compatibility for older generated reports.

## Upgrade

```bash
npm install -g rapidkit@0.27.4
```
