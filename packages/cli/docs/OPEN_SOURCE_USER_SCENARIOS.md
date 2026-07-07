# Workspai Practical User Scenarios (Open Source Edition)

Practical workflows for OSS teams using the npm CLI. Command syntax: [commands-reference.md](./commands-reference.md). Import/adopt details: [workspace-operations.md](./workspace-operations.md).

## Scenario 0 — Existing project (adopt or import)

Goal: connect code you already have without reshuffling repositories.

### Adopt in place (keep source where it is)

```bash
npx workspai adopt /path/to/existing-app --workspace /path/to/workspace --json
npx workspai workspace model --json
npx workspai doctor project --json
```

Works for Next.js, Vite, NestJS, FastAPI, Go, Spring Boot, and other detected stacks. See [workspace-operations.md#import-and-adoption](./workspace-operations.md#import-and-adoption).

### Import (copy or clone into workspace)

```bash
npx workspai import ../orders-api --workspace ./platform
npx workspai import https://github.com/acme/orders-api.git --git --workspace ./platform
```

### New frontend in workspace

```bash
cd my-workspace
npx workspai create project nextjs marketing-web --yes
```

## What changed from the old flow?

Old flow (typical):
- Create workspace/project
- Run `init` / `dev`
- Minimal governance and supply-chain controls

Current flow (new baseline):
- Same developer-friendly start
- Plus optional mirror/offline controls, checksum/attestation verification, Sigstore governance, and auditable reports
- Works for both small teams and enterprise adoption paths

## Scenario 1 — Junior Developer

Goal: get productive quickly with minimal complexity.

### Steps

```bash
npx workspai my-workspace
cd my-workspace
npx workspai bootstrap --profile polyglot
npx workspai setup python
npx workspai setup node --warm-deps
npx workspai create project fastapi.standard api --output .
cd api
npx workspai init
npx workspai dev
```

### When manual vs automatic?

- Manual: run commands directly in local dev.
- Automatic: not required at this level.

## Scenario 2 — Mid-level Developer / Team

Goal: improve stability and repeatability using mirror artifacts.

### Steps

1) Define minimal mirror config (`.workspai/mirror-config.json`) with artifact sources and checksums.
2) Run:

```bash
cd my-workspace
npx workspai doctor workspace
npx workspai workspace list
npx workspai mirror status
npx workspai cache status
npx workspai mirror sync
npx workspai mirror verify
npx workspai init
npx workspai dev
```

### When manual vs automatic?

- Manual: initial mirror setup and local validation.
- Automatic: in CI pipelines, run `mirror sync/verify` before build/test.

## Scenario 3 — Senior Developer / Platform Engineer

Goal: enforce stronger security controls (attestation + Sigstore governance) in stage/prod-like environments.

### Steps

1) Configure `mirror-config.json` with:
- `security.requireAttestation: true`
- `security.requireSigstore: true`
- `security.requireTransparencyLog: true`
- environment policy allowlists (`identity`, `issuer`, `rekorUrl`)

2) Run:

```bash
RAPIDKIT_ENV=stage npx workspai mirror sync --json
RAPIDKIT_ENV=stage npx workspai mirror verify --json
npx workspai bootstrap --profile=enterprise --ci --offline --json
```

### When manual vs automatic?

- Manual: initial policy authoring and first dry run.
- Automatic: fully automated in CI/CD after policy is validated.

## Scenario 4 — Enterprise Operator / SecOps

Goal: enforce signed governance policy bundle, generate and export audit evidence.

### Steps

1) Add signed governance bundle:
- `.workspai/governance-policy.json`
- `.workspai/governance-policy.sig`
- `.workspai/governance-public.pem`

2) Configure in `mirror-config.json`:
- `security.requireSignedGovernance: true`
- `security.governanceBundle: { ... }`
- `security.evidenceExport: { target: "file" | "http", ... }`

3) Run:

```bash
RAPIDKIT_ENV=prod npx workspai mirror sync --json
RAPIDKIT_ENV=prod npx workspai mirror verify --json
RAPIDKIT_ENV=prod npx workspai bootstrap --profile=enterprise --ci --offline --json
```

### When manual vs automatic?

- Manual: key management, policy signing, endpoint provisioning.
- Automatic: all command execution in CI/CD and release pipelines.

## Operational outputs (for automation and auditing)

Generated reports:
- `.workspai/reports/bootstrap-compliance.latest.json`
- `.workspai/reports/mirror-ops.latest.json`
- `.workspai/reports/transparency-evidence.latest.json`

Optional exported evidence sinks:
- file sink (NDJSON/JSON append strategy)
- HTTP webhook sink (SIEM/GRC intake)

## Practical recommendation

- Individuals/small teams: start with Scenario 0 → 1 → 2.
- Product teams/platform teams: adopt Scenario 3.
- Regulated/high-compliance environments: run Scenario 4 by default.

## See also

- [Documentation index](./README.md)
- [workspace-operations.md](./workspace-operations.md)
- [doctor-command.md](./doctor-command.md)
- [ci-workflows.md](./ci-workflows.md) (`pipeline --json --strict`)
