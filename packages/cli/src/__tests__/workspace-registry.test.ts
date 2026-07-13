import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import { registerProjectInWorkspace, registerWorkspace, syncWorkspaceProjects } from '../workspace';
import {
  getLegacyWorkspaceRegistryDirectory,
  getWorkspaceRegistryDirectory,
} from '../utils/platform-capabilities.js';
import { normalizeRegistryPath } from '../utils/registry-path.js';

const createdPaths: string[] = [];
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalAppData = process.env.APPDATA;

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
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
  if (originalAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = originalAppData;

  while (createdPaths.length > 0) {
    const target = createdPaths.pop();
    if (target) {
      await fsExtra.remove(target);
    }
  }
});

describe('workspace registry', () => {
  it('registers and syncs a cloned workspace that has no machine-local registry entry', async () => {
    const homePath = await makeTempDir('rapidkit-registry-cloned-home-');
    const workspacePath = await makeTempDir('rapidkit-registry-cloned-workspace-');
    const projectPath = path.join(workspacePath, 'api');
    process.env.HOME = homePath;
    process.env.USERPROFILE = homePath;
    if (process.platform === 'win32') process.env.APPDATA = homePath;

    await fsExtra.ensureDir(path.join(projectPath, '.workspai'));
    await fsExtra.writeJson(path.join(projectPath, '.workspai', 'project.json'), {
      schemaVersion: 'workspai-project-v1',
      name: 'api',
    });

    const result = await syncWorkspaceProjects(workspacePath, true);

    expect(result).toMatchObject({
      workspacePath: normalizeRegistryPath(workspacePath),
      workspaceFound: true,
      added: [normalizeRegistryPath(projectPath)],
    });
    const canonical = await fsExtra.readJson(
      path.join(getWorkspaceRegistryDirectory(), 'workspaces.json')
    );
    const legacy = await fsExtra.readJson(
      path.join(getLegacyWorkspaceRegistryDirectory(), 'workspaces.json')
    );
    expect(canonical).toEqual(legacy);
    expect(canonical.workspaces).toEqual([
      expect.objectContaining({
        name: path.basename(workspacePath),
        path: normalizeRegistryPath(workspacePath),
        projects: [
          {
            name: 'api',
            path: normalizeRegistryPath(projectPath),
          },
        ],
      }),
    ]);
  });

  it('reconciles archived workspace projects out of the shared registry', async () => {
    const homePath = await makeTempDir('rapidkit-registry-prune-home-');
    const workspacePath = await makeTempDir('rapidkit-registry-prune-workspace-');
    const projectPath = path.join(workspacePath, 'api');
    const archivePath = path.join(workspacePath, '.workspai', 'archive', 'projects', 'api');
    process.env.HOME = homePath;
    process.env.USERPROFILE = homePath;
    if (process.platform === 'win32') process.env.APPDATA = homePath;

    await fsExtra.outputJson(path.join(projectPath, '.workspai', 'project.json'), {
      schemaVersion: 'workspai-project-v1',
      name: 'api',
    });
    await syncWorkspaceProjects(workspacePath, true);
    await fsExtra.move(projectPath, archivePath);

    await syncWorkspaceProjects(workspacePath, true);

    const canonical = await fsExtra.readJson(
      path.join(getWorkspaceRegistryDirectory(), 'workspaces.json')
    );
    expect(canonical.workspaces[0].projects).toEqual([]);
  });

  it('migrates a legacy-only registry into the canonical registry without losing entries', async () => {
    const homePath = await makeTempDir('rapidkit-registry-home-');
    const existingWorkspacePath = path.join(homePath, 'workspaces', 'legacy-workspace');
    const newWorkspacePath = path.join(homePath, 'workspaces', 'new-workspace');
    process.env.HOME = homePath;
    process.env.USERPROFILE = homePath;
    if (process.platform === 'win32') process.env.APPDATA = homePath;

    const legacyFile = path.join(getLegacyWorkspaceRegistryDirectory(), 'workspaces.json');
    await fsExtra.ensureDir(path.dirname(legacyFile));
    await fsExtra.writeJson(legacyFile, {
      workspaces: [
        {
          name: 'legacy-workspace',
          path: normalizeRegistryPath(existingWorkspacePath),
          mode: 'full',
          projects: [],
        },
      ],
    });

    await registerWorkspace(newWorkspacePath, 'new-workspace');

    const canonicalFile = path.join(getWorkspaceRegistryDirectory(), 'workspaces.json');
    const canonical = await fsExtra.readJson(canonicalFile);
    const legacy = await fsExtra.readJson(legacyFile);
    expect(canonical).toEqual(legacy);
    expect(canonical.workspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'legacy-workspace' }),
        expect.objectContaining({ name: 'new-workspace' }),
      ])
    );
  });

  it('preserves concurrent CLI registrations in both registry files', async () => {
    const homePath = await makeTempDir('rapidkit-registry-concurrent-home-');
    process.env.HOME = homePath;
    process.env.USERPROFILE = homePath;
    if (process.platform === 'win32') process.env.APPDATA = homePath;

    const workspacePaths = Array.from({ length: 8 }, (_, index) => {
      return path.join(homePath, 'workspaces', `workspace-${index}`);
    });
    await Promise.all(
      workspacePaths.map((workspacePath, index) => {
        return registerWorkspace(workspacePath, `workspace-${index}`);
      })
    );

    const canonical = await fsExtra.readJson(
      path.join(getWorkspaceRegistryDirectory(), 'workspaces.json')
    );
    const legacy = await fsExtra.readJson(
      path.join(getLegacyWorkspaceRegistryDirectory(), 'workspaces.json')
    );
    expect(canonical).toEqual(legacy);
    expect(canonical.workspaces).toHaveLength(workspacePaths.length);
    expect(canonical.workspaces.map((workspace: { path: string }) => workspace.path)).toEqual(
      expect.arrayContaining(workspacePaths.map(normalizeRegistryPath))
    );
  });

  it('preserves an invalid registry before repairing canonical and legacy state', async () => {
    const homePath = await makeTempDir('rapidkit-registry-corrupt-home-');
    process.env.HOME = homePath;
    process.env.USERPROFILE = homePath;
    if (process.platform === 'win32') process.env.APPDATA = homePath;

    const canonicalFile = path.join(getWorkspaceRegistryDirectory(), 'workspaces.json');
    await fsExtra.ensureDir(path.dirname(canonicalFile));
    await fsExtra.writeFile(canonicalFile, '{invalid-json\n');

    await registerWorkspace(path.join(homePath, 'workspaces', 'recovered'), 'recovered');

    const repaired = await fsExtra.readJson(canonicalFile);
    const backups = (await fsExtra.readdir(path.dirname(canonicalFile))).filter((name) => {
      return name.startsWith('workspaces.json.corrupt-');
    });
    expect(repaired.workspaces).toEqual([expect.objectContaining({ name: 'recovered' })]);
    expect(backups).toHaveLength(1);
    expect(await fsExtra.readFile(path.join(path.dirname(canonicalFile), backups[0]), 'utf8')).toBe(
      '{invalid-json\n'
    );
  });

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
    const legacyRegistry = await fsExtra.readJson(
      path.join(getLegacyWorkspaceRegistryDirectory(), 'workspaces.json')
    );
    expect(registry.workspaces).toEqual([
      expect.objectContaining({
        name: 'default-workspace',
        path: normalizeRegistryPath(workspacePath),
        projects: [
          {
            name: 'web',
            path: normalizeRegistryPath(newProjectPath),
          },
        ],
      }),
    ]);
    expect(legacyRegistry).toEqual(registry);
  });
});
