import path from 'path';
import fsExtra from 'fs-extra';
import { toLegacyRapidkitArtifactPath, toWorkspaiArtifactPath } from './workspace-paths.js';

export function resolveWorkspaceArtifactPath(workspacePath: string, relativePath: string): string {
  return path.join(workspacePath, toWorkspaiArtifactPath(relativePath));
}

export function resolveLegacyWorkspaceArtifactPath(
  workspacePath: string,
  relativePath: string
): string {
  return path.join(workspacePath, toLegacyRapidkitArtifactPath(relativePath));
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

  await fsExtra.ensureDir(path.dirname(primaryPath));
  await fsExtra.writeJson(primaryPath, payload, { spaces: 2 });

  return primaryPath;
}

export async function writeWorkspaceArtifactText(
  workspacePath: string,
  relativePath: string,
  payload: string
): Promise<string> {
  const primaryPath = resolveWorkspaceArtifactPath(workspacePath, relativePath);

  await fsExtra.ensureDir(path.dirname(primaryPath));
  await fsExtra.writeFile(primaryPath, payload, 'utf-8');

  return primaryPath;
}
