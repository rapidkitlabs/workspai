import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import fsExtra from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  parseWorkspaceExplainTarget,
  resolveWorkspaceTraceTarget,
} from '../contracts/workspace-explain-contract.js';
import {
  WORKSPACE_EXPLAIN_REPORT_PATH,
  WORKSPACE_EXPLAIN_SCHEMA_VERSION,
  WORKSPACE_TRACE_REPORT_PATH,
  WORKSPACE_WHY_REPORT_PATH,
} from '../contracts/workspace-explain-contract.js';
import {
  buildWorkspaceExplain,
  resolveWorkspaceExplainArtifactPath,
  writeWorkspaceExplainReport,
} from '../workspace-explain.js';
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

  it('resolves workspace trace targets from diff artifact paths', () => {
    expect(
      resolveWorkspaceTraceTarget('.workspai/reports/workspace-model-diff-last-run.json')
    ).toEqual({
      kind: 'trace',
      diffRef: '.workspai/reports/workspace-model-diff-last-run.json',
    });
    expect(resolveWorkspaceTraceTarget('trace:custom-diff.json')).toEqual({
      kind: 'trace',
      diffRef: 'custom-diff.json',
    });
    expect(resolveWorkspaceTraceTarget('api')).toBeNull();
  });

  it('uses scaffold wording for release-blocked explain in an empty workspace', async () => {
    await fsExtra.outputJson(path.join(workspacePath, WORKSPACE_VERIFY_REPORT_PATH), {
      schemaVersion: 'workspace-verify.v1',
      generatedAt: new Date().toISOString(),
      summary: { verdict: 'blocked', exitCode: 2 },
      impact: { risk: 'low', affectedProjects: 0 },
      freshness: { verdict: 'fresh' },
      blockingReasons: ['workspace.doctor: Doctor evidence is stale'],
      resolutionHints: [],
      steps: [],
      policyViolations: [],
    });

    const report = await buildWorkspaceExplain({
      workspacePath,
      target: { kind: 'release-blocked' },
    });

    expect(report.summary).toContain('Workspace scaffold');
    expect(report.summary).toContain('pre-project');
    expect(report.summary).not.toContain('Release blocked');
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

  it('writes explain, why, and trace artifacts to separate last-run paths', async () => {
    const baseReport = {
      schemaVersion: WORKSPACE_EXPLAIN_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      workspacePath,
      summary: 'Narrative summary',
      sections: [{ id: 's1', title: 'Section', body: 'Body' }],
    };

    await writeWorkspaceExplainReport(
      { ...baseReport, target: { kind: 'release-blocked' } },
      workspacePath,
      'explain'
    );
    await writeWorkspaceExplainReport(
      { ...baseReport, target: { kind: 'release-blocked' } },
      workspacePath,
      'why'
    );
    await writeWorkspaceExplainReport(
      {
        ...baseReport,
        target: { kind: 'trace', diffRef: '.workspai/reports/workspace-model-diff-last-run.json' },
      },
      workspacePath,
      'trace'
    );

    expect(resolveWorkspaceExplainArtifactPath('explain')).toBe(WORKSPACE_EXPLAIN_REPORT_PATH);
    expect(resolveWorkspaceExplainArtifactPath('why')).toBe(WORKSPACE_WHY_REPORT_PATH);
    expect(resolveWorkspaceExplainArtifactPath('trace')).toBe(WORKSPACE_TRACE_REPORT_PATH);
    expect(await fsExtra.pathExists(path.join(workspacePath, WORKSPACE_EXPLAIN_REPORT_PATH))).toBe(
      true
    );
    expect(await fsExtra.pathExists(path.join(workspacePath, WORKSPACE_WHY_REPORT_PATH))).toBe(
      true
    );
    expect(await fsExtra.pathExists(path.join(workspacePath, WORKSPACE_TRACE_REPORT_PATH))).toBe(
      true
    );
  });
});
