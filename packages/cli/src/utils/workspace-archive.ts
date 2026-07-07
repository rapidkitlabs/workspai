import crypto from 'crypto';
import os from 'os';
import path from 'path';
import zlib from 'zlib';

import fsExtra from 'fs-extra';

import {
  hasWorkspaceRootMarkers,
  toWorkspaiArtifactPath,
  workspaceMetadataCandidates,
  workspaceMetadataPath,
} from './workspace-paths.js';

export const WORKSPACE_ARCHIVE_MANIFEST_PATH = '.workspai/archive-manifest.json';
const LEGACY_WORKSPACE_ARCHIVE_MANIFEST_PATH = '.rapidkit/archive-manifest.json';
export const WORKSPACE_ARCHIVE_KIND = 'workspai.workspace.archive';

export interface WorkspaceArchiveManifest {
  version: 1;
  kind: typeof WORKSPACE_ARCHIVE_KIND;
  workspaceName: string;
  exportedAt: string;
  exportedBy?: 'workspai' | 'workspai-vscode';
  archiveFormat?: 'zip-store' | 'zip-deflate';
  security: {
    envFilesIncluded: boolean;
    excludedByDefault: string[];
  };
  files: Array<{
    path: string;
    size: number;
    sha256: string;
  }>;
}

export interface WorkspaceArchiveExportOptions {
  workspacePath: string;
  outputPath?: string;
  includeEnv?: boolean;
  now?: Date;
}

export interface WorkspaceArchiveExportResult {
  archivePath: string;
  manifest: WorkspaceArchiveManifest;
  bytesWritten: number;
}

export type WorkspaceArchiveVerificationStatus = 'passed' | 'warning' | 'failed';

export interface WorkspaceArchiveVerificationResult {
  archivePath: string;
  manifest: WorkspaceArchiveManifest;
  status: WorkspaceArchiveVerificationStatus;
  fileCount: number;
  totalBytes: number;
  verifiedFiles: number;
  missingChecksumFiles: string[];
  missingArchiveEntries: string[];
  extraArchiveEntries: string[];
  mismatches: Array<{
    path: string;
    expected: { size?: number; sha256?: string };
    actual: { size: number; sha256: string };
  }>;
}

export interface WorkspaceArchiveInspectResult {
  archivePath: string;
  manifest: WorkspaceArchiveManifest;
  fileCount: number;
  totalBytes: number;
  entries: Array<{ path: string; size: number; hasChecksum: boolean }>;
}

export interface WorkspaceArchiveDoctorResult {
  archivePath: string;
  status: WorkspaceArchiveVerificationStatus;
  workspaceName: string;
  fileCount: number;
  totalBytes: number;
  checks: Array<{ id: string; status: WorkspaceArchiveVerificationStatus; message: string }>;
  recommendedActions: string[];
}

export interface WorkspaceArchiveHydrateOptions {
  archivePathOrUrl: string;
  outputPath?: string;
  force?: boolean;
  dryRun?: boolean;
  strict?: boolean;
}

export interface WorkspaceArchiveHydrateResult {
  archivePath: string;
  outputPath: string;
  dryRun: boolean;
  manifest: WorkspaceArchiveManifest | null;
  files: Array<{ path: string; size: number }>;
}

type ZipEntry = {
  name: string;
  data: Buffer;
  crc32: number;
  size: number;
  offset: number;
};

const EXCLUDED_SEGMENTS = new Set([
  '__pycache__',
  '.venv',
  'venv',
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  'htmlcov',
  '.next',
  '.turbo',
  '.cache',
]);

const EXCLUDED_BASENAMES = new Set([
  '.DS_Store',
  'Thumbs.db',
  '.coverage',
  'npm-debug.log',
  'yarn-error.log',
  'pnpm-debug.log',
]);

const SECRET_BASENAME_PATTERNS = [
  /^\.env$/i,
  /^\.env\.(?!example$|sample$|template$).+/i,
  /^.*\.pem$/i,
  /^.*\.key$/i,
  /^id_rsa$/i,
  /^id_ed25519$/i,
];

function toArchivePath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/');
}

export function sanitizeWorkspaceArchiveName(rawName: string): string {
  const stripped = rawName
    .replace(/\.workspai-archive\.zip$/i, '')
    .replace(/\.rapidkit-archive\.zip$/i, '')
    .replace(/\.zip$/i, '')
    .trim();
  const normalized = stripped
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 64);
  return normalized || 'imported-workspace';
}

