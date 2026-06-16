import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  MANAGED_DEFAULT_WORKSPACE_NAME,
  findExistingWorkspacePath,
  getCanonicalWorkspacesDirectory,
  getLegacyWorkspacesDirectory,
  getManagedDefaultWorkspaceCandidates,
  isLegacyWorkspacePath,
  resolveCanonicalWorkspacePath,
  resolveManagedDefaultImportWorkspacePath,
  resolveNewWorkspacePath,
} from '../utils/workspace-paths.js';

const tempDirs: string[] = [];

async function seedWorkspace(workspacePath: string): Promise<void> {
  await fs.ensureDir(path.join(workspacePath, '.rapidkit'));
  await fs.writeFile(path.join(workspacePath, '.rapidkit-workspace'), '{}');
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const target = tempDirs.pop();
    if (target) {
      await fs.remove(target);
    }
  }
});

describe('workspace-paths', () => {
  it('uses the canonical managed workspace path for fresh installs', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-paths-fresh-'));
    tempDirs.push(homeDir);

    expect(resolveManagedDefaultImportWorkspacePath(homeDir)).toBe(
      resolveCanonicalWorkspacePath(MANAGED_DEFAULT_WORKSPACE_NAME, homeDir)
    );
    expect(getCanonicalWorkspacesDirectory(homeDir)).toBe(
      path.join(homeDir, 'rapidkit', 'workspaces')
    );
  });

  it('prefers the canonical workspai workspace when both legacy and canonical exist', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-paths-priority-'));
    tempDirs.push(homeDir);
    const legacyPath = path.join(
      getLegacyWorkspacesDirectory(homeDir),
      MANAGED_DEFAULT_WORKSPACE_NAME
    );
    const canonicalPath = resolveCanonicalWorkspacePath(MANAGED_DEFAULT_WORKSPACE_NAME, homeDir);
    await seedWorkspace(legacyPath);
    await seedWorkspace(canonicalPath);

    expect(resolveManagedDefaultImportWorkspacePath(homeDir)).toBe(canonicalPath);
  });

  it('reuses workspai when it already exists under the legacy parent', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-paths-legacy-workspai-'));
    tempDirs.push(homeDir);
    const legacyWorkspaiPath = path.join(
      getLegacyWorkspacesDirectory(homeDir),
      MANAGED_DEFAULT_WORKSPACE_NAME
    );
    await seedWorkspace(legacyWorkspaiPath);

    expect(resolveManagedDefaultImportWorkspacePath(homeDir)).toBe(legacyWorkspaiPath);
  });

  it('lists managed default candidates with canonical path first', () => {
    const homeDir = '/home/test-user';
    const candidates = getManagedDefaultWorkspaceCandidates(homeDir);

    expect(candidates).toEqual([
      path.join(homeDir, 'rapidkit', 'workspaces', MANAGED_DEFAULT_WORKSPACE_NAME),
      path.join(homeDir, 'Workspai', 'rapidkits', MANAGED_DEFAULT_WORKSPACE_NAME),
    ]);
  });

  it('detects legacy workspace paths under ~/Workspai/rapidkits', () => {
    const homeDir = '/home/test-user';
    const legacyWorkspace = path.join(getLegacyWorkspacesDirectory(homeDir), 'my-mini-wsp');
    const canonicalWorkspace = resolveCanonicalWorkspacePath('my-mini-wsp', homeDir);

    expect(isLegacyWorkspacePath(legacyWorkspace, homeDir)).toBe(true);
    expect(isLegacyWorkspacePath(canonicalWorkspace, homeDir)).toBe(false);
  });

  it('resolves new workspaces under the canonical parent by default', () => {
    const homeDir = '/home/test-user';
    expect(resolveNewWorkspacePath('my-mini-wsp', { homeDir })).toBe(
      path.join(homeDir, 'rapidkit', 'workspaces', 'my-mini-wsp')
    );
  });

  it('honors --output parent directories for new workspaces', () => {
    const outputParent = path.resolve('/tmp/custom-parent');
    expect(resolveNewWorkspacePath('custom-ws', { outputDir: outputParent })).toBe(
      path.join(outputParent, 'custom-ws')
    );
  });

  it('finds existing workspaces in either canonical or legacy parents', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-paths-existing-'));
    tempDirs.push(homeDir);
    const legacyWorkspace = path.join(getLegacyWorkspacesDirectory(homeDir), 'legacy-ws');
    await seedWorkspace(legacyWorkspace);

    expect(findExistingWorkspacePath('legacy-ws', homeDir)).toBe(legacyWorkspace);
    expect(findExistingWorkspacePath('missing-ws', homeDir)).toBeUndefined();
  });
});
