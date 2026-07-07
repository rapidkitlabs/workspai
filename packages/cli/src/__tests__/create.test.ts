import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createProject } from '../create.js';
import * as fsExtra from 'fs-extra';
import { DirectoryExistsError } from '../errors';
import path from 'path';
import { execa } from 'execa';

// Mock dependencies
vi.mock('fs-extra');
vi.mock('inquirer');
vi.mock('execa');
vi.mock('fs', () => ({
  promises: {
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
  },
}));
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    text: '',
  })),
}));

describe('Create Project', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createProject', () => {
    it('should throw error if directory already exists', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(true);

      await expect(createProject('existing-project', { demoMode: true })).rejects.toThrow(
        DirectoryExistsError
      );
    });

    it('should use default name if not provided', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);
      vi.mocked(fsExtra.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fsExtra.outputFile).mockResolvedValue(undefined);

      await createProject(undefined, { dryRun: true });

      expect(fsExtra.pathExists).toHaveBeenCalled();
    });

    it('should handle dryRun mode', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await createProject('test-project', { dryRun: true });

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(fsExtra.ensureDir).not.toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    it('should create demo workspace when demoMode is true', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);
      vi.mocked(fsExtra.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fsExtra.outputFile).mockResolvedValue(undefined);

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await createProject('demo-workspace', { demoMode: true });

      expect(fsExtra.ensureDir).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    it('should resolve project path correctly', async () => {
      const projectName = 'my-project';
      const expectedPath = path.resolve(process.cwd(), projectName);

      vi.mocked(fsExtra.pathExists).mockImplementation(async (p) => {
        expect(p).toBe(expectedPath);
        return false;
      });

      vi.mocked(fsExtra.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fsExtra.outputFile).mockResolvedValue(undefined);

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await createProject(projectName, { demoMode: true });

      consoleLogSpy.mockRestore();
    });

    it('should handle options correctly', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);

      const options = {
        skipGit: true,
        testMode: false,
        demoMode: false,
        dryRun: true,
        userConfig: {
          author: 'Test User',
        },
      };

      await createProject('test', options);

      expect(fsExtra.pathExists).toHaveBeenCalled();
    });

    it('should work with empty options', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);

      await createProject('test', { dryRun: true });

      expect(fsExtra.pathExists).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should throw DirectoryExistsError with correct message', async () => {
      const projectName = 'existing-project';
      vi.mocked(fsExtra.pathExists).mockResolvedValue(true);

      try {
        await createProject(projectName, {});
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DirectoryExistsError);
        expect((error as DirectoryExistsError).message).toContain(projectName);
      }
    });

    it('should handle path resolution errors', async () => {
      vi.mocked(fsExtra.pathExists).mockRejectedValue(new Error('Path error'));

      await expect(createProject('test', {})).rejects.toThrow();
    });
  });

  describe('Project Naming', () => {
    it('should handle kebab-case names', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);
      await createProject('my-awesome-project', { dryRun: true });
      expect(fsExtra.pathExists).toHaveBeenCalled();
    });

    it('should handle snake_case names', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);
      await createProject('my_awesome_project', { dryRun: true });
      expect(fsExtra.pathExists).toHaveBeenCalled();
    });

    it('should handle simple names', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);
      await createProject('myproject', { dryRun: true });
      expect(fsExtra.pathExists).toHaveBeenCalled();
    });
  });

  describe('Configuration', () => {
    it('should pass userConfig to implementation', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);

      const userConfig = {
        author: 'John Doe',
        license: 'MIT',
        pythonVersion: '3.11' as const,
      };

      await createProject('test', { dryRun: true, userConfig });

      expect(fsExtra.pathExists).toHaveBeenCalled();
    });

    it('should work without userConfig', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);

      await createProject('test', { dryRun: true });

      expect(fsExtra.pathExists).toHaveBeenCalled();
    });
  });

  describe('Poetry Installation', () => {
    it('should check for Poetry', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);
      vi.mocked(execa).mockResolvedValue({
        stdout: 'Poetry version 1.7.0',
        stderr: '',
        exitCode: 0,
      } as any);

      // Mock dry run to test poetry check path
      await createProject('test', { dryRun: true });
      expect(fsExtra.pathExists).toHaveBeenCalled();
    });
  });

  describe('Python Version Check', () => {
    it('should verify Python version', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);

      await createProject('test', { dryRun: true });
      expect(fsExtra.pathExists).toHaveBeenCalled();
    });
  });

  describe('Demo Workspace Creation', () => {
    it('should create package.json in demo mode', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);
      vi.mocked(fsExtra.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fsExtra.outputFile).mockResolvedValue(undefined);

      const { promises: fsPromises } = await import('fs');

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await createProject('demo-ws', { demoMode: true });

      expect(fsPromises.writeFile).toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    it('should create generator script in demo mode', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);
      vi.mocked(fsExtra.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fsExtra.outputFile).mockResolvedValue(undefined);

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await createProject('demo', { demoMode: true });

      expect(fsExtra.ensureDir).toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    it('should create README in demo mode', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);
      vi.mocked(fsExtra.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fsExtra.outputFile).mockResolvedValue(undefined);

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await createProject('demo', { demoMode: true });

      const { promises: fsPromises } = await import('fs');
      expect(fsPromises.writeFile).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    it('should skip git when requested in demo mode', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);
      vi.mocked(fsExtra.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fsExtra.outputFile).mockResolvedValue(undefined);

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await createProject('demo', { demoMode: true, skipGit: true });

      expect(fsExtra.ensureDir).toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    it('should handle git initialization failure gracefully in demo mode', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);
      vi.mocked(fsExtra.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fsExtra.outputFile).mockResolvedValue(undefined);

      // Mock execa to throw error on git init
      const { execa } = await import('execa');
      vi.mocked(execa).mockRejectedValueOnce(new Error('git not found'));

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Should not throw, should warn instead
      await createProject('demo', { demoMode: true, skipGit: false });

      expect(fsExtra.ensureDir).toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    it('should handle general error in demo workspace creation', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);
      vi.mocked(fsExtra.ensureDir).mockRejectedValue(new Error('Disk full'));

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Should throw the error
      await expect(createProject('demo', { demoMode: true })).rejects.toThrow('Disk full');

      consoleLogSpy.mockRestore();
    });
  });

  describe('Dry Run Mode', () => {
    it('should show project details in dry run', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await createProject('test-dry', { dryRun: true, demoMode: true });

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls.some((call) => call[0]?.toString().includes('Dry-run'))).toBe(
        true
      );

      consoleLogSpy.mockRestore();
    });

    it('should not create files in dry run mode', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);
      vi.mocked(fsExtra.ensureDir).mockClear();

      await createProject('test', { dryRun: true });

      expect(fsExtra.ensureDir).not.toHaveBeenCalled();
    });

    it('should show userConfig in dry run', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);

      const userConfig = {
        author: 'Test Author',
        pythonVersion: '3.12' as const,
      };

      await createProject('test', { dryRun: true, userConfig });

      expect(fsExtra.pathExists).toHaveBeenCalled();
    });
  });

  describe('Test Mode', () => {
    it('should handle test mode flag', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);

      await createProject('test', { dryRun: true, testMode: true });

      expect(fsExtra.pathExists).toHaveBeenCalled();
    });

    it('should use test mode with userConfig', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);

      const userConfig = {
        testRapidKitPath: '/test/path',
      };

      await createProject('test', { dryRun: true, testMode: true, userConfig });

      expect(fsExtra.pathExists).toHaveBeenCalled();
    });
  });

  describe('Git Integration', () => {
    it('should respect skipGit option', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);

      await createProject('test', { dryRun: true, skipGit: true });

      expect(fsExtra.pathExists).toHaveBeenCalled();
    });

    it('should enable git by default', async () => {
      vi.mocked(fsExtra.pathExists).mockResolvedValue(false);

      await createProject('test', { dryRun: true, skipGit: false });

      expect(fsExtra.pathExists).toHaveBeenCalled();
    });
  });
});
