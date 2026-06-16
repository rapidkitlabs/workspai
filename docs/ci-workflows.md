# CI Workflows

Map of GitHub Actions workflows in this repository. Use this when editing CI to avoid overlapping coverage.

## Workflows

| Workflow | Path | Purpose |
| --- | --- | --- |
| Build / test matrix | `.github/workflows/ci.yml` | Build, lint, typecheck, tests, coverage, contract gates |
| Workspace E2E matrix | `.github/workflows/workspace-e2e-matrix.yml` | Cross-OS workspace lifecycle smoke; setup `--warm-deps`; cache/mirror ops |
| Windows bridge E2E | `.github/workflows/windows-bridge-e2e.yml` | Native Windows bridge and lifecycle checks |
| E2E smoke | `.github/workflows/e2e-smoke.yml` | Focused bridge regression smoke |
| Frontend generator smoke | `.github/workflows/frontend-generator-smoke.yml` | Official frontend generator drift gate |
| Security | `.github/workflows/security.yml` | Security scanning and policy checks |

## Local validation scripts

| Script | Command |
| --- | --- |
| Runtime acceptance (default) | `npm run test:runtime-matrix` |
| Runtime acceptance (full) | `npm run test:runtime-matrix:full` |
| Frontend generators (dry-run) | `npm run smoke:frontend-generators` |
| Frontend generators (network) | `npm run smoke:frontend-generators:network` |
| Docs drift guard | `npm run check:docs-drift` |
| README command smoke | `npm run smoke:readme` |

## Recommended pre-release checks

```bash
npm run validate
npm run validate:docs
npm run security
npm run security
npm run test:runtime-matrix:full
```

## See also

- [SETUP.md](./SETUP.md)
- [DEVELOPMENT.md](./DEVELOPMENT.md)
- [Documentation index](./README.md)
