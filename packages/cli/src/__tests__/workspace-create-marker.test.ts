import fsExtra from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { createWorkspace } from '../workspace.js';
import { isValidWorkspaceMarker } from '../workspace-marker.js';

describe('legacy exported workspace creator', () => {
  const createdPaths: string[] = [];
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;

  afterEach(async () => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    while (createdPaths.length > 0) {
      const target = createdPaths.pop();
      if (target) await fsExtra.remove(target);
    }
  });

  it('uses the shared canonical marker writer without creating a legacy marker', async () => {
    const tempRoot = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'workspai-create-marker-'));
    createdPaths.push(tempRoot);
    const homePath = path.join(tempRoot, 'home');
    const workspacePath = path.join(tempRoot, 'workspace');
    await fsExtra.ensureDir(homePath);
    process.env.HOME = homePath;
    process.env.USERPROFILE = homePath;

    await createWorkspace(workspacePath, {
      name: 'canonical-workspace',
      author: 'Workspai',
      skipGit: true,
    });

    const marker = await fsExtra.readJson(path.join(workspacePath, '.workspai-workspace'));
    expect(isValidWorkspaceMarker(marker)).toBe(true);
    expect(marker).toMatchObject({
      signature: 'RAPIDKIT_WORKSPACE',
      createdBy: 'workspai-cli',
      name: 'canonical-workspace',
    });
    expect(await fsExtra.pathExists(path.join(workspacePath, '.rapidkit-workspace'))).toBe(false);
  });
});
