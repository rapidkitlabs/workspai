# Release Notes - v0.35.0

## v0.35.0 (June 16, 2026)

### Adoption, Frontend Scaffold, and Workspace Intelligence

This release makes RapidKit npm a full workspace platform CLI: adopt existing repos in place, scaffold official frontend apps, and emit workspace intelligence artifacts for CI, Workspai, and AI agents — without requiring the VS Code extension for core workflows.

## Highlights

- **`rapidkit adopt`**
  - Link an existing local project into a workspace without moving source files.
  - Writes `.rapidkit/project.json`, `.rapidkit/adopt.json`, and `.rapidkit/adopt-readiness.json`.
  - Syncs workspace registry and contract so intelligence surfaces see adopted projects.

- **`rapidkit create frontend`**
  - Official generators for Next.js, Remix, Vite (React/Vue/Svelte/Solid/Vanilla), Nuxt, Angular, Astro, and SvelteKit.
  - Non-interactive flags for IDE/extension flows (`--yes`, `--output`, `--skip-install`, `--skip-git`).
  - Smoke coverage via `npm run smoke:frontend-generators`.

- **Workspace intelligence**
  - `workspace model`, `workspace context`, `workspace snapshot`, `workspace verify`, `workspace diff`, and `workspace impact`.
  - JSON contracts under `contracts/workspace-intelligence/` for downstream tooling parity.

- **Doctor and detection**
  - Frontend framework probes and richer project-scoped doctor evidence.
  - Node runtime detection prefers concrete frontend frameworks before generic Node/Vite fallbacks.

- **Enterprise / polyglot operations**
  - Expanded infra stack catalog, lifecycle probes, runtime executors, and node lifecycle script resolution.
  - Import-stack parity and runtime command surface updates for frontend kits and adoption.

## Upgrade

```bash
npm install -g rapidkit@0.35.0
```

Or run without a global install:

```bash
npx rapidkit@0.35.0 adopt --help
npx rapidkit@0.35.0 create frontend nextjs my-web --yes
npx rapidkit@0.35.0 workspace model --json
```

## Recommended Validation

```bash
npm run validate
npm run validate:contracts
npm run security
npm run test:runtime-matrix:full
npm run smoke:frontend-generators
```

Focused adoption and frontend regression suite:

```bash
npm test -- \
  src/__tests__/adopt-project.test.ts \
  src/__tests__/frontend-framework-contract.test.ts \
  src/__tests__/workspace-intelligence.test.ts \
  src/__tests__/workspace-model.test.ts \
  src/__tests__/doctor-frontend-signals.test.ts
```