export function isSafeArchiveEntryName(entryName: string): boolean {
  const normalized = toArchivePath(entryName).trim();
  if (!normalized || normalized.startsWith('/') || normalized.startsWith('~')) {
    return false;
  }
  if (/^[a-zA-Z]:\//.test(normalized) || normalized.includes('\0')) {
    return false;
  }
  const segments = normalized.split('/').filter(Boolean);
  return segments.length > 0 && !segments.some((segment) => segment === '..' || segment === '.');
}

function assertSafeEntryName(entryName: string): void {
  if (!isSafeArchiveEntryName(entryName)) {
    throw new Error(`Archive contains an unsafe path: ${entryName}`);
  }
}

function isPathInsideDirectory(candidatePath: string, directoryPath: string): boolean {
  const relativePath = path.relative(directoryPath, candidatePath);
  return (
    relativePath === '' ||
    (Boolean(relativePath) && !relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

export function shouldExcludeWorkspaceArchivePath(
  relativePath: string,
  options?: { includeEnv?: boolean }
): boolean {
  const normalized = toArchivePath(relativePath);
  const segments = normalized.split('/').filter(Boolean);
  if (
    (segments[0] === '.workspai' || segments[0] === '.rapidkit') &&
    ['cache', 'reports'].includes(segments[1] || '')
  ) {
    return true;
  }
  if (segments.some((segment) => EXCLUDED_SEGMENTS.has(segment))) {
    return true;
  }

  const basename = segments[segments.length - 1] || '';
  if (EXCLUDED_BASENAMES.has(basename)) {
    return true;
  }
  if (!options?.includeEnv && SECRET_BASENAME_PATTERNS.some((pattern) => pattern.test(basename))) {
    return true;
  }

  return basename.endsWith('.pyc') || basename.endsWith('.log');
}

function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
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

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(date.getFullYear(), 1980);
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

async function walkWorkspaceFiles(
  workspacePath: string,
  currentPath: string,
  files: Array<{ relativePath: string; fullPath: string }>,
  options?: { includeEnv?: boolean }
): Promise<void> {
  const entries = await fsExtra.readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    const relativePath = toArchivePath(path.relative(workspacePath, fullPath));
    if (!relativePath || shouldExcludeWorkspaceArchivePath(relativePath, options)) {
      continue;
    }
    if (entry.isDirectory()) {
      await walkWorkspaceFiles(workspacePath, fullPath, files, options);
      continue;
    }
    if (entry.isFile()) {
      files.push({ relativePath, fullPath });
    }
  }
}

async function readWorkspaceName(workspacePath: string): Promise<string> {
  for (const workspaceJsonPath of workspaceMetadataCandidates(workspacePath, 'workspace.json')) {
    try {
      const payload = (await fsExtra.readJson(workspaceJsonPath)) as Record<string, unknown>;
      if (typeof payload.workspace_name === 'string' && payload.workspace_name.trim()) {
        return payload.workspace_name.trim();
      }
      if (typeof payload.name === 'string' && payload.name.trim()) {
        return payload.name.trim();
      }
    } catch {
      // try the next metadata generation
    }
  }
  return path.basename(path.resolve(workspacePath));
}

async function buildArchiveEntries(
  workspacePath: string,
  manifest: WorkspaceArchiveManifest,
  options?: { includeEnv?: boolean }
): Promise<ZipEntry[]> {
  const candidates: Array<{ relativePath: string; fullPath: string }> = [];
  await walkWorkspaceFiles(workspacePath, workspacePath, candidates, options);

  const entries: ZipEntry[] = [];
  for (const candidate of candidates.sort((a, b) => a.relativePath.localeCompare(b.relativePath))) {
    const data = await fsExtra.readFile(candidate.fullPath);
    if (data.length >= 0xffffffff) {
      throw new Error(
        `File is too large for portable workspace archive: ${candidate.relativePath}`
      );
    }
    manifest.files.push({
      path: candidate.relativePath,
      size: data.length,
      sha256: sha256(data),
    });
    entries.push({
      name: candidate.relativePath,
      data,
      crc32: crc32(data),
      size: data.length,
      offset: 0,
    });
  }

  const manifestData = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
  entries.push({
    name: WORKSPACE_ARCHIVE_MANIFEST_PATH,
    data: manifestData,
    crc32: crc32(manifestData),
    size: manifestData.length,
    offset: 0,
  });

  return entries;
}

function buildZip(entries: ZipEntry[], date = new Date()): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const stamp = dosDateTime(date);

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf-8');
    entry.offset = offset;
    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(stamp.time),
      uint16(stamp.date),
      uint32(entry.crc32),
      uint32(entry.size),
      uint32(entry.size),
      uint16(name.length),
      uint16(0),
      name,
    ]);
    localParts.push(localHeader, entry.data);
    offset += localHeader.length + entry.data.length;
  }

  const centralDirectoryOffset = offset;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf-8');
    const centralHeader = Buffer.concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(stamp.time),
      uint16(stamp.date),
      uint32(entry.crc32),
      uint32(entry.size),
      uint32(entry.size),
      uint16(name.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(entry.offset),
      name,
    ]);
    centralParts.push(centralHeader);
    offset += centralHeader.length;
  }

  const centralDirectorySize = offset - centralDirectoryOffset;
  const endRecord = Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(entries.length),
    uint16(entries.length),
    uint32(centralDirectorySize),
    uint32(centralDirectoryOffset),
    uint16(0),
  ]);

  return Buffer.concat([...localParts, ...centralParts, endRecord]);
}

