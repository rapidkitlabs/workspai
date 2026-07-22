import os from 'node:os';
import path from 'node:path';

import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import { canonicalizeProjectMetadata } from '../utils/project-metadata.js';

describe('project metadata canonicalization', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => fsExtra.remove(root)));
  });

  it('mirrors valid legacy bridge metadata without overwriting canonical ownership', async () => {
    const root = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'workspai-project-metadata-'));
    roots.push(root);
    await fsExtra.outputJson(path.join(root, '.rapidkit', 'project.json'), { name: 'api' });
    await fsExtra.outputJson(path.join(root, '.rapidkit', 'context.json'), { engine: 'python' });
    await fsExtra.outputJson(path.join(root, '.rapidkit', 'file-hashes.json'), {
      source: 'legacy',
    });
    await fsExtra.outputJson(path.join(root, '.workspai', 'context.json'), { engine: 'npm' });

    const written = await canonicalizeProjectMetadata(root);

    expect(written.map((value) => path.relative(root, value).split(path.sep).join('/'))).toEqual([
      '.workspai/project.json',
      '.workspai/file-hashes.json',
    ]);
    expect(await fsExtra.readJson(path.join(root, '.workspai', 'project.json'))).toEqual({
      name: 'api',
    });
    expect(await fsExtra.readJson(path.join(root, '.workspai', 'context.json'))).toEqual({
      engine: 'npm',
    });
  });

  it('refuses malformed bridge metadata instead of publishing invalid canonical state', async () => {
    const root = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'workspai-project-metadata-'));
    roots.push(root);
    await fsExtra.outputFile(path.join(root, '.rapidkit', 'project.json'), '{');

    await expect(canonicalizeProjectMetadata(root)).rejects.toThrow();
    expect(await fsExtra.pathExists(path.join(root, '.workspai', 'project.json'))).toBe(false);
  });
});
