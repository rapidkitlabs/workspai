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
