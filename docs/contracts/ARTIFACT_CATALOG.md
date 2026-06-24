# RapidKit CLI Artifact Catalog

Canonical map of **on-disk artifacts** produced by `rapidkit-npm` commands. Dashboards, VS Code extension, and CI should read paths listed here — not infer from legacy fields (e.g. `workspace.json.projects`).

## Authority layers (identity)

| Artifact           | Path                                   | Writer                                                         | Reader purpose                                             |
| ------------------ | -------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| Workspace manifest | `.rapidkit/workspace.json`             | `create workspace`, `foundation ensure`, `bootstrap` (profile) | Profile, engine, bootstrap metadata — **not** project list |
| Workspace contract | `.rapidkit/workspace.contract.json`    | `workspace sync`, `workspace contract *`, import/adopt         | Operational project registry (ports, contracts)            |
| Registry summary   | `.rapidkit/workspace-registry.v1.json` | `workspace sync`, contract sync, `registry status --refresh`   | **Canonical** project count + authority for UI/CI          |
| Workspace marker   | `.rapidkit-workspace`                  | `create workspace`, `foundation ensure`                        | Root detection                                             |

## Naming conventions

| Pattern           | Meaning                                | Examples                                                     |
| ----------------- | -------------------------------------- | ------------------------------------------------------------ |
| `*-last-run.json` | Latest gate/run evidence               | `doctor-last-run.json`, `pipeline-last-run.json`             |
| `*.latest.json`   | Rolling alias + timestamped siblings   | `bootstrap-compliance.latest.json`, `mirror-ops.latest.json` |
| Static state      | Current model/state (not a single run) | `workspace-model.json`, `workspace.contract.json`            |

## Governance evidence loop

| Command             | Primary artifact                                    | Schema version                 | JSON Schema                                   |
| ------------------- | --------------------------------------------------- | ------------------------------ | --------------------------------------------- |
| `doctor workspace`  | `.rapidkit/reports/doctor-last-run.json`            | `doctor-workspace-evidence-v1` | `contracts/doctor-workspace-evidence.v1.json` |
| `doctor project`    | `.rapidkit/reports/doctor-project-last-run.json`    | `doctor-project-evidence-v1`   | `contracts/doctor-project-evidence.v1.json`   |
| `analyze`           | `.rapidkit/reports/analyze-last-run.json`           | `rapidkit-analyze-v1`          | `contracts/analyze-last-run.v1.json`          |
| `readiness`         | `.rapidkit/reports/release-readiness-last-run.json` | `release-readiness-v1`         | `contracts/release-readiness.v1.json`         |
| `pipeline`          | `.rapidkit/reports/pipeline-last-run.json`          | `rapidkit-pipeline-v1`         | `contracts/pipeline-last-run.v1.json`         |
| `autopilot release` | `.rapidkit/reports/autopilot-release-last-run.json` | `autopilot-release-v1`         | —                                             |
|                     | `.rapidkit/reports/autopilot-release.json`          | (alias, same payload)          | —                                             |

Side/cache (not gates): `.rapidkit/reports/doctor-workspace-cache.json` (`doctor-workspace-cache-v2`).

## Workspace intelligence

| Command                          | Artifact                                                                                                                                                                           | Schema                                 | Contract file                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| `workspace model --write`        | `workspace-model.json`                                                                                                                                                             | `workspace-model.v1`                   | `contracts/workspace-intelligence/workspace-model.v1.json` |
| `workspace snapshot`             | `workspace-model-snapshot.json`                                                                                                                                                    | `workspace-model-snapshot.v1`          | `workspace-model-snapshot.v1.json`                         |
| `workspace diff`                 | `workspace-model-diff-last-run.json`                                                                                                                                               | `workspace-model-diff.v1`              | `workspace-model-diff.v1.json`                             |
| `workspace impact --from <diff>` | `workspace-impact-last-run.json`                                                                                                                                                   | `workspace-impact.v1`                  | `workspace-impact.v1.json`                                 |
| `workspace verify`               | `workspace-verify-last-run.json`                                                                                                                                                   | `workspace-verify.v1`                  | `workspace-verify.v1.json`                                 |
| `workspace context --write`      | `workspace-context-agent.json`                                                                                                                                                     | `workspace-context.v1`                 | `workspace-context.v1.json`                                |
| `workspace agent-sync --write`   | `reports/INDEX.json`, `reports/agent-customization-pack.json`, `reports/rapidkit-mcp-design.json`, `reports/workspace-skills-index.json`, `.rapidkit/skills/*.md`, `AGENT-GROUNDING.md`, `AGENTS.md`, Copilot/Cursor/Claude/VS Code agent surfaces | `rapidkit-agent-customization-pack.v1` | `contracts/agent-customization-pack.v1.json`               |
| `workspace explain --write`      | `workspace-explain-last-run.json`                                                                                                                                                  | `workspace-explain.v1`                 | `contracts/workspace-intelligence/workspace-explain.v1.json` |
| `workspace feedback record`      | `workspace-intelligence-history.json` (`kind: agent-action`)                                                                                                                       | `workspace-intelligence-history.v1`  | `contracts/workspace-intelligence/workspace-intelligence-history.v1.json` |

