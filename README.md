# RapidKit

### Open-Source Workspace Intelligence for Software Systems

> AI agents understand files.
> RapidKit helps developers, CI, IDEs, and AI agents share the same understanding of the workspace.

**One workspace. One truth. Humans and AI aligned.**

RapidKit is the open-source workspace intelligence engine that turns scattered projects into a governed, agent-ready software system.

Build, adopt, and operate polyglot software systems with a shared, evidence-backed understanding for developers, CI pipelines, IDEs, and AI agents.

Instead of every tool rebuilding its own view of your system from files alone, RapidKit provides a shared source of truth: a workspace model, agent context, impact analysis, verification evidence, and release gates that all surfaces can consume.

## Quick start in 5 minutes

### Install the CLI

```bash
npm install -g rapidkit
```

### Create a new workspace and project

```bash
npx rapidkit create workspace platform --yes --profile polyglot

cd platform

npx rapidkit bootstrap --profile polyglot

npx rapidkit create project
npx rapidkit create frontend nextjs my-web --yes

npx rapidkit workspace model
npx rapidkit workspace context --for-agent --write
npx rapidkit pipeline --strict
```

### Adopt an existing project

```bash
npx rapidkit adopt /path/to/project --workspace /path/to/workspace

npx rapidkit workspace model
npx rapidkit workspace context --for-agent --write
npx rapidkit pipeline --strict
```

### What RapidKit gives you

* Adopt existing projects without migration
* Create and manage polyglot workspaces
* Generate canonical workspace models and agent-ready context
* Analyze impact before changes ship
* Verify release readiness with evidence-backed gates
* Keep developers, CI, IDEs, and AI agents aligned on the same workspace truth

### Workspace Intelligence

Most AI tools understand:

* Files
* Functions
* Repositories

Production systems require understanding:

* Ownership
* Architecture
* Dependencies
* Operational context
* Verification requirements
* Change impact

RapidKit adds the missing layer:

**Workspace Intelligence.**

**One workspace. One truth. Humans and AI aligned.**

A shared, evidence-backed understanding of software systems for developers, CI pipelines, IDEs, and AI agents.

In RapidKit, Workspace Intelligence is not a chat feature. It is the deterministic workspace layer behind the CLI:

* **Model** — what projects, runtimes, frameworks, commands, policies, contracts, and evidence exist
* **Context** — what AI agents and IDEs should know before giving advice
* **Impact** — what changed and which projects, commands, and release gates are affected
* **Verify** — which evidence proves the workspace is ready, blocked, or needs attention
* **Sync** — how developers, CI, Workspai, and AI agents stay grounded in the same truth

### From Code to Shared Understanding
How RapidKit transforms projects and repositories into workspace intelligence for developers, CI, and AI agents.

![From Code to Shared Understanding](https://raw.githubusercontent.com/rapidkitlabs/rapidkit-npm/main/docs/From%20Code%20to%20Shared%20Understanding.png)

Mermaid source for GitHub docs: [from-code-to-shared-understanding.md](docs/from-code-to-shared-understanding.md).

RapidKit provides the workspace intelligence engine: model, context, impact, verification, evidence, contracts, and governance.

Workspai provides the VS Code experience on top of that foundation.

For the visual experience, install the [Workspai VS Code extension](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode). 

[![npm version](https://img.shields.io/npm/v/rapidkit.svg?style=flat-square)](https://www.npmjs.com/package/rapidkit)
[![Downloads](https://img.shields.io/npm/dm/rapidkit.svg?style=flat-square)](https://www.npmjs.com/package/rapidkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Built by RapidKit](https://img.shields.io/badge/Built%20by-RapidKit-0f172a?logo=github)](https://www.getrapidkit.com)

## Table of contents

- [Typical workflows](#typical-workflows)
- [Mental model](#mental-model)
- [Workspace Intelligence Commands](#workspace-intelligence-commands)
- [Requirements & install](#requirements)
- [Project workflows](#project-workflows)
- [CI & evidence](#ci--evidence)
- [Workspai ecosystem](#workspai-ecosystem)
- [VS Code extension](#vs-code-extension)
- [Documentation](#documentation)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Typical workflows

| Question                                      | Command                                        |
| --------------------------------------------- | ---------------------------------------------- |
| What projects exist in this workspace?        | `workspace model --json`                       |
| What context should AI agents receive?        | `workspace context --for-agent --json --write` |
| What breaks if I change this?                 | `workspace impact --from <snapshot>`           |
| Can I safely release?                         | `pipeline --json --strict`                     |
| How do I align AI tools and CI?               | `workspace agent-sync --write`                 |
| How do I onboard an existing project?         | `adopt`                                        |
| How do I bring repositories into a workspace? | `import`                                       |


### Existing project

```bash
npx rapidkit adopt /path/to/project --workspace /path/to/workspace
npx rapidkit workspace model --json
```

### Agent-ready workspace

```bash
npx rapidkit workspace context --for-agent --json --write
npx rapidkit workspace agent-sync --write --refresh-context
```

### Release verification

```bash
npx rapidkit pipeline --json --strict
```


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


## Mental model

### Two-layer model

```text
First-class engine kits  →  FastAPI and NestJS (modules + deep generation)
Workspace intelligence   →  frontend apps, Go, Spring, .NET, adopted/imported repos
```

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

## Workspace Intelligence Commands
Workspace Intelligence provides a shared understanding of projects, dependencies, operational context, and release readiness for developers, CI pipelines, and AI agents.

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

## Project workflows

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

RapidKit and Workspai form a single workspace intelligence platform.

RapidKit provides the workspace intelligence engine: model, context, impact, verification, evidence, contracts, and governance.

Workspai — Workspace + Intelligence — provides the VS Code surface: dashboard, sidebar, Incident Studio, AI workflows, and developer-facing workspace operations.

| Component | Repository | Role |
| --- | --- | --- |
| CLI | [rapidkit-npm](https://github.com/rapidkitlabs/rapidkit-npm) | Commands, governance, adoption, CI evidence |
| VS Code | [rapidkit-vscode](https://github.com/rapidkitlabs/rapidkit-vscode) | Workspai dashboard, sidebar, AI studio |
| Core | [rapidkit-core](https://github.com/rapidkitlabs/rapidkit-core) | Python engine, modules, doctor |
| Examples | [rapidkit-examples](https://github.com/rapidkitlabs/rapidkit-examples) | Starter workspaces |

## VS Code extension
Workspai is the VS Code experience for RapidKit workspace intelligence.

Search **Workspai** in the marketplace or install via:
`ext install rapidkit.rapidkit-vscode`.

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
