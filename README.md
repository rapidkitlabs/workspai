# RapidKit NPM CLI

> RapidKit is an open-source workspace platform that standardizes how teams build, scale, and deploy backend services.

FastAPI, NestJS, Spring Boot, Go/Fiber, and Go/Gin scaffolding with production-ready defaults.  
**27+ plug-and-play modules** are available for FastAPI & NestJS projects. Spring Boot and Go kits run as npm-level generators.  
Clean architecture • Zero boilerplate • Instant deployment.

> **💡 Recommended:** Install the [Workspai VS Code extension](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode) for AI-powered project creation, a visual workspace explorer, and context-aware coding assistance — all backed by this CLI.

[![npm version](https://img.shields.io/npm/v/rapidkit.svg?style=flat-square)](https://www.npmjs.com/package/rapidkit)
[![Downloads](https://img.shields.io/npm/dm/rapidkit.svg?style=flat-square)](https://www.npmjs.com/package/rapidkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![GitHub Stars](https://img.shields.io/github/stars/getrapidkit/rapidkit-npm.svg?style=flat-square)](https://github.com/getrapidkit/rapidkit-npm/stargazers)
[![Built by RapidKit](https://img.shields.io/badge/Built%20by-RapidKit-0f172a?logo=github)](https://www.getrapidkit.com)

Official CLI for creating and operating RapidKit workspaces and projects.

- Workspace-first lifecycle (`create workspace` → `bootstrap` → `setup` → `create project`)
- Multi-runtime support (Python, Node.js, Java, Go)
- Profile + policy enforcement (`warn` / `strict`)
- Cache and mirror lifecycle commands for stable environments

## RapidKit CLI in the Workspai Ecosystem

The `rapidkit` npm package remains the official RapidKit CLI.

It works alongside Workspai, which is a product developed by RapidKit.

| Component | Repository | Role |
|---|---|---|
| CLI | [getrapidkit/rapidkit-npm](https://github.com/getrapidkit/rapidkit-npm) | Official RapidKit npm CLI |
| VS Code Extension | [getrapidkit/rapidkit-vscode](https://github.com/getrapidkit/rapidkit-vscode) | **Workspai** — visual explorer + AI features (recommended) |
| Core Engine | [getrapidkit/rapidkit-core](https://github.com/getrapidkit/rapidkit-core) | Official RapidKit Core |
| Examples | [getrapidkit/rapidkit-examples](https://github.com/getrapidkit/rapidkit-examples) | Example workspaces and starter references |

## Requirements

- Node.js `>= 20.19.6`
- Python `>= 3.10` (for Python/Core workflows)
- Java 21+ and Maven 3.9+ (optional, for Spring Boot projects)
- Go (optional, for Go projects)

## Install

```bash
npm install -g rapidkit
```

Or run directly with `npx`:

```bash
npx rapidkit --help
```

The commands above provide install/help entry points for the same CLI.

## 60-Second Quickstart

```bash
npx rapidkit my-workspace
cd my-workspace
npx rapidkit create project
cd <project-name>
npx rapidkit init && npx rapidkit dev
```

If you prefer explicit commands instead of shortcut mode:

```bash
npx rapidkit create workspace my-workspace --yes --profile polyglot
```

## Quick Start (Recommended)

### 1) Create a workspace

```bash
npx rapidkit create workspace my-workspace --yes --profile polyglot
cd my-workspace
```

Shortcut form (equivalent workspace creation flow):

```bash
npx rapidkit my-workspace
```

This shortcut launches the same interactive workspace wizard (author, profile, Python version, environment strategy).

### 2) Bootstrap and setup runtimes

```bash
npx rapidkit bootstrap --profile polyglot
npx rapidkit setup python
npx rapidkit setup node --warm-deps
npx rapidkit setup java --warm-deps
npx rapidkit setup go --warm-deps
```

### 3) Create projects

```bash
npx rapidkit create project                  # Interactive kit picker
npx rapidkit create project fastapi.standard my-api --yes --skip-install
npx rapidkit create project fastapi.ddd my-api --yes --skip-install
npx rapidkit create project nestjs.standard my-nest --yes --skip-install
npx rapidkit create project springboot.standard my-spring --yes --skip-install
npx rapidkit create project gofiber.standard my-fiber --yes --skip-install
```

## Core Commands

### Workspace lifecycle

```bash
npx rapidkit create # Prompts: workspace | project
npx rapidkit create workspace <name> [--profile <profile>] [--author <name>] [--yes]
npx rapidkit bootstrap [--profile <profile>] [--json]
npx rapidkit setup <python|node|go|java> [--warm-deps]
npx rapidkit readiness [--json] [--strict]
npx rapidkit workspace policy show
npx rapidkit workspace policy set <key> <value>
npx rapidkit doctor
npx rapidkit doctor workspace [--fix]
npx rapidkit doctor project [--fix]
npx rapidkit workspace list # Display all workspaces created on this system
npx rapidkit workspace share [--output <file>] [--include-paths] [--no-doctor]
npx rapidkit import <path|git-url> [--workspace <path>] [--name <project-name>] [--git] [--json]
npx rapidkit workspace init # Full-init alias (same behavior as root init/workspace run init at workspace root)
npx rapidkit workspace run <init|test|build|start> [--affected] [--blast-radius] [--since <ref>] [--parallel] [--max-workers <n>] [--strict] [--json]
```

### Project import into workspace

Use `import` to bring an existing backend project (local folder or git repository) into a RapidKit workspace.

```bash
# Local folder import
npx rapidkit import ../orders-api

# Git import
npx rapidkit import https://github.com/acme/orders-api.git --git

# Explicit workspace and custom target name
npx rapidkit import ../orders-api --workspace ./my-workspace --name orders-api

# Machine-readable output
npx rapidkit import ../orders-api --json
```

Import behavior:

- Local folders are copied; git sources are cloned with shallow history.
- If you run import outside any workspace and do not pass `--workspace`, RapidKit auto-creates/reuses the default workspace at `~/Workspai/rapidkits/default-workspace`.
- CLI cannot change your parent shell directory; instead it prints a next-step `cd ...` hint (and returns `suggestedCdCommand` in JSON mode).
- If workspace sync fails after import, RapidKit rolls back imported files and registry entries before returning an error.

JSON output (`--json`) includes:

- `workspacePath`
- `workspaceResolution` (`explicit` | `nearest` | `default-auto`)
- `defaultWorkspaceCreated`
- `suggestedCdCommand`
- `importedProject` (`name`, `path`, `stack`, `confidence`, `source`)

### Workspace collaboration bundle

Use `workspace share` to export a portable JSON snapshot for team handoff,
debugging, and cross-machine diagnostics.

```bash
npx rapidkit workspace share
# default output: .rapidkit/reports/share-bundle.json

npx rapidkit workspace share --output ./team-share.json
npx rapidkit workspace share --include-paths
npx rapidkit workspace share --no-doctor
```

Bundle content includes:

- Workspace metadata (`name`, `profile`, RapidKit version)
- Discovered RapidKit projects (`relative_path`, runtime, kit)
- Workspace and project report file index
- Latest doctor evidence per project (unless `--no-doctor` is used)

`--include-paths` is intended for internal teams only because it includes absolute filesystem paths.

### Command ownership

RapidKit keeps the wrapper boundary explicit so users know which layer owns each action.

| Command family | Owner | Notes |
|---|---|---|
| `create workspace`, `workspace`, `cache`, `mirror` | RapidKit wrapper | Platform-level orchestration |
| `init` | Wrapper orchestrated | Project init in project dirs; full-init alias at workspace root |
| `dev`, `test`, `build`, `start` | Runtime aware | Delegates to the active project/runtime when available |
| `readiness` | Wrapper release gate | Generates release-readiness evidence (`--json` for CI, `--strict` for fail-fast) |
| `import` | Workspace ingestion | Imports local folders or git backends with rollback-safe sync behavior |
| `doctor` | Wrapper system check | Checks host prerequisites by default |
| `doctor workspace` | Workspace health | Full workspace scan with project-level details and fixes |
| `doctor project` | Project health | Current project (or nearest parent) diagnostics with project evidence and scoped fixes |
| `workspace run` | Workspace orchestrator | Stage execution across discovered projects with optional affected-only, blast-radius expansion, and policy-gated pre-checks |

Use `npx rapidkit doctor` for a quick host pre-flight, `npx rapidkit doctor project` for a service-level check, and `npx rapidkit doctor workspace` for the full workspace picture.
Use `npx rapidkit readiness` when you need machine-readable release evidence or strict CI gating.

### Doctor workspace fix behavior

- `npx rapidkit doctor workspace` reuses cached project scans when valid and refreshes evidence under `.rapidkit/reports/doctor-last-run.json`.
- `npx rapidkit doctor workspace --fix` only executes actionable fix commands.
- Advisory warnings (for example, detected vulnerabilities or optional env metadata gaps) are reported in workspace health, but they do not automatically become shell fix commands.
- It is valid to see `No fixes needed` after `--fix` when only advisory warnings are present.
- URL-based fixes are recorded as manual guidance (for example, install pages) and are not executed as shell commands.
- Go project fixes that require `go mod tidy` are skipped when the Go toolchain is not available, with a clear install-and-rerun hint.

### Doctor workspace JSON fields (AI/automation)

`npx rapidkit doctor workspace --json` includes project-level runtime/profile metadata used by extension and AI tooling:

- `framework`
- `frameworkKey`
- `importStack`
- `runtimeFamily`
- `projectKind`
- `supportTier`
- `frameworkConfidence`

### Doctor project behavior

- `npx rapidkit doctor project` resolves the current project or the nearest parent project when run from nested directories.
- Project mode supports RapidKit and non-RapidKit backend projects (generic runtime diagnostics still run when `.rapidkit` is missing).
- JSON evidence is written to `.rapidkit/reports/doctor-project-last-run.json` (workspace-level when available).
- `--fix` in project mode applies only project-scoped actionable fixes, with the same safe/guarded handling used by doctor fix flows.
- Project diagnostics include built-in probes (configuration surface, migration surface, runtime health surface) and optional custom probe/adapter contracts.

### Doctor project JSON fields (AI/automation)

`npx rapidkit doctor project --json` includes project-scoped evidence fields for extension and automation consumers:

- `scope` (`project`)
- `contract` (doctor evidence contract + scoring policy version)
- `project` (framework/runtime metadata, canonical `frameworkKey` and `importStack`, issues, fix commands, probes)
- `summary.scopeProvenance`
- `driftDelta`
- `scoreBreakdown`

### Doctor evidence schema compatibility

Doctor persisted evidence now carries explicit schema tags:

- Workspace evidence: `schemaVersion = doctor-workspace-evidence-v1`, `evidenceType = workspace`
- Project evidence: `schemaVersion = doctor-project-evidence-v1`, `evidenceType = project`
- Workspace scan cache: `schemaVersion = doctor-workspace-cache-v1`

Compatibility policy for automation consumers:

- Legacy doctor evidence without `schemaVersion` is still accepted.
- Unknown or incompatible doctor evidence schema versions are treated as invalid evidence (safe fallback, no crash).
- `readiness` and `workspace share` use the same compatibility validation path, so behavior is consistent across CLI surfaces.

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
- `java-only` — Java-focused workspace
- `python-only` — Python-focused workspace
- `node-only` — Node.js-focused workspace
- `go-only` — Go-focused workspace
- `polyglot` — Python + Node.js + Go + Java
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

## VS Code Extension (Recommended)

For the best RapidKit experience, use the **Workspai VS Code extension** — it wraps this CLI with a
visual workspace explorer, AI-powered project creation, and context-aware coding assistance.

### Why use the extension?

| Feature | CLI | Extension |
|---|---|---|
| Create workspace / project | ✅ | ✅ Visual wizard |
| AI Create — describe → scaffold | ❌ | ✅ |
| Project Assistant (context-aware Q&A) | ❌ | ✅ |
| Workspace tree explorer | ❌ | ✅ |
| Module catalog browser | ❌ | ✅ |
| One-click `rapidkit init / dev / test` | ❌ | ✅ |
| Inline AI on every workspace item | ❌ | ✅ |

### Install

Search **Workspai** in the VS Code Extensions marketplace, or:

```bash
ext install rapidkit.rapidkit-vscode
```

> The extension calls this CLI under the hood — both tools work together seamlessly.
> You do **not** need to install the CLI separately when using the extension.

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

## Workspace Run — Polyglot Fleet Orchestration

`workspace run` is an enterprise-grade orchestrator for executing CI-safe stages (init, test, build, start) across polyglot monorepos. It supports 20+ frameworks across 9 runtimes with professional-grade features.

### Quick Start

```bash
# Test all discovered projects in parallel
npx rapidkit workspace run test --parallel

# Test only affected projects since last commit
npx rapidkit workspace run test --affected --since HEAD~1

# Test affected + their dependents (requires dependency graph)
npx rapidkit workspace run test --affected --blast-radius

# Build specific projects with custom stages (if defined in .rapidkit/context.json)
npx rapidkit workspace run build --json --max-workers 8
```

### Supported Runtimes & Frameworks

| Runtime | Frameworks | Status |
|---------|-----------|--------|
| **Node** | NestJS, Express, Next.js, Nuxt | Built-in |
| **Go** | Fiber, Gin, Echo, Chi | Built-in |
| **Java** | Spring Boot, Quarkus, Gradle | Built-in |
| **Python** | FastAPI, Django, Flask, Poetry | Built-in |
| **PHP** | Laravel, Symfony, Slim | Stable |
| **Rust** | Actix, Axum, Rocket, Tokio | Stable |
| **.NET** | ASP.NET Core, Entity Framework | Stable |
| **Elixir** | Phoenix, Umbrella Projects | Stable |
| **Ruby** | Rails, Sinatra, RSpec | Stable |

### Enterprise Features

1. **Command Overrides** — Customize stage commands per project via `.rapidkit/context.json`
2. **Multi-Framework Projects** — Support full-stack apps (e.g., Laravel + Vue in same directory)
3. **Error Diagnostics** — Categorize errors (setup vs test failure vs runtime) for better CI feedback
4. **Preflight Validation** — Validate command availability before execution
5. **Health Checks** — Verify services are ready (port listening, HTTP health, log grep)
6. **Custom Stages** — Define project-specific stages (lint, docs, bench, etc.)
7. **Stage Dependencies** — Define execution order and prerequisites
8. **Environment Variants** — dev/staging/prod command variants
9. **Caching** — Skip re-runs of completed stages
10. **Composite Steps** — Multi-step build logic

For deeper enterprise deployment and governance details, see:
- [docs/README.md](docs/README.md)
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- [docs/SECURITY.md](docs/SECURITY.md)

### Configuration Example

```json
{
  ".rapidkit/context.json": {
    "runtime": "php",
    "framework": "Laravel",
    "commands": {
      "test": "php artisan test --parallel=4",
      "build": "php artisan config:cache && php artisan route:cache",
      "lint": "php bin/phpstan analyse --level=8"
    },
    "environment": "dev"
  }
}
```

### Output & Reporting

```bash
# JSON report for CI integration
npx rapidkit workspace run test --json > test-results.json

cat test-results.json | jq '.projects[] | {path, status, errorCategory}'
# Output:
# {
#   "path": "services/api",
#   "status": "failed",
#   "errorCategory": "setup"  # setup | test-failure | runtime | dependency | timeout
# }
```

## Command Semantics

RapidKit has two workspace-level execution surfaces, and three equivalent full-init aliases at workspace root:

| Command | Intent | Scope |
|---|---|---|
| `init` (at workspace root), `workspace init`, `workspace run init` | Mirrored full-init orchestration (workspace-profile deps + selected project init) | Workspace root + discovered project fleet |
| `workspace run <test\|build\|start>` | Fleet stage execution — run a CI-safe stage across discovered projects | Selected project fleet |
| `init`, `test`, `build`, `start`, `dev` (inside project directory) | Project primitive — run one stage in the current project only | Single project |

**Key design rule:** at workspace root, these are equivalent aliases: `npx rapidkit init`, `npx rapidkit workspace init`, `npx rapidkit workspace run init`.
Inside a project directory, `npx rapidkit init` remains a project-scoped primitive.

`dev` is intentionally excluded from `workspace run` — it is a long-running local process, not a CI batch stage.

Detailed enterprise semantic specs and governance evidence contracts are intentionally excluded from OSS docs.

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

### Quick fixes matrix

| Problem | Quick check | Fix |
|---|---|---|
| `python3` not found | `python3 --version` | Install Python 3.10+ and re-run `npx rapidkit create workspace ...` |
| `setup --warm-deps` skipped | Check for `package.json` / `go.mod` in current dir | Run from the target project directory |
| strict policy blocks command | Review `.rapidkit/policies.yml` | Set policy intentionally via `npx rapidkit workspace policy set ...` |
| doctor output seems stale | Check report timestamp in `.rapidkit/reports/` | Re-run `npx rapidkit doctor workspace` or `npx rapidkit doctor project` |
| affected run scope seems wrong | Verify git ref | Use `--since <ref>` explicitly |

- If setup output looks stale, run `npx rapidkit setup <runtime>` again to refresh `.rapidkit/toolchain.lock`.
- If dependency warm-up is skipped, verify you are inside the corresponding project directory (`package.json` for Node, `go.mod` for Go).
- For strict-mode blocks, inspect `.rapidkit/policies.yml` and workspace profile in `.rapidkit/workspace.json`.

## License

MIT — see [LICENSE](LICENSE).
