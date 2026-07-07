import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { hasMakefileTarget, readMakefileText } from '../utils/lifecycle-makefile.js';

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('lifecycle-makefile', () => {
  it('returns empty makefile text when Makefile is missing', () => {
    const projectRoot = createTempDir('rk-makefile-missing-');
    expect(readMakefileText(projectRoot)).toBe('');
    expect(hasMakefileTarget(projectRoot, 'lint')).toBe(false);
  });

  it('reads Makefile text and detects declared targets', () => {
    const projectRoot = createTempDir('rk-makefile-present-');
    fs.writeFileSync(
      path.join(projectRoot, 'Makefile'),
      'lint:\n\tgolangci-lint run\n\nformat:\n\tgofmt -w .\n',
      'utf-8'
    );

    expect(readMakefileText(projectRoot)).toContain('lint:');
    expect(hasMakefileTarget(projectRoot, 'lint')).toBe(true);
    expect(hasMakefileTarget(projectRoot, 'format')).toBe(true);
    expect(hasMakefileTarget(projectRoot, 'build')).toBe(false);
  });

  it('returns empty makefile text when read fails', () => {
    const projectRoot = createTempDir('rk-makefile-read-fail-');
    fs.writeFileSync(path.join(projectRoot, 'Makefile'), 'lint:\n', 'utf-8');

    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('read failed');
    });

    expect(readMakefileText(projectRoot)).toBe('');
    expect(hasMakefileTarget(projectRoot, 'lint')).toBe(false);
  });
});
