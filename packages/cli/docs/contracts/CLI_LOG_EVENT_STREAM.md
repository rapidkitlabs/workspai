# Workspai CLI Log Event Stream (`cli-log-event.v1`)

Structured NDJSON observability stream emitted by Workspai CLI so IDEs (Workspai),
CI, and agents can track command progress and outcome **without scraping human
terminal text**.

- **Schema version:** `cli-log-event-v1`
- **JSON Schema:** [`contracts/cli-log-event.v1.json`](../../contracts/cli-log-event.v1.json)
- **TypeScript contract:** `src/contracts/cli-log-event-contract.ts` (single runtime
  source of `CLI_LOG_LEVELS`, `CLI_LOG_EVENT_KINDS`, `CLI_LOG_EVENT_REQUIRED_FIELDS`)
- **Drift guard:** `src/__tests__/contracts/cli-log-event-contract.test.ts` pins the
  TypeScript contract to the JSON schema so the two can never diverge silently.

## Channel separation (critical)

Workspai keeps two machine-readable channels strictly separate:

| Channel | Flag | Content |
| ------- | ---- | ------- |
| **stdout** | `--json` | The command **result** payload (e.g. workspace model, analyze report). One JSON document. |
| **stderr** | `--log-format json` (or `--log-json`, or `RAPIDKIT_LOG_FORMAT=json`) | The **NDJSON log stream** — one `cli-log-event.v1` object per line. |

Because the two channels are independent, a consumer can request structured
progress (`--log-format json`) **and** a structured result (`--json`) at the same
time without corrupting either stream.

## Activation

Any of the following enables the stream:

```bash
workspai workspace model --json --log-format json
RAPIDKIT_LOG_FORMAT=json workspai workspace verify --json
workspai doctor workspace --log-json
```

In text mode (the default) no structured log events are written to stderr.

### Flag normalization (why it works for every command)

`--log-format json` / `--log-json` are **not** registered as per-command options. On
startup the CLI resolves the requested format once, makes it sticky via
`RAPIDKIT_LOG_FORMAT=json`, and strips the observability flags from `process.argv`
before any command parser runs. This guarantees the stream works uniformly for
commander-parsed commands (e.g. `workspace model`), manually handled commands
(e.g. `create`), and delegated child CLIs (which inherit the env var) — without a
command ever rejecting the flag as an "unknown option". The result flag (`--json`)
is preserved, so the stdout result and the stderr stream stay independent.

## Workspace intelligence phase events

Every workspace intelligence subcommand (`model`, `snapshot`, `diff`, `impact`,
`verify`, `context`, `agent-sync`) emits at least a `progress` event when the
stream is active:

```json
{ "event": "progress", "component": "workspace",
  "metadata": { "phase": "workspace.model", "action": "model", "status": "started" } }
```

The terminal outcome is always covered by the run lifecycle (`run.completed` /
`run.failed`), so a consumer can settle UI state deterministically.

## Event shape

Each stderr line is a single JSON object:

```json
{
  "schemaVersion": "cli-log-event-v1",
  "runId": "5f1d…",
  "timestamp": "2026-06-22T13:59:01.123Z",
  "level": "info",
  "event": "run.started",
  "component": "cli",
  "message": "CLI run started",
  "command": ["workspace", "model"],
  "metadata": { "cwd": "/path/to/workspace", "rapidkitVersion": "0.38.0" }
}
```

### Fields

| Field | Required | Notes |
| ----- | -------- | ----- |
| `schemaVersion` | yes | Always `cli-log-event-v1`. |
| `runId` | yes | Stable UUID for the whole CLI invocation; correlates every event in one run. |
| `timestamp` | yes | ISO-8601 date-time. |
| `level` | yes | `debug` \| `info` \| `warn` \| `error`. |
| `event` | yes | `log` \| `progress` \| `run.started` \| `run.completed` \| `run.failed`. |
| `component` | yes | Emitting component (e.g. `cli`, `create`). |
| `message` | yes | Human-readable message. |
| `command` | no | Command argv (observability flags stripped). |
| `metadata` | no | Sanitized key/value context (e.g. `exitCode`, `cwd`, `rapidkitVersion`). |

## Run lifecycle events

Every invocation that runs through the CLI run context emits a deterministic
lifecycle, keyed by a shared `runId`:

1. `run.started` — emitted on initialization (`level: info`).
2. `run.completed` — emitted on exit code `0` (`level: info`, `metadata.exitCode: 0`).
3. `run.failed` — emitted on any non-zero exit (`level: error`, `metadata.exitCode: <n>`).

`run.completed` / `run.failed` are guaranteed even when a command calls
`process.exit()`, because the CLI installs a process-exit hook that finalizes the
run context.

## Consumer guidance (IDE / CI)

1. Spawn with `--log-format json` to receive progress; parse stderr line-by-line.
2. Treat a line as an event only if it parses as JSON and matches the schema
   (`schemaVersion === 'cli-log-event-v1'`). Ignore non-matching lines.
3. Use `runId` to group events; show progress on `progress`/`log`, settle UI state
   on `run.completed` / `run.failed`.
4. Read the command **result** from stdout `--json`, not from the log stream.
5. Workspai consumes this stream via `src/core/cliLogEventContract.ts`
   (`parseCliLogEventLine`) to drive deterministic progress and evidence refresh.

## See also

- [ARTIFACT_CATALOG.md](./ARTIFACT_CATALOG.md) — on-disk artifacts produced by commands
- [COMMAND_OWNERSHIP_MATRIX.md](./COMMAND_OWNERSHIP_MATRIX.md)
