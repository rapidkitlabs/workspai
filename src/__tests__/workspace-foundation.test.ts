import os from 'os';
import path from 'path';
import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import { ensureWorkspaceFoundation } from '../utils/workspace-foundation.js';

describe('workspace foundation ensure', () => {
  const tempDirs: string[] = [];

  async function makeTempDir(prefix: string): Promise<string> {
    const dir = await fsExtra.mkdtemp(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) await fsExtra.remove(dir);
    }
  });

  it('creates missing foundation files for an empty workspace root', async () => {
    const workspacePath = await makeTempDir('rk-foundation-');
    const result = await ensureWorkspaceFoundation(workspacePath, { profile: 'polyglot' });

    expect(result.status).toBe('passed');
    expect(result.created).toEqual(
      expect.arrayContaining([
        '.rapidkit/workspace.json',
        '.rapidkit/toolchain.lock',
        '.rapidkit/policies.yml',
        '.rapidkit/cache-config.yml',
        '.rapidkit-workspace',
        '.gitignore',
      ])
    );
  });

  it('skips existing foundation files unless force is requested', async () => {
    const workspacePath = await makeTempDir('rk-foundation-skip-');
    await ensureWorkspaceFoundation(workspacePath, { profile: 'polyglot' });
    const second = await ensureWorkspaceFoundation(workspacePath, { profile: 'polyglot' });

    expect(second.status).toBe('skipped');
    expect(second.created).toEqual([]);
  });
});
