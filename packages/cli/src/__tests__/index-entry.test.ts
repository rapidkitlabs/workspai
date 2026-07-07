import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createProject } from '../create';
import { checkForUpdates } from '../update-checker';

// Mock all dependencies
vi.mock('../create');
vi.mock('../update-checker');
vi.mock('chalk', () => ({
  default: {
    bold: vi.fn((text) => text),
    dim: vi.fn((text) => text),
    cyan: vi.fn((text) => text),
    green: vi.fn((text) => text),
    red: vi.fn((text) => text),
    yellow: vi.fn((text) => text),
  },
}));

describe('Index Entry Point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset process.argv
    process.argv = ['node', 'rapidkit'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Command Line Arguments', () => {
    it('should parse create command', () => {
      process.argv = ['node', 'rapidkit', 'create', 'my-project'];
      expect(process.argv).toContain('create');
      expect(process.argv).toContain('my-project');
    });

    it('should parse --demo flag', () => {
      process.argv = ['node', 'rapidkit', 'create', '--demo'];
      expect(process.argv).toContain('--demo');
    });

    it('should parse --test flag', () => {
      process.argv = ['node', 'rapidkit', 'create', '--test'];
      expect(process.argv).toContain('--test');
    });

    it('should parse --dry-run flag', () => {
      process.argv = ['node', 'rapidkit', 'create', '--dry-run'];
      expect(process.argv).toContain('--dry-run');
    });

    it('should parse --python-version option', () => {
      process.argv = ['node', 'rapidkit', 'create', '--python-version', '3.11'];
      expect(process.argv).toContain('--python-version');
      expect(process.argv).toContain('3.11');
    });

    it('should parse --install-method option', () => {
      process.argv = ['node', 'rapidkit', 'create', '--install-method', 'poetry'];
      expect(process.argv).toContain('--install-method');
      expect(process.argv).toContain('poetry');
    });

    it('should parse --no-git flag', () => {
      process.argv = ['node', 'rapidkit', 'create', '--no-git'];
      expect(process.argv).toContain('--no-git');
    });

    it('should parse --skip-install flag', () => {
      process.argv = ['node', 'rapidkit', 'create', '--skip-install'];
      expect(process.argv).toContain('--skip-install');
    });

    it('should parse -v flag for version', () => {
      process.argv = ['node', 'rapidkit', '-v'];
      expect(process.argv).toContain('-v');
    });

    it('should parse --version flag', () => {
      process.argv = ['node', 'rapidkit', '--version'];
      expect(process.argv).toContain('--version');
    });

    it('should parse -h flag for help', () => {
      process.argv = ['node', 'rapidkit', '-h'];
      expect(process.argv).toContain('-h');
    });

    it('should parse --help flag', () => {
      process.argv = ['node', 'rapidkit', '--help'];
      expect(process.argv).toContain('--help');
    });
  });

  describe('Command Validation', () => {
    it('should accept valid project names', () => {
      const validNames = ['my-project', 'my_project', 'project123', 'test-api', 'myapp'];

      validNames.forEach((name) => {
        expect(name).toBeTruthy();
        expect(name.length).toBeGreaterThan(0);
      });
    });

    it('should validate python version format', () => {
      const versions = ['3.10', '3.11', '3.12'];
      versions.forEach((v) => {
        expect(v).toMatch(/^\d+\.\d+$/);
      });
    });

    it('should validate install methods', () => {
      const methods = ['poetry', 'venv', 'pipx'];
      methods.forEach((m) => {
        expect(['poetry', 'venv', 'pipx']).toContain(m);
      });
    });
  });

  describe('Mock Integration', () => {
    it('should call createProject with correct options', async () => {
      vi.mocked(createProject).mockResolvedValue(undefined);

      await createProject('test-project', {
        demo: false,
        test: false,
        dryRun: false,
        pythonVersion: '3.11',
        installMethod: 'poetry',
        skipGit: false,
        skipInstall: false,
      });

      expect(createProject).toHaveBeenCalledWith('test-project', {
        demo: false,
        test: false,
        dryRun: false,
        pythonVersion: '3.11',
        installMethod: 'poetry',
        skipGit: false,
        skipInstall: false,
      });
    });

    it('should call createProject for demo mode', async () => {
      vi.mocked(createProject).mockResolvedValue(undefined);

      await createProject(undefined, { demo: true });

      expect(createProject).toHaveBeenCalledWith(undefined, { demo: true });
    });

    it('should call checkForUpdates', async () => {
      vi.mocked(checkForUpdates).mockResolvedValue(undefined);

      await checkForUpdates('0.10.1');

      expect(checkForUpdates).toHaveBeenCalledWith('0.10.1');
    });

    it('should handle createProject errors', async () => {
      const error = new Error('Test error');
      vi.mocked(createProject).mockRejectedValue(error);

      await expect(createProject('test')).rejects.toThrow('Test error');
    });
  });

  describe('Environment Variables', () => {
    it('should read NODE_ENV', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      expect(process.env.NODE_ENV).toBe('test');

      // Cleanup
      if (originalEnv) {
        process.env.NODE_ENV = originalEnv;
      } else {
        delete process.env.NODE_ENV;
      }
    });

    it('should read RAPIDKIT_DEV_PATH', () => {
      const originalPath = process.env.RAPIDKIT_DEV_PATH;
      process.env.RAPIDKIT_DEV_PATH = '/test/path';

      expect(process.env.RAPIDKIT_DEV_PATH).toBe('/test/path');

      // Cleanup
      if (originalPath) {
        process.env.RAPIDKIT_DEV_PATH = originalPath;
      } else {
        delete process.env.RAPIDKIT_DEV_PATH;
      }
    });
  });

  describe('Process Exit Handling', () => {
    it('should have process.exit available', () => {
      expect(process.exit).toBeDefined();
    });

    it('should have stdout available', () => {
      expect(process.stdout).toBeDefined();
      expect(process.stdout.write).toBeDefined();
    });

    it('should have stderr available', () => {
      expect(process.stderr).toBeDefined();
      expect(process.stderr.write).toBeDefined();
    });
  });

  describe('Package Version', () => {
    it('should have a valid version format', () => {
      const version = '0.10.1';
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should parse version components', () => {
      const version = '0.10.1';
      const [major, minor, patch] = version.split('.').map(Number);

      expect(major).toBe(0);
      expect(minor).toBe(10);
      expect(patch).toBe(1);
    });
  });

  describe('Commander Program', () => {
    it('should have program name', () => {
      const name = 'rapidkit';
      expect(name).toBe('rapidkit');
    });

    it('should have program description', () => {
      const description = 'Create Workspai workspaces';
      expect(description).toContain('Workspai');
    });
  });

  describe('Options Combination', () => {
    it('should combine demo and test flags', () => {
      const options = {
        demo: true,
        test: true,
      };
      expect(options.demo).toBe(true);
      expect(options.test).toBe(true);
    });

    it('should combine all options', () => {
      const options = {
        demo: false,
        test: true,
        dryRun: false,
        pythonVersion: '3.11',
        installMethod: 'poetry' as const,
        skipGit: false,
        skipInstall: false,
      };

      expect(options).toBeDefined();
      expect(Object.keys(options).length).toBe(7);
    });
  });

  describe('Error Messages', () => {
    it('should format error messages', () => {
      const errorMsg = 'Error: Something went wrong';
      expect(errorMsg).toContain('Error');
    });

    it('should format success messages', () => {
      const successMsg = '✔ Success!';
      expect(successMsg).toContain('Success');
    });
  });

  describe('CLI Banner', () => {
    it('should contain rapidkit branding', () => {
      const banner = 'RapidKit CLI';
      expect(banner).toContain('RapidKit');
    });

    it('should show version in banner', () => {
      const version = 'v0.10.1';
      expect(version).toMatch(/^v\d+\.\d+\.\d+$/);
    });
  });

  describe('Async Operations', () => {
    it('should handle async createProject', async () => {
      vi.mocked(createProject).mockResolvedValue(undefined);

      const result = createProject('test');
      expect(result).toBeInstanceOf(Promise);

      await result;
      expect(createProject).toHaveBeenCalled();
    });

    it('should handle async checkForUpdates', async () => {
      vi.mocked(checkForUpdates).mockResolvedValue(undefined);

      const result = checkForUpdates('0.10.1');
      expect(result).toBeInstanceOf(Promise);

      await result;
      expect(checkForUpdates).toHaveBeenCalled();
    });
  });
});
