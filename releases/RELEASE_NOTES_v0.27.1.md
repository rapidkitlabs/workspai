# Release Notes v0.27.1

**Release Date:** 2026-05-03
**Type:** Patch

## Summary

This patch resolves critical AI recommendation UX gaps, aligns module identity parsing with the official contract schema, and broadens coverage accounting to include previously excluded CLI-critical files.

## Highlights

- Implemented real module installation in `rapidkit ai recommend` confirmation flow.
- Updated module parsing to use `slug` as canonical module ID (contract-first for `ModulesListResponseV1`).
- Fixed keyword search to be truly case-insensitive for mixed-case tags.
- Expanded coverage policy to include high-impact paths:
  - `src/index.ts`
  - `src/commands/**`
  - `src/ai/embeddings-manager.ts`
- Added/expanded tests for:
  - AI recommend install flow
  - Embeddings manager smoke behavior
  - Ownership matrix drift guard
  - Contract parsing behavior (slug-first + keyword normalization)
- Updated extension AI command scope guidance to include `npx rapidkit readiness`.

## User Impact

### AI Users

You can now confirm recommendations and install selected modules immediately from the same AI flow, instead of receiving a placeholder message.

### Contract Reliability

Install commands generated from recommendation output are now safer in environments where module payloads use `slug` as the canonical identifier.

### Engineering Visibility

Coverage now reflects a more realistic baseline by including previously excluded CLI surfaces. The drop is expected and represents improved observability, not a regression in behavior.

## Coverage Delta (Before → After Policy Update)

- Statements: `82.06% → 60.34%` (`-21.72%`)
- Branches: `72.36% → 51.85%` (`-20.51%`)
- Functions: `92.61% → 81.06%` (`-11.55%`)
- Lines: `82.77% → 60.78%` (`-21.99%`)

## Upgrade

```bash
npm install -g rapidkit@0.27.1
```
