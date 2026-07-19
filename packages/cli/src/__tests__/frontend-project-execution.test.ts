import { EventEmitter } from 'events';
import fsExtra from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('child_process', () => ({ spawn: spawnMock }));

import { __test__, createFrontendProject } from '../frontend-project.js';

describe('frontend project execution hardening', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('spawns with argv preservation and no shell for paths containing spaces', async () => {
    const child = new EventEmitter();
    spawnMock.mockImplementation(() => {
      setImmediate(() => child.emit('close', 0));
      return child;
    });

    const projectPath = 'C:\\Users\\Example User\\source\\my app';
    await __test__.runCommand('npm', ['create', 'vite@latest', projectPath], process.cwd());

    const [command, args, options] = spawnMock.mock.calls[0];
    expect(command).toBeTruthy();
    expect(args.at(-1)).toBe(projectPath);
    expect(options.shell).toBe(false);
  });

  it('accepts failed-generator recovery only with a parseable package.json object', async () => {
    const root = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'workspai-frontend-recovery-'));
    try {
      await fsExtra.writeFile(path.join(root, 'partial.txt'), 'partial');
      expect(await __test__.hasFrontendScaffoldArtifacts(root)).toBe(false);

      await fsExtra.writeFile(path.join(root, 'package.json'), '{broken');
      expect(await __test__.hasFrontendScaffoldArtifacts(root)).toBe(false);

      await fsExtra.writeJson(path.join(root, 'package.json'), { name: 'valid-scaffold' });
      expect(await __test__.hasFrontendScaffoldArtifacts(root)).toBe(true);
    } finally {
      await fsExtra.remove(root);
    }
  });

  it('fails closed and removes owned output when a generator exits nonzero', async () => {
    const root = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'workspai-frontend-failure-'));
    const projectPath = path.join(root, 'failed-app');
    spawnMock.mockImplementation((_command, _args, options: { cwd: string }) => {
      const child = new EventEmitter();
      void fsExtra
        .ensureDir(projectPath)
        .then(() =>
          fsExtra.writeJson(path.join(projectPath, 'package.json'), { name: 'failed-app' })
        )
        .then(() => setImmediate(() => child.emit('close', 1)));
      expect(options.cwd).toBe(root);
      return child;
    });

    try {
      await expect(
        createFrontendProject({
          args: [
            'create',
            'project',
            'frontend.nextjs',
            'failed-app',
            '--output',
            root,
            '--skip-git',
            '--skip-install',
          ],
        })
      ).rejects.toThrow('generator failed with exit code 1');
      expect(await fsExtra.pathExists(projectPath)).toBe(false);
    } finally {
      await fsExtra.remove(root);
    }
  });
});
