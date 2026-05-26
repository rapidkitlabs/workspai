import os from 'os';
import path from 'path';

import fsExtra from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  archiveWorkspaceProject,
  createWorkspaceSnapshot,
  deleteWorkspaceProject,
  inspectWorkspaceSnapshot,
  listArchivedProjects,
  listWorkspaceSnapshots,
  restoreArchivedProject,
  restoreWorkspaceSnapshot,
} from '../workspace-snapshot.js';

describe('workspace-snapshot lifecycle', () => {
  let workspacePath: string;

  beforeEach(async () => {
    workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rapidkit-snapshot-ws-'));
    await fsExtra.writeFile(path.join(workspacePath, '.rapidkit-workspace'), '{}');
    await fsExtra.outputJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'snapshot-workspace',
      profile: 'polyglot',
    });
    await fsExtra.outputJson(path.join(workspacePath, 'orders', '.rapidkit', 'project.json'), {
      runtime: 'node',
      kit_name: 'nestjs.standard',
    });
    await fsExtra.writeFile(
      path.join(workspacePath, 'orders', 'package.json'),
      '{"name":"orders"}'
    );
  });

  afterEach(async () => {
    if (workspacePath && (await fsExtra.pathExists(workspacePath))) {
      await fsExtra.remove(workspacePath);
    }
  });

  it('creates and lists metadata snapshots without copying project source files', async () => {
    const result = await createWorkspaceSnapshot({
      workspacePath,
      name: 'before-release',
      reason: 'release gate',
    });

    expect(result.manifest.name).toBe('before-release');
    expect(result.manifest.mode).toBe('metadata');
    expect(result.manifest.projects).toEqual([
      {
        name: 'orders',
        relativePath: 'orders',
      },
    ]);
    expect(
      await fsExtra.pathExists(
        path.join(result.snapshotPath, 'files', '.rapidkit', 'workspace.json')
      )
    ).toBe(true);
    expect(
      await fsExtra.pathExists(path.join(result.snapshotPath, 'files', 'orders', 'package.json'))
    ).toBe(false);

    const snapshots = await listWorkspaceSnapshots({ workspacePath });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].name).toBe('before-release');

    const inspected = await inspectWorkspaceSnapshot({ workspacePath, name: 'before-release' });
    expect(inspected.estimatedFileCount).toBeGreaterThan(0);
    expect(inspected.estimatedBytes).toBeGreaterThan(0);
  });

  it('restores metadata snapshots only with force and creates a safety snapshot', async () => {
    await createWorkspaceSnapshot({ workspacePath, name: 'clean-config' });
    await fsExtra.outputJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'broken-workspace',
    });

    await expect(restoreWorkspaceSnapshot({ workspacePath, name: 'clean-config' })).rejects.toThrow(
      /--force/
    );

    const dryRun = await restoreWorkspaceSnapshot({
      workspacePath,
      name: 'clean-config',
      dryRun: true,
    });
    expect(dryRun.dryRun).toBe(true);
    expect(dryRun.restoredPaths).toContain('.rapidkit');

    const restored = await restoreWorkspaceSnapshot({
      workspacePath,
      name: 'clean-config',
      force: true,
    });

    const workspaceJson = await fsExtra.readJson(
      path.join(workspacePath, '.rapidkit', 'workspace.json')
    );
    expect(workspaceJson.workspace_name).toBe('snapshot-workspace');
    expect(restored.safetySnapshotPath).toContain('pre-restore-clean-config');
  });

  it('archives projects with a safety snapshot and archive manifest', async () => {
    const result = await archiveWorkspaceProject({
      workspacePath,
      project: 'orders',
      reason: 'superseded by v2',
    });

    expect(result.action).toBe('archive');
    expect(result.dryRun).toBe(false);
    expect(await fsExtra.pathExists(path.join(workspacePath, 'orders'))).toBe(false);
    expect(result.archivePath).toBeTruthy();
    expect(result.manifestPath).toBeTruthy();
    expect(await fsExtra.pathExists(path.join(result.archivePath!, 'package.json'))).toBe(true);

    const manifest = await fsExtra.readJson(result.manifestPath!);
    expect(manifest.projectName).toBe('orders');
    expect(manifest.reason).toBe('superseded by v2');
    expect(result.safetySnapshotPath).toContain('pre-archive-orders');

    const archives = await listArchivedProjects({ workspacePath });
    expect(archives).toHaveLength(1);
    expect(archives[0].projectName).toBe('orders');
  });

  it('treats delete as archive by default and requires exact confirmation for permanent delete', async () => {
    const dryRun = await deleteWorkspaceProject({
      workspacePath,
      project: 'orders',
      dryRun: true,
    });
    expect(dryRun.action).toBe('archive');
    expect(await fsExtra.pathExists(path.join(workspacePath, 'orders'))).toBe(true);

    await expect(
      deleteWorkspaceProject({
        workspacePath,
        project: 'orders',
        permanent: true,
        confirm: 'wrong-name',
      })
    ).rejects.toThrow(/Permanent delete requires/);

    const deleted = await deleteWorkspaceProject({
      workspacePath,
      project: 'orders',
      permanent: true,
      confirm: 'orders',
    });

    expect(deleted.action).toBe('delete');
    expect(await fsExtra.pathExists(path.join(workspacePath, 'orders'))).toBe(false);
    expect(deleted.safetySnapshotPath).toContain('pre-delete-orders');
  });

  it('restores archived projects and writes audit events', async () => {
    const archived = await archiveWorkspaceProject({
      workspacePath,
      project: 'orders',
      reason: 'temporarily retired',
    });

    const restored = await restoreArchivedProject({
      workspacePath,
      archive: archived.archivePath!,
      reason: 'customer needs it again',
    });

    expect(restored.action).toBe('restore');
    expect(await fsExtra.pathExists(path.join(workspacePath, 'orders', 'package.json'))).toBe(true);
    expect(await fsExtra.pathExists(archived.archivePath!)).toBe(false);

    const auditLog = await fsExtra.readFile(
      path.join(workspacePath, '.rapidkit', 'audit', 'events.jsonl'),
      'utf-8'
    );
    const events = auditLog
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { action: string; status: string; reason?: string });

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'project.archive',
          status: 'succeeded',
          reason: 'temporarily retired',
        }),
        expect.objectContaining({
          action: 'project.restore',
          status: 'succeeded',
          reason: 'customer needs it again',
        }),
      ])
    );
  });

  it('enforces workspace lifecycle policy for destructive operations', async () => {
    await fsExtra.outputFile(
      path.join(workspacePath, '.rapidkit', 'policies.yml'),
      [
        'require_reason_for_destructive_ops: true',
        'require_safety_snapshot_for_destructive_ops: true',
        'allow_permanent_delete: false',
        '',
      ].join('\n')
    );

    await expect(
      archiveWorkspaceProject({
        workspacePath,
        project: 'orders',
      })
    ).rejects.toThrow(/requires --reason/);

    await expect(
      deleteWorkspaceProject({
        workspacePath,
        project: 'orders',
        reason: 'cleanup',
        permanent: true,
        confirm: 'orders',
      })
    ).rejects.toThrow(/disabled by workspace policy/);

    const archived = await archiveWorkspaceProject({
      workspacePath,
      project: 'orders',
      reason: 'policy compliant archive',
    });

    expect(archived.action).toBe('archive');
  });
});
