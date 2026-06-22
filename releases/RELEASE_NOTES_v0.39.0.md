# RapidKit v0.39.0 Release Notes

**Release Date:** June 22, 2026

## Overview

RapidKit v0.39.0 ships the **graph-aware Workspace Intelligence engine**: the
workspace model now carries a first-class, deterministic dependency graph, and
impact, verification, freshness, risk, and a new watch/daemon mode all reason
over that single graph.

This turns Workspace Intelligence from a per-project view into a
system-level understanding of how projects depend on each other — so a change is
traced through its full blast radius, verification gates the whole affected
subgraph, and staleness propagates transitively instead of relying on
timestamps.

The engine is language- and framework-agnostic. It works the same whether you
create a project with a RapidKit kit or import/adopt an existing repository, and
across Python, Node, Go, Java, .NET, and observed runtimes such as PHP, Ruby,
and Rust.

## What Changed

### First-Class Dependency Graph

The workspace model now embeds a deterministic dependency graph:

```text
contracts/workspace-intelligence/workspace-dependency-graph.v1.json
```

Edges are inferred from multiple sources and carry provenance
(`source`/`confidence`/`evidence`):

- `package-dep` — `package.json` (JS/TS), `pyproject.toml` path dependencies
  (Python), and `go.mod` replace directives (Go).
- `contract dependsOn` and event publish/subscribe — from the workspace
  contract (all runtimes).
- `code-import` — relative source imports (JS/TS).
- `manual` — authoritative overrides that win over inference.

### Graph-Aware Impact and Verify

- `workspace impact` reports a transitive blast radius with `distance`, `path`,
  and `via` per affected project, plus centrality-weighted **critical-path
  hotspots**.
- `workspace verify` gates the entire affected subgraph (changed projects plus
  their transitive dependents) and surfaces **graph integrity** issues: cycles,
  dangling edges, and orphans.

### Graph Command Surface

```bash
rapidkit workspace graph            # emit the graph + integrity + hotspots
rapidkit workspace graph explain <project>
rapidkit workspace graph dot        # Graphviz export
rapidkit workspace graph mermaid    # Mermaid export
```

### Performance: Cache and Incremental Builds

- A workspace model + graph cache keyed by a structural `inputsHash`
  (`workspace-model-cache.v1`).
- `rapidkit workspace model --incremental` rebuilds only changed projects and
  re-infers only their incident graph edges.

### Governance and Freshness

- Graph-aware transitive freshness with an explicit `fresh | stale | unknown`
  verdict in `workspace verify` — a dependency change makes every dependent
  stale deterministically.
- A definitive verify gate exposed as a `gate` object in `workspace verify
--json`; `--strict` additionally fails on `needs-attention` and `stale`
  freshness.
- Structured `policyMode` + `policyViolations[]` in the verify output so IDEs
  and CI can render policy/contract blockers directly.

### Watch / Daemon Mode

```bash
rapidkit workspace watch --json
```

Keeps the model + graph in memory and streams `workspace-watch-event.v1` change
events (`ready`/`changed`/`unchanged`/`error`) on each settled change, driven by
fast incremental rebuilds. A self-write suppression guard prevents feedback
loops, and project markers still trigger rebuilds while generated outputs are
ignored.

### History

A bounded health/impact history at
`.rapidkit/reports/workspace-intelligence-history.json`
(`workspace-intelligence-history.v1`) records each verify run for trend
analysis.

## Why This Matters

Production systems are graphs, not isolated folders. By making the dependency
graph first-class and deterministic, RapidKit gives developers, CI, IDEs, and AI
agents the same evidence-backed answer to "what does this change actually
affect, and is it safe to release?" — across any language or framework, for both
new and adopted projects.

## Language and Framework Coverage

The Workspace Intelligence consumer layer (model, graph traversal, impact,
verify, freshness, centrality, integrity, watch, history, gate, and policy) is
fully language- and framework-agnostic and behaves identically for created,
imported, and adopted projects. Automatic `code-import` edge inference is
JS/TS-only and degrades gracefully; other runtimes derive their inter-project
edges from manifests, the workspace contract, and manual overrides.

## Breaking Changes

None.

All schema additions (`workspace-impact.v1`, `workspace-verify.v1`,
`workspace-model.v1`) are additive, and the new `graph`/`watch` subcommands and
`--cache`/`--incremental`/`--strict` flags are opt-in.

## Upgrade

```bash
npm install -g rapidkit@0.39.0
```

Or within a project:

```bash
npm install --save-dev rapidkit@0.39.0
```

## Verification

Validated with:

```bash
npx vitest run        # full suite: 1517 passed, 11 skipped, 0 failures
npx tsc --noEmit
npm run check:shared-contracts
npm run test:drift
```
