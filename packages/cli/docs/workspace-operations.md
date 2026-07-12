# Workspace Operations

Behavioral guide for import, adoption, snapshots, archives, contracts, collaboration bundles, and local infra sidecars.

Command syntax: [commands-reference.md](./commands-reference.md).

## Import and adoption

Use `import` to copy or clone an existing project into a Workspai workspace.
Use `adopt` when the project must stay where it already lives but should become visible to RapidKit and Workspai workspace intelligence.

```bash
npx workspai import ../orders-api
npx workspai import https://github.com/acme/orders-api.git --git
npx workspai import ../orders-api --workspace ./my-workspace --name orders-api --json
npx workspai adopt ../marketing-web --workspace ./my-workspace
npx workspai adopt --json
```

### Import behavior

- Local folders are copied; git sources are cloned with shallow history.
- Outside any workspace (no `--workspace`), Workspai auto-creates/reuses the managed workspace at `~/.workspai/workspaces/workspai`.
- Existing workspaces under `~/rapidkit/workspaces/*` and `~/Workspai/rapidkits/*` remain registered after upgrade.
- CLI prints a next-step `cd ...` hint (`suggestedCdCommand` in JSON mode).
- Failed workspace sync rolls back imported files and registry entries.

### Adopt behavior

- Source files are not moved or copied.
- Default workspace resolution matches import (`workspai` under `~/.workspai/workspaces/`).
- Writes `.workspai/project.json`, `.workspai/adopt.json`, and `.workspai/adopt-readiness.json`.
- Registry and contract sync include adopted projects for `workspace model`, `workspace context`, Dashboard, and agents.
- `--dry-run --json` previews detection without writing metadata.

### JSON output (`--json`)

- `workspacePath`, `workspaceResolution` (`explicit` | `nearest` | `default-auto`)
- `defaultWorkspaceCreated`, `suggestedCdCommand`
- `importedProject` or `adoptedProject` (`name`, `path`, `stack`, `runtime`, `framework`, `supportTier`, `moduleSupport`, `confidence`, `source`)

Imported projects receive `.workspai/import-readiness.json`. Adopted projects add frontend-aware detection for Next.js, React, Vite, Vue, Angular, SvelteKit, Nuxt, Astro, Remix, and Solid.

## Workspace snapshots and safe project operations

```bash
npx workspai snapshot create before-upgrade --reason "before dependency upgrade"
npx workspai snapshot list
npx workspai snapshot inspect before-upgrade
npx workspai snapshot restore before-upgrade --dry-run
npx workspai snapshot restore before-upgrade --force
```

Project delete is safe-by-default:

```bash
npx workspai project archive orders-api --reason "replaced by orders-v2"
npx workspai project archives
npx workspai project restore orders-api
npx workspai project delete orders-api
npx workspai project delete orders-api --permanent --confirm orders-api
```

Lifecycle safety:

- `project delete` archives by default; permanent removal requires `--permanent --confirm <exact-name>`.
- `snapshot restore` requires `--force` unless dry-run.
- Restore, archive, and permanent delete create pre-operation metadata snapshots.
- Archive manifests live under `.workspai/archive/projects`.
- Audit records append to `.workspai/audit/events.jsonl`.
- Workspace policy can require reasons, safety snapshots, or block permanent delete via `.workspai/policies.yml`.

## Workspace collaboration bundle

```bash
npx workspai workspace share
npx workspai workspace share --output ./team-share.json
npx workspai workspace share --include-paths
npx workspai workspace share --no-doctor
```

Bundle includes workspace metadata, discovered projects, report index, and latest doctor evidence (unless `--no-doctor`). `--include-paths` is for internal teams only (absolute paths).

## Workspace contract registry

```bash
npx workspai workspace contract init
npx workspai workspace contract inspect
npx workspai workspace contract verify --strict
npx workspai workspace contract graph
```

