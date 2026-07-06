# RapidKit v0.42.0 Release Notes

**Release Date:** July 6, 2026

## Overview

RapidKit v0.42.0 makes Workspace Intelligence usable without forcing every
workspace to install the workspace-local Python engine up front. This release
adds a clean skipped-engine path, tightens profile/runtime compatibility, and
limits module mutation to RapidKit-owned module-enabled kits where RapidKit can
provide a real guarantee.

The result is a clearer contract:

- Workspace Intelligence can model, govern, verify, adopt, and import projects
  without `rapidkit-core`.
- The Python engine can be installed later when a RapidKit module-enabled kit
  actually needs it.
- Arbitrary projects can enter the workspace without pretending they support
  RapidKit module mutation.

## What Changed

### Optional Python engine

Python-aware profiles can now skip the immediate `rapidkit-core` install:

```bash
npx rapidkit create workspace my-wsp --profile polyglot --skip-python-engine --yes
cd my-wsp
npx rapidkit workspace model --json
```

Skipped workspaces record explicit metadata:

- `.rapidkit/workspace.json`
- `.rapidkit-workspace`
- `.rapidkit/toolchain.lock`

The local `rapidkit` launcher also explains that the Python engine was
intentionally skipped and points users to npm-owned workspace commands.

### Python-free workspace integrity

Python-free profiles no longer create Python engine files in the workspace root:

- `minimal`
- `java-only`
- `node-only`
- `go-only`
- `dotnet-only`

These workspaces now stay clean: no root-level `pyproject.toml`, `poetry.toml`,
`.python-version`, or `.venv` is created unless the user intentionally opts into
the Python engine later.

### Module-enabled kit gate

RapidKit modules are guaranteed only for RapidKit-owned module-enabled kits:

- `fastapi.standard`
- `fastapi.ddd`
- `nestjs.standard`

Existing or imported projects can still be adopted, modeled, verified, and
governed. Module mutation remains disabled unless the project metadata identifies
one of the supported RapidKit kits.

### Profile/runtime compatibility

Profile compatibility is now enforced consistently across:

- `create project`
- `import`
- `adopt`
- `bootstrap` compliance

Default mode warns and recommends a safer profile such as `polyglot`. Strict
mode blocks incompatible runtime additions before the project is registered.
Runtime detection also accounts for broader ecosystems such as Rust, C, and C++
so Workspace Intelligence has a more honest runtime picture.

## Breaking Changes

None.

## Upgrade

```bash
npm install -g rapidkit@0.42.0
```

Or without global install:

```bash
npx rapidkit@0.42.0 --version --json
```

## Verification

```bash
npm exec -- vitest run src/__tests__/e2e.test.ts src/__tests__/create-internal.test.ts src/__tests__/workspace-python-engine-install-gate.test.ts
npm run typecheck -- --pretty false
npm run lint
npm run build
npm exec -- vitest run
```
