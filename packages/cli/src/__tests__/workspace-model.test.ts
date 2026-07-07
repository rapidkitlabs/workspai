import os from 'os';
import path from 'path';
import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildWorkspaceModel,
  validateWorkspaceModelStrict,
  WORKSPACE_MODEL_REPORT_PATH,
  writeWorkspaceModel,
} from '../workspace-model.js';
import { buildWorkspaceModelSnapshot } from '../workspace-intelligence.js';

describe('workspace intelligence model', () => {
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

  it('builds a stable model for an empty workspace', async () => {
    const workspacePath = await makeTempDir('rk-model-empty-');
    await fsExtra.outputJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'empty-platform',
      profile: 'polyglot',
    });

    const model = await buildWorkspaceModel({
      workspacePath,
      now: new Date('2026-06-14T00:00:00.000Z'),
    });

    expect(model).toMatchObject({
      schemaVersion: 'workspace-model.v1',
      generatedAt: '2026-06-14T00:00:00.000Z',
      workspace: {
        name: 'empty-platform',
        profile: 'polyglot',
      },
      summary: {
        projectCount: 0,
        runtimes: [],
        frameworks: [],
      },
    });
    expect(model.validation).toMatchObject({
      status: 'warning',
      errors: 0,
    });
    expect(model.factFreshness).toMatchObject({
      schemaVersion: 'rapidkit-fact-freshness-v1',
      totalFacts: expect.any(Number),
    });
    expect(model.facts?.map((fact) => fact.id)).toEqual(
      expect.arrayContaining(['workspace.name', 'workspace.projectCount'])
    );
    expect(model.validation?.issues.map((issue) => issue.code)).toContain(
      'workspace.projects.empty'
    );
  });

  it('embeds a first-class dependency graph and keeps the model hash deterministic across time', async () => {
    const workspacePath = await makeTempDir('rk-model-graph-');
    await fsExtra.outputJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'shop',
    });
    await fsExtra.outputJson(path.join(workspacePath, 'api', 'package.json'), {
      name: '@acme/api',
      version: '1.0.0',
    });
    await fsExtra.outputJson(path.join(workspacePath, 'web', 'package.json'), {
      name: '@acme/web',
      dependencies: { '@acme/api': 'workspace:*' },
    });

    const first = await buildWorkspaceModel({
      workspacePath,
      now: new Date('2026-06-22T00:00:00.000Z'),
    });
    const second = await buildWorkspaceModel({
      workspacePath,
      now: new Date('2026-07-01T12:34:56.000Z'),
    });

    expect(first.graph?.schemaVersion).toBe('workspace-dependency-graph.v1');
    expect(first.graph?.nodes.map((node) => node.id)).toEqual(['api', 'web']);
    const packageEdge = first.graph?.edges.find(
      (edge) => edge.from === 'web' && edge.to === 'api' && edge.kind === 'package-dep'
    );
    expect(packageEdge?.source).toBe('inferred');
    expect(first.graph?.stats.edgeCount).toBeGreaterThanOrEqual(1);

    // The graph is part of the model, but its write-time generatedAt must not cause
    // hash drift: two builds at different times hash identically.
    const firstHash = (await buildWorkspaceModelSnapshot({ workspacePath, model: first }))
      .modelHash;
    const secondHash = (await buildWorkspaceModelSnapshot({ workspacePath, model: second }))
      .modelHash;
    expect(firstHash).toBe(secondHash);
  });

  it('models RapidKit projects with runtime, framework, support tier, commands, and evidence refs', async () => {
    const workspacePath = await makeTempDir('rk-model-native-');
    await fsExtra.outputJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'team-platform',
      profile: 'python-only',
    });
    await fsExtra.outputJson(path.join(workspacePath, 'orders-api', '.rapidkit', 'project.json'), {
      name: 'orders-api',
      runtime: 'python',
      kit_name: 'fastapi.standard',
      modules: ['auth/core'],
    });
    await fsExtra.writeFile(
      path.join(workspacePath, 'orders-api', 'pyproject.toml'),
      '[project]\nname = "orders-api"\n'
    );
    await fsExtra.writeFile(
      path.join(workspacePath, 'orders-api', 'Dockerfile'),
      'FROM python:3.12\n'
    );
    await fsExtra.outputJson(
      path.join(workspacePath, 'orders-api', '.rapidkit', 'reports', 'doctor-last-run.json'),
      {
        status: 'pass',
        generatedAt: '2026-06-14T01:00:00.000Z',
      }
    );
    await fsExtra.outputJson(
      path.join(
        workspacePath,
        'orders-api',
        '.rapidkit',
        'reports',
        'doctor-remediation-plan-last-run.json'
      ),
      {
        schemaVersion: 'doctor-remediation-plan-v2',
        status: 'planned',
        generatedAt: '2026-06-14T01:01:00.000Z',
      }
    );
    await fsExtra.outputJson(
      path.join(
        workspacePath,
        'orders-api',
        '.rapidkit',
        'reports',
        'doctor-fix-result-last-run.json'
      ),
      {
        schemaVersion: 'rapidkit-doctor-fix-result-v1',
        verdict: 'completed',
        generatedAt: '2026-06-14T01:02:00.000Z',
      }
    );

    const model = await buildWorkspaceModel({
      workspacePath,
      includeEvidence: true,
      now: new Date('2026-06-14T00:00:00.000Z'),
    });

    expect(model.workspace.name).toBe('team-platform');
    expect(model.identity.workspaceType).toBe('backend-workspace');
    expect(model.summary.firstClassProjects).toBe(1);
    expect(model.projects).toHaveLength(1);
    expect(model.projects[0]).toMatchObject({
      name: 'orders-api',
      path: 'orders-api',
      kind: 'service',
      runtime: 'python',
      framework: 'fastapi',
      frameworkDisplayName: 'FastAPI',
      supportTier: 'first-class',
      moduleSupport: true,
      kit: 'fastapi.standard',
      createCapability: {
        lane: 'native-create',
        canExecuteCreate: true,
        resolved: 'fastapi.standard',
      },
      evidence: {
        doctor: {
          path: 'orders-api/.workspai/reports/doctor-last-run.json',
          exists: true,
          status: 'pass',
          generatedAt: '2026-06-14T01:00:00.000Z',
        },
        remediationPlan: {
          path: 'orders-api/.workspai/reports/doctor-remediation-plan-last-run.json',
          exists: true,
          status: 'planned',
          generatedAt: '2026-06-14T01:01:00.000Z',
        },
        fixResult: {
          path: 'orders-api/.workspai/reports/doctor-fix-result-last-run.json',
          exists: true,
          status: 'completed',
          generatedAt: '2026-06-14T01:02:00.000Z',
        },
      },
    });
    expect(model.projects[0].commands.supported).toContain('test');
    expect(model.projects[0].commands.fleetStages).toContain('test');
    expect(model.projects[0].commands.localOnly).toContain('dev');
    expect(model.projects[0].commands.map.test).toMatchObject({
      status: 'supported',
      fleetEligible: true,
      executionScope: 'fleet',
    });
    expect(model.projects[0].commands.map.dev).toMatchObject({
      executionScope: 'local-only',
      fleetEligible: false,
    });
    expect(model.projects[0].importantFiles).toContain('.rapidkit/project.json');
    expect(model.facts?.map((fact) => fact.id)).toEqual(
      expect.arrayContaining([
        'project.orders-api.framework',
        'project.orders-api.safeFleetStages',
        'project.orders-api.evidence.doctor',
        'workspace.evidence.doctor',
      ])
    );
    expect(
      model.facts?.find((fact) => fact.id === 'project.orders-api.evidence.doctor')?.freshness
    ).toMatchObject({
      kind: 'evidence-backed',
      category: 'verification',
      verifyBeforeUse: true,
    });
    expect(model.validation?.issues.map((issue) => issue.code)).toContain(
      'workspace.contract.missing'
    );
  });

  it('reports duplicate project names as strict validation errors', async () => {
    const workspacePath = await makeTempDir('rk-model-duplicate-');
    await fsExtra.outputJson(
      path.join(workspacePath, 'apps', 'api-a', '.rapidkit', 'project.json'),
      {
        name: 'api',
        runtime: 'python',
        kit_name: 'fastapi.standard',
      }
    );
    await fsExtra.outputJson(
      path.join(workspacePath, 'apps', 'api-b', '.rapidkit', 'project.json'),
      {
        name: 'api',
        runtime: 'node',
        framework: 'nestjs',
      }
    );

    const model = await buildWorkspaceModel({
      workspacePath,
      now: new Date('2026-06-14T00:00:00.000Z'),
    });

    expect(model.validation).toMatchObject({
      status: 'failed',
      errors: 1,
    });
    expect(model.validation?.issues.map((issue) => issue.code)).toContain('project.name.duplicate');
  });

  it('observes frontend projects without requiring RapidKit project metadata', async () => {
    const workspacePath = await makeTempDir('rk-model-frontend-');
    await fsExtra.outputJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      name: 'full-stack-platform',
      profile: 'polyglot',
    });
    await fsExtra.outputJson(path.join(workspacePath, 'apps', 'web', 'package.json'), {
      private: true,
      dependencies: {
        next: '^15.0.0',
        react: '^19.0.0',
      },
      scripts: {
        dev: 'next dev',
        build: 'next build',
      },
    });

    const model = await buildWorkspaceModel({
      workspacePath,
      now: new Date('2026-06-14T00:00:00.000Z'),
    });

    expect(model.identity.workspaceType).toBe('frontend-workspace');
    expect(model.identity.surfaces).toEqual(['frontend']);
    expect(model.projects).toHaveLength(1);
    expect(model.projects[0]).toMatchObject({
      name: 'web',
      path: 'apps/web',
      kind: 'frontend',
      runtime: 'node',
      framework: 'nextjs',
      frameworkDisplayName: 'Next.js',
      supportTier: 'extended',
    });
    expect(model.projects[0].importantFiles).toContain('package.json');
  });

  it('separates official frontend generator identity from detected framework identity', async () => {
    const workspacePath = await makeTempDir('rk-model-frontend-generator-');
    await fsExtra.outputJson(path.join(workspacePath, 'apps', 'web', '.rapidkit', 'project.json'), {
      name: 'web',
      kind: 'frontend',
      runtime: 'node',
      framework: 'react',
      framework_display_name: 'React + Vite',
      kit_name: 'frontend.vite-react',
      kit: 'frontend.vite-react',
      support_tier: 'extended',
      module_support: false,
      frontend: {
        generator: 'vite-react',
        official_generator: true,
        command_display: 'npm create vite@latest web -- --template react-ts',
      },
    });
    await fsExtra.outputJson(path.join(workspacePath, 'apps', 'web', 'package.json'), {
      dependencies: {
        vite: '^6.0.0',
        react: '^19.0.0',
        'react-dom': '^19.0.0',
      },
    });

    const model = await buildWorkspaceModel({
      workspacePath,
      now: new Date('2026-06-14T00:00:00.000Z'),
    });

    expect(model.projects[0]).toMatchObject({
      name: 'web',
      framework: 'react',
      kit: 'frontend.vite-react',
      generator: {
        id: 'vite-react',
        kit: 'frontend.vite-react',
        displayName: 'React',
        source: 'official-generator',
        commandDisplay: 'npm create vite@latest web -- --template react-ts',
      },
      createCapability: {
        lane: 'native-create',
        canExecuteCreate: true,
        resolved: 'frontend.vite-react',
      },
    });
  });

  it('keeps observed PHP projects in adopt-only create capability', async () => {
    const workspacePath = await makeTempDir('rk-model-php-');
    await fsExtra.outputJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      name: 'content-platform',
      profile: 'polyglot',
    });
    await fsExtra.outputJson(path.join(workspacePath, 'cms', 'composer.json'), {
      require: {
        php: '^8.2',
        'laravel/framework': '^11.0',
      },
    });

    const model = await buildWorkspaceModel({
      workspacePath,
      now: new Date('2026-06-14T00:00:00.000Z'),
    });

    expect(model.projects[0]).toMatchObject({
      name: 'cms',
      runtime: 'php',
      framework: 'laravel',
      createCapability: {
        lane: 'external-create-adopt',
        status: 'planned',
        canExecuteCreate: false,
        resolved: 'laravel',
        fallbackLane: 'adopt-only',
      },
    });
  });

  it('supports configurable observable scan depth for deep monorepos', async () => {
    const workspacePath = await makeTempDir('rk-model-depth-');
    const deepProjectPath = path.join(
      workspacePath,
      'platform',
      'domains',
      'customer',
      'apps',
      'portal'
    );
    await fsExtra.outputJson(path.join(deepProjectPath, 'package.json'), {
      dependencies: {
        next: '^15.0.0',
        react: '^19.0.0',
      },
    });

    const defaultModel = await buildWorkspaceModel({
      workspacePath,
      now: new Date('2026-06-14T00:00:00.000Z'),
    });
    const deepModel = await buildWorkspaceModel({
      workspacePath,
      observableScanDepth: 8,
      now: new Date('2026-06-14T00:00:00.000Z'),
    });

    expect(defaultModel.discovery.observableScanDepth).toBe(4);
    expect(defaultModel.projects.map((project) => project.path)).not.toContain(
      'platform/domains/customer/apps/portal'
    );
    expect(deepModel.discovery.observableScanDepth).toBe(8);
    expect(deepModel.projects.map((project) => project.path)).toContain(
      'platform/domains/customer/apps/portal'
    );
  });

  it('fails validation when fleet and local command summaries drift from the capability map', async () => {
    const workspacePath = await makeTempDir('rk-model-command-drift-');
    await fsExtra.outputJson(path.join(workspacePath, 'web', 'package.json'), {
      dependencies: {
        next: '^15.0.0',
        react: '^19.0.0',
      },
      scripts: {
        dev: 'next dev',
        build: 'next build',
        test: 'vitest',
      },
    });

    const model = await buildWorkspaceModel({
      workspacePath,
      now: new Date('2026-06-14T00:00:00.000Z'),
    });
    const project = model.projects[0];
    expect(project.commands.fleetStages).toEqual(['init', 'test', 'build']);
    expect(project.commands.localOnly).toContain('dev');

    project.commands.fleetStages = ['init', 'test', 'dev'];
    project.commands.localOnly = [];
    const validation = validateWorkspaceModelStrict(model);

    expect(validation.status).toBe('failed');
    expect(validation.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'project.commands.fleet-stage-invalid',
        'project.commands.fleet-stage-missing',
        'project.commands.local-only-missing',
      ])
    );
  });

  it('writes the workspace model artifact', async () => {
    const workspacePath = await makeTempDir('rk-model-write-');
    const model = await buildWorkspaceModel({
      workspacePath,
      now: new Date('2026-06-14T00:00:00.000Z'),
    });

    const outputPath = await writeWorkspaceModel(model, workspacePath);

    expect(outputPath).toBe(path.join(workspacePath, WORKSPACE_MODEL_REPORT_PATH));
    const saved = await fsExtra.readJson(outputPath);
    expect(saved.schemaVersion).toBe('workspace-model.v1');
    expect(saved.workspace.root).toBe(workspacePath);
  });
});
