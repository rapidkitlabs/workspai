import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import fsExtra from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseWorkspaceExplainTarget } from '../contracts/workspace-explain-contract.js';
import { WORKSPACE_EXPLAIN_SCHEMA_VERSION } from '../contracts/workspace-explain-contract.js';
import { buildWorkspaceExplain } from '../workspace-explain.js';
import { WORKSPACE_VERIFY_REPORT_PATH } from '../workspace-verify.js';

let workspacePath: string;

beforeEach(async () => {
  workspacePath = await mkdtemp(path.join(tmpdir(), 'rk-explain-'));
  await fsExtra.outputJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
    workspace_name: 'explain-lab',
  });
});

afterEach(async () => {
  await rm(workspacePath, { recursive: true, force: true });
});

describe('workspace explain (Phase 4.B)', () => {
  it('parses explain targets', () => {
    expect(parseWorkspaceExplainTarget('release-blocked')).toEqual({ kind: 'release-blocked' });
    expect(parseWorkspaceExplainTarget('project:api')).toEqual({
      kind: 'project',
      project: 'api',
    });
    expect(parseWorkspaceExplainTarget('api')).toEqual({ kind: 'project', project: 'api' });
    expect(parseWorkspaceExplainTarget('blocker:doctor.workspace')).toEqual({
      kind: 'blocker',
      blockerId: 'doctor.workspace',
    });
    expect(parseWorkspaceExplainTarget('trace:diff.json')).toEqual({
      kind: 'trace',
      diffRef: 'diff.json',
    });
  });

  it('builds release-blocked explain from verify report', async () => {
    await fsExtra.outputJson(path.join(workspacePath, WORKSPACE_VERIFY_REPORT_PATH), {
      schemaVersion: 'workspace-verify.v1',
      generatedAt: new Date().toISOString(),
      summary: { verdict: 'blocked', exitCode: 2 },
      impact: { risk: 'high', affectedProjects: 1 },
      freshness: { verdict: 'fresh' },
      blockingReasons: ['doctor workspace failed'],
      resolutionHints: [],
      steps: [],
      policyViolations: [],
    });

    const report = await buildWorkspaceExplain({
      workspacePath,
      target: { kind: 'release-blocked' },
    });

    expect(report.schemaVersion).toBe(WORKSPACE_EXPLAIN_SCHEMA_VERSION);
    expect(report.summary).toContain('blocked');
    expect(report.blockingReasons).toContain('doctor workspace failed');
  });
});
