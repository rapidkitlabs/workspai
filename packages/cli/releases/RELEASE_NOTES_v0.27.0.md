# Release Notes v0.27.0

**Release Date:** 2026-04-27
**Type:** Patch

## Summary

This patch fixes `workspace share` CLI option parsing so bundle export flags behave consistently in real `npx` usage.

## Highlights

- Fixed Commander action-handler binding for the workspace command path so option resolution uses the correct command context.
- Eliminated failures where `workspace share` invocations could reject valid options such as `--output`.
- Verified stable behavior for:
  - `--output <file>`
  - `--include-paths`
  - `--no-doctor`
- Kept workspace command help/contract coverage aligned to prevent future drift.

## User Impact

You can now run the share command with explicit output and evidence flags reliably:

```bash
npx rapidkit workspace share --output ./team-share.json --include-paths --no-doctor
```

## Upgrade

```bash
npm install -g rapidkit@0.27.0
```
