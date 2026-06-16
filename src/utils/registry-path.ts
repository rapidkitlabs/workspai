import { realpathSync } from 'fs';
import path from 'path';

/** Canonical registry path for cross-platform workspace/project entries. */
export function normalizeRegistryPath(inputPath: string): string {
  let resolved = path.resolve(inputPath);
  try {
    resolved = realpathSync.native(resolved);
  } catch {
    // Keep resolved path when the target does not exist yet.
  }
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
