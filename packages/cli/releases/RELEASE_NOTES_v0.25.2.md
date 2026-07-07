# Release Notes — v0.25.2

**Release date:** 2026-02-27  
**Type:** Patch

## Summary

v0.25.2 hardens command ownership between npm wrapper and Python core, upgrades `init` into a runtime-aware smart orchestrator (with robust fallbacks), and fixes Go lifecycle UX/delegation edge-cases.

## Added

- Explicit wrapper/core ownership contract for command routing:
  - Wrapper-orchestrated project command set now includes `init` as a first-class boundary.
  - Added command ownership contract doc:
    - `docs/contracts/COMMAND_OWNERSHIP_MATRIX.md`
- Forwarding-boundary regression assertions to keep `init` on wrapper path.

## Changed

- `rapidkit init` orchestration is now multi-strategy and runtime-aware:
  - Runtime inference via markers + file heuristics (`go.mod`, `package.json`, `pyproject.toml`, `requirements.txt`, `poetry.lock`).
  - Python init now enforces project-local `.venv` binding before dependency install.
  - Python init includes direct pip-based fallback paths for resilient dependency installation.
  - Node init includes package-manager fallback attempts based on tool availability.
- Delegation rules now keep Go/Node lifecycle paths on wrapper/runtime adapter execution where needed, preventing flag-misrouting regressions.

## Fixed

- Fixed Python project scenario where `init` could report success while no project-local `.venv` existed.
- Fixed Go lifecycle delegation issue that could route flags (e.g., `--port`) into unintended local launcher/make invocation.
- Fixed silent Go `init` failure when Go is missing by surfacing a clear actionable error message.

## Verification

Validated with:

```bash
npm -C rapidkit-npm run typecheck
npm -C rapidkit-npm run test -- src/__tests__/runtime-adapters.test.ts
npm -C rapidkit-npm run test -- src/__tests__/init-scenarios.integration.test.ts
npm -C rapidkit-npm run test -- src/__tests__/phase3-commands.test.ts src/__tests__/phase3-cli.integration.test.ts
npm -C rapidkit-npm run build
```

Additional real-scenario smoke checks:

- Empty folder `rapidkit init` still creates minimal workspace.
- Python project `init` now creates/uses project-local `.venv`.
- Go project without Go installed now prints explicit missing-toolchain message for `init` / `dev`.

## Upgrade

```bash
npm install -g rapidkit@0.25.2
```