**CLI semantics:** `workspace diff --from` expects a **model or snapshot** baseline. `workspace impact --from` expects a **diff report**.

### Dependency graph (`workspace-dependency-graph.v1`)

The dependency graph is the first-class structure that promotes inter-project
relationships out of `workspace run`'s private logic into one versioned source
of truth consumed by `impact` (transitive blast radius), `verify`
(subgraph-scoped gating), `run --blast-radius`, and risk weighting.

| Field   | Meaning                                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `nodes` | Projects in the workspace (`id`, workspace-relative `path`).                                                                                                                               |
| `edges` | Directed `from → to` relationships (`from` depends on `to`). Each edge carries a typed `kind`, a `source` (provenance), a `confidence` bucket, and `evidence` (the files that justify it). |
| `stats` | Counts (`nodeCount`, `edgeCount`, per-source edge counts) and `hasCycle` for the integrity gate.                                                                                           |

Edge `kind` ∈ `code-import`, `package-dep`, `event-pub-sub`, `service-dependsOn`,
`shared-resource`. Edge `source` ∈ `inferred`, `contract`, `manual` (`manual`/`contract`
are authoritative and override an `inferred` edge of the same kind between the same
nodes). Canonical source: `src/contracts/workspace-dependency-graph-contract.ts`;
JSON Schema: `contracts/workspace-intelligence/workspace-dependency-graph.v1.json`.

**Inference engine.** The graph is derived deterministically by
`src/workspace-dependency-graph.ts` (`inferWorkspaceDependencyGraph`) from multiple
sources: package manifests (`package.json` deps, `pyproject.toml` path deps, `go.mod`
replace → `package-dep`), cross-boundary JS/TS source imports (`code-import`), the
workspace contract (`dependsOn` → `service-dependsOn`, matched `publishes`/`consumes`
→ `event-pub-sub`, env↔port references → `shared-resource`), and an optional manual
override file. Node/edge ordering and `hashDependencyGraph` are stable, so the graph is
embedded as a first-class field of `workspace-model.v1` (`model.graph`) on every
`buildWorkspaceModel` run; `hashModel` normalizes the embedded `graph.generatedAt` so the
structural graph participates in the model hash without causing timestamp drift.
(`model.graph` is additive/optional for pre-graph readers.)

**Manual overrides.** `.rapidkit/workspace-graph.overrides.json` (`{ "edges": [{ "from",
"to", "kind", "evidence" }] }`) declares authoritative edges that win over inference for
the same `(from, to, kind)`.

**Graph-aware impact.** `workspace impact` consumes the graph for a true transitive
blast radius: alongside `affectedProjects` (directly changed) it emits `transitiveImpact[]`
— projects reached only through the graph, each with `origin: 'transitive'`, `distance`,
the shortest dependency `path`, and `via` (edge kind). `summary.blastRadius`
(`directlyAffected`, `transitivelyAffected`, `maxDistance`, `graphEdges`) summarizes the
reach. Both arrays feed the `verificationPlan`.

**Graph-aware verify.** `workspace verify` gates the **whole affected subgraph**, not just
the changed node. `affectedSubgraph` (`directlyChanged`, `transitiveDependents`, `covered`,
`uncovered`, `unverifiable`) records coverage per project: a dependent with failed or
missing-required verification evidence becomes a `graph.subgraph.<project>` blocking reason;
missing non-required evidence escalates the verdict to `needs-attention`; a dependent with no
applicable verification command is `unverifiable` (informational, never blocking).

