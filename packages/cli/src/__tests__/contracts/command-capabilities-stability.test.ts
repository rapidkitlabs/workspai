import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  getGlobalCommandCapabilities,
  getPublishedContractCatalog,
  getPublishedContractVersions,
  getVersionContract,
} from '../../index';
import { buildRuntimeCommandSurfaceContract } from '../../contracts/runtime-command-surface-contract';
import {
  WORKSPACE_INTELLIGENCE_SUBCOMMANDS,
  WORKSPACE_SUBCOMMANDS,
} from '../../utils/workspace-command-surface';

type RuntimeSurfaceContract = {
  workspaceSubcommands: string[];
  workspaceIntelligenceSubcommands: string[];
};

function readOnDiskRuntimeSurface(): RuntimeSurfaceContract | null {
  const candidates = [
    path.resolve(process.cwd(), 'contracts', 'runtime-command-surface.v1.json'),
    path.resolve(process.cwd(), '..', 'contracts', 'runtime-command-surface.v1.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, 'utf8')) as RuntimeSurfaceContract;
    }
  }
  return null;
}

describe('rapidkit commands --json stability contract (1.1)', () => {
  it('pins the stable top-level shape consumers depend on', () => {
    const capabilities = getGlobalCommandCapabilities();

    expect(capabilities.schemaVersion).toBe('rapidkit-command-capabilities-v1');
    expect(capabilities.scope).toBe('global');
    expect(capabilities.cli).toBe('workspai');
    expect(typeof capabilities.version).toBe('string');

    // The top-level key set is part of the contract; new keys are additive but
    // the documented surface must never silently lose a field.
    for (const key of [
      'schemaVersion',
      'scope',
      'cli',
      'version',
      'cwd',
      'contracts',
      'contractCatalog',
      'commands',
      'workspace',
      'commandMap',
    ]) {
      expect(Object.keys(capabilities), key).toContain(key);
    }

    // commands block shape.
    for (const key of ['npmOwned', 'coreBacked', 'projectScoped']) {
      expect(Object.keys(capabilities.commands), key).toContain(key);
    }

    // workspace block shape.
    expect(capabilities.workspace.command).toBe('workspace');
    expect(Array.isArray(capabilities.workspace.subcommands)).toBe(true);
    expect(Array.isArray(capabilities.workspace.intelligenceSubcommands)).toBe(true);
  });

  it('advertises the versioned contracts it publishes (discoverable, not hard-coded)', () => {
    const capabilities = getGlobalCommandCapabilities();

    expect(capabilities.contracts).toEqual(getPublishedContractVersions());
    expect(capabilities.contractCatalog).toEqual(getPublishedContractCatalog());
    // The advertised runtime-command-surface version must match the real one so
    // consumers can trust the capability surface aligns with the contract file.
    expect(capabilities.contracts.runtimeCommandSurface).toBe(
      'rapidkit-runtime-command-surface-v1'
    );
    expect(capabilities.contracts.workspaceIntelligenceArchitecture).toBe(
      'workspai-workspace-intelligence-architecture-v1'
    );
  });

  it('resolves every published standalone contract to a canonical file', () => {
    for (const [id, descriptor] of Object.entries(getPublishedContractCatalog())) {
      if (descriptor.contractPath) {
        expect(
          fs.existsSync(path.resolve(process.cwd(), descriptor.contractPath)),
          `${id} -> ${descriptor.contractPath}`
        ).toBe(true);
      }
      for (const [artifactId, artifact] of Object.entries(descriptor.artifacts ?? {})) {
        if (!artifact.contractPath) continue;
        expect(
          fs.existsSync(path.resolve(process.cwd(), artifact.contractPath)),
          `${id}.${artifactId} -> ${artifact.contractPath}`
        ).toBe(true);
      }
    }
  });

  it('keeps the workspace capability surface aligned with runtime-command-surface.v1', () => {
    const capabilities = getGlobalCommandCapabilities();
    const generated = buildRuntimeCommandSurfaceContract();

    // commands --json and the generated contract derive from the same source of
    // truth; pin that they never diverge.
    expect(capabilities.workspace.subcommands).toEqual(generated.workspaceSubcommands);
    expect(capabilities.workspace.intelligenceSubcommands).toEqual(
      generated.workspaceIntelligenceSubcommands
    );
    expect(capabilities.workspace.subcommands).toEqual([...WORKSPACE_SUBCOMMANDS]);
    expect(capabilities.workspace.intelligenceSubcommands).toEqual([
      ...WORKSPACE_INTELLIGENCE_SUBCOMMANDS,
    ]);

    // Intelligence chain is a strict subset of the full workspace surface.
    for (const subcommand of capabilities.workspace.intelligenceSubcommands) {
      expect(capabilities.workspace.subcommands, subcommand).toContain(subcommand);
    }
  });

  it('matches the published runtime-command-surface.v1.json on disk when present', () => {
    const onDisk = readOnDiskRuntimeSurface();
    if (!onDisk) {
      return;
    }
    const capabilities = getGlobalCommandCapabilities();
    expect(capabilities.workspace.subcommands).toEqual(onDisk.workspaceSubcommands);
    expect(capabilities.workspace.intelligenceSubcommands).toEqual(
      onDisk.workspaceIntelligenceSubcommands
    );
  });

  it('does not advertise a standalone skills generate command (Phase 4.26)', () => {
    const capabilities = getGlobalCommandCapabilities();
    expect(capabilities.workspace.subcommands).not.toContain('skills');
  });
});

describe('rapidkit --version --json contract (1.2)', () => {
  it('pins the version contract shape the extension version gate consumes', () => {
    const contract = getVersionContract();

    expect(contract.schemaVersion).toBe('rapidkit-version-v1');
    expect(contract.cli).toBe('workspai');
    expect(typeof contract.version).toBe('string');
    expect(contract.version.length).toBeGreaterThan(0);
    expect(contract.node).toBe(process.version);
    expect(contract.platform).toBe(process.platform);
    expect(contract.capabilitiesSchemaVersion).toBe('rapidkit-command-capabilities-v1');

    for (const key of [
      'schemaVersion',
      'cli',
      'version',
      'node',
      'platform',
      'capabilitiesSchemaVersion',
      'contracts',
      'contractCatalog',
    ]) {
      expect(Object.keys(contract), key).toContain(key);
    }
  });

  it('advertises the same published contract versions as commands --json (no divergence)', () => {
    const versionContract = getVersionContract();
    const capabilities = getGlobalCommandCapabilities();

    expect(versionContract.contracts).toEqual(getPublishedContractVersions());
    expect(versionContract.contracts.workspaceIntelligenceArchitecture).toBe(
      'workspai-workspace-intelligence-architecture-v1'
    );
    // Both top-level machine-readable surfaces must publish identical contract
    // versions so a consumer can trust either entry point.
    expect(versionContract.contracts).toEqual(capabilities.contracts);
    expect(versionContract.contractCatalog).toEqual(capabilities.contractCatalog);
  });
});
