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
    expect(model.validation?.issues.map((issue) => issue.code)).toContain(
      'workspace.projects.empty'
    );
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
    await fsExtra.outputJson(
      path.join(workspacePath, 'orders-api', '.rapidkit', 'reports', 'doctor-last-run.json'),
      {
        status: 'pass',
        generatedAt: '2026-06-14T01:00:00.000Z',
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
      evidence: {
        doctor: {
          path: 'orders-api/.rapidkit/reports/doctor-last-run.json',
          exists: true,
          status: 'pass',
          generatedAt: '2026-06-14T01:00:00.000Z',
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
