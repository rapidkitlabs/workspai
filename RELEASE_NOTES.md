# Release Notes

## Latest Release: v0.25.7 (April 19, 2026)

### 🐹 v0.25.7 — Go Generator Template Consolidation (Patch)

This patch refactors the Go kit scaffolding internals to remove duplicated template blocks across `gofiber.standard` and `gogin.standard`, while keeping generated project behavior unchanged.

**What's New:**

- ♻️ **Shared Go generator template module**
  - Added `src/generators/go-kit-common.ts` for common builder logic.
  - Moved shared template construction for `Makefile`, `rapidkit` (shell launcher), and `rapidkit.cmd` (Windows launcher).

- 🧱 **Cleaner Go kit generators**
  - `src/generators/gofiber-standard.ts` and `src/generators/gogin-standard.ts` now focus on kit-specific variables and call shared builders.
  - Reduced code duplication and lowered maintenance cost for future Go kit changes.

- 🔒 **Pinned bootstrap tooling versions**
  - Generated launchers and make targets now use pinned tool installs for reproducibility:
    - `github.com/air-verse/air@v1.52.3`
    - `github.com/swaggo/swag/cmd/swag@v1.16.3`

- 🧹 **Simpler generated `go.mod` files**
  - Removed oversized indirect dependency blocks from default templates and kept direct dependency declarations.

**Upgrade:**

```bash
npm install -g rapidkit@0.25.7
```

[📖 Full Release Notes](./releases/RELEASE_NOTES_v0.25.7.md)

---

## v0.25.6 (April 19, 2026)

### 🔒⚡ v0.25.6 — Security Patch, Lazy Imports & Coverage (Patch)

Addresses a security advisory in devDependencies, reduces the cold-start bundle size by 51% through lazy imports, fixes an incorrect `fs-extra` import, and expands unit test coverage for error branches in the workspace creation pipeline.

**What's New:**

- 🔒 **0 vulnerabilities** (was 10: 1 critical, 7 high, 2 moderate)
  Resolved via `npm audit fix` on transitive devDependencies (`basic-ftp`, `rollup`, `flatted`, `minimatch`, `picomatch`, `vite`, `serialize-javascript`, `yaml`, `brace-expansion`). No production API changes.

- ⚡ **`dist/index.js` 258 KB → 126 KB (-51%)** via lazy imports
  Five heavy modules (`create`, `demo-kit`, `gofiber-standard`, `gogin-standard`, `doctor`) are now loaded on first use. Lightweight commands like `--version` / `--help` no longer parse all creation/doctor code at startup.

- 🚀 **Startup time 366 ms → 317 ms**

- 🐛 **Fixed `import fsExtra from 'fs-extra'`** — corrected from `import * as fsExtra` to a proper default import, avoiding subtle method-resolution issues at runtime.

- 🧪 **7 new unit tests** covering previously uncovered branches in `registerWorkspaceAtPath` and `createDemoWorkspace` (git init fail/success, poetry venv fallback, pipx install path, install throw, registry import silent fail, demo workspace git fail).

**Upgrade:**

```bash
npm install -g rapidkit@0.25.6
```

---

## v0.25.5 (April 18, 2026)

### 🪟 v0.25.5 — Windows Doctor Shadow Detection (Patch)

Prevents a Windows-specific edge case where a workspace-local `rapidkit.cmd` launcher shadows the global CLI during `rapidkit doctor --workspace`, causing unexpected behaviour.

**What's New:**

- 🪟 **Windows doctor shadow detection**
  When running `doctor --workspace` (or `doctor --scope workspace`) on Windows, the CLI now checks for a local `rapidkit.cmd` / `rapidkit.exe` in the workspace tree.
  If found, it prints a clear yellow warning and routes the doctor workflow through the npm-wrapper path directly — bypassing the ambiguous binary resolution.

- 🧪 **Extended test coverage** for the new detection logic in `phase3-commands.test.ts`

**Upgrade:**

```bash
npm install -g rapidkit@0.25.5
```

---

