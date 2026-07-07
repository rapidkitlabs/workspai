import { describe, expect, it } from 'vitest';

import { adaptInquirerValidate } from '../cli-ui/prompts.js';

describe('adaptInquirerValidate', () => {
  it('maps inquirer true to clack undefined', () => {
    const adapted = adaptInquirerValidate(
      (value: string) => value.trim().length > 0 || 'Project name is required'
    );
    expect(adapted?.('ridge-api')).toBeUndefined();
    expect(adapted?.('')).toBe('Project name is required');
  });

  it('maps explicit true returns to undefined', () => {
    const adapted = adaptInquirerValidate(() => true);
    expect(adapted?.('anything')).toBeUndefined();
  });
});