**Centrality-weighted risk.** `workspace impact` computes graph centrality
(`fanIn`/`fanOut`/`reach`/`betweenness`) per project; each impact item carries `centrality`,
a directly-changed critical-path hotspot escalates its risk one level, and the report lists
`criticalPathHotspots[]` (ranked by reach then betweenness). Canonical source:
`src/workspace-graph-centrality.ts` (`computeGraphCentrality`).

**Graph integrity gate.** `workspace verify` emits `graphIntegrity` (`ok`, `cycles`,
`danglingEdges`, `orphans`, `stats`). Cycles and dangling edges are blocking
(`graph.integrity.cycle` / `graph.integrity.dangling` reasons); orphans are informational.
Canonical source: `src/workspace-graph-integrity.ts` (`checkGraphIntegrity`).

**Watch / daemon mode.** `workspace watch [--json] [--once]` keeps the model + graph in
memory and streams `workspace-watch-event.v1` records (`ready`/`changed`/`unchanged`/`error`)
on each settled change, driven by graph-aware incremental rebuilds. Events carry changed/added/
removed projects, graph edge deltas, structural `modelHash`, and `mode`/`durationMs`. Canonical
source: `src/workspace-watch.ts`.

**Health/impact history.** Each `workspace verify` run appends a compact record to
`.rapidkit/reports/workspace-intelligence-history.json` (`workspace-intelligence-history.v1`),
a ring buffer capped at the 50 most-recent entries (verdict, risk, freshness, gate, counts).
Canonical source: `src/workspace-history.ts`.

**Verify gate + policy violations.** `workspace verify --json` emits a `gate`
object (`passed`, `mode`, `exitCode`, `reasons`) from `evaluateWorkspaceVerifyGate` — the
definitive pre-action gate (default fails on `blocked`; `--strict` also fails on
`needs-attention` and `stale` freshness). It also emits `policyMode` + `policyViolations[]`
(model validation issues + contract `violations`); in `enforce` mode error-severity violations
block, in `warn` mode they escalate to needs-attention.

**Graph-aware freshness.** `workspace verify` emits a `freshness` block
(`verdict: fresh|stale|unknown`, `changed`/`added`/`removed`, `projectHashes`). Each project's
`transitiveInputsHash` chains its own content hash with its transitive dependencies' hashes, so
a dependency change makes every dependent stale deterministically. The verdict compares against
the previously written verify report. Canonical source: `src/workspace-graph-freshness.ts`.

**Graph command surface.** `workspace graph` emits the graph plus integrity + hotspots;
`workspace graph explain <project>` returns centrality and direct/transitive relationships;
`workspace graph dot|mermaid` render deterministic visualizations. Canonical source:
`src/workspace-graph.ts`. The `graph` subcommand is part of `WORKSPACE_SUBCOMMANDS` and is
published via `runtime-command-surface.v1` for IDE/CI capability detection.

### Model cache (`workspace-model-cache.v1`)

On-disk path: `.rapidkit/cache/workspace-model.v1.json`. Opt-in (`workspace model --cache`)
cache keyed by `inputsHash` — a deterministic fingerprint of the project set, per-project
manifest contents, workspace files (contract/workspace.json/policies), build flags, and CLI
version. On a hit the stored model is returned byte-for-byte; on a miss it is rebuilt and
rewritten. Canonical source: `src/workspace-model-cache.ts` (`computeModelInputsHash`,
`buildWorkspaceModelCached`). Granularity is manifest/project-set level, not per-source-file.

The envelope also stores per-project signatures (`computeProjectSignatures`: manifest hashes +
a source fingerprint of `path:size:mtime`) and workspace-file signatures, powering
`workspace model --incremental` (`buildWorkspaceModelIncremental`): unchanged project models are
reused and the dependency graph re-infers only edges incident to changed projects
(`inferWorkspaceDependencyGraphIncremental`). It falls back to a full rebuild on workspace-file
changes or project renames, and rescans code-imports fully when the node set changes. Reported
modes: `full` / `incremental` / `unchanged`.

