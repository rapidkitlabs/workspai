import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { readImportedProjectsRegistry } from '../imported-projects-registry';
import {
  getGlobalCommandCapabilities,
  handleAdoptCommand,
  handleImportCommand,
  NPM_ONLY_TOP_LEVEL_COMMANDS,
} from '../index';

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const target = tempDirs.pop();
    if (target) await fs.remove(target);
  }
});

describe('enterprise gap closures', () => {
  it('keeps global command inventory aligned with npm-only top-level commands', () => {
    const capabilities = getGlobalCommandCapabilities();
    const npmOwned = new Set(capabilities.commands.npmOwned);

    for (const command of NPM_ONLY_TOP_LEVEL_COMMANDS) {
      expect(npmOwned.has(command)).toBe(true);
    }
    expect(npmOwned.has('pipeline')).toBe(true);
    expect(npmOwned.has('project')).toBe(true);
  });

  it('syncs workspace contract after successful import', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-import-contract-'));
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-import-source-'));
    tempDirs.push(workspaceRoot, sourceDir);

    await fs.ensureDir(path.join(workspaceRoot, '.rapidkit'));
    await fs.writeJson(path.join(workspaceRoot, '.rapidkit', 'workspace.json'), {
      workspace_name: 'demo-workspace',
    });
    await fs.writeFile(path.join(workspaceRoot, '.rapidkit-workspace'), '{}');
    await fs.writeJson(path.join(sourceDir, 'package.json'), {
      name: 'orders-api',
      dependencies: { express: '^4.19.2' },
    });

    const exitCode = await handleImportCommand(sourceDir, {
      workspace: workspaceRoot,
      name: 'orders-api',
      json: true,
    });

    expect(exitCode).toBe(0);
    const contractPath = path.join(workspaceRoot, '.rapidkit', 'workspace.contract.json');
    expect(await fs.pathExists(contractPath)).toBe(true);
    const contract = await fs.readJson(contractPath);
    expect(contract.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'orders-api',
          relativePath: 'orders-api',
        }),
      ])
    );
  });

  it('rolls back adoption metadata when workspace sync fails after adopt', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-adopt-rollback-'));
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-adopt-source-'));
    tempDirs.push(workspaceRoot, sourceDir);

    await fs.ensureDir(path.join(workspaceRoot, '.rapidkit'));
    await fs.writeJson(path.join(workspaceRoot, '.rapidkit', 'workspace.json'), {
      workspace_name: 'demo-workspace',
    });
    await fs.writeFile(path.join(workspaceRoot, '.rapidkit-workspace'), '{}');
    await fs.writeJson(path.join(sourceDir, 'package.json'), {
      name: 'portal-web',
      dependencies: { next: '^15.0.0', react: '^19.0.0' },
    });

    const previousFlag = process.env.RAPIDKIT_TEST_ADOPT_SYNC_FAIL;
    process.env.RAPIDKIT_TEST_ADOPT_SYNC_FAIL = '1';

    try {
      const exitCode = await handleAdoptCommand(sourceDir, {
        workspace: workspaceRoot,
        name: 'portal-web',
        json: true,
      });

      expect(exitCode).toBe(1);
      expect(await fs.pathExists(path.join(sourceDir, '.rapidkit', 'adopt.json'))).toBe(false);
      expect(await fs.pathExists(path.join(sourceDir, '.rapidkit', 'project.json'))).toBe(false);
      expect(await readImportedProjectsRegistry(workspaceRoot)).toEqual([]);
    } finally {
      if (previousFlag === undefined) {
        delete process.env.RAPIDKIT_TEST_ADOPT_SYNC_FAIL;
      } else {
        process.env.RAPIDKIT_TEST_ADOPT_SYNC_FAIL = previousFlag;
      }
    }
  });
});
