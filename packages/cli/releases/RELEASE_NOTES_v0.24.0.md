# Release Notes — v0.24.0

**Release date:** 2026-02-25  
**Type:** Minor

## Summary

v0.24.0 strengthens cross-OS operational confidence (with a dedicated Windows-native bridge CI path), introduces a hardened mirror lifecycle foundation, and expands test/docs coverage for runtime adapter and workspace lifecycle scenarios.

## Added

- Windows-native bridge + workspace lifecycle workflow:
  - `.github/workflows/windows-bridge-e2e.yml`
- Cross-OS workspace lifecycle matrix workflow:
  - `.github/workflows/workspace-e2e-matrix.yml`
- Mirror lifecycle engine:
  - `src/utils/mirror.ts`
- New governance/scenario docs:
  - `docs/ENTERPRISE_GOVERNANCE_RUNBOOK.md`
  - `docs/OPEN_SOURCE_USER_SCENARIOS.md`
  - `docs/mirror-config.enterprise.example.json`
  - `docs/governance-policy.enterprise.example.json`
  - `docs/policies.workspace.example.yml`
- Docs examples validation script:
  - `scripts/validate-doc-examples.mjs`
- New mirror/scenario test suites:
  - `src/__tests__/mirror-lifecycle.unit.test.ts`
  - `src/__tests__/mirror-evidence-export.integration.test.ts`
  - `src/__tests__/mirror-sigstore-branches.test.ts`
  - `src/__tests__/user-level-scenarios.integration.test.ts`

## Changed

- Hardened runtime adapter execution behavior for Python/Node/Go paths.
- Improved bridge execution integration (`pythonRapidkitExec`) and adapter wiring.
- Expanded and aligned docs for setup, doctor, optimization, and utilities.

## Fixed

- Continued command/help/docs consistency updates for wrapper behavior and adapter expectations.

## Removed

- Removed obsolete phase handoff docs:
  - `docs/BLUEPRINT_CONFORMANCE_PHASE4.md`
  - `docs/RELEASE_HANDOFF_PHASE4.md`

## Verification

Recommended pre-ship checks:

```bash
npm run build
npm run validate:docs-examples
npx vitest run src/__tests__/index.test.ts src/__tests__/mirror-lifecycle.unit.test.ts
```

For Windows CI first run triage:

- `docs/WINDOWS_BRIDGE_FIRST_RUN_CHECKLIST.md`

## Upgrade

```bash
npm install -g rapidkit@0.24.0
```
