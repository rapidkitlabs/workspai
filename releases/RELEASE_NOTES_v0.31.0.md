# Release Notes - v0.31.0

## v0.31.0 (June 2, 2026)

### 🧭 Workspace Contract Registry, Portable Archives, and CLI Ownership Hardening

This release packages the workspace sharing, contract registry, and npm command ownership work delivered after `v0.30.0`. It is a minor release because it adds new user-facing CLI capabilities while also hardening install and execution behavior for global and `npx` users.

## Highlights

- **Portable workspace archive flow**
  - Export, inspect, verify, doctor, and hydrate workspace archives through the npm CLI.
  - Preserve workspace handoff metadata for reliable team sharing and Workspai extension import flows.
  - Harden archive hydration with destination containment checks and cross-platform path normalization.

- **Workspace Contract Registry**
  - Capture workspace topology as a canonical contract: services, ports, dependencies, events, and ownership.
  - Generate and verify contract graph data before sharing, packaging, or release.
  - Detect unsafe or malformed contract/archive state before it reaches another user.

- **CLI ownership hardening**
  - Keep npm-owned commands inside the npm wrapper instead of accidentally bridging into Python Core.
  - Improve behavior for Windows users where `rapidkit.exe` resolution order can pick the wrong executable.
  - Add package CLI verification and publish contract coverage for wrapper entrypoints.

## Notable Commits

- `ab73e40` fix(cli): keep npm-owned commands in wrapper
- `dbe441a` feat: add portable workspace archive flow
- `e71cca5` feat: harden workspace archive handoff
- `f7c1cfd` feat: add workspace contract registry
- `7b5ca1c` feat: harden workspace contracts and archives
- `ff52340` fix: harden workspace archive and contract validation
- `f1c9454` fix: harden archive hydrate path containment

## Upgrade

```bash
npm install -g rapidkit@0.31.0
```

## Recommended Validation

Before publishing:

```bash
npm run typecheck
npm run test
npm run build
npm run verify:package-cli
npm audit --audit-level=moderate
```
