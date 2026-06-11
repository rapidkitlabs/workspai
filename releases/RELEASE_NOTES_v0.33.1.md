# Release Notes - v0.33.1

## v0.33.1 (June 10, 2026)

### Core Bridge Forwarding Fix for Module Lifecycle and `--dry-run`

This patch fixes command routing between the npm wrapper and RapidKit Core. Module maintenance commands now reach Python core correctly, including dry-run previews, while workspace creation and npm-owned generator flows stay on the wrapper.

## Highlights

- **Module lifecycle forwarding**
  - `rollback module`, `uninstall module`, `upgrade module`, `diff module`, and `checkpoint module` forward to core even when `--dry-run` is present.
  - Restores expected behavior for Workspai dashboard maintenance and terminal workflows.

- **Workspace vs core boundary**
  - Bare workspace names such as `my-workspace --dry-run` no longer mis-route to Python core.
  - `create workspace`, `create project`, and npm generator commands remain wrapper-owned.

- **Python context delegation**
  - In-project core delegation now supports `pip`, `poetry`, `venv`, `pipx`, and `python` engines.

- **Regression coverage**
  - Added `coreForwarding.test.ts` and extended phase3 forward tests for dry-run boundaries.

## Upgrade

```bash
npm install -g rapidkit@0.33.1
```

Or run without a global install:

```bash
npx rapidkit --version
```

## Recommended Validation

```bash
npm run build
npm test -- src/__tests__/coreForwarding.test.ts src/__tests__/phase3-commands.test.ts
```
