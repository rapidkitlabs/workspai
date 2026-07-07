# Release Notes — v0.15.0 (2026-01-30)

### Highlights

- ✨ CLI: wrapper-level processing for `--create-workspace` and `--no-workspace` when running `rapidkit create project` outside an existing workspace. These flags are now handled by the npm wrapper and filtered from arguments sent to the Python Core.
- 🧩 `registerWorkspaceAtPath()` helper: register an existing directory as a RapidKit workspace, write `.rapidkit-workspace` marker, `.gitignore`, launcher scripts, README, and install engine (supports Poetry/venv/pipx).
- 🐍 Poetry parity: `poetry config virtualenvs.in-project true` is executed during Poetry installs so `.venv` is created in project root by default.
- 🛠 Scenario C regression fixed: the bridge no longer bootstraps a venv when system Python already has `rapidkit-core` installed.
- ✅ Tests & CI: added unit tests and focused e2e smoke + Scenario C regression tests and a GitHub Actions workflow for them.

### Upgrade

```bash
npm install -g rapidkit@0.15.0
```

### Notes

This is a stabilization release that improves UX parity with the VS Code extension and ensures safer interactions between the npm wrapper and the Python Core.
