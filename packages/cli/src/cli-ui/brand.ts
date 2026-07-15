import { cancel, intro } from '@clack/prompts';

import { isCliJsonLogFormat } from '../observability/cli-log-format.js';
import { rk } from './theme.js';

let introShown = false;

export function showIntro(subtitle?: string): void {
  if (isCliJsonLogFormat() || introShown) {
    return;
  }
  introShown = true;
  const title = `${rk.brand('◆')} ${rk.white('Workspai')}${subtitle ? rk.dim(`  ${subtitle}`) : ''}`;
  intro(title);
}

export function showCancel(message = 'Cancelled'): void {
  if (isCliJsonLogFormat()) {
    return;
  }
  cancel(rk.dim(message));
  introShown = false;
}

export function resetIntroStateForTests(): void {
  introShown = false;
}
