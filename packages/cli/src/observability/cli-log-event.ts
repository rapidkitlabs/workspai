import {
  CLI_LOG_EVENT_SCHEMA_VERSION,
  type CliLogEventKind,
  type CliLogEventV1,
  type CliLogLevel,
} from '../contracts/cli-log-event-contract.js';
import { isCliJsonLogFormat } from './cli-log-format.js';

let activeRunId = 'unknown-run';

export function setCliRunId(runId: string): void {
  activeRunId = runId;
}

export function getCliRunId(): string {
  return activeRunId;
}

export function resetCliRunIdForTests(): void {
  activeRunId = 'unknown-run';
}

export type EmitCliLogEventInput = {
  level: CliLogLevel;
  event: CliLogEventKind;
  component: string;
  message: string;
  command?: string[];
  metadata?: Record<string, unknown>;
};

export function buildCliLogEvent(input: EmitCliLogEventInput): CliLogEventV1 {
  return {
    schemaVersion: CLI_LOG_EVENT_SCHEMA_VERSION,
    runId: getCliRunId(),
    timestamp: new Date().toISOString(),
    level: input.level,
    event: input.event,
    component: input.component,
    message: input.message,
    ...(input.command ? { command: input.command } : {}),
    ...(input.metadata && Object.keys(input.metadata).length > 0
      ? { metadata: sanitizeMetadata(input.metadata) }
      : {}),
  };
}

export function emitCliLogEvent(input: EmitCliLogEventInput): void {
  if (!isCliJsonLogFormat()) {
    return;
  }
  emitCliLogEventRecord(buildCliLogEvent(input));
}

export function emitCliLogEventRecord(record: CliLogEventV1): void {
  process.stderr.write(`${JSON.stringify(record)}\n`);
}

export function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) {
      continue;
    }
    if (value instanceof Error) {
      output[key] = {
        name: value.name,
        message: value.message,
      };
      continue;
    }
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      output[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      output[key] = value.map((entry) =>
        typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean'
          ? entry
          : String(entry)
      );
      continue;
    }
    output[key] = String(value);
  }

  return output;
}
