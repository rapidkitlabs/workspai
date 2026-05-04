# Release Notes v0.27.2

**Release Date:** 2026-05-04
**Type:** Patch

## Summary

This patch upgrades `doctor workspace` with signal-based framework detection, richer project profiling metadata for AI/automation, and clearer advisory behavior in health summaries and docs.

## Highlights

- Replaced static framework assumptions with signal-based detection in `doctor workspace`.
- Added richer project metadata in `doctor workspace --json`:
  - `runtimeFamily`
  - `projectKind`
  - `supportTier`
  - `frameworkConfidence`
- Extended framework/runtime marker coverage across Node, Python, Go, Java, PHP, Ruby, and .NET project types.
- Improved doctor advisory summary alignment for environment/security warning context.
- Added cache-signature schema versioning and broader marker files to prevent stale framework classification reuse.
- Added regression coverage to prevent Next.js/NestJS mislabeling.
- Updated CLI docs to explicitly include `npx rapidkit readiness` and clarify advisory-only `doctor workspace --fix` behavior.

## User Impact

### Doctor Accuracy

Frontend projects (for example Next.js) are less likely to be mislabeled as backend frameworks, improving extension and AI recommendation quality.

### AI/Automation Consumers

Doctor JSON now includes richer project profile fields, enabling better downstream scoring, routing, and prompt context.

### Workspace Operations

`doctor workspace --fix` keeps executing actionable fixes only; advisory warnings remain visible without forcing unrelated shell actions.

## Upgrade

```bash
npm install -g rapidkit@0.27.2
```
