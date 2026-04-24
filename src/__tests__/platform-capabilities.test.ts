import { describe, it, expect } from 'vitest';
import os from 'os';
import path from 'path';
import {
  detectPlatformKind,
  isWindowsPlatform,
  shouldUseShellExecution,
  getDefaultPythonCommand,
  getPythonCommandCandidates,
  getPythonVersionProbeCandidates,
  getVenvBinDirectory,
  getVenvPythonPath,
  getVenvRapidkitPath,
  getVenvActivateScriptPath,
  getRapidkitLocalScriptCandidates,
  getWorkspaceRegistryDirectory,
  getUserLocalBinCandidates,
} from '../utils/platform-capabilities.js';

describe('platform-capabilities', () => {
  describe('detectPlatformKind', () => {
    it('returns windows for win32', () => {
      expect(detectPlatformKind('win32')).toBe('windows');
    });

    it('returns linux for linux', () => {
      expect(detectPlatformKind('linux')).toBe('linux');
    });

    it('returns macos for darwin', () => {
      expect(detectPlatformKind('darwin')).toBe('macos');
    });

    it('returns other for unknown platform', () => {
      expect(detectPlatformKind('freebsd' as NodeJS.Platform)).toBe('other');
    });
  });

  describe('isWindowsPlatform / shouldUseShellExecution', () => {
    it('returns true on win32', () => {
      expect(isWindowsPlatform('win32')).toBe(true);
      expect(shouldUseShellExecution('win32')).toBe(true);
    });

    it('returns false on linux', () => {
      expect(isWindowsPlatform('linux')).toBe(false);
      expect(shouldUseShellExecution('linux')).toBe(false);
    });
  });

  describe('getDefaultPythonCommand', () => {
    it('returns python on windows', () => {
      expect(getDefaultPythonCommand('win32')).toBe('python');
    });

    it('returns python3 on linux', () => {
      expect(getDefaultPythonCommand('linux')).toBe('python3');
    });
  });

  describe('getPythonCommandCandidates', () => {
    it('returns windows candidates first on win32', () => {
      const candidates = getPythonCommandCandidates('win32');
      expect(candidates[0]).toBe('python');
      expect(candidates).toContain('py');
    });

    it('returns unix candidates first on linux', () => {
      const candidates = getPythonCommandCandidates('linux');
      expect(candidates[0]).toBe('python3');
    });
  });

  describe('getPythonVersionProbeCandidates', () => {
    it('returns py launcher probes on windows', () => {
      const probes = getPythonVersionProbeCandidates(14, 10, 'win32');
      const pyProbes = probes.filter((p) => p.command === 'py');
      expect(pyProbes.length).toBeGreaterThan(0);
      expect(pyProbes[0].args[0]).toMatch(/^-3\.\d+$/);
      // Last py probe: py -3 --version
      expect(probes.some((p) => p.command === 'py' && p.args[0] === '-3')).toBe(true);
      expect(probes.some((p) => p.command === 'python')).toBe(true);
    });

    it('returns versioned python3.N probes on linux', () => {
      const probes = getPythonVersionProbeCandidates(14, 10, 'linux');
      expect(probes[0].command).toBe('python3.14');
      expect(probes.some((p) => p.command === 'python3')).toBe(true);
      expect(probes.some((p) => p.command === 'python')).toBe(true);
    });
  });

  describe('getVenvBinDirectory', () => {
    it('returns Scripts directory on windows', () => {
      expect(getVenvBinDirectory('/venv', 'win32')).toBe(path.join('/venv', 'Scripts'));
    });

    it('returns bin directory on linux', () => {
      expect(getVenvBinDirectory('/venv', 'linux')).toBe(path.join('/venv', 'bin'));
    });
  });

  describe('getVenvPythonPath', () => {
    it('returns python.exe on windows', () => {
      expect(getVenvPythonPath('/venv', 'win32')).toBe(path.join('/venv', 'Scripts', 'python.exe'));
    });

    it('returns bin/python on linux', () => {
      expect(getVenvPythonPath('/venv', 'linux')).toBe(path.join('/venv', 'bin', 'python'));
    });
  });

  describe('getVenvRapidkitPath', () => {
    it('returns rapidkit.exe on windows', () => {
      expect(getVenvRapidkitPath('/venv', 'win32')).toBe(
        path.join('/venv', 'Scripts', 'rapidkit.exe')
      );
    });

    it('returns bin/rapidkit on linux', () => {
      expect(getVenvRapidkitPath('/venv', 'linux')).toBe(path.join('/venv', 'bin', 'rapidkit'));
    });
  });

  describe('getVenvActivateScriptPath', () => {
    it('returns Scripts/activate on windows', () => {
      expect(getVenvActivateScriptPath('/venv', 'win32')).toBe(
        path.join('/venv', 'Scripts', 'activate')
      );
    });

    it('returns bin/activate on linux', () => {
      expect(getVenvActivateScriptPath('/venv', 'linux')).toBe(
        path.join('/venv', 'bin', 'activate')
      );
    });
  });

  describe('getRapidkitLocalScriptCandidates', () => {
    it('returns .cmd paths on windows', () => {
      const candidates = getRapidkitLocalScriptCandidates('/project', 'win32');
      expect(candidates[0]).toBe(path.join('/project', 'rapidkit.cmd'));
      expect(candidates[1]).toBe(path.join('/project', '.rapidkit', 'rapidkit.cmd'));
    });

    it('returns unix paths on linux', () => {
      const candidates = getRapidkitLocalScriptCandidates('/project', 'linux');
      expect(candidates[0]).toBe(path.join('/project', 'rapidkit'));
      expect(candidates[1]).toBe(path.join('/project', '.rapidkit', 'rapidkit'));
    });
  });

  describe('getWorkspaceRegistryDirectory', () => {
    it('returns config-based path on windows using APPDATA', () => {
      const dir = getWorkspaceRegistryDirectory(
        { APPDATA: 'C:\\Users\\user\\AppData\\Roaming' },
        'win32'
      );
      expect(dir).toBe(path.join('C:\\Users\\user\\AppData\\Roaming', 'rapidkit'));
    });

    it('returns XDG_CONFIG_HOME on windows when set', () => {
      const dir = getWorkspaceRegistryDirectory({ XDG_CONFIG_HOME: '/custom/config' }, 'win32');
      expect(dir).toBe(path.join('/custom/config', 'rapidkit'));
    });

    it('returns .rapidkit under home on linux', () => {
      const dir = getWorkspaceRegistryDirectory({}, 'linux');
      expect(dir).toBe(path.join(os.homedir(), '.rapidkit'));
    });
  });

  describe('getUserLocalBinCandidates', () => {
    it('returns windows-specific bin paths when USERPROFILE, APPDATA, LOCALAPPDATA are set', () => {
      const env = {
        USERPROFILE: 'C:\\Users\\user',
        APPDATA: 'C:\\Users\\user\\AppData\\Roaming',
        LOCALAPPDATA: 'C:\\Users\\user\\AppData\\Local',
      };
      const candidates = getUserLocalBinCandidates(env, 'win32');
      expect(candidates).toContain(path.join('C:\\Users\\user', '.local', 'bin'));
      expect(candidates).toContain(
        path.join('C:\\Users\\user\\AppData\\Roaming', 'Python', 'Scripts')
      );
      expect(candidates).toContain(
        path.join('C:\\Users\\user\\AppData\\Local', 'Programs', 'Python', 'Scripts')
      );
    });

    it('returns only .local/bin on linux', () => {
      const candidates = getUserLocalBinCandidates({}, 'linux');
      expect(candidates).toEqual([path.join(os.homedir(), '.local', 'bin')]);
    });

    it('returns empty windows candidates when env vars are absent', () => {
      const candidates = getUserLocalBinCandidates({}, 'win32');
      expect(candidates).toHaveLength(0);
    });
  });
});
