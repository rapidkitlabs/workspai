# Release Notes — v0.22.0

**Release date:** 2026-02-21  
**Type:** Minor

## Summary

v0.22.0 introduces first-class Go scaffolding support in `rapidkit-npm` with new `gofiber.standard` and `gogin.standard` kits, plus command and docs-flow standardization so Go projects follow the same daily development ergonomics as other RapidKit kits.

## Added

- New npm-native Go kits:
  - `gofiber.standard`
  - `gogin.standard`
- Interactive kit picker support for Go/Fiber and Go/Gin options in `create project`.

## Changed

- Standardized generated Go project command surface:
  - `rapidkit init`
  - `rapidkit dev`
  - `rapidkit docs`
  - `rapidkit test`
  - `rapidkit build`
  - `rapidkit start`
- Improved Go developer tooling reliability:
  - Makefile and launcher commands now use explicit GOPATH binaries for `air` and `swag`.
  - Swagger generation integrated into init/dev loop for smoother local docs workflow.
- `doctor` command now includes Go toolchain checks and richer Go project health reporting.
- README expanded for Go quick-start and command usage guidance.

## Fixed

- Test/runtime stability in npm wrapper:
  - Prevented unwanted CLI delegation/bootstrap behavior under Vitest runtime.
- Timezone-sensitive edge-case test assertion now uses UTC-safe date validation.

## Important Notes

- RapidKit module installation (`add module`, `modules ...`) remains supported for FastAPI and NestJS projects.
- Go kits in this release intentionally do not support RapidKit module installation.

## Upgrade

```bash
npm install -g rapidkit@0.22.0
```

## Verification

Recommended maintainer checks:

```bash
npm test
npm run release:dry
```
