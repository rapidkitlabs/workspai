import { afterEach, describe, expect, it } from 'vitest';

import { attachRunCorrelation } from '../../observability/run-correlation.js';
import { resetCliRunIdForTests, setCliRunId } from '../../observability/cli-log-event.js';

describe('attachRunCorrelation (1.5)', () => {
  afterEach(() => {
    resetCliRunIdForTests();
  });

  it('adds the active runId to a persisted payload', () => {
    setCliRunId('run-abc-123');
    const result = attachRunCorrelation({ schemaVersion: 'x', generatedAt: 'now' });
    expect(result).toEqual({ schemaVersion: 'x', generatedAt: 'now', runId: 'run-abc-123' });
  });

  it('leaves the payload untouched when no real run is active', () => {
    resetCliRunIdForTests();
    const payload = { schemaVersion: 'x' };
    const result = attachRunCorrelation(payload);
    expect(result).toEqual({ schemaVersion: 'x' });
    expect('runId' in result).toBe(false);
  });

  it('does not mutate the input object', () => {
    setCliRunId('run-xyz');
    const payload = { a: 1 };
    attachRunCorrelation(payload);
    expect(payload).toEqual({ a: 1 });
  });
});
