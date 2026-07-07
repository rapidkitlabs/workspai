import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkForUpdates, getVersion, __testables } from '../update-checker.js';
import { execa } from 'execa';

// Mock execa
vi.mock('execa');

describe('Update Checker', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    // Clear on-disk cache so each test starts from a clean state
    await __testables.clearUpdateCache();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('getVersion', () => {
    it('should return the current package version', () => {
      const version = getVersion();
      expect(version).toBeDefined();
      expect(typeof version).toBe('string');
      expect(version).toMatch(/^\d+\.\d+\.\d+/); // Semver format
    });
  });

  describe('checkForUpdates', () => {
    it('should notify when a newer version is available', async () => {
      const _currentVersion = getVersion();
      const newerVersion = '99.99.99';

      vi.mocked(execa).mockResolvedValue({
        stdout: newerVersion,
        stderr: '',
        exitCode: 0,
        command: '',
        failed: false,
        killed: false,
        signal: undefined,
        signalDescription: undefined,
        cwd: '',
        durationMs: 0,
        isCanceled: false,
        escapedCommand: '',
        pipedFrom: [],
        all: undefined,
      });

      await checkForUpdates();

      expect(execa).toHaveBeenCalledWith('npm', ['view', 'workspai', 'version'], {
        timeout: 3000,
      });
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Update available'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(newerVersion));
    });

    it('should not notify when on latest version', async () => {
      const currentVersion = getVersion();

      vi.mocked(execa).mockResolvedValue({
        stdout: currentVersion,
        stderr: '',
        exitCode: 0,
        command: '',
        failed: false,
        killed: false,
        signal: undefined,
        signalDescription: undefined,
        cwd: '',
        durationMs: 0,
        isCanceled: false,
        escapedCommand: '',
        pipedFrom: [],
        all: undefined,
      });

      await checkForUpdates();

      expect(execa).toHaveBeenCalledWith('npm', ['view', 'workspai', 'version'], {
        timeout: 3000,
      });
      // Should not show update notification
      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Update available'));
    });

    it('should not notify when remote version is older', async () => {
      const olderVersion = '0.1.0';

      vi.mocked(execa).mockResolvedValue({
        stdout: olderVersion,
        stderr: '',
        exitCode: 0,
        command: '',
        failed: false,
        killed: false,
        signal: undefined,
        signalDescription: undefined,
        cwd: '',
        durationMs: 0,
        isCanceled: false,
        escapedCommand: '',
        pipedFrom: [],
        all: undefined,
      });

      await checkForUpdates();

      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Update available'));
    });

    it('should handle network errors gracefully', async () => {
      vi.mocked(execa).mockRejectedValue(new Error('Network error'));

      // Should not throw
      await expect(checkForUpdates()).resolves.not.toThrow();

      // Should not show error to user
      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('error'));
    });

    it('should handle timeout gracefully', async () => {
      vi.mocked(execa).mockRejectedValue(new Error('Timeout'));

      await expect(checkForUpdates()).resolves.not.toThrow();
    });

    it('should handle npm command not found gracefully', async () => {
      vi.mocked(execa).mockRejectedValue(new Error('Command not found: npm'));

      await expect(checkForUpdates()).resolves.not.toThrow();
    });

    it('should handle empty response gracefully', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
        command: '',
        failed: false,
        killed: false,
        signal: undefined,
        signalDescription: undefined,
        cwd: '',
        durationMs: 0,
        isCanceled: false,
        escapedCommand: '',
        pipedFrom: [],
        all: undefined,
      });

      await expect(checkForUpdates()).resolves.not.toThrow();
    });

    it('should handle prerelease versions correctly - alpha', async () => {
      const alphaVersion = '1.0.0-alpha.1';

      vi.mocked(execa).mockResolvedValue({
        stdout: alphaVersion,
        stderr: '',
        exitCode: 0,
        command: '',
        failed: false,
        killed: false,
        signal: undefined,
        signalDescription: undefined,
        cwd: '',
        durationMs: 0,
        isCanceled: false,
        escapedCommand: '',
        pipedFrom: [],
        all: undefined,
      });

      await checkForUpdates();

      // Alpha version 1.0.0-alpha.1 should be considered older than stable 0.18.0
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Update available'));
    });

    it('should handle prerelease versions correctly - beta', async () => {
      const betaVersion = '1.0.0-beta.2';

      vi.mocked(execa).mockResolvedValue({
        stdout: betaVersion,
        stderr: '',
        exitCode: 0,
        command: '',
        failed: false,
        killed: false,
        signal: undefined,
        signalDescription: undefined,
        cwd: '',
        durationMs: 0,
        isCanceled: false,
        escapedCommand: '',
        pipedFrom: [],
        all: undefined,
      });

      await checkForUpdates();

      // Beta version should be newer
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Update available'));
    });

    it('should handle prerelease versions correctly - rc', async () => {
      const rcVersion = '1.0.0-rc.1';

      vi.mocked(execa).mockResolvedValue({
        stdout: rcVersion,
        stderr: '',
        exitCode: 0,
        command: '',
        failed: false,
        killed: false,
        signal: undefined,
        signalDescription: undefined,
        cwd: '',
        durationMs: 0,
        isCanceled: false,
        escapedCommand: '',
        pipedFrom: [],
        all: undefined,
      });

      await checkForUpdates();

      // RC version should be newer
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Update available'));
    });

    it('should notify when newer prerelease version is available', async () => {
      const newerRc = '99.0.0-rc.5';

      vi.mocked(execa).mockResolvedValue({
        stdout: newerRc,
        stderr: '',
        exitCode: 0,
        command: '',
        failed: false,
        killed: false,
        signal: undefined,
        signalDescription: undefined,
        cwd: '',
        durationMs: 0,
        isCanceled: false,
        escapedCommand: '',
        pipedFrom: [],
        all: undefined,
      });

      await checkForUpdates();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Update available'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(newerRc));
    });

    it('should compare prerelease with different lengths correctly', async () => {
      const longerPrerelease = '1.0.0-alpha.beta.gamma.1';

      vi.mocked(execa).mockResolvedValue({
        stdout: longerPrerelease,
        stderr: '',
        exitCode: 0,
        command: '',
        failed: false,
        killed: false,
        signal: undefined,
        signalDescription: undefined,
        cwd: '',
        durationMs: 0,
        isCanceled: false,
        escapedCommand: '',
        pipedFrom: [],
        all: undefined,
      });

      await checkForUpdates();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Update available'));
    });

    it('should compare numeric prerelease identifiers correctly', async () => {
      const numericPrerelease = '1.0.0-alpha.2';

      vi.mocked(execa).mockResolvedValue({
        stdout: numericPrerelease,
        stderr: '',
        exitCode: 0,
        command: '',
        failed: false,
        killed: false,
        signal: undefined,
        signalDescription: undefined,
        cwd: '',
        durationMs: 0,
        isCanceled: false,
        escapedCommand: '',
        pipedFrom: [],
        all: undefined,
      });

      await checkForUpdates();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Update available'));
    });

    it('should compare string prerelease identifiers correctly', async () => {
      const stringPrerelease = '1.0.0-beta';

      vi.mocked(execa).mockResolvedValue({
        stdout: stringPrerelease,
        stderr: '',
        exitCode: 0,
        command: '',
        failed: false,
        killed: false,
        signal: undefined,
        signalDescription: undefined,
        cwd: '',
        durationMs: 0,
        isCanceled: false,
        escapedCommand: '',
        pipedFrom: [],
        all: undefined,
      });

      await checkForUpdates();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Update available'));
    });

    it('should handle invalid version format gracefully', async () => {
      const invalidVersion = 'not-a-version';

      vi.mocked(execa).mockResolvedValue({
        stdout: invalidVersion,
        stderr: '',
        exitCode: 0,
        command: '',
        failed: false,
        killed: false,
        signal: undefined,
        signalDescription: undefined,
        cwd: '',
        durationMs: 0,
        isCanceled: false,
        escapedCommand: '',
        pipedFrom: [],
        all: undefined,
      });

      await expect(checkForUpdates()).resolves.not.toThrow();
      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Update available'));
    });

    it('should handle version with build metadata', async () => {
      const versionWithBuild = '0.18.0+build.123';

      vi.mocked(execa).mockResolvedValue({
        stdout: versionWithBuild,
        stderr: '',
        exitCode: 0,
        command: '',
        failed: false,
        killed: false,
        signal: undefined,
        signalDescription: undefined,
        cwd: '',
        durationMs: 0,
        isCanceled: false,
        escapedCommand: '',
        pipedFrom: [],
        all: undefined,
      });

      await expect(checkForUpdates()).resolves.not.toThrow();
    });

    it('should compare prerelease identifiers with mixed types', async () => {
      const mixedPrerelease = '99.0.0-alpha.beta.1';

      vi.mocked(execa).mockResolvedValue({
        stdout: mixedPrerelease,
        stderr: '',
        exitCode: 0,
        command: '',
        failed: false,
        killed: false,
        signal: undefined,
        signalDescription: undefined,
        cwd: '',
        durationMs: 0,
        isCanceled: false,
        escapedCommand: '',
        pipedFrom: [],
        all: undefined,
      });

      await checkForUpdates();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Update available'));
    });

    it('should handle whitespace in version response', async () => {
      const versionWithWhitespace = '  99.99.99  \n';

      vi.mocked(execa).mockResolvedValue({
        stdout: versionWithWhitespace,
        stderr: '',
        exitCode: 0,
        command: '',
        failed: false,
        killed: false,
        signal: undefined,
        signalDescription: undefined,
        cwd: '',
        durationMs: 0,
        isCanceled: false,
        escapedCommand: '',
        pipedFrom: [],
        all: undefined,
      });

      await checkForUpdates();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Update available'));
    });
  });

  describe('__testables.compareVersions', () => {
    it('returns 0 for invalid left version', () => {
      expect(__testables.compareVersions('invalid', '1.2.3')).toBe(0);
    });

    it('returns 0 for invalid right version', () => {
      expect(__testables.compareVersions('1.2.3', 'invalid')).toBe(0);
    });

    it('returns 0 for same stable version', () => {
      expect(__testables.compareVersions('1.2.3', '1.2.3')).toBe(0);
    });

    it('compares major/minor/patch correctly', () => {
      expect(__testables.compareVersions('2.0.0', '1.9.9')).toBe(1);
      expect(__testables.compareVersions('1.4.0', '1.5.0')).toBe(-1);
      expect(__testables.compareVersions('1.5.2', '1.5.1')).toBe(1);
    });

    it('treats stable as newer than prerelease', () => {
      expect(__testables.compareVersions('1.2.3', '1.2.3-rc.1')).toBe(1);
      expect(__testables.compareVersions('1.2.3-rc.1', '1.2.3')).toBe(-1);
    });

    it('compares prerelease length boundaries', () => {
      expect(__testables.compareVersions('1.2.3-alpha', '1.2.3-alpha.1')).toBe(-1);
      expect(__testables.compareVersions('1.2.3-alpha.1', '1.2.3-alpha')).toBe(1);
    });

    it('compares prerelease numeric and string identifiers', () => {
      expect(__testables.compareVersions('1.2.3-alpha.2', '1.2.3-alpha.1')).toBe(1);
      expect(__testables.compareVersions('1.2.3-alpha.1', '1.2.3-alpha.beta')).toBe(-1);
      expect(__testables.compareVersions('1.2.3-beta.alpha', '1.2.3-beta.1')).toBe(1);
    });
  });

  describe('__testables.parseVersion', () => {
    it('returns parsed semver for valid input', () => {
      expect(__testables.parseVersion('1.2.3-alpha.1+build.7')).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: ['alpha', 1],
      });
    });

    it('returns null for invalid semver input', () => {
      expect(__testables.parseVersion('v1.2.3')).toBeNull();
      expect(__testables.parseVersion('1.2')).toBeNull();
    });
  });
});
