import { describe, expect, it } from 'vitest';

import {
  areScaffoldOnlyBlockerReasons,
  filterScaffoldBlockerReasons,
  isScaffoldBlockerReason,
  looksLikeDiffArtifactRef,
  softenEmptyWorkspaceVerifyVerdict,
  summarizeEmptyWorkspaceExplain,
} from '../workspace-scaffold.js';

describe('workspace-scaffold', () => {
  it('classifies stale and analyze evidence as scaffold blockers', () => {
    expect(isScaffoldBlockerReason('workspace.doctor: Doctor evidence is stale')).toBe(true);
    expect(isScaffoldBlockerReason('analyze: Analyze needs attention (score 0/100)')).toBe(true);
    expect(
      isScaffoldBlockerReason('Run workspace contract verify to publish verify evidence.')
    ).toBe(true);
    expect(isScaffoldBlockerReason('policy.env.missing: Python runtime required')).toBe(false);
  });

  it('filters scaffold-only blocker lists', () => {
    const reasons = ['doctor stale', 'policy.env.missing: real failure'];
    expect(areScaffoldOnlyBlockerReasons(reasons)).toBe(false);
    expect(filterScaffoldBlockerReasons(reasons)).toEqual(['policy.env.missing: real failure']);
  });

  it('softens blocked verify verdict for empty scaffold-only workspaces', () => {
    expect(
      softenEmptyWorkspaceVerifyVerdict({
        projectCount: 0,
        verdict: 'blocked',
        exitCode: 2,
        blockingReasons: ['workspace.doctor: Doctor evidence is stale'],
        policyErrorCount: 0,
      })
    ).toEqual({ verdict: 'needs-attention', exitCode: 1 });
  });

  it('keeps blocked verify verdict when policy errors exist', () => {
    expect(
      softenEmptyWorkspaceVerifyVerdict({
        projectCount: 0,
        verdict: 'blocked',
        exitCode: 2,
        blockingReasons: ['policy.env.missing: python not pinned'],
        policyErrorCount: 1,
      })
    ).toEqual({ verdict: 'blocked', exitCode: 2 });
  });

  it('detects diff artifact refs for trace routing', () => {
    expect(looksLikeDiffArtifactRef('.rapidkit/reports/workspace-model-diff-last-run.json')).toBe(
      true
    );
    expect(looksLikeDiffArtifactRef('api')).toBe(false);
  });

  it('summarizes empty workspace explain copy', () => {
    expect(summarizeEmptyWorkspaceExplain(2, 'blocked')).toContain('pre-project');
    expect(summarizeEmptyWorkspaceExplain(0, 'ready')).toContain('scaffold ready');
  });
});
