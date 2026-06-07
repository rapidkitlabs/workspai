# Release Notes - v0.32.0

## v0.32.0 (June 7, 2026)

### Runtime Acceptance Matrix, Release Evidence, and Audit Hardening

This release strengthens the npm CLI as the workspace-level release and verification surface for RapidKit. It focuses on local runtime acceptance evidence, safer security gates, and a clean dependency posture before publishing.

## Highlights

- **Runtime acceptance matrix**
  - Added a local runtime acceptance matrix for workspace and project commands.
  - Covers first-class project generation and command flows for FastAPI, FastAPI DDD, NestJS, Go/Fiber, Go/Gin, Spring Boot, and ASP.NET Core.
  - Keeps expensive multi-runtime acceptance checks out of GitHub Actions by default, while preserving them as explicit local release evidence.

- **Stable release evidence paths**
  - Runtime matrix reports now default to a stable system temp report directory.
  - Reports no longer disappear when the temporary generated workspace is cleaned up.
  - `--report <file>` remains available for writing evidence into a repo or artifact directory.

- **Security and dependency hardening**
  - The security workflow now fails on moderate-or-higher `npm audit` findings.
  - Refreshed vulnerable transitive dependency locks, including the Vitest test toolchain.
  - Confirmed the package audit is clean before release.

## Upgrade

```bash
npm install -g rapidkit@0.32.0
```

## Recommended Validation

Before publishing:

```bash
npm run validate
npm audit --audit-level=moderate
npm publish --dry-run --access public
```

