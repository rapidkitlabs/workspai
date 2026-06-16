# Workspace Operations

Behavioral guide for import, adoption, snapshots, archives, contracts, collaboration bundles, and local infra sidecars.

Command syntax: [commands-reference.md](./commands-reference.md).

## Import and adoption

Use `import` to copy or clone an existing project into a RapidKit workspace.
Use `adopt` when the project must stay where it already lives but should become visible to RapidKit and Workspai workspace intelligence.

```bash
npx rapidkit import ../orders-api
npx rapidkit import https://github.com/acme/orders-api.git --git
npx rapidkit import ../orders-api --workspace ./my-workspace --name orders-api --json
npx rapidkit adopt ../marketing-web --workspace ./my-workspace
npx rapidkit adopt --json
```

### Import behavior

- Local folders are copied; git sources are cloned with shallow history.
- Outside any workspace (no `--workspace`), RapidKit auto-creates/reuses the managed **Workspai** workspace at `~/rapidkit/workspaces/workspai`.
- Existing workspaces under `~/Workspai/rapidkits/*` remain registered after upgrade.
- CLI prints a next-step `cd ...` hint (`suggestedCdCommand` in JSON mode).
- Failed workspace sync rolls back imported files and registry entries.

### Adopt behavior

- Source files are not moved or copied.
- Default workspace resolution matches import (`workspai` under `~/rapidkit/workspaces/`).
- Writes `.rapidkit/project.json`, `.rapidkit/adopt.json`, and `.rapidkit/adopt-readiness.json`.
- Registry and contract sync include adopted projects for `workspace model`, `workspace context`, Dashboard, and agents.
- `--dry-run --json` previews detection without writing metadata.

### JSON output (`--json`)

- `workspacePath`, `workspaceResolution` (`explicit` | `nearest` | `default-auto`)
- `defaultWorkspaceCreated`, `suggestedCdCommand`
- `importedProject` or `adoptedProject` (`name`, `path`, `stack`, `runtime`, `framework`, `supportTier`, `moduleSupport`, `confidence`, `source`)

Imported projects receive `.rapidkit/import-readiness.json`. Adopted projects add frontend-aware detection for Next.js, React, Vite, Vue, Angular, SvelteKit, Nuxt, Astro, Remix, and Solid.

## Workspace snapshots and safe project operations

```bash
npx rapidkit snapshot create before-upgrade --reason "before dependency upgrade"
npx rapidkit snapshot list
npx rapidkit snapshot inspect before-upgrade
npx rapidkit snapshot restore before-upgrade --dry-run
npx rapidkit snapshot restore before-upgrade --force
```

Project delete is safe-by-default:

```bash
npx rapidkit project archive orders-api --reason "replaced by orders-v2"
npx rapidkit project archives
npx rapidkit project restore orders-api
npx rapidkit project delete orders-api
npx rapidkit project delete orders-api --permanent --confirm orders-api
```

Lifecycle safety:

- `project delete` archives by default; permanent removal requires `--permanent --confirm <exact-name>`.
- `snapshot restore` requires `--force` unless dry-run.
- Restore, archive, and permanent delete create pre-operation metadata snapshots.
- Archive manifests live under `.rapidkit/archive/projects`.
- Audit records append to `.rapidkit/audit/events.jsonl`.
- Workspace policy can require reasons, safety snapshots, or block permanent delete via `.rapidkit/policies.yml`.

## Workspace collaboration bundle

```bash
npx rapidkit workspace share
npx rapidkit workspace share --output ./team-share.json
npx rapidkit workspace share --include-paths
npx rapidkit workspace share --no-doctor
```

Bundle includes workspace metadata, discovered projects, report index, and latest doctor evidence (unless `--no-doctor`). `--include-paths` is for internal teams only (absolute paths).

## Workspace contract registry

```bash
npx rapidkit workspace contract init
npx rapidkit workspace contract inspect
npx rapidkit workspace contract verify --strict
npx rapidkit workspace contract graph
```

Contract file: `.rapidkit/workspace.contract.json`. Verification checks schema, duplicate slugs, port collisions, and unknown dependencies.

RapidKit keeps the contract alive during `create project` and `workspace sync` without overwriting manual API/event/owner declarations.

## Portable workspace archives

```bash
npx rapidkit workspace export --output team-workspace.rapidkit-archive.zip
npx rapidkit workspace archive inspect team-workspace.rapidkit-archive.zip
npx rapidkit workspace archive verify team-workspace.rapidkit-archive.zip --strict
npx rapidkit workspace archive doctor team-workspace.rapidkit-archive.zip
npx rapidkit workspace hydrate team-workspace.rapidkit-archive.zip --output ./team-workspace
```

Export excludes dependency folders, build output, git history, logs, `.env`, and private keys by default. Use `--include-env` only for trusted internal handoffs.

## Workspace infrastructure (sidecar)

Discovery sources: Core module slugs, project `.env.example`, workspace contract env, and `.rapidkit/infra/overrides.json`.

```bash
cd my-workspace
npx rapidkit infra plan
npx rapidkit infra up
npx rapidkit infra status --strict
npx rapidkit infra down
```

Artifacts:

- `.rapidkit/infra/docker-compose.yml`
- `.rapidkit/reports/infra-plan.json`
- `.rapidkit/infra/.env.example`

## Command ownership

| Command family | Owner | Notes |
| --- | --- | --- |
| `create workspace`, `workspace`, `cache`, `mirror`, `infra` | RapidKit wrapper | Platform orchestration |
| `init` | Wrapper orchestrated | Project init; full-init alias at workspace root |
| `dev`, `test`, `build`, `start` | Runtime aware | Delegates to active project/runtime |
| `readiness` | Wrapper release gate | Env + doctor + analyze + verify + dependency gates |
| `pipeline` | Wrapper orchestrator | sync → doctor → analyze → readiness → autopilot |
| `autopilot release` | Wrapper orchestrator | End-to-end release gate evidence |
| `import` | Workspace ingestion | Rollback-safe sync |
| `adopt` | Workspace adoption | In-place linking + registry sync |
| `workspace model/context/diff/impact/verify` | Workspace intelligence | Model, context packs, blast radius |
| `snapshot` | Workspace recovery | Metadata or full snapshots |
| `project archive/restore/delete` | Project lifecycle | Safe delete with confirmation |
| `doctor` / `doctor workspace` / `doctor project` | Wrapper health | Host, workspace, and project scopes |
| `workspace run` | Workspace orchestrator | Fleet stage execution |
| `infra` | Workspace sidecar | Contract-driven local dependencies |

For doctor CI exit codes and JSON evidence fields, see [doctor-command.md](./doctor-command.md).

## See also

- [Documentation index](./README.md)
- [commands-reference.md](./commands-reference.md)
- [doctor-command.md](./doctor-command.md)
