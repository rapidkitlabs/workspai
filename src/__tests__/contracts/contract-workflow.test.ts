import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('shared contracts workflow (Wave A + B)', () => {
  it('uses rapidkit-npm/contracts as canonical with generate + validate scripts', () => {
    const npmPackage = JSON.parse(read('package.json'));
    const syncScript = read('scripts/sync-import-stack-parity-snapshot.mjs');
    const preCommit = read('.husky/pre-commit');

    expect(npmPackage.scripts['validate:contracts']).toContain('check:generated-contracts');
    expect(npmPackage.scripts['validate:contracts']).toContain('check:parity-snapshot');
    expect(npmPackage.scripts['generate:contracts']).toContain('generate-shared-contracts');
    expect(syncScript).toContain('Canonical shared contracts live in rapidkit-npm/contracts/');
    expect(syncScript).toContain('module-layout.v1.json');
    expect(syncScript).toContain('infra-stack.v1.json');
    expect(preCommit).toContain('npm run validate:contracts');
    expect(preCommit).toContain('rapidkit-npm/contracts/');
  });
});
