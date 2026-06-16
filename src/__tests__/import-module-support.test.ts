import { describe, expect, it } from 'vitest';

import { resolveImportModuleSupport } from '../utils/import-module-support';

describe('resolveImportModuleSupport', () => {
  it('keeps existing module_support when already enabled', () => {
    expect(
      resolveImportModuleSupport({
        existingProjectJson: { module_support: true },
        detection: {
          key: 'fastapi',
          runtime: 'python',
          displayName: 'FastAPI',
          confidence: 'high',
          supportTier: 'first-class',
          importStack: 'python',
          source: 'project.json',
        },
        enableModules: false,
      })
    ).toBe(true);
  });

  it('enables module support for first-class runtimes when --enable-modules is set', () => {
    expect(
      resolveImportModuleSupport({
        existingProjectJson: null,
        detection: {
          key: 'fastapi',
          runtime: 'python',
          displayName: 'FastAPI',
          confidence: 'high',
          supportTier: 'first-class',
          importStack: 'python',
          source: 'manifest',
        },
        enableModules: true,
      })
    ).toBe(true);
  });

  it('does not enable module support for extended runtimes even with --enable-modules', () => {
    expect(
      resolveImportModuleSupport({
        existingProjectJson: null,
        detection: {
          key: 'gogin',
          runtime: 'go',
          displayName: 'Go Gin',
          confidence: 'high',
          supportTier: 'first-class',
          importStack: 'go',
          source: 'manifest',
        },
        enableModules: true,
      })
    ).toBe(false);
  });
});
