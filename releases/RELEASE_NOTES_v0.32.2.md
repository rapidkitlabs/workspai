# Release Notes - v0.32.2

## v0.32.2 (June 8, 2026)

### Multi-OS Workspace Init and Deterministic Package Release Hardening

This patch strengthens RapidKit npm for real user machines across Linux, macOS, and Windows. It focuses on first-use reliability, mixed-runtime workspace behavior, Python bridge fallback, and release packaging determinism.

## Highlights

- **Mixed-runtime workspace init reliability**
  - `workspace run init` now continues across remaining projects when an extended-runtime project cannot initialize because its SDK is missing.
  - FastAPI and NestJS projects in the same workspace are no longer skipped just because `.NET`, Java, or another extended runtime needs setup.
  - Added regression coverage for mixed workspace initialization.

- **Python bridge fallback hardening**
  - The bridge now tries explicit Python overrides, local core virtual environments, versioned Python commands, and platform defaults before failing.
  - If one Python command exists but cannot create a virtual environment, RapidKit falls through to the next valid interpreter.
  - Release and e2e scripts now probe actual `venv` support before selecting Python.

- **Cross-platform release scripts**
  - Replaced Unix-only npm scripts with Node wrappers for drift guard, local scenario execution, package size reporting, and Husky preparation.
  - `npm pack --json` now stays parseable when Husky is disabled.
  - `prepack` validates the committed embeddings artifact offline instead of depending on `npx` downloads during release.

- **ASP.NET scaffold stability**
  - Generated ASP.NET projects now suppress missing XML documentation warnings while keeping other warnings as errors.
  - Generated `rapidkit dev` launchers now use stable `dotnet run` behavior across Linux, macOS, and Windows.

## Upgrade

```bash
npm install -g rapidkit@0.32.2
```

## Recommended Validation

Before publishing:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:runtime-matrix
npm run test:scenarios
npm run validate:docs
npm run check:contracts
npm run test:parity-contract
npm pack --ignore-scripts --dry-run --json --silent
```
