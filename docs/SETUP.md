# Setup & Workflow

Canonical setup reference for **maintainers** of the RapidKit npm CLI.

**End users:** start with [../README.md](../README.md), [OPEN_SOURCE_USER_SCENARIOS.md](./OPEN_SOURCE_USER_SCENARIOS.md), and [workspace-operations.md](./workspace-operations.md).

## Prerequisites

- Node.js `>= 20.19.6`
- npm ([PACKAGE_MANAGER_POLICY.md](./PACKAGE_MANAGER_POLICY.md))

```bash
npm ci
```

## Build & quality gates

```bash
npm run build
npm run validate
npm run validate:docs
npm run validate:contracts
```

| Command | Purpose |
| --- | --- |
| `validate` | typecheck + lint + format + tests |
| `validate:docs` | markdown links, drift guard, doc examples, README smoke |
| `validate:contracts` | generated JSON contracts + parity tests |

See [ci-workflows.md](./ci-workflows.md) for GitHub Actions mapping.

## Workspace CLI smoke

```bash
npm run build

node dist/index.js --help
node dist/index.js --version

node dist/index.js create workspace test-ws --yes --profile polyglot
node dist/index.js workspace list
cd test-ws
node ../dist/index.js bootstrap --profile polyglot
node ../dist/index.js setup python
node ../dist/index.js setup node --warm-deps
node ../dist/index.js doctor workspace
node ../dist/index.js workspace policy show
node ../dist/index.js cache status
node ../dist/index.js mirror status
```

## Release confidence scripts

```bash
npm run test:scenarios
npm run test:scenarios:full
npm run test:runtime-matrix:full
npm run smoke:frontend-generators
npm pack --dry-run
```

## Common development commands

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:coverage
```

Details: [DEVELOPMENT.md](./DEVELOPMENT.md).

## Environment variables

Bridge + Core integration:

- `RAPIDKIT_DEV_PATH` — local RapidKit Core checkout
- `RAPIDKIT_CORE_PYTHON_PACKAGE` — override Core install target
- `RAPIDKIT_BRIDGE_FORCE_VENV=1` — force cached bridge venv
- `RAPIDKIT_BRIDGE_UPGRADE_PIP=1` — upgrade pip in bridge venv
- `XDG_CACHE_HOME` — bridge cache root

Scenario toggles: `RAPIDKIT_SCENARIO_FULL_BOOTSTRAP`, `RAPIDKIT_SCENARIO_WORKSPACE_CREATE`

General: `DEBUG`, `NODE_ENV`

## Open-source release hygiene

Before tagging:

```bash
npm run validate
npm run validate:docs
npm run security
npm run test:scenarios
npm pack --dry-run
```

Use placeholders in examples (never real credentials). Do not commit local coverage output unless intentional.

## See also

- [Documentation index](./README.md)
- [commands-reference.md](./commands-reference.md)
- [contracts/README.md](./contracts/README.md)