export async function exportWorkspaceArchive(
  options: WorkspaceArchiveExportOptions
): Promise<WorkspaceArchiveExportResult> {
  const workspacePath = path.resolve(options.workspacePath);
  if (!hasWorkspaceRootMarkers(workspacePath)) {
    throw new Error(
      'Workspace export requires a Workspai workspace root with .workspai-workspace or a legacy .rapidkit-workspace marker.'
    );
  }

  const workspaceName = await readWorkspaceName(workspacePath);
  const archivePath = path.resolve(
    options.outputPath || `${sanitizeWorkspaceArchiveName(workspaceName)}.workspai-archive.zip`
  );
  const manifest: WorkspaceArchiveManifest = {
    version: 1,
    kind: WORKSPACE_ARCHIVE_KIND,
    workspaceName,
    exportedAt: (options.now ?? new Date()).toISOString(),
    exportedBy: 'workspai',
    archiveFormat: 'zip-store',
    security: {
      envFilesIncluded: options.includeEnv === true,
      excludedByDefault: [
        '.git',
        'node_modules',
        '.venv',
        'dist',
        'build',
        'target',
        '.env',
        '*.pem',
        '*.key',
        '*.log',
      ],
    },
    files: [],
  };
  const entries = await buildArchiveEntries(workspacePath, manifest, {
    includeEnv: options.includeEnv === true,
  });
  const archive = buildZip(entries, options.now ?? new Date());
  await fsExtra.ensureDir(path.dirname(archivePath));
  await fsExtra.writeFile(archivePath, archive);
  return { archivePath, manifest, bytesWritten: archive.length };
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error('Invalid ZIP archive: end of central directory not found.');
}

