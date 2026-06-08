import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import { PROJECT_CAPABILITY_COMMANDS } from '../../utils/project-command-capabilities';
import { getRuntimeSupport } from '../../utils/support-matrix';

type RuntimeSurfaceContract = {
  schemaVersion: string;
  lifecycleCommands: string[];
  moduleMutationCommands: string[];
  globalCommands: string[];
  universalCommands: string[];
  moduleSuggestionFrameworks: string[];
  moduleUnsupportedFrameworks: string[];
  scaffoldKits: string[];
  runtimeMatrix: Record<
    string,
    {
      tier: string;
      scaffold: boolean;
      import: boolean;
      moduleCommands: boolean;
      doctor: string;
      lifecycleCommands: string[];
    }
  >;
};

function resolveContractPath(): string {
  const explicitPath = process.env.RAPIDKIT_RUNTIME_COMMAND_SURFACE_CONTRACT;
  if (explicitPath?.trim()) {
    return path.resolve(explicitPath.trim());
  }

  const candidates = [
    path.resolve(process.cwd(), '..', 'contracts', 'runtime-command-surface.v1.json'),
    path.resolve(process.cwd(), 'contracts', 'runtime-command-surface.v1.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function readContract(): RuntimeSurfaceContract {
  const contractPath = resolveContractPath();
  if (!fs.existsSync(contractPath)) {
    throw new Error(`Runtime command surface contract not found: ${contractPath}`);
  }
  return JSON.parse(fs.readFileSync(contractPath, 'utf8')) as RuntimeSurfaceContract;
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

describe('shared runtime command surface contract (npm)', () => {
  it('pins schema and project capability command sets', () => {
    const contract = readContract();

    expect(contract.schemaVersion).toBe('rapidkit-runtime-command-surface-v1');
    expect(sorted(PROJECT_CAPABILITY_COMMANDS)).toEqual(
      sorted([
        ...contract.universalCommands,
        ...contract.lifecycleCommands,
        ...contract.moduleMutationCommands,
        ...contract.globalCommands,
      ])
    );
  });

  it('matches npm runtime support matrix exactly', () => {
    const contract = readContract();

    for (const [runtime, expected] of Object.entries(contract.runtimeMatrix)) {
      const actual = getRuntimeSupport(runtime);
      expect(actual.tier, runtime).toBe(expected.tier);
      expect(actual.scaffoldSupport, runtime).toBe(expected.scaffold);
      expect(actual.importSupport, runtime).toBe(expected.import);
      expect(actual.moduleCommands, runtime).toBe(expected.moduleCommands);
      expect(actual.doctorSupport, runtime).toBe(expected.doctor);
      expect(actual.lifecycleCommands, runtime).toEqual(expected.lifecycleCommands);
    }
  });

  it('keeps module marketplace support restricted to first-class Core-backed frameworks', () => {
    const contract = readContract();

    expect(contract.moduleSuggestionFrameworks).toEqual(['fastapi', 'nestjs']);
    expect(contract.moduleUnsupportedFrameworks).toEqual(['go', 'springboot', 'dotnet']);
  });
});
