# Workspai CLI Contracts

Contract documentation for JSON payloads, support matrices, and cross-repo parity.

## Monorepo workflow

Canonical JSON lives in **`../../contracts/`** (CLI package root, published in the tarball).

| Script                                    | Purpose                                                                                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `npm run generate:contracts`              | Regenerate runtime surface, create planner, agent customization pack, import-stack parity, module-layout, infra-stack |
| `npm run check:generated-contracts`       | Verify committed JSON matches generators                                                                              |
| `npm run sync:parity-snapshot`            | Copy canonical → vscode `contracts/` mirror                                                                           |
| `npm run check:parity-snapshot`           | Verify mirrors match canonical                                                                                        |
| `npm run validate:contracts`              | Generate check + mirror check + contract tests                                                                        |
| `npm run check:agent-customization-drift` | Verify generated agent customization files are committed in a consumer workspace                                      |

Workflow: change code → `npm run generate:contracts` → `npm run sync:parity-snapshot` → commit npm + vscode `contracts/`.

## Documents in this folder

| File                                                           | Purpose                                                     |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| [ARTIFACT_CATALOG.md](./ARTIFACT_CATALOG.md)                   | On-disk artifact paths, schema versions, and consumer rules |
| [COMMAND_OWNERSHIP_MATRIX.md](./COMMAND_OWNERSHIP_MATRIX.md)   | Which commands the npm wrapper owns vs Python Core          |
| [NAMING_AND_COEXISTENCE.md](./NAMING_AND_COEXISTENCE.md)       | Workspace Intelligence command naming and generated surface rules |
| [RUNTIME_SUPPORT_MATRIX.md](./RUNTIME_SUPPORT_MATRIX.md)       | Scaffold, import, lifecycle, and module support tiers       |
| [RUNTIME_ACCEPTANCE_MATRIX.md](./RUNTIME_ACCEPTANCE_MATRIX.md) | Runtime acceptance matrix expectations                      |
| [rapidkit-cli-contracts.json](./rapidkit-cli-contracts.json)   | Core CLI JSON schema fragments                              |

## Workspace intelligence schemas

Published under `../../contracts/` (not duplicated in this folder):

- `workspace-registry.v1.json` — canonical project registry summary (see [ARTIFACT_CATALOG.md](./ARTIFACT_CATALOG.md))
- `release-readiness.v1.json` — release readiness gate evidence
- `workspace-run-last.v1.json` — multi-stage workspace run evidence
- `doctor-workspace-evidence.v1.json` / `doctor-project-evidence.v1.json` — doctor evidence
- `doctor-remediation-plan.v2.json` — canonical persisted Doctor fix/plan Studio handoff contract (`v1` path is a deprecated compatibility alias)
- `artifact-remediation-plan.v1.json` — cross-artifact Studio handoff for Bootstrap, Analyze, Readiness, Pipeline, Workspace Run, Workspace Verify, and Doctor plan bridging
- `analyze-last-run.v1.json` — analyze evidence
- `pipeline-last-run.v1.json` — governance pipeline orchestration
- `project-entry-capability.v1.json` — open-ended adopt/import contract for readable projects
- `create-planner-capabilities.v1.json` — native, official, and existing capability lanes
- `agent-customization-pack.v1.json` — generated instructions, prompts, skills, agents, optional hooks, MCP-ready design metadata, target matrix, and drift state for AI agent surfaces

Workspace intelligence (`../../contracts/workspace-intelligence/`):

- `workspace-model.v1.json`
- `workspace-context.v1.json`
- `workspace-dependency-graph.v1.json`
- `workspace-model-snapshot.v1.json`
- `workspace-model-diff.v1.json`
- `workspace-impact.v1.json`
- `workspace-verify.v1.json`
- `workspace-explain.v1.json`
- `workspace-intelligence-history.v1.json`
- `workspace-operational-skill.v1.json`
- `workspace-skills-index.v1.json`
- `workspace-contract-verify.v1.json`
- `agent-action-outcome.v1.json`
- `blocker-resolution.v1.json`
- `doctor-fix-result.v1.json`
- `studio-blocker-handoff.v1.json`

CLI commands: see [commands-reference.md](../commands-reference.md) and [../README.md](../README.md#workspace-intelligence).

## Core CLI JSON payloads

`rapidkit-cli-contracts.json` describes:

- `VersionResponse` — `rapidkit version --json`
- `CommandsResponse` — `workspai commands --json`
- `ProjectDetectResponse` — `rapidkit project detect --json`
- `ModulesListResponseV1` — `rapidkit modules list --json-schema 1`

## Versioning

- Payloads include `schema_version` where applicable.
- Backward-compatible changes keep the same schema version.
- Breaking changes require a schema bump and updated tests in `src/__tests__/contracts/`.

## See also

- [Documentation index](../README.md)
- [commands-reference.md](../commands-reference.md)
- [workspace-operations.md](../workspace-operations.md)
