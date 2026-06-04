import { describe, expect, it } from 'vitest';

import {
  KIT_REGISTRY,
  isNpmBackedKit,
  listInteractiveKits,
  normalizeKitId,
  resolveKitDefinition,
} from '../utils/kit-registry';
import { getRuntimeAdapter, listRuntimeAdapters } from '../utils/runtime-adapters';

describe('kit registry and runtime adapters', () => {
  it('resolves aliases to canonical kit definitions', () => {
    expect(normalizeKitId('go')).toBe('gofiber.standard');
    expect(normalizeKitId('gin')).toBe('gogin.standard');
    expect(normalizeKitId('spring')).toBe('springboot.standard');
    expect(normalizeKitId('dotnet')).toBe('dotnet.webapi.clean');

    expect(isNpmBackedKit('dotnet.webapi.clean')).toBe(true);
    expect(isNpmBackedKit('fastapi.standard')).toBe(false);
  });

  it('keeps every interactive kit backed by an owner/runtime contract', () => {
    const interactiveKits = listInteractiveKits();
    expect(interactiveKits.length).toBeGreaterThanOrEqual(7);

    for (const kit of interactiveKits) {
      expect(kit.id).toMatch(/^[a-z0-9.-]+$/);
      expect(kit.label).toContain('—');
      expect(getRuntimeAdapter(kit.runtime)).toBeTruthy();
      if (kit.owner === 'npm') {
        expect(kit.generator).toBeTruthy();
        expect(kit.moduleSupport).toBe(false);
      }
    }
  });

  it('publishes runtime adapters for imported backend projects beyond first-class kits', () => {
    const runtimes = new Set(listRuntimeAdapters().map((adapter) => adapter.runtime));

    for (const runtime of ['dotnet', 'php', 'ruby', 'rust', 'elixir', 'kotlin']) {
      expect(runtimes.has(runtime as never)).toBe(true);
    }

    expect(resolveKitDefinition('aspnetcore')?.id).toBe('dotnet.webapi.clean');
    expect(KIT_REGISTRY.some((kit) => kit.id === 'dotnet.webapi.clean')).toBe(true);
  });
});
