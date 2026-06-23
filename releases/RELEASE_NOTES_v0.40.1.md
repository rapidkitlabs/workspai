# RapidKit v0.40.1 Release Notes

**Release Date:** June 23, 2026

## Overview

RapidKit v0.40.1 reframes the root CLI help (`npx rapidkit`, `--help`, `-h`, `help`)
around **Workspace Intelligence** — the same narrative as the README and Workspai
positioning — without removing any command from the reference output.

First-time users should now understand in seconds that RapidKit is a shared,
evidence-backed workspace model for humans, CI, IDEs, and AI agents — not merely
a project generator or bootstrap tool.

## What Changed

### Workspace Intelligence-First Help

Root help now opens with:

```text
Open-Source Workspace Intelligence for Software Systems

One workspace. One truth. Humans and AI aligned.
```

Followed by structured sections:

| Section | Purpose |
| ------- | ------- |
| **Workspace Lifecycle** | Create → Model → Context → Impact → Verify |
| **Workspace Intelligence** | Question-driven entry points (what exists, what agents need, what breaks, is it safe) |
| **Workspace Operations** | Create, bootstrap, create project/frontend, adopt, import |
| **Governance & Release** | analyze, readiness, pipeline, snapshot, archive |
| **Agent Grounding** | context pack, agent-sync, supported ecosystems |
| **Mental Model** | Repository → Workspace → Intelligence → Consumers |

### Full Reference Preserved

After the narrative sections, help still includes:

- Quick start — workspace workflow (including `init` / `dev`)
- Workspace profiles (`minimal` through `enterprise`)
- **Workspace commands (inside a workspace):** — complete flat list (40+ commands)
- Options (workspace creation)
- Project commands (inside a project)
- Flags clarification (`--skip-install` vs `--skip-essentials`)
- Legacy template tip (`RAPIDKIT_SHOW_LEGACY=1`)

No commands were removed from help output in this release.

### README

**Start here** now separates concerns:

- **Install** — `npm install -g rapidkit` only
- **CLI help** — `npx rapidkit --help` (first run fetches from npm; does not global-install)

The duplicate **Install** section under Requirements remains global-install only.

## Why This Matters

CLI help is the first product surface for `npx rapidkit`. When it led with
bootstrap/create/dev, users inferred "another scaffolding CLI." When it leads
with lifecycle and intelligence questions, the same commands read as operations
on a governed workspace — aligned with pipeline, agent-sync, impact, and verify.

## Breaking Changes

None.

## Upgrade

```bash
npm install -g rapidkit@0.40.1
```

Or try without global install:

```bash
npx rapidkit --help
```

## Verification

Validated with:

```bash
npm run build
npx vitest run src/__tests__/index.test.ts -t "Version and Help"
```
