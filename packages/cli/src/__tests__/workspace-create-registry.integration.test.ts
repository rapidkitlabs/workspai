import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import fsExtra from 'fs-extra';
import { execa } from 'execa';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProject } from '../create.js';
import {
  getLegacyWorkspaceRegistryDirectory,
  getWorkspaceRegistryDirectory,
} from '../utils/platform-capabilities.js';
import { normalizeRegistryPath } from '../utils/registry-path.js';
import { WORKSPACE_CONTRACT_PATH } from '../utils/workspace-contract.js';
import { WORKSPACE_REGISTRY_SUMMARY_RELATIVE_PATH } from '../utils/workspace-registry-summary.js';

const createdPaths: string[] = [];
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalAppData = process.env.APPDATA;
const originalRegistryPublishFailure = process.env.WORKSPAI_TEST_FAIL_WORKSPACE_REGISTRY_PUBLISH;

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
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
  if (originalAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = originalAppData;
  if (originalRegistryPublishFailure === undefined) {
    delete process.env.WORKSPAI_TEST_FAIL_WORKSPACE_REGISTRY_PUBLISH;
  } else {
    process.env.WORKSPAI_TEST_FAIL_WORKSPACE_REGISTRY_PUBLISH = originalRegistryPublishFailure;
  }

  while (createdPaths.length > 0) {
    const target = createdPaths.pop();
    if (target) {
      await fsExtra.remove(target);
    }
  }
});

describe('workspace create registry integration', () => {
  it('registers custom-directory workspaces in ~/.workspai/workspaces.json', async () => {
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
    const legacyRegistryFile = path.join(getLegacyWorkspaceRegistryDirectory(), 'workspaces.json');
    const registry = await fsExtra.readJson(registryFile);
    const legacyRegistry = await fsExtra.readJson(legacyRegistryFile);
    const normalizedPath = normalizeRegistryPath(workspacePath);

    expect(registry.workspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: workspaceName,
          path: normalizedPath,
        }),
      ])
    );
    expect(legacyRegistry).toEqual(registry);
    expect(await fsExtra.pathExists(path.join(workspacePath, WORKSPACE_CONTRACT_PATH))).toBe(true);
    const summary = await fsExtra.readJson(
      path.join(workspacePath, WORKSPACE_REGISTRY_SUMMARY_RELATIVE_PATH)
    );
    expect(summary.sources.globalRegistry).toMatchObject({
      exists: true,
      path: registryFile,
    });
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

  it('removes a newly owned workspace root and restores registries when onboarding fails', async () => {
    const homePath = await makeTempDir('rapidkit-registry-home-');
    const parentDir = await makeTempDir('rapidkit-registry-parent-');
    const workspaceName = 'failed-workspace';
    process.env.HOME = homePath;
    process.env.USERPROFILE = homePath;

    const registryFile = path.join(getWorkspaceRegistryDirectory(), 'workspaces.json');
    const legacyRegistryFile = path.join(getLegacyWorkspaceRegistryDirectory(), 'workspaces.json');
    const canonicalPreimage = Buffer.from('{"workspaces":[]}\n');
    const legacyPreimage = Buffer.from('{\n  "workspaces": []\n}\n');
    await fsExtra.outputFile(registryFile, canonicalPreimage);
    await fsExtra.outputFile(legacyRegistryFile, legacyPreimage);
    process.env.WORKSPAI_TEST_FAIL_WORKSPACE_REGISTRY_PUBLISH = '1';

    await expect(
      createProject(workspaceName, {
        skipGit: true,
        yes: true,
        profile: 'minimal',
        parentDirectory: parentDir,
      })
    ).rejects.toThrow('Injected workspace registry summary publication failure');

    await expect(fs.access(path.join(parentDir, workspaceName))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(await fs.readFile(registryFile)).toEqual(canonicalPreimage);
    expect(await fs.readFile(legacyRegistryFile)).toEqual(legacyPreimage);
  });

  it('restores exact existing-directory files and removes a newly owned venv on failure', async () => {
    const homePath = await makeTempDir('rapidkit-registry-home-');
    const workspacePath = await makeTempDir('rapidkit-register-existing-');
    process.env.HOME = homePath;
    process.env.USERPROFILE = homePath;

    const readmePath = path.join(workspacePath, 'README.md');
    const gitignorePath = path.join(workspacePath, '.gitignore');
    const manifestPath = path.join(workspacePath, '.workspai', 'workspace.json');
    const unrelatedPath = path.join(workspacePath, '.workspai', 'keep.bin');
    const readmePreimage = Buffer.from([0, 255, 13, 10, 7]);
    const gitignorePreimage = Buffer.from('existing-ignore\n');
    const manifestPreimage = Buffer.from('{"workspace_name":"before"}\n');
    await fsExtra.outputFile(readmePath, readmePreimage);
    await fs.chmod(readmePath, 0o751);
    await fsExtra.outputFile(gitignorePath, gitignorePreimage);
    await fsExtra.outputFile(manifestPath, manifestPreimage);
    await fsExtra.outputFile(unrelatedPath, Buffer.from([9, 8, 7]));

    vi.mocked(execa).mockImplementation(async (_cmd: any, args?: any, options?: any) => {
      if (Array.isArray(args) && args.includes('venv') && options?.cwd) {
        await fs.mkdir(path.join(options.cwd, '.venv'), { recursive: true });
        await fs.writeFile(path.join(options.cwd, '.venv', 'created-by-test'), 'generated');
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });
    process.env.WORKSPAI_TEST_FAIL_WORKSPACE_REGISTRY_PUBLISH = '1';

    const { registerWorkspaceAtPath } = await import('../create.js');
    await expect(
      registerWorkspaceAtPath(workspacePath, { skipGit: true, installMethod: 'venv' })
    ).rejects.toThrow('Injected workspace registry summary publication failure');

    expect(await fs.readFile(readmePath)).toEqual(readmePreimage);
    if (process.platform !== 'win32') {
      expect((await fs.stat(readmePath)).mode & 0o777).toBe(0o751);
    }
    expect(await fs.readFile(gitignorePath)).toEqual(gitignorePreimage);
    expect(await fs.readFile(manifestPath)).toEqual(manifestPreimage);
    expect(await fs.readFile(unrelatedPath)).toEqual(Buffer.from([9, 8, 7]));
    await expect(fs.access(path.join(workspacePath, '.venv'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect((await fs.stat(workspacePath)).isDirectory()).toBe(true);
  });
});