## v0.25.4 (April 16, 2026)

### ⚡ v0.25.4 — Update Check Caching (Patch)

Eliminates the blocking `npm view rapidkit version` network call on every CLI invocation by caching the result to disk.

**What's New:**

- ⚡ **4-hour disk cache for update checks**
  - Result is stored in `~/.rapidkit/cache/update-check.json`.
  - Subsequent invocations within 4 hours skip the network call entirely.
  - Cache is version-keyed: automatically invalidated when the installed CLI version changes.

- 🔒 **Silent failure guarantee preserved**
  - Cache write failures never block the CLI (same as before).
  - Network errors still fail silently.

**Upgrade:**

```bash
npm install -g rapidkit@0.25.4
```

---

## v0.25.3 (March 22, 2026)

### 🩺 v0.25.3 — Doctor Workspace Caching, Evidence, and Safer Auto-Fix (Patch)

This patch upgrades `rapidkit doctor workspace` performance and reliability with project-scan caching, machine-readable evidence output, post-fix verification, and safer Go auto-fix behavior when the Go toolchain is missing.

**What's New:**

- ⚡ **Workspace doctor caching + faster repeat checks**
  - Reuses cached workspace project scans when signatures are unchanged.
  - Emits cache metadata in JSON output for traceability.

- 🧾 **Evidence output for each doctor run**
  - Writes and refreshes run evidence at `.rapidkit/reports/doctor-last-run.json`.
  - Includes health summary, system checks, project findings, and cache context.

- 🧠 **Safer and clearer `doctor workspace --fix` flow**
  - URL-based fixes are recorded as manual guidance (not executed as shell commands).
  - `go mod tidy` fixes are skipped when Go is unavailable, with explicit install-and-rerun hints.
  - Post-fix verification runs automatically and refreshes evidence.

- 📚 **Doctor UX and docs alignment**
  - Clarified `doctor` (system check) vs `doctor workspace` (full workspace health) across CLI messaging and README.

**Upgrade:**

```bash
npm install -g rapidkit@0.25.3
```

[📖 Full Release Notes](./releases/RELEASE_NOTES_v0.25.3.md)

---

## Previous Release: v0.25.2 (February 27, 2026)

### 🧠 v0.25.2 — Smart Init Orchestration, Clearer Go UX, and Delegation Boundary Hardening (Patch)

This patch makes `rapidkit init` significantly more resilient across Python/Node/Go projects by enforcing wrapper-owned orchestration with runtime-aware fallbacks, then closes delegation edge-cases that caused noisy/misleading Go command failures.

**What's New:**

- 🧭 **Explicit command ownership matrix for wrapper vs core**
  - `init` is now an explicitly wrapper-orchestrated project command to keep policy + fallback behavior consistent.
  - Added contract doc: `docs/contracts/COMMAND_OWNERSHIP_MATRIX.md`.

- 🚀 **Smart multi-runtime `init` behavior**
  - Runtime inference improved via project metadata + file heuristics (`go.mod`, `package.json`, `pyproject.toml`, `requirements.txt`).
  - Python init now enforces project-local `.venv` usage and has pip-based fallback install paths.
  - Node init now attempts package-manager fallbacks when primary install path fails.

- 🛡️ **Delegation boundary hardening**
  - Go/Node lifecycle commands (`dev/start/build/test`) remain on wrapper/runtime adapter path where needed.
  - Prevents misrouting of flags (e.g., `dev --port`) into unintended local-launcher/Makefile paths.

- 🗣️ **Go missing-toolchain UX fix**
  - `rapidkit init` and lifecycle commands now emit clear actionable error messages when Go is missing, instead of silent/noisy failure patterns.

**Upgrade:**

```bash
npm install -g rapidkit@0.25.2
```

[📖 Full Release Notes](./releases/RELEASE_NOTES_v0.25.2.md)

---

## Previous Release: v0.25.1 (February 27, 2026)

### 🛠️ v0.25.1 — Poetry Fallback Stabilization, Multi-Platform Doctor Hardening, and Windows Workspace Launcher Coverage (Patch)

