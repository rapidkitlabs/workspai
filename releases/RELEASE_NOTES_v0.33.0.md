# Release Notes - v0.33.0

## v0.33.0 (June 10, 2026)

### Workspace Infra Sidecar, Module Layout Contract, and Foundation Ensure

This minor release adds contract-driven local infrastructure orchestration for polyglot workspaces, hardens canonical module layout discovery/verification, and introduces a foundation ensure command for workspace governance files.

## Highlights

- **Infra sidecar commands**
  - `rapidkit infra plan` discovers Postgres, Redis, mail, storage, and queue needs from modules, `.env.example`, workspace contract env, and optional overrides.
  - `rapidkit infra up|down|status` manages a generated Docker Compose stack at `.rapidkit/infra/docker-compose.yml` without overwriting the workspace's primary compose file.
  - Connection env previews prefer project `.env.example` defaults and emit evidence to `.rapidkit/reports/infra-plan.json`.

- **Module layout contract**
  - Added `contracts/module-layout.v1.json` and doctor workspace audits for canonical `src/modules/free/{category}/{module}` paths.
  - `workspace contract verify --strict` can include module-path parity via `--module-paths`.

- **Workspace foundation ensure**
  - `rapidkit workspace foundation ensure` reconciles workspace.json, policies, toolchain lock, and related foundation artifacts.

- **NestJS kit alignment**
  - NestJS standard templates now scaffold the canonical module root and TypeScript path mapping expected by layout and Core module installs.

## Upgrade

```bash
npm install -g rapidkit@0.33.0
```

## Recommended Validation

Before publishing:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run check:contracts
npm run build
npm pack --ignore-scripts --dry-run --json --silent
```

Smoke in a workspace:

```bash
npx rapidkit infra plan
npx rapidkit infra up
npx rapidkit infra status --strict
```
