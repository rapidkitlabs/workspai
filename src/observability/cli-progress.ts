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
