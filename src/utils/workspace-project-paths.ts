import path from 'path';

export function toPosixWorkspacePath(input: string): string {
  return input.replace(/\\/g, '/');
}

export function normalizeWorkspaceProjectSlug(raw: string, fallback: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 80);
  return normalized || fallback;
}

export function isWorkspaceExternalProjectPath(
  workspacePath: string,
  projectPath: string
): boolean {
  const relative = toPosixWorkspacePath(path.relative(workspacePath, projectPath));
  if (!relative || relative.startsWith('..')) {
    return true;
  }
  return relative
    .split('/')
    .filter(Boolean)
    .some((segment) => segment === '..');
}

export function resolveWorkspaceProjectPaths(input: {
  workspacePath: string;
  projectPath: string;
  projectName: string;
}): {
  relativePath: string;
  contractRelativePath: string;
  isExternal: boolean;
} {
  const discoveredRelativePath = toPosixWorkspacePath(
    path.relative(input.workspacePath, input.projectPath)
  );
  const isExternal = isWorkspaceExternalProjectPath(input.workspacePath, input.projectPath);
  const slug = normalizeWorkspaceProjectSlug(input.projectName, path.basename(input.projectPath));
  const contractRelativePath = isExternal ? `external/${slug}` : discoveredRelativePath || slug;

  return {
    relativePath: discoveredRelativePath || contractRelativePath,
    contractRelativePath,
    isExternal,
  };
}
