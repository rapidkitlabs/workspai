# Release Notes - v0.30.0

### 🔍 Workspace Analysis, AI Embeddings Packaging, and CI Evidence Readiness

This release introduces a new wrapper-owned `rapidkit analyze` command, improved AI embeddings packaging for npm release artifacts, and better CLI/docs alignment for enterprise automation.

## What's New

- 🚀 **Workspace analysis command**
  - Added `npx rapidkit analyze [--workspace <path>] [--json] [--strict] [--output <file>]`.
  - Supports structured JSON report output and strict CI gating for workspace health checks.
  - Writes JSON evidence into `.rapidkit/reports/` when `--json` is used.

- 📦 **Embeddings packaging support**
  - Added `prepack` hook to regenerate `data/modules-embeddings.json` before `npm pack` / `npm publish`.
  - Added `npm run generate-embeddings` for real OpenAI embeddings generation.
  - Kept `npm run test:prepare-embeddings` for deterministic mock embeddings during local testing.

- 🧠 **AI integration and docs alignment**
  - Updated CLI help, README docs, and command ownership matrix for the new `analyze` and AI workflows.
  - Ensured `data/modules-embeddings.json` is included as part of the published package content.

## Fixes

- Fixed deterministic AI module catalog test behavior by improving Python bridge mocking.
- Fixed `rapidkit analyze` workspace path validation and strict-mode exit behavior.

## Upgrade

```bash
npm install -g rapidkit@0.30.0
```
