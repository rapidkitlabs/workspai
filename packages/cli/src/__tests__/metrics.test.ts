import { describe, expect, it, vi } from 'vitest';

import { MetricsCollector } from '../../scripts/metrics.js';

describe('metrics test-result collection', () => {
  it('parses a passing Vitest summary with skipped tests', () => {
    const collector = new MetricsCollector();
    const runNpm = vi.fn().mockReturnValue(`
 Test Files  185 passed | 4 skipped (189)
      Tests  2034 passed | 8 skipped (2042)
`);
    Object.assign(collector, { runNpm });

    expect(collector.getTestStats()).toEqual({ total: 2034, passing: 2034, failing: 0 });
    expect(runNpm).toHaveBeenCalledWith(['test']);
  });

  it('includes failed tests in the collected total', () => {
    const collector = new MetricsCollector();
    Object.assign(collector, {
      runNpm: vi.fn().mockReturnValue('Tests  2 failed | 2034 passed | 8 skipped (2044)'),
    });

    expect(collector.getTestStats()).toEqual({ total: 2036, passing: 2034, failing: 2 });
  });

  it('rejects output that has no Vitest test summary', () => {
    const collector = new MetricsCollector();
    Object.assign(collector, { runNpm: vi.fn().mockReturnValue('no test summary') });

    expect(() => collector.getTestStats()).toThrow('Could not collect a valid test result.');
  });
});
