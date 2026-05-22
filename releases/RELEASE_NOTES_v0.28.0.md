# Release Notes

## v0.28.0 (May 22, 2026)

### Autopilot Release Commander and Enterprise Gate Hardening

Summary:
- This minor release introduces a new top-level command, `autopilot release`, for end-to-end release gate orchestration.
- The flow composes stable existing contracts (`doctor`, `readiness`, `workspace run`) and enforces fail-closed behavior for CI.

Highlights:
- New release commander:
  - `npx rapidkit autopilot release --mode <audit|safe-fix|enforce> [--json] [--output <file>] [--since <ref>] [--parallel] [--max-workers <n>]`
- Deterministic enforce semantics:
  - Warning-grade gate states now produce explicit blocker reasons under enforce mode.
- Safe-fix post-apply revalidation:
  - After successful `--apply`, autopilot re-runs `doctor workspace --json` and `readiness --json`.
  - Final verdict reflects post-apply state rather than pre-fix assumptions.
- Execution error classification:
  - Process-level command crashes are tracked as execution errors with exit code `3`.
- Stable report contract:
  - Schema pinned to `autopilot-release-v1`.
  - Structured report artifact:
    - `.rapidkit/reports/autopilot-release-last-run.json`
  - Stage artifacts for workspace test/build:
    - `.rapidkit/reports/autopilot-workspace-run-test.json`
    - `.rapidkit/reports/autopilot-workspace-run-build.json`
- Regression coverage:
  - Added and expanded tests for autopilot orchestration and CLI entrypoint validation.

Validation:
- `npm run typecheck` passed.
- `npm test -- src/__tests__/autopilot-release.test.ts` passed.
- `npm test -- src/__tests__/index.test.ts` passed.

Release posture: feature + stabilization
