import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fsExtra from 'fs-extra';
import path from 'path';
import os from 'os';
import { createWorkspaceShareBundle } from '../workspace.js';

describe('createWorkspaceShareBundle', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `workspace-share-test-${Date.now()}-${Math.random()}`);
    await fsExtra.ensureDir(testDir);
  });

  afterEach(async () => {
    if (testDir && (await fsExtra.pathExists(testDir))) {
      await fsExtra.remove(testDir);
    }
  });

  it('creates a collaboration bundle with project metadata and reports', async () => {
    const projectPath = path.join(testDir, 'orders-service');

    await fsExtra.outputJson(path.join(testDir, '.rapidkit', 'workspace.json'), {
      workspace_name: 'team-ws',
      profile: 'polyglot',
      rapidkit_version: '0.26.0',
    });
    await fsExtra.outputJson(path.join(testDir, '.rapidkit', 'reports', 'doctor-last-run.json'), {
      status: 'pass',
    });

    await fsExtra.outputJson(path.join(projectPath, '.rapidkit', 'project.json'), {
      runtime: 'java',
      kit_name: 'springboot.standard',
    });
    await fsExtra.outputJson(
      path.join(projectPath, '.rapidkit', 'reports', 'doctor-last-run.json'),
      {
        status: 'pass',
      }
    );

    const outputPath = await createWorkspaceShareBundle(testDir);
    const bundle = await fsExtra.readJson(outputPath);

    expect(outputPath).toContain(path.join('.rapidkit', 'reports', 'share-bundle.json'));
    expect(bundle.workspace.name).toBe('team-ws');
    expect(bundle.workspace.profile).toBe('polyglot');
    expect(bundle.summary.project_count).toBe(1);
    expect(bundle.projects[0].name).toBe('orders-service');
    expect(bundle.projects[0].relative_path).toBe('orders-service');
    expect(bundle.projects[0].runtime).toBe('java');
    expect(bundle.projects[0].kit_name).toBe('springboot.standard');
    expect(bundle.projects[0].doctor_report).toBeTruthy();
    expect(bundle.workspace.absolute_root).toBeUndefined();
    expect(bundle.projects[0].absolute_path).toBeUndefined();
  });

  it('supports includePaths and no-doctor modes', async () => {
    const projectPath = path.join(testDir, 'billing-service');

    await fsExtra.outputJson(path.join(projectPath, '.rapidkit', 'project.json'), {
      runtime: 'node',
      kit_name: 'nestjs.standard',
    });

    const outputPath = await createWorkspaceShareBundle(testDir, {
      includePaths: true,
      includeDoctorEvidence: false,
      outputPath: path.join(testDir, 'custom-share.json'),
    });

    const bundle = await fsExtra.readJson(outputPath);

    expect(outputPath).toBe(path.join(testDir, 'custom-share.json'));
    expect(bundle.workspace.absolute_root).toBe(path.resolve(testDir));
    expect(bundle.projects[0].absolute_path).toBe(path.resolve(projectPath));
    expect(bundle.summary.doctor_evidence_included).toBe(false);
    expect(bundle.projects[0].doctor_report).toBeUndefined();
  });
});
