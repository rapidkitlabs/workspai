import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import { collectGitWorkingTreeObservation } from '../workspace-git-observation.js';

describe('workspace git observation', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) await fsExtra.remove(dir);
    }
  });

  it('returns unavailable outside a git repository', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-git-none-'));
    tempDirs.push(workspacePath);
    const observation = collectGitWorkingTreeObservation(workspacePath);
    expect(observation.available).toBe(false);
    expect(observation.dirty).toBe(false);
    expect(observation.changedFiles).toEqual([]);
  });

  it('excludes generated reports and caches from the freshness observation', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-git-generated-'));
    tempDirs.push(workspacePath);
    execFileSync('git', ['init'], { cwd: workspacePath, stdio: 'ignore' });
    await fsExtra.outputFile(path.join(workspacePath, 'src', 'app.ts'), 'export {};\n');
    await fsExtra.outputJson(
      path.join(workspacePath, '.workspai', 'reports', 'workspace-impact-last-run.json'),
      { schemaVersion: 'workspace-impact.v1' }
    );
    await fsExtra.outputJson(
      path.join(workspacePath, '.workspai', 'cache', 'workspace-model.v1.json'),
      { schemaVersion: 'workspace-model-cache.v1' }
    );

    const observation = collectGitWorkingTreeObservation(workspacePath);

    expect(observation.untrackedFiles).toEqual(['src/app.ts']);
    expect(observation.dirty).toBe(true);
  });
});
