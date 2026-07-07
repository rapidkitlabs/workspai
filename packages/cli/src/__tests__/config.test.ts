import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadUserConfig, saveUserConfig, getTestRapidKitPath } from '../config.js';
import type { UserConfig } from '../config.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.WORKSPAI_DEV_PATH;
    delete process.env.RAPIDKIT_DEV_PATH;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadUserConfig', () => {
    it('should load config from file', async () => {
      const mockConfig: UserConfig = {
        defaultKit: 'fastapi.standard',
        defaultInstallMethod: 'poetry',
        author: 'Test User',
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const result = await loadUserConfig();

      expect(result).toEqual(mockConfig);
      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(os.homedir(), '.workspairc.json'),
        'utf-8'
      );
    });

    it('should return empty config if file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT: file not found'));

      const result = await loadUserConfig();

      expect(result).toEqual({});
    });

    it('should return empty config if JSON is invalid', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid json {{{');

      const result = await loadUserConfig();

      expect(result).toEqual({});
    });

    it('should handle various config options', async () => {
      const mockConfig: UserConfig = {
        defaultKit: 'nestjs.advanced',
        defaultInstallMethod: 'pipx',
        pythonVersion: '3.12',
        author: 'Jane Doe',
        license: 'Apache-2.0',
        skipGit: true,
        testRapidKitPath: '/custom/path',
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const result = await loadUserConfig();

      expect(result).toEqual(mockConfig);
      expect(result.pythonVersion).toBe('3.12');
      expect(result.skipGit).toBe(true);
    });
  });

  describe('saveUserConfig', () => {
    it('should save config to file', async () => {
      const config: UserConfig = {
        defaultKit: 'fastapi.advanced',
        author: 'Test Author',
      };

      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await saveUserConfig(config);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(os.homedir(), '.workspairc.json'),
        JSON.stringify(config, null, 2),
        'utf-8'
      );
    });

    it('should handle write errors gracefully', async () => {
      const config: UserConfig = { author: 'Test' };

      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Permission denied'));

      await expect(saveUserConfig(config)).resolves.not.toThrow();
    });

    it('should save all config properties', async () => {
      const config: UserConfig = {
        defaultKit: 'fastapi.standard',
        defaultInstallMethod: 'venv',
        pythonVersion: '3.11',
        author: 'John Doe',
        license: 'MIT',
        skipGit: false,
        testRapidKitPath: '/dev/rapidkit',
      };

      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await saveUserConfig(config);

      const savedContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      const parsed = JSON.parse(savedContent);

      expect(parsed).toEqual(config);
    });
  });

  describe('getTestRapidKitPath', () => {
    it('should return Workspai environment variable if set', () => {
      process.env.WORKSPAI_DEV_PATH = '/test/workspai/path';
      const config: UserConfig = { testRapidKitPath: '/test/config/path' };

      const result = getTestRapidKitPath(config);
      expect(result).toBe('/test/workspai/path');
    });

    it('should prefer Workspai environment variable over legacy env', () => {
      process.env.WORKSPAI_DEV_PATH = '/priority/workspai';
      process.env.RAPIDKIT_DEV_PATH = '/priority/legacy';
      const config: UserConfig = { testRapidKitPath: '/priority/config' };

      const result = getTestRapidKitPath(config);
      expect(result).toBe('/priority/workspai');
    });

    it('should return legacy environment variable if set', () => {
      process.env.RAPIDKIT_DEV_PATH = '/test/env/path';
      const config: UserConfig = { testRapidKitPath: '/test/config/path' };

      const result = getTestRapidKitPath(config);
      expect(result).toBe('/test/env/path');
    });

    it('should return config path if env is not set', () => {
      delete process.env.RAPIDKIT_DEV_PATH;
      const config: UserConfig = { testRapidKitPath: '/test/config/path' };

      const result = getTestRapidKitPath(config);
      expect(result).toBe('/test/config/path');
    });

    it('should return undefined if neither is set', () => {
      delete process.env.RAPIDKIT_DEV_PATH;
      const config: UserConfig = {};

      const result = getTestRapidKitPath(config);
      expect(result).toBeUndefined();
    });

    it('should prioritize env over config', () => {
      process.env.RAPIDKIT_DEV_PATH = '/priority/env';
      const config: UserConfig = { testRapidKitPath: '/priority/config' };

      const result = getTestRapidKitPath(config);
      expect(result).toBe('/priority/env');
    });

    it('should handle empty string in env', () => {
      process.env.RAPIDKIT_DEV_PATH = '';
      const config: UserConfig = { testRapidKitPath: '/config/path' };

      const result = getTestRapidKitPath(config);
      // Empty string is falsy in OR operator, so it falls through to config
      expect(result).toBe('/config/path');
    });
  });
});
