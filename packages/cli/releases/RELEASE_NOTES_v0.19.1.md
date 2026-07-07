# Release Notes - v0.19.1

**Release Date:** February 12, 2026  
**Type:** Patch Release  
**Status:** Stable

## Overview

This patch release focuses on dependency freshness, compatibility improvements, and release hardening. It upgrades interactive prompt dependencies, refreshes lockfiles, and broadens generated demo Python compatibility while keeping behavior fully backward compatible.

## Changes

### ⬆️ Dependency Refresh

- Upgraded `inquirer` from `^9.2.23` to `^13.2.2`.
- Refreshed lockfiles to align transitive dependencies with the upgrade:
  - `package-lock.json`
  - `yarn.lock`

### 🧩 Compatibility Improvement

- Updated generated demo Poetry template in `src/create.ts`:
  - from: `python = "^3.10.14"`
  - to: `python = "^3.10"`
- This allows wider Python 3.10 patch compatibility without changing required major/minor version.

## Security & Quality Verification

- ✅ `npm audit --audit-level=high` reports **0 vulnerabilities**.
- ✅ `npm test` passes after dependency update (no regressions observed).

## Impact

- **Breaking changes:** None
- **Migration required:** None
- **Backward compatibility:** Full

## Installation

```bash
npm install -g rapidkit@0.19.1
```

## Upgrade

```bash
npm install -g rapidkit
```
