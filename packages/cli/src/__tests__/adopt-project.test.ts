import os from 'os';
import path from 'path';

import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import { adoptProjectIntoWorkspace, cleanupAdoptedProjectImport } from '../adopt-project';
import { readImportedProjectsRegistry } from '../imported-projects-registry';
import { buildWorkspaceModel } from '../workspace-model';
import { syncWorkspaceContract } from '../utils/workspace-contract';

const createdPaths: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dirPath = await fsExtra.mkdtemp(path.join(os.tmpdir(), prefix));
  createdPaths.push(dirPath);
  return dirPath;
}

async function makeWorkspace(): Promise<string> {
  const workspacePath = await makeTempDir('rapidkit-adopt-workspace-');
  await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
  await fsExtra.writeJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
    workspace_name: 'demo-workspace',
  });
  await fsExtra.writeFile(path.join(workspacePath, '.rapidkit-workspace'), '{}');
  return workspacePath;
}

afterEach(async () => {
  while (createdPaths.length > 0) {
    const target = createdPaths.pop();
    if (target) {
      await fsExtra.remove(target);
    }
  }
});

describe('adopt-project', () => {
  it('adopts an existing local project without moving source files', async () => {
    const workspacePath = await makeWorkspace();
    const projectPath = await makeTempDir('rapidkit-adopt-source-');
    await fsExtra.writeJson(path.join(projectPath, 'package.json'), {
      name: 'portal-web',
      dependencies: {
        next: '^15.0.0',
        react: '^19.0.0',
      },
      scripts: {
        dev: 'next dev',
        build: 'next build',
      },
    });

    const adopted = await adoptProjectIntoWorkspace({
      workspacePath,
      source: projectPath,
      name: 'portal-web',
      now: new Date('2026-06-14T12:00:00.000Z'),
    });

    expect(adopted).toMatchObject({
      name: 'portal-web',
      path: projectPath,
      relationship: 'adopted',
      runtime: 'node',
      framework: 'nextjs',
      frameworkDisplayName: 'Next.js',
      wroteFiles: true,
    });
    expect(await fsExtra.pathExists(path.join(projectPath, 'package.json'))).toBe(true);
    expect(await fsExtra.pathExists(adopted.projectJsonPath)).toBe(true);
    expect(await fsExtra.pathExists(adopted.adoptJsonPath)).toBe(true);
    expect(await fsExtra.pathExists(adopted.adoptReadinessPath)).toBe(true);

    const projectJson = await fsExtra.readJson(adopted.projectJsonPath);
    expect(projectJson).toMatchObject({
      name: 'portal-web',
      runtime: 'node',
      framework: 'nextjs',
      kind: 'frontend',
      kit_name: 'adopted.nextjs',
      module_support: false,
      adoption: {
        managed_by: 'workspai',
        mode: 'linked',
        adopted_at: '2026-06-14T12:00:00.000Z',
      },
    });
    expect(await fsExtra.pathExists(path.join(projectPath, '.workspai', 'project.json'))).toBe(
      true
    );
    expect(await fsExtra.pathExists(path.join(projectPath, '.rapidkit', 'project.json'))).toBe(
      false
    );

    const adoptJson = await fsExtra.readJson(adopted.adoptJsonPath);
    expect(adoptJson).toMatchObject({
      kind: 'workspai.adopted_project',
      mode: 'linked',
      policy: {
        moved_source: false,
        copied_source: false,
      },
      detection: {
        framework: 'nextjs',
        runtime: 'node',
      },
    });

    const readiness = await fsExtra.readJson(adopted.adoptReadinessPath);
    expect(readiness).toMatchObject({
      kind: 'rapidkit.import_readiness',
      project: {
        kind: 'frontend',
        source: 'adopted-local',
      },
      detection: {
        framework: 'nextjs',
        runtime: 'node',
      },
    });

    const registry = await readImportedProjectsRegistry(workspacePath);
    expect(registry).toEqual([
      expect.objectContaining({
        name: 'portal-web',
        path: projectPath,
        relationship: 'adopted',
        source: 'adopted-local',
        framework: 'nextjs',
      }),
    ]);
  });

  it('previews adoption without writing metadata in dry-run mode', async () => {
    const workspacePath = await makeWorkspace();
    const projectPath = await makeTempDir('rapidkit-adopt-dry-source-');
    await fsExtra.writeJson(path.join(projectPath, 'package.json'), {
      dependencies: {
        express: '^4.19.2',
      },
    });

    const adopted = await adoptProjectIntoWorkspace({
      workspacePath,
      source: projectPath,
      dryRun: true,
    });

    expect(adopted.wroteFiles).toBe(false);
    expect(await fsExtra.pathExists(adopted.projectJsonPath)).toBe(false);
    expect(await fsExtra.pathExists(adopted.adoptJsonPath)).toBe(false);
    expect(await readImportedProjectsRegistry(workspacePath)).toEqual([]);
  });

  it('records a profile compatibility warning when adopting a mismatched runtime', async () => {
    const workspacePath = await makeWorkspace();
    await fsExtra.writeJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'demo-workspace',
      profile: 'node-only',
    });
    const projectPath = await makeTempDir('rapidkit-adopt-fastapi-source-');
    await fsExtra.writeFile(path.join(projectPath, 'requirements.txt'), 'fastapi\nuvicorn\n');

    const adopted = await adoptProjectIntoWorkspace({
      workspacePath,
      source: projectPath,
      name: 'studio-api',
    });

    expect(adopted.profileCompatibility).toMatchObject({
      ok: false,
      profile: 'node-only',
      recommendedProfile: 'polyglot',
      recommendedCommand: 'npx workspai bootstrap --profile polyglot',
      message: 'Project "studio-api" is Python, but workspace profile is "node-only".',
    });

    const adoptJson = await fsExtra.readJson(adopted.adoptJsonPath);
    expect(adoptJson.policy.profile_compatibility).toMatchObject({
      ok: false,
      profile: 'node-only',
      recommended_profile: 'polyglot',
      recommended_command: 'npx workspai bootstrap --profile polyglot',
    });
  });

  it('blocks mismatched adoption in strict profile policy mode', async () => {
    const workspacePath = await makeWorkspace();
    await fsExtra.writeJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'demo-workspace',
      profile: 'node-only',
    });
    const projectPath = await makeTempDir('rapidkit-adopt-strict-fastapi-source-');
    await fsExtra.writeFile(path.join(projectPath, 'requirements.txt'), 'fastapi\n');

    await expect(
      adoptProjectIntoWorkspace({
        workspacePath,
        source: projectPath,
        name: 'studio-api',
        profilePolicyMode: 'strict',
      })
    ).rejects.toThrow('Project "studio-api" is Python, but workspace profile is "node-only".');
  });

  it('warns when adoption makes a minimal workspace multi-runtime', async () => {
    const workspacePath = await makeWorkspace();
    await fsExtra.writeJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'demo-workspace',
      profile: 'minimal',
    });
    const existingNodeProject = path.join(workspacePath, 'portal-web');
    await fsExtra.ensureDir(path.join(existingNodeProject, '.workspai'));
    await fsExtra.writeJson(path.join(existingNodeProject, '.workspai', 'project.json'), {
      name: 'portal-web',
      runtime: 'node',
    });
    const projectPath = await makeTempDir('rapidkit-adopt-minimal-fastapi-source-');
    await fsExtra.writeFile(path.join(projectPath, 'requirements.txt'), 'fastapi\n');

    const adopted = await adoptProjectIntoWorkspace({
      workspacePath,
      source: projectPath,
      name: 'studio-api',
    });

    expect(adopted.profileCompatibility).toMatchObject({
      ok: false,
      profile: 'minimal',
      recommendedProfile: 'polyglot',
      message: 'minimal profile mismatch: multiple runtimes detected [node, python].',
    });
  });

  it('makes adopted projects visible to workspace model and contract sync', async () => {
    const workspacePath = await makeWorkspace();
    const projectPath = await makeTempDir('rapidkit-adopt-contract-source-');
    await fsExtra.writeJson(path.join(projectPath, 'package.json'), {
      name: 'orders-api',
      dependencies: {
        express: '^4.19.2',
      },
    });

    await adoptProjectIntoWorkspace({
      workspacePath,
      source: projectPath,
      name: 'orders-api',
    });

    const model = await buildWorkspaceModel({ workspacePath });
    expect(model.projects).toEqual([
      expect.objectContaining({
        name: 'orders-api',
        path: path.relative(workspacePath, projectPath).split(path.sep).join('/'),
        framework: 'express',
      }),
    ]);

    const contractSync = await syncWorkspaceContract({ workspacePath });
    expect(contractSync.addedProjects).toEqual(['orders-api']);
    expect(contractSync.contract.projects).toEqual([
      expect.objectContaining({
        slug: 'orders-api',
        relativePath: 'external/orders-api',
        externalPath: projectPath,
        relationship: 'adopted',
        source: 'adopted-local',
        runtime: 'node',
        framework: 'express',
        kit: 'adopted.express',
      }),
    ]);
  });

  it('rejects adopting the workspace root as a project', async () => {
    const workspacePath = await makeWorkspace();

    await expect(
      adoptProjectIntoWorkspace({
        workspacePath,
        source: workspacePath,
      })
    ).rejects.toThrow('Adopt source cannot be the workspace root itself.');
  });

  it('restores rollback project metadata to the canonical Workspai path only', async () => {
    const workspacePath = await makeWorkspace();
    const projectPath = await makeTempDir('rapidkit-adopt-rollback-source-');
    const previousProjectJson = {
      name: 'external-api',
      runtime: 'node',
      framework: 'express',
    };

    await fsExtra.ensureDir(path.join(projectPath, '.workspai'));
    await fsExtra.writeJson(path.join(projectPath, '.workspai', 'project.json'), {
      ...previousProjectJson,
      framework: 'nextjs',
    });
    await fsExtra.writeJson(path.join(projectPath, '.workspai', 'adopt.json'), {
      temporary: true,
    });
    await fsExtra.writeJson(path.join(projectPath, '.workspai', 'adopt-readiness.json'), {
      temporary: true,
    });

    await cleanupAdoptedProjectImport(workspacePath, projectPath, previousProjectJson);

    await expect(
      fsExtra.readJson(path.join(projectPath, '.workspai', 'project.json'))
    ).resolves.toEqual(previousProjectJson);
    expect(await fsExtra.pathExists(path.join(projectPath, '.rapidkit', 'project.json'))).toBe(
      false
    );
    expect(await fsExtra.pathExists(path.join(projectPath, '.workspai', 'adopt.json'))).toBe(false);
    expect(
      await fsExtra.pathExists(path.join(projectPath, '.workspai', 'adopt-readiness.json'))
    ).toBe(false);
  });
});
