import fs from 'fs';
import path from 'path';

export function readMakefileText(projectRoot: string): string {
  try {
    const makefile = path.join(projectRoot, 'Makefile');
    if (!fs.existsSync(makefile)) return '';
    return fs.readFileSync(makefile, 'utf8');
  } catch {
    return '';
  }
}

export function hasMakefileTarget(projectRoot: string, target: string): boolean {
  const makefile = readMakefileText(projectRoot);
  if (!makefile) return false;
  const pattern = new RegExp(`^${target}\\s*:`, 'm');
  return pattern.test(makefile);
}
