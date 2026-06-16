# RapidKit CLI Contracts

Contract documentation for JSON payloads, support matrices, and cross-repo parity.

## Monorepo workflow

Canonical JSON lives in **`../contracts/`** (npm package root, published in the tarball).

| Script | Purpose |
| --- | --- |
| `npm run generate:contracts` | Regenerate runtime surface, import-stack parity, module-layout, infra-stack |
| `npm run check:generated-contracts` | Verify committed JSON matches generators |
| `npm run sync:parity-snapshot` | Copy canonical → vscode `contracts/` mirror |
| `npm run check:parity-snapshot` | Verify mirrors match canonical |
| `npm run validate:contracts` | Generate check + mirror check + contract tests |

Workflow: change code → `npm run generate:contracts` → `npm run sync:parity-snapshot` → commit npm + vscode `contracts/`.

## Documents in this folder

| File | Purpose |
| --- | --- |
| [COMMAND_OWNERSHIP_MATRIX.md](./COMMAND_OWNERSHIP_MATRIX.md) | Which commands the npm wrapper owns vs Python Core |
| [RUNTIME_SUPPORT_MATRIX.md](./RUNTIME_SUPPORT_MATRIX.md) | Scaffold, import, lifecycle, and module support tiers |
| [RUNTIME_ACCEPTANCE_MATRIX.md](./RUNTIME_ACCEPTANCE_MATRIX.md) | Runtime acceptance matrix expectations |
| [rapidkit-cli-contracts.json](./rapidkit-cli-contracts.json) | Core CLI JSON schema fragments |

## Workspace intelligence schemas

Published under `../contracts/workspace-intelligence/` (not duplicated in this folder):

- `workspace-model.v1.json`
- `workspace-context.v1.json`
- `workspace-model-snapshot.v1.json`
- `workspace-model-diff.v1.json`
- `workspace-impact.v1.json`
- `workspace-verify.v1.json`

CLI commands: see [commands-reference.md](../commands-reference.md) and [../README.md](../README.md#workspace-intelligence).

## Core CLI JSON payloads

`rapidkit-cli-contracts.json` describes:

- `VersionResponse` — `rapidkit version --json`
- `CommandsResponse` — `rapidkit commands --json`
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
