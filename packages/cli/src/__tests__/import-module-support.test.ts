import { describe, expect, it } from 'vitest';

import { resolveImportModuleSupport } from '../utils/import-module-support';

describe('resolveImportModuleSupport', () => {
  it('keeps existing module_support for RapidKit module-enabled kits', () => {
    expect(
      resolveImportModuleSupport({
        existingProjectJson: { kit_name: 'fastapi.standard', module_support: true },
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

  it('does not keep standalone module_support without a RapidKit module-enabled kit', () => {
    expect(
      resolveImportModuleSupport({
        existingProjectJson: { runtime: 'python', framework: 'fastapi', module_support: true },
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
    ).toBe(false);
  });

  it('does not enable module support for arbitrary first-class framework projects', () => {
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
    ).toBe(false);
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
