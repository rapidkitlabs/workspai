import path from 'path';
import fs from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  augmentPathWithNodeBin,
  buildPackageRunnerSubprocessEnv,
  resolvePackageRunnerInvocation,
  resolvePackageRunnerExecutable,
} from '../utils/platform-capabilities.js';

describe('platform-capabilities package runners', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves package runners as command-safe invocations', () => {
    const invocation = resolvePackageRunnerInvocation('npm');

    expect(invocation.command).toBeTruthy();

    if (invocation.command === process.execPath) {
      expect(invocation.prefixArgs[0]).toMatch(/npm-cli\.js$/);
    } else if (invocation.command === 'corepack') {
      expect(invocation.prefixArgs).toEqual(['npm']);
    } else {
      expect(path.basename(invocation.command)).toMatch(/^npm(?:\.cmd)?$/);
      expect(invocation.prefixArgs).toEqual([]);
    }
  });

  it('keeps the legacy executable helper compatible with invocation resolution', () => {
    const resolved = resolvePackageRunnerExecutable('npm');
    expect(resolved).toBe(resolvePackageRunnerInvocation('npm').command);
  });

  it('uses node and npm CLI JavaScript on Windows without losing spaced paths', () => {
    const node = 'C:\\Program Files\\nodejs\\node.exe';
    const npmCli = 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js';
    vi.spyOn(fs, 'existsSync').mockImplementation((candidate) => {
      const value = String(candidate);
      return value === npmCli || value.endsWith('npm.cmd');
    });

    const invocation = resolvePackageRunnerInvocation(
      'npm',
      'win32',
      { npm_execpath: npmCli },
      node
    );

    expect(invocation).toEqual({ command: node, prefixArgs: [npmCli] });
  });

  it('prepends the Node bin directory to PATH', () => {
    const delimiter = process.platform === 'win32' ? ';' : ':';
    const augmented = augmentPathWithNodeBin(['/usr/bin', '/bin'].join(delimiter));
    expect(augmented.startsWith(`${path.dirname(process.execPath)}${delimiter}`)).toBe(true);
    expect(augmented).toContain('/usr/bin');
  });

  it('strips parent npx --package pins from nested runner env', () => {
    const env = buildPackageRunnerSubprocessEnv({
      PATH: '/usr/bin',
      npm_config_package: 'file:/tmp/rapidkit-npm',
      npm_config__package: 'file:/tmp/rapidkit-npm',
      HOME: '/home/dev',
    });

    expect(env.npm_config_package).toBeUndefined();
    expect(env.npm_config__package).toBeUndefined();
    expect(env.HOME).toBe('/home/dev');
    expect(env.PATH?.split(process.platform === 'win32' ? ';' : ':')).toContain(
      path.dirname(process.execPath)
    );
  });
});
