import { createUiSpinner, type CliSpinnerHandle } from '../cli-ui/spinner.js';
import { emitCliLogEvent } from './cli-log-event.js';

export type CliProgressOptions = {
  component: string;
  phase: string;
  metadata?: Record<string, unknown>;
};

type ProgressStatus = 'started' | 'succeeded' | 'failed' | 'warn';

export function createCliSpinner(text: string, options: CliProgressOptions): CliSpinnerHandle {
  return createUiSpinner(text, options);
}

export function emitCliStepProgress(
  stepNum: number,
  total: number,
  message: string,
  component = 'create'
): void {
  emitCliLogEvent({
    level: 'info',
    event: 'progress',
    component,
    message,
    metadata: {
      phase: 'step',
      stepNum,
      total,
      status: 'started',
    },
  });
}

/**
 * Emit a structured `progress` event for a workspace intelligence phase.
 *
 * Every workspace intelligence command (model/snapshot/diff/impact/verify/context/
 * agent-sync) emits at least a `started` phase so IDE/CI consumers get deterministic
 * progress on stderr (`cli-log-event.v1`) instead of scraping terminal text. The
 * terminal outcome is covered by the run lifecycle (`run.completed`/`run.failed`).
 */
export function emitWorkspacePhase(options: {
  action: string;
  status: ProgressStatus;
  message: string;
  metadata?: Record<string, unknown>;
}): void {
  emitCliLogEvent({
    level: options.status === 'failed' ? 'error' : options.status === 'warn' ? 'warn' : 'info',
    event: 'progress',
    component: 'workspace',
    message: options.message,
    metadata: {
      phase: `workspace.${options.action}`,
      action: options.action,
      status: options.status,
      ...(options.metadata ?? {}),
    },
  });
}

export function emitCliInstallProgress(options: {
  phase?: string;
  status: ProgressStatus;
  message: string;
  installMethod: string;
  attempt?: number;
  maxAttempts?: number;
  component?: string;
}): void {
  emitCliLogEvent({
    level: options.status === 'failed' ? 'error' : 'info',
    event: 'progress',
    component: options.component ?? 'create',
    message: options.message,
    metadata: {
      phase: options.phase ?? 'workspace.install.pypi',
      status: options.status,
      installMethod: options.installMethod,
      ...(options.attempt !== undefined ? { attempt: options.attempt } : {}),
      ...(options.maxAttempts !== undefined ? { maxAttempts: options.maxAttempts } : {}),
    },
  });
}

export type { CliSpinnerHandle };
