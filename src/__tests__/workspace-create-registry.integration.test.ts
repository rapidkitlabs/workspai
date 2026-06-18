import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProject } from '../create.js';
import { getWorkspaceRegistryDirectory } from '../utils/platform-capabilities.js';
import { normalizeRegistryPath } from '../utils/registry-path.js';
import { WORKSPACE_CONTRACT_PATH } from '../utils/workspace-contract.js';
import { WORKSPACE_REGISTRY_SUMMARY_RELATIVE_PATH } from '../utils/workspace-registry-summary.js';

const createdPaths: string[] = [];
const originalHome = process.env.HOME;

async function makeTempDir(prefix: string): Promise<string> {
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  createdPaths.push(dirPath);
  return dirPath;
}

vi.mock('execa', () => ({
  execa: vi.fn(async (cmd: string, args?: string[]) => {
    if (cmd === 'git') {
      return { stdout: '', stderr: '', exitCode: 0 };
    }
    if (cmd === 'poetry' && args?.[0] === '--version') {
      throw new Error('poetry missing');
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  }),
}));

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

describe('workspace create registry integration', () => {
  it('registers custom-directory workspaces in ~/.rapidkit/workspaces.json', async () => {
    const homePath = await makeTempDir('rapidkit-registry-home-');
    const parentDir = await makeTempDir('rapidkit-registry-parent-');
    const workspaceName = 'custom-ws-registry-test';

    process.env.HOME = homePath;
    process.env.USERPROFILE = homePath;

    await createProject(workspaceName, {
      skipGit: true,
      yes: true,
      profile: 'minimal',
      parentDirectory: parentDir,
    });

    const workspacePath = path.join(parentDir, workspaceName);
    const registryFile = path.join(getWorkspaceRegistryDirectory(), 'workspaces.json');
    const registry = await fsExtra.readJson(registryFile);
    const normalizedPath = normalizeRegistryPath(workspacePath);

    expect(registry.workspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: workspaceName,
          path: normalizedPath,
        }),
      ])
    );
    expect(await fsExtra.pathExists(path.join(workspacePath, WORKSPACE_CONTRACT_PATH))).toBe(true);
    expect(
      await fsExtra.pathExists(path.join(workspacePath, WORKSPACE_REGISTRY_SUMMARY_RELATIVE_PATH))
    ).toBe(true);
  });

  it('registers nested workspace even when parent directory is already in the registry', async () => {
    const homePath = await makeTempDir('rapidkit-registry-home-');
    const parentDir = await makeTempDir('rapidkit-registry-parent-');
    const workspaceName = 'nested-ws-registry-test';

    process.env.HOME = homePath;
    process.env.USERPROFILE = homePath;

    const registryFile = path.join(getWorkspaceRegistryDirectory(), 'workspaces.json');
    await fsExtra.ensureDir(path.dirname(registryFile));
    await fsExtra.writeJson(registryFile, {
      workspaces: [
        {
          name: path.basename(parentDir),
          path: normalizeRegistryPath(parentDir),
          mode: 'full',
          projects: [],
        },
      ],
    });

    await createProject(workspaceName, {
      skipGit: true,
      yes: true,
      profile: 'minimal',
      parentDirectory: parentDir,
    });

    const workspacePath = path.join(parentDir, workspaceName);
    const registry = await fsExtra.readJson(registryFile);
    const normalizedPath = normalizeRegistryPath(workspacePath);

    expect(registry.workspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: workspaceName,
          path: normalizedPath,
        }),
      ])
    );
    expect(await fsExtra.pathExists(path.join(workspacePath, WORKSPACE_CONTRACT_PATH))).toBe(true);
    expect(
      await fsExtra.pathExists(path.join(workspacePath, WORKSPACE_REGISTRY_SUMMARY_RELATIVE_PATH))
    ).toBe(true);
  });
});
