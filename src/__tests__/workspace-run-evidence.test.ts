import fsExtra from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  normalizeWorkspaceRunEvidence,
  publishWorkspaceRunStageReport,
  readWorkspaceRunEvidence,
  resolveWorkspaceRunStageReport,
  WORKSPACE_RUN_EVIDENCE_SCHEMA_VERSION,
  WORKSPACE_RUN_LAST_REPORT_FILENAME,
} from '../utils/workspace-run-evidence.js';
import type { WorkspaceRunReport } from '../workspace-run.js';

const createdPaths: string[] = [];

function makeStageReport(
  workspacePath: string,
  stage: WorkspaceRunReport['stage']
): WorkspaceRunReport {
  return {
    schemaVersion: '1.0',
    workspacePath,
    stage,
    generatedAt: '2026-06-16T12:00:00.000Z',
    durationMs: 42,
    options: {
      affected: false,
      blastRadius: false,
      since: null,
      parallel: false,
      maxWorkers: 1,
      continueOnError: false,
      strict: false,
      enforceGates: false,
      scope: null,
    },
    selection: {
      mode: 'all',
      since: null,
      scope: null,
      graphStatus: 'not-applicable',
      expansionDepth: 0,
    },
    gates: {
      enforced: false,
      results: [],
      blocked: false,
    },
    summary: {
      projectCount: 1,
      selectedCount: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      exitCode: 0,
    },
    projects: [],
  };
}

afterEach(async () => {
  while (createdPaths.length > 0) {
    const target = createdPaths.pop();
    if (target) {
      await fsExtra.remove(target);
    }
  }
});

describe('workspace run evidence', () => {
  it('publishes multi-stage aggregate to workspace-run-last.json', async () => {
    const workspace = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-run-evidence-'));
    createdPaths.push(workspace);

    await publishWorkspaceRunStageReport(workspace, makeStageReport(workspace, 'test'));
    await publishWorkspaceRunStageReport(workspace, makeStageReport(workspace, 'build'));

    const evidence = await readWorkspaceRunEvidence(workspace);
    expect(evidence?.schemaVersion).toBe(WORKSPACE_RUN_EVIDENCE_SCHEMA_VERSION);
    expect(evidence?.latestStage).toBe('build');
    expect(evidence?.stages.test?.stage).toBe('test');
    expect(evidence?.stages.build?.stage).toBe('build');

    const reportPath = path.join(
      workspace,
      '.rapidkit',
      'reports',
      WORKSPACE_RUN_LAST_REPORT_FILENAME
    );
    const raw = await fsExtra.readJson(reportPath);
    expect(raw.schemaVersion).toBe(WORKSPACE_RUN_EVIDENCE_SCHEMA_VERSION);
  });

  it('normalizes legacy flat stage reports', () => {
    const legacy = makeStageReport('/tmp/ws', 'test');
    const normalized = normalizeWorkspaceRunEvidence(legacy);
    expect(normalized?.schemaVersion).toBe(WORKSPACE_RUN_EVIDENCE_SCHEMA_VERSION);
    expect(normalized?.stages.test?.stage).toBe('test');
    expect(resolveWorkspaceRunStageReport(legacy, 'test')?.stage).toBe('test');
  });
});
