export const CLI_LOG_EVENT_SCHEMA_VERSION = 'cli-log-event-v1' as const;

/**
 * Canonical log levels. Single runtime source aligned with
 * `contracts/cli-log-event.v1.json` (`properties.level.enum`) via the
 * cli-log-event contract drift guard.
 */
export const CLI_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

/**
 * Canonical event kinds. Single runtime source aligned with
 * `contracts/cli-log-event.v1.json` (`properties.event.enum`) via the
 * cli-log-event contract drift guard.
 */
export const CLI_LOG_EVENT_KINDS = [
  'log',
  'progress',
  'run.started',
  'run.completed',
  'run.failed',
] as const;

/**
 * Required NDJSON fields, aligned with the JSON schema `required` array.
 */
export const CLI_LOG_EVENT_REQUIRED_FIELDS = [
  'schemaVersion',
  'runId',
  'timestamp',
  'level',
  'event',
  'component',
  'message',
] as const;

export type CliLogLevel = (typeof CLI_LOG_LEVELS)[number];

export type CliLogEventKind = (typeof CLI_LOG_EVENT_KINDS)[number];

export type CliLogEventV1 = {
  schemaVersion: typeof CLI_LOG_EVENT_SCHEMA_VERSION;
  runId: string;
  timestamp: string;
  level: CliLogLevel;
  event: CliLogEventKind;
  component: string;
  message: string;
  command?: string[];
  metadata?: Record<string, unknown>;
};