function parseZipEntries(buffer: Buffer): Array<{ name: string; data: Buffer; size: number }> {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const entries: Array<{ name: string; data: Buffer; size: number }> = [];
  let cursor = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('Invalid ZIP archive: central directory is corrupted.');
    }
    const method = buffer.readUInt16LE(cursor + 10);
    if (method !== 0 && method !== 8) {
      throw new Error(
        'Unsupported ZIP archive: only stored/deflated entries are supported by Workspai.'
      );
    }
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf-8');
    assertSafeEntryName(name);
    const isDirectoryEntry = name.endsWith('/');

    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Invalid ZIP archive: local header missing for ${name}.`);
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressedData = buffer.subarray(dataOffset, dataOffset + compressedSize);
    if (compressedData.length !== compressedSize) {
      throw new Error(`Invalid ZIP archive: size mismatch for ${name}.`);
    }
    if (isDirectoryEntry) {
      if (compressedSize !== 0 || uncompressedSize !== 0) {
        throw new Error(`Invalid ZIP archive: directory entry contains data for ${name}.`);
      }
      cursor += 46 + nameLength + extraLength + commentLength;
      continue;
    }
    const data = method === 8 ? zlib.inflateRawSync(compressedData) : compressedData;
    if (data.length !== uncompressedSize) {
      throw new Error(`Invalid ZIP archive: inflated size mismatch for ${name}.`);
    }
    entries.push({ name, data, size: uncompressedSize });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function resolveArchivePath(
  input: string
): Promise<{ archivePath: string; cleanup?: string }> {
  if (/^https?:\/\//i.test(input)) {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Failed to download workspace archive: HTTP ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const tempDir = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'workspai-workspace-archive-'));
    const archivePath = path.join(tempDir, 'workspace.workspai-archive.zip');
    await fsExtra.writeFile(archivePath, bytes);
    return { archivePath, cleanup: tempDir };
  }
  return { archivePath: path.resolve(input) };
}

function parseManifest(
  entries: Array<{ name: string; data: Buffer }>
): WorkspaceArchiveManifest | null {
  const manifestEntry = entries.find(
    (entry) =>
      entry.name === WORKSPACE_ARCHIVE_MANIFEST_PATH ||
      entry.name === LEGACY_WORKSPACE_ARCHIVE_MANIFEST_PATH
  );
  if (!manifestEntry) return null;
  const parsed = JSON.parse(manifestEntry.data.toString('utf-8')) as WorkspaceArchiveManifest;
  if (parsed.kind !== WORKSPACE_ARCHIVE_KIND) {
    throw new Error('Archive manifest kind is not a RapidKit/Workspai workspace archive.');
  }
  return parsed;
}

function canonicalHydrateEntryName(entryName: string): string {
  return toWorkspaiArtifactPath(toArchivePath(entryName));
}

function getHydratableArchiveEntries(
  entries: Array<{ name: string; data: Buffer; size: number }>
): Array<{ sourceName: string; targetName: string; data: Buffer; size: number }> {
  const byTarget = new Map<
    string,
    { sourceName: string; targetName: string; data: Buffer; size: number }
  >();

  for (const entry of entries) {
    if (
      entry.name === WORKSPACE_ARCHIVE_MANIFEST_PATH ||
      entry.name === LEGACY_WORKSPACE_ARCHIVE_MANIFEST_PATH
    ) {
      continue;
    }

    const targetName = canonicalHydrateEntryName(entry.name);
    const existing = byTarget.get(targetName);
    if (!existing) {
      byTarget.set(targetName, {
        sourceName: entry.name,
        targetName,
        data: entry.data,
        size: entry.size,
      });
      continue;
    }

    const currentIsCanonical = entry.name === targetName;
    const existingIsCanonical = existing.sourceName === existing.targetName;
    if (currentIsCanonical && !existingIsCanonical) {
      byTarget.set(targetName, {
        sourceName: entry.name,
        targetName,
        data: entry.data,
        size: entry.size,
      });
      continue;
    }
    if (existing.data.equals(entry.data)) {
      continue;
    }
    if (existingIsCanonical) {
      continue;
    }

    throw new Error(
      `Workspace archive contains conflicting entries for ${targetName}: ${existing.sourceName}, ${entry.name}`
    );
  }

  return [...byTarget.values()].sort((a, b) => a.targetName.localeCompare(b.targetName));
}

async function loadWorkspaceArchive(input: string): Promise<{
  archivePath: string;
  entries: Array<{ name: string; data: Buffer; size: number }>;
  manifest: WorkspaceArchiveManifest;
  cleanup?: string;
}> {
  const resolved = await resolveArchivePath(input);
  try {
    const archiveBuffer = await fsExtra.readFile(resolved.archivePath);
    const entries = parseZipEntries(archiveBuffer);
    const manifest = parseManifest(entries);
    if (!manifest) {
      throw new Error(
        `Workspace archive is missing ${workspaceMetadataPath('', 'archive-manifest.json').replace(/^\//, '')}.`
      );
    }
    return { archivePath: resolved.archivePath, entries, manifest, cleanup: resolved.cleanup };
  } catch (error) {
    if (resolved.cleanup) {
      await fsExtra.remove(resolved.cleanup).catch(() => undefined);
    }
    throw error;
  }
}

async function cleanupLoadedArchive(loaded: { cleanup?: string }): Promise<void> {
  if (loaded.cleanup) {
    await fsExtra.remove(loaded.cleanup).catch(() => undefined);
  }
}

