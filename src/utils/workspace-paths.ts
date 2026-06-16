import fs from 'fs';
import { homedir } from 'os';
import path from 'path';

export const MANAGED_DEFAULT_WORKSPACE_NAME = 'workspai';
export const MANAGED_DEFAULT_WORKSPACE_LABEL = 'Workspai';

/** @deprecated Use MANAGED_DEFAULT_WORKSPACE_NAME */
export const DEFAULT_IMPORT_WORKSPACE_NAME = MANAGED_DEFAULT_WORKSPACE_NAME;

/** @deprecated Use MANAGED_DEFAULT_WORKSPACE_LABEL */
export const DEFAULT_IMPORT_WORKSPACE_LABEL = MANAGED_DEFAULT_WORKSPACE_LABEL;

export function hasWorkspaceRootMarkers(workspacePath: string): boolean {
  return (
    fs.existsSync(path.join(workspacePath, '.rapidkit-workspace')) ||
    fs.existsSync(path.join(workspacePath, '.rapidkit', 'workspace.json'))
  );
}

/** @deprecated Use hasWorkspaceRootMarkers */
export const hasManagedDefaultWorkspaceMarkers = hasWorkspaceRootMarkers;

export function getCanonicalWorkspacesDirectory(homeDir: string = homedir()): string {
  return path.join(homeDir, 'rapidkit', 'workspaces');
}

export function getLegacyWorkspacesDirectory(homeDir: string = homedir()): string {
  return path.join(homeDir, 'Workspai', 'rapidkits');
}

export function resolveCanonicalWorkspacePath(
  workspaceName: string,
  homeDir: string = homedir()
): string {
  return path.join(getCanonicalWorkspacesDirectory(homeDir), workspaceName);
}

export function getKnownWorkspaceLocationCandidates(
  workspaceName: string,
  homeDir: string = homedir()
): string[] {
  return [
    resolveCanonicalWorkspacePath(workspaceName, homeDir),
    path.join(getLegacyWorkspacesDirectory(homeDir), workspaceName),
  ];
}

export function resolveNewWorkspacePath(
  workspaceName: string,
  options: { homeDir?: string; outputDir?: string } = {}
): string {
  const homeDir = options.homeDir ?? homedir();
  if (options.outputDir) {
    return path.resolve(options.outputDir, workspaceName);
  }
  return resolveCanonicalWorkspacePath(workspaceName, homeDir);
}

export function findExistingWorkspacePath(
  workspaceName: string,
  homeDir: string = homedir()
): string | undefined {
  for (const candidate of getKnownWorkspaceLocationCandidates(workspaceName, homeDir)) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function resolveAvailableWorkspaceSlot(
  parentDirectory: string,
  baseName = 'my-workspace'
): { name: string; targetPath: string } {
  let index = 1;

  while (true) {
    const name = index === 1 ? baseName : `${baseName}-${index}`;
    const targetPath = path.join(parentDirectory, name);
    if (!fs.existsSync(targetPath)) {
      return { name, targetPath };
    }
    index += 1;
  }
}

export function getManagedDefaultWorkspaceCandidates(homeDir: string = homedir()): string[] {
  return [
    path.join(getCanonicalWorkspacesDirectory(homeDir), MANAGED_DEFAULT_WORKSPACE_NAME),
    path.join(getLegacyWorkspacesDirectory(homeDir), MANAGED_DEFAULT_WORKSPACE_NAME),
  ];
}

export function resolveManagedDefaultImportWorkspacePath(homeDir: string = homedir()): string {
  for (const candidate of getManagedDefaultWorkspaceCandidates(homeDir)) {
    if (hasWorkspaceRootMarkers(candidate)) {
      return candidate;
    }
  }

  return resolveCanonicalWorkspacePath(MANAGED_DEFAULT_WORKSPACE_NAME, homeDir);
}

export function isLegacyWorkspacePath(workspacePath: string, homeDir: string = homedir()): boolean {
  const legacyParent = getLegacyWorkspacesDirectory(homeDir);
  const relativePath = path.relative(legacyParent, path.resolve(workspacePath));
  return (
    relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
  );
}

export function isCanonicalWorkspacePath(
  workspacePath: string,
  homeDir: string = homedir()
): boolean {
  const canonicalParent = getCanonicalWorkspacesDirectory(homeDir);
  const relativePath = path.relative(canonicalParent, path.resolve(workspacePath));
  return (
    relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
  );
}
