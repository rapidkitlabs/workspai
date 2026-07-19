import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_IMPORT_WORKSPACE_LABEL,
  DEFAULT_IMPORT_WORKSPACE_NAME,
  MANAGED_DEFAULT_WORKSPACE_NAME,
  MANAGED_DEFAULT_WORKSPACE_LABEL,
  getLegacyWorkspacesDirectory,
  resolveManagedDefaultImportWorkspacePath,
} from '../utils/default-import-workspace.js';

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
  it('keeps the deprecated compatibility exports aligned with the canonical workspace API', () => {
    expect(DEFAULT_IMPORT_WORKSPACE_NAME).toBe(MANAGED_DEFAULT_WORKSPACE_NAME);
    expect(DEFAULT_IMPORT_WORKSPACE_LABEL).toBe(MANAGED_DEFAULT_WORKSPACE_LABEL);
  });

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
