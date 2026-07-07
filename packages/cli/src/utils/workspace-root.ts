import fs from 'fs';
import path from 'path';
import {
  LEGACY_RAPIDKIT_METADATA_DIR,
  LEGACY_RAPIDKIT_WORKSPACE_MARKER,
  WORKSPAI_METADATA_DIR,
  WORKSPAI_WORKSPACE_MARKER,
} from './workspace-paths.js';

/**
 * Walk upward from startPath and return the first Workspai workspace root.
 * Recognizes Workspai markers and RapidKit legacy markers while the ecosystem migrates.
 */
export function findWorkspaceRootUp(startPath: string): string | null {
  let current = path.resolve(startPath);

  while (true) {
    if (
      fs.existsSync(path.join(current, WORKSPAI_WORKSPACE_MARKER)) ||
      fs.existsSync(path.join(current, LEGACY_RAPIDKIT_WORKSPACE_MARKER)) ||
      fs.existsSync(path.join(current, WORKSPAI_METADATA_DIR, 'workspace.json')) ||
      fs.existsSync(path.join(current, LEGACY_RAPIDKIT_METADATA_DIR, 'workspace.json'))
    ) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Workspace shell directories host tooling (venv/pyproject) but are not application projects.
 * They have workspace markers without a project-level `.workspai/project.json`.
 */
export function isWorkspaceShellDirectory(dirPath: string): boolean {
  const resolved = path.resolve(dirPath);
  const hasWorkspaceMarker =
    fs.existsSync(path.join(resolved, WORKSPAI_WORKSPACE_MARKER)) ||
    fs.existsSync(path.join(resolved, LEGACY_RAPIDKIT_WORKSPACE_MARKER)) ||
    fs.existsSync(path.join(resolved, WORKSPAI_METADATA_DIR, 'workspace.json')) ||
    fs.existsSync(path.join(resolved, LEGACY_RAPIDKIT_METADATA_DIR, 'workspace.json'));
  const hasProjectMarker =
    fs.existsSync(path.join(resolved, WORKSPAI_METADATA_DIR, 'project.json')) ||
    fs.existsSync(path.join(resolved, WORKSPAI_METADATA_DIR, 'context.json')) ||
    fs.existsSync(path.join(resolved, LEGACY_RAPIDKIT_METADATA_DIR, 'project.json')) ||
    fs.existsSync(path.join(resolved, LEGACY_RAPIDKIT_METADATA_DIR, 'context.json'));

  return hasWorkspaceMarker && !hasProjectMarker;
}
