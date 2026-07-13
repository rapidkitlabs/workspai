import fsExtra from 'fs-extra';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
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

function uint16(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function uint32(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let c = index;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function buildDeflatedZipWithDirectory(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const zipEntries = [
    { name: 'api/', data: Buffer.alloc(0), method: 0, compressed: Buffer.alloc(0) },
    ...entries.map((entry) => ({
      ...entry,
      method: 8,
      compressed: zlib.deflateRawSync(entry.data),
    })),
  ];

  for (const entry of zipEntries) {
    const name = Buffer.from(entry.name, 'utf-8');
    const checksum = crc32(entry.data);
    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(entry.method),
      uint16(0),
      uint16(0),
      uint32(checksum),
      uint32(entry.compressed.length),
      uint32(entry.data.length),
      uint16(name.length),
      uint16(0),
      name,
    ]);
    centralParts.push(
      Buffer.concat([
        uint32(0x02014b50),
        uint16(20),
        uint16(20),
        uint16(0x0800),
        uint16(entry.method),
        uint16(0),
        uint16(0),
        uint32(checksum),
        uint32(entry.compressed.length),
        uint32(entry.data.length),
        uint16(name.length),
        uint16(0),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(0),
        uint32(offset),
        name,
      ])
    );
    localParts.push(localHeader, entry.compressed);
    offset += localHeader.length + entry.compressed.length;
  }

  const centralOffset = offset;
  const central = Buffer.concat(centralParts);
  const end = Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(zipEntries.length),
    uint16(zipEntries.length),
    uint32(central.length),
    uint32(centralOffset),
    uint16(0),
  ]);
  return Buffer.concat([...localParts, central, end]);
}

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
    expect(shouldExcludeWorkspaceArchivePath('.rapidkit/cache/go/mod/pkg/file.go')).toBe(true);
    expect(shouldExcludeWorkspaceArchivePath('.workspai/reports/workspace-run-last.json')).toBe(
      true
    );
    expect(shouldExcludeWorkspaceArchivePath('.rapidkit/workspace.json')).toBe(false);
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
      path.join(workspacePath, '.rapidkit', 'cache', 'go', 'mod', 'x.go'),
      ''
    );
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
      '.rapidkit/cache/go/mod/x.go'
    );
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
    expect(await fsExtra.pathExists(path.join(hydratePath, '.workspai-workspace'))).toBe(true);
    expect(await fsExtra.pathExists(path.join(hydratePath, '.workspai', 'workspace.json'))).toBe(
      true
    );
    expect(await fsExtra.pathExists(path.join(hydratePath, '.rapidkit-workspace'))).toBe(false);
    expect(await fsExtra.pathExists(path.join(hydratePath, '.rapidkit'))).toBe(false);
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

  it('writes ZIP64 archives and enforces only explicitly configured payload budgets', async () => {
    const workspacePath = await makeTempDir('rk-workspace-zip64-src-');
    const outputRoot = await makeTempDir('rk-workspace-zip64-out-');
    const archivePath = path.join(outputRoot, 'large-capable.workspai-archive.zip');

    await fsExtra.writeJson(path.join(workspacePath, '.workspai-workspace'), {
      signature: 'WORKSPAI_WORKSPACE',
      name: 'large-capable',
    });
    await fsExtra.outputFile(path.join(workspacePath, 'services', 'api', 'main.ts'), 'export {};');

    await exportWorkspaceArchive({ workspacePath, outputPath: archivePath });
    const archive = await fsExtra.readFile(archivePath);
    expect(archive.indexOf(uint32(0x06064b50))).toBeGreaterThan(-1);
    expect(archive.indexOf(uint32(0x07064b50))).toBeGreaterThan(-1);

    const unrestricted = await inspectWorkspaceArchive({ archivePathOrUrl: archivePath });
    expect(unrestricted.fileCount).toBeGreaterThan(0);

    await expect(
      inspectWorkspaceArchive({
        archivePathOrUrl: archivePath,
        safety: { maxExpandedBytes: 1 },
      })
    ).rejects.toThrow('payload exceeds configured limit');
  });

  it('hydrates deflated archives that contain directory entries from external ZIP tools', async () => {
    const outputRoot = await makeTempDir('rk-workspace-deflated-out-');
    const archivePath = path.join(outputRoot, 'external.rapidkit-archive.zip');
    const hydratePath = path.join(outputRoot, 'hydrated');
    const marker = Buffer.from('{"signature":"RAPIDKIT_WORKSPACE"}', 'utf-8');
    const main = Buffer.from('export {};', 'utf-8');
    const manifest = Buffer.from(
      `${JSON.stringify({
        version: 1,
        kind: 'workspai.workspace.archive',
        workspaceName: 'external-ws',
        exportedAt: '2026-06-02T00:00:00.000Z',
        exportedBy: 'workspai-vscode',
        archiveFormat: 'zip-deflate',
        security: {
          envFilesIncluded: false,
          excludedByDefault: ['.env'],
        },
        files: [
          { path: '.rapidkit-workspace', size: marker.length, sha256: sha256(marker) },
          { path: 'api/src/main.ts', size: main.length, sha256: sha256(main) },
        ],
      })}\n`,
      'utf-8'
    );

    await fsExtra.writeFile(
      archivePath,
      buildDeflatedZipWithDirectory([
        { name: '.rapidkit-workspace', data: marker },
        { name: 'api/src/main.ts', data: main },
        { name: WORKSPACE_ARCHIVE_MANIFEST_PATH, data: manifest },
      ])
    );

    const verified = await verifyWorkspaceArchive({
      archivePathOrUrl: archivePath,
      requireChecksums: true,
    });
    expect(verified.status).toBe('passed');

    const hydrated = await hydrateWorkspaceArchive({
      archivePathOrUrl: archivePath,
      outputPath: hydratePath,
      strict: true,
    });
    expect(hydrated.files.map((file) => file.path)).toEqual([
      '.workspai-workspace',
      'api/src/main.ts',
    ]);
    expect(await fsExtra.pathExists(path.join(hydratePath, '.workspai-workspace'))).toBe(true);
    expect(await fsExtra.pathExists(path.join(hydratePath, '.rapidkit-workspace'))).toBe(false);
    expect(await fsExtra.readFile(path.join(hydratePath, 'api', 'src', 'main.ts'), 'utf-8')).toBe(
      'export {};'
    );
  });
});
