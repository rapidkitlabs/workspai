import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import { registerProjectInWorkspace, registerWorkspace } from '../workspace';
import { getWorkspaceRegistryDirectory } from '../utils/platform-capabilities.js';

const createdPaths: string[] = [];
const originalHome = process.env.HOME;

async function makeTempDir(prefix: string): Promise<string> {
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  createdPaths.push(dirPath);
  return dirPath;
}

afterEach(async () => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }

  while (createdPaths.length > 0) {
    const target = createdPaths.pop();
    if (target) {
      await fsExtra.remove(target);
    }
  }
});

describe('workspace registry', () => {
  it('upserts registered project paths when an adopted project is re-linked', async () => {
    const homePath = await makeTempDir('rapidkit-registry-home-');
    const workspacePath = path.join(homePath, 'workspaces', 'default-workspace');
    const oldProjectPath = path.join(homePath, 'projects', 'web-old');
    const newProjectPath = path.join(homePath, 'projects', 'web-new');
    process.env.HOME = homePath;
    process.env.USERPROFILE = homePath;
    if (process.platform === 'win32') {
      process.env.APPDATA = homePath;
    }

    await registerWorkspace(workspacePath, 'default-workspace');
    await registerProjectInWorkspace(workspacePath, 'web', oldProjectPath);
    await registerProjectInWorkspace(workspacePath, 'web', newProjectPath);

    const registry = await fsExtra.readJson(
      path.join(getWorkspaceRegistryDirectory(), 'workspaces.json')
    );
    expect(registry.workspaces).toEqual([
      expect.objectContaining({
        name: 'default-workspace',
        path: workspacePath,
        projects: [
          {
            name: 'web',
            path: newProjectPath,
          },
        ],
      }),
    ]);
  });
});
