import os from 'os';
import path from 'path';
import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildWorkspaceContract,
  verifyWorkspaceContract,
  writeWorkspaceContract,
  WORKSPACE_CONTRACT_PATH,
} from '../utils/workspace-contract.js';

describe('workspace contract registry', () => {
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

  it('builds a canonical contract from discovered RapidKit projects', async () => {
    const workspacePath = await makeTempDir('rk-contract-ws-');
    await fsExtra.outputJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'team-ws',
      profile: 'polyglot',
    });
    await fsExtra.outputJson(path.join(workspacePath, 'orders-api', '.rapidkit', 'project.json'), {
      runtime: 'python',
      kit_name: 'fastapi.standard',
      modules: ['auth/core', 'billing/stripe_payment'],
    });

    const contract = await buildWorkspaceContract({
      workspacePath,
      now: new Date('2026-06-02T00:00:00.000Z'),
    });

    expect(contract.kind).toBe('rapidkit.workspace.contract');
    expect(contract.workspace.name).toBe('team-ws');
    expect(contract.projects).toHaveLength(1);
    expect(contract.projects[0]).toMatchObject({
      slug: 'orders-api',
      relativePath: 'orders-api',
      runtime: 'python',
      framework: 'fastapi',
      kit: 'fastapi.standard',
      modules: ['auth/core', 'billing/stripe_payment'],
    });
  });

  it('writes and verifies a valid workspace contract', async () => {
    const workspacePath = await makeTempDir('rk-contract-write-');
    await fsExtra.outputJson(path.join(workspacePath, 'api', '.rapidkit', 'project.json'), {
      runtime: 'node',
      kit_name: 'nestjs.standard',
    });

    const { contractPath } = await writeWorkspaceContract({ workspacePath });
    expect(contractPath).toBe(path.join(workspacePath, WORKSPACE_CONTRACT_PATH));

    const result = await verifyWorkspaceContract({ workspacePath });
    expect(result.status).toBe('passed');
    expect(result.projectCount).toBe(1);
  });

  it('fails verification for colliding ports and unknown dependencies', async () => {
    const workspacePath = await makeTempDir('rk-contract-fail-');
    await fsExtra.outputJson(path.join(workspacePath, WORKSPACE_CONTRACT_PATH), {
      schemaVersion: 1,
      kind: 'rapidkit.workspace.contract',
      generatedAt: '2026-06-02T00:00:00.000Z',
      workspace: { name: 'broken-ws' },
      projects: [
        {
          slug: 'orders',
          relativePath: 'orders',
          modules: [],
          ports: [{ name: 'http', port: 8000, protocol: 'http' }],
          contracts: {
            owns: [],
            apis: [],
            publishes: [],
            consumes: [],
            dependsOn: ['missing-users'],
            env: [],
          },
        },
        {
          slug: 'billing',
          relativePath: 'billing',
          modules: [],
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

    const result = await verifyWorkspaceContract({ workspacePath });
    expect(result.status).toBe('failed');
    expect(result.violations.join('\n')).toContain('Port 8000');
    expect(result.violations.join('\n')).toContain('depends on unknown project');
  });
});
