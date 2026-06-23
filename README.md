# RapidKit

### Open-Source Workspace Intelligence for Software Systems

[![npm version](https://img.shields.io/npm/v/rapidkit.svg?style=flat-square)](https://www.npmjs.com/package/rapidkit)
[![Downloads](https://img.shields.io/npm/dm/rapidkit.svg?style=flat-square)](https://www.npmjs.com/package/rapidkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Built by RapidKit](https://img.shields.io/badge/Built%20by-RapidKit-0f172a?logo=github)](https://www.getrapidkit.com)

> One workspace. One truth. Humans and AI aligned.

RapidKit turns scattered projects into a governed, agent-ready workspace.

It gives developers, CI, IDEs, and AI agents the same evidence-backed source of
truth: workspace model, agent context, impact analysis, verification evidence,
contracts, and release gates.

## Start here

### Install

```bash
npm install -g rapidkit
```

### CLI help

Browse all commands without a global install (first run fetches from npm):

```bash
npx rapidkit --help
```

### Create a governed workspace

```bash
npx rapidkit my-workspace --yes --profile polyglot
cd ~/rapidkit/workspaces/my-workspace

npx rapidkit bootstrap --profile polyglot
npx rapidkit create project
npx rapidkit create frontend nextjs my-web --yes

npx rapidkit workspace model --json
npx rapidkit workspace context --for-agent --json --write
npx rapidkit pipeline --json --strict
```

### Adopt an existing project

```bash
npx rapidkit adopt /path/to/project
cd ~/rapidkit/workspaces/workspai

npx rapidkit workspace model --json
npx rapidkit workspace context --for-agent --json --write
npx rapidkit pipeline --json --strict
```

### What you get

- A governed workspace boundary for projects, policies, reports, and contracts
- Native create for RapidKit-owned backend and frontend kits
- Adopt/import for existing repositories without moving source code
- Agent-ready context packs for Copilot, Cursor, Claude, Codex, and other tools
- Impact analysis and release gates backed by workspace evidence
- One shared truth for developers, CI, IDEs, and AI agents

## Create planner

RapidKit does not pretend every technology is a native scaffold. It uses a
create planner contract to choose the safest path:

| Lane                    | Use when                                                                                        | Result                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `native-create`         | RapidKit owns the scaffold contract                                                             | Create the project with a first-class kit                              |
| `external-create-adopt` | The ecosystem has an official generator, but RapidKit does not own the post-create contract yet | Use the ecosystem generator, then adopt into Workspace Intelligence    |
| `adopt-only`            | The project already exists or native create is not supported                                    | Register, model, verify, and govern the project without scaffolding it |

Native create includes FastAPI, NestJS, Go, Spring Boot, .NET, and official
frontend generators such as Next.js, Vite, Nuxt, Angular, Astro, Remix, and
SvelteKit.

External ecosystems such as WordPress, Laravel, Symfony, Rails, and generic PHP
projects can still enter RapidKit through adopt/import and receive workspace
model, context, impact, doctor, and release governance.

Details: [docs/create-planner-capabilities.md](docs/create-planner-capabilities.md).

## Workspace Intelligence

Most AI tools understand:

- Files
- Functions
- Repositories

Production systems require understanding:

- Ownership
- Architecture
- Dependencies
- Operational context
- Verification requirements
- Change impact

RapidKit adds the missing layer:

**Workspace Intelligence.**

**One workspace. One truth. Humans and AI aligned.**

A shared, evidence-backed understanding of software systems for developers, CI pipelines, IDEs, and AI agents.

In RapidKit, Workspace Intelligence is not a chat feature. It is the deterministic workspace layer behind the CLI:

- **Model** — what projects, runtimes, frameworks, commands, policies, contracts, and evidence exist
- **Context** — what AI agents and IDEs should know before giving advice
- **Impact** — what changed and which projects, commands, and release gates are affected
- **Verify** — which evidence proves the workspace is ready, blocked, or needs attention
- **Sync** — how developers, CI, Workspai, and AI agents stay grounded in the same truth

## From Code to Shared Understanding

How RapidKit transforms projects and repositories into workspace intelligence for developers, CI, and AI agents.

![From Code to Shared Understanding](https://raw.githubusercontent.com/rapidkitlabs/rapidkit-npm/main/docs/From%20Code%20to%20Shared%20Understanding.png)

Mermaid source for GitHub docs: [from-code-to-shared-understanding.md](docs/from-code-to-shared-understanding.md).

RapidKit provides the workspace intelligence engine: model, context, impact, verification, evidence, contracts, and governance.

Workspai provides the VS Code experience on top of that foundation.

For the visual experience, install the [Workspai VS Code extension](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode).

## Table of contents

- [Start here](#start-here)
- [Create planner](#create-planner)
- [Workspace Intelligence](#workspace-intelligence)
- [From Code to Shared Understanding](#from-code-to-shared-understanding)
- [Typical workflows](#typical-workflows)
- [Mental model](#mental-model)
- [Workspace Intelligence Commands](#workspace-intelligence-commands)
- [Agent Customization Pack](#agent-customization-pack)
- [Requirements](#requirements)
- [Install](#install)
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
npx rapidkit workspace agent-sync --write --refresh-context --preset enterprise
npx rapidkit workspace agent-sync --write --refresh-context --preset enterprise --experimental-hooks
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
  workspai/          # managed default (standalone, import, and adopt fallback)
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

| Command                                           | Purpose                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `workspace model [--cache\|--incremental] --json` | Canonical workspace model (graph-aware, incremental rebuilds)                        |
| `workspace context --for-agent --json --write`    | Agent-ready context pack + auto agent grounding sync                                 |
| `workspace agent-sync --write`                    | Agent Customization Pack (AGENTS.md, Copilot, Cursor, Claude, INDEX, skills, agents) |
| `workspace snapshot --json`                       | Persist model snapshot                                                               |
| `workspace diff --from <file\|git[:ref]> --json`  | Diff against snapshot or git                                                         |
| `workspace impact --from <file> --json`           | Graph-aware transitive blast-radius evidence                                         |
| `workspace verify [--strict] --json`              | Definitive verification gate (subgraph + freshness + policy)                         |
| `workspace graph <emit\|explain\|dot\|mermaid>`   | Inspect and visualize the dependency graph                                           |
| `workspace watch [--json] [--once]`               | Daemon mode: keep model + graph in memory, stream change events                      |

JSON schemas: `contracts/workspace-intelligence/`. Details: [commands-reference.md](docs/commands-reference.md).

### Graph-aware intelligence engine

The workspace model carries a deterministic, first-class **dependency graph** that
`impact`, `verify`, and `graph` all reason over — so the same evidence drives blast
radius, gating, and visualization:

- **Transitive blast radius** — `workspace impact` reports each affected project's
  `distance`, `path`, and `via` edge back to the change, plus centrality-weighted
  **critical-path hotspots**.
- **Whole-subgraph gate** — `workspace verify` gates the changed projects **and** their
  transitive dependents, surfaces graph **integrity** issues (cycles, dangling edges,
  orphans), and emits a structured `gate` (`passed`/`mode`/`exitCode`/`reasons`).
- **Transitive freshness** — a deterministic `fresh | stale | unknown` verdict chained
  through the graph: a dependency change makes every dependent stale, not just by
  timestamp.
- **Policy violations** — model/contract violations are surfaced as structured
  `policyViolations[]` (not just an exit code) so IDEs and CI can render blockers.
- **Health history** — every verify run appends to a bounded
  `.rapidkit/reports/workspace-intelligence-history.json` ring buffer for trends.
- **Fast rebuilds** — `workspace model --cache` / `--incremental` reuse unchanged
  project models and re-infer only incident edges, keyed by a structural `inputsHash`.
- **Watch / daemon** — `workspace watch` keeps the model + graph in memory and streams
  deterministic `workspace-watch-event.v1` change events (changed projects, graph edge
  deltas, structural hash) via fast incremental rebuilds.

### Agent Customization Pack

RapidKit can generate a versioned **Agent Customization Pack** so AI tools do
not start from an ungrounded repository scan. They start from the same workspace
truth developers and CI use: reports, commands, contracts, blockers, scope, and
verification evidence.

This is CLI-only and does not require the Workspai extension:

```bash
# Full enterprise pack:
# context pack + INDEX + AGENTS.md + Copilot/Cursor/Claude/Codex surfaces + MCP-ready design
npx rapidkit workspace agent-sync --write --refresh-context --preset enterprise

# Optional advisory VS Code agent hooks (disabled by default in the generated file)
npx rapidkit workspace agent-sync --write --refresh-context --preset enterprise --experimental-hooks

# Context pack write also syncs grounding by default
npx rapidkit workspace context --for-agent --json --write

# CI strict gate (fail if required reports missing/stale)
npx rapidkit workspace agent-sync --write --strict --json

# CI drift gate after sync
npm run check:agent-customization-drift -- --workspace <workspace-root>
```

| Artifact / file                                                         | Purpose                                                  |
| ----------------------------------------------------------------------- | -------------------------------------------------------- |
| `.rapidkit/reports/agent-customization-pack.json`                       | Versioned output inventory, target matrix, drift state   |
| `.rapidkit/reports/rapidkit-mcp-design.json`                            | Read-mostly MCP-ready tool design manifest               |
| `.rapidkit/reports/INDEX.json`                                          | Read order, blockers, report timestamps                  |
| `.rapidkit/reports/workspace-context-agent.json`                        | Canonical agent context pack                             |
| `.rapidkit/AGENT-GROUNDING.md`                                          | Tool-agnostic grounding doc                              |
| `AGENTS.md`                                                             | Open standard for all agents (managed RapidKit section)  |
| `.github/copilot-instructions.md`                                       | GitHub Copilot / VS Code Chat always-on rules            |
| `.github/instructions/rapidkit-workspace.instructions.md`               | Copilot workspace scope and command discipline           |
| `.github/instructions/rapidkit-evidence.instructions.md`                | Copilot scoped rules for `.rapidkit/**`                  |
| `.github/prompts/rapidkit-diagnose.prompt.md`                           | Copilot reusable diagnose prompt                         |
| `.github/skills/rapidkit-workspace-intelligence/SKILL.md`               | Workspace Intelligence skill workflow                    |
| `.github/skills/rapidkit-workspace-intelligence/resources/mcp-tools.md` | Future MCP tool design reference                         |
| `.github/agents/workspai-advisor.agent.md`                              | Read-only workspace advisor agent                        |
| `.github/agents/workspai-repair.agent.md`                               | Blocker repair agent                                     |
| `.github/agents/workspai-release.agent.md`                              | Release safety agent                                     |
| `.github/agents/workspai-project-onboarder.agent.md`                    | Project onboarding agent                                 |
| `.cursor/rules/rapidkit-grounding.mdc`                                  | Cursor always-on project rule                            |
| `CLAUDE.md`                                                             | Claude Code entry (`@AGENTS.md` + managed notes)         |
| `.claude/rules/rapidkit-evidence.md`                                    | Claude Code scoped evidence rules                        |
| `.vscode/rapidkit-agent-hooks.json`                                     | Optional advisory VS Code hooks (`--experimental-hooks`) |

The pack also publishes a standard answer contract for agent-facing output:

```text
Scope -> Evidence -> Diagnosis -> Fix Plan -> Run -> Verify -> Assumptions
```

That contract is what keeps agent responses operational: every recommendation
should name the workspace/project scope, cite the evidence it used, explain the
diagnosis, propose the command or file action, and tell the user how to verify
the result.

Agents cannot be **forced** probabilistically. This stack makes the desired
behavior explicit, versioned, and easy for IDEs, CI, and Workspai to audit.

Skip auto-sync after context write: `--no-agent-sync`. Target specific ecosystems: `--target copilot,cursor,claude`.

After `pipeline`, grounding syncs automatically (refresh context + INDEX + agent surfaces). Disable with `--no-agent-sync` or `RAPIDKIT_NO_AGENT_SYNC=1`.

Contract: `contracts/agent-customization-pack.v1.json`. Artifact map:
[docs/contracts/ARTIFACT_CATALOG.md](docs/contracts/ARTIFACT_CATALOG.md).

CI template: [docs/examples/ci-agent-grounding.yml](docs/examples/ci-agent-grounding.yml).

## Requirements

- Node.js `>= 20.19.6`
- Python `>= 3.10` (for Python/Core workflows)
- Java 21+, Go, .NET SDK 8+ (optional, per stack)

## Install

```bash
npm install -g rapidkit
```

## Project workflows

### I already have a project

```bash
npx rapidkit adopt /path/to/project
npx rapidkit import ../orders-api
cd ~/rapidkit/workspaces/workspai

npx rapidkit workspace model --json
npx rapidkit doctor workspace --json
```

### I want a new project

```bash
npx rapidkit my-workspace --yes --profile polyglot
cd ~/rapidkit/workspaces/my-workspace

npx rapidkit bootstrap --profile polyglot
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

| Stage     | Report                                              |
| --------- | --------------------------------------------------- |
| Pipeline  | `.rapidkit/reports/pipeline-last-run.json`          |
| Doctor    | `.rapidkit/reports/doctor-last-run.json`            |
| Analyze   | `.rapidkit/reports/analyze-last-run.json`           |
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

| Component | Repository                                                             | Role                                        |
| --------- | ---------------------------------------------------------------------- | ------------------------------------------- |
| CLI       | [rapidkit-npm](https://github.com/rapidkitlabs/rapidkit-npm)           | Commands, governance, adoption, CI evidence |
| VS Code   | [rapidkit-vscode](https://github.com/rapidkitlabs/rapidkit-vscode)     | Workspai dashboard, sidebar, AI studio      |
| Core      | [rapidkit-core](https://github.com/rapidkitlabs/rapidkit-core)         | Python engine, modules, doctor              |
| Examples  | [rapidkit-examples](https://github.com/rapidkitlabs/rapidkit-examples) | Starter workspaces                          |

## VS Code extension

Workspai is the VS Code experience for RapidKit workspace intelligence.

Search **Workspai** in the marketplace or install via:
`ext install rapidkit.rapidkit-vscode`.

| Feature                         | CLI                          | Extension                       |
| ------------------------------- | ---------------------------- | ------------------------------- |
| Create / adopt / import         | Yes                          | Guided wizards                  |
| Workspace model / context       | Yes                          | Dashboard + AI scope            |
| Cross-tool agent grounding      | Yes (`workspace agent-sync`) | Send-to-Copilot / Ask Studio UX |
| Enterprise evidence loop        | Partial                      | Full dashboard                  |
| Module catalog (FastAPI/NestJS) | Limited                      | Browser UI                      |

The extension invokes this npm CLI. For the latest `adopt` and `create frontend` features, install matching CLI version: `npm install -g rapidkit@latest` or `npm link` from this repo ([Development](#development)).

## Documentation

| Doc                                                                      | Description                                 |
| ------------------------------------------------------------------------ | ------------------------------------------- |
| [docs/README.md](docs/README.md)                                         | Documentation index                         |
| [docs/commands-reference.md](docs/commands-reference.md)                 | Full command syntax                         |
| [docs/workspace-operations.md](docs/workspace-operations.md)             | Import, adopt, snapshots, archives, infra   |
| [docs/workspace-run.md](docs/workspace-run.md)                           | Polyglot fleet orchestration                |
| [docs/doctor-command.md](docs/doctor-command.md)                         | Doctor scopes, CI exit codes, JSON evidence |
| [docs/OPEN_SOURCE_USER_SCENARIOS.md](docs/OPEN_SOURCE_USER_SCENARIOS.md) | Role-based workflows                        |
| [docs/SETUP.md](docs/SETUP.md)                                           | Maintainer setup                            |
| [docs/SECURITY.md](docs/SECURITY.md)                                     | Security policy                             |
| [docs/config-file-guide.md](docs/config-file-guide.md)                   | User configuration                          |
| [CHANGELOG.md](CHANGELOG.md)                                             | Version history                             |

## Development

```bash
npm ci && npm run build && npm run test
npm run install:local   # link CLI globally for manual testing
```

Contributors: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), [docs/ci-workflows.md](docs/ci-workflows.md).

`npm run prepack` validates embeddings and CLI surfaces before `npm pack` / `npm publish`.

## Troubleshooting

| Problem                                 | Quick check                        | Fix                                              |
| --------------------------------------- | ---------------------------------- | ------------------------------------------------ |
| `python3` not found                     | `python3 --version`                | Install Python 3.10+                             |
| `setup --warm-deps` skipped             | Project markers in cwd             | Run from target project directory                |
| Strict policy blocks command            | `.rapidkit/policies.yml`           | `workspace policy set …`                         |
| `npm audit fix --force` downgrades tsup | `package.json`                     | Do not use `--force`; keep `tsup@^8.5.1`         |
| Security audit fails on esbuild         | `npm audit --audit-level=moderate` | Keep `esbuild` override in `package.json`        |
| Doctor output stale                     | Report timestamps                  | Re-run `doctor workspace` or `doctor project`    |
| Copilot ignores workspace evidence      | Missing grounding files            | `workspace agent-sync --write --refresh-context` |
| Agent grounding strict CI failed        | Stale/missing reports              | Run governance chain then re-sync                |
| Affected run scope wrong                | Git ref                            | Use `--since <ref>` explicitly                   |

## License

MIT — see [LICENSE](LICENSE).
