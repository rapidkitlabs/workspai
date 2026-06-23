# RapidKit v0.40.0 Release Notes

**Release Date:** June 23, 2026

## Overview

RapidKit v0.40.0 ships the **Agent Customization Pack**: a versioned, strict-gated
workflow that turns workspace intelligence artifacts into scoped instructions,
reusable prompts, portable skills, specialized agents, optional VS Code hooks, and
an MCP-ready design — so every agent surface answers with the same evidence-backed
contract.

This release builds on the graph-aware engine in v0.39.0 and closes the gap
between "we wrote AGENTS.md" and "every IDE/CI agent consumes the same professional
pack."

## What Changed

### Versioned Pack Contract

```text
contracts/agent-customization-pack.v1.json
src/contracts/agent-customization-pack-contract.ts
```

Defines:

- Presets: `minimal` and `enterprise`
- Targets: `all`, `vscode`, `agents`, `copilot`, `cursor`, `claude`, `codex`, `orca`
- Standard answer contract: Scope, Evidence, Diagnosis, Fix Plan, Run, Verify, Assumptions
- Output kinds: report, grounding, instruction, prompt, skill, skill-resource, agent, rule, hook, mcp-design
- Strict rules for path containment, English-only output, and evidence-backed claims

### Upgraded `workspace agent-sync`

Every successful sync writes:

```text
.rapidkit/reports/agent-customization-pack.json
```

New CLI options:

```bash
npx rapidkit workspace agent-sync --write --refresh-context --preset enterprise --target vscode --json
npx rapidkit workspace agent-sync --dry-run --json
npx rapidkit workspace agent-sync --strict --json
npx rapidkit workspace agent-sync --experimental-hooks   # optional, advisory hooks
```

### Enterprise VS Code / Copilot Surfaces

**Instructions**

- `.github/copilot-instructions.md`
- `.github/instructions/rapidkit-workspace.instructions.md`
- `.github/instructions/rapidkit-evidence.instructions.md`

**Prompt library**

- `rapidkit-diagnose`, `rapidkit-repair`, `rapidkit-release-readiness`,
  `rapidkit-project-onboard`, `rapidkit-adopt-project`

**Skill pack**

- `.github/skills/rapidkit-workspace-intelligence/SKILL.md`
- Resources: artifact-map, command-map, scope-model, runtime-support,
  create-planner-capabilities, mcp-tools

**Custom agents**

- `workspai-advisor`, `workspai-repair`, `workspai-release`, `workspai-project-onboarder`

Portable grounding (`AGENTS.md`, Cursor rules, Claude grounding) remains
backward-compatible.

### Optional VS Code Agent Hooks

Behind `--experimental-hooks` only:

```text
.vscode/rapidkit-agent-hooks.json
```

- Advisory mode, **disabled by default**
- Deterministic JSON hook design (PreToolUse / PostToolUse / UserPromptSubmit)
- Recorded in the pack inventory with `kind: hook`

### MCP-Ready Architecture (Design Only)

```text
.rapidkit/reports/rapidkit-mcp-design.json
.github/skills/rapidkit-workspace-intelligence/resources/mcp-tools.md
```

Read-mostly tool catalog (`getWorkspaceModel`, `getEvidenceIndex`, `getBlockers`,
`getSafeCommands`, `getProjectContext`, `getArtifact`, `refreshWorkspaceIntelligence`).
Write/repair tools require explicit approval boundaries — not enabled in this release.

### CI Drift Guard

```bash
npm run check:agent-customization-drift -- --workspace <workspace-root>
```

Fails CI when generated agent customization files drift from git after
`agent-sync --write`. Integrated into `docs/examples/ci-agent-grounding.yml`.

## Why This Matters

AI agents fail in enterprise workspaces when each tool invents its own context.
The Agent Customization Pack gives humans, CI, VS Code, Copilot, and future MCP
clients one versioned inventory of what was generated, what is stale, and how
answers must be structured — without embedding entire report trees in every prompt.

## Breaking Changes

None.

- Existing `workspace agent-sync --write` behavior is preserved.
- The pack report is additive; consumers that ignore it continue to work.
- Hooks and MCP write tools are opt-in / design-only.

## Upgrade

```bash
npm install -g rapidkit@0.40.0
```

Or within a project:

```bash
npm install --save-dev rapidkit@0.40.0
```

Recommended first run after upgrade:

```bash
npx rapidkit workspace agent-sync --write --refresh-context --preset enterprise --strict --json
```

## Verification

Validated with:

```bash
npx vitest run src/__tests__/workspace-agent-sync.test.ts
npx vitest run src/__tests__/contracts/
npx tsc --noEmit
npm run check:shared-contracts
npm run check:agent-customization-drift -- --workspace .
```
