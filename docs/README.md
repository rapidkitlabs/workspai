# RapidKit NPM — Documentation Index

Hub for user and contributor documentation. Start with the [main README](../README.md) for install and quickstarts.

## Table of contents

- [User documentation](#user-documentation)
- [Operations & security](#operations--security)
- [AI module recommendations](#ai-module-recommendations)
- [Technical contracts](#technical-contracts)
- [Contributor documentation](#contributor-documentation)
- [Validation commands](#validation-commands)

## User documentation

| Document | Description |
| --- | --- |
| [commands-reference.md](./commands-reference.md) | Full CLI syntax, profiles, and policy keys |
| [workspace-operations.md](./workspace-operations.md) | Import, adopt, snapshots, archives, contracts, infra |
| [workspace-run.md](./workspace-run.md) | Polyglot fleet orchestration (`workspace run`) |
| [create-planner-capabilities.md](./create-planner-capabilities.md) | Native create, external-create-adopt, and adopt-only lanes |
| [from-code-to-shared-understanding.md](./from-code-to-shared-understanding.md) | GitHub-rendered Workspace Intelligence diagram |
| [OPEN_SOURCE_USER_SCENARIOS.md](./OPEN_SOURCE_USER_SCENARIOS.md) | Role-based workflows (junior → enterprise) |
| [doctor-command.md](./doctor-command.md) | Doctor scopes, CI exit codes, JSON evidence |
| [config-file-guide.md](./config-file-guide.md) | User config file (`~/.rapidkitrc.json`, `rapidkit.config.*`) |
| [WORKSPACE_MARKER_SPEC.md](./WORKSPACE_MARKER_SPEC.md) | Workspace marker format |
| [PACKAGE_MANAGER_POLICY.md](./PACKAGE_MANAGER_POLICY.md) | npm-only policy for this repository |

**Common tasks**

- Adopt an existing repo: [workspace-operations.md#import-and-adoption](./workspace-operations.md#import-and-adoption)
- Scaffold a frontend app: [commands-reference.md](./commands-reference.md) (`create frontend`)
- CI release gate: [commands-reference.md](./commands-reference.md) (`pipeline`, `readiness`)
- Agent context: `workspace model` / `workspace context` — schemas in [contracts/workspace-intelligence/](../contracts/workspace-intelligence/)

## Operations & security

| Document | Description |
| --- | --- |
| [SECURITY.md](./SECURITY.md) | Vulnerability reporting and supported versions |
| [policies.workspace.example.yml](./policies.workspace.example.yml) | Workspace policy template |
| [governance-policy.enterprise.example.json](./governance-policy.enterprise.example.json) | Sigstore governance allowlist template |
| [mirror-config.enterprise.example.json](./mirror-config.enterprise.example.json) | Mirror + evidence export template |

## AI module recommendations

FastAPI/NestJS module suggestions via OpenAI embeddings (optional).

| Document | Description |
| --- | --- |
| [AI_QUICKSTART.md](./AI_QUICKSTART.md) | 60-second setup |
| [AI_FEATURES.md](./AI_FEATURES.md) | Complete feature reference |
| [AI_EXAMPLES.md](./AI_EXAMPLES.md) | Use-case examples |
| [AI_DYNAMIC_INTEGRATION.md](./AI_DYNAMIC_INTEGRATION.md) | Integration architecture |

## Technical contracts

JSON schemas and ownership rules for tooling parity.

| Location | Description |
| --- | --- |
| [contracts/README.md](./contracts/README.md) | Core CLI JSON contracts + generator scripts |
| [contracts/COMMAND_OWNERSHIP_MATRIX.md](./contracts/COMMAND_OWNERSHIP_MATRIX.md) | npm wrapper vs Core command ownership |
| [contracts/RUNTIME_SUPPORT_MATRIX.md](./contracts/RUNTIME_SUPPORT_MATRIX.md) | Scaffold/import/lifecycle support tiers |
| [contracts/RUNTIME_ACCEPTANCE_MATRIX.md](./contracts/RUNTIME_ACCEPTANCE_MATRIX.md) | Runtime acceptance test expectations |
| [../contracts/](../contracts/) | Canonical JSON schemas (published in npm tarball) |

Regenerate and verify:

```bash
npm run generate:contracts
npm run check:generated-contracts
npm run validate:contracts
```

## Contributor documentation

| Document | Description |
| --- | --- |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Local dev, testing, debugging |
| [SETUP.md](./SETUP.md) | Build gates, smoke flows, release hygiene |
| [ci-workflows.md](./ci-workflows.md) | GitHub Actions workflow map |
| [OPTIMIZATION_GUIDE.md](./OPTIMIZATION_GUIDE.md) | Performance and improvement notes |
| [UTILITIES.md](./UTILITIES.md) | Internal cache and metrics helpers |

Also see [../CONTRIBUTING.md](../CONTRIBUTING.md) and [../CHANGELOG.md](../CHANGELOG.md).

## Validation commands

```bash
npm run validate:docs          # links + drift guard + examples + README smoke
npm run check:markdown-links   # local markdown link integrity
npm run validate:docs-examples # example JSON/YAML in docs
npm run smoke:readme           # CLI help smoke for documented commands
```

## Repository layout

```text
rapidkit-npm/
├── README.md                 # User hub (install, quickstarts, doc links)
├── CHANGELOG.md
├── RELEASE_NOTES.md
├── releases/                 # Per-version release notes
└── docs/
    ├── README.md             # This index
    ├── commands-reference.md
    ├── workspace-operations.md
    ├── workspace-run.md
    ├── ci-workflows.md
    ├── doctor-command.md
    ├── OPEN_SOURCE_USER_SCENARIOS.md
    ├── config-file-guide.md
    ├── SECURITY.md
    ├── SETUP.md
    ├── DEVELOPMENT.md
    ├── contracts/            # Contract docs (mirrors + matrices)
    └── …                     # AI guides, policies, examples
```

Enterprise governance runbooks are maintained outside this OSS docs tree.
