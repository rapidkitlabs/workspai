import crypto from 'crypto';
import os from 'os';
import path from 'path';

import fsExtra from 'fs-extra';

import { removeImportedProjectsRegistryEntries } from './imported-projects-registry.js';
import { discoverWorkspaceProjects } from './utils/workspace-discovery.js';

export const WORKSPACE_SNAPSHOT_SCHEMA = 'rapidkit-workspace-snapshot-v1';
export const PROJECT_ARCHIVE_SCHEMA = 'rapidkit-project-archive-v1';

export type SnapshotMode = 'metadata' | 'full';

export interface WorkspaceSnapshotProject {
  name: string;
  relativePath: string;
}

export interface WorkspaceSnapshotManifest {
  schema: typeof WORKSPACE_SNAPSHOT_SCHEMA;
  name: string;
  mode: SnapshotMode;
  reason?: string;
  createdAt: string;
  workspaceName: string;
  workspacePath: string;
  copiedPaths: string[];
  projects: WorkspaceSnapshotProject[];
}

export interface CreateWorkspaceSnapshotOptions {
  workspacePath?: string;
  name?: string;
  reason?: string;
  includeProjects?: boolean;
}

export interface CreateWorkspaceSnapshotResult {
  manifest: WorkspaceSnapshotManifest;
  snapshotPath: string;
}

export interface InspectWorkspaceSnapshotOptions {
  workspacePath?: string;
  name: string;
}

export interface InspectWorkspaceSnapshotResult {
  manifest: WorkspaceSnapshotManifest;
  snapshotPath: string;
  filesRoot: string;
  estimatedFileCount: number;
  estimatedBytes: number;
}

export interface ListWorkspaceSnapshotsOptions {
  workspacePath?: string;
}

export interface RestoreWorkspaceSnapshotOptions {
  workspacePath?: string;
  name: string;
  reason?: string;
  force?: boolean;
  dryRun?: boolean;
  safetySnapshot?: boolean;
}

export interface RestoreWorkspaceSnapshotResult {
  workspacePath: string;
  snapshotPath: string;
  restoredPaths: string[];
  dryRun: boolean;
  safetySnapshotPath?: string;
}

export interface ProjectLifecycleOptions {
  workspacePath?: string;
  project: string;
  reason?: string;
  dryRun?: boolean;
}

export interface DeleteProjectOptions extends ProjectLifecycleOptions {
  permanent?: boolean;
  confirm?: string;
}

export interface RestoreArchivedProjectOptions {
  workspacePath?: string;
  archive: string;
  reason?: string;
  targetName?: string;
  force?: boolean;
  dryRun?: boolean;
}

export interface ListArchivedProjectsOptions {
  workspacePath?: string;
}

export interface ArchivedProjectEntry extends ProjectArchiveManifest {
  archivePath: string;
  manifestPath: string;
}

export interface ProjectArchiveManifest {
  schema: typeof PROJECT_ARCHIVE_SCHEMA;
  projectName: string;
  originalPath: string;
  archivedPath: string;
  reason?: string;
  archivedAt: string;
  safetySnapshotPath?: string;
}

export interface ProjectLifecycleResult {
  workspacePath: string;
  projectName: string;
  projectPath: string;
  dryRun: boolean;
  action: 'archive' | 'delete' | 'restore';
  archivePath?: string;
  manifestPath?: string;
  safetySnapshotPath?: string;
}

export interface WorkspaceAuditEvent {
  schema: 'rapidkit-workspace-audit-event-v1';
  id: string;
  timestamp: string;
  workspacePath: string;
  action:
    | 'snapshot.create'
    | 'snapshot.restore'
    | 'project.archive'
    | 'project.delete'
    | 'project.restore';
  target?: string;
  status: 'planned' | 'succeeded' | 'failed';
  reason?: string;
  details?: Record<string, unknown>;
}

interface LifecyclePolicy {
  requireReasonForDestructiveOps: boolean;
  requireSafetySnapshotForDestructiveOps: boolean;
  allowPermanentDelete: boolean;
}

const METADATA_PATHS = [
  '.rapidkit/workspace.json',
  '.rapidkit-workspace',
  'rapidkit.config.json',
  'rapidkit.config.js',
  'rapidkit.config.cjs',
  'rapidkit.config.mjs',
  'package.json',
];

const EXCLUDED_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  '.venv',
  'dist',
  'build',
  'target',
  'coverage',
  'htmlcov',
  '.next',
]);

