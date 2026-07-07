import { randomUUID } from 'node:crypto';

import {
  CLI_LOG_EVENT_SCHEMA_VERSION,
  type CliLogEventV1,
} from '../contracts/cli-log-event-contract.js';
import { emitCliLogEventRecord, setCliRunId } from './cli-log-event.js';
import { isCliJsonLogFormat, resolveCliLogFormat } from './cli-log-format.js';

export type CliRunContext = {
  runId: string;
  startedAt: string;
  command: string[];
  cwd: string;
  rapidkitVersion: string;
  finalized: boolean;
};

let activeRun: CliRunContext | null = null;

export function getCliRunContext(): CliRunContext | null {
  return activeRun;
}

export function getCliRunId(): string {
  return activeRun?.runId ?? 'unknown-run';
}

export function initializeCliRunContext(input: {
  argv?: readonly string[];
  cwd?: string;
  rapidkitVersion: string;
}): CliRunContext {
  const argv = input.argv ?? process.argv;
  const command = filterObservabilityArgs(argv.slice(2));

  const run: CliRunContext = {
    runId: randomUUID(),
    startedAt: new Date().toISOString(),
    command,
    cwd: input.cwd ?? process.cwd(),
    rapidkitVersion: input.rapidkitVersion,
    finalized: false,
  };

  activeRun = run;
  setCliRunId(run.runId);

  if (isCliJsonLogFormat(argv)) {
    emitCliLogEventRecord(buildRunEvent(run, 'run.started', 'info', 'CLI run started'));
  }

  return run;
}

export function finalizeCliRunContext(exitCode: number, message?: string): void {
  if (!activeRun || activeRun.finalized) {
    return;
  }

  activeRun.finalized = true;

  if (!isCliJsonLogFormat()) {
    activeRun = null;
    return;
  }

  if (exitCode === 0) {
    emitCliLogEventRecord(
      buildRunEvent(activeRun, 'run.completed', 'info', message ?? 'CLI run completed', {
        exitCode,
      })
    );
  } else {
    emitCliLogEventRecord(
      buildRunEvent(activeRun, 'run.failed', 'error', message ?? 'CLI run failed', {
        exitCode,
      })
    );
  }

  activeRun = null;
}

/**
 * Normalize the observability invocation so the structured log stream works for
 * every command (including commander-parsed ones like `workspace`).
 *
 * The `--log-format json` / `--log-json` flags are not registered as commander
 * options, so commander would reject them with "unknown option" before a command
 * runs. We resolve the format once, make it sticky via `WORKSPAI_LOG_FORMAT`
 * with the legacy `RAPIDKIT_LOG_FORMAT` fallback, then strip the flags from `process.argv` so
 * downstream parsers never see them. Delegated child CLIs inherit the env var.
 */
export function normalizeObservabilityInvocation(argv: string[] = process.argv): void {
  if (resolveCliLogFormat(argv) === 'json') {
    process.env.WORKSPAI_LOG_FORMAT = 'json';
    process.env.RAPIDKIT_LOG_FORMAT = 'json';
  }
  const head = argv.slice(0, 2);
  const rest = filterObservabilityArgs(argv.slice(2));
  if (rest.length !== argv.length - 2) {
    process.argv = [...head, ...rest];
  }
}

function filterObservabilityArgs(args: readonly string[]): string[] {
  const filtered: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--log-json') {
      continue;
    }
    if (token === '--log-format') {
      index += 1;
      continue;
    }
    if (token.startsWith('--log-format=')) {
      continue;
    }
    filtered.push(token);
  }
  return filtered;
}

function buildRunEvent(
  run: CliRunContext,
  event: CliLogEventV1['event'],
  level: CliLogEventV1['level'],
  message: string,
  metadata?: Record<string, unknown>
): CliLogEventV1 {
  return {
    schemaVersion: CLI_LOG_EVENT_SCHEMA_VERSION,
    runId: run.runId,
    timestamp: new Date().toISOString(),
    level,
    event,
    component: 'cli',
    message,
    command: run.command,
    metadata: {
      cwd: run.cwd,
      rapidkitVersion: run.rapidkitVersion,
      startedAt: run.startedAt,
      ...metadata,
    },
  };
}

export function resetCliRunContextForTests(): void {
  activeRun = null;
  setCliRunId('unknown-run');
}

let processExitHookInstalled = false;

export function installCliProcessExitHook(options?: { force?: boolean }): void {
  if (processExitHookInstalled) {
    return;
  }
  if (
    !options?.force &&
    (process.env.VITEST === 'true' || process.env.VITEST === '1' || process.env.NODE_ENV === 'test')
  ) {
    return;
  }

  processExitHookInstalled = true;
  const originalExit = process.exit.bind(process);

  process.exit = ((code?: number | string | null) => {
    const numeric =
      typeof code === 'number' ? code : typeof code === 'string' ? Number.parseInt(code, 10) : 0;
    const exitCode = Number.isFinite(numeric) ? numeric : 1;
    finalizeCliRunContext(exitCode);
    return originalExit(code as number);
  }) as typeof process.exit;
}

export function resetCliProcessExitHookForTests(): void {
  processExitHookInstalled = false;
}
