import os from 'os';
import path from 'path';
import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import { buildWorkspaceModel } from '../workspace-model.js';
import {
  buildWorkspaceImpact,
  buildWorkspaceModelSnapshot,
  writeWorkspaceModelSnapshot,
} from '../workspace-intelligence.js';
import {
  buildWorkspaceVerify,
  evaluateWorkspaceVerifyGate,
  writeWorkspaceVerify,
} from '../workspace-verify.js';

const BASELINE_NOW = new Date('2026-06-22T00:00:00.000Z');
const CURRENT_NOW = new Date('2026-06-22T01:00:00.000Z');

/**
 * End-to-end full-chain test (roadmap 1.22): exercises the complete intelligence
 * pipeline on a real on-disk workspace — model → snapshot → impact → verify →
 * gate — and asserts the graph-aware blast radius propagates across two hops and
 * that the verify gate reacts to the affected subgraph.
 */
describe('workspace intelligence full chain (1.22)', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) await fsExtra.remove(dir);
    }
  });

  it('runs model→impact→verify and asserts a 2-hop blast radius + gated subgraph', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-e2e-'));
    tempDirs.push(workspacePath);

    await fsExtra.outputJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'shop',
    });

    // Chain: web -> api -> core (by package name dependencies).
    await fsExtra.outputJson(path.join(workspacePath, 'core', 'package.json'), {
      name: '@acme/core',
      version: '1.0.0',
    });
    await fsExtra.outputJson(path.join(workspacePath, 'api', 'package.json'), {
      name: '@acme/api',
      version: '1.0.0',
      dependencies: { '@acme/core': 'workspace:*' },
    });
    await fsExtra.outputJson(path.join(workspacePath, 'web', 'package.json'), {
      name: '@acme/web',
      version: '1.0.0',
      dependencies: { '@acme/api': 'workspace:*' },
    });

    // 1) Model + snapshot baseline.
    const baselineModel = await buildWorkspaceModel({ workspacePath, now: BASELINE_NOW });
    expect(baselineModel.graph).toBeTruthy();
    expect(baselineModel.graph?.edges.length).toBeGreaterThanOrEqual(2);

    const snapshot = await buildWorkspaceModelSnapshot({
      workspacePath,
      model: baselineModel,
      now: BASELINE_NOW,
    });
    const snapshotPath = await writeWorkspaceModelSnapshot(snapshot, workspacePath);

    // 2) Change the deepest dependency (core).
    await fsExtra.outputJson(path.join(workspacePath, 'core', '.rapidkit', 'project.json'), {
      kit_name: 'node.lib',
      runtime: 'node',
    });

    // 3) Impact: blast radius must reach web at distance 2 through api.
    const impact = await buildWorkspaceImpact({
      workspacePath,
      fromPath: snapshotPath,
      now: CURRENT_NOW,
    });

    expect(impact.affectedProjects.map((item) => item.project?.name)).toContain('core');

    const web = impact.transitiveImpact.find((item) => item.project?.name === 'web');
    expect(web?.origin).toBe('transitive');
    expect(web?.distance).toBe(2);
    expect(web?.path).toEqual(['core', 'api', 'web']);

    const api = impact.transitiveImpact.find((item) => item.project?.name === 'api');
    expect(api?.distance).toBe(1);

    expect(impact.summary.blastRadius.maxDistance).toBeGreaterThanOrEqual(2);
    expect(impact.summary.blastRadius.transitivelyAffected).toBeGreaterThanOrEqual(2);

    // 4) Verify: the affected subgraph must include the changed node + dependents,
    // and with no runtime evidence the gate should not pass cleanly in strict mode.
    // verify resolves impact from the on-disk snapshot written above.
    const verify = await buildWorkspaceVerify({
      workspacePath,
      now: CURRENT_NOW,
    });
    await writeWorkspaceVerify(verify, workspacePath);

    const subgraphMembers = new Set([
      ...verify.affectedSubgraph.directlyChanged,
      ...verify.affectedSubgraph.transitiveDependents,
    ]);
    expect(subgraphMembers.has('core')).toBe(true);
    expect(subgraphMembers.has('api')).toBe(true);
    expect(subgraphMembers.has('web')).toBe(true);

    // Graph integrity is clean (acyclic chain).
    expect(verify.graphIntegrity.ok).toBe(true);
    expect(verify.graphIntegrity.cycles).toHaveLength(0);

    // Strict gate must be at least as strict as the default gate.
    const defaultGate = evaluateWorkspaceVerifyGate(verify);
    const strictGate = evaluateWorkspaceVerifyGate(verify, { strict: true });
    expect(strictGate.exitCode).toBeGreaterThanOrEqual(defaultGate.exitCode);
  });
});
