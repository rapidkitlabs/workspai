import { describe, expect, it } from 'vitest';

import {
  evaluateWorkspaceVerifyGate,
  workspaceVerifyExitCode,
  type WorkspaceVerify,
} from '../workspace-verify.js';

function verifyFixture(overrides: {
  verdict: WorkspaceVerify['summary']['verdict'];
  exitCode: WorkspaceVerify['summary']['exitCode'];
  freshness?: WorkspaceVerify['freshness']['verdict'];
  blockingReasons?: string[];
}): WorkspaceVerify {
  return {
    schemaVersion: 'workspace-verify.v1',
    generatedAt: '2026-06-22T00:00:00.000Z',
    workspacePath: '/tmp/ws',
    mode: 'evidence',
    impact: { changed: false, risk: 'none', affectedProjects: 0, recommendedCommands: 0 },
    summary: {
      verdict: overrides.verdict,
      exitCode: overrides.exitCode,
      stepsPassed: 0,
      stepsWarn: 0,
      stepsFailed: 0,
      stepsMissing: 0,
      stepsSkipped: 0,
    },
    steps: [],
    missingEvidence: [],
    blockingReasons: overrides.blockingReasons ?? [],
    verificationPlan: [],
    affectedSubgraph: {
      totalProjects: 0,
      directlyChanged: [],
      transitiveDependents: [],
      covered: [],
      uncovered: [],
      unverifiable: [],
    },
    graphIntegrity: {
      ok: true,
      cycles: [],
      danglingEdges: [],
      orphans: [],
      stats: { nodeCount: 0, edgeCount: 0, cycleCount: 0, danglingCount: 0, orphanCount: 0 },
    },
    freshness: {
      verdict: overrides.freshness ?? 'unknown',
      baseline: 'recorded',
      changed: overrides.freshness === 'stale' ? ['web'] : [],
      added: [],
      removed: [],
      projectHashes: {},
    },
  } as WorkspaceVerify;
}

describe('workspace verify definitive gate (1.19)', () => {
  it('blocked verdict fails in both modes with exit 2 and surfaces reasons', () => {
    const verify = verifyFixture({
      verdict: 'blocked',
      exitCode: 2,
      blockingReasons: ['project.web.test: missing'],
    });
    const dflt = evaluateWorkspaceVerifyGate(verify);
    expect(dflt.passed).toBe(false);
    expect(dflt.exitCode).toBe(2);
    expect(dflt.reasons).toContain('project.web.test: missing');
    expect(evaluateWorkspaceVerifyGate(verify, { strict: true }).exitCode).toBe(2);
  });

  it('needs-attention passes in default mode but fails strict with exit 1', () => {
    const verify = verifyFixture({ verdict: 'needs-attention', exitCode: 1, freshness: 'fresh' });
    const dflt = evaluateWorkspaceVerifyGate(verify);
    expect(dflt.passed).toBe(true);
    expect(dflt.exitCode).toBe(0);
    expect(workspaceVerifyExitCode(verify)).toBe(0);
    const strict = evaluateWorkspaceVerifyGate(verify, { strict: true });
    expect(strict.passed).toBe(false);
    expect(strict.exitCode).toBe(1);
  });

  it('ready + stale freshness passes default but fails strict (freshness gate)', () => {
    const verify = verifyFixture({ verdict: 'ready', exitCode: 0, freshness: 'stale' });
    expect(evaluateWorkspaceVerifyGate(verify).passed).toBe(true);
    const strict = evaluateWorkspaceVerifyGate(verify, { strict: true });
    expect(strict.passed).toBe(false);
    expect(strict.exitCode).toBe(1);
    expect(strict.reasons.some((reason) => reason.includes('stale'))).toBe(true);
  });

  it('ready + fresh passes in strict mode', () => {
    const verify = verifyFixture({ verdict: 'ready', exitCode: 0, freshness: 'fresh' });
    const strict = evaluateWorkspaceVerifyGate(verify, { strict: true });
    expect(strict.passed).toBe(true);
    expect(strict.exitCode).toBe(0);
    expect(workspaceVerifyExitCode(verify, { strict: true })).toBe(0);
  });
});
