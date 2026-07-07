# Release Notes — v0.15.1 (2026-01-31)

### Highlights

- 🧠 **More robust command discovery:** The npm → Python Core bridge now handles `--help` failures gracefully by falling back to a stable bootstrap command set instead of returning partial or empty results.
- 🧪 **Improved test coverage:** Added focused unit tests for bridge internals (`pythonRapidkitExec`, bootstrap commands, and system Python probing) to prevent regressions.
- ⚙️ **CI alignment:** Updated the e2e smoke workflow to reflect the refined bridge behavior and ensure consistent results on GitHub Actions.

### Upgrade

```bash
npm install -g rapidkit@0.15.1
