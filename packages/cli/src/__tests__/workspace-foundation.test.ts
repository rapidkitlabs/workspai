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
    const created = result.created.map((entry) => entry.replace(/\\/g, '/'));
    expect(created).toEqual(
      expect.arrayContaining([
        '.workspai/workspace.json',
        '.workspai/toolchain.lock',
        '.workspai/policies.yml',
        '.workspai/cache-config.yml',
        '.workspai-workspace',
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

  it('adds the canonical marker when only a legacy workspace marker exists', async () => {
    const workspacePath = await makeTempDir('rk-foundation-legacy-marker-');
    await fsExtra.writeJson(path.join(workspacePath, '.rapidkit-workspace'), {
      signature: 'RAPIDKIT_WORKSPACE',
      createdBy: 'rapidkit-npm',
      version: '0.42.0',
      createdAt: '2026-01-01T00:00:00.000Z',
      name: 'legacy-workspace',
      metadata: {
        npm: {
          packageVersion: '0.42.0',
          installMethod: 'venv',
        },
      },
    });

    const result = await ensureWorkspaceFoundation(workspacePath, { profile: 'polyglot' });

    expect(result.created).toContain('.workspai-workspace');
    const canonical = await fsExtra.readJson(path.join(workspacePath, '.workspai-workspace'));
    expect(canonical).toMatchObject({
      signature: 'RAPIDKIT_WORKSPACE',
      createdBy: 'workspai-cli',
      name: 'legacy-workspace',
      metadata: {
        npm: {
          installMethod: 'venv',
        },
      },
    });
  });
});
