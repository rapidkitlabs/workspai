# Workspai CLI v0.46.0

Released July 18, 2026.

## Contract-backed unified Workspace Intelligence runner

Workspai now provides `workspace intelligence run` as the unified, governed
execution surface for the mandatory Workspace Intelligence lifecycle. The
runner follows the canonical stage order and emits a versioned report that is
validated semantically as well as structurally, so CI systems, IDEs, portals,
and agents consume the same execution evidence.

The governed lifecycle covers sync, model, contract verification, doctor,
analyze, readiness, snapshot, diff, impact, verify, context, agent sync, watch,
explain, trace, and remediation planning. Every executed stage reports its
status, command, duration, artifacts, and failure evidence without hiding
blocking outcomes behind a successful aggregate result.

## Enterprise lifecycle integrity

- Added the `workspai-workspace-intelligence-run-v1` report contract and linked
  it through the runtime registry, published catalog, artifact registry, and
  producer-command inventory.
- Added transactional rollback for create, adopt, import, register, and mirror
  operations so partial failures do not leave misleading workspace state.
- Hardened project metadata path safety, registry consistency, archive flows,
  and mirror lifecycle behavior.
- Added real frontend project execution coverage and strengthened Node, Go,
  Java, and .NET generator/runtime adapter behavior.
- Hardened Python-engine discovery and metadata propagation. Python 3.10 remains
  the minimum supported version; newer installed interpreters can be detected,
  while explicit version pins remain available for reproducible CI.

## Documentation and contract alignment

CLI help, README material, command references, workspace operations, CI
workflows, agent-grounding guidance, artifact catalogs, runtime support
matrices, and generated shared contracts now describe the same mandatory
Workspace Intelligence lifecycle. Configuration examples no longer impose an
accidental Python version pin when automatic interpreter selection is desired.

## Verification

- Monorepo checks, CLI contracts, generated/shared contract drift, and docs
  validation are included in the release gates.
- Unified runner contract and CLI-chain tests cover ordering, report semantics,
  artifacts, blocking failures, and agent-oriented JSON output.
- Lifecycle transaction, frontend execution, Python-engine state, workspace
  registry, archive, mirror, and package-publish suites cover the surrounding
  operational paths.

## Upgrade

```bash
npm install -g workspai@0.46.0
workspai --version
workspai workspace intelligence run --for-agent codex --json
```

There are no breaking changes in this release.
