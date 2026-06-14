# Release Notes - v0.34.0

## v0.34.0 (June 14, 2026)

### CLI Governance Pipeline and Enterprise Release Gates

This release closes the npm-wrapper governance loop. Teams can now run workspace release checks end-to-end from the CLI — sync, doctor, analyze, readiness, and autopilot — with consistent evidence under `.rapidkit/reports/`, without requiring the VS Code extension for verify-pack artifacts.

## Highlights

- **`rapidkit pipeline`**
  - Orchestrates: `workspace sync` → `doctor workspace` → `analyze` → `readiness` → `autopilot release`.
  - Emits `pipeline-last-run.json` with per-stage status, duration, and blocking reasons.
  - Supports `--strict`, `--skip-verify`, `--skip-analyze`, and `--skip-autopilot`.

- **Doctor CI exit codes**
  - `--strict`: non-zero exit when health score reports errors or warnings.
  - `--ci`: exit `1` on errors, exit `2` on warnings (standard CI semantics).
  - `runDoctor()` returns numeric exit codes; `--quiet` suppresses JSON stdout for orchestrators.

- **Readiness gates (5-gate model)**
  - **env** — toolchain.lock pinned runtimes.
  - **doctor** — doctor-last-run evidence.
  - **analyze** — analyze-last-run verdict (new).
  - **verify** — extension verify-pack **or** CLI contract verify fallback (new).
  - **dependency** — vulnerability and deps-installed signals from doctor evidence.
  - `--skip-verify` for pipelines that verify elsewhere.

- **Bootstrap and workspace sync**
  - Successful bootstrap auto-syncs workspace registry and contract.
  - `bootstrap --json --compliance-only` runs compliance checks only (skips init).
  - `workspace sync --json` returns structured registry sync results.

- **Autopilot release**
  - New **analyze** stage between doctor and readiness.
  - Doctor subprocess uses `--ci` (audit/safe-fix) or `--strict` (enforce).
  - `skipPipelineStages` avoids duplicate doctor/analyze/readiness when called from pipeline.

- **Contracts and tests**
  - Added `contracts/pipeline-last-run.v1.json`.
  - Added doctor gate exit, readiness analyze/verify, and ownership matrix coverage.

## Upgrade

```bash
npm install -g rapidkit@0.34.0
```

Or run without a global install:

```bash
npx rapidkit@0.34.0 pipeline --json --strict
```

## Recommended CI Usage

```bash
# Full governance loop (recommended)
npx rapidkit pipeline --json --strict

# Or stage-by-stage
npx rapidkit bootstrap --json --compliance-only
npx rapidkit workspace sync --json
npx rapidkit doctor workspace --json --ci
npx rapidkit analyze --json --strict
npx rapidkit readiness --json --strict
npx rapidkit autopilot release --mode enforce --json
```

## Recommended Validation

```bash
npm run validate
```

Focused governance regression suite:

```bash
npm test -- \
  src/__tests__/doctor-gate-exit.test.ts \
  src/__tests__/readiness.test.ts \
  src/__tests__/autopilot-release.test.ts \
  src/__tests__/contracts/ownership-matrix.test.ts
```
