# Release Notes - v0.32.1

## v0.32.1 (June 8, 2026)

### Runtime Command Surface Parity and Windows Go Launcher Hardening

This patch strengthens RapidKit npm as the stable workspace command surface. It adds a shared runtime command contract for parity checks across companion tooling, and it fixes generated Go project launchers on Windows so users do not need GNU Make for normal lifecycle commands.

## Highlights

- **Shared runtime command surface contract**
  - Added `contracts/runtime-command-surface.v1.json`.
  - Captures lifecycle commands, module mutation commands, global commands, scaffold kits, runtime tiers, and module marketplace boundaries.
  - Adds contract regression coverage for command surface drift.

- **Parity tooling hardening**
  - `sync-import-stack-parity-snapshot.mjs` now checks both import stack parity and runtime command surface parity.
  - This keeps the npm CLI and extension-facing command model aligned before release.

- **Windows Go launcher hardening**
  - Generated Go/Fiber and Go/Gin `rapidkit.cmd` launchers now use native Go commands for dev, build, test, format, and docs flows.
  - Windows users no longer need GNU Make to run generated Go project commands.
  - Added generator regression coverage for the Windows launcher contract.

## Upgrade

```bash
npm install -g rapidkit@0.32.1
```

## Recommended Validation

Before publishing:

```bash
npm run check:parity-snapshot
npm run typecheck
npm run lint
npm run build
npm publish --dry-run --access public
```
