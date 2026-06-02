# Command Ownership Matrix

This document defines which layer owns command execution in RapidKit npm CLI (`rapidkit-npm`) versus RapidKit Core (`rapidkit-core`) to prevent runtime conflicts.

## Goals

- Keep project bootstrapping reliable across Python / Node / Go projects.
- Avoid conflicting behavior between wrapper and core CLIs.
- Make delegation behavior explicit and testable.

## Ownership Rules

### 1) Wrapper-owned commands (never forward to core)

These commands are implemented and orchestrated by `rapidkit-npm`:

- `readiness`
- `autopilot`
- `doctor`
- `import`
- `snapshot`
- `project`
- `workspace`
- `bootstrap`
- `setup`
- `cache`
- `mirror`
- `ai`
- `analyze`
- `config`
- `product`
- `shell activate`

Reason: workspace-level policy, registry, and platform orchestration live in npm wrapper.

### 2) Wrapper-orchestrated project commands

These commands are handled by npm wrapper first (runtime-aware + fallback-aware):

- `init`

Reason: `init` must guarantee dependency installation regardless of runtime and available tools. The wrapper may still call core for Python path, but wrapper owns orchestration and fallbacks.

### 3) Runtime-owned execution (hybrid)

For project lifecycle commands:

- `dev`, `start`, `build`, `test`

Dispatch policy:

- Python project → delegate to core runtime behavior.
- Node project → npm runtime adapter behavior.
- Go project → npm runtime adapter behavior.

### 4) Core fallback commands

- `lint`, `format`, `docs`

Current policy: forwarded to core by default in generic forwarding decisions.

## Why this model

A pure-core or pure-wrapper model causes regressions in mixed-language workspaces. Hybrid ownership keeps Python compatibility while letting npm wrapper enforce workspace policy and resilient cross-platform fallback behavior.

## Guard Rails

- `shouldForwardToCore()` must return `false` for wrapper-owned and wrapper-orchestrated project commands.
- Tests must assert forwarding boundary rules.
- Changes to ownership should update this file and tests together.
