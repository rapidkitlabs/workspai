import os from 'os';
import path from 'node:path';

import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import { WORKSPACE_SKILLS_INDEX_PATH } from '../contracts/workspace-artifact-paths.js';
import { buildWorkspaceExplain } from '../workspace-explain.js';
import { syncWorkspaceAgentGrounding } from '../workspace-agent-sync.js';
import { WORKSPACE_VERIFY_REPORT_PATH } from '../workspace-verify.js';

describe('Phase 4 integration (4.25)', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await fsExtra.remove(dir);
      }
    }
  });

  async function makeWorkspace(blockers: string[]): Promise<string> {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-p4-e2e-'));
    tempDirs.push(workspacePath);
    await fsExtra.outputJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'p4-e2e',
    });
    await fsExtra.outputJson(path.join(workspacePath, WORKSPACE_VERIFY_REPORT_PATH), {
      schemaVersion: 'workspace-verify.v1',
      generatedAt: new Date().toISOString(),
      workspacePath,
      mode: 'evidence',
      summary: {
        verdict: 'blocked',
        exitCode: 2,
        stepsPassed: 0,
        stepsFailed: 1,
        stepsMissing: 0,
        stepsWarn: 0,
        stepsSkipped: 0,
      },
      impact: { changed: true, risk: 'high', affectedProjects: 1, recommendedCommands: 1 },
      freshness: {
        verdict: 'fresh',
        baseline: 'recorded',
        changed: [],
        added: [],
        removed: [],
        projectHashes: {},
      },
      blockingReasons: blockers,
      resolutionHints: [],
      steps: [],
      missingEvidence: [],
      verificationPlan: [],
      affectedSubgraph: {
        totalProjects: 1,
        directlyChanged: ['orders'],
        transitiveDependents: [],
        covered: [],
        uncovered: ['orders'],
        unverifiable: [],
      },
      graphIntegrity: {
        ok: true,
        cycles: [],
        danglingEdges: [],
        orphans: [],
        stats: {
          nodeCount: 1,
          edgeCount: 0,
          cycleCount: 0,
          danglingCount: 0,
          orphanCount: 0,
        },
      },
      policyMode: 'enterprise',
      policyViolations: [],
    });
    await fsExtra.outputJson(
      path.join(workspacePath, '.rapidkit', 'reports', 'workspace-context-agent.json'),
      {
        schemaVersion: 'workspace-context.v1',
        generatedAt: new Date().toISOString(),
        blockers,
      }
    );
    return workspacePath;
  }

  it('agent-sync writes skills index and explain cites verify blockers', async () => {
    const blockers = ['doctor workspace failed', 'pipeline stage failed'];
    const workspacePath = await makeWorkspace(blockers);

    const sync = await syncWorkspaceAgentGrounding({
      workspacePath,
      write: true,
      refreshContext: true,
      preset: 'enterprise',
    });

    expect(sync.writtenFiles).toContain(WORKSPACE_SKILLS_INDEX_PATH);
    expect(await fsExtra.pathExists(path.join(workspacePath, WORKSPACE_SKILLS_INDEX_PATH))).toBe(
      true
    );

    const explain = await buildWorkspaceExplain({
      workspacePath,
      target: { kind: 'release-blocked' },
    });

    for (const blocker of blockers) {
      expect(explain.blockingReasons).toContain(blocker);
    }
    expect(explain.summary.toLowerCase()).toContain('blocked');
  });
});
