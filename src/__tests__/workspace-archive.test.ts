import fsExtra from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  exportWorkspaceArchive,
  doctorWorkspaceArchive,
  hydrateWorkspaceArchive,
  inspectWorkspaceArchive,
  isSafeArchiveEntryName,
  sanitizeWorkspaceArchiveName,
  shouldExcludeWorkspaceArchivePath,
  verifyWorkspaceArchive,
  WORKSPACE_ARCHIVE_MANIFEST_PATH,
} from '../utils/workspace-archive.js';

describe('workspace archive export/hydrate', () => {
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

  it('uses stable archive names, safety checks, and exclusion rules', () => {
    expect(sanitizeWorkspaceArchiveName('Team Workspace.rapidkit-archive.zip')).toBe(
      'team-workspace'
    );
    expect(isSafeArchiveEntryName('api/src/main.ts')).toBe(true);
    expect(isSafeArchiveEntryName('../escape.txt')).toBe(false);
    expect(isSafeArchiveEntryName('/tmp/escape.txt')).toBe(false);
    expect(isSafeArchiveEntryName('C:/Users/Public/escape.txt')).toBe(false);

    expect(shouldExcludeWorkspaceArchivePath('api/node_modules/pkg/index.js')).toBe(true);
    expect(shouldExcludeWorkspaceArchivePath('api/.venv/bin/python')).toBe(true);
    expect(shouldExcludeWorkspaceArchivePath('api/.env')).toBe(true);
    expect(shouldExcludeWorkspaceArchivePath('api/.env.example')).toBe(false);
    expect(shouldExcludeWorkspaceArchivePath('api/src/main.py')).toBe(false);
  });

  it('exports and hydrates a portable archive without dependency or secret files', async () => {
    const workspacePath = await makeTempDir('rk-workspace-export-src-');
    const outputRoot = await makeTempDir('rk-workspace-export-out-');
    const archivePath = path.join(outputRoot, 'team.rapidkit-archive.zip');
    const hydratePath = path.join(outputRoot, 'hydrated');

    await fsExtra.writeJson(path.join(workspacePath, '.rapidkit-workspace'), {
      signature: 'RAPIDKIT_WORKSPACE',
      name: 'team-ws',
    });
    await fsExtra.outputJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'team-ws',
      profile: 'enterprise',
    });
    await fsExtra.outputFile(path.join(workspacePath, 'api', 'src', 'main.ts'), 'export {};');
    await fsExtra.outputFile(path.join(workspacePath, 'api', '.env'), 'SECRET=1');
    await fsExtra.outputFile(path.join(workspacePath, 'api', '.env.example'), 'SECRET=');
    await fsExtra.outputFile(
      path.join(workspacePath, 'api', 'node_modules', 'pkg', 'index.js'),
      ''
    );

    const exported = await exportWorkspaceArchive({
      workspacePath,
      outputPath: archivePath,
      now: new Date('2026-06-02T12:00:00.000Z'),
    });

    expect(await fsExtra.pathExists(archivePath)).toBe(true);
    expect(exported.manifest.kind).toBe('workspai.workspace.archive');
    expect(exported.manifest.files.map((file) => file.path)).toContain('api/src/main.ts');
    expect(exported.manifest.files.map((file) => file.path)).toContain('api/.env.example');
    expect(exported.manifest.files.map((file) => file.path)).not.toContain('api/.env');
    expect(exported.manifest.files.map((file) => file.path)).not.toContain(
      'api/node_modules/pkg/index.js'
    );

    const preview = await hydrateWorkspaceArchive({
      archivePathOrUrl: archivePath,
      outputPath: hydratePath,
      dryRun: true,
    });
    expect(preview.dryRun).toBe(true);
    expect(preview.files.map((file) => file.path)).toContain('api/src/main.ts');
    expect(await fsExtra.pathExists(hydratePath)).toBe(false);

    const hydrated = await hydrateWorkspaceArchive({
      archivePathOrUrl: archivePath,
      outputPath: hydratePath,
    });

    expect(hydrated.manifest?.workspaceName).toBe('team-ws');
    expect(await fsExtra.pathExists(path.join(hydratePath, '.rapidkit-workspace'))).toBe(true);
    expect(await fsExtra.pathExists(path.join(hydratePath, 'api', 'src', 'main.ts'))).toBe(true);
    expect(await fsExtra.pathExists(path.join(hydratePath, 'api', '.env'))).toBe(false);
  });

  it('inspects and verifies archive manifests with file checksums', async () => {
    const workspacePath = await makeTempDir('rk-workspace-verify-src-');
    const outputRoot = await makeTempDir('rk-workspace-verify-out-');
    const archivePath = path.join(outputRoot, 'team.rapidkit-archive.zip');

    await fsExtra.writeJson(path.join(workspacePath, '.rapidkit-workspace'), {
      signature: 'RAPIDKIT_WORKSPACE',
      name: 'verify-ws',
    });
    await fsExtra.outputJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'verify-ws',
    });
    await fsExtra.outputFile(path.join(workspacePath, 'api', 'src', 'main.ts'), 'export {};');

    await exportWorkspaceArchive({
      workspacePath,
      outputPath: archivePath,
      now: new Date('2026-06-02T12:00:00.000Z'),
    });

    const inspected = await inspectWorkspaceArchive({ archivePathOrUrl: archivePath });
    expect(inspected.manifest.workspaceName).toBe('verify-ws');
    expect(inspected.entries.every((entry) => entry.hasChecksum)).toBe(true);

    const verified = await verifyWorkspaceArchive({
      archivePathOrUrl: archivePath,
      requireChecksums: true,
    });
    expect(verified.status).toBe('passed');
    expect(verified.verifiedFiles).toBe(verified.fileCount);

    const doctor = await doctorWorkspaceArchive({ archivePathOrUrl: archivePath, strict: true });
    expect(doctor.status).toBe('passed');
    expect(doctor.checks.map((check) => check.id)).toEqual([
      'manifest-present',
      'integrity',
      'secrets-policy',
    ]);
  });

  it('rejects tampered archive payloads before hydrate writes files', async () => {
    const workspacePath = await makeTempDir('rk-workspace-tamper-src-');
    const outputRoot = await makeTempDir('rk-workspace-tamper-out-');
    const archivePath = path.join(outputRoot, 'team.rapidkit-archive.zip');
    const hydratePath = path.join(outputRoot, 'hydrated');

    await fsExtra.writeJson(path.join(workspacePath, '.rapidkit-workspace'), {
      signature: 'RAPIDKIT_WORKSPACE',
      name: 'tamper-ws',
    });
    await fsExtra.outputFile(path.join(workspacePath, 'api', 'src', 'main.ts'), 'export {};');

    await exportWorkspaceArchive({ workspacePath, outputPath: archivePath });
    const archiveBuffer = await fsExtra.readFile(archivePath);
    const original = Buffer.from('export {};', 'utf-8');
    const replacement = Buffer.from('import {};', 'utf-8');
    const offset = archiveBuffer.indexOf(original);
    expect(offset).toBeGreaterThan(-1);
    replacement.copy(archiveBuffer, offset);
    await fsExtra.writeFile(archivePath, archiveBuffer);

    const verified = await verifyWorkspaceArchive({ archivePathOrUrl: archivePath });
    expect(verified.status).toBe('failed');
    expect(verified.mismatches.map((mismatch) => mismatch.path)).toContain('api/src/main.ts');

    await expect(
      hydrateWorkspaceArchive({ archivePathOrUrl: archivePath, outputPath: hydratePath })
    ).rejects.toThrow('verification failed');
    expect(await fsExtra.pathExists(hydratePath)).toBe(false);
  });

  it('keeps the archive manifest at the Workspai-compatible path', async () => {
    const workspacePath = await makeTempDir('rk-workspace-export-manifest-');
    const outputRoot = await makeTempDir('rk-workspace-export-manifest-out-');
    const archivePath = path.join(outputRoot, 'team.rapidkit-archive.zip');

    await fsExtra.writeJson(path.join(workspacePath, '.rapidkit-workspace'), {
      signature: 'RAPIDKIT_WORKSPACE',
      name: 'manifest-ws',
    });

    await exportWorkspaceArchive({ workspacePath, outputPath: archivePath });
    const preview = await hydrateWorkspaceArchive({
      archivePathOrUrl: archivePath,
      outputPath: path.join(outputRoot, 'preview'),
      dryRun: true,
    });

    expect(preview.files.some((file) => file.path === WORKSPACE_ARCHIVE_MANIFEST_PATH)).toBe(false);
    expect(preview.manifest?.kind).toBe('workspai.workspace.archive');
  });
});