This patch release finalizes the new Poetry-missing fallback behavior, hardens cross-platform doctor/tool detection, and closes the remaining legacy Windows workspace launcher gap.

**What's New:**

- 🐍 **Poetry fallback stabilization in create flow**
  - If `installMethod=poetry` is selected but Poetry is unavailable, workspace creation now reliably auto-falls back to `venv` without blocking install prompts.
  - Behavior is applied consistently across interactive create and registration paths.

- 🌍 **Cross-platform detection hardening**
  - `doctor` now checks `python -m poetry` and `python -m pipx` across Python candidates when binaries are missing.
  - Tool path probing now relies on centralized platform-capability helpers rather than fragmented ad-hoc path assumptions.

- 🪟 **Legacy workspace launcher parity on Windows**
  - Workspace creation now emits both `rapidkit` and `rapidkit.cmd` wrappers so local workspace commands have native Windows entry points.

- 🧪 **Test contract alignment**
  - Updated create-internal Poetry tests to match intentional fallback semantics while preserving pipx behavior guarantees.
  - Full test suite remains green after alignment.

**Upgrade:**

```bash
npm install -g rapidkit@0.25.1
```

[📖 Full Release Notes](./releases/RELEASE_NOTES_v0.25.1.md)

---

## Latest Release: v0.25.0 (February 26, 2026)

### 🧭 v0.25.0 — Help Surface Unification, Workspace Policy/List Contract Completion, and Reliability Hardening (Minor)

This minor release unifies the root help UX across entry modes, completes workspace command contract coverage (`workspace list`, policy set/show) across docs/tests/help text, and hardens runtime/workspace reliability for production workflows.

**What's New:**

- 🧱 **Workspace command contract completion**
  - Standardized/expanded workspace command references (including `workspace list`) across:
    - root help output
    - README/docs command examples
    - docs drift guard expectations
    - CLI integration and contract test suites

- 🧪 **Phase-3 contract and process coverage expansion**
  - Extended process-level integration coverage for workspace policy operations and list flows.
  - Strengthened command contract tests for lifecycle/policy behavior and help consistency.
  - Added deterministic dist-refresh handling in CLI entry tests when build artifacts are missing/stale.

- ⚙️ **Runtime/workspace hardening updates**
  - Improved bridge/runtime execution reliability and adapter-path handling in wrapper-core integration.
  - Hardened workspace registry behavior (normalization/dedupe/pruning paths) and reduced noisy debug output.
  - Updated create/doctor/runtime flows to better align with workspace-first operations.

- 📚 **Governance and docs alignment**
  - Professionalized governance and setup docs to match current command contracts and release expectations.
  - CI/docs workflow alignment updates in:
    - `.github/workflows/ci.yml`
    - `.github/workflows/e2e-smoke.yml`

**Upgrade:**

```bash
npm install -g rapidkit@0.25.0
```

[📖 Full Release Notes](./releases/RELEASE_NOTES_v0.25.0.md)

---

## Latest Release: v0.24.2 (February 25, 2026)

### 🧱 v0.24.2 — Workspace Docs Governance, Runtime Warm-Setup Coverage, and CI Ownership Hardening (Patch)

This patch finalizes workspace-based architecture documentation and adds automated docs governance checks to keep command contracts, workflow ownership, and examples publish-safe for open-source release.

**What's New:**

- 📚 **Workspace architecture docs refresh**
  - Updated maintainer/user docs for canonical workspace lifecycle:
    - `docs/SETUP.md`
    - `docs/doctor-command.md`
    - `docs/README.md`
    - `docs/OPEN_SOURCE_USER_SCENARIOS.md`
  - Canonical doctor usage standardized to `rapidkit doctor workspace`.