export async function inspectWorkspaceArchive(options: {
  archivePathOrUrl: string;
}): Promise<WorkspaceArchiveInspectResult> {
  const loaded = await loadWorkspaceArchive(options.archivePathOrUrl);
  try {
    const entriesByName = new Map(
      loaded.entries
        .filter(
          (entry) =>
            entry.name !== WORKSPACE_ARCHIVE_MANIFEST_PATH &&
            entry.name !== LEGACY_WORKSPACE_ARCHIVE_MANIFEST_PATH
        )
        .map((entry) => [entry.name, entry])
    );
    const entries = loaded.manifest.files.map((file) => ({
      path: file.path,
      size: entriesByName.get(file.path)?.size ?? file.size,
      hasChecksum: typeof file.sha256 === 'string' && file.sha256.length > 0,
    }));

    return {
      archivePath: loaded.archivePath,
      manifest: loaded.manifest,
      fileCount: entries.length,
      totalBytes: entries.reduce((total, entry) => total + entry.size, 0),
      entries,
    };
  } finally {
    await cleanupLoadedArchive(loaded);
  }
}

export async function verifyWorkspaceArchive(options: {
  archivePathOrUrl: string;
  requireChecksums?: boolean;
}): Promise<WorkspaceArchiveVerificationResult> {
  const loaded = await loadWorkspaceArchive(options.archivePathOrUrl);
  try {
    const entriesByName = new Map(
      loaded.entries
        .filter(
          (entry) =>
            entry.name !== WORKSPACE_ARCHIVE_MANIFEST_PATH &&
            entry.name !== LEGACY_WORKSPACE_ARCHIVE_MANIFEST_PATH
        )
        .map((entry) => [entry.name, entry])
    );
    const manifestPaths = new Set(loaded.manifest.files.map((file) => file.path));
    const extraArchiveEntries = [...entriesByName.keys()]
      .filter((entryName) => !manifestPaths.has(entryName))
      .sort();
    const missingArchiveEntries: string[] = [];
    const missingChecksumFiles: string[] = [];
    const mismatches: WorkspaceArchiveVerificationResult['mismatches'] = [];
    let verifiedFiles = 0;

    for (const file of loaded.manifest.files) {
      assertSafeEntryName(file.path);
      const entry = entriesByName.get(file.path);
      if (!entry) {
        missingArchiveEntries.push(file.path);
        continue;
      }

      const actual = { size: entry.size, sha256: sha256(entry.data) };
      if (entry.size !== file.size) {
        mismatches.push({
          path: file.path,
          expected: { size: file.size, sha256: file.sha256 },
          actual,
        });
        continue;
      }
      if (!file.sha256) {
        missingChecksumFiles.push(file.path);
        continue;
      }
      if (actual.sha256 !== file.sha256) {
        mismatches.push({
          path: file.path,
          expected: { size: file.size, sha256: file.sha256 },
          actual,
        });
        continue;
      }
      verifiedFiles += 1;
    }

    const checksumRequiredFailure =
      options.requireChecksums === true && missingChecksumFiles.length > 0;
    const failed =
      missingArchiveEntries.length > 0 ||
      mismatches.length > 0 ||
      checksumRequiredFailure ||
      extraArchiveEntries.length > 0;
    const warning = missingChecksumFiles.length > 0;

    return {
      archivePath: loaded.archivePath,
      manifest: loaded.manifest,
      status: failed ? 'failed' : warning ? 'warning' : 'passed',
      fileCount: loaded.manifest.files.length,
      totalBytes: loaded.manifest.files.reduce((total, file) => total + file.size, 0),
      verifiedFiles,
      missingChecksumFiles,
      missingArchiveEntries,
      extraArchiveEntries,
      mismatches,
    };
  } finally {
    await cleanupLoadedArchive(loaded);
  }
}

