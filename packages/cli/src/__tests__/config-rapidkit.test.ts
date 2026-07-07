import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Config - RapidKitConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load rapidkit config from current directory', async () => {
    const { loadWorkspaiConfig, loadRapidKitConfig } = await import('../config.js');

    // Should return empty config if no file found
    const config = await loadWorkspaiConfig('/tmp/nonexistent-dir-test');
    expect(config).toBeDefined();
    expect(config).toEqual({});
    expect(loadRapidKitConfig).toBe(loadWorkspaiConfig);
  });

  it('should merge configs with correct priority', async () => {
    const { mergeConfigs } = await import('../config.js');

    const userConfig = {
      author: 'User Config Author',
      pythonVersion: '3.10' as const,
    };

    const rapidkitConfig = {
      workspace: {
        defaultAuthor: 'RapidKit Config Author',
        pythonVersion: '3.11' as const,
      },
    };

    const cliOptions = {
      author: 'CLI Author',
    };

    const merged = mergeConfigs(userConfig, rapidkitConfig, cliOptions);

    // CLI should take precedence
    expect(merged.author).toBe('CLI Author');
    // RapidKit config should override user config for pythonVersion
    expect(merged.pythonVersion).toBe('3.11');
  });

  it('should merge configs with empty rapidkit config', async () => {
    const { mergeConfigs } = await import('../config.js');

    const userConfig = {
      author: 'User Author',
      pythonVersion: '3.10' as const,
      defaultKit: 'fastapi.standard',
    };

    const merged = mergeConfigs(userConfig, {}, {});

    expect(merged.author).toBe('User Author');
    expect(merged.pythonVersion).toBe('3.10');
    expect(merged.defaultKit).toBe('fastapi.standard');
  });

  it('should handle all config options in merge', async () => {
    const { mergeConfigs } = await import('../config.js');

    const userConfig = {
      author: 'User',
      pythonVersion: '3.10' as const,
      defaultInstallMethod: 'poetry' as const,
      defaultKit: 'fastapi.standard',
      skipGit: false,
      license: 'MIT',
    };

    const rapidkitConfig = {
      workspace: {
        defaultAuthor: 'RapidKit',
        pythonVersion: '3.11' as const,
        installMethod: 'venv' as const,
      },
      projects: {
        defaultKit: 'nestjs.standard',
        skipGit: true,
      },
    };

    const cliOptions = {
      author: 'CLI',
    };

    const merged = mergeConfigs(userConfig, rapidkitConfig, cliOptions);

    expect(merged.author).toBe('CLI');
    expect(merged.pythonVersion).toBe('3.11');
    expect(merged.defaultInstallMethod).toBe('venv');
    expect(merged.defaultKit).toBe('nestjs.standard');
    expect(merged.skipGit).toBe(true);
    expect(merged.license).toBe('MIT');
  });
});