- ✅ **Automated docs governance gates**
  - Added local markdown link validation:
    - `scripts/check-markdown-links.mjs`
  - Added docs drift guard for command/workflow contract presence in README:
    - `scripts/docs-drift-guard.mjs`
  - Added README command smoke script against built CLI:
    - `scripts/smoke-readme-commands.mjs`
  - Wired docs checks into npm scripts and CI Linux lane:
    - `package.json` (`check:markdown-links`, `check:docs-drift`, `smoke:readme`, `validate:docs`)
    - `.github/workflows/ci.yml`

- 🧪 **Workspace E2E ownership and focus clarity**
  - Expanded lifecycle/chaos coverage in:
    - `.github/workflows/workspace-e2e-matrix.yml`
  - Narrowed bridge-only regression smoke scope to avoid overlap:
    - `.github/workflows/e2e-smoke.yml`

- ⚙️ **Runtime/setup contract alignment**
  - Added setup cache warm hooks for Node/Go adapters and setup-time warm dependency behavior.
  - Standardized setup help/usage surface and docs with `--warm-deps`.
  - Normalized legacy doctor hints to canonical workspace command wording.

**Upgrade:**

```bash
npm install -g rapidkit@0.24.2
```

[📖 Full Release Notes](./releases/RELEASE_NOTES_v0.24.2.md)

---

## Latest Release: v0.24.1 (February 25, 2026)

### 🧩 v0.24.1 — Setup Contract Fixes, Cross-OS CI Stability, and Workspace Flow Alignment (Patch)

This patch release resolves setup/runtime contract regressions, hardens cross-OS matrix reliability, and aligns create/setup behavior with local E2E expectations.

**What's New:**

- ✅ **Setup command contract consistency**
  - `rapidkit setup <runtime>` now runs without requiring `RAPIDKIT_ENABLE_RUNTIME_ADAPTERS=1`.
  - Restores expected S-03 workspace E2E behavior for setup flows.

- 🪟🍎 **CI matrix reliability for optional Rollup binaries**
  - Added macOS arm64 optional Rollup install workaround in matrix workflow:
    - `.github/workflows/workspace-e2e-matrix.yml`
  - Complements existing Windows optional dependency workaround to prevent matrix install failures.

- 🧭 **Create/setup behavior alignment**
  - `create` prompt defaults now respect configured values (`pythonVersion`, `defaultInstallMethod`) in profile-first flows.
  - Python runtime adapter prereq check now gracefully falls back to legacy `doctor` when needed.

- 🧪 **Test and workspace hygiene updates**
  - Updated command/runtime/create tests for the current setup and profile behavior.
  - Added `.rapidkit/` to git ignore for local generated artifacts.

**Upgrade:**

```bash
npm install -g rapidkit@0.24.1
```

[📖 Full Release Notes](./releases/RELEASE_NOTES_v0.24.1.md)

---

## Latest Release: v0.24.0 (February 25, 2026)

### 🧭 v0.24.0 — Windows Bridge E2E, Mirror Lifecycle Hardening, and Runtime Adapter Stability (Minor)

This minor release improves cross-OS confidence (especially Windows), introduces a production-ready mirror lifecycle foundation, and hardens runtime adapter behavior for workspace bootstrap and project operations.

**What's New:**

- 🪟 **Windows-native CI validation**
  - Added dedicated Windows bridge workflow to validate real bridge + workspace lifecycle in native PowerShell:
    - `.github/workflows/windows-bridge-e2e.yml`
  - Added/updated workspace matrix coverage file:
    - `.github/workflows/workspace-e2e-matrix.yml`

- 🪞 **Mirror lifecycle foundation + governance docs**
  - Added mirror lifecycle engine:
    - `src/utils/mirror.ts`
  - Added enterprise/open-source operational docs and templates:
    - `docs/ENTERPRISE_GOVERNANCE_RUNBOOK.md`
    - `docs/OPEN_SOURCE_USER_SCENARIOS.md`
    - `docs/mirror-config.enterprise.example.json`
    - `docs/governance-policy.enterprise.example.json`
    - `docs/policies.workspace.example.yml`
  - Added docs example validator:
    - `scripts/validate-doc-examples.mjs`

