# Workspai

## Open-Source Workspace Intelligence for Software Systems

[![npm version](https://img.shields.io/npm/v/workspai.svg?style=flat-square)](https://www.npmjs.com/package/workspai)
[![Downloads](https://img.shields.io/npm/dm/workspai.svg?style=flat-square)](https://www.npmjs.com/package/workspai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Built by Workspai](https://img.shields.io/badge/Built%20by-Workspai-0f172a?logo=github)](https://workspai.dev)

Not another AI coding assistant.
Not another agent framework.
Not another context engine.

> One workspace. One truth. Humans and AI aligned.

Workspai turns scattered projects into a governed, agent-ready workspace.

It gives developers, CI, IDEs, and AI agents the same evidence-backed source of
truth: workspace model, agent context, impact analysis, verification evidence,
contracts, and release gates.

## Start here

### Install

```bash
npm install -g workspai
```

For short `npx` workflows, use the separate alias package:

```bash
npx wspai --help
```

### CLI help

Browse all commands without a global install (first run fetches from npm):

```bash
npx workspai --help
```

### Create a governed workspace

```bash
npx workspai my-workspace --yes --profile polyglot
cd ~/.workspai/workspaces/my-workspace

npx workspai bootstrap --profile polyglot
npx workspai create project nextjs my-web --yes
npx workspai create project fastapi.standard my-api --yes

npx workspai workspace model --json
npx workspai workspace context --for-agent --json --write
npx workspai pipeline --json --strict
```

### Adopt an existing project

```bash
npx workspai adopt /path/to/project
cd ~/.workspai/workspaces/workspai

npx workspai workspace model --json
npx workspai workspace context --for-agent --json --write
npx workspai pipeline --json --strict
```

### What you get

- A governed workspace boundary for projects, policies, reports, and contracts
- Native create for Workspai-owned backend and frontend kits
- Adopt/import for existing repositories without moving source code
- Agent-ready context packs for Copilot, Cursor, Claude, Codex, and other tools
- Impact analysis and release gates backed by workspace evidence
- One shared truth for developers, CI, IDEs, and AI agents

## Create planner

Workspai does not pretend every technology is a native scaffold. It uses a
create planner contract to choose the safest path:

| Lane                    | Use when                                                                                        | Result                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `native-create`         | Workspai owns the scaffold contract                                                             | Create the project with a first-class kit                              |
| `external-create-adopt` | The ecosystem has an official generator, but Workspai does not own the post-create contract yet | Use the ecosystem generator, then adopt into Workspace Intelligence    |
| `adopt-only`            | The project already exists or native create is not supported                                    | Register, model, verify, and govern the project without scaffolding it |

Native create includes FastAPI, NestJS, Go, Spring Boot, .NET, and official
frontend generators such as Next.js, Vite, Nuxt, Angular, Astro, Remix, and
SvelteKit.

External ecosystems such as WordPress, Laravel, Symfony, Rails, and generic PHP
projects can still enter Workspai through adopt/import and receive workspace
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

Workspai adds the missing layer:

**Workspace Intelligence.**

**One workspace. One truth. Humans and AI aligned.**

A shared, evidence-backed understanding of software systems for developers, CI pipelines, IDEs, and AI agents.

In Workspai, Workspace Intelligence is not a chat feature. It is the deterministic workspace layer behind the CLI:

- **Model** — what projects, runtimes, frameworks, commands, policies, contracts, and evidence exist
- **Context** — what AI agents and IDEs should know before giving advice
- **Impact** — what changed and which projects, commands, and release gates are affected
- **Verify** — which evidence proves the workspace is ready, blocked, or needs attention
- **Sync** — how developers, CI, Workspai, and AI agents stay grounded in the same truth
- **Freshness** — which facts are durable, derived, evidence-backed, live, or must be verified before use

## From Code to Shared Understanding

How Workspai transforms projects and repositories into workspace intelligence for developers, CI, and AI agents.

![From Code to Shared Understanding](https://raw.githubusercontent.com/rapidkitlabs/workspai/main/packages/cli/docs/From%20Code%20to%20Shared%20Understanding.png)

Mermaid source for GitHub docs: [from-code-to-shared-understanding.md](docs/from-code-to-shared-understanding.md).

Workspai provides the workspace intelligence engine: model, context, impact, verification, evidence, contracts, governance, and the VS Code experience on top of that foundation.

For the visual experience, install the [Workspai VS Code extension](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode).

## Table of contents

- [Start here](#start-here)
- [Create planner](#create-planner)
- [Workspace Intelligence](#workspace-intelligence)
- [From Code to Shared Understanding](#from-code-to-shared-understanding)
- [Typical workflows](#typical-workflows)
- [Mental model](#mental-model)
- [Why this architecture helps](#why-this-architecture-helps)
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

| Question                                      | Command                                                                                      |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| What projects exist in this workspace?        | `workspace model --json`                                                                     |
| What context should AI agents receive?        | `workspace context --for-agent --json --write`                                               |
| What breaks if I change this?                 | `workspace impact --from <snapshot>`                                                         |
| Why is release blocked?                       | `workspace explain release-blocked --json --write`                                           |
| Trace a diff through blast radius and gates?  | `workspace trace --from .workspai/reports/workspace-model-diff-last-run.json --json --write` |
| What should Studio do for blocked artifacts?  | `workspace remediation-plan --ci --json --write`                                             |
| Can I safely release?                         | `pipeline --json --strict`                                                                   |
| How do I align AI tools and CI?               | `workspace agent-sync --write`                                                               |
| Expose workspace evidence to MCP clients?     | `workspace mcp serve`                                                                        |
| How do I onboard an existing project?         | `adopt`                                                                                      |
| How do I bring repositories into a workspace? | `import`                                                                                     |

### Existing project

```bash
npx workspai adopt /path/to/project --workspace /path/to/workspace
npx workspai workspace model --json
```

### Agent-ready workspace

```bash
npx workspai workspace context --for-agent --json --write
npx workspai workspace agent-sync --write --refresh-context --preset enterprise
npx workspai workspace agent-sync --write --refresh-context --preset enterprise --experimental-hooks
```

### Release verification

```bash
npx workspai pipeline --json --strict
```

### Adopt in place

```bash
npx workspai adopt /path/to/project --workspace /path/to/workspace --json
npx workspai adopt --json   # from inside the project folder
```

### Workspace layout

```text
~/.workspai/workspaces.json
~/.workspai/workspaces/
  workspai/          # managed default (standalone, import, and adopt fallback)
  my-workspace/      # user-created workspaces
```

New workspaces go under `~/.workspai/workspaces/<name>`. Legacy `~/rapidkit/workspaces/*` and `~/Workspai/rapidkits/*` paths remain registered. Use `--output <parent-dir>` for a custom parent.

## Mental model

### Two capabilities, one workspace intelligence layer

```text
Workspace Intelligence  →  every project in the workspace
Native generation       →  first-class scaffolds and stack-specific project creation
Deep module generation  →  selected backend engine kits such as FastAPI and NestJS
```

Workspace Intelligence is not limited to a framework lane. It works across
Workspai-created projects, frontend apps, Go, Spring Boot, .NET, FastAPI, NestJS,
and adopted/imported repositories. The difference is generation depth:
some stacks have first-class scaffolds, some use official ecosystem generators,
and existing projects can be adopted in place.

Workspai treats the **workspace** as the operating boundary: policy, registry,
evidence, contracts, and release readiness. Projects can live inside the
workspace or be **adopted** from outside.

```text
workspace/
  .workspai-workspace
  .workspai/workspace.json
  .workspai/reports/
    workspace-model.json
    workspace-context-agent.json
    INDEX.json
    agent-customization-pack.json
    workspace-skills-index.json
    workspai-mcp-design.json
  .workspai/skills/
  .workspai/AGENT-GROUNDING.md
  services/api/
    .workspai/project.json
  AGENTS.md
  .github/copilot-instructions.md
  .github/instructions/
  .github/prompts/
  .github/skills/
  .github/agents/
  .cursor/rules/workspai-grounding.mdc
  CLAUDE.md
  .vscode/workspai-agent-hooks.json

external-project/
  .workspai/project.json
  .workspai/adopt.json
```

`.workspai/workspace.json` is the workspace manifest, not the project list.
Legacy `.rapidkit/*` metadata is read as a fallback when opening older workspaces,
but new Workspai CLI writes target `.workspai/*`.
Projects are discovered from workspace project metadata, imported/adopted
records, and workspace intelligence reports.

Agent-facing outputs are generated from the same evidence layer:
`workspace context --for-agent --write` writes the agent context report, and
`workspace agent-sync --write --refresh-context --preset enterprise` writes the
portable `AGENTS.md`, report index, skills, Copilot/Cursor/Claude surfaces, and
agent handoff files. The exact generated output inventory is recorded in
`.workspai/reports/agent-customization-pack.json` and summarized in the
[Agent Customization Pack](#agent-customization-pack) section below.

Every tool gets the same answers for every registered project: what projects
exist, what stack they use, which commands are safe, what evidence exists, what
changed, what release gates apply, and what context agents should receive.

## Why this architecture helps

You do not have to change frameworks to benefit from Workspai.

Use the frontend or backend stack that already fits your product: Next.js,
Vite, FastAPI, NestJS, Go, Spring Boot, .NET, or an existing repository you
adopt in place. Workspai adds the workspace layer around it: project registry,
safe commands, evidence, impact analysis, agent context, verification, and
release gates.

That means you can move faster without turning the product into a fragile
prototype:

- Start new products with governed scaffolds when Workspai owns the create path
- Adopt existing products without moving source code or rewriting the stack
- Give humans, CI, IDEs, and AI agents the same workspace truth
- Know what changed, what is affected, and what must be verified before release
- Keep framework stability while adding professional product-development
  workflows around the codebase

The result is faster product development with clearer boundaries, safer AI
assistance, and release decisions backed by evidence instead of guesswork.

## Workspace Intelligence Commands

Workspace Intelligence provides a shared understanding of projects, dependencies, operational context, and release readiness for developers, CI pipelines, and AI agents.

| Command                                                      | Purpose                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `workspace model [--cache\|--incremental] --json`            | Canonical workspace model (graph-aware, incremental rebuilds)                        |
| `workspace context --for-agent --json --write`               | Agent-ready context pack + auto agent grounding sync                                 |
| `workspace agent-sync --write`                               | Agent Customization Pack (AGENTS.md, Copilot, Cursor, Claude, INDEX, skills, agents) |
| `workspace snapshot --json`                                  | Persist model snapshot                                                               |
| `workspace diff --from <file\|git[:ref]> --json`             | Diff against snapshot or git                                                         |
| `workspace impact --from <file> --json`                      | Graph-aware transitive blast-radius evidence                                         |
| `workspace verify [--strict] --json`                         | Definitive verification gate (subgraph + freshness + policy + fleet evidence)        |
| `workspace remediation-plan [--ci] --json --write`           | Cross-artifact Studio repair plan for blocked governance cards                       |
| `workspace explain <target> [--write] --json`                | Human narrative for release blockers, projects, or trace slices                      |
| `workspace why <target>`                                     | Alias of `workspace explain`                                                         |
| `workspace trace --from <diff> [--write] --json`             | Diff → impact → gates narrative for agents and IDE handoff                           |
| `workspace feedback record --json`                           | Append structured agent action outcomes to intelligence history                      |
| `workspace mcp serve`                                        | Read-mostly stdio MCP bridge over workspace evidence                                 |
| `workspace graph <emit\|explain\|dot\|mermaid>`              | Inspect and visualize the dependency graph                                           |
| `workspace watch [--json] [--once]`                          | Daemon mode: keep model + graph in memory, stream change events                      |
| `workspace run <stage> [--scope project:X] [--reuse-passed]` | Fleet init/test/build/start or custom stages from `.workspai/context.json`           |

JSON schemas: `contracts/workspace-intelligence/`. Command coexistence and naming:
[docs/contracts/NAMING_AND_COEXISTENCE.md](docs/contracts/NAMING_AND_COEXISTENCE.md).
Details: [commands-reference.md](docs/commands-reference.md).

### Operational intelligence (Phase 4)

After model → diff → impact → verify, use **explain** and **trace** for
human/agent narratives, **feedback** to record outcomes, and **MCP serve** for
read-only tool access:

```bash
npx workspai workspace explain release-blocked --json --write
npx workspai workspace trace --from .workspai/reports/workspace-model-diff-last-run.json --json --write
npx workspai workspace feedback record --json
npx workspai workspace mcp serve
```

Fleet runs support scoped execution and result reuse:

```bash
npx workspai workspace run test --scope project:api --reuse-passed --json
npx workspai workspace run lint --scope project:api   # custom stage from context.json
```

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
- **Fact freshness contracts** — `workspace model` and agent context packs mark each
  workspace fact as durable, derived, evidence-backed, live, or verify-before-use so
  agents do not reuse stale state as if it were structure.
- **Policy violations** — model/contract violations are surfaced as structured
  `policyViolations[]` (not just an exit code) so IDEs and CI can render blockers.
- **Health history** — every verify run appends to a bounded
  `.workspai/reports/workspace-intelligence-history.json` ring buffer for trends.
- **Fast rebuilds** — `workspace model --cache` / `--incremental` reuse unchanged
  project models and re-infer only incident edges, keyed by a structural `inputsHash`.
- **Watch / daemon** — `workspace watch` keeps the model + graph in memory and streams
  deterministic `workspace-watch-event.v1` change events (changed projects, graph edge
  deltas, structural hash) via fast incremental rebuilds.

### Agent Customization Pack

Workspai can generate a versioned **Agent Customization Pack** so AI tools do
not start from an ungrounded repository scan. They start from the same workspace
truth developers and CI use: reports, commands, contracts, blockers, scope, and
verification evidence.

This is CLI-only and does not require the Workspai extension:

```bash
# Full enterprise pack:
# context pack + INDEX + AGENTS.md + Copilot/Cursor/Claude/Codex surfaces + MCP-ready design
npx workspai workspace agent-sync --write --refresh-context --preset enterprise

# Optional advisory VS Code agent hooks (disabled by default in the generated file)
npx workspai workspace agent-sync --write --refresh-context --preset enterprise --experimental-hooks

# Context pack write also syncs grounding by default
npx workspai workspace context --for-agent --json --write

# CI strict gate (fail if required reports missing/stale)
npx workspai workspace agent-sync --write --strict --json

# CI drift gate after sync
npm run check:agent-customization-drift -- --workspace <workspace-root>
```

| Artifact / file                                                         | Purpose                                                     |
| ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| `.workspai/reports/agent-customization-pack.json`                       | Versioned output inventory, target matrix, drift state      |
| `.workspai/reports/workspace-explain-last-run.json`                     | Unified explain / trace narrative for blockers and projects |
| `.workspai/reports/workspace-skills-index.json`                         | Index of operational playbooks (`.workspai/skills/*.md`)    |
| `.workspai/skills/workspai-*.md`                                        | Operational playbooks (generated by agent-sync)             |
| `.workspai/reports/workspai-mcp-design.json`                            | Read-mostly MCP-ready tool design manifest                  |
| `.workspai/reports/INDEX.json`                                          | Read order, blockers, report timestamps                     |
| `.workspai/reports/workspace-context-agent.json`                        | Canonical agent context pack                                |
| `.workspai/reports/artifact-remediation-plan-last-run.json`             | Cross-artifact Studio repair plan                           |
| `.workspai/reports/doctor-remediation-plan-last-run.json`               | Doctor-specific ordered repair plan                         |
| `.workspai/reports/doctor-fix-result-last-run.json`                     | Doctor fix/apply execution result                           |
| `.workspai/AGENT-GROUNDING.md`                                          | Tool-agnostic grounding doc                                 |
| `AGENTS.md`                                                             | Open standard for all agents (managed Workspai section)     |
| `.github/copilot-instructions.md`                                       | GitHub Copilot / VS Code Chat always-on rules               |
| `.github/instructions/workspai-workspace.instructions.md`               | Copilot workspace scope and command discipline              |
| `.github/instructions/workspai-evidence.instructions.md`                | Copilot scoped evidence rules                               |
| `.github/prompts/workspai-diagnose.prompt.md`                           | Copilot reusable diagnose prompt                            |
| `.github/skills/workspai-workspace-intelligence/SKILL.md`               | Workspace Intelligence skill workflow                       |
| `.github/skills/workspai-workspace-intelligence/resources/mcp-tools.md` | Future MCP tool design reference                            |
| `.github/agents/workspai-advisor.agent.md`                              | Read-only workspace advisor agent                           |
| `.github/agents/workspai-repair.agent.md`                               | Blocker repair agent                                        |
| `.github/agents/workspai-release.agent.md`                              | Release safety agent                                        |
| `.github/agents/workspai-project-onboarder.agent.md`                    | Project onboarding agent                                    |
| `.cursor/rules/workspai-grounding.mdc`                                  | Cursor always-on project rule                               |
| `CLAUDE.md`                                                             | Claude Code entry (`@AGENTS.md` + managed notes)            |
| `.claude/rules/workspai-evidence.md`                                    | Claude Code scoped evidence rules                           |
| `.claude/rules/rapidkit-evidence.md`                                    | Legacy Claude Code scoped evidence mirror                   |
| `.vscode/workspai-agent-hooks.json`                                     | Optional advisory VS Code hooks (`--experimental-hooks`)    |

Legacy `rapidkit-*` agent files may still be read by older consumers, but canonical Workspai grounding is written under `.workspai` and Workspai-named agent surfaces.

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
npm install -g workspai
```

## Project workflows

### I already have a project

```bash
npx workspai adopt /path/to/project
npx workspai import ../orders-api
cd ~/.workspai/workspaces/workspai

npx workspai workspace model --json
npx workspai doctor workspace --json
```

### I want a new project

```bash
npx workspai my-workspace --yes --profile polyglot
cd ~/.workspai/workspaces/my-workspace

npx workspai bootstrap --profile polyglot
npx workspai create project          # interactive kit picker
npx workspai create project nextjs my-web --yes
npx workspai create project fastapi.standard my-api --yes
cd <project-name> && npx workspai init && npx workspai dev
```

Backend kits: `fastapi.standard`, `nestjs.standard`, `springboot.standard`, `gofiber.standard`, `dotnet.webapi.clean`, and more.

Frontend kits: `nextjs`, `remix`, `vite-react`, `nuxt`, `angular`, `astro`, `sveltekit`, and more — same command shape:

```bash
npx workspai create project <kit> <name>
```

(`create frontend <id>` remains supported as an alias.)

Shortcut: `npx workspai platform` (interactive workspace wizard).

### I want CI or release gates

```bash
npx workspai pipeline --json --strict
```

Stages individually: `workspace sync`, `doctor workspace --ci`, `analyze --strict`, `readiness --strict`, `autopilot release`.

## CI & evidence

| Stage     | Report                                              |
| --------- | --------------------------------------------------- |
| Pipeline  | `.workspai/reports/pipeline-last-run.json`          |
| Doctor    | `.workspai/reports/doctor-last-run.json`            |
| Analyze   | `.workspai/reports/analyze-last-run.json`           |
| Readiness | `.workspai/reports/release-readiness-last-run.json` |
| Autopilot | `.workspai/reports/autopilot-release-last-run.json` |

Common workspace commands:

```bash
npx workspai doctor workspace
npx workspai workspace agent-sync --write --refresh-context
npx workspai setup <python|node|go|java|dotnet> [--warm-deps]
npx workspai workspace list
npx workspai cache <status|clear|prune|repair>
npx workspai mirror <status|sync|verify|rotate>
```

Full syntax: [docs/commands-reference.md](docs/commands-reference.md). CI workflows: [docs/ci-workflows.md](docs/ci-workflows.md) — includes `.github/workflows/ci.yml`, `.github/workflows/workspace-e2e-matrix.yml`, `.github/workflows/windows-bridge-e2e.yml`, `.github/workflows/e2e-smoke.yml`, `.github/workflows/security.yml`.

## Workspai ecosystem

RapidKit Labs builds Workspai as a single Workspace Intelligence platform.

Workspai provides the CLI engine and the VS Code surface: model, context, impact, verification, evidence, contracts, governance, dashboard, sidebar, Incident Studio, AI workflows, and developer-facing workspace operations.

| Component | Repository                                                                  | Role                                        |
| --------- | --------------------------------------------------------------------------- | ------------------------------------------- |
| CLI       | [workspai](https://github.com/rapidkitlabs/workspai/tree/main/packages/cli) | Commands, governance, adoption, CI evidence |
| VS Code   | [rapidkit-vscode](https://github.com/rapidkitlabs/rapidkit-vscode)          | Workspai dashboard, sidebar, AI studio      |
| Core      | [rapidkit-core](https://github.com/rapidkitlabs/rapidkit-core)              | Python engine, modules, doctor              |
| Examples  | [rapidkit-examples](https://github.com/rapidkitlabs/rapidkit-examples)      | Starter workspaces                          |

## VS Code extension

Workspai is the VS Code and CLI experience for Workspace Intelligence.

Search **Workspai** in the marketplace or install via:
`ext install rapidkit.rapidkit-vscode`.

| Feature                         | CLI                          | Extension                       |
| ------------------------------- | ---------------------------- | ------------------------------- |
| Create / adopt / import         | Yes                          | Guided wizards                  |
| Workspace model / context       | Yes                          | Dashboard + AI scope            |
| Cross-tool agent grounding      | Yes (`workspace agent-sync`) | Send-to-Copilot / Ask Studio UX |
| Enterprise evidence loop        | Partial                      | Full dashboard                  |
| Module catalog (FastAPI/NestJS) | Limited                      | Browser UI                      |

The extension invokes this npm CLI. For the latest `adopt` and frontend generator features, install matching CLI version: `npm install -g workspai` or `npm link` from this repo ([Development](#development)).

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
| Strict policy blocks command            | `.workspai/policies.yml`           | `workspace policy set …`                         |
| `npm audit fix --force` downgrades tsup | `package.json`                     | Do not use `--force`; keep `tsup@^8.5.1`         |
| Security audit fails on esbuild         | `npm audit --audit-level=moderate` | Keep `esbuild` override in `package.json`        |
| Doctor output stale                     | Report timestamps                  | Re-run `doctor workspace` or `doctor project`    |
| Copilot ignores workspace evidence      | Missing grounding files            | `workspace agent-sync --write --refresh-context` |
| Agent grounding strict CI failed        | Stale/missing reports              | Run governance chain then re-sync                |
| Affected run scope wrong                | Git ref                            | Use `--since <ref>` explicitly                   |

## License

MIT — see [LICENSE](LICENSE).
