# Workspai CLI

## Open-Source Workspace Intelligence for Software Systems

[![npm version](https://img.shields.io/npm/v/workspai.svg?style=flat-square)](https://www.npmjs.com/package/workspai)
[![Downloads](https://img.shields.io/npm/dm/workspai.svg?style=flat-square)](https://www.npmjs.com/package/workspai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
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
workspai --help
```

For short `npx` workflows, use the separate alias package:

```bash
npx wspai --help
```

`workspai` is the canonical npm package and command. `wspai` is an optional
short alias for `npx` workflows. RapidKit Core is the optional Python engine
used only by Python/Core-dependent workflows; it is not a replacement CLI.
This package is the active CLI boundary in the
[Workspai monorepo](../../README.md).

### CLI help

Browse all commands from the latest release without a global install:

```bash
npx workspai@latest --help
```

## Get Workspace Intelligence

Project creation, import, and adoption are entry routes. The core experience
starts when Workspai builds a durable model of the whole workspace and turns it
into evidence that different tools can consume.

Connect an existing project without moving or copying its source:

```bash
npx workspai adopt /path/to/project --json
cd ~/.workspai/workspaces/workspai
```

Execute the canonical chain and persist the shared model, evidence, and
agent-ready context:

```bash
npx workspai workspace intelligence run --for-agent codex --strict --json
```

You now have a common source of truth for projects, runtimes, dependencies,
commands, policies, contracts, health, and release evidence. The first durable
outputs include:

```text
.workspai/reports/workspace-model.json
.workspai/reports/workspace-context-agent.json
.workspai/reports/INDEX.json
.workspai/reports/workspace-intelligence-run-last-run.json
AGENTS.md
```

Already inside a Workspai workspace? Start directly with the canonical
`workspace intelligence run --for-agent codex --strict --json` runner.

The broader governance and release pipeline is a separate gate when you are
ready; it is not a substitute for the canonical chain:

```bash
npx workspai pipeline --json --strict
```

## From Code to Shared Understanding

![From Code to Shared Understanding](https://raw.githubusercontent.com/rapidkitlabs/workspai/main/packages/cli/docs/From%20Code%20to%20Shared%20Understanding.png)

[View the Mermaid source and explanation](docs/from-code-to-shared-understanding.md).

Workspai is the deterministic layer between source code and its consumers:

| Capability            | What it answers                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------- |
| **Model**             | What projects, runtimes, frameworks, commands, policies, contracts, and dependencies exist? |
| **Snapshot and diff** | What changed between two known workspace states?                                            |
| **Impact**            | Which projects and transitive dependents are affected?                                      |
| **Evidence**          | What do health, analysis, contracts, and readiness reports prove?                           |
| **Verify**            | Is the affected workspace ready, blocked, stale, or missing evidence?                       |
| **Context**           | What should developers, IDEs, and AI agents know before acting?                             |
| **Explain**           | Why is a project, change, or release blocked, and what should happen next?                  |
| **Sync**              | How do tools stay aligned with the same current workspace truth?                            |

Create, import, and adopt add software to this boundary. Workspace Intelligence
then models and governs every registered project, whether Workspai created it or
it already existed.

## One Intelligence Chain

The canonical execution order is versioned in
[`workspace-intelligence-chain.v1.json`](contracts/workspace-intelligence-chain.v1.json):

```text
Model -> Diff -> Impact -> Doctor + Contract Verify + Analyze -> Readiness
      -> Verify -> Context -> Agent Sync -> Explain
```

Each step declares what it consumes, what it produces, and whether its verdict
continues or stops the chain. The CLI, CI, IDE integrations, generated agent
instructions, and documentation can therefore use the same contract instead of
inventing separate workflows.

The execution envelope reports `sync` before Model and baseline resolution
after Model/before Diff as exactly two `preflight` entries. They are not extra
chain stages. The report always contains exactly 11 ordered `stages`; exit `0`
means passed, `1` is a hard execution failure, and `2` is an evidence-blocked
completed run. See [Unified Workspace Intelligence Runner](docs/workspace-intelligence-runner.md)
for the complete report, baseline, failure-propagation, and CI contract.

Use `workspace intelligence run --for-agent <agent> --strict --json` to execute
and enforce this exact contract-backed order. `pipeline --json --strict` remains
the broader governance/release orchestrator (`sync → doctor → analyze → readiness
→ autopilot`); it is not an alias for the canonical intelligence chain.

## Core Workflows

| What you need                              | Command                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Build and persist the current system model | `npx workspai workspace model --json --write`                                            |
| Generate agent-ready context               | `npx workspai workspace context --for-agent --json --write`                              |
| Generate portable agent and IDE surfaces   | `npx workspai workspace agent-sync --write --refresh-context --preset enterprise --json` |
| Save a model baseline                      | `npx workspai workspace snapshot --json`                                                 |
| Compare with a baseline or Git state       | `npx workspai workspace diff --from <snapshot-or-git-ref> --json`                        |
| Calculate transitive blast radius          | `npx workspai workspace impact --from <diff-report> --json`                              |
| Verify affected projects and evidence      | `npx workspai workspace verify --from-impact <impact-report> --json --strict`            |
| Explain a blocker                          | `npx workspai workspace explain release-blocked --json --write`                          |
| Inspect a project in the dependency graph  | `npx workspai workspace graph explain <project> --json`                                  |
| Run affected project tests                 | `npx workspai workspace run test --affected --blast-radius --json`                       |
| Run the release/governance gate            | `npx workspai pipeline --json --strict`                                                  |
| Run the canonical intelligence chain       | `npx workspai workspace intelligence run --for-agent codex --strict --json`              |
| Expose current evidence to MCP clients     | `npx workspai workspace mcp serve`                                                       |

`workspace verify` consumes current impact, doctor, contract, analysis, and
readiness evidence. Use `workspace intelligence run` for the canonical chain,
or `pipeline` for the broader governance/release workflow.

Other useful operational commands:

```bash
npx workspai doctor workspace
npx workspai setup <python|node|go|java|dotnet> [--warm-deps]
npx workspai workspace list
npx workspai cache <status|clear|prune|repair>
npx workspai mirror <status|sync|verify|rotate>
```

### Understand a change

Create a baseline:

```bash
npx workspai workspace model --json --write
npx workspai workspace snapshot --json
```

After a change:

```bash
npx workspai workspace model --json --write
npx workspai workspace diff \
  --from .workspai/reports/workspace-model-snapshot.json \
  --json
npx workspai workspace impact \
  --from .workspai/reports/workspace-model-diff-last-run.json \
  --json
```

Impact reports include affected projects and graph paths back to the change, so
developers, CI, IDEs, and agents reason over the same blast radius.

### Ground AI tools

```bash
npx workspai workspace agent-sync \
  --write \
  --refresh-context \
  --preset enterprise \
  --json
```

This generates a versioned Agent Customization Pack from workspace evidence,
including `AGENTS.md`, report indexes, skills, and supported Copilot, Cursor,
Claude, and Codex surfaces. AI tools begin with the same scope, commands,
contracts, blockers, and verification evidence used by humans and CI.

## Outputs and Consumers

Workspai separates human output, machine output, and durable cross-tool state:

| Output                                    | Primary consumers                                  |
| ----------------------------------------- | -------------------------------------------------- |
| CLI summaries and next actions            | Developers and operators                           |
| JSON stdout                               | Scripts, CI jobs, IDE command bridges, and agents  |
| Exit codes                                | CI and release gates                               |
| Persisted `.workspai/reports/*` artifacts | Developers, CI, IDEs, dashboards, and agents       |
| Generated grounding files                 | Copilot, Cursor, Claude, Codex, and other AI tools |
| MCP stdio tools                           | MCP-compatible clients                             |
| Workspace watch events                    | Incremental IDE and automation consumers           |

Important durable outputs:

| Artifact                                                | Producer                       | Used for                              |
| ------------------------------------------------------- | ------------------------------ | ------------------------------------- |
| `.workspai/reports/workspace-model.json`                | `workspace model --write`      | Canonical system structure            |
| `.workspai/reports/workspace-model-diff-last-run.json`  | `workspace diff`               | Structural change evidence            |
| `.workspai/reports/workspace-impact-last-run.json`      | `workspace impact`             | Blast radius and affected scope       |
| `.workspai/reports/workspace-verify-last-run.json`      | `workspace verify`             | Structured verification gate          |
| `.workspai/reports/workspace-context-agent.json`        | `workspace context --write`    | Canonical agent context               |
| `.workspai/reports/INDEX.json`                          | `workspace agent-sync --write` | Agent read order and report discovery |
| `.workspai/reports/workspace-explain-last-run.json`     | `workspace explain --write`    | Evidence-backed narrative             |
| `.workspai/reports/workspace-intelligence-history.json` | Verify and feedback flows      | Trends and audit history              |
| `.workspai/reports/pipeline-last-run.json`              | `pipeline --json`              | CI and release workflow result        |

See the [Artifact Catalog](docs/contracts/ARTIFACT_CATALOG.md) for the complete
writer, schema, and consumer map.

## Onboard Software

All onboarding routes feed the same Workspace Intelligence model.

| Route            | Use it when                                       | Example                                                                                                  |
| ---------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Adopt            | Existing source should stay in place              | `npx workspai adopt /path/to/project --json`                                                             |
| Import local     | Existing source should be copied into a workspace | `npx workspai import ../orders-api --workspace /path/to/workspace --json`                                |
| Import Git       | A repository should be cloned into a workspace    | `npx workspai import https://github.com/acme/orders-api.git --git --workspace /path/to/workspace --json` |
| Create workspace | You need a new governed boundary                  | `npx workspai create workspace platform --profile polyglot --yes`                                        |
| Create project   | You need a supported new scaffold                 | `npx workspai create project nextjs web --yes`                                                           |
| Interactive      | You want Workspai to guide the choice             | `npx workspai create`                                                                                    |

Adopt never moves or copies source. Create can use a Workspai-managed kit or an
available official ecosystem generator. Unsupported native create requests are
directed toward official tooling followed by adoption.

Detailed onboarding behavior:

- [Creating Workspaces and Projects](docs/creating-workspaces-and-projects.md)
- [Workspace Operations](docs/workspace-operations.md)
- [Create Planner Capabilities](docs/create-planner-capabilities.md)

## Integrations

- **AI tools:** Generate context, `AGENTS.md`, instructions, skills, and tool-specific surfaces with `workspace agent-sync`.
- **CI:** Consume structured reports and exit codes with `pipeline --json --strict`.
- **IDEs:** Read the same model, impact, verification, contract, and context artifacts used by CI.
- **MCP:** Expose read-mostly workspace evidence with `workspace mcp serve`.
- **VS Code:** Use the [Workspai extension](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode) for dashboards, impact, evidence, guided workflows, and Incident Studio.

The VS Code extension invokes this npm CLI, so command-line and visual workflows
share the same contracts and artifacts.

The Marketplace listing may temporarily retain legacy `rapidkit` wording. The
canonical package, command, metadata namespace, and Node.js requirement are the
`workspai`, `.workspai`, and Node.js `>=20.19.0` contracts documented here.

## Requirements

- Node.js `>=20.19.0`
- npm
- Python `>=3.10` only for Python/Core-dependent workflows
- Java, Go, or .NET SDK only when operating those project types

Python is not required for Python-free workspace profiles, npm-owned backend
generators, frontend generators, or workspaces created with
`--skip-python-engine`.

## Documentation

| Documentation                                                                | Purpose                                                  |
| ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| [Documentation index](docs/README.md)                                        | All user, operator, contract, and contributor docs       |
| [Command reference](docs/commands-reference.md)                              | Complete command syntax and flags                        |
| [Creating workspaces and projects](docs/creating-workspaces-and-projects.md) | Interactive, automated, location, and linking behavior   |
| [Workspace operations](docs/workspace-operations.md)                         | Adopt, import, snapshots, archives, contracts, and infra |
| [Workspace run](docs/workspace-run.md)                                       | Polyglot and affected-project execution                  |
| [Doctor command](docs/doctor-command.md)                                     | Health checks, evidence, fixes, and exit codes           |
| [CI workflows](docs/ci-workflows.md)                                         | CI examples and repository validation                    |
| [Configuration](docs/config-file-guide.md)                                   | User configuration and precedence                        |
| [Open-source scenarios](docs/OPEN_SOURCE_USER_SCENARIOS.md)                  | Role-oriented examples                                   |
| [Artifact Catalog](docs/contracts/ARTIFACT_CATALOG.md)                       | Canonical files, writers, schemas, and readers           |

Repository workflows include
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml),
[`.github/workflows/workspace-e2e-matrix.yml`](../../.github/workflows/workspace-e2e-matrix.yml),
[`.github/workflows/windows-bridge-e2e.yml`](../../.github/workflows/windows-bridge-e2e.yml),
[`.github/workflows/e2e-smoke.yml`](../../.github/workflows/e2e-smoke.yml),
[`.github/workflows/frontend-generator-smoke.yml`](../../.github/workflows/frontend-generator-smoke.yml),
[`.github/workflows/security.yml`](../../.github/workflows/security.yml), and the
maintainer-only
[`.github/workflows/release-npm-manual.yml`](../../.github/workflows/release-npm-manual.yml).
See [CI Workflows](docs/ci-workflows.md) for the complete validation and
contributor-automation map.

## Troubleshooting

| Problem                            | What to check                                  | Next step                                                                |
| ---------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| Node version is rejected           | `node --version`                               | Install Node.js `>=20.19.0`                                              |
| `npx` resolves an old CLI          | `npx workspai --version`                       | Run `npx workspai@latest --version` or update the global package         |
| Python/Core workflow cannot start  | `python3 --version`                            | Install Python 3.10+ or use a Python-free profile where supported        |
| Workspace is not detected          | Look for `.workspai-workspace`                 | Run from the workspace or pass `--workspace <path>`                      |
| Strict policy blocks a command     | `.workspai/policies.yml`                       | Inspect `workspace policy show` before changing policy                   |
| Reports are stale                  | Report timestamps                              | Re-run `pipeline` or the required chain stages                           |
| AI tools ignore workspace evidence | `AGENTS.md` and `.workspai/reports/INDEX.json` | Run `workspace agent-sync --write --refresh-context`                     |
| Project generator fails            | Runtime and network output                     | Fix the reported prerequisite, then retry or create officially and adopt |

For command-specific behavior, use the
[Command Reference](docs/commands-reference.md) and
[Documentation Index](docs/README.md).

## Contributing and Support

Workspai is MIT-licensed and developed in the open. Contributions to runtime
support, contracts, documentation, tests, and Workspace Intelligence workflows
are welcome.

From a source checkout:

```bash
npm ci
npm run build
npm test
npm run validate
```

Use the npm version declared by the repository's `packageManager` field. Python,
Go, Java, and .NET are required only for workflows that exercise those runtimes.
To validate only this package, run `npm --workspace workspai run validate` from
the monorepo root.

- Read [CONTRIBUTING.md](https://github.com/rapidkitlabs/workspai/blob/main/packages/cli/CONTRIBUTING.md) before submitting changes.
- Use [GitHub Issues](https://github.com/rapidkitlabs/workspai/issues) for reproducible bugs and feature requests.
- Use [GitHub Discussions](https://github.com/rapidkitlabs/workspai/discussions) for questions and design conversations.
- Read the [Development Guide](docs/DEVELOPMENT.md) for local workflows.
- Report vulnerabilities through the [Security Policy](docs/SECURITY.md), not a public issue.
- Review the [Changelog](https://github.com/rapidkitlabs/workspai/blob/main/packages/cli/CHANGELOG.md) before upgrading.

## License

MIT. See [LICENSE](LICENSE).
