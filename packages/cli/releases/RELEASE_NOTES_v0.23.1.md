# Release Notes — v0.23.1

**Release date:** 2026-02-22  
**Type:** Patch

## Summary

v0.23.1 improves release stability after forced audit drift, hardens Windows CI reliability, and keeps runtime dependencies clean.

## Fixed

- Restored compatible lint dependency matrix after `npm audit fix --force` drift:
  - `eslint@9`
  - `@typescript-eslint/*@8`
- Fixed Windows CI test flakiness by making workspace foundation file assertions path-separator agnostic (`/` and `\\`).

## Security

- Added npm override for `minimatch@^10.2.1` to mitigate high-severity ReDoS findings in dev dependency graphs.
- Verified runtime dependency surface remains clean via:

```bash
npm audit --omit=dev
```

## Upgrade

```bash
npm install -g rapidkit@0.23.1
```

## Verification

Recommended checks:

```bash
npm install
npm audit --omit=dev
npm run test -- src/__tests__/create-internal.test.ts src/__tests__/register-workspace.test.ts
```
