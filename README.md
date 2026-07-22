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

## Give AI a system map—not a directory dump

Most coding tools begin by searching files. That works until the answer crosses
a repository boundary: an API is implemented in one project, consumed in
another, deployed by a third configuration, and constrained by an ADR or release
gate somewhere else.

Workspai builds that missing system view locally:

```text
16 projects · 1 workspace
        ↓
1,738 entities · 2,244 relations · 2,106 portable proofs
        ↓
bounded agent context · impact · verify · MCP · CI evidence
```

The numbers above are from the repository's current 16-project development
fixture. They are an example, not a universal benchmark. Every entity and
relationship remains traceable to the file, contract, or provider that produced
it.

### See useful output in 60 seconds

From an existing Workspai workspace:

```bash
# Build the canonical model and evidence-backed graph.
npx workspai workspace model --write --json

# Return only the proof-carrying context needed for this question.
npx workspai workspace graph search "api endpoint" --limit 8 --json

# Measure the retrieval payload against this workspace's indexed source corpus.
npx workspai workspace graph benchmark "api endpoint" --limit 8 --json
```

The search response contains bounded entities, their nearby relations, and the
proofs needed to verify them. The complete graph stays available as a portable
artifact, but agents do not need to place the whole graph—or the whole
workspace—into every prompt.

### Measured on the current development fixture

| Measure                              | Observed value |
| ------------------------------------ | -------------: |
| Registered projects                  |             16 |
| Knowledge Graph entities             |          1,738 |
| Knowledge Graph relations            |          2,244 |
| Portable proofs                      |          2,106 |
| Readable proof-source artifacts      |            392 |
| Corpus size (`characters / 4`)       | 134,105 tokens |
| `api endpoint --limit 8` retrieval   |   2,812 tokens |
| Observed retrieval payload reduction |          97.9% |
| Observed corpus/retrieval ratio      |         47.69× |

Measured on 2026-07-21 against one 16-project development workspace. These are
fixture observations—not a universal model-cost, answer-quality, or
cross-product benchmark. The command records the exact source-model SHA-256 so
the result can be reproduced. Read the
[benchmark methodology](packages/cli/docs/graph-benchmark-methodology.md) before
quoting these numbers.

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
.workspai/reports/workspace-knowledge-graph.json
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
| Evidence graph        | Stable entities, typed relations, portable proof paths, queries, and change overlays                |
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
Canonical workspace model + project topology + evidence-backed knowledge graph
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

Ask the evidence graph for bounded, proof-carrying context instead of loading
the whole workspace into an AI prompt:

```bash
npx workspai workspace graph search "authentication endpoint" --limit 12 --json
npx workspai workspace graph benchmark "authentication endpoint" --limit 12 --json
```

The benchmark reports an explicitly estimated retrieval-payload reduction for
the current workspace; it does not claim universal model or answer-quality
savings. See the [Workspace Knowledge Graph guide](packages/cli/docs/workspace-knowledge-graph.md).

## Packages

Workspai already provides the capabilities below through the published CLI and
its versioned contracts. The package roadmap is an extraction strategy: these
capabilities will become independently installable and usable packages without
changing their current availability in `workspai`.

| Package                            | Available today                                                                                    | Future package boundary                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`packages/cli`](packages/cli)     | Published `workspai` CLI, Workspace Intelligence engine, contracts, and user documentation         | Remains the canonical orchestration layer and consumer of the independent packages       |
| [`packages/wspai`](packages/wspai) | Published short `wspai` alias for `npx` workflows                                                  | Remains an optional compatibility/convenience entry point                                |
| `packages/shared`                  | Shared Workspace Intelligence contracts and primitives are already used by the platform            | Becomes the independently consumable dependency-leaf foundation after conformance gates  |
| `packages/graph`                   | Model-derived Knowledge Graph, proof, query, overlay, benchmark, CLI, agent, and MCP capabilities  | Becomes the independent `@workspai/graph` package after public API and conformance gates |
| `packages/mcp`                     | MCP server and workspace evidence tools are available through `workspai workspace mcp serve`       | Becomes an independently installable MCP integration package                             |
| `packages/sdk`                     | Versioned schemas, command discovery, JSON outputs, and integration contracts ship with `workspai` | Becomes a typed public SDK for programmatic consumers                                    |

`workspai` is the canonical npm package and command. `wspai` is its optional
short alias. Package extraction will not remove these capabilities from the
CLI: the CLI will consume the same independent packages and continue to expose
one integrated Workspace Intelligence experience. Shared and Graph remain
private only until their documented API, conformance, standalone-value, and
publication gates pass.

## Explore

| Resource                         | Start here                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| CLI overview and quickstart      | [packages/cli/README.md](packages/cli/README.md)                                                               |
| Documentation index              | [packages/cli/docs/README.md](packages/cli/docs/README.md)                                                     |
| Command reference                | [packages/cli/docs/commands-reference.md](packages/cli/docs/commands-reference.md)                             |
| Workspace and project onboarding | [packages/cli/docs/creating-workspaces-and-projects.md](packages/cli/docs/creating-workspaces-and-projects.md) |
| Workspace operations             | [packages/cli/docs/workspace-operations.md](packages/cli/docs/workspace-operations.md)                         |
| Workspace Knowledge Graph        | [packages/cli/docs/workspace-knowledge-graph.md](packages/cli/docs/workspace-knowledge-graph.md)               |
| Benchmark methodology            | [packages/cli/docs/graph-benchmark-methodology.md](packages/cli/docs/graph-benchmark-methodology.md)           |
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

Run the unpublished package-foundation checks:

```bash
corepack npm --workspace @workspai/shared run check
corepack npm --workspace @workspai/graph run check
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
