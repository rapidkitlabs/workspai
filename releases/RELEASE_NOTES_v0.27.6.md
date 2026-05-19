# Release Notes

## v0.27.6 (May 19, 2026)

### Stabilization Hardening, Unified Config Security, and Doctor Remediation Plan/Apply

Summary:
- This patch release focuses on stabilization-first hardening across config security, workspace discovery consistency, timeout policy centralization, and doctor remediation workflows.
- Scope prioritized deterministic enterprise behavior and operational safety over feature surface expansion.

Highlights:
- Doctor remediation planning and apply workflows:
  - Added plan-only support:
    - `npx rapidkit doctor workspace --plan`
    - `npx rapidkit doctor project --plan`
  - Added non-interactive apply support:
    - `npx rapidkit doctor workspace --apply`
    - `npx rapidkit doctor project --apply`
  - Added flag safety guard to prevent invalid combinations (`--plan` with `--fix`/`--apply`).
- Config and key material hardening:
  - Unified AI/user config handling on `.rapidkitrc.json`.
  - Added legacy fallback compatibility from prior AI config location.
  - Hardened config file writes with restrictive permissions on Unix-like platforms.
- Workspace behavior consistency:
  - Added shared workspace project discovery utility and adopted it in:
    - `workspace run`
    - `workspace share`
- Timeout policy consolidation:
  - Added centralized timeout helpers for probe/network/bridge paths.
  - Replaced scattered timeout literals in update checker and bridge execution paths.
- Reliability fixes:
  - Fixed doctor fix-flow compile regression on Go toolchain availability variable scope.

Validation:
- `npm run typecheck` passed.
- `npm run test -- doctor` passed (including new `--plan` and `--apply` tests).
- Full test suite passed:
  - `60 passed | 4 skipped` test files
  - `1081 passed | 11 skipped` tests

Release posture: stabilization-first