### Freshness metadata (`rapidkit-freshness-metadata-v1`)

Intelligence reports carry a shared freshness envelope so any consumer (CLI
`workspace verify`, Workspai, CI) can detect staleness **without** re-running the
whole chain:

| Field         | Meaning                                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `generatedAt` | ISO-8601 timestamp the report was produced.                                                                             |
| `inputsHash`  | Stable sha256 of the inputs that produced the report. If a freshly recomputed inputs hash differs, the report is stale. |

Canonical source: `src/contracts/freshness-metadata-contract.ts`
(`computeInputsHash`, `buildFreshnessMetadata`, `assessFreshness`). Verdicts:
`fresh` (hashes match), `stale` (hashes differ), `unknown` (either side missing,
e.g. legacy reports).

### Run correlation (`runId`)

When a command runs through the CLI with the structured log stream active, the
persisted intelligence artifacts (`workspace-model.json`, `workspace-model-snapshot.json`,
`workspace-model-diff-last-run.json`, `workspace-impact*.json`, `workspace-context-agent.json`)
carry a top-level `runId`. It matches the `runId` on the `cli-log-event.v1` stream
(`run.started`/`progress`/`run.completed`), so a consumer can tie an on-disk report
to the exact run that produced it. `runId` is added at write time only and is
ignored by `modelHash`/diff comparisons, so deterministic hashing is unaffected.
Canonical source: `src/observability/run-correlation.ts` (`attachRunCorrelation`).

## Operational / platform

| Command                          | Artifact                                                               | Notes                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------- |
| `workspace run`                  | `workspace-run-last.json`                                              | `workspace-run-v1` (multi-stage: `stages.test`, `stages.build`, …)                           | `contracts/workspace-run-last.v1.json` |
| `autopilot release` (run stages) | same `workspace-run-last.json`                                         | Autopilot publishes test/build into aggregate (no separate `autopilot-workspace-run-*.json`) | —                                      |
| `bootstrap`                      | `bootstrap-compliance-{ts}.json`, `bootstrap-compliance.latest.json`   |                                                                                              |
| `mirror status`                  | `mirror-ops-{ts}.json`, `mirror-ops.latest.json`                       |                                                                                              |
| `mirror` (transparency)          | `transparency-evidence-{ts}.json`, `transparency-evidence.latest.json` |                                                                                              |
| `infra plan`                     | `infra-plan.json`                                                      | `rapidkit.infra-plan.v1`                                                                     |
| `workspace archive`              | `archive-manifest.json`                                                | Root `.rapidkit/`, handoff                                                                   |
| `workspace share`                | `reports/share-bundle.json` (default)                                  | Aggregation bundle                                                                           |
| `import` / `adopt`               | `{project}/.rapidkit/import-readiness.json`                            | Per project                                                                                  |
| `workspace contract verify`      | `workspace-contract-verify-last-run.json`                              | CLI verify cache                                                                             |

## Static capability contracts

| Contract                                        | Schema version                            | Consumer purpose                                                                                 |
| ----------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `contracts/runtime-command-surface.v1.json`     | `rapidkit-runtime-command-surface-v1`     | Runtime commands, scaffold kits, and create planner summary                                      |
| `contracts/create-planner-capabilities.v1.json` | `rapidkit-create-planner-capabilities-v1` | Native create, external-create-adopt, and adopt-only lanes for CLI, CI, VS Code, and AI planners |

## Observability stream (not on-disk)

Separate from the on-disk artifacts above, `rapidkit-npm` emits a structured
**NDJSON log stream on stderr** when `--log-format json` (or `RAPIDKIT_LOG_FORMAT=json`)
is set. This is the deterministic progress/outcome channel for IDEs and CI.

| Stream                  | Schema version     | Contract file                     | Doc                                                  |
| ----------------------- | ------------------ | --------------------------------- | ---------------------------------------------------- |
| CLI log events (stderr) | `cli-log-event-v1` | `contracts/cli-log-event.v1.json` | [CLI_LOG_EVENT_STREAM.md](./CLI_LOG_EVENT_STREAM.md) |

**Channel rule:** command **results** go to stdout (`--json`); **progress/lifecycle**
events go to stderr (`--log-format json`). The two never mix.

## Registry commands

