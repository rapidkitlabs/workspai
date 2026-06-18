# RapidKit CLI Artifact Catalog

Canonical map of **on-disk artifacts** produced by `rapidkit-npm` commands. Dashboards, VS Code extension, and CI should read paths listed here — not infer from legacy fields (e.g. `workspace.json.projects`).

## Authority layers (identity)

| Artifact | Path | Writer | Reader purpose |
| --- | --- | --- | --- |
| Workspace manifest | `.rapidkit/workspace.json` | `create workspace`, `foundation ensure`, `bootstrap` (profile) | Profile, engine, bootstrap metadata — **not** project list |
| Workspace contract | `.rapidkit/workspace.contract.json` | `workspace sync`, `workspace contract *`, import/adopt | Operational project registry (ports, contracts) |
| Registry summary | `.rapidkit/workspace-registry.v1.json` | `workspace sync`, contract sync, `registry status --refresh` | **Canonical** project count + authority for UI/CI |
| Workspace marker | `.rapidkit-workspace` | `create workspace`, `foundation ensure` | Root detection |

## Naming conventions

| Pattern | Meaning | Examples |
| --- | --- | --- |
| `*-last-run.json` | Latest gate/run evidence | `doctor-last-run.json`, `pipeline-last-run.json` |
| `*.latest.json` | Rolling alias + timestamped siblings | `bootstrap-compliance.latest.json`, `mirror-ops.latest.json` |
| Static state | Current model/state (not a single run) | `workspace-model.json`, `workspace.contract.json` |

## Governance evidence loop

| Command | Primary artifact | Schema version | JSON Schema |
| --- | --- | --- | --- |
| `doctor workspace` | `.rapidkit/reports/doctor-last-run.json` | `doctor-workspace-evidence-v1` | `contracts/doctor-workspace-evidence.v1.json` |
| `doctor project` | `.rapidkit/reports/doctor-project-last-run.json` | `doctor-project-evidence-v1` | `contracts/doctor-project-evidence.v1.json` |
| `analyze` | `.rapidkit/reports/analyze-last-run.json` | `rapidkit-analyze-v1` | `contracts/analyze-last-run.v1.json` |
| `readiness` | `.rapidkit/reports/release-readiness-last-run.json` | `release-readiness-v1` | `contracts/release-readiness.v1.json` |
| `pipeline` | `.rapidkit/reports/pipeline-last-run.json` | Also triggers agent grounding sync unless `--no-agent-sync` | `rapidkit-pipeline-v1` | `contracts/pipeline-last-run.v1.json` |
| `autopilot release` | `.rapidkit/reports/autopilot-release-last-run.json` | `autopilot-release-v1` | — |
| | `.rapidkit/reports/autopilot-release.json` | (alias, same payload) | — |

Side/cache (not gates): `.rapidkit/reports/doctor-workspace-cache.json` (`doctor-workspace-cache-v2`).

## Workspace intelligence

| Command | Artifact | Schema | Contract file |
| --- | --- | --- | --- |
| `workspace model --write` | `workspace-model.json` | `workspace-model.v1` | `contracts/workspace-intelligence/workspace-model.v1.json` |
| `workspace snapshot` | `workspace-model-snapshot.json` | `workspace-model-snapshot.v1` | `workspace-model-snapshot.v1.json` |
| `workspace diff` | `workspace-model-diff-last-run.json` | `workspace-model-diff.v1` | `workspace-model-diff.v1.json` |
| `workspace impact --from <diff>` | `workspace-impact-last-run.json` | `workspace-impact.v1` | `workspace-impact.v1.json` |
| `workspace verify` | `workspace-verify-last-run.json` | `workspace-verify.v1` | `workspace-verify.v1.json` |
| `workspace context --write` | `workspace-context-agent.json` | `workspace-context.v1` | `workspace-context.v1.json` |
| `workspace agent-sync --write` | `reports/INDEX.json`, `AGENT-GROUNDING.md`, `AGENTS.md`, Copilot/Cursor/Claude hooks | `rapidkit-agent-reports-index.v1` | — |

**CLI semantics:** `workspace diff --from` expects a **model or snapshot** baseline. `workspace impact --from` expects a **diff report**.

## Operational / platform

| Command | Artifact | Notes |
| --- | --- | --- |
| `workspace run` | `workspace-run-last.json` | `workspace-run-v1` (multi-stage: `stages.test`, `stages.build`, …) | `contracts/workspace-run-last.v1.json` |
| `autopilot release` (run stages) | same `workspace-run-last.json` | Autopilot publishes test/build into aggregate (no separate `autopilot-workspace-run-*.json`) | — |
| `bootstrap` | `bootstrap-compliance-{ts}.json`, `bootstrap-compliance.latest.json` | |
| `mirror status` | `mirror-ops-{ts}.json`, `mirror-ops.latest.json` | |
| `mirror` (transparency) | `transparency-evidence-{ts}.json`, `transparency-evidence.latest.json` | |
| `infra plan` | `infra-plan.json` | `rapidkit.infra-plan.v1` |
| `workspace archive` | `archive-manifest.json` | Root `.rapidkit/`, handoff |
| `workspace share` | `reports/share-bundle.json` (default) | Aggregation bundle |
| `import` / `adopt` | `{project}/.rapidkit/import-readiness.json` | Per project |
| `workspace contract verify` | `workspace-contract-verify-last-run.json` | CLI verify cache |

## Registry commands

| Command | Output |
| --- | --- |
| `workspace sync [--json]` | Updates contract + `workspace-registry.v1.json`; JSON includes `registrySummary` |
| `workspace registry status [--refresh] [--json]` | Reads or publishes registry summary |

## Project-scoped reports

Under `{project}/.rapidkit/reports/` when commands run at project scope (e.g. project doctor). Workspace-level reports stay under `{workspace}/.rapidkit/reports/`.

## Consumer rules

1. **Project count:** read `workspace-registry.v1.json` (or run `workspace registry status --json`).
2. **Release gates:** follow chain doctor → analyze → readiness → verify → autopilot; use `pipeline-last-run.json` for orchestration summary.
3. **Do not** use `workspace.json.projects` (removed in schema 1.0).
4. Prefer `schemaVersion` constants in each artifact; legacy `v1` on readiness is accepted when reading old reports.
5. **Agent grounding:** read `.rapidkit/reports/INDEX.json` first, then `workspace-context-agent.json`; regenerate with `workspace agent-sync --write`.

## Agent grounding files (repo hooks)

Written by `workspace agent-sync --write` (and by default after `workspace context --for-agent --write`):

| Path | Consumer |
| --- | --- |
| `AGENTS.md` | Copilot, Cursor, Claude Code, Codex, Grok (open standard) |
| `.github/copilot-instructions.md` | GitHub Copilot / VS Code Chat |
| `.github/instructions/rapidkit-evidence.instructions.md` | Copilot scoped `.rapidkit/**` rules |
| `.github/prompts/rapidkit-diagnose.prompt.md` | Copilot prompt library |
| `.github/skills/rapidkit-grounding/SKILL.md` | Copilot skills |
| `.cursor/rules/rapidkit-grounding.mdc` | Cursor always-on rule |
| `CLAUDE.md` | Claude Code (imports `@AGENTS.md`) |
| `.claude/rules/rapidkit-evidence.md` | Claude Code scoped evidence rule |
| `.rapidkit/AGENT-GROUNDING.md` | Tool-agnostic operator doc |

## See also

- [README.md](./README.md)
- [COMMAND_OWNERSHIP_MATRIX.md](./COMMAND_OWNERSHIP_MATRIX.md)
- [commands-reference.md](../commands-reference.md)
