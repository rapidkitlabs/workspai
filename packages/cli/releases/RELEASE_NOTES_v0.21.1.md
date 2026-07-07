# Release Notes - v0.21.1

**Release Date:** February 18, 2026  
**Type:** Patch Release  
**Semver:** 0.21.1

---

## 🚀 Context-Aware Init, Workspace Command Mode, and Doctor Scan Fix

This patch improves first-run CLI onboarding and workspace reliability while keeping legacy behavior stable.

---

## ✨ What's New

### Workspace command mode (explicit)

- Added explicit workspace creation commands in npm wrapper:
  - `npx rapidkit create workspace`
  - `npx rapidkit create workspace <name>`
- Legacy flow remains fully supported:
  - `npx rapidkit <workspace-name>`

### Context-aware `npx rapidkit init`

`init` now behaves by execution context:

1. **Plain folder**
   - Auto-creates workspace with default name (`my-workspace`, fallback to `my-workspace-2`, ...)
   - Installs workspace dependencies

2. **Workspace root**
   - Installs workspace dependencies
   - Initializes detected child projects

3. **Project inside workspace**
   - Initializes only that project

### Doctor workspace scan correctness

- Workspace root `.rapidkit` is no longer miscounted as a project unless valid project markers exist.
- Added regression test coverage for workspace-root filtering logic.

---

## 📚 Documentation Updates

- Added “Fastest Start” onboarding path using context-aware `npx rapidkit init`.
- Clarified `create workspace` interactive prompt behavior.
- Updated quick-start examples to include both legacy and explicit workspace flows.

---

## 🧪 Validation

- Type checks pass.
- Scenario validation completed for:
  - init in plain folder
  - init in workspace root
  - init inside project
  - legacy workspace creation
  - explicit `create workspace <name>`

---

## 📦 Upgrade

```bash
npm install -g rapidkit@0.21.1
```

Or use the latest directly:

```bash
npx rapidkit@latest --help
```
