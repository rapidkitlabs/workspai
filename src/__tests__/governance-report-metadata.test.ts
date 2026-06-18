import { describe, expect, it } from 'vitest';

import {
  collectStringBlockers,
  truncateStderrTail,
  withGovernanceRunMetadata,
} from '../utils/governance-report-metadata.js';

describe('governance-report-metadata', () => {
  it('merges metadata and prefers explicit generatedAt', () => {
    const enriched = withGovernanceRunMetadata(
      { summary: 'ok', timestamp: '2026-06-01T00:00:00.000Z' },
      {
        commandId: 'workspaceAnalyze',
        exitCode: 0,
        generatedAt: '2026-06-02T00:00:00.000Z',
        blockers: ['missing lockfile'],
        runId: 'run-123',
      }
    );

    expect(enriched.commandId).toBe('workspaceAnalyze');
    expect(enriched.exitCode).toBe(0);
    expect(enriched.generatedAt).toBe('2026-06-02T00:00:00.000Z');
    expect(enriched.blockers).toEqual(['missing lockfile']);
    expect(enriched.runId).toBe('run-123');
    expect(enriched.summary).toBe('ok');
  });

  it('falls back to payload timestamp when generatedAt is omitted', () => {
    const enriched = withGovernanceRunMetadata(
      { timestamp: '2026-06-01T00:00:00.000Z' },
      {
        commandId: 'bootstrap',
        exitCode: 1,
        generatedAt: '',
      }
    );

    expect(enriched.generatedAt).toBe('2026-06-01T00:00:00.000Z');
  });

  it('omits empty blockers and stderrTail', () => {
    const enriched = withGovernanceRunMetadata(
      {},
      {
        commandId: 'projectDoctor',
        exitCode: 0,
        generatedAt: '2026-06-01T00:00:00.000Z',
        blockers: [],
        stderrTail: '   ',
      }
    );

    expect(enriched.blockers).toBeUndefined();
    expect(enriched.stderrTail).toBeUndefined();
  });

  it('truncates stderr tail from the end', () => {
    const tail = truncateStderrTail('x'.repeat(20), 8);
    expect(tail).toBe('xxxxxxxx');
    expect(tail.length).toBe(8);
  });

  it('collects string blockers with limit', () => {
    expect(collectStringBlockers(['a', '', 1, 'b'], 1)).toEqual(['a']);
  });
});
