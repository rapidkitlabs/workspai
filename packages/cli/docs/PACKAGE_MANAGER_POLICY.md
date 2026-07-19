# Package Manager Policy

## Official Policy

This repository is **npm-only** for development and CI workflows.

## Why

- CI workflows use `npm ci` as the canonical install path.
- A single lockfile strategy reduces dependency drift and release variance.
- Release and E2E scripts are standardized on npm commands.

## Rules

- Use `npm install` (or `npm ci` in CI/local clean installs).
- Do not use `yarn` or `pnpm` for contributor workflows in this repository.
- Keep `package-lock.json` as the canonical lockfile.

## Enforcement

`npm run check:package-manager` from `packages/cli`, or
`npm --workspace workspai run check:package-manager` from the monorepo root,
enforces the policy in package validation and quality workflows. There is no
install-time `preinstall` guard.

## Notes

This policy applies to the Workspai monorepo itself. Generated projects may use their own package-manager conventions depending on framework and template outputs.
