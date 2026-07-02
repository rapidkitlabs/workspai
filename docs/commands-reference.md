# Commands Reference

Complete CLI syntax for the RapidKit npm wrapper. For behavior and workflows, see [workspace-operations.md](./workspace-operations.md) and [OPEN_SOURCE_USER_SCENARIOS.md](./OPEN_SOURCE_USER_SCENARIOS.md).

## Workspace lifecycle

```bash
npx rapidkit create # Prompts: workspace | project
npx rapidkit create workspace <name> [--profile <profile>] [--author <name>] [--yes]
npx rapidkit bootstrap [--profile <profile>] [--json] [--compliance-only]
npx rapidkit setup <python|node|go|java|dotnet> [--warm-deps]
npx rapidkit pipeline [--json] [--strict] [--skip-verify] [--skip-analyze] [--skip-autopilot] [--autopilot-mode <audit|safe-fix|enforce>]
npx rapidkit analyze [--workspace <path>] [--json] [--strict] [--output <file>]
npx rapidkit readiness [--json] [--strict] [--skip-verify]
npx rapidkit autopilot release [--mode <audit|safe-fix|enforce>] [--json] [--output <file>] [--since <ref>] [--parallel] [--max-workers <n>]
```

Recommended CI:

```bash
npx rapidkit pipeline --json --strict
npx rapidkit autopilot release --mode enforce --json --output .rapidkit/reports/autopilot-release.json
```

`bootstrap --json --compliance-only` runs compliance checks only (skips init). Default `bootstrap --json` still runs init after compliance checks.

```bash
npx rapidkit workspace sync [--json]
npx rapidkit workspace policy show
npx rapidkit workspace policy set <key> <value>
npx rapidkit doctor
npx rapidkit doctor workspace [--json] [--strict] [--ci] [--fix] [--plan] [--apply]
npx rapidkit doctor project [--json] [--strict] [--ci] [--fix] [--plan] [--apply]
npx rapidkit workspace list
npx rapidkit workspace foundation ensure [--force] [--json]
npx rapidkit workspace share [--output <file>] [--include-paths] [--no-doctor]
npx rapidkit workspace contract init [--force] [--json]
npx rapidkit workspace contract inspect [--json]
npx rapidkit workspace contract verify [--strict] [--json]
npx rapidkit workspace contract graph [--json]
npx rapidkit workspace model [--json] [--write] [--strict]
npx rapidkit workspace context --for-agent [codex|claude|cursor|orca] [--json] [--write] [--no-agent-sync]
npx rapidkit workspace agent-sync [--write] [--refresh-context] [--strict] [--json] [--preset minimal|enterprise] [--target all|vscode|copilot,cursor,claude] [--experimental-hooks]
npx rapidkit workspace remediation-plan [--json] [--write] [--ci] [--include-paths]
npx rapidkit workspace snapshot [--json]
npx rapidkit workspace diff --from <snapshot-or-report|git[:ref]> [--json]
npx rapidkit workspace impact --from <snapshot-or-report> [--scope project:<name>] [--json]
npx rapidkit workspace verify [--from-impact <file>] [--scope project:<name>] [--strict] [--json]
npx rapidkit workspace export --output team-workspace.rapidkit-archive.zip
npx rapidkit workspace archive inspect team-workspace.rapidkit-archive.zip [--json]
npx rapidkit workspace archive verify team-workspace.rapidkit-archive.zip [--strict] [--json]
npx rapidkit workspace archive doctor team-workspace.rapidkit-archive.zip [--strict] [--json]
npx rapidkit workspace hydrate team-workspace.rapidkit-archive.zip --output ./team-workspace
npx rapidkit import <path|git-url> [--workspace <path>] [--name <project-name>] [--git] [--json]
npx rapidkit adopt [path] [--workspace <path>] [--name <project-name>] [--dry-run] [--json]
npx rapidkit snapshot create [name] [--include-projects] [--reason <text>] [--json]
npx rapidkit snapshot list [--json]
npx rapidkit snapshot inspect <name> [--json]
npx rapidkit snapshot restore <name> [--dry-run] [--force] [--json]
npx rapidkit project archive <name> [--reason <text>] [--dry-run] [--json]
npx rapidkit project archives [--json]
npx rapidkit project restore <archive> [--name <project-name>] [--force] [--dry-run] [--json]
npx rapidkit project delete <name> [--permanent --confirm <name>] [--dry-run] [--json]
npx rapidkit workspace init
npx rapidkit workspace run <init|test|build|start> [--affected] [--blast-radius] [--since <ref>] [--parallel] [--max-workers <n>] [--strict] [--json]
npx rapidkit infra plan [--workspace <path>] [--json] [--dry-run] [--verbose]
npx rapidkit infra up [--workspace <path>] [--no-plan] [--build]
npx rapidkit infra down [--workspace <path>] [--volumes]
npx rapidkit infra status [--workspace <path>] [--json] [--strict]
```

See [workspace-run.md](./workspace-run.md) for fleet orchestration semantics.

## Project lifecycle

```bash
npx rapidkit create project <kit> <name> [--yes] [--skip-install] [--skip-git] [--output <dir>]
npx rapidkit project commands [--json]
npx rapidkit commands --scope project [--json]
npx rapidkit init
npx rapidkit dev
npx rapidkit test
npx rapidkit build
npx rapidkit start
```

Examples:

```bash
npx rapidkit create project fastapi.standard my-api --yes
npx rapidkit create project nextjs my-web --yes
```

`create frontend <id> <name>` is still accepted and routes to the same generators.

`project commands` shows the effective command contract for the current project. Core-backed FastAPI/NestJS projects can use module commands such as `add` and `modules`. Frontend apps, Go, Spring Boot, .NET, and adopted/imported repositories use runtime lifecycle commands and workspace governance while Core module mutation remains disabled.

## Operations

```bash
npx rapidkit cache <status|clear|prune|repair>
npx rapidkit mirror <status|sync|verify|rotate>
npx rapidkit infra <plan|up|down|status>
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

`mode` in `.rapidkit/policies.yml`:

- `warn` (default): report violations, continue
- `strict`: block incompatible operations

```bash
npx rapidkit workspace policy show
npx rapidkit workspace policy set mode strict
npx rapidkit workspace policy set dependency_sharing_mode shared-runtime-caches
npx rapidkit workspace policy set rules.enforce_toolchain_lock true
```

Supported keys: `mode`, `dependency_sharing_mode`, `rules.enforce_workspace_marker`, `rules.enforce_toolchain_lock`, `rules.disallow_untrusted_tool_sources`, `rules.enforce_compatibility_matrix`, `rules.require_mirror_lock_for_offline`.

## Setup and warm dependencies

`setup <runtime>` validates toolchain and updates `.rapidkit/toolchain.lock`.

`--warm-deps` adds optional dependency warm-up (Node lock/deps, Go modules). Warm-deps is non-fatal and reports `completed` / `failed` / `skipped`.

## See also

- [Documentation index](./README.md)
- [workspace-operations.md](./workspace-operations.md)
- [workspace-run.md](./workspace-run.md)
- [contracts/COMMAND_OWNERSHIP_MATRIX.md](./contracts/COMMAND_OWNERSHIP_MATRIX.md)
