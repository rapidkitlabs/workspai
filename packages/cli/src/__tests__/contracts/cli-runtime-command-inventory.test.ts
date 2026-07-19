import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { getGlobalCommandCapabilities } from '../../index';
import { buildRuntimeCommandSurfaceContract } from '../../contracts/runtime-command-surface-contract';
import {
  buildCliRuntimeCommandInventory,
  formatCliCommandSurfaceIntegrityError,
} from '../../utils/cli-command-surface';
import { assertJsonSchemaContract } from '../../utils/json-schema-contract';

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

describe('live CLI runtime command inventory', () => {
  it('proves every npm-owned root and Commander scoped command is declared', () => {
    const capabilities = getGlobalCommandCapabilities();
    const inventory = capabilities.runtimeInventory;

    expect(() =>
      assertJsonSchemaContract(
        capabilities,
        'contracts/command-capabilities.v1.json',
        'commands --json'
      )
    ).not.toThrow();

    expect(inventory.schemaVersion).toBe('workspai-cli-runtime-command-inventory-v1');
    expect(inventory.integrity).toEqual({
      ok: true,
      registeredButUndeclared: [],
      declaredButUnregistered: [],
      registeredScopedButUndeclared: [],
      declaredScopedButUnregistered: [],
    });

    const contract = buildRuntimeCommandSurfaceContract();
    expect(sorted(inventory.topLevelCommands)).toEqual(sorted(contract.npmOwnedTopLevelCommands));
    expect(
      sorted(
        inventory.commands
          .filter((entry) => entry.registrationKind === 'commander' && entry.path.length > 1)
          .map((entry) => entry.path.join(' '))
      )
    ).toEqual(sorted(contract.npmOwnedScopedCommands.map((entry) => entry.join(' '))));
  });

  it('detects a newly registered command before contracts or docs can silently omit it', () => {
    const fakeProgram = {
      name: () => 'workspai',
      commands: [
        {
          name: () => 'future-command',
          commands: [],
          options: [],
          registeredArguments: [],
        },
      ],
    };

    const inventory = buildCliRuntimeCommandInventory(fakeProgram);
    expect(inventory.integrity.ok).toBe(false);
    expect(inventory.integrity.registeredButUndeclared).toContain('future-command');
  });

  it('captures optional Commander metadata and renders every integrity mismatch class', () => {
    const fakeProgram = {
      name: () => 'workspai',
      commands: [
        {
          name: () => 'future-command',
          aliases: () => ['future'],
          description: () => 'Future command',
          _hidden: true,
          options: [{ flags: '--mode <mode>', attributeName: () => 'mode' }, { flags: '--raw' }],
          registeredArguments: [{ name: () => 'target', required: true, variadic: false }],
          commands: [{ name: () => 'child', commands: [] }],
        },
      ],
    };

    const inventory = buildCliRuntimeCommandInventory(fakeProgram);
    expect(inventory.commands.find((entry) => entry.command === 'future-command')).toMatchObject({
      aliases: ['future'],
      description: 'Future command',
      hidden: true,
      arguments: [{ name: 'target', required: true, variadic: false }],
      options: [
        { flags: '--mode <mode>', attributeName: 'mode' },
        { flags: '--raw', attributeName: null },
      ],
    });
    expect(formatCliCommandSurfaceIntegrityError(inventory.integrity)).toContain(
      'registered but undeclared: future-command'
    );
    expect(formatCliCommandSurfaceIntegrityError(inventory.integrity)).toContain(
      'declared but unreachable:'
    );
    expect(formatCliCommandSurfaceIntegrityError(inventory.integrity)).toContain(
      'registered scoped but undeclared: future-command child'
    );
    expect(formatCliCommandSurfaceIntegrityError(inventory.integrity)).toContain(
      'declared scoped but unreachable:'
    );
  });

  it('keeps the published runtime inventory snapshot aligned with the live Commander tree', () => {
    const snapshot = JSON.parse(
      readFileSync(
        path.resolve(process.cwd(), 'contracts/cli-runtime-command-inventory.v1.snapshot.json'),
        'utf8'
      )
    );
    expect(snapshot).toEqual(getGlobalCommandCapabilities().runtimeInventory);
    expect(
      snapshot.commands.every((entry: { description: string }) => entry.description.length > 0)
    ).toBe(true);
  });
});
