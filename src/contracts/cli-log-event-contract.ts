export const CLI_LOG_EVENT_SCHEMA_VERSION = 'cli-log-event-v1' as const;

export type CliLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type CliLogEventKind = 'log' | 'progress' | 'run.started' | 'run.completed' | 'run.failed';

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
