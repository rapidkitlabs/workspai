# Release Notes — v0.23.0

**Release date:** 2026-02-22  
**Type:** Minor

## Summary

v0.23.0 finalizes the workspace architecture rollout (Phase 1→4) in `rapidkit-npm` and fixes a package publish/install regression that caused global npm installs to fail in some environments.

## Added

- Workspace foundation artifacts in create/register flows:
  - `.rapidkit/workspace.json`
  - `.rapidkit/toolchain.lock`
  - `.rapidkit/policies.yml`
  - `.rapidkit/cache-config.yml`
- Runtime adapter layer and contract for:
  - Python
  - Node
  - Go
- New command-contract test suites:
  - `phase3-commands.test.ts`
  - `phase3-commands.integration.test.ts`
  - `phase3-cli.integration.test.ts`
  - `init-scenarios.integration.test.ts`
  - `runtime-adapters.test.ts`
- Blueprint/release handoff docs:
  - `docs/RELEASE_HANDOFF_PHASE4.md`
  - `docs/BLUEPRINT_CONFORMANCE_PHASE4.md`

## Changed

- Added npm-wrapper command contracts:
  - `rapidkit bootstrap`
  - `rapidkit setup <python|node|go>`
  - `rapidkit cache <status|clear|prune|repair>`
- Updated forwarding boundaries so `bootstrap/setup/cache` remain wrapper-local and are not forwarded to core.
- Extended runtime-aware dispatch (`init/dev/test/build/start`) with feature-flagged adapter routing (`RAPIDKIT_ENABLE_RUNTIME_ADAPTERS=1`).
- Added dedicated CI gate (`phase4-runtime-contracts`) for adapter/contract/init non-regression suites.

## Fixed

- Fixed npm global install failure by publishing `scripts/enforce-package-manager.cjs` with the package, preventing `preinstall` `MODULE_NOT_FOUND` failures.
- Added workspace-root `init` protection against wrong local script delegation in wrapper flow.

## Upgrade

```bash
npm install -g rapidkit@0.23.0
```

## Verification

Recommended maintainer checks:

```bash
npm run test -- src/__tests__/init-scenarios.integration.test.ts
RAPIDKIT_ENABLE_RUNTIME_ADAPTERS=1 npm run test -- src/__tests__/phase3-commands.test.ts src/__tests__/phase3-commands.integration.test.ts src/__tests__/phase3-cli.integration.test.ts src/__tests__/runtime-adapters.test.ts
npm run typecheck
npm pack --dry-run
```
