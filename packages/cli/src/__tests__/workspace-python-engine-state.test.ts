import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import fsExtra from 'fs-extra';
import os from 'os';
import path from 'path';

import { markWorkspacePythonEngineInstalled } from '../utils/workspace-python-engine-state.js';

describe('workspace Python engine state', () => {
  let workspacePath: string;

  beforeEach(async () => {
    workspacePath = path.join(os.tmpdir(), `rapidkit-python-engine-state-${Date.now()}`);
    await fsExtra.ensureDir(path.join(workspacePath, '.workspai'));
  });

  afterEach(async () => {
    await fsExtra.remove(workspacePath);
  });

  it('promotes skipped Python engine artifacts to installed after workspace init', async () => {
    await fsExtra.outputJson(
      path.join(workspacePath, '.workspai', 'workspace.json'),
      {
        schema_version: '1.0',
        workspace_name: 'demo',
        profile: 'polyglot',
        bootstrap_note: 'python-engine-skipped',
        engine: {
          install_method: 'venv',
          python_version: null,
          python_core: {
            status: 'skipped',
            reason: 'user-opted-out',
          },
        },
      },
      { spaces: 2 }
    );
    await fsExtra.outputJson(
      path.join(workspacePath, '.workspai', 'toolchain.lock'),
      {
        schema_version: '1.0',
        runtime: {
          python: {
            version: null,
            install_method: 'venv',
            core: {
              status: 'skipped',
              reason: 'user-opted-out',
            },
          },
        },
      },
      { spaces: 2 }
    );
    await fsExtra.outputJson(
      path.join(workspacePath, '.workspai-workspace'),
      {
        signature: 'RAPIDKIT_WORKSPACE',
        createdBy: 'rapidkit-npm',
        version: '0.41.5',
        createdAt: '2026-07-06T00:00:00.000Z',
        name: 'demo',
        metadata: {
          npm: {
            packageVersion: '0.41.5',
            installMethod: 'venv',
          },
          python: {
            coreStatus: 'skipped',
            coreReason: 'user-opted-out',
          },
        },
      },
      { spaces: 2 }
    );

    await markWorkspacePythonEngineInstalled(workspacePath, {
      installMethod: 'venv',
      pythonVersion: '3.10.19',
      coreVersion: '0.41.5',
      venvPath: '.venv',
      now: '2026-07-06T01:02:03.000Z',
    });

    const manifest = await fsExtra.readJson(
      path.join(workspacePath, '.workspai', 'workspace.json')
    );
    expect(manifest.bootstrap_note).toBeUndefined();
    expect(manifest.engine.python_version).toBe('3.10.19');
    expect(manifest.engine.python_core).toEqual({
      status: 'installed',
      installed_at: '2026-07-06T01:02:03.000Z',
      version: '0.41.5',
    });

    const toolchain = await fsExtra.readJson(
      path.join(workspacePath, '.workspai', 'toolchain.lock')
    );
    expect(toolchain.runtime.python.version).toBe('3.10.19');
    expect(toolchain.runtime.python.core).toEqual({
      status: 'installed',
      installed_at: '2026-07-06T01:02:03.000Z',
      version: '0.41.5',
    });

    const marker = await fsExtra.readJson(path.join(workspacePath, '.workspai-workspace'));
    expect(marker.metadata.python).toEqual({
      coreStatus: 'installed',
      coreVersion: '0.41.5',
      pythonVersion: '3.10.19',
      venvPath: '.venv',
    });
    expect(marker.metadata.npm.installMethod).toBe('venv');
    expect(marker.metadata.npm.lastUsedAt).toBe('2026-07-06T01:02:03.000Z');
  });
});
