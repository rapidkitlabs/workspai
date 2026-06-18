import { isCliJsonLogFormat } from './observability/cli-log-format.js';
import { emitCliLogEvent } from './observability/cli-log-event.js';
import { emitCliStepProgress } from './observability/cli-progress.js';
import { ui } from './cli-ui/messages.js';

/**
 * Logger utility with debug mode support.
 * Human output uses the Clack timeline UI; JSON mode emits NDJSON on stderr.
 */
class Logger {
  private debugEnabled = false;

  setDebug(enabled: boolean) {
    this.debugEnabled = enabled;
  }

  isJsonMode(): boolean {
    return isCliJsonLogFormat();
  }

  debug(message: string, ...args: unknown[]) {
    if (!this.debugEnabled) {
      return;
    }
    this.write('debug', message, args);
  }

  info(message: string, ...args: unknown[]) {
    this.write('info', message, args);
  }

  success(message: string, ...args: unknown[]) {
    this.write('info', message, args, { outcome: 'success' }, 'success');
  }

  warn(message: string, ...args: unknown[]) {
    this.write('warn', message, args, undefined, 'warn');
  }

  error(message: string, ...args: unknown[]) {
    this.write('error', message, args, undefined, 'error');
  }

  step(stepNum: number, total: number, message: string) {
    if (isCliJsonLogFormat()) {
      emitCliStepProgress(stepNum, total, message);
      return;
    }
    ui.stepNumbered(stepNum, total, message);
  }

  private write(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    args: unknown[],
    metadata?: Record<string, unknown>,
    uiLevel: 'info' | 'success' | 'warn' | 'error' = 'info'
  ): void {
    const details =
      args.length > 0 ? { details: args.map((arg) => serializeLogArg(arg)) } : undefined;

    if (isCliJsonLogFormat()) {
      emitCliLogEvent({
        level,
        event: 'log',
        component: 'cli',
        message,
        metadata: { ...metadata, ...details },
      });
      return;
    }

    const formatted = level === 'debug' ? `[debug] ${message}` : message;

    switch (uiLevel) {
      case 'success':
        ui.success(formatted);
        break;
      case 'warn':
        ui.warn(formatted);
        break;
      case 'error':
        ui.error(formatted);
        break;
      default:
        if (level === 'debug') {
          ui.dim(formatted);
        } else {
          ui.info(formatted);
        }
    }
  }
}

function serializeLogArg(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  return String(value);
}

export const logger = new Logger();
