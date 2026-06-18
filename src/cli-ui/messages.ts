import { log, note } from '@clack/prompts';

import { isCliJsonLogFormat } from '../observability/cli-log-format.js';
import { emitCliLogEvent } from '../observability/cli-log-event.js';
import { rk } from './theme.js';

function emit(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  metadata?: Record<string, unknown>
): void {
  if (!isCliJsonLogFormat()) {
    return;
  }
  emitCliLogEvent({
    level,
    event: 'log',
    component: 'cli',
    message,
    metadata,
  });
}

export const ui = {
  info(message: string): void {
    emit('info', message);
    if (isCliJsonLogFormat()) return;
    log.info(message);
  },

  success(message: string): void {
    emit('info', message, { outcome: 'success' });
    if (isCliJsonLogFormat()) return;
    log.success(message);
  },

  warn(message: string): void {
    emit('warn', message);
    if (isCliJsonLogFormat()) return;
    log.warn(message);
  },

  error(message: string): void {
    emit('error', message);
    if (isCliJsonLogFormat()) return;
    log.error(message);
  },

  step(message: string): void {
    emit('info', message, { phase: 'step' });
    if (isCliJsonLogFormat()) return;
    log.step(message);
  },

  stepNumbered(stepNum: number, total: number, message: string): void {
    const formatted = `${rk.dim(`[${stepNum}/${total}]`)} ${message}`;
    emit('info', message, { phase: 'step', stepNum, total });
    if (isCliJsonLogFormat()) return;
    log.step(formatted);
  },

  note(message: string, title?: string): void {
    emit('info', message, { kind: 'note', title });
    if (isCliJsonLogFormat()) return;
    note(message, title);
  },

  message(message: string, symbol = rk.brand('◇')): void {
    emit('info', message);
    if (isCliJsonLogFormat()) return;
    log.message(message, { symbol });
  },

  dim(message: string): void {
    if (isCliJsonLogFormat()) return;
    console.log(rk.dim(message));
  },

  plain(message: string): void {
    if (isCliJsonLogFormat()) return;
    console.log(message);
  },

  nextSteps(lines: string[]): void {
    if (isCliJsonLogFormat()) return;
    ui.note(lines.map((line) => rk.white(line)).join('\n'), rk.brand('Next steps'));
  },
};