| Command                                          | Output                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `workspace sync [--json]`                        | Updates contract + `workspace-registry.v1.json`; JSON includes `registrySummary` |
| `workspace registry status [--refresh] [--json]` | Reads or publishes registry summary                                              |

## Project-scoped reports

Under `{project}/.rapidkit/reports/` when commands run at project scope (e.g. project doctor). Workspace-level reports stay under `{workspace}/.rapidkit/reports/`.

## Consumer rules

1. **Project count:** read `workspace-registry.v1.json` (or run `workspace registry status --json`).
2. **Release gates:** follow chain doctor → analyze → readiness → verify → autopilot; use `pipeline-last-run.json` for orchestration summary.
3. **Do not** use `workspace.json.projects` (removed in schema 1.0).
4. Prefer `schemaVersion` constants in each artifact; legacy `v1` on readiness is accepted when reading old reports.
5. **Agent customization:** read `.rapidkit/reports/agent-customization-pack.json` first for generated surfaces, then `.rapidkit/reports/INDEX.json` and `workspace-context-agent.json`; regenerate with `workspace agent-sync --write --refresh-context --preset enterprise`.

## Agent customization files (repo hooks)

Written by `workspace agent-sync --write --refresh-context --preset enterprise` (and by default after `workspace context --for-agent --write`):

| Path                                                                    | Consumer                                                       |
| ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| `AGENTS.md`                                                             | Copilot, Cursor, Claude Code, Codex, Grok (open standard)      |
| `.github/copilot-instructions.md`                                       | GitHub Copilot / VS Code Chat                                  |
| `.github/instructions/rapidkit-workspace.instructions.md`               | Copilot workspace scope and command discipline                 |
| `.github/instructions/rapidkit-evidence.instructions.md`                | Copilot scoped `.rapidkit/**` rules                            |
| `.github/prompts/rapidkit-diagnose.prompt.md`                           | Copilot prompt library                                         |
| `.github/prompts/rapidkit-repair.prompt.md`                             | Copilot repair workflow prompt                                 |
| `.github/prompts/rapidkit-release-readiness.prompt.md`                  | Copilot release readiness workflow prompt                      |
| `.github/prompts/rapidkit-project-onboard.prompt.md`                    | Copilot project onboarding workflow prompt                     |
| `.github/prompts/rapidkit-adopt-project.prompt.md`                      | Copilot adopt/import workflow prompt                           |
| `.github/skills/rapidkit-grounding/SKILL.md`                            | Copilot skills                                                 |
| `.github/skills/rapidkit-workspace-intelligence/SKILL.md`               | Enterprise Workspace Intelligence skill                        |
| `.github/skills/rapidkit-workspace-intelligence/resources/mcp-tools.md` | Future MCP tool design reference                               |
| `.github/agents/workspai-advisor.agent.md`                              | Read-only workspace advisor agent                              |
| `.github/agents/workspai-repair.agent.md`                               | Blocker repair agent                                           |
| `.github/agents/workspai-release.agent.md`                              | Release safety agent                                           |
| `.github/agents/workspai-project-onboarder.agent.md`                    | Project onboarding agent                                       |
| `.cursor/rules/rapidkit-grounding.mdc`                                  | Cursor always-on rule                                          |
| `CLAUDE.md`                                                             | Claude Code (imports `@AGENTS.md`)                             |
| `.claude/rules/rapidkit-evidence.md`                                    | Claude Code scoped evidence rule                               |
| `.rapidkit/AGENT-GROUNDING.md`                                          | Tool-agnostic operator doc                                     |
| `.rapidkit/reports/agent-customization-pack.json`                       | Versioned output inventory, target matrix, drift state         |
| `.rapidkit/reports/rapidkit-mcp-design.json`                            | Read-mostly MCP-ready design manifest                          |
| `.vscode/rapidkit-agent-hooks.json`                                     | Optional advisory VS Code agent hooks (`--experimental-hooks`) |

## See also

- [README.md](./README.md)
- [COMMAND_OWNERSHIP_MATRIX.md](./COMMAND_OWNERSHIP_MATRIX.md)
- [CLI_LOG_EVENT_STREAM.md](./CLI_LOG_EVENT_STREAM.md)
- [commands-reference.md](../commands-reference.md)