export async function doctorWorkspaceArchive(options: {
  archivePathOrUrl: string;
  strict?: boolean;
}): Promise<WorkspaceArchiveDoctorResult> {
  const inspected = await inspectWorkspaceArchive({ archivePathOrUrl: options.archivePathOrUrl });
  const verification = await verifyWorkspaceArchive({
    archivePathOrUrl: options.archivePathOrUrl,
    requireChecksums: options.strict === true,
  });
  const checks: WorkspaceArchiveDoctorResult['checks'] = [];
  const recommendedActions: string[] = [];

  checks.push({
    id: 'manifest-present',
    status: 'passed',
    message: `Archive manifest found for workspace "${inspected.manifest.workspaceName}".`,
  });
  checks.push({
    id: 'integrity',
    status: verification.status,
    message:
      verification.status === 'passed'
        ? `Verified ${verification.verifiedFiles}/${verification.fileCount} files.`
        : 'Archive integrity verification did not fully pass.',
  });

  const envIncluded = inspected.manifest.security?.envFilesIncluded === true;
  checks.push({
    id: 'secrets-policy',
    status: envIncluded ? 'warning' : 'passed',
    message: envIncluded
      ? 'Archive manifest says environment/private files were intentionally included.'
      : 'Archive manifest excludes environment/private files by default.',
  });
  if (envIncluded) {
    recommendedActions.push('Share this archive only through trusted internal channels.');
  }

  if (verification.missingChecksumFiles.length > 0) {
    recommendedActions.push('Re-export the archive with the latest RapidKit/Workspai tooling.');
  }
  if (verification.mismatches.length > 0) {
    recommendedActions.push('Reject this archive and request a fresh export from the owner.');
  }
  if (
    verification.extraArchiveEntries.length > 0 ||
    verification.missingArchiveEntries.length > 0
  ) {
    recommendedActions.push('Regenerate the archive so ZIP entries and manifest entries match.');
  }
  if (options.strict === true && verification.status !== 'passed') {
    recommendedActions.push('Do not hydrate this archive in strict or production workflows.');
  }

  const failed = checks.some((check) => check.status === 'failed');
  const warning = checks.some((check) => check.status === 'warning');
  return {
    archivePath: inspected.archivePath,
    status: failed ? 'failed' : warning ? 'warning' : 'passed',
    workspaceName: inspected.manifest.workspaceName,
    fileCount: inspected.fileCount,
    totalBytes: inspected.totalBytes,
    checks,
    recommendedActions,
  };
}

async function ensureOutputPath(
  outputPath: string,
  force: boolean,
  dryRun: boolean
): Promise<void> {
  if (!(await fsExtra.pathExists(outputPath))) {
    if (!dryRun) await fsExtra.ensureDir(outputPath);
    return;
  }
  const entries = await fsExtra.readdir(outputPath);
  if (entries.length > 0 && !force) {
    throw new Error(`Output directory is not empty: ${outputPath}. Use --force to overwrite.`);
  }
  if (!dryRun) {
    await fsExtra.emptyDir(outputPath);
  }
}

export async function hydrateWorkspaceArchive(
  options: WorkspaceArchiveHydrateOptions
): Promise<WorkspaceArchiveHydrateResult> {
  const loaded = await loadWorkspaceArchive(options.archivePathOrUrl);
  try {
    const verification = await verifyWorkspaceArchive({
      archivePathOrUrl: loaded.archivePath,
      requireChecksums: options.strict === true,
    });
    if (verification.status === 'failed') {
      const details = [
        verification.missingArchiveEntries.length
          ? `missing entries: ${verification.missingArchiveEntries.join(', ')}`
          : '',
        verification.extraArchiveEntries.length
          ? `unexpected entries: ${verification.extraArchiveEntries.join(', ')}`
          : '',
        verification.mismatches.length
          ? `checksum/size mismatches: ${verification.mismatches
              .map((mismatch) => mismatch.path)
              .join(', ')}`
          : '',
        verification.missingChecksumFiles.length && options.strict === true
          ? `missing checksums: ${verification.missingChecksumFiles.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('; ');
      throw new Error(`Workspace archive verification failed${details ? ` (${details})` : ''}.`);
    }
    if (verification.status === 'warning' && options.strict === true) {
      throw new Error(
        `Workspace archive verification requires checksums for every file: ${verification.missingChecksumFiles.join(
          ', '
        )}`
      );
    }

    const entries = getHydratableArchiveEntries(loaded.entries);
    const manifest = loaded.manifest;
    const outputPath = path.resolve(
      options.outputPath ||
        sanitizeWorkspaceArchiveName(manifest.workspaceName || 'imported-workspace')
    );
    await ensureOutputPath(outputPath, options.force === true, options.dryRun === true);

    for (const entry of entries) {
      const targetPath = path.resolve(outputPath, entry.targetName);
      if (!isPathInsideDirectory(targetPath, outputPath)) {
        throw new Error(`Archive entry escapes output directory: ${entry.targetName}`);
      }
      if (!options.dryRun) {
        await fsExtra.ensureDir(path.dirname(targetPath));
        await fsExtra.writeFile(targetPath, entry.data);
      }
    }

    return {
      archivePath: loaded.archivePath,
      outputPath,
      dryRun: options.dryRun === true,
      manifest,
      files: entries.map((entry) => ({ path: entry.targetName, size: entry.size })),
    };
  } finally {
    await cleanupLoadedArchive(loaded);
  }
}
