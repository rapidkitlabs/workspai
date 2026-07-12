import path from 'path';
import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import fsExtra from 'fs-extra';
import { toLegacyRapidkitArtifactPath, toWorkspaiArtifactPath } from './workspace-paths.js';

function assertWorkspaceContainedPath(workspacePath: string, relativePath: string): string {
  const root = path.resolve(workspacePath);
  const normalized = relativePath.trim();
  if (!normalized || path.isAbsolute(normalized)) {
    throw new Error(`Workspace artifact path must be non-empty and relative: ${relativePath}`);
  }
  const target = path.resolve(root, normalized);
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Workspace artifact path escapes workspace root: ${relativePath}`);
  }
  return target;
}

export function resolveWorkspaceArtifactPath(workspacePath: string, relativePath: string): string {
  return assertWorkspaceContainedPath(workspacePath, toWorkspaiArtifactPath(relativePath));
}

export function resolveLegacyWorkspaceArtifactPath(
  workspacePath: string,
  relativePath: string
): string {
  return assertWorkspaceContainedPath(workspacePath, toLegacyRapidkitArtifactPath(relativePath));
}

async function ensureArtifactParentIsContained(
  workspacePath: string,
  artifactPath: string
): Promise<void> {
  const root = path.resolve(workspacePath);
  await fsExtra.ensureDir(root);
  const parent = path.dirname(artifactPath);
  await fsExtra.ensureDir(parent);
  const [realRoot, realParent] = await Promise.all([
    fsExtra.realpath(root),
    fsExtra.realpath(parent),
  ]);
  const relative = path.relative(realRoot, realParent);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Workspace artifact parent resolves outside workspace root: ${parent}`);
  }
}

async function assertExistingArtifactIsContained(
  workspacePath: string,
  artifactPath: string
): Promise<void> {
  const root = path.resolve(workspacePath);
  const [realRoot, realArtifact] = await Promise.all([
    fsExtra.realpath(root),
    fsExtra.realpath(artifactPath),
  ]);
  const relative = path.relative(realRoot, realArtifact);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Workspace artifact resolves outside workspace root: ${artifactPath}`);
  }
}

async function replaceArtifactAtomically(
  workspacePath: string,
  primaryPath: string,
  writeTemporary: (temporaryPath: string) => Promise<void>
): Promise<void> {
  await ensureArtifactParentIsContained(workspacePath, primaryPath);
  const parent = path.dirname(primaryPath);
  const temporaryPrefix = `${path.basename(primaryPath)}.`;
  const now = Date.now();
  for (const name of await fsExtra.readdir(parent)) {
    if (!name.startsWith(temporaryPrefix) || !name.endsWith('.tmp')) continue;
    const candidate = path.join(parent, name);
    const stat = await fsExtra.stat(candidate).catch(() => null);
    if (stat && now - stat.mtimeMs > 30_000) {
      await fsExtra.remove(candidate).catch(() => undefined);
    }
  }
  const temporaryPath = `${primaryPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeTemporary(temporaryPath);
    const temporaryHandle = await open(temporaryPath, 'r');
    try {
      await temporaryHandle.sync();
    } finally {
      await temporaryHandle.close();
    }
    const testDelayMs = Number(process.env.WORKSPAI_TEST_ATOMIC_WRITE_DELAY_MS ?? 0);
    if (Number.isFinite(testDelayMs) && testDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(testDelayMs, 30_000)));
    }
    try {
      await fsExtra.rename(temporaryPath, primaryPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST' && code !== 'EPERM') {
        throw error;
      }
      await fsExtra.move(temporaryPath, primaryPath, { overwrite: true });
    }
  } finally {
    await fsExtra.remove(temporaryPath).catch(() => undefined);
  }
}

export async function withWorkspaceArtifactLock<T>(
  workspacePath: string,
  relativePath: string,
  operation: () => Promise<T>,
  options: { timeoutMs?: number; staleAfterMs?: number } = {}
): Promise<T> {
  const artifactPath = resolveWorkspaceArtifactPath(workspacePath, relativePath);
  await ensureArtifactParentIsContained(workspacePath, artifactPath);
  const lockPath = `${artifactPath}.lock`;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const staleAfterMs = options.staleAfterMs ?? 30_000;
  const startedAt = Date.now();
  let handle: Awaited<ReturnType<typeof open>> | undefined;

  while (!handle) {
    try {
      handle = await open(lockPath, 'wx');
      await handle.writeFile(
        `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`
      );
      await handle.sync();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        if (handle) {
          await handle.close().catch(() => undefined);
          handle = undefined;
          await fsExtra.remove(lockPath).catch(() => undefined);
        }
        throw error;
      }
      const stat = await fsExtra.stat(lockPath).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > staleAfterMs) {
        const lock = await fsExtra.readJson(lockPath).catch(() => null);
        const ownerPid = Number(lock?.pid);
        let ownerAlive = false;
        if (Number.isInteger(ownerPid) && ownerPid > 0) {
          try {
            process.kill(ownerPid, 0);
            ownerAlive = true;
          } catch (ownerError) {
            ownerAlive = (ownerError as NodeJS.ErrnoException).code === 'EPERM';
          }
        }
        if (!ownerAlive) {
          await fsExtra.remove(lockPath).catch(() => undefined);
          continue;
        }
      }
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(`Timed out waiting for workspace artifact lock: ${relativePath}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  try {
    return await operation();
  } finally {
    await handle.close().catch(() => undefined);
    await fsExtra.remove(lockPath).catch(() => undefined);
  }
}

export async function firstExistingWorkspaceArtifactPath(
  workspacePath: string,
  relativePath: string
): Promise<string | null> {
  const candidates = [
    resolveWorkspaceArtifactPath(workspacePath, relativePath),
    resolveLegacyWorkspaceArtifactPath(workspacePath, relativePath),
  ];

  for (const candidate of candidates) {
    if (await fsExtra.pathExists(candidate)) {
      await assertExistingArtifactIsContained(workspacePath, candidate);
      return candidate;
    }
  }

  return null;
}

export async function writeWorkspaceArtifactJson(
  workspacePath: string,
  relativePath: string,
  payload: unknown
): Promise<string> {
  const primaryPath = resolveWorkspaceArtifactPath(workspacePath, relativePath);

  await replaceArtifactAtomically(workspacePath, primaryPath, (temporaryPath) =>
    fsExtra.writeJson(temporaryPath, payload, { spaces: 2 })
  );

  return primaryPath;
}

export async function writeWorkspaceArtifactText(
  workspacePath: string,
  relativePath: string,
  payload: string
): Promise<string> {
  const primaryPath = resolveWorkspaceArtifactPath(workspacePath, relativePath);

  await replaceArtifactAtomically(workspacePath, primaryPath, (temporaryPath) =>
    fsExtra.writeFile(temporaryPath, payload, 'utf-8')
  );

  return primaryPath;
}
