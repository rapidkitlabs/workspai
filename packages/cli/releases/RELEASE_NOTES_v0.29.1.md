# RapidKit v0.29.1 Release Notes

### 🛡️ Backend Import Rollback and CLI Test Stability Patch

This patch focuses on operational reliability for backend workspace imports and process-level CLI regression tests.

**What's New:**

- 🧱 **Backend import rollback hardening**
  - Failed local imports now clean up partially copied destination directories.
  - Failed git imports now clean up partially cloned destination directories.
  - Workspace source-boundary checks now use path-relative semantics instead of prefix matching for safer cross-platform behavior.

- 🧪 **CLI integration test stability**
  - Added a shared locked `dist/index.js` build helper for tests that execute the built CLI.
  - Updated integration and e2e suites to reuse the shared build helper instead of racing parallel `tsup` rebuilds.

- 🔒 **Execution and CI hardening**
  - Added a dedicated CI guard for backend project import rollback coverage.
  - Improved direct CLI bootstrap detection for generated `dist/index.js` and source-entry execution.
  - Forced stdout/stderr blocking mode for direct CLI execution to preserve short-lived subprocess output.
  - Refreshed vulnerable transitive dependency locks and cleared npm audit findings before publish.

## Upgrade

```bash
npm install -g rapidkit@0.29.1
```
