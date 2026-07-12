import path from 'node:path';
import os from 'node:os';

import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import {
  firstExistingWorkspaceArtifactPath,
  resolveLegacyWorkspaceArtifactPath,
  resolveWorkspaceArtifactPath,
  writeWorkspaceArtifactJson,
  writeWorkspaceArtifactText,
  withWorkspaceArtifactLock,
} from '../utils/artifact-path-compat';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fsExtra.remove(root)));
});

async function temporaryWorkspace(): Promise<string> {
  const root = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'workspai-artifact-path-'));
  temporaryRoots.push(root);
  return root;
}

describe('workspace artifact path compatibility', () => {
  it('rejects absolute paths and workspace traversal for canonical and legacy resolution', () => {
    const root = path.resolve(os.tmpdir(), 'workspai-artifact-root');
    for (const unsafe of ['../outside.json', '../../outside.json', path.resolve(root, '..', 'x')]) {
      expect(() => resolveWorkspaceArtifactPath(root, unsafe)).toThrow(/artifact path/i);
      expect(() => resolveLegacyWorkspaceArtifactPath(root, unsafe)).toThrow(/artifact path/i);
    }
  });

  it('writes JSON and text atomically without leaving temporary files', async () => {
    const root = await temporaryWorkspace();
    const jsonPath = await writeWorkspaceArtifactJson(root, '.workspai/reports/example.json', {
      value: 1,
    });
    const textPath = await writeWorkspaceArtifactText(
      root,
      '.workspai/reports/example.txt',
      'first'
    );
    await writeWorkspaceArtifactJson(root, '.workspai/reports/example.json', { value: 2 });

    expect(await fsExtra.readJson(jsonPath)).toEqual({ value: 2 });
    expect(await fsExtra.readFile(textPath, 'utf8')).toBe('first');
    expect(
      (await fsExtra.readdir(path.dirname(jsonPath))).some((name) => name.endsWith('.tmp'))
    ).toBe(false);
  });

  it('rejects writes through a report-directory symlink outside the workspace', async () => {
    const root = await temporaryWorkspace();
    const outside = await temporaryWorkspace();
    await fsExtra.ensureDir(path.join(root, '.workspai'));
    await fsExtra.symlink(outside, path.join(root, '.workspai', 'reports'));

    await expect(
      writeWorkspaceArtifactJson(root, '.workspai/reports/escape.json', { unsafe: true })
    ).rejects.toThrow(/outside workspace root/i);
    expect(await fsExtra.pathExists(path.join(outside, 'escape.json'))).toBe(false);
  });

  it('prefers canonical artifacts and falls back to legacy artifacts', async () => {
    const root = await temporaryWorkspace();
    const relativePath = '.workspai/reports/example.json';
    const canonicalPath = resolveWorkspaceArtifactPath(root, relativePath);
    const legacyPath = resolveLegacyWorkspaceArtifactPath(root, relativePath);
    await fsExtra.outputJson(legacyPath, { source: 'legacy' });

    expect(await firstExistingWorkspaceArtifactPath(root, relativePath)).toBe(legacyPath);

    await fsExtra.outputJson(canonicalPath, { source: 'canonical' });
    expect(await firstExistingWorkspaceArtifactPath(root, relativePath)).toBe(canonicalPath);
  });

  it('rejects reads through an artifact symlink outside the workspace', async () => {
    const root = await temporaryWorkspace();
    const outside = await temporaryWorkspace();
    const outsideArtifact = path.join(outside, 'escape.json');
    const canonicalPath = resolveWorkspaceArtifactPath(root, '.workspai/reports/escape.json');
    await fsExtra.outputJson(outsideArtifact, { unsafe: true });
    await fsExtra.ensureDir(path.dirname(canonicalPath));
    await fsExtra.symlink(outsideArtifact, canonicalPath);

    await expect(
      firstExistingWorkspaceArtifactPath(root, '.workspai/reports/escape.json')
    ).rejects.toThrow(/outside workspace root/i);
  });

  it('does not steal an old lock from a process that is still alive', async () => {
    const root = await temporaryWorkspace();
    const relativePath = '.workspai/reports/example.json';
    const lockPath = `${resolveWorkspaceArtifactPath(root, relativePath)}.lock`;
    await fsExtra.outputJson(lockPath, { pid: process.pid, createdAt: 'old' });
    const oldTime = new Date(Date.now() - 60_000);
    await fsExtra.utimes(lockPath, oldTime, oldTime);

    await expect(
      withWorkspaceArtifactLock(root, relativePath, async () => undefined, {
        timeoutMs: 50,
        staleAfterMs: 1,
      })
    ).rejects.toThrow(/timed out/i);
    expect(await fsExtra.pathExists(lockPath)).toBe(true);
  });
});
