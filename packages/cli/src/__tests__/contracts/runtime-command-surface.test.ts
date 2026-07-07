import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import { listFrontendGenerators } from '../../frontend-project';
import { PROJECT_CAPABILITY_COMMANDS } from '../../utils/project-command-capabilities';
import { getRuntimeSupport } from '../../utils/support-matrix';
import { buildRuntimeCommandSurfaceContract } from '../../contracts/runtime-command-surface-contract';
import {
  WORKSPACE_INTELLIGENCE_SUBCOMMANDS,
  WORKSPACE_SUBCOMMANDS,
} from '../../utils/workspace-command-surface';

type RuntimeSurfaceContract = {
  schemaVersion: string;
  lifecycleCommands: string[];
  coreProjectCommands: string[];
  workspaceSubcommands: string[];
  workspaceIntelligenceSubcommands: string[];
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
        ...(contract.coreProjectCommands ?? []),
        ...contract.moduleMutationCommands,
        ...contract.globalCommands,
      ])
    );
  });

  it('publishes the canonical workspace command surface for IDE/CI capability detection', () => {
    const contract = readContract();

    expect(contract.workspaceSubcommands).toEqual([...WORKSPACE_SUBCOMMANDS]);
    expect(contract.workspaceIntelligenceSubcommands).toEqual([
      ...WORKSPACE_INTELLIGENCE_SUBCOMMANDS,
    ]);

    // Intelligence subcommands must be a subset of the full workspace surface so
    // consumers can gate the intelligence chain without regex-parsing --help.
    for (const subcommand of contract.workspaceIntelligenceSubcommands) {
      expect(contract.workspaceSubcommands).toContain(subcommand);
    }
    expect(contract.workspaceIntelligenceSubcommands).toEqual(
      expect.arrayContaining(['explain', 'why', 'trace'])
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

  it('keeps npm and rapidkit-vscode runtime surfaces semantically aligned', () => {
    const npmContractPath = path.resolve(
      process.cwd(),
      'contracts',
      'runtime-command-surface.v1.json'
    );
    const extensionContractPath = path.resolve(
      process.cwd(),
      '..',
      'rapidkit-vscode',
      'contracts',
      'runtime-command-surface.v1.json'
    );

    if (!fs.existsSync(npmContractPath) || !fs.existsSync(extensionContractPath)) {
      return;
    }

    const npmContract = JSON.parse(
      fs.readFileSync(npmContractPath, 'utf8')
    ) as RuntimeSurfaceContract;
    const extensionContract = JSON.parse(
      fs.readFileSync(extensionContractPath, 'utf8')
    ) as RuntimeSurfaceContract;

    expect(npmContract).toEqual(extensionContract);
  });

  it('keeps module marketplace support restricted to first-class Core-backed frameworks', () => {
    const contract = readContract();
    const generated = buildRuntimeCommandSurfaceContract();

    expect(contract.moduleSuggestionFrameworks).toEqual(generated.moduleSuggestionFrameworks);
    expect(contract.moduleUnsupportedFrameworks).toEqual(generated.moduleUnsupportedFrameworks);
  });

  it('keeps official frontend generators in the canonical scaffold surface', () => {
    const contract = readContract();
    const frontendKits = listFrontendGenerators().map((definition) => definition.kitId);

    expect(contract.scaffoldKits).toEqual(expect.arrayContaining(frontendKits));
  });
});
