import { describe, expect, it } from 'vitest';

import {
  buildFactFreshnessContract,
  buildWorkspaceFact,
  FACT_FRESHNESS_SCHEMA_VERSION,
  summarizeFactFreshness,
} from '../../contracts/fact-freshness-contract.js';

describe('fact freshness contract', () => {
  it('treats an invalid source timestamp as unknown without throwing', () => {
    expect(
      buildFactFreshnessContract({
        kind: 'evidence-backed',
        category: 'verification',
        generatedAt: 'not-a-date',
        now: new Date('2026-06-02T00:00:00.000Z'),
        reason: 'External evidence can contain a malformed timestamp.',
      })
    ).toMatchObject({
      generatedAt: '2026-06-02T00:00:00.000Z',
      status: 'unknown',
      verifyBeforeUse: true,
    });
  });

  it('marks durable structure facts as fresh and reusable within their contract', () => {
    const fact = buildWorkspaceFact({
      id: 'workspace.name',
      label: 'Workspace name',
      scope: 'workspace',
      value: 'shop',
      freshness: {
        kind: 'durable',
        category: 'structure',
        generatedAt: '2026-06-01T00:00:00.000Z',
        now: new Date('2026-06-02T00:00:00.000Z'),
        sourceArtifact: '.workspai/reports/workspace-model.json',
        sourcePath: 'workspace.name',
        reason: 'Workspace identity is structural metadata.',
      },
    });

    expect(fact.freshness).toMatchObject({
      schemaVersion: FACT_FRESHNESS_SCHEMA_VERSION,
      status: 'fresh',
      verifyBeforeUse: false,
      ttlSeconds: 2592000,
    });
    expect(fact.freshness.inputsHash).toHaveLength(64);
  });

  it('requires verification for evidence-backed and stale facts', () => {
    const evidence = buildWorkspaceFact({
      id: 'workspace.evidence.pipeline',
      label: 'Pipeline evidence',
      scope: 'evidence',
      value: { path: '.workspai/reports/pipeline-last-run.json', status: 'blocked' },
      freshness: {
        kind: 'evidence-backed',
        category: 'verification',
        generatedAt: '2026-06-01T00:00:00.000Z',
        now: new Date('2026-06-01T01:00:00.000Z'),
        sourceArtifact: '.workspai/reports/pipeline-last-run.json',
        sourcePath: 'evidence.pipeline',
        reason: 'Pipeline evidence must be checked before release decisions.',
      },
    });
    const stale = buildWorkspaceFact({
      id: 'workspace.projectCount',
      label: 'Project count',
      scope: 'workspace',
      value: 3,
      freshness: {
        kind: 'derived',
        category: 'structure',
        generatedAt: '2026-06-01T00:00:00.000Z',
        now: new Date('2026-06-09T00:00:01.000Z'),
        sourceArtifact: '.workspai/reports/workspace-model.json',
        sourcePath: 'summary.projectCount',
        reason: 'Project count is derived from workspace discovery.',
      },
    });

    expect(evidence.freshness.verifyBeforeUse).toBe(true);
    expect(evidence.freshness.status).toBe('fresh');
    expect(stale.freshness.status).toBe('stale');
    expect(stale.freshness.verifyBeforeUse).toBe(true);

    expect(
      summarizeFactFreshness({
        facts: [evidence, stale],
        generatedAt: '2026-06-09T00:00:01.000Z',
      })
    ).toMatchObject({
      status: 'stale',
      totalFacts: 2,
      staleFacts: 1,
      verifyBeforeUseFacts: 2,
    });
  });
});
