import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  MANAGED_DEFAULT_WORKSPACE_NAME,
  getLegacyWorkspacesDirectory,
  resolveManagedDefaultImportWorkspacePath,
} from '../utils/workspace-paths.js';

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const target = tempDirs.pop();
    if (target) {
      await fs.remove(target);
    }
  }
});

describe('default-import-workspace', () => {
  it('reuses workspai when it already exists under the legacy parent', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-default-ws-legacy-workspai-'));
    tempDirs.push(homeDir);
    const legacyPath = path.join(
      getLegacyWorkspacesDirectory(homeDir),
      MANAGED_DEFAULT_WORKSPACE_NAME
    );
    await fs.ensureDir(path.join(legacyPath, '.rapidkit'));
    await fs.writeFile(path.join(legacyPath, '.rapidkit-workspace'), '{}');

    expect(resolveManagedDefaultImportWorkspacePath(homeDir)).toBe(legacyPath);
  });

  it('uses the canonical workspai workspace path for fresh installs', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-default-ws-workspai-'));
    tempDirs.push(homeDir);

    expect(resolveManagedDefaultImportWorkspacePath(homeDir)).toBe(
      path.join(homeDir, '.workspai', 'workspaces', MANAGED_DEFAULT_WORKSPACE_NAME)
    );
  });
});
