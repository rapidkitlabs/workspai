import os from 'os';
import path from 'path';
import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildWorkspaceContract,
  buildWorkspaceContractGraph,
  syncWorkspaceContract,
  verifyWorkspaceContract,
  writeWorkspaceContract,
  WORKSPACE_CONTRACT_PATH,
} from '../utils/workspace-contract.js';
import { upsertImportedProjectsRegistry } from '../imported-projects-registry.js';

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

  it('discovers context.json-only projects when building a workspace contract', async () => {
    const workspacePath = await makeTempDir('rk-contract-context-');
    await fsExtra.outputJson(path.join(workspacePath, 'web-ui', '.rapidkit', 'context.json'), {
      name: 'web-ui',
      runtime: 'node',
      framework: 'vite',
      kit: 'vite.standard',
    });

    const contract = await buildWorkspaceContract({ workspacePath });
    expect(contract.projects).toHaveLength(1);
    expect(contract.projects[0]).toMatchObject({
      slug: 'web-ui',
      relativePath: 'web-ui',
      runtime: 'node',
      framework: 'vite',
      kit: 'vite.standard',
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
    const contract = await fsExtra.readJson(contractPath);
    expect(contract.projects[0].ports).toEqual([{ name: 'http', port: 3000, protocol: 'http' }]);
  });

  it('syncs discovered projects while preserving manually declared contracts', async () => {
    const workspacePath = await makeTempDir('rk-contract-sync-');
    await fsExtra.outputJson(path.join(workspacePath, 'orders', '.rapidkit', 'project.json'), {
      runtime: 'python',
      kit_name: 'fastapi.standard',
    });
    await fsExtra.outputJson(path.join(workspacePath, WORKSPACE_CONTRACT_PATH), {
      schemaVersion: 1,
      kind: 'rapidkit.workspace.contract',
      generatedAt: '2026-06-02T00:00:00.000Z',
      workspace: { name: 'sync-ws' },
      projects: [
        {
          slug: 'orders',
          relativePath: 'orders',
          runtime: 'python',
          framework: 'fastapi',
          kit: 'fastapi.standard',
          modules: [],
          ports: [{ name: 'http', port: 8100, protocol: 'http' }],
          contracts: {
            owns: ['Order'],
            apis: [{ name: 'Orders API', basePath: '/api/orders' }],
            publishes: ['OrderCreated'],
            consumes: [],
            dependsOn: [],
            env: ['DATABASE_URL'],
          },
        },
      ],
    });
    await fsExtra.outputJson(path.join(workspacePath, 'users', '.rapidkit', 'project.json'), {
      runtime: 'python',
      kit_name: 'fastapi.standard',
    });

    const result = await syncWorkspaceContract({ workspacePath });
    expect(result.verification.status).toBe('passed');
    expect(result.addedProjects).toEqual(['users']);
    const orders = result.contract.projects.find((project) => project.slug === 'orders');
    const users = result.contract.projects.find((project) => project.slug === 'users');
    expect(orders?.ports[0].port).toBe(8100);
    expect(orders?.contracts.owns).toEqual(['Order']);
    expect(users?.ports[0].port).toBe(8000);
  });

  it('models adopted external projects with safe contract-relative paths', async () => {
    const workspacePath = await makeTempDir('rk-contract-adopt-ws-');
    const externalProjectPath = await makeTempDir('rk-contract-adopt-next-');
    await fsExtra.outputJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'adopt-ws',
      profile: 'polyglot',
    });
    await fsExtra.outputJson(path.join(externalProjectPath, '.rapidkit', 'project.json'), {
      name: 'web',
      runtime: 'node',
      framework: 'nextjs',
      kit_name: 'adopted.nextjs',
      modules: [],
    });
    await upsertImportedProjectsRegistry(workspacePath, [
      {
        name: 'web',
        path: externalProjectPath,
        relativePath: path.relative(workspacePath, externalProjectPath).replace(/\\/g, '/'),
        relationship: 'adopted',
        source: 'adopted-local',
        stack: 'nextjs',
        runtime: 'node',
        framework: 'nextjs',
        frameworkDisplayName: 'Next.js',
        supportTier: 'extended',
        moduleSupport: false,
        confidence: 'high',
        importedAt: '2026-06-14T00:00:00.000Z',
      },
    ]);

    const result = await syncWorkspaceContract({ workspacePath });
    const web = result.contract.projects.find((project) => project.slug === 'web');

    expect(result.verification.status).toBe('passed');
    expect(web).toMatchObject({
      slug: 'web',
      relativePath: 'external/web',
      externalPath: externalProjectPath,
      relationship: 'adopted',
      source: 'adopted-local',
      runtime: 'node',
      framework: 'nextjs',
      kit: 'adopted.nextjs',
    });
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

  it('fails verification for unsafe paths and invalid service contracts', async () => {
    const workspacePath = await makeTempDir('rk-contract-invalid-contracts-');
    await fsExtra.outputJson(path.join(workspacePath, WORKSPACE_CONTRACT_PATH), {
      schemaVersion: 1,
      kind: 'rapidkit.workspace.contract',
      generatedAt: '2026-06-02T00:00:00.000Z',
      workspace: { name: 'invalid-contracts-ws' },
      projects: [
        {
          slug: 'orders',
          relativePath: '../orders',
          modules: [],
          ports: [],
          contracts: {
            owns: [],
            apis: [{ name: '', basePath: 'api/orders' }],
            publishes: [''],
            consumes: [],
            dependsOn: [],
            env: ['database-url'],
          },
        },
      ],
    });

    const result = await verifyWorkspaceContract({ workspacePath });
    expect(result.status).toBe('failed');
    expect(result.checks.find((check) => check.id === 'contracts')?.status).toBe('failed');
    expect(result.violations.join('\n')).toContain('unsafe relativePath');
    expect(result.violations.join('\n')).toContain('invalid API contract');
    expect(result.violations.join('\n')).toContain('empty event contract');
    expect(result.violations.join('\n')).toContain('invalid env contract');
  });

  it('builds service graph nodes and dependency/event edges', async () => {
    const workspacePath = await makeTempDir('rk-contract-graph-');
    await fsExtra.outputJson(path.join(workspacePath, WORKSPACE_CONTRACT_PATH), {
      schemaVersion: 1,
      kind: 'rapidkit.workspace.contract',
      generatedAt: '2026-06-02T00:00:00.000Z',
      workspace: { name: 'graph-ws' },
      projects: [
        {
          slug: 'orders',
          relativePath: 'orders',
          runtime: 'python',
          framework: 'fastapi',
          kit: 'fastapi.standard',
          modules: [],
          ports: [{ name: 'http', port: 8000, protocol: 'http' }],
          contracts: {
            owns: ['Order'],
            apis: [{ name: 'Orders API', basePath: '/api/orders' }],
            publishes: ['OrderCreated'],
            consumes: [],
            dependsOn: [],
            env: ['DATABASE_URL'],
          },
        },
        {
          slug: 'billing',
          relativePath: 'billing',
          runtime: 'node',
          framework: 'nestjs',
          kit: 'nestjs.standard',
          modules: [],
          ports: [{ name: 'http', port: 3000, protocol: 'http' }],
          contracts: {
            owns: ['Invoice'],
            apis: [],
            publishes: [],
            consumes: ['OrderCreated'],
            dependsOn: ['orders'],
            env: [],
          },
        },
      ],
    });

    const { graph } = await buildWorkspaceContractGraph({ workspacePath });
    expect(graph.kind).toBe('rapidkit.workspace.contract.graph');
    expect(graph.summary).toMatchObject({
      projectCount: 2,
      dependencyEdges: 1,
      eventEdges: 1,
      portCount: 2,
      apiCount: 1,
    });
    expect(graph.edges).toEqual([
      { from: 'orders', to: 'billing', type: 'dependency', label: 'dependsOn' },
      { from: 'orders', to: 'billing', type: 'event', label: 'OrderCreated' },
    ]);
  });
});
