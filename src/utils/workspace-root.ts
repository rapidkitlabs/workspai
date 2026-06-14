import fs from 'fs';
import path from 'path';

/**
 * Walk upward from startPath and return the first RapidKit workspace root.
 * Recognizes both the marker file (.rapidkit-workspace) and legacy workspace.json.
 */
export function findWorkspaceRootUp(startPath: string): string | null {
  let current = path.resolve(startPath);

  while (true) {
    if (
      fs.existsSync(path.join(current, '.rapidkit-workspace')) ||
      fs.existsSync(path.join(current, '.rapidkit', 'workspace.json'))
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
 * They have workspace markers without a project-level `.rapidkit/project.json`.
 */
export function isWorkspaceShellDirectory(dirPath: string): boolean {
  const resolved = path.resolve(dirPath);
  const hasWorkspaceMarker =
    fs.existsSync(path.join(resolved, '.rapidkit-workspace')) ||
    fs.existsSync(path.join(resolved, '.rapidkit', 'workspace.json'));
  const hasProjectMarker =
    fs.existsSync(path.join(resolved, '.rapidkit', 'project.json')) ||
    fs.existsSync(path.join(resolved, '.rapidkit', 'context.json'));

  return hasWorkspaceMarker && !hasProjectMarker;
}
