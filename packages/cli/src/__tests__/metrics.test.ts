import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MetricsCollector } from '../../scripts/metrics.js';

describe('metrics test-result collection', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((target) => fs.remove(target)));
  });

  function collectorWithoutReport(): MetricsCollector {
    return new MetricsCollector(path.join(os.tmpdir(), `workspai-metrics-missing-${process.pid}`));
  }

  it('parses a passing Vitest summary with skipped tests', () => {
    const collector = collectorWithoutReport();
    const runNpm = vi.fn().mockReturnValue(`
 Test Files  185 passed | 4 skipped (189)
      Tests  2034 passed | 8 skipped (2042)
`);
    Object.assign(collector, { runNpm });

    expect(collector.getTestStats()).toEqual({ total: 2034, passing: 2034, failing: 0 });
    expect(runNpm).toHaveBeenCalledWith(['test']);
  });

  it('includes failed tests in the collected total', () => {
    const collector = collectorWithoutReport();
    Object.assign(collector, {
      runNpm: vi.fn().mockReturnValue('Tests  2 failed | 2034 passed | 8 skipped (2044)'),
    });

    expect(collector.getTestStats()).toEqual({ total: 2036, passing: 2034, failing: 2 });
  });

  it('rejects output that has no Vitest test summary', () => {
    const collector = collectorWithoutReport();
    Object.assign(collector, { runNpm: vi.fn().mockReturnValue('no test summary') });

    expect(() => collector.getTestStats()).toThrow('Could not collect a valid test result.');
  });

  it('consumes the machine-readable result from the preceding coverage run', async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-metrics-report-'));
    tempDirs.push(rootDir);
    await fs.ensureDir(path.join(rootDir, 'test-results'));
    await fs.writeJson(path.join(rootDir, 'test-results', 'vitest.json'), {
      success: true,
      numTotalTests: 2048,
      numPassedTests: 2040,
      numFailedTests: 0,
      numPendingTests: 8,
    });
    const collector = new MetricsCollector(rootDir);
    const runNpm = vi.fn();
    Object.assign(collector, { runNpm });

    expect(collector.getTestStats()).toEqual({ total: 2040, passing: 2040, failing: 0 });
    expect(runNpm).not.toHaveBeenCalled();
  });

  it('fails closed when the persisted Vitest report records a failure', async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-metrics-failed-'));
    tempDirs.push(rootDir);
    await fs.ensureDir(path.join(rootDir, 'test-results'));
    await fs.writeJson(path.join(rootDir, 'test-results', 'vitest.json'), {
      success: false,
      numTotalTests: 2,
      numPassedTests: 1,
      numFailedTests: 1,
    });

    expect(() => new MetricsCollector(rootDir).getTestStats()).toThrow(
      'Could not collect a valid test result.'
    );
  });
});
