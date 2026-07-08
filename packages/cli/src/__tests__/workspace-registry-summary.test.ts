import path from 'path';
import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import { WORKSPACE_CONTRACT_PATH } from '../utils/workspace-contract.js';
import {
  formatWorkspaceRegistrySyncSummary,
  publishWorkspaceRegistrySummary,
  readWorkspaceRegistrySummary,
  resolveWorkspaceRegisteredProjects,
  WORKSPACE_REGISTRY_SUMMARY_RELATIVE_PATH,
} from '../utils/workspace-registry-summary.js';

const tempRoots: string[] = [];

async function createWorkspaceRoot(): Promise<string> {
  const workspacePath = path.join(
    await fsExtra.realpath(await fsExtra.mkdtemp(path.join(process.cwd(), 'registry-summary-')))
  );
  tempRoots.push(workspacePath);
  await fsExtra.ensureDir(path.join(workspacePath, '.workspai'));
  await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
  return workspacePath;
}

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await fsExtra.remove(root);
  }
});

describe('workspace-registry-summary', () => {
  it('uses workspace.contract.json as authority when projects are registered there', async () => {
    const workspacePath = await createWorkspaceRoot();
    await fsExtra.writeJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      schema_version: '1.0',
      workspace_name: 'polyglot-ws',
      profile: 'polyglot',
    });
    await fsExtra.outputJson(path.join(workspacePath, WORKSPACE_CONTRACT_PATH), {
      schemaVersion: 1,
      kind: 'rapidkit.workspace.contract',
      generatedAt: '2026-06-16T00:00:00.000Z',
      workspace: { name: 'polyglot-ws', profile: 'polyglot' },
      projects: [
        {
          slug: 'api',
          relativePath: 'api',
          framework: 'fastapi',
          kit: 'fastapi.standard',
          modules: [],
          ports: [],
          contracts: { owns: [], apis: [], publishes: [], consumes: [], dependsOn: [], env: [] },
        },
        {
          slug: 'nest',
          relativePath: 'nest',
          framework: 'nestjs',
          kit: 'nestjs.standard',
          modules: [],
          ports: [],
          contracts: { owns: [], apis: [], publishes: [], consumes: [], dependsOn: [], env: [] },
        },
      ],
    });

    const resolved = await resolveWorkspaceRegisteredProjects(workspacePath);
    expect(resolved.summary.authority).toBe('workspace.contract.json');
    expect(resolved.summary.projectCount).toBe(2);
    expect(resolved.summary.projects.map((project) => project.slug)).toEqual(['api', 'nest']);

    const summary = await publishWorkspaceRegistrySummary(workspacePath);
    expect(summary.schemaVersion).toBe('workspace-registry.v1');
    expect(
      await fsExtra.pathExists(path.join(workspacePath, WORKSPACE_REGISTRY_SUMMARY_RELATIVE_PATH))
    ).toBe(true);
    expect(formatWorkspaceRegistrySyncSummary(summary, ' · profile polyglot')).toContain(
      '2 project(s) registered in workspace contract'
    );
  });

  it('does not treat empty workspace.json as registered projects when contract exists', async () => {
    const workspacePath = await createWorkspaceRoot();
    await fsExtra.writeJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      schema_version: '1.0',
      workspace_name: 'empty-manifest',
      profile: 'polyglot',
    });
    await fsExtra.outputJson(path.join(workspacePath, WORKSPACE_CONTRACT_PATH), {
      schemaVersion: 1,
      kind: 'rapidkit.workspace.contract',
      generatedAt: '2026-06-16T00:00:00.000Z',
      workspace: { name: 'empty-manifest', profile: 'polyglot' },
      projects: [
        {
          slug: 'api',
          relativePath: 'api',
          modules: [],
          ports: [],
          contracts: { owns: [], apis: [], publishes: [], consumes: [], dependsOn: [], env: [] },
        },
      ],
    });

    const resolved = await resolveWorkspaceRegisteredProjects(workspacePath);
    expect(resolved.summary.projectCount).toBe(1);
    expect(resolved.summary.sources.legacyWorkspaceJson.projectCount).toBe(0);
  });

  it('reports a global registry entry as existing even before projects are registered', async () => {
    const workspacePath = await createWorkspaceRoot();
    const originalHome = process.env.HOME;
    const fakeHome = await fsExtra.mkdtemp(path.join(process.cwd(), 'registry-summary-home-'));
    tempRoots.push(fakeHome);
    process.env.HOME = fakeHome;

    try {
      await fsExtra.outputJson(path.join(fakeHome, '.workspai', 'workspaces.json'), {
        workspaces: [
          {
            name: 'empty-global',
            path: workspacePath,
            mode: 'full',
            projects: [],
          },
        ],
      });

      const resolved = await resolveWorkspaceRegisteredProjects(workspacePath);
      expect(resolved.summary.sources.globalRegistry.exists).toBe(true);
      expect(resolved.summary.sources.globalRegistry.projectCount).toBe(0);
      expect(resolved.summary.authority).toBe('none');
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
    }
  });

  it('reads published summary artifact', async () => {
    const workspacePath = await createWorkspaceRoot();
    await publishWorkspaceRegistrySummary(workspacePath);
    const summary = await readWorkspaceRegistrySummary(workspacePath);
    expect(summary?.schemaVersion).toBe('workspace-registry.v1');
    expect(summary?.authority).toBe('none');
    expect(summary?.projectCount).toBe(0);
  });
});
