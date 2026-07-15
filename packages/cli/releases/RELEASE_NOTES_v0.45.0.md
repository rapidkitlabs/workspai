# Workspai CLI v0.45.0

Released July 15, 2026.

## Contract-backed live command inventory

Workspai now derives a versioned runtime command inventory from the installed
Commander tree. `workspai commands --json` publishes the inventory alongside
command capabilities, while release checks compare it with the generated
snapshot and the declared npm/Core/manual command surfaces.

The inventory records command paths, parents, aliases, descriptions, visibility,
arguments, options, and registration kind. Runtime command documentation also
publishes canonical argv and, where required, stdin contracts, output media
modes, and process exit semantics. This closes the gap where a command could be
implemented but absent or semantically incomplete in contracts, documentation,
or downstream portal generation.

## Artifact producer ownership

The runtime command-surface contract now connects governed artifacts to their
schema version, JSON Schema path, and producer commands. This includes the core
Workspace Intelligence chain plus cache, registry, doctor, remediation,
pipeline, autopilot, workspace-run, agent-hook, infra, why, and trace outputs.
The Workspace Intelligence history descriptor names both verification and
`workspace feedback record --json` as producers.

## CLI and gate behavior

- `workspace --help` exposes every dispatcher action family.
- `workspace feedback record` documents its required stdin JSON contract and
  append-only intelligence-history output.
- Graph DOT and Mermaid modes are documented as raw renderer output.
- Contract verification, graph, watch, feedback, and MCP are classified as
  Workspace Intelligence capabilities for downstream consumers.
- Warning-only `pipeline` runs remain advisory unless `--strict` is supplied.
- Failed pipeline stages remain process-blocking in all modes.
- Concurrent test builds wait for the active dist build lock before evaluating
  output freshness.

## Verification evidence

- Live command integrity: 21 top-level roots, 24 scoped paths, no undeclared or
  unregistered paths.
- Installed help surface: 45 of 45 runtime command paths passed.
- Real workspaces: minimal, polyglot, and enterprise profiles exercised through
  model, snapshot, diff, impact, doctor, analyze, readiness, contract verify,
  verify, context, agent sync, explain, trace, watch, feedback, graph, and MCP.
- Artifact contracts: 66 real generated artifacts validated against the
  canonical registry and JSON Schemas.
- Portability and recovery: export/inspect/verify/doctor/hydrate passed for all
  three workspaces; project archive/restore preserved an identical source hash.
- Automated gates: 1,776 tests covered across two shards, 11 runtime steps and
  15 artifacts conformed, 12 adversarial groups passed, Windows registry guards
  passed, and npm audit found zero vulnerabilities.

The polyglot and enterprise fixtures intentionally retain contract blockers for
duplicate port 3000 declarations. The release gate consistently reports these
as workspace contract violations; they are fixture evidence, not hidden CLI
failures.

## Upgrade

```bash
npm install -g workspai@0.45.0
workspai --version
workspai commands --json
```

There are no breaking changes in this release.
