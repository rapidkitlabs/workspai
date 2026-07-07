# RapidKit v0.41.3 Release Notes

**Release Date:** July 2, 2026

## Overview

RapidKit v0.41.3 is a patch release for the npm source-of-truth layer behind
Workspai Studio, enterprise doctor evidence, and Workspace Intelligence
artifacts.

It strengthens the full doctor loop: diagnose the workspace or project, produce
structured evidence, expose a policy-aware remediation plan, apply the smallest
safe repair, and verify from the correct scope. It also introduces fact-level
freshness so agents do not have to guess which facts are safe to remember and
which facts must be re-observed before use.

## What Changed

### Enterprise Doctor Evidence

The doctor surface is now deeper and more useful across frontend, backend, and
polyglot projects.

`doctor workspace`, `doctor workspace --fix`, `doctor project`, and
`doctor project --fix` inspect broader source surfaces, including:

- Dependency manifests, lockfiles, and deterministic dependency baselines
- Environment/config contracts and secret hygiene
- Test scripts, native test markers, and runtime test depth
- Lint, format, static analysis, and runtime quality tooling
- Runtime-native security tooling and dependency audit markers
- Docker, compose, Kubernetes, Helm, and Kustomize deployment surfaces
- Migration/readiness markers for backend runtimes
- Health probes and boot entrypoint markers

This gives Workspai, CI, and agents richer evidence without treating every stack
as a Node-only or Python-only project.

### Studio Remediation Contract

RapidKit now publishes `doctor-remediation-plan.v1`.

The contract gives Studio consumers a deterministic repair plan instead of
forcing them to scrape doctor display text:

- Ordered repair steps
- Safe vs guarded repair state
- File hints and affected paths
- Verification commands
- Rollback metadata
- Policy-aware repair capability status
- Human-review requirements for non-deterministic changes

This is the contract Workspai Studio can use to show one clear next action,
apply safe edits with approval, and keep guarded changes review-gated.

### Fact-Level Freshness

RapidKit now publishes `fact-freshness.v1`.

Artifact-level freshness already existed across Workspace Intelligence reports.
This release pushes that idea down to the level agents actually reason over:
individual facts.

Facts can now declare whether they are:

- durable
- derived
- evidence-backed
- live
- verification-gated

Workspace context, model, history, verify, and agent-sync outputs now carry the
newer freshness evidence so IDEs, CI, Workspai, and agents can avoid stale or
overconfident decisions.

### Enterprise CLI and Release Gates

The CLI layer is hardened around command ownership and enterprise packaging:

- npm-vs-Python RapidKit routing is surfaced more explicitly.
- Studio-facing repair commands are constrained to deterministic RapidKit repair
  operations instead of shell-chained command text.
- Manual release workflow and package smoke coverage now include the newer
  contracts and runtime assets.

### Test and Contract Coverage

This release expands source-level tests for:

- Doctor canary matrices
- Doctor surface probes
- Doctor repair capabilities
- Doctor remediation plans
- Fact freshness contracts
- Workspace model/context/history freshness metadata
- Workspace verify integration
- Extension/CLI compatibility contracts

## Breaking Changes

None.

## Upgrade

```bash
npm install -g rapidkit@0.41.3
```

Or without global install:

```bash
npx rapidkit@0.41.3 --version --json
```

## Verification

```bash
npm run typecheck
npm run validate:contracts
npm test
npm run smoke:enterprise-package
npm run prepack
```
