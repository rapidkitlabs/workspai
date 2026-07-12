import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import { buildExtensionCliCompatibilityContract } from '../../contracts/extension-cli-compatibility-contract';
import { buildAgentCustomizationPackContract } from '../../contracts/agent-customization-pack-contract';
import { buildCreatePlannerCapabilitiesContract } from '../../contracts/create-planner-capabilities-contract';
import { buildImportStackParitySnapshot } from '../../contracts/import-stack-parity-snapshot';
import { buildInfraStackContract } from '../../contracts/infra-stack-contract';
import { buildModuleLayoutContract } from '../../contracts/module-layout-contract';
import { buildProjectEntryCapabilityContract } from '../../contracts/project-entry-capability-contract';
import { buildRuntimeCommandSurfaceContract } from '../../contracts/runtime-command-surface-contract';
import { buildWorkspaceIntelligenceArchitectureContract } from '../../contracts/workspace-intelligence-architecture-contract';
import { buildWorkspaceIntelligenceChainContract } from '../../contracts/workspace-intelligence-chain-contract';

function readJsonContract(fileName: string): unknown {
  const contractPath = path.resolve(process.cwd(), 'contracts', fileName);
  return JSON.parse(fs.readFileSync(contractPath, 'utf8')) as unknown;
}

describe('generated shared contracts (Wave B + C)', () => {
  it('keeps committed runtime command surface aligned with the generator', () => {
    expect(readJsonContract('runtime-command-surface.v1.json')).toEqual(
      buildRuntimeCommandSurfaceContract()
    );
  });

  it('keeps committed create planner capabilities aligned with the generator', () => {
    expect(readJsonContract('create-planner-capabilities.v1.json')).toEqual(
      buildCreatePlannerCapabilitiesContract()
    );
  });

  it('keeps committed agent customization pack aligned with the generator', () => {
    expect(readJsonContract('agent-customization-pack.v1.json')).toEqual(
      buildAgentCustomizationPackContract()
    );
  });

  it('keeps committed import stack parity snapshot aligned with the generator', () => {
    expect(readJsonContract('backend-import-stack-parity.snapshot.json')).toEqual(
      buildImportStackParitySnapshot()
    );
  });

  it('keeps committed module layout contract aligned with the generator', () => {
    expect(readJsonContract('module-layout.v1.json')).toEqual(buildModuleLayoutContract());
  });

  it('keeps committed project entry capability aligned with the generator', () => {
    expect(readJsonContract('project-entry-capability.v1.json')).toEqual(
      buildProjectEntryCapabilityContract()
    );
  });

  it('keeps committed infra stack contract aligned with the generator', () => {
    expect(readJsonContract('infra-stack.v1.json')).toEqual(buildInfraStackContract());
  });

  it('keeps committed extension CLI compatibility aligned with npm package version', () => {
    expect(readJsonContract('extension-cli-compatibility.v1.json')).toEqual(
      buildExtensionCliCompatibilityContract()
    );
  });

  it('keeps committed workspace intelligence architecture aligned with the generator', () => {
    expect(readJsonContract('workspace-intelligence-architecture.v1.json')).toEqual(
      buildWorkspaceIntelligenceArchitectureContract()
    );
  });

  it('keeps committed workspace intelligence chain aligned with the generator', () => {
    expect(readJsonContract('workspace-intelligence-chain.v1.json')).toEqual(
      buildWorkspaceIntelligenceChainContract()
    );
  });
});
