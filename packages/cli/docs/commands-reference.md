# Commands Reference

Complete CLI syntax for the Workspai CLI. For behavior and workflows, see [workspace-operations.md](./workspace-operations.md) and [OPEN_SOURCE_USER_SCENARIOS.md](./OPEN_SOURCE_USER_SCENARIOS.md).

## Workspace lifecycle

```bash
npx workspai create # Prompts: workspace | project
npx workspai create workspace <name> [--profile <profile>] [--author <name>] [--yes] [--here|--output <parent-dir>] [--skip-python-engine]
npx workspai bootstrap [--profile <profile>] [--ci] [--json] [--compliance-only]
npx workspai setup <python|node|go|java|dotnet> [--warm-deps]
npx workspai pipeline [--json] [--strict] [--skip-verify] [--skip-analyze] [--skip-autopilot] [--autopilot-mode <audit|safe-fix|enforce>]
npx workspai analyze [--workspace <path>] [--json] [--strict] [--output <file>]
npx workspai readiness [--json] [--strict] [--skip-verify]
npx workspai autopilot release [--mode <audit|safe-fix|enforce>] [--json] [--output <file>] [--since <ref>] [--parallel] [--max-workers <n>]
```

Recommended CI:

```bash
npx workspai pipeline --json --strict
npx workspai autopilot release --mode enforce --json --output .workspai/reports/autopilot-release.json
```

`bootstrap --ci --json --compliance-only` runs deterministic compliance checks only (skips init). Default `bootstrap --ci --json` still runs init after compliance checks.

`create workspace --skip-python-engine` keeps Python-aware profiles such as
`python-only`, `polyglot`, and `enterprise` available for Workspace Intelligence
while skipping the immediate `rapidkit-core` install. Use it when you want
model/context/verify/adopt/import governance first. To add the workspace-local
Python engine later for RapidKit Core module-enabled kits, create or register the
Workspai-owned project first and then run `npx workspai workspace run init` from
the workspace root. Empty skipped workspaces and arbitrary adopted/imported
Python projects keep the Python engine skipped; use `npx workspai bootstrap
--profile <profile>` only when you need to change or realign the workspace
profile.

```bash
npx workspai workspace sync [--json]
npx workspai workspace policy show
npx workspai workspace policy set <key> <value>
npx workspai doctor
npx workspai doctor workspace [--json] [--strict] [--ci] [--fix] [--plan] [--apply]
npx workspai doctor project [--json] [--strict] [--ci] [--fix] [--plan] [--apply]
npx workspai workspace list
npx workspai workspace foundation ensure [--force] [--json]
npx workspai workspace share [--output <file>] [--include-paths] [--no-doctor]
npx workspai workspace contract init [--force] [--json]
npx workspai workspace contract inspect [--json]
npx workspai workspace contract verify [--strict] [--json]
npx workspai workspace contract graph [--json]
npx workspai workspace model [--json] [--write] [--strict]
npx workspai workspace context --for-agent [codex|claude|cursor|orca] [--json] [--write] [--no-agent-sync]
npx workspai workspace agent-sync [--write] [--refresh-context] [--strict] [--json] [--preset minimal|enterprise] [--target all|vscode|copilot,cursor,claude] [--experimental-hooks]
npx workspai workspace remediation-plan [--json] [--write] [--ci] [--include-paths]
npx workspai workspace snapshot [--json]
npx workspai workspace diff --from <snapshot-or-report|git[:ref]> [--json]
npx workspai workspace impact --from <snapshot-or-report> [--scope project:<name>] [--json]
npx workspai workspace verify [--from-impact <file>] [--scope project:<name>] [--strict] [--json]
npx workspai workspace export --output team-workspace.workspai-archive.zip
npx workspai workspace archive inspect team-workspace.workspai-archive.zip [--json]
npx workspai workspace archive verify team-workspace.workspai-archive.zip [--strict] [--json]
npx workspai workspace archive doctor team-workspace.workspai-archive.zip [--strict] [--json]
npx workspai workspace hydrate team-workspace.workspai-archive.zip --output ./team-workspace
npx workspai import <path|git-url> [--workspace <path>] [--name <project-name>] [--git] [--json]
npx workspai adopt [path] [--workspace <path>] [--name <project-name>] [--dry-run] [--json]
npx workspai snapshot create [name] [--include-projects] [--reason <text>] [--json]
npx workspai snapshot list [--json]
npx workspai snapshot inspect <name> [--json]
npx workspai snapshot restore <name> [--dry-run] [--force] [--json]
npx workspai project archive <name> [--reason <text>] [--dry-run] [--json]
npx workspai project archives [--json]
npx workspai project restore <archive> [--name <project-name>] [--force] [--dry-run] [--json]
npx workspai project delete <name> [--permanent --confirm <name>] [--dry-run] [--json]
npx workspai workspace init
npx workspai workspace run <init|test|build|start> [--affected] [--blast-radius] [--since <ref>] [--parallel] [--max-workers <n>] [--strict] [--json]
npx workspai infra plan [--workspace <path>] [--json] [--dry-run] [--verbose]
npx workspai infra up [--workspace <path>] [--no-plan] [--build]
npx workspai infra down [--workspace <path>] [--volumes]
npx workspai infra status [--workspace <path>] [--json] [--strict]
```

