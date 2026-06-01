import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('npm publish contract', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
  ) as {
    bin?: Record<string, string>;
    files?: string[];
    scripts?: Record<string, string>;
  };

  it('publishes the canonical rapidkit bin and an explicit npm alias', () => {
    expect(packageJson.bin?.rapidkit).toBe('dist/index.js');
    expect(packageJson.bin?.['rapidkit-npm']).toBe('dist/index.js');
  });

  it('builds and verifies dist before npm pack or publish', () => {
    expect(packageJson.scripts?.prepack).toContain('npm run build');
    expect(packageJson.scripts?.prepack).toContain('npm run test:prepare-embeddings');
    expect(packageJson.scripts?.prepack).toContain('npm run verify:package-cli');
  });

  it('ships and runs a Windows CLI resolution guard on install', () => {
    expect(packageJson.files).toContain('scripts/check-cli-resolution.cjs');
    expect(packageJson.scripts?.postinstall).toBe('node scripts/check-cli-resolution.cjs');
  });
});