const DEFAULT_LIFECYCLE_POLICY: LifecyclePolicy = {
  requireReasonForDestructiveOps: false,
  requireSafetySnapshotForDestructiveOps: true,
  allowPermanentDelete: true,
};

function timestampForPath(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function slugifySnapshotName(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug) {
    throw new Error('Snapshot name must contain at least one letter or number.');
  }

  return slug.slice(0, 120);
}

async function safeReadJson(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const payload: unknown = await fsExtra.readJson(filePath);
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parsePolicyBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (['true', 'yes', '1', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', 'no', '0', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

async function readLifecyclePolicy(workspacePath: string): Promise<LifecyclePolicy> {
  const policyPath = path.join(workspacePath, '.rapidkit', 'policies.yml');
  if (!(await fsExtra.pathExists(policyPath))) {
    return { ...DEFAULT_LIFECYCLE_POLICY };
  }

  try {
    const content = await fsExtra.readFile(policyPath, 'utf-8');
    const readRule = (key: string, fallback: boolean): boolean => {
      const match = content.match(new RegExp(`^\\s*${key}:\\s*([^#\\n]+)`, 'm'));
      return parsePolicyBoolean(match?.[1], fallback);
    };

    return {
      requireReasonForDestructiveOps: readRule(
        'require_reason_for_destructive_ops',
        DEFAULT_LIFECYCLE_POLICY.requireReasonForDestructiveOps
      ),
      requireSafetySnapshotForDestructiveOps: readRule(
        'require_safety_snapshot_for_destructive_ops',
        DEFAULT_LIFECYCLE_POLICY.requireSafetySnapshotForDestructiveOps
      ),
      allowPermanentDelete: readRule(
        'allow_permanent_delete',
        DEFAULT_LIFECYCLE_POLICY.allowPermanentDelete
      ),
    };
  } catch {
    return { ...DEFAULT_LIFECYCLE_POLICY };
  }
}

function auditLogPath(workspacePath: string): string {
  return path.join(workspacePath, '.rapidkit', 'audit', 'events.jsonl');
}

async function appendAuditEvent(
  workspacePath: string,
  event: Omit<WorkspaceAuditEvent, 'schema' | 'id' | 'timestamp' | 'workspacePath'>
): Promise<WorkspaceAuditEvent> {
  const payload: WorkspaceAuditEvent = {
    schema: 'rapidkit-workspace-audit-event-v1',
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    workspacePath,
    ...event,
  };

  const filePath = auditLogPath(workspacePath);
  await fsExtra.ensureDir(path.dirname(filePath));
  await fsExtra.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf-8');
  return payload;
}

async function enforceDestructivePolicy(
  workspacePath: string,
  action: WorkspaceAuditEvent['action'],
  options: { reason?: string; safetySnapshot?: boolean; permanent?: boolean }
): Promise<LifecyclePolicy> {
  const policy = await readLifecyclePolicy(workspacePath);

  if (policy.requireReasonForDestructiveOps && !options.reason?.trim()) {
    throw new Error(`${action} requires --reason by workspace policy.`);
  }

  if (policy.requireSafetySnapshotForDestructiveOps && options.safetySnapshot === false) {
    throw new Error(`${action} requires a safety snapshot by workspace policy.`);
  }

  if (options.permanent && !policy.allowPermanentDelete) {
    throw new Error('Permanent project delete is disabled by workspace policy.');
  }

  return policy;
}

export function findWorkspaceRoot(startPath = process.cwd()): string | null {
  let current = path.resolve(startPath);
  const tempRoot = path.resolve(os.tmpdir());

  while (true) {
    if (
      current !== tempRoot &&
      (fsExtra.existsSync(path.join(current, '.rapidkit-workspace')) ||
        fsExtra.existsSync(path.join(current, '.rapidkit', 'workspace.json')))
    ) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function requireWorkspaceRoot(workspacePath?: string): string {
  const resolved = workspacePath ? path.resolve(workspacePath) : findWorkspaceRoot(process.cwd());
  if (!resolved) {
    throw new Error(
      'Not inside a RapidKit workspace. Run from workspace root or pass --workspace.'
    );
  }
  if (
    !fsExtra.existsSync(path.join(resolved, '.rapidkit-workspace')) &&
    !fsExtra.existsSync(path.join(resolved, '.rapidkit', 'workspace.json'))
  ) {
    throw new Error(`Workspace path is not a RapidKit workspace: ${resolved}`);
  }
  return resolved;
}

async function getWorkspaceName(workspacePath: string): Promise<string> {
  const workspaceJson = await safeReadJson(path.join(workspacePath, '.rapidkit', 'workspace.json'));
  const rawName = workspaceJson?.workspace_name ?? workspaceJson?.name;
  return typeof rawName === 'string' && rawName.trim()
    ? rawName.trim()
    : path.basename(workspacePath);
}

function snapshotsRoot(workspacePath: string): string {
  return path.join(workspacePath, '.rapidkit', 'snapshots');
}

function archiveRoot(workspacePath: string): string {
  return path.join(workspacePath, '.rapidkit', 'archive', 'projects');
}

function snapshotFilesRoot(snapshotPath: string): string {
  return path.join(snapshotPath, 'files');
}

function createSnapshotStagingPath(name: string): string {
  return path.join(
    os.tmpdir(),
    `rapidkit-workspace-snapshot-${process.pid}-${name}-${crypto.randomBytes(4).toString('hex')}`
  );
}

function shouldCopyPath(workspacePath: string, sourcePath: string): boolean {
  const relativePath = path.relative(workspacePath, sourcePath);
  if (!relativePath) {
    return true;
  }

  const segments = relativePath.split(path.sep);
  if (
    segments[0] === '.rapidkit' &&
    ['snapshots', 'archive', 'audit'].includes(segments[1] || '')
  ) {
    return false;
  }

  return !segments.some((segment) => EXCLUDED_DIR_NAMES.has(segment));
}

async function collectProjects(workspacePath: string): Promise<WorkspaceSnapshotProject[]> {
  const projects = await discoverWorkspaceProjects(workspacePath, {
    descendIntoMatchedProjects: false,
  });

  return projects.map((projectPath) => ({
    name: path.basename(projectPath),
    relativePath: path.relative(workspacePath, projectPath),
  }));
}

async function copyMetadataPaths(workspacePath: string, filesRoot: string): Promise<string[]> {
  const copiedPaths: string[] = [];

  for (const relativePath of METADATA_PATHS) {
    const sourcePath = path.join(workspacePath, relativePath);
    if (!(await fsExtra.pathExists(sourcePath))) {
      continue;
    }

    const destinationPath = path.join(filesRoot, relativePath);
    await fsExtra.copy(sourcePath, destinationPath, {
      filter: (candidatePath) => shouldCopyPath(workspacePath, candidatePath),
    });
    copiedPaths.push(relativePath);
  }

  return copiedPaths;
}

async function writeSnapshotManifest(
  snapshotPath: string,
  manifest: WorkspaceSnapshotManifest
): Promise<void> {
  await fsExtra.writeJson(path.join(snapshotPath, 'snapshot.json'), manifest, { spaces: 2 });
}

async function readSnapshotManifest(snapshotPath: string): Promise<WorkspaceSnapshotManifest> {
  const manifestPath = path.join(snapshotPath, 'snapshot.json');
  const manifest: unknown = await fsExtra.readJson(manifestPath);
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    (manifest as WorkspaceSnapshotManifest).schema !== WORKSPACE_SNAPSHOT_SCHEMA
  ) {
    throw new Error(`Invalid RapidKit workspace snapshot manifest: ${manifestPath}`);
  }
  return manifest as WorkspaceSnapshotManifest;
}

async function collectDirectoryStats(rootPath: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  const queue = [rootPath];

  while (queue.length > 0) {
    const currentPath = queue.shift();
    if (!currentPath) {
      continue;
    }

    let entries: Array<{ isDirectory: () => boolean; isFile: () => boolean; name: string }> = [];
    try {
      entries = await fsExtra.readdir(currentPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      try {
        const stat = await fsExtra.stat(entryPath);
        files += 1;
        bytes += stat.size;
      } catch {
        // Ignore files that disappear while inspecting.
      }
    }
  }

  return { files, bytes };
}

export async function createWorkspaceSnapshot(
  options: CreateWorkspaceSnapshotOptions = {}
): Promise<CreateWorkspaceSnapshotResult> {
  const workspacePath = requireWorkspaceRoot(options.workspacePath);
  const baseName = options.name ? options.name : `snapshot-${timestampForPath()}`;
  const name = slugifySnapshotName(baseName);
  const snapshotPath = path.join(snapshotsRoot(workspacePath), name);
  const stagingPath = createSnapshotStagingPath(name);

  if (await fsExtra.pathExists(snapshotPath)) {
    throw new Error(`Snapshot already exists: ${name}`);
  }

  const filesRoot = snapshotFilesRoot(stagingPath);

  try {
    await fsExtra.ensureDir(filesRoot);

    const mode: SnapshotMode = options.includeProjects ? 'full' : 'metadata';
    const copiedPaths = mode === 'full' ? ['.'] : await copyMetadataPaths(workspacePath, filesRoot);

    if (mode === 'full') {
      await fsExtra.copy(workspacePath, filesRoot, {
        filter: (candidatePath) => shouldCopyPath(workspacePath, candidatePath),
      });
    }

    const manifest: WorkspaceSnapshotManifest = {
      schema: WORKSPACE_SNAPSHOT_SCHEMA,
      name,
      mode,
      reason: options.reason,
      createdAt: new Date().toISOString(),
      workspaceName: await getWorkspaceName(workspacePath),
      workspacePath,
      copiedPaths,
      projects: await collectProjects(workspacePath),
    };

    await writeSnapshotManifest(stagingPath, manifest);
    await fsExtra.ensureDir(path.dirname(snapshotPath));
    await fsExtra.move(stagingPath, snapshotPath, { overwrite: false });
    await appendAuditEvent(workspacePath, {
      action: 'snapshot.create',
      target: name,
      status: 'succeeded',
      reason: options.reason,
      details: {
        mode,
        copiedPaths,
        snapshotPath,
        projectCount: manifest.projects.length,
      },
    });
    return { manifest, snapshotPath };
  } catch (error) {
    await fsExtra.remove(stagingPath);
    await appendAuditEvent(workspacePath, {
      action: 'snapshot.create',
      target: name,
      status: 'failed',
      reason: options.reason,
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

export async function inspectWorkspaceSnapshot(
  options: InspectWorkspaceSnapshotOptions
): Promise<InspectWorkspaceSnapshotResult> {
  const workspacePath = requireWorkspaceRoot(options.workspacePath);
  const snapshotPath = path.join(snapshotsRoot(workspacePath), slugifySnapshotName(options.name));
  if (!(await fsExtra.pathExists(snapshotPath))) {
    throw new Error(`Snapshot not found: ${options.name}`);
  }

  const manifest = await readSnapshotManifest(snapshotPath);
  const filesRoot = snapshotFilesRoot(snapshotPath);
  const stats = await collectDirectoryStats(filesRoot);

  return {
    manifest,
    snapshotPath,
    filesRoot,
    estimatedFileCount: stats.files,
    estimatedBytes: stats.bytes,
  };
}

export async function listWorkspaceSnapshots(
  options: ListWorkspaceSnapshotsOptions = {}
): Promise<Array<WorkspaceSnapshotManifest & { snapshotPath: string }>> {
  const workspacePath = requireWorkspaceRoot(options.workspacePath);
  const root = snapshotsRoot(workspacePath);
  if (!(await fsExtra.pathExists(root))) {
    return [];
  }

  const entries = await fsExtra.readdir(root, { withFileTypes: true });
  const snapshots: Array<WorkspaceSnapshotManifest & { snapshotPath: string }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const snapshotPath = path.join(root, entry.name);
    try {
      snapshots.push({ ...(await readSnapshotManifest(snapshotPath)), snapshotPath });
    } catch {
      // Ignore unknown folders so teams can keep manual notes beside snapshots.
    }
  }

  return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function restoreWorkspaceSnapshot(
  options: RestoreWorkspaceSnapshotOptions
): Promise<RestoreWorkspaceSnapshotResult> {
  const workspacePath = requireWorkspaceRoot(options.workspacePath);
  const snapshotPath = path.join(snapshotsRoot(workspacePath), slugifySnapshotName(options.name));
  if (!(await fsExtra.pathExists(snapshotPath))) {
    throw new Error(`Snapshot not found: ${options.name}`);
  }

  const manifest = await readSnapshotManifest(snapshotPath);
  const filesRoot = snapshotFilesRoot(snapshotPath);
  const restoredPaths =
    manifest.mode === 'full'
      ? ['.']
      : Array.from(
          new Set(
            manifest.copiedPaths.map((relativePath) =>
              relativePath.startsWith('.rapidkit/') ? '.rapidkit' : relativePath
            )
          )
        );

  if (options.dryRun) {
    await appendAuditEvent(workspacePath, {
      action: 'snapshot.restore',
      target: manifest.name,
      status: 'planned',
      reason: options.reason,
      details: { restoredPaths },
    });
    return { workspacePath, snapshotPath, restoredPaths, dryRun: true };
  }

  if (!options.force) {
    throw new Error(
      'Restore is destructive. Re-run with --force after reviewing --dry-run output.'
    );
  }

  await enforceDestructivePolicy(workspacePath, 'snapshot.restore', {
    reason: options.reason,
    safetySnapshot: options.safetySnapshot,
  });

  let safetySnapshotPath: string | undefined;
  if (options.safetySnapshot !== false) {
    const safetySnapshot = await createWorkspaceSnapshot({
      workspacePath,
      name: `pre-restore-${manifest.name}-${timestampForPath()}`,
      reason: `Automatic safety snapshot before restoring ${manifest.name}`,
      includeProjects: false,
    });
    safetySnapshotPath = safetySnapshot.snapshotPath;
  }

  if (manifest.mode === 'full') {
    await fsExtra.copy(filesRoot, workspacePath, {
      overwrite: true,
      errorOnExist: false,
      filter: (candidatePath) => shouldCopyPath(filesRoot, candidatePath),
    });
  } else {
    for (const relativePath of manifest.copiedPaths) {
      await fsExtra.copy(
        path.join(filesRoot, relativePath),
        path.join(workspacePath, relativePath),
        {
          overwrite: true,
          errorOnExist: false,
        }
      );
    }
  }

  const result = { workspacePath, snapshotPath, restoredPaths, dryRun: false, safetySnapshotPath };

  await appendAuditEvent(workspacePath, {
    action: 'snapshot.restore',
    target: manifest.name,
    status: 'succeeded',
    reason: options.reason,
    details: {
      restoredPaths,
      safetySnapshotPath,
    },
  });

  return result;
}

function normalizeProjectRef(input: string): string {
  const normalized = input.trim();
  if (!normalized) {
    throw new Error('Project name/path is required.');
  }
  return normalized;
}

async function resolveProjectPath(workspacePath: string, projectRef: string): Promise<string> {
  const normalizedRef = normalizeProjectRef(projectRef);
  const absoluteCandidate = path.isAbsolute(normalizedRef)
    ? path.resolve(normalizedRef)
    : path.resolve(workspacePath, normalizedRef);

  if (
    absoluteCandidate.startsWith(`${path.resolve(workspacePath)}${path.sep}`) &&
    (await fsExtra.pathExists(absoluteCandidate))
  ) {
    return absoluteCandidate;
  }

  const projects = await discoverWorkspaceProjects(workspacePath, {
    descendIntoMatchedProjects: false,
  });

  const matches = projects.filter((projectPath) => {
    const relativePath = path.relative(workspacePath, projectPath);
    return path.basename(projectPath) === normalizedRef || relativePath === normalizedRef;
  });

  if (matches.length === 0) {
    throw new Error(`Project not found in workspace: ${projectRef}`);
  }
  if (matches.length > 1) {
    throw new Error(`Project reference is ambiguous: ${projectRef}`);
  }
  return matches[0];
}

async function syncWorkspaceProjectsBestEffort(workspacePath: string): Promise<void> {
  try {
    const { syncWorkspaceProjects } = await import('./workspace.js');
    await syncWorkspaceProjects(workspacePath, true);
  } catch {
    // Registry sync is non-fatal; the project operation already committed.
  }
}

function archivedProjectPath(workspacePath: string, projectName: string): string {
  const fingerprint = crypto.randomBytes(4).toString('hex');
  return path.join(
    archiveRoot(workspacePath),
    `${projectName}-${timestampForPath()}-${fingerprint}`
  );
}

async function readArchiveManifest(archivePath: string): Promise<ProjectArchiveManifest> {
  const manifestPath = path.join(archivePath, 'rapidkit-archive.json');
  const manifest: unknown = await fsExtra.readJson(manifestPath);
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    (manifest as ProjectArchiveManifest).schema !== PROJECT_ARCHIVE_SCHEMA
  ) {
    throw new Error(`Invalid RapidKit archive manifest: ${manifestPath}`);
  }
  return manifest as ProjectArchiveManifest;
}

export async function listArchivedProjects(
  options: ListArchivedProjectsOptions = {}
): Promise<ArchivedProjectEntry[]> {
  const workspacePath = requireWorkspaceRoot(options.workspacePath);
  const root = archiveRoot(workspacePath);
  if (!(await fsExtra.pathExists(root))) {
    return [];
  }

  const entries = await fsExtra.readdir(root, { withFileTypes: true });
  const archives: ArchivedProjectEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const archivePath = path.join(root, entry.name);
    const manifestPath = path.join(archivePath, 'rapidkit-archive.json');
    try {
      archives.push({
        ...(await readArchiveManifest(archivePath)),
        archivePath,
        manifestPath,
      });
    } catch {
      // Unknown folders are ignored to keep manual archives harmless.
    }
  }

  return archives.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
}

async function resolveArchivePath(workspacePath: string, archiveRef: string): Promise<string> {
  const normalizedRef = normalizeProjectRef(archiveRef);
  const absoluteCandidate = path.isAbsolute(normalizedRef)
    ? path.resolve(normalizedRef)
    : path.resolve(archiveRoot(workspacePath), normalizedRef);

  if (
    absoluteCandidate.startsWith(`${path.resolve(archiveRoot(workspacePath))}${path.sep}`) &&
    (await fsExtra.pathExists(path.join(absoluteCandidate, 'rapidkit-archive.json')))
  ) {
    return absoluteCandidate;
  }

  const archives = await listArchivedProjects({ workspacePath });
  const matches = archives.filter((archive) => {
    return (
      path.basename(archive.archivePath) === normalizedRef ||
      archive.projectName === normalizedRef ||
      path.relative(archiveRoot(workspacePath), archive.archivePath) === normalizedRef
    );
  });

  if (matches.length === 0) {
    throw new Error(`Archived project not found: ${archiveRef}`);
  }
  if (matches.length > 1) {
    throw new Error(`Archive reference is ambiguous: ${archiveRef}`);
  }
  return matches[0].archivePath;
}

export async function archiveWorkspaceProject(
  options: ProjectLifecycleOptions
): Promise<ProjectLifecycleResult> {
  const workspacePath = requireWorkspaceRoot(options.workspacePath);
  const projectPath = await resolveProjectPath(workspacePath, options.project);
  const projectName = path.basename(projectPath);
  const archivePath = archivedProjectPath(workspacePath, projectName);
  const manifestPath = path.join(archivePath, 'rapidkit-archive.json');

  if (options.dryRun) {
    await appendAuditEvent(workspacePath, {
      action: 'project.archive',
      target: projectName,
      status: 'planned',
      reason: options.reason,
      details: { projectPath, archivePath },
    });
    return {
      workspacePath,
      projectName,
      projectPath,
      action: 'archive',
      archivePath,
      manifestPath,
      dryRun: true,
    };
  }

  await enforceDestructivePolicy(workspacePath, 'project.archive', {
    reason: options.reason,
    safetySnapshot: true,
  });

  const safetySnapshot = await createWorkspaceSnapshot({
    workspacePath,
    name: `pre-archive-${projectName}-${timestampForPath()}`,
    reason: options.reason || `Automatic safety snapshot before archiving ${projectName}`,
    includeProjects: false,
  });

  await fsExtra.ensureDir(path.dirname(archivePath));
  await fsExtra.move(projectPath, archivePath, { overwrite: false });

  const manifest: ProjectArchiveManifest = {
    schema: PROJECT_ARCHIVE_SCHEMA,
    projectName,
    originalPath: projectPath,
    archivedPath: archivePath,
    reason: options.reason,
    archivedAt: new Date().toISOString(),
    safetySnapshotPath: safetySnapshot.snapshotPath,
  };

  await fsExtra.writeJson(manifestPath, manifest, { spaces: 2 });
  await removeImportedProjectsRegistryEntries(workspacePath, [projectPath]);
  await syncWorkspaceProjectsBestEffort(workspacePath);

  await appendAuditEvent(workspacePath, {
    action: 'project.archive',
    target: projectName,
    status: 'succeeded',
    reason: options.reason,
    details: {
      projectPath,
      archivePath,
      manifestPath,
      safetySnapshotPath: safetySnapshot.snapshotPath,
    },
  });

  return {
    workspacePath,
    projectName,
    projectPath,
    action: 'archive',
    archivePath,
    manifestPath,
    safetySnapshotPath: safetySnapshot.snapshotPath,
    dryRun: false,
  };
}

export async function deleteWorkspaceProject(
  options: DeleteProjectOptions
): Promise<ProjectLifecycleResult> {
  if (!options.permanent) {
    return archiveWorkspaceProject(options);
  }

  const workspacePath = requireWorkspaceRoot(options.workspacePath);
  const projectPath = await resolveProjectPath(workspacePath, options.project);
  const projectName = path.basename(projectPath);

  if (options.confirm !== projectName) {
    throw new Error(`Permanent delete requires --confirm ${projectName}`);
  }

  if (options.dryRun) {
    await appendAuditEvent(workspacePath, {
      action: 'project.delete',
      target: projectName,
      status: 'planned',
      reason: options.reason,
      details: { projectPath, permanent: true },
    });
    return {
      workspacePath,
      projectName,
      projectPath,
      action: 'delete',
      dryRun: true,
    };
  }

  await enforceDestructivePolicy(workspacePath, 'project.delete', {
    reason: options.reason,
    permanent: true,
    safetySnapshot: true,
  });

  const safetySnapshot = await createWorkspaceSnapshot({
    workspacePath,
    name: `pre-delete-${projectName}-${timestampForPath()}`,
    reason: options.reason || `Automatic safety snapshot before deleting ${projectName}`,
    includeProjects: false,
  });

  await fsExtra.remove(projectPath);
  await removeImportedProjectsRegistryEntries(workspacePath, [projectPath]);
  await syncWorkspaceProjectsBestEffort(workspacePath);

  await appendAuditEvent(workspacePath, {
    action: 'project.delete',
    target: projectName,
    status: 'succeeded',
    reason: options.reason,
    details: {
      projectPath,
      permanent: true,
      safetySnapshotPath: safetySnapshot.snapshotPath,
    },
  });

  return {
    workspacePath,
    projectName,
    projectPath,
    action: 'delete',
    safetySnapshotPath: safetySnapshot.snapshotPath,
    dryRun: false,
  };
}

export async function restoreArchivedProject(
  options: RestoreArchivedProjectOptions
): Promise<ProjectLifecycleResult> {
  const workspacePath = requireWorkspaceRoot(options.workspacePath);
  const archivePath = await resolveArchivePath(workspacePath, options.archive);
  const manifest = await readArchiveManifest(archivePath);
  const projectName = options.targetName?.trim() || manifest.projectName;
  const projectPath = path.join(workspacePath, projectName);

  if (!projectPath.startsWith(`${path.resolve(workspacePath)}${path.sep}`)) {
    throw new Error(`Archive restore target escapes workspace: ${projectName}`);
  }

  if ((await fsExtra.pathExists(projectPath)) && !options.force) {
    throw new Error(
      `Project path already exists. Re-run with --force to overwrite: ${projectPath}`
    );
  }

  if (options.dryRun) {
    await appendAuditEvent(workspacePath, {
      action: 'project.restore',
      target: projectName,
      status: 'planned',
      reason: options.reason,
      details: { archivePath, projectPath },
    });
    return {
      workspacePath,
      projectName,
      projectPath,
      action: 'restore',
      archivePath,
      manifestPath: path.join(archivePath, 'rapidkit-archive.json'),
      dryRun: true,
    };
  }

  await enforceDestructivePolicy(workspacePath, 'project.restore', {
    reason: options.reason,
    safetySnapshot: true,
  });

  const safetySnapshot = await createWorkspaceSnapshot({
    workspacePath,
    name: `pre-restore-project-${projectName}-${timestampForPath()}`,
    reason: options.reason || `Automatic safety snapshot before restoring ${projectName}`,
    includeProjects: false,
  });

  await fsExtra.move(archivePath, projectPath, { overwrite: options.force === true });
  await syncWorkspaceProjectsBestEffort(workspacePath);

  await appendAuditEvent(workspacePath, {
    action: 'project.restore',
    target: projectName,
    status: 'succeeded',
    reason: options.reason,
    details: {
      archivePath,
      projectPath,
      safetySnapshotPath: safetySnapshot.snapshotPath,
    },
  });

  return {
    workspacePath,
    projectName,
    projectPath,
    action: 'restore',
    archivePath,
    manifestPath: path.join(projectPath, 'rapidkit-archive.json'),
    safetySnapshotPath: safetySnapshot.snapshotPath,
    dryRun: false,
  };
}
