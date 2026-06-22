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

const BASELINE_NOW = new Date('2026-06-22T00:00:00.000Z');
const CURRENT_NOW = new Date('2026-06-22T01:00:00.000Z');

describe('graph-aware impact blast radius', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) await fsExtra.remove(dir);
    }
  });

  it('propagates a change in a dependency to its transitive dependents', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-blast-'));
    tempDirs.push(workspacePath);
    await fsExtra.outputJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'shop',
    });
    // api is the dependency; web depends on it by package name.
    await fsExtra.outputJson(path.join(workspacePath, 'api', 'package.json'), {
      name: '@acme/api',
      version: '1.0.0',
    });
    await fsExtra.outputJson(path.join(workspacePath, 'web', 'package.json'), {
      name: '@acme/web',
      dependencies: { '@acme/api': 'workspace:*' },
    });

    // Baseline snapshot.
    const baselineModel = await buildWorkspaceModel({ workspacePath, now: BASELINE_NOW });
    const snapshot = await buildWorkspaceModelSnapshot({
      workspacePath,
      model: baselineModel,
      now: BASELINE_NOW,
    });
    const snapshotPath = await writeWorkspaceModelSnapshot(snapshot, workspacePath);

    // Change only the api project (add a kit marker) → a direct project change for api.
    await fsExtra.outputJson(path.join(workspacePath, 'api', '.rapidkit', 'project.json'), {
      kit_name: 'fastapi.standard',
      runtime: 'python',
    });

    const impact = await buildWorkspaceImpact({
      workspacePath,
      fromPath: snapshotPath,
      now: CURRENT_NOW,
    });

    const directNames = impact.affectedProjects.map((item) => item.project?.name);
    expect(directNames).toContain('api');

    const web = impact.transitiveImpact.find((item) => item.project?.name === 'web');
    expect(web).toBeTruthy();
    expect(web?.origin).toBe('transitive');
    expect(web?.distance).toBe(1);
    expect(web?.path).toEqual(['api', 'web']);
    expect(web?.via).toBe('package-dep');

    expect(impact.summary.blastRadius.directlyAffected).toBeGreaterThanOrEqual(1);
    expect(impact.summary.blastRadius.transitivelyAffected).toBeGreaterThanOrEqual(1);
    expect(impact.summary.blastRadius.maxDistance).toBeGreaterThanOrEqual(1);
    expect(impact.summary.blastRadius.graphEdges).toBeGreaterThanOrEqual(1);

    // The blast-radius dependent gets a verification command in the plan.
    expect(impact.verificationPlan.length).toBeGreaterThan(0);
  });
});
