# Workspai

## Open-Source Workspace Intelligence for Software Systems

[![npm version](https://img.shields.io/npm/v/workspai.svg?style=flat-square)](https://www.npmjs.com/package/workspai)
[![Downloads](https://img.shields.io/npm/dm/workspai.svg?style=flat-square)](https://www.npmjs.com/package/workspai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![Built by Workspai](https://img.shields.io/badge/Built%20by-Workspai-0f172a?logo=github)](https://workspai.dev)

> One workspace. One truth. Humans and AI aligned.

Workspai turns scattered projects into a governed, agent-ready workspace. It
builds one evidence-backed understanding of a software system for developers,
CI, IDEs, release automation, and AI agents.

This repository is the monorepo for the Workspai CLI and related package
boundaries.

## Install

Install the canonical CLI globally:

```bash
npm install -g workspai
workspai --help
```

Or try the latest release without a global install:

```bash
npx workspai@latest --help
```

The optional `wspai` package provides a shorter alias for `npx` workflows:

```bash
npx wspai --help
```

## Try Workspai

Connect an existing project without moving its source:

```bash
npx workspai adopt /path/to/project --json
cd ~/.workspai/workspaces/workspai
```

Execute the canonical Workspace Intelligence chain and persist its evidence:

```bash
npx workspai workspace intelligence run --for-agent codex --strict --json
```

Workspai now has durable workspace evidence that can be reused by humans and
tools:

```text
.workspai/reports/workspace-model.json
.workspai/reports/workspace-context-agent.json
.workspai/reports/INDEX.json
.workspai/reports/workspace-intelligence-run-last-run.json
AGENTS.md
```

The runner reports `sync` and baseline resolution separately from its exact
11-stage canonical chain. Exit `0` means passed, `1` means a hard execution
failure, and `2` means execution completed but evidence gates blocked readiness.
See the [Unified Workspace Intelligence Runner contract](packages/cli/docs/workspace-intelligence-runner.md).

The broader governance and release pipeline is a separate gate; it does not
replace or redefine the canonical chain:

```bash
npx workspai pipeline --json --strict
```

For installation options, complete workflows, and all commands, read the
[Workspai CLI README](packages/cli/README.md).

## What Workspace Intelligence Provides

| Capability            | Result                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| Workspace model       | A canonical view of projects, runtimes, frameworks, dependencies, commands, policies, and contracts |
| Change and impact     | Model diffs, transitive blast radius, and affected project scope                                    |
| Verification evidence | Structured health, contract, readiness, freshness, and release verdicts                             |
| Agent context         | Shared instructions, reports, skills, and grounding for AI tools                                    |
| CI and release gates  | Stable JSON artifacts and exit codes for automation                                                 |
| Explanations          | Evidence-backed reasons for blockers, affected projects, and next actions                           |

Create, import, and adopt are entry routes. They connect software to a workspace.
The core architecture then turns that durable workspace state into outputs for
each consumer:

```text
Projects and repositories
          |
          v
Canonical workspace model and dependency graph
          |
          +--> Developers: scope, health, impact, explanations
          +--> CI: JSON evidence, verification, release gates
          +--> IDEs: model, contracts, diagnostics, guided actions
          +--> AI agents: context, instructions, skills, safe commands
          +--> MCP clients: read-mostly workspace evidence
```

The canonical chain is versioned as a contract:

```text
Model -> Diff -> Impact -> Doctor + Contract Verify + Analyze -> Readiness
      -> Verify -> Context -> Agent Sync -> Explain
```

Execute and enforce that exact order with:

```bash
npx workspai workspace intelligence run --for-agent codex --strict --json
```

See the
[Workspace Intelligence chain contract](packages/cli/contracts/workspace-intelligence-chain.v1.json)
and [Artifact Catalog](packages/cli/docs/contracts/ARTIFACT_CATALOG.md).

## Packages

| Package                            | Status  | Purpose                                                                                    |
| ---------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| [`packages/cli`](packages/cli)     | Active  | Published `workspai` CLI, Workspace Intelligence engine, contracts, and user documentation |
| [`packages/wspai`](packages/wspai) | Active  | Small `wspai` alias package for short `npx` workflows                                      |
| `packages/mcp`                     | Planned | Dedicated MCP package boundary                                                             |
| `packages/sdk`                     | Planned | Public SDK package boundary                                                                |

`workspai` is the canonical npm package and command. `wspai` is an optional short
alias. Future packages remain specialized boundaries around the same Workspace
Intelligence platform.

## Explore

| Resource                         | Start here                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| CLI overview and quickstart      | [packages/cli/README.md](packages/cli/README.md)                                                               |
| Documentation index              | [packages/cli/docs/README.md](packages/cli/docs/README.md)                                                     |
| Command reference                | [packages/cli/docs/commands-reference.md](packages/cli/docs/commands-reference.md)                             |
| Workspace and project onboarding | [packages/cli/docs/creating-workspaces-and-projects.md](packages/cli/docs/creating-workspaces-and-projects.md) |
| Workspace operations             | [packages/cli/docs/workspace-operations.md](packages/cli/docs/workspace-operations.md)                         |
| Workspace Intelligence artifacts | [packages/cli/docs/contracts/ARTIFACT_CATALOG.md](packages/cli/docs/contracts/ARTIFACT_CATALOG.md)             |
| CI workflows                     | [packages/cli/docs/ci-workflows.md](packages/cli/docs/ci-workflows.md)                                         |
| Security policy                  | [packages/cli/docs/SECURITY.md](packages/cli/docs/SECURITY.md)                                                 |
| VS Code extension                | [Marketplace](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode)                    |

## Develop the Monorepo

Requirements:

- Node.js `>=20.19.0`
- npm, managed through the repository's declared package manager
- Python, Go, Java, or .NET only for workflows that exercise those runtimes

Install and validate:

```bash
npm ci
npm run build
npm test
npm run validate
```

Run CLI package checks directly:

```bash
npm --workspace workspai run validate
```

See the [Development Guide](packages/cli/docs/DEVELOPMENT.md) and
[Contributing Guide](packages/cli/CONTRIBUTING.md) before submitting a change.

## Contributing and Community

Contributions are welcome across Workspace Intelligence contracts, runtime
support, generators, documentation, tests, CI, and developer experience.

- Use [GitHub Issues](https://github.com/rapidkitlabs/workspai/issues) for reproducible bugs and feature requests.
- Use [GitHub Discussions](https://github.com/rapidkitlabs/workspai/discussions) for questions and design conversations.
- Follow the [Contributing Guide](packages/cli/CONTRIBUTING.md) for development and validation steps.
- Report vulnerabilities through the [Security Policy](packages/cli/docs/SECURITY.md), not a public issue.
- Review the [Changelog](packages/cli/CHANGELOG.md) for release history.

## Product Boundaries

Workspai is the product, npm package, and primary command surface. RapidKit Core
is the optional Python engine contract used for Python/Core-dependent workflows.
The Workspai VS Code extension is the visual consumer of the same CLI contracts
and workspace artifacts.

## License

MIT. See [LICENSE](LICENSE).