- 🧪 **Expanded reliability test surface**
  - Added focused mirror and scenario tests:
    - `src/__tests__/mirror-lifecycle.unit.test.ts`
    - `src/__tests__/mirror-evidence-export.integration.test.ts`
    - `src/__tests__/mirror-sigstore-branches.test.ts`
    - `src/__tests__/user-level-scenarios.integration.test.ts`

- ⚙️ **Runtime adapter and bridge hardening**
  - Improved adapter environment/caching behavior for Python, Node, and Go runtimes.
  - Stabilized Python bridge execution environment handling in runtime adapter integration path.

- 📚 **UX/docs alignment and cleanup**
  - Continued alignment between CLI help, README, and command behavior.
  - Removed obsolete phase-specific docs from active documentation set.

**Upgrade:**

```bash
npm install -g rapidkit@0.24.0
```

[📖 Full Release Notes](./releases/RELEASE_NOTES_v0.24.0.md)

---


## Previous Releases

| Version                                      | Date         | Highlights                                                           |
| -------------------------------------------- | ------------ | -------------------------------------------------------------------- |
| [v0.25.3](releases/RELEASE_NOTES_v0.25.3.md) | Mar 22, 2026 | Doctor workspace caching/evidence, safer go fix gating, post-fix verification |
| [v0.25.2](releases/RELEASE_NOTES_v0.25.2.md) | Feb 27, 2026 | Smart init orchestration, wrapper/core ownership matrix, Go UX + delegation hardening |
| [v0.25.1](releases/RELEASE_NOTES_v0.25.1.md) | Feb 27, 2026 | Poetry fallback stabilization, cross-platform doctor hardening, Windows workspace launcher parity |
| [v0.25.0](releases/RELEASE_NOTES_v0.25.0.md) | Feb 26, 2026 | Help surface unification, workspace policy/list contract completion, reliability hardening |
| [v0.24.2](releases/RELEASE_NOTES_v0.24.2.md) | Feb 25, 2026 | Workspace docs governance, docs drift/link/smoke gates, CI ownership hardening |
| [v0.24.1](releases/RELEASE_NOTES_v0.24.1.md) | Feb 25, 2026 | Setup contract fixes, cross-OS matrix reliability, workspace flow alignment |
| [v0.24.0](releases/RELEASE_NOTES_v0.24.0.md) | Feb 25, 2026 | Windows-native bridge E2E, mirror lifecycle hardening, runtime adapter stability |
| [v0.23.1](releases/RELEASE_NOTES_v0.23.1.md) | Feb 22, 2026 | Audit stabilization, minimatch override, Windows CI path fix        |
| [v0.23.0](releases/RELEASE_NOTES_v0.23.0.md) | Feb 22, 2026 | Workspace architecture phases 1→4, runtime/command contracts, npm global install hotfix |
| [v0.22.0](releases/RELEASE_NOTES_v0.22.0.md) | Feb 21, 2026 | Go/Fiber + Go/Gin kits, Go command parity, Swagger DX hardening     |
| [v0.21.2](releases/RELEASE_NOTES_v0.21.2.md) | Feb 20, 2026 | Release flow modernization, npm-only policy, security/doc alignment |
| [v0.21.1](releases/RELEASE_NOTES_v0.21.1.md) | Feb 18, 2026 | Context-aware init, create workspace mode, doctor workspace scan fix |
| [v0.20.0](releases/RELEASE_NOTES_v0.20.0.md) | Feb 14, 2026 | FastAPI DDD Kit, Domain-Driven Design template, offline support      |
| [v0.19.1](releases/RELEASE_NOTES_v0.19.1.md) | Feb 12, 2026 | Dependency refresh, lockfile sync, Python template compatibility     |
| [v0.19.0](releases/RELEASE_NOTES_v0.19.0.md) | Feb 10, 2026 | AI module recommender, semantic search, config commands             |
| [v0.18.1](releases/RELEASE_NOTES_v0.18.1.md) | Feb 9, 2026  | Windows CI path normalization fix                                   |
| [v0.18.0](releases/RELEASE_NOTES_v0.18.0.md) | Feb 9, 2026  | Contract sync, modules catalog API, Python bridge reliability       |
| [v0.17.0](releases/RELEASE_NOTES_v0.17.0.md) | Feb 6, 2026  | Enhanced doctor command, workspace health monitoring, auto-fix       |
| [v0.16.5](releases/RELEASE_NOTES_v0.16.5.md) | Feb 5, 2026  | Configuration file support, doctor command, diagnostics              |
| [v0.16.4](releases/RELEASE_NOTES_v0.16.4.md) | Feb 2, 2026  | Documentation quality, test stability, code polish                  |
| [v0.16.3](releases/RELEASE_NOTES_v0.16.3.md) | Feb 1, 2026  | Template fixes, Python Core 0.2.2 compatibility, test updates       |
| [v0.16.0](releases/RELEASE_NOTES_v0.16.0.md) | Feb 1, 2026  | Workspace registry, unified signatures, cross-tool integration       |
| [v0.15.1](releases/RELEASE_NOTES_v0.15.1.md) | Jan 31, 2026 | Bridge stability, command fallback, improved test coverage           |
| [v0.15.0](releases/RELEASE_NOTES_v0.15.0.md) | Jan 30, 2026 | Core integration, workspace UX, Scenario C fix, tests & CI           |
| [v0.14.2](releases/RELEASE_NOTES_v0.14.2.md) | Jan 23, 2026 | Documentation & cleanup           |
| [v0.14.1](releases/RELEASE_NOTES_v0.14.1.md) | Dec 31, 2025 | Poetry virtualenv detection fix   |
| [v0.14.0](releases/RELEASE_NOTES_v0.14.0.md) | Dec 31, 2025 | Major dependency updates          |
| [v0.13.1](releases/RELEASE_NOTES_v0.13.1.md) | Dec 25, 2025 | Type safety & test coverage       |
| [v0.13.0](releases/RELEASE_NOTES_v0.13.0.md) | Dec 22, 2025 | NestJS test coverage boost        |
| [v0.12.9](releases/RELEASE_NOTES_v0.12.9.md) | Dec 22, 2025 | Unified npx commands              |
| [v0.12.8](releases/RELEASE_NOTES_v0.12.8.md) | Dec 13, 2025 | Windows spawn fix                 |
| [v0.12.7](releases/RELEASE_NOTES_v0.12.7.md) | Dec 13, 2025 | Windows support                   |
| [v0.12.6](releases/RELEASE_NOTES_v0.12.6.md) | Dec 12, 2025 | Quality & security infrastructure |
| [v0.12.5](releases/RELEASE_NOTES_v0.12.5.md) | Dec 6, 2025  | CI/CD cross-platform fixes        |
| [v0.12.4](releases/RELEASE_NOTES_v0.12.4.md) | Dec 6, 2025  | Shell activation UX               |
| [v0.12.3](releases/RELEASE_NOTES_v0.12.3.md) | Dec 4, 2025  | Smart CLI delegation              |
| [v0.12.2](releases/RELEASE_NOTES_v0.12.2.md) | Dec 4, 2025  | Auto-activate in init command     |
| [v0.12.1](releases/RELEASE_NOTES_v0.12.1.md) | Dec 3, 2025  | NestJS port fix                   |
| [v0.12.0](releases/RELEASE_NOTES_v0.12.0.md) | Dec 3, 2025  | NestJS support                    |
| [v0.11.3](releases/RELEASE_NOTES_v0.11.3.md) | Dec 3, 2025  | Bug fixes                         |
| [v0.11.2](releases/RELEASE_NOTES_v0.11.2.md) | Dec 3, 2025  | Improvements                      |
| [v0.11.1](releases/RELEASE_NOTES_v0.11.1.md) | Nov 28, 2025 | Features                          |
| [v0.11.0](releases/RELEASE_NOTES_v0.11.0.md) | Nov 8, 2025  | Major release                     |

For complete changelog, see [CHANGELOG.md](CHANGELOG.md).