See [workspace-run.md](./workspace-run.md) for fleet orchestration semantics.

After cloning or moving an existing workspace, `workspace sync` repairs its
machine-local global registry entry before project discovery. For workspaces
that only have legacy `.rapidkit-workspace` metadata, run `workspace foundation
ensure` to add the canonical marker and foundation without deleting legacy
compatibility inputs.

Workspace profile compatibility is enforced consistently across `create project`,
`import`, `adopt`, and `bootstrap` compliance. In default `warn` policy mode,
cross-runtime additions are allowed with a recommendation such as
`npx workspai bootstrap --profile polyglot`; in `strict` mode, mismatches are
blocked before the project is registered. Observed runtimes such as Rust, C,
and C++ are counted in the workspace runtime mix even when Workspai does not own
a native scaffold for them.

Core module/template commands are intentionally narrower than runtime detection.
RapidKit Core modules are guaranteed only for RapidKit Core module-enabled kits:
`fastapi.standard`, `fastapi.ddd`, and `nestjs.standard`. They are not enabled
for every project that happens to use a first-class framework. For example, an
arbitrary existing FastAPI application can be adopted and modeled as a
Python/FastAPI project, but module mutation remains disabled unless its RapidKit
project metadata identifies one of those module-enabled kits.

## Project lifecycle

```bash
npx workspai create project <kit> <name> [--yes] [--skip-install] [--skip-git] [--output <dir>]
npx workspai project commands [--json]
npx workspai commands --scope project [--json]
npx workspai init
npx workspai dev
npx workspai test
npx workspai build
npx workspai start
```

Examples:

```bash
npx workspai create project fastapi.standard my-api --yes
npx workspai create project nextjs my-web --yes
```

`create frontend <id> <name>` is still accepted and routes to the same generators.

`project commands` shows the effective command contract for the current project. Core-backed FastAPI/NestJS projects can use module commands such as `add` and `modules`. Frontend apps, Go, Spring Boot, .NET, and adopted/imported repositories use runtime lifecycle commands and workspace governance while Core module mutation remains disabled.

## Operations

```bash
npx workspai cache <status|clear|prune|repair>
npx workspai mirror <status|sync|verify|rotate>
npx workspai infra <plan|up|down|status>
```

See [workspace-operations.md](./workspace-operations.md#workspace-infrastructure-sidecar) for infra discovery rules.

## Profiles

- `minimal` — baseline workspace scaffolding
- `java-only` — Java-focused workspace
- `python-only` — Python-focused workspace
- `node-only` — Node.js-focused workspace
- `go-only` — Go-focused workspace
- `polyglot` — Python + Node.js + Go + Java
- `enterprise` — polyglot + governance-oriented checks

## Policy modes

`mode` in `.workspai/policies.yml`:

- `warn` (default): report violations, continue
- `strict`: block incompatible operations

```bash
npx workspai workspace policy show
npx workspai workspace policy set mode strict
npx workspai workspace policy set dependency_sharing_mode shared-runtime-caches
npx workspai workspace policy set rules.enforce_toolchain_lock true
```

Supported keys: `mode`, `dependency_sharing_mode`, `rules.enforce_workspace_marker`, `rules.enforce_toolchain_lock`, `rules.disallow_untrusted_tool_sources`, `rules.enforce_compatibility_matrix`, `rules.require_mirror_lock_for_offline`.

## Setup and warm dependencies

`setup <runtime>` validates toolchain and updates `.workspai/toolchain.lock`.

`--warm-deps` adds optional dependency warm-up (Node lock/deps, Go modules). Warm-deps is non-fatal and reports `completed` / `failed` / `skipped`.

## See also

- [Documentation index](./README.md)
- [workspace-operations.md](./workspace-operations.md)
- [workspace-run.md](./workspace-run.md)
- [contracts/COMMAND_OWNERSHIP_MATRIX.md](./contracts/COMMAND_OWNERSHIP_MATRIX.md)
