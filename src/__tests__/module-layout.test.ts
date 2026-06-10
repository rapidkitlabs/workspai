import os from 'os';
import path from 'path';
import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import {
  auditProjectModulePaths,
  auditWorkspaceModulePaths,
  resolveCanonicalModuleRelativePath,
} from '../utils/module-layout.js';
import { verifyWorkspaceContract, WORKSPACE_CONTRACT_PATH } from '../utils/workspace-contract.js';

describe('module layout contract', () => {
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

  it('resolves canonical module relative paths from free/* slugs', () => {
    expect(resolveCanonicalModuleRelativePath('free/ai/prompt_ops')).toBe(
      'src/modules/free/ai/prompt_ops'
    );
  });

  it('passes when registered modules exist under canonical paths', async () => {
    const projectRoot = await makeTempDir('rk-module-layout-pass-');
    await fsExtra.outputJson(path.join(projectRoot, 'registry.json'), {
      installed_modules: [{ slug: 'free/ai/prompt_ops' }],
    });
    await fsExtra.ensureDir(path.join(projectRoot, 'src/modules/free/ai/prompt_ops'));

    const result = await auditProjectModulePaths(projectRoot);
    expect(result.status).toBe('passed');
    expect(result.moduleCount).toBe(1);
    expect(result.issues).toHaveLength(0);
  });

  it('fails when registered modules are missing on disk', async () => {
    const projectRoot = await makeTempDir('rk-module-layout-fail-');
    await fsExtra.outputJson(path.join(projectRoot, 'registry.json'), {
      installed_modules: [{ slug: 'free/business/feature_flags' }],
    });

    const result = await auditProjectModulePaths(projectRoot);
    expect(result.status).toBe('failed');
    expect(result.issues[0]?.slug).toBe('free/business/feature_flags');
  });

  it('audits all workspace projects with registries', async () => {
    const workspacePath = await makeTempDir('rk-module-layout-ws-');
    const apiRoot = path.join(workspacePath, 'api');
    await fsExtra.ensureDir(apiRoot);
    await fsExtra.outputJson(path.join(apiRoot, 'registry.json'), {
      installed_modules: [{ slug: 'free/auth/core' }],
    });
    await fsExtra.ensureDir(path.join(apiRoot, 'src/modules/free/auth/core'));

    const result = await auditWorkspaceModulePaths(workspacePath);
    expect(result.status).toBe('passed');
    expect(result.projectCount).toBe(1);
  });

  it('surfaces module-path violations in workspace contract verification', async () => {
    const workspacePath = await makeTempDir('rk-module-layout-contract-');
    const apiRoot = path.join(workspacePath, 'api');
    await fsExtra.ensureDir(apiRoot);
    await fsExtra.outputJson(path.join(apiRoot, 'registry.json'), {
      installed_modules: [{ slug: 'free/ai/prompt_ops' }],
    });
    await fsExtra.outputJson(path.join(workspacePath, WORKSPACE_CONTRACT_PATH), {
      schemaVersion: 1,
      kind: 'rapidkit.workspace.contract',
      generatedAt: '2026-06-02T00:00:00.000Z',
      workspace: { name: 'layout-ws' },
      projects: [
        {
          slug: 'api',
          relativePath: 'api',
          runtime: 'python',
          framework: 'fastapi',
          kit: 'fastapi.standard',
          modules: ['prompt_ops'],
          ports: [{ name: 'http', port: 8000, protocol: 'http' }],
          contracts: {
            owns: [],
            apis: [],
            publishes: [],
            consumes: [],
            dependsOn: [],
            env: [],
          },
        },
      ],
    });

    const result = await verifyWorkspaceContract({ workspacePath, strict: true });
    expect(result.status).toBe('failed');
    expect(result.checks.find((check) => check.id === 'module-paths')?.status).toBe('failed');
    expect(result.violations.join('\n')).toContain('prompt_ops');
  });
});
