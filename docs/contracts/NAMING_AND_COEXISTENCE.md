# Naming and coexistence (Phase 4.0)

Rules for **operational intelligence** artifacts so npm CLI, VS Code extension, and agent tools share one canonical layout without duplicate generators.

## Canonical vs generated surfaces

| Layer | Canonical (workspace-native) | Generated (agent-sync) |
| ----- | ---------------------------- | ---------------------- |
| Operational playbooks | `.rapidkit/skills/{skillId}.md` | — |
| Skills index | `.rapidkit/reports/workspace-skills-index.json` | — |
| Copilot skill umbrella | — | `.github/skills/rapidkit-workspace-intelligence/SKILL.md` |
| Explain report | `.rapidkit/reports/workspace-explain-last-run.json` | — |
| Action feedback | `.rapidkit/reports/workspace-intelligence-history.json` (`kind: agent-action`) | — |

**Rule:** Never add a standalone `workspace skills generate` command. Operational skills are produced only by `workspace agent-sync --write` (extend the Agent Customization Pack).

## Skill identifiers

Built-in operational skill ids use the `rapidkit-*` prefix:

- `rapidkit-diagnose-api-failure`
- `rapidkit-release-readiness`
- `rapidkit-safe-schema-migration`
- `rapidkit-dependency-upgrade`
- `rapidkit-rename-contract`

Paths are derived from id via `operationalSkillPath()` in `src/contracts/workspace-artifact-paths.ts`.

## Command coexistence

| User intent | Command | Notes |
| ----------- | ------- | ----- |
| Project / release / blocker narrative | `workspace explain …` | Primary explain surface |
| Shorthand alias | `workspace why …` | Same parser as `explain` |
| Diff → blast radius → gates | `workspace trace --from <diff>` | Slice of explain (`kind: trace`) |
| Graph node centrality | `workspace graph explain <project>` | Graph-topology slice; see **Graph explain coexistence** below |
| Record agent outcome | `workspace feedback record --json` | Appends to history, no separate feedback file |
| MCP read bridge | `workspace mcp serve` | Read-mostly stdio JSON-RPC; maps Phase 4 explain + skills tools |

## Graph explain coexistence (4.11)

`workspace graph explain <project>` remains the **graph-topology slice** — centrality, direct/transitive dependents via `explainGraphNode` in `workspace-graph.ts`.

`workspace explain project:<name>` is the **unified narrative** — consumers, contracts, verification plan, release risk from reports.

Do not duplicate BFS/traversal: graph explain stays single-sourced in `workspace-graph.ts`; unified explain composes it when building project sections.

## Extension alignment

Schema versions advertised by `rapidkit --version --json` and `commands --json` must match files under `contracts/workspace-intelligence/`. Run `npm run sync:shared-contracts` after npm changes so `rapidkit-vscode/contracts` stays aligned.

## Answer contract (shared)

All operational skills and the workspace-intelligence Copilot skill use the same answer shape:

**Scope → Evidence → Diagnosis → Fix Plan → Run → Verify → Assumptions**

Defined in `src/contracts/standard-answer-contract.ts` and referenced by the agent customization pack.
