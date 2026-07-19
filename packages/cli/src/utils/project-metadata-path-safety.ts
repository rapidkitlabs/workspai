import path from 'path';

import fsExtra from 'fs-extra';

import { LEGACY_RAPIDKIT_METADATA_DIR, WORKSPAI_METADATA_DIR } from './workspace-paths.js';

const PROJECT_METADATA_DIRECTORIES = [WORKSPAI_METADATA_DIR, LEGACY_RAPIDKIT_METADATA_DIR] as const;

function isSameOrInside(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return (
    relativePath === '' ||
    (relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

export async function assertSafeProjectMetadataDirectories(projectPath: string): Promise<void> {
  const resolvedProjectPath = await fsExtra.realpath(projectPath);

  for (const directoryName of PROJECT_METADATA_DIRECTORIES) {
    const metadataPath = path.join(projectPath, directoryName);
    const metadataStats = await fsExtra
      .lstat(metadataPath)
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          return null;
        }
        throw error;
      });

    if (!metadataStats) {
      continue;
    }
    if (metadataStats.isSymbolicLink()) {
      throw new Error(`Project metadata directory must not be a symlink: ${metadataPath}`);
    }

    const resolvedMetadataPath = await fsExtra.realpath(metadataPath);
    if (!isSameOrInside(resolvedProjectPath, resolvedMetadataPath)) {
      throw new Error(`Project metadata directory resolves outside the project: ${metadataPath}`);
    }
  }
}

export async function isProjectMetadataSymlink(entryPath: string): Promise<boolean> {
  const baseName = path.basename(entryPath);
  if (
    !PROJECT_METADATA_DIRECTORIES.includes(
      baseName as (typeof PROJECT_METADATA_DIRECTORIES)[number]
    )
  ) {
    return false;
  }

  return (await fsExtra.lstat(entryPath)).isSymbolicLink();
}
