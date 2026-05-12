import os from 'os';
import path from 'path';

import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';
import { readImportedProjectsRegistry } from '../imported-projects-registry';
import { importProjectIntoWorkspace } from '../import-project';

const createdPaths: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dirPath = await fsExtra.mkdtemp(path.join(os.tmpdir(), prefix));
  createdPaths.push(dirPath);
  return dirPath;
}

afterEach(async () => {
  vi.restoreAllMocks();

  while (createdPaths.length > 0) {
    const target = createdPaths.pop();
    if (target) {
      await fsExtra.remove(target);
    }
  }
});

describe('import-project', () => {
  it('copies a local project into the workspace and writes imported-projects registry entry', async () => {
    const workspacePath = await makeTempDir('rapidkit-import-workspace-');
    const sourcePath = await makeTempDir('rapidkit-import-source-');

    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fsExtra.writeJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'demo-workspace',
    });
    await fsExtra.writeFile(path.join(workspacePath, '.rapidkit-workspace'), '{}');

    await fsExtra.writeJson(path.join(sourcePath, 'package.json'), {
      name: 'edge-api',
      dependencies: {
        express: '^4.19.2',
      },
    });

    const imported = await importProjectIntoWorkspace({
      workspacePath,
      source: sourcePath,
      name: 'edge-api',
    });

    expect(imported.name).toBe('edge-api');
    expect(imported.stack).toBe('express');
    expect(await fsExtra.pathExists(path.join(imported.path, 'package.json'))).toBe(true);

    const registry = await readImportedProjectsRegistry(workspacePath);
    expect(registry).toEqual([
      expect.objectContaining({
        name: imported.name,
        path: imported.path,
        stack: 'express',
        source: 'local-folder',
      }),
    ]);
  });

  it('clones a git repository source and records the detected supported stack', async () => {
    const workspacePath = await makeTempDir('rapidkit-import-workspace-');
    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fsExtra.writeJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'demo-workspace',
    });
    await fsExtra.writeFile(path.join(workspacePath, '.rapidkit-workspace'), '{}');

    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      const destinationPath = args[args.length - 1];
      await fsExtra.ensureDir(destinationPath);
      await fsExtra.writeFile(
        path.join(destinationPath, 'go.mod'),
        'module github.com/example/api\n\nrequire github.com/gofiber/fiber/v2 v2.52.4\n'
      );
      return { exitCode: 0, stdout: '', stderr: '' } as never;
    });

    const imported = await importProjectIntoWorkspace({
      workspacePath,
      source: 'https://github.com/acme/checkout-api.git',
      sourceType: 'git-url',
    });

    expect(imported.name).toBe('checkout-api');
    expect(imported.stack).toBe('go');
    expect(execaMock).toHaveBeenCalledWith(
      'git',
      ['clone', '--depth', '1', 'https://github.com/acme/checkout-api.git', imported.path],
      expect.objectContaining({ timeout: 120000 })
    );

    const registry = await readImportedProjectsRegistry(workspacePath);
    expect(registry[0]).toEqual(
      expect.objectContaining({
        name: 'checkout-api',
        stack: 'go',
        source: 'git-url',
      })
    );
  });

  it('rolls back copied project contents when registry persistence fails', async () => {
    const workspacePath = await makeTempDir('rapidkit-import-workspace-');
    const sourcePath = await makeTempDir('rapidkit-import-source-');

    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fsExtra.writeJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'demo-workspace',
    });
    await fsExtra.writeFile(path.join(workspacePath, '.rapidkit-workspace'), '{}');

    await fsExtra.writeJson(path.join(sourcePath, 'package.json'), {
      name: 'edge-api',
      dependencies: {
        express: '^4.19.2',
      },
    });

    vi.spyOn(fsExtra, 'writeJSON').mockRejectedValueOnce(new Error('registry write failed'));

    const destinationPath = path.join(workspacePath, 'edge-api');
    await expect(
      importProjectIntoWorkspace({
        workspacePath,
        source: sourcePath,
        name: 'edge-api',
      })
    ).rejects.toThrow('registry write failed');

    expect(await fsExtra.pathExists(destinationPath)).toBe(false);
    expect(await readImportedProjectsRegistry(workspacePath)).toEqual([]);
  });
});
