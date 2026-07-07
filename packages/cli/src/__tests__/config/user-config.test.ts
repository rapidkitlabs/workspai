import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import {
  setUserConfig,
  getOpenAIKey,
  isAIEnabled,
  getConfigPath,
  getUserConfig,
} from '../../config/user-config.js';

describe('User Config', () => {
  const originalEnv = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore original env
    if (originalEnv) {
      process.env.OPENAI_API_KEY = originalEnv;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  describe('getConfigPath', () => {
    it('should return config file path', () => {
      const configPath = getConfigPath();
      expect(configPath).toBeDefined();
      expect(configPath).toContain('.workspairc.json');
    });
  });

  describe('getUserConfig', () => {
    it('should return empty config if file does not exist', () => {
      // Mock fs.existsSync to return false
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = getUserConfig();
      expect(config).toEqual({});
    });

    it('should return parsed config if file exists', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ openaiApiKey: 'test-key', aiEnabled: true })
      );

      const config = getUserConfig();
      expect(config).toEqual({
        openaiApiKey: 'test-key',
        aiEnabled: true,
      });
    });

    it('should return empty config on parse error', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('invalid json{');

      const config = getUserConfig();
      expect(config).toEqual({});
    });

    it('should return empty config on read error', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('Read error');
      });

      const config = getUserConfig();
      expect(config).toEqual({});
    });
  });

  describe('setUserConfig', () => {
    it('should write config even when file does not exist', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      vi.spyOn(fs, 'readFileSync').mockReturnValue('{}');

      setUserConfig({ openaiApiKey: 'test-key' });

      expect(writeSpy).toHaveBeenCalled();
    });

    it('should write config to file', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('{}');
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      setUserConfig({ openaiApiKey: 'test-key', aiEnabled: true });

      expect(writeSpy).toHaveBeenCalled();
      const writeCall = writeSpy.mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData).toEqual({
        openaiApiKey: 'test-key',
        aiEnabled: true,
      });
    });

    it('should merge with existing config', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ openaiApiKey: 'test-key' }));
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      setUserConfig({ aiEnabled: false });

      const writeCall = writeSpy.mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData).toEqual({
        openaiApiKey: 'test-key',
        aiEnabled: false,
      });
    });

    it('should overwrite existing fields', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ openaiApiKey: 'old-key' }));
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      setUserConfig({ openaiApiKey: 'new-key' });

      const writeCall = writeSpy.mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.openaiApiKey).toBe('new-key');
    });
  });

  describe('getOpenAIKey', () => {
    it('should return null if no key is configured', () => {
      delete process.env.OPENAI_API_KEY;
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const key = getOpenAIKey();
      expect(key).toBeNull();
    });

    it('should return key from environment variable', () => {
      process.env.OPENAI_API_KEY = 'env-key';
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const key = getOpenAIKey();
      expect(key).toBe('env-key');
    });

    it('should return key from config file', () => {
      delete process.env.OPENAI_API_KEY;
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ openaiApiKey: 'config-key' }));

      const key = getOpenAIKey();
      expect(key).toBe('config-key');
    });

    it('should prioritize environment variable over config file', () => {
      process.env.OPENAI_API_KEY = 'env-key';
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ openaiApiKey: 'config-key' }));

      const key = getOpenAIKey();
      expect(key).toBe('env-key');
    });
  });

  describe('isAIEnabled', () => {
    it('should return true by default', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const enabled = isAIEnabled();
      expect(enabled).toBe(true);
    });

    it('should return true if explicitly enabled', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ aiEnabled: true }));

      const enabled = isAIEnabled();
      expect(enabled).toBe(true);
    });

    it('should return false if explicitly disabled', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ aiEnabled: false }));

      const enabled = isAIEnabled();
      expect(enabled).toBe(false);
    });
  });
});
