import os from 'os';
import path from 'path';

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
});
