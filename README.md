# RapidKit NPM CLI

> Workspace-first open-source platform that gives teams, tools, and AI agents a shared understanding of software systems.

RapidKit turns scattered projects into a governed workspace that CI, Workspai, and AI agents can understand.

[![npm version](https://img.shields.io/npm/v/rapidkit.svg?style=flat-square)](https://www.npmjs.com/package/rapidkit)
[![Downloads](https://img.shields.io/npm/dm/rapidkit.svg?style=flat-square)](https://www.npmjs.com/package/rapidkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![GitHub Stars](https://img.shields.io/github/stars/rapidkitlabs/rapidkit-npm.svg?style=flat-square)](https://github.com/rapidkitlabs/rapidkit-npm/stargazers)
[![Built by RapidKit](https://img.shields.io/badge/Built%20by-RapidKit-0f172a?logo=github)](https://www.getrapidkit.com)

For the visual experience, install the [Workspai VS Code extension](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode). The extension calls this CLI for discovery, commands, evidence, and AI context — install `rapidkit@latest` globally or link locally for scaffold/adopt flows.

## Table of contents

- [Start here](#start-here)
- [Mental model](#mental-model)
- [Workspace intelligence](#workspace-intelligence)
- [Requirements & install](#requirements)
- [Quickstarts](#quickstarts)
- [CI & evidence](#ci--evidence)
- [Workspai ecosystem](#workspai-ecosystem)
- [VS Code extension](#vs-code-extension)
- [Documentation](#documentation)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Start here

| If you have... | Use | What you get |
| --- | --- | --- |
| An existing project to keep in place | [`adopt`](docs/workspace-operations.md#import-and-adoption) | Links project, detects stack, writes metadata |
| A folder or repo to copy into a workspace | [`import`](docs/workspace-operations.md#import-and-adoption) | Copy/clone with rollback-safe sync |
| A new project from a kit | `create workspace` + `create project` / `create frontend` | Scaffold + governance evidence |
| CI or release gates | `pipeline --json --strict` | Full governance loop in one command |
| Agent-ready context | `workspace model` + `workspace context` + `workspace agent-sync` | Canonical facts, context packs, and cross-tool grounding |

### Adopt in place

```bash
npx rapidkit adopt /path/to/project --workspace /path/to/workspace --json
npx rapidkit adopt --json   # from inside the project folder
```

### Workspace layout

```text
~/.rapidkit/workspaces.json
~/rapidkit/workspaces/
  workspai/          # managed default (import/adopt fallback)
  my-workspace/      # user-created workspaces
```

New workspaces go under `~/rapidkit/workspaces/<name>`. Legacy `~/Workspai/rapidkits/*` paths remain registered. Use `--output <parent-dir>` for a custom parent.

### Two-layer model

```text
First-class engine kits  →  FastAPI and NestJS (modules + deep generation)
Workspace intelligence   →  frontend apps, Go, Spring, .NET, adopted/imported repos
```

## Mental model

RapidKit treats the **workspace** as the operating boundary: policy, registry, evidence, contracts, and release readiness. Projects can live inside the workspace or be **adopted** from outside.

```text
workspace/
  .rapidkit/workspace.json
  .rapidkit/reports/
  services/api/

external-project/
  .rapidkit/project.json
  .rapidkit/adopt.json
```

Every tool gets the same answers: what projects exist, what stack they use, which commands are safe, what evidence exists, and what context agents should receive.

## Workspace intelligence

| Command | Purpose |
| --- | --- |
| `workspace model --json` | Canonical workspace model |
| `workspace context --for-agent --json --write` | Agent-ready context pack + auto agent grounding sync |
| `workspace agent-sync --write` | Cross-tool grounding (AGENTS.md, Copilot, Cursor, Claude, INDEX) |
| `workspace snapshot --json` | Persist model snapshot |
| `workspace diff --from <file\|git[:ref]> --json` | Diff against snapshot or git |
| `workspace impact --from <file> --json` | Blast-radius evidence |
| `workspace verify [--strict] --json` | Impact verification gate |

JSON schemas: `contracts/workspace-intelligence/`. Details: [commands-reference.md](docs/commands-reference.md).

### Agent grounding (CLI-only, no extension required)

RapidKit can sync **cross-tool instruction files** so Copilot, Cursor, Claude Code, Codex, Grok, and other agents read the same evidence before guessing:

```bash
# Full sync: refresh context pack + INDEX + AGENTS.md + Copilot/Cursor/Claude hooks
npx rapidkit workspace agent-sync --write --refresh-context

# Context pack write also syncs grounding by default
npx rapidkit workspace context --for-agent --json --write

# CI strict gate (fail if required reports missing/stale)
npx rapidkit workspace agent-sync --write --strict --json
```

| Artifact / file | Purpose |
| --- | --- |
| `.rapidkit/reports/INDEX.json` | Read order, blockers, report timestamps |
| `.rapidkit/reports/workspace-context-agent.json` | Canonical agent context pack |
| `.rapidkit/AGENT-GROUNDING.md` | Tool-agnostic grounding doc |
| `AGENTS.md` | Open standard for all agents (managed RapidKit section) |
| `.github/copilot-instructions.md` | GitHub Copilot / VS Code Chat always-on rules |
| `.github/instructions/rapidkit-evidence.instructions.md` | Copilot scoped rules for `.rapidkit/**` |
| `.github/prompts/rapidkit-diagnose.prompt.md` | Copilot reusable diagnose prompt |
| `.github/skills/rapidkit-grounding/SKILL.md` | Copilot agent skill workflow |
| `.cursor/rules/rapidkit-grounding.mdc` | Cursor always-on project rule |
| `CLAUDE.md` | Claude Code entry (`@AGENTS.md` + managed notes) |
| `.claude/rules/rapidkit-evidence.md` | Claude Code scoped evidence rules |

Agents cannot be **forced** probabilistically — but this stack maximizes the chance they read reports first, even when the user talks to Copilot directly without Workspai.

Skip auto-sync after context write: `--no-agent-sync`. Target specific ecosystems: `--target copilot,cursor,claude`.

After `pipeline`, grounding syncs automatically (refresh context + INDEX + hooks). Disable with `--no-agent-sync` or `RAPIDKIT_NO_AGENT_SYNC=1`.

CI template: [docs/examples/ci-agent-grounding.yml](docs/examples/ci-agent-grounding.yml).

## Requirements

- Node.js `>= 20.19.6`
- Python `>= 3.10` (for Python/Core workflows)
- Java 21+, Go, .NET SDK 8+ (optional, per stack)

## Install

```bash
npm install -g rapidkit
# or
npx rapidkit --help
```

## Quickstarts

### I already have a project

```bash
npx rapidkit adopt /path/to/project --workspace /path/to/workspace
npx rapidkit import ../orders-api --workspace ./platform
npx rapidkit workspace model --json
npx rapidkit doctor workspace --json
```

### I want a new project

```bash
npx rapidkit create workspace platform --yes --profile polyglot
cd platform && npx rapidkit bootstrap --profile polyglot
npx rapidkit create project          # interactive kit picker
npx rapidkit create frontend nextjs my-web --yes
cd <project-name> && npx rapidkit init && npx rapidkit dev
```

Backend kits: `fastapi.standard`, `nestjs.standard`, `springboot.standard`, `gofiber.standard`, `dotnet.webapi.clean`, and more.

Frontend: `create frontend nextjs|remix|vite-react|angular|astro|…` or `create project frontend.nextjs <name>`.

Shortcut: `npx rapidkit platform` (interactive workspace wizard).

### I want CI or release gates

```bash
npx rapidkit pipeline --json --strict
```

Stages individually: `workspace sync`, `doctor workspace --ci`, `analyze --strict`, `readiness --strict`, `autopilot release`.

## CI & evidence

| Stage | Report |
| --- | --- |
| Pipeline | `.rapidkit/reports/pipeline-last-run.json` |
| Doctor | `.rapidkit/reports/doctor-last-run.json` |
| Analyze | `.rapidkit/reports/analyze-last-run.json` |
| Readiness | `.rapidkit/reports/release-readiness-last-run.json` |
| Autopilot | `.rapidkit/reports/autopilot-release-last-run.json` |

Common workspace commands:

```bash
npx rapidkit doctor workspace
npx rapidkit workspace agent-sync --write --refresh-context
npx rapidkit setup <python|node|go|java|dotnet> [--warm-deps]
npx rapidkit workspace list
npx rapidkit cache <status|clear|prune|repair>
npx rapidkit mirror <status|sync|verify|rotate>
```

Full syntax: [docs/commands-reference.md](docs/commands-reference.md). CI workflows: [docs/ci-workflows.md](docs/ci-workflows.md) — includes `.github/workflows/ci.yml`, `.github/workflows/workspace-e2e-matrix.yml`, `.github/workflows/windows-bridge-e2e.yml`, `.github/workflows/e2e-smoke.yml`, `.github/workflows/security.yml`.

## Workspai ecosystem

| Component | Repository | Role |
| --- | --- | --- |
| CLI | [rapidkit-npm](https://github.com/rapidkitlabs/rapidkit-npm) | Commands, governance, adoption, CI evidence |
| VS Code | [rapidkit-vscode](https://github.com/rapidkitlabs/rapidkit-vscode) | Workspai dashboard, sidebar, AI studio |
| Core | [rapidkit-core](https://github.com/rapidkitlabs/rapidkit-core) | Python engine, modules, doctor |
| Examples | [rapidkit-examples](https://github.com/rapidkitlabs/rapidkit-examples) | Starter workspaces |

## VS Code extension

Search **Workspai** in the marketplace or `ext install rapidkit.rapidkit-vscode`.

| Feature | CLI | Extension |
| --- | --- | --- |
| Create / adopt / import | Yes | Guided wizards |
| Workspace model / context | Yes | Dashboard + AI scope |
| Cross-tool agent grounding | Yes (`workspace agent-sync`) | Send-to-Copilot / Ask Studio UX |
| Enterprise evidence loop | Partial | Full dashboard |
| Module catalog (FastAPI/NestJS) | Limited | Browser UI |

The extension invokes this npm CLI. For the latest `adopt` and `create frontend` features, install matching CLI version: `npm install -g rapidkit@latest` or `npm link` from this repo ([Development](#development)).

## Documentation

| Doc | Description |
| --- | --- |
| [docs/README.md](docs/README.md) | Documentation index |
| [docs/commands-reference.md](docs/commands-reference.md) | Full command syntax |
| [docs/workspace-operations.md](docs/workspace-operations.md) | Import, adopt, snapshots, archives, infra |
| [docs/workspace-run.md](docs/workspace-run.md) | Polyglot fleet orchestration |
| [docs/doctor-command.md](docs/doctor-command.md) | Doctor scopes, CI exit codes, JSON evidence |
| [docs/OPEN_SOURCE_USER_SCENARIOS.md](docs/OPEN_SOURCE_USER_SCENARIOS.md) | Role-based workflows |
| [docs/SETUP.md](docs/SETUP.md) | Maintainer setup |
| [docs/SECURITY.md](docs/SECURITY.md) | Security policy |
| [docs/config-file-guide.md](docs/config-file-guide.md) | User configuration |
| [docs/README.md](docs/README.md) | Full documentation index |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

## Development

```bash
npm ci && npm run build && npm run test
npm run install:local   # link CLI globally for manual testing
```

Contributors: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), [docs/ci-workflows.md](docs/ci-workflows.md).

`npm run prepack` validates embeddings and CLI surfaces before `npm pack` / `npm publish`.

## Troubleshooting

| Problem | Quick check | Fix |
| --- | --- | --- |
| `python3` not found | `python3 --version` | Install Python 3.10+ |
| `setup --warm-deps` skipped | Project markers in cwd | Run from target project directory |
| Strict policy blocks command | `.rapidkit/policies.yml` | `workspace policy set …` |
| `npm audit fix --force` downgrades tsup | `package.json` | Do not use `--force`; keep `tsup@^8.5.1` |
| Security audit fails on esbuild | `npm audit --audit-level=moderate` | Keep `esbuild` override in `package.json` |
| Doctor output stale | Report timestamps | Re-run `doctor workspace` or `doctor project` |
| Copilot ignores workspace evidence | Missing grounding files | `workspace agent-sync --write --refresh-context` |
| Agent grounding strict CI failed | Stale/missing reports | Run governance chain then re-sync |
| Affected run scope wrong | Git ref | Use `--since <ref>` explicitly |

## License

MIT — see [LICENSE](LICENSE).
