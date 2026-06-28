import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const BUILD_LOCK_PATH = path.resolve(__dirname, '..', '..', '..', '.rapidkit-test-build.lock');

function waitForBuildLockRelease(distPath: string, sourcePaths: string[]): string | undefined {
  for (;;) {
    if (!fs.existsSync(BUILD_LOCK_PATH)) {
      return undefined;
    }

    if (!shouldBuildDist(distPath, sourcePaths)) {
      return distPath;
    }

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
}

function shouldBuildDist(distPath: string, sourcePaths: string[]): boolean {
  if (!fs.existsSync(distPath)) return true;

  const distMtime = fs.statSync(distPath).mtimeMs;
  return sourcePaths.some((sourcePath) => {
    if (!fs.existsSync(sourcePath)) return false;
    return fs.statSync(sourcePath).mtimeMs > distMtime;
  });
}

export function ensureDistBuilt(label = 'CLI tests'): string {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const distPath = path.join(repoRoot, 'dist', 'index.js');
  const sourcePaths = [
    path.join(repoRoot, 'src', 'index.ts'),
    path.join(repoRoot, 'src', 'frontend-project.ts'),
    path.join(repoRoot, 'src', 'import-project.ts'),
    path.join(repoRoot, 'src', 'imported-projects-registry.ts'),
    path.join(repoRoot, 'src', 'runtime-adapters', 'node.ts'),
    path.join(repoRoot, 'src', 'utils', 'platform-capabilities.ts'),
    path.join(repoRoot, 'src', 'workspace-context.ts'),
    path.join(repoRoot, 'src', 'workspace-intelligence.ts'),
    path.join(repoRoot, 'src', 'workspace-model.ts'),
    path.join(repoRoot, 'src', 'workspace-git-observation.ts'),
    path.join(repoRoot, 'src', 'workspace-verify.ts'),
    path.join(repoRoot, 'src', 'workspace-snapshot.ts'),
  ];

  if (!shouldBuildDist(distPath, sourcePaths)) {
    return distPath;
  }

  const lockWaitResult = waitForBuildLockRelease(distPath, sourcePaths);
  if (lockWaitResult) {
    return lockWaitResult;
  }

  let lockFd: number | undefined;
  try {
    lockFd = fs.openSync(BUILD_LOCK_PATH, 'wx');
  } catch {
    const waited = waitForBuildLockRelease(distPath, sourcePaths);
    if (waited) {
      return waited;
    }
    throw new Error(`Failed to acquire dist build lock for ${label}`);
  }

  try {
    const tsupCliPath = path.join(repoRoot, 'node_modules', 'tsup', 'dist', 'cli-default.js');
    const build = spawnSync(process.execPath, [tsupCliPath], {
      cwd: repoRoot,
      stdio: 'inherit',
    });

    if (build.status !== 0) {
      throw new Error(`Failed to build dist/index.js for ${label}`);
    }
  } finally {
    if (typeof lockFd === 'number') {
      fs.closeSync(lockFd);
    }
    fs.rmSync(BUILD_LOCK_PATH, { force: true });
  }

  return distPath;
}
