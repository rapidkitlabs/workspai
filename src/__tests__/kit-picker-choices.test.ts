import { describe, expect, it } from 'vitest';

import {
  assertUniqueKitPickerLabels,
  buildKitPickerChoices,
} from '../cli-ui/kit-picker-choices.js';

describe('kit picker choices', () => {
  it('uses unique labels with hints for every backend and frontend kit', () => {
    const choices = buildKitPickerChoices();

    expect(choices.length).toBeGreaterThan(10);
    expect(() => assertUniqueKitPickerLabels(choices)).not.toThrow();

    const frontendChoices = choices.filter((choice) =>
      String(choice.value).startsWith('frontend.')
    );
    expect(frontendChoices.length).toBeGreaterThan(5);
    for (const choice of frontendChoices) {
      expect(choice.label).toBeTruthy();
      expect(choice.label).not.toBe('frontend');
      expect(choice.hint).toBeTruthy();
    }

    const fastapiChoices = choices.filter((choice) => String(choice.value).startsWith('fastapi.'));
    expect(fastapiChoices).toHaveLength(2);
    expect(fastapiChoices.map((choice) => choice.label)).toEqual([
      'FastAPI Standard Kit',
      'FastAPI DDD Kit',
    ]);
  });
});
