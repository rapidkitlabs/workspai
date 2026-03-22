# RapidKit NPM CLI

> RapidKit is an open-source workspace platform that standardizes how teams build, scale, and deploy backend services.

FastAPI, NestJS, Go/Fiber, and Go/Gin scaffolding with production-ready defaults.  
**27+ plug-and-play modules** are available for FastAPI & NestJS projects.  
Clean architecture • Zero boilerplate • Instant deployment.

[![npm version](https://img.shields.io/npm/v/rapidkit.svg?style=flat-square)](https://www.npmjs.com/package/rapidkit)
[![Downloads](https://img.shields.io/npm/dm/rapidkit.svg?style=flat-square)](https://www.npmjs.com/package/rapidkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![GitHub Stars](https://img.shields.io/github/stars/getrapidkit/rapidkit-npm.svg?style=flat-square)](https://github.com/getrapidkit/rapidkit-npm/stargazers)
[![Part of RapidKit Platform](https://img.shields.io/badge/Part%20of-RapidKit%20Workspace%20Platform-0f172a?logo=github)](https://github.com/getrapidkit/rapidkit)

Official CLI for creating and operating RapidKit workspaces and projects.

- Workspace-first lifecycle (`create workspace` → `bootstrap` → `setup` → `create project`)
- Multi-runtime support (Python, Node.js, Go)
- Profile + policy enforcement (`warn` / `strict`)
- Cache and mirror lifecycle commands for stable environments

## Part of the RapidKit Ecosystem

RapidKit NPM CLI is the developer entrypoint layer of the platform.

| Layer | Repository |
|---|---|
| Ecosystem Hub | [getrapidkit/rapidkit](https://github.com/getrapidkit/rapidkit) |
| IDE | [getrapidkit/rapidkit-vscode](https://github.com/getrapidkit/rapidkit-vscode) |
| Core Engine | [getrapidkit/rapidkit-core](https://github.com/getrapidkit/rapidkit-core) |
| Examples | [getrapidkit/rapidkit-examples](https://github.com/getrapidkit/rapidkit-examples) |

## Requirements

- Node.js `>= 20.19.6`
- Python `>= 3.10` (for Python/Core workflows)
- Go (optional, for Go projects)

## Install

```bash
npm install -g rapidkit
```

Or run directly with `npx`:

```bash
npx rapidkit --help
```

All three commands above render the same root help output.

## Quick Start (Recommended)

### 1) Create a workspace

```bash
npx rapidkit create workspace my-workspace --yes --profile polyglot
cd my-workspace
```

### 2) Bootstrap and setup runtimes

```bash
npx rapidkit bootstrap --profile polyglot
npx rapidkit setup python
npx rapidkit setup node --warm-deps
npx rapidkit setup go --warm-deps
```

### 3) Create projects

```bash
npx rapidkit create project fastapi.standard my-api --yes --skip-install
npx rapidkit create project nestjs.standard my-nest --yes --skip-install
npx rapidkit create project gofiber.standard my-fiber --yes --skip-install
```

## Core Commands

### Workspace lifecycle

```bash
npx rapidkit create # Prompts: workspace | project
npx rapidkit create workspace <name> [--profile <profile>] [--author <name>] [--yes]
npx rapidkit bootstrap [--profile <profile>] [--json]
npx rapidkit setup <python|node|go> [--warm-deps]
npx rapidkit workspace policy show
npx rapidkit workspace policy set <key> <value>
npx rapidkit doctor
npx rapidkit doctor workspace [--fix]
npx rapidkit workspace list # Display all workspaces created on this system
```

### Command ownership

RapidKit keeps the wrapper boundary explicit so users know which layer owns each action.

| Command family | Owner | Notes |
|---|---|---|
| `create workspace`, `workspace`, `cache`, `mirror` | RapidKit wrapper | Platform-level orchestration |
| `init` | Wrapper orchestrated | Chooses the right runtime flow for the current project |
| `dev`, `test`, `build`, `start` | Runtime aware | Delegates to the active project/runtime when available |
| `doctor` | Wrapper system check | Checks host prerequisites by default |
| `doctor workspace` | Workspace health | Full workspace scan with project-level details and fixes |

Use `npx rapidkit doctor` for a quick host pre-flight and `npx rapidkit doctor workspace` inside a workspace for the full health picture.

### Doctor workspace fix behavior

- `npx rapidkit doctor workspace` reuses cached project scans when valid and refreshes evidence under `.rapidkit/reports/doctor-last-run.json`.
- `npx rapidkit doctor workspace --fix` only executes actionable fix commands.
- URL-based fixes are recorded as manual guidance (for example, install pages) and are not executed as shell commands.
- Go project fixes that require `go mod tidy` are skipped when the Go toolchain is not available, with a clear install-and-rerun hint.

### Project lifecycle

```bash
npx rapidkit create project <kit> <name> [--yes] [--skip-install]
npx rapidkit init
npx rapidkit dev
npx rapidkit test
npx rapidkit build
npx rapidkit start
```

### Operations

```bash
npx rapidkit cache <status|clear|prune|repair>
npx rapidkit mirror <status|sync|verify|rotate>
```

## Profiles

- `minimal` — baseline workspace scaffolding
- `python-only` — Python-focused workspace
- `node-only` — Node.js-focused workspace
- `go-only` — Go-focused workspace
- `polyglot` — Python + Node.js + Go
- `enterprise` — polyglot + governance-oriented checks

## Policy Modes

`mode` in `.rapidkit/policies.yml` controls enforcement:

- `warn` (default): report violations, continue
- `strict`: block incompatible operations

## Workspace Policy Management

Manage `.rapidkit/policies.yml` via CLI (recommended, avoids manual YAML edits):

```bash
npx rapidkit workspace policy show
npx rapidkit workspace policy set mode strict
npx rapidkit workspace policy set dependency_sharing_mode shared-runtime-caches
npx rapidkit workspace policy set rules.enforce_toolchain_lock true
```

Supported keys:
- `mode`
- `dependency_sharing_mode`
- `rules.enforce_workspace_marker`
- `rules.enforce_toolchain_lock`
- `rules.disallow_untrusted_tool_sources`
- `rules.enforce_compatibility_matrix`
- `rules.require_mirror_lock_for_offline`

## Setup and Warm Dependencies

`setup <runtime>` validates toolchain and updates `.rapidkit/toolchain.lock`.

`--warm-deps` adds optional dependency warm-up:

- Node: lock/dependency warm-up in Node project directories
- Go: module warm-up in Go project directories
- Python: accepted, currently reports node/go scope

Warm-deps behavior is non-fatal by design and reports explicit outcome (`completed` / `failed` / `skipped`).

## VS Code Extension

Use the RapidKit VS Code extension for visual workflows and workspace operations.

- Extension repository: https://github.com/getrapidkit/rapidkit-vscode

## CI Workflow Ownership Map

Use this map to avoid overlap when editing CI:

- `.github/workflows/ci.yml`
  - Build/lint/typecheck/tests/coverage matrix
  - General quality and contract gates
- `.github/workflows/workspace-e2e-matrix.yml`
  - Cross-OS workspace lifecycle smoke
  - Setup (`--warm-deps`) + cache/mirror ops
  - Chaos/non-fatal warm-deps behavior (Ubuntu job)
- `.github/workflows/windows-bridge-e2e.yml`
  - Native Windows bridge/lifecycle checks
- `.github/workflows/e2e-smoke.yml`
  - Focused bridge regression smoke (fast, narrow scope)
- `.github/workflows/security.yml`
  - Security scanning and policy checks

## Documentation Index

Primary docs live under `docs/`:

- General docs index: [docs/README.md](docs/README.md)
- Setup details: [docs/SETUP.md](docs/SETUP.md)
- Doctor command: [docs/doctor-command.md](docs/doctor-command.md)
- Workspace marker spec: [docs/WORKSPACE_MARKER_SPEC.md](docs/WORKSPACE_MARKER_SPEC.md)
- Config file guide: [docs/config-file-guide.md](docs/config-file-guide.md)
- Package manager policy: [docs/PACKAGE_MANAGER_POLICY.md](docs/PACKAGE_MANAGER_POLICY.md)
- Security: [docs/SECURITY.md](docs/SECURITY.md)
- Development: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

## Development

```bash
npm ci
npm run build
npm run test
npm run lint
npm run typecheck
```

Link local CLI globally for manual testing:

```bash
npm run install:local
npx rapidkit --version
```

## Troubleshooting

- If setup output looks stale, run `npx rapidkit setup <runtime>` again to refresh `.rapidkit/toolchain.lock`.
- If dependency warm-up is skipped, verify you are inside the corresponding project directory (`package.json` for Node, `go.mod` for Go).
- For strict-mode blocks, inspect `.rapidkit/policies.yml` and workspace profile in `.rapidkit/workspace.json`.

## License

MIT — see [LICENSE](LICENSE).