Contract file: `.workspai/workspace.contract.json`. Verification checks schema, duplicate slugs, port collisions, and unknown dependencies.

Workspai keeps the contract alive during `create project` and `workspace sync` without overwriting manual API/event/owner declarations.

On a freshly cloned or moved workspace, `workspace sync` also repairs the
machine-local global registry entry before discovering projects. The command is
therefore safe to use as the first reconciliation step after clone. For a
legacy workspace, run `workspace foundation ensure` once to add canonical
`.workspai-workspace` and `.workspai/*` foundation files while retaining legacy
metadata as read compatibility input.

## Portable workspace archives

```bash
npx workspai workspace export --output team-workspace.workspai-archive.zip
npx workspai workspace archive inspect team-workspace.workspai-archive.zip
npx workspai workspace archive verify team-workspace.workspai-archive.zip --strict
npx workspai workspace archive doctor team-workspace.workspai-archive.zip
npx workspai workspace hydrate team-workspace.workspai-archive.zip --output ./team-workspace
```

Export excludes dependency folders, build output, git history, logs, `.env`, and private keys by default. Use `--include-env` only for trusted internal handoffs. Hydrate accepts legacy `.rapidkit-workspace` and `.rapidkit/*` archive entries, but restores them as canonical `.workspai-workspace` and `.workspai/*` paths.

## Workspace infrastructure (sidecar)

Discovery sources: Core module slugs, project `.env.example`, workspace contract env, and `.workspai/infra/overrides.json`.

```bash
cd my-workspace
npx workspai infra plan
npx workspai infra up
npx workspai infra status --strict
npx workspai infra down
```

Artifacts:

- `.workspai/infra/docker-compose.yml`
- `.workspai/reports/infra-plan.json`
- `.workspai/infra/.env.example`

## Command ownership

| Command family                                              | Owner                  | Notes                                              |
| ----------------------------------------------------------- | ---------------------- | -------------------------------------------------- |
| `create workspace`, `workspace`, `cache`, `mirror`, `infra` | Workspai CLI           | Platform orchestration                             |
| `init`                                                      | Wrapper orchestrated   | Project init; full-init alias at workspace root    |
| `dev`, `test`, `build`, `start`                             | Runtime aware          | Delegates to active project/runtime                |
| `readiness`                                                 | Wrapper release gate   | Env + doctor + analyze + verify + dependency gates |
| `pipeline`                                                  | Wrapper orchestrator   | sync → doctor → analyze → readiness → autopilot    |
| `autopilot release`                                         | Wrapper orchestrator   | End-to-end release gate evidence                   |
| `import`                                                    | Workspace ingestion    | Rollback-safe sync                                 |
| `adopt`                                                     | Workspace adoption     | In-place linking + registry sync                   |
| `workspace model/context/diff/impact/verify`                | Workspace intelligence | Model, context packs, blast radius                 |
| `snapshot`                                                  | Workspace recovery     | Metadata or full snapshots                         |
| `project archive/restore/delete`                            | Project lifecycle      | Safe delete with confirmation                      |
| `doctor` / `doctor workspace` / `doctor project`            | Wrapper health         | Host, workspace, and project scopes                |
| `workspace run`                                             | Workspace orchestrator | Fleet stage execution                              |
| `infra`                                                     | Workspace sidecar      | Contract-driven local dependencies                 |

## Verification evidence freshness

`workspace verify` treats evidence as release-gate material, not just as a file
presence check. Required project evidence must match the affected project in
`workspace-run-last.json`, and evidence generated before the current impact
report is treated as stale and blocking. Re-run the recommended commands from
`workspace impact --json` before using `workspace verify --strict` in CI.

For doctor CI exit codes and JSON evidence fields, see [doctor-command.md](./doctor-command.md).

## See also

- [Documentation index](./README.md)
- [commands-reference.md](./commands-reference.md)
- [doctor-command.md](./doctor-command.md)
