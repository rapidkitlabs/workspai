import fs from 'fs';
import path from 'path';

export function ensureDistBuilt(label = 'CLI tests'): string {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const distPath = path.join(repoRoot, 'dist', 'index.js');

  if (!fs.existsSync(distPath)) {
    throw new Error(`Missing dist/index.js for ${label}; run tests through npm test`);
  }

  return distPath;
}
