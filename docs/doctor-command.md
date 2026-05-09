# RapidKit Doctor Command

`doctor` checks health for the npm wrapper environment and can run in system, workspace, or project scope.

## Command Modes

### 1) System Check

```bash
npx rapidkit doctor
```

Checks host prerequisites:
- Python
- Poetry (optional)
- pipx (optional)
- RapidKit Core availability
- Go (optional)

### 2) Workspace Check (Canonical)

```bash
cd my-workspace
npx rapidkit doctor workspace
```

Checks:
- all system checks
- workspace marker resolution
- project discovery and per-project health
- dependency/env readiness by project type (Python/Node/Go)

> Compatibility note: `npx rapidkit doctor --workspace` still works, but `doctor workspace` is the canonical form.

### 3) Project Check (Canonical)

```bash
cd my-workspace/my-project
npx rapidkit doctor project
```

Checks:
- all system checks
- nearest project resolution (current folder or parent with project markers)
- project-specific framework/runtime health
- dependency/env readiness for the selected project
- enterprise probes (config contract, migration surface, runtime health surface)
- score explainability breakdown for audit trails

> Compatibility note: `npx rapidkit doctor --project` also works.

## Typical Usage

```bash
# Pre-flight on a contributor machine
npx rapidkit doctor

# Full check inside a workspace
npx rapidkit doctor workspace

# Focus only on current project
npx rapidkit doctor project

# Machine-readable output
npx rapidkit doctor workspace --json

# Attempt safe fixes (interactive)
npx rapidkit doctor workspace --fix

# Attempt safe fixes for current project only
npx rapidkit doctor project --fix

# JSON output with audit-ready breakdown + probes
npx rapidkit doctor project --json
```

## Enterprise Fix Pipeline

When `--fix` is enabled, Doctor now runs a staged treatment pipeline:

1. Fix policy engine assigns risk for each fix step (`safe`, `guarded`, `invasive`).
2. Transaction snapshots are created for guarded/invasive steps.
3. Dependency orchestrator executes known dependency commands via structured adapters.
4. Post-fix verification re-runs project diagnostics.
5. Retry policy re-attempts transient network failures once before failing.

If a guarded/invasive step fails, Doctor attempts rollback from snapshot and records the failure.

## CI Example

```yaml
name: Health Check
on: [push]

jobs:
  doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx rapidkit doctor
```

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | checks passed or warnings only |
| `1` | blocking issues found |

## Enterprise Probe Extensions

Doctor supports project-local custom probes via JSON contract files:

- `.rapidkit/doctor.probes.json`
- `doctor.probes.json`

Schema:

```json
{
  "probes": [
    {
      "id": "db-schema-contract",
      "label": "Database schema contract",
      "severity": "error",
      "anyOfPaths": ["prisma/schema.prisma", "migrations"],
      "allOfPaths": ["README.md"],
      "recommendation": "Define deterministic schema + migration baseline."
    }
  ]
}
```

Each probe is evaluated during `doctor project` and emitted in:

- human output (`Probe checks`)
- JSON output (`project.probes`)
- evidence (`doctor-project-last-run.json`)

## Adapter Plugin Contract

Doctor also supports runtime adapter checks via JSON contracts:

- `.rapidkit/doctor.adapters.json`
- `doctor.adapters.json`

Schema:

```json
{
  "checks": [
    {
      "id": "boot-probe-contract",
      "label": "Boot probe contract",
      "severity": "error",
      "runtimes": ["node", "python"],
      "anyOfPaths": ["src/main.ts", "app/main.py"],
      "allOfPaths": ["README.md"],
      "recommendation": "Expose deterministic bootstrap path and document runtime startup.",
      "passReason": "Bootstrap contract markers detected.",
      "failReason": "Bootstrap contract markers are missing."
    }
  ]
}
```

This enables enterprise teams to extend Doctor checks without patching core CLI logic.

## Score Explainability

Both workspace/project JSON outputs include `scoreBreakdown` with:

- `id` and `label`
- normalized `status` (`ok`, `warn`, `error`)
- `scope` (`host-system`, `project-scoped`)
- `policyRuleId` (deterministic rule that selected status/severity)
- deterministic `reason`

Workspace scope additionally appends aggregate policy rules (`workspace-aggregate`), such as:

- discovery gate
- system error gate
- blocking issue gate
- advisory warning gate

This allows CI and governance pipelines to audit why a score was produced.

## Contract Metadata (Enterprise)

Both JSON output and evidence files include a `contract` object:

- `version`: current doctor evidence contract version
- `scoringPolicyVersion`: current deterministic scoring policy version
- `generatedBy`: emitting surface (`rapidkit-npm`)
- `deterministicScoreBreakdown`: explicit deterministic score policy flag
- `scopeModel`: how scope semantics are encoded

Use these fields for strict consumers in CI/CD and extension adapters to prevent schema drift.

## Drift Delta and Scope Provenance

Workspace/project outputs now include:

- `summary.scopeProvenance`: scoped vs aggregated vs mixed coverage summary
- `driftDelta`: change report compared with previous evidence (new/resolved issues, score delta, system status changes)

These fields are designed for release gates and extension timeline cards that must show progression, not only snapshots.

## Related Workspace Commands

```bash
npx rapidkit bootstrap [--profile <profile>]
npx rapidkit setup <python|node|go> [--warm-deps]
npx rapidkit workspace list
npx rapidkit cache <status|clear|prune|repair>
npx rapidkit mirror <status|sync|verify|rotate>
```

Use `doctor workspace` before and after major workspace operations to detect drift early.
Use `doctor project` before changing a single service to keep project-scope evidence deterministic.
