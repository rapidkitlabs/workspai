import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const NPM_CONTRACTS_DIR = path.resolve(process.cwd(), 'contracts');
const FRONT_CONTRACTS_DIR = path.resolve(process.cwd(), '..', 'contracts');

const MONOREPO_CONTRACT_FILES = [
  'runtime-command-surface.v1.json',
  'create-planner-capabilities.v1.json',
  'backend-import-stack-parity.snapshot.json',
  'module-layout.v1.json',
  'pipeline-last-run.v1.json',
  'infra-stack.v1.json',
  'workspace-registry.v1.json',
  'release-readiness.v1.json',
  'workspace-run-last.v1.json',
  'doctor-workspace-evidence.v1.json',
  'doctor-project-evidence.v1.json',
  'analyze-last-run.v1.json',
];

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
}

describe('npm monorepo contract parity', () => {
  it('keeps npm contracts aligned with Front/contracts in monorepo layout', () => {
    if (!fs.existsSync(FRONT_CONTRACTS_DIR)) {
      return;
    }

    for (const fileName of MONOREPO_CONTRACT_FILES) {
      const npmPath = path.join(NPM_CONTRACTS_DIR, fileName);
      const frontPath = path.join(FRONT_CONTRACTS_DIR, fileName);

      expect(fs.existsSync(npmPath), `${fileName} missing in npm`).toBe(true);
      expect(fs.existsSync(frontPath), `${fileName} missing in Front/contracts`).toBe(true);
      expect(readJson(npmPath)).toEqual(readJson(frontPath));
    }
  });
});
