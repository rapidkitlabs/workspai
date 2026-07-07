# Release Notes - v0.36.0

## v0.36.0 (June 16, 2026)

### Empty-Workspace Evidence Parity and Governance Hardening

This release closes gaps between RapidKit CLI evidence and Workspai dashboard cards: empty workspaces remain governable, autopilot and workspace-run reports use stable filenames, and intelligence/mirror payloads include the metadata extensions expect.

## Highlights

- **Autopilot evidence parity**
  - Canonical last-run report: `.rapidkit/reports/autopilot-release-last-run.json`.
  - Dashboard-compatible alias: `.rapidkit/reports/autopilot-release.json` (same payload).
  - `enterpriseControls` documents both paths for CI and IDE consumers.

- **Workspace run evidence**
  - `workspace-run-last.json` includes `enterpriseControls.evidencePath`.
  - `--strict` no longer fails when gates are explicitly skipped (e.g. `enforceGates: false`).
  - Enforced readiness/doctor `warn` gates still fail under `--strict`.

- **Empty-workspace analyze**
  - `workspace.projects.missing` is a warning for all profiles when `projectCount === 0`.
  - Verdict `needs-attention` instead of `blocked` so readiness/pipeline can proceed with warn semantics.
  - Next actions prioritize create/import project inside an existing workspace.

- **Workspace intelligence**
  - Impact risk softens to `low` for bootstrap-only git/validation noise when no projects exist (any profile).
  - `buildWorkspaceImpact` correctly handles `fromPath: git` and forwards `gitObservation`.

- **Bootstrap metadata**
  - `workspace.json` may include `profile_requested` and `bootstrap_note` after Python-free profile fallback during create.

- **Mirror ops**
  - Sync/verify/rotate JSON reports include `mirror.configExists`, `mirror.lockExists`, and `mirror.artifactsCount`.

## Upgrade

```bash
npm install -g rapidkit@0.36.0
```

Or run without a global install:

```bash
npx rapidkit@0.36.0 analyze --json
npx rapidkit@0.36.0 autopilot release --mode audit --json
npx rapidkit@0.36.0 workspace run test --json
```

## Recommended Validation

```bash
npm run quality
```

Focused regression suite:

```bash
npm test -- \
  src/__tests__/analyze.test.ts \
  src/__tests__/autopilot-release.test.ts \
  src/__tests__/readiness.test.ts \
  src/__tests__/workspace-intelligence.test.ts \
  src/__tests__/workspace-run.test.ts \
  src/__tests__/workspace-manifest-bootstrap.test.ts \
  src/__tests__/phase3-commands.test.ts
```

## Workspai pairing

Install matching Workspai / `rapidkit-vscode` extension build that reads `autopilot-release-last-run.json`, `workspace-run-last.json`, and toolchain setup cards. Re-run `analyze` and `readiness` in existing workspaces to refresh stale evidence from prior CLI versions.
