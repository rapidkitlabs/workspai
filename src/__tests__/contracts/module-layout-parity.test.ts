import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  CANONICAL_MODULE_ROOT,
  MODULE_LAYOUT_SCHEMA_VERSION,
  MODULE_PATH_PATTERN,
  MODULE_SLUG_PATTERN,
} from '../../utils/module-layout.js';
import { buildModuleLayoutContract } from '../../contracts/module-layout-contract';

type ModuleLayoutContract = {
  schemaVersion: string;
  canonicalModuleRoot: string;
  pathPattern: string;
  slugPattern: string;
};

function resolveContractPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'contracts', 'module-layout.v1.json'),
    path.resolve(process.cwd(), '..', 'contracts', 'module-layout.v1.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

describe('module layout contract parity', () => {
  it('keeps TS constants aligned with contracts/module-layout.v1.json', () => {
    const contract = JSON.parse(
      fs.readFileSync(resolveContractPath(), 'utf8')
    ) as ModuleLayoutContract;
    expect(MODULE_LAYOUT_SCHEMA_VERSION).toBe(contract.schemaVersion);
    expect(CANONICAL_MODULE_ROOT).toBe(contract.canonicalModuleRoot);
    expect(MODULE_PATH_PATTERN).toBe(contract.pathPattern);
    expect(MODULE_SLUG_PATTERN).toBe(contract.slugPattern);
  });

  it('keeps committed module layout aligned with the generator', () => {
    const contract = JSON.parse(fs.readFileSync(resolveContractPath(), 'utf8')) as ReturnType<
      typeof buildModuleLayoutContract
    >;
    expect(contract).toEqual(buildModuleLayoutContract());
  });
});
