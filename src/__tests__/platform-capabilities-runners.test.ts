import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  augmentPathWithNodeBin,
  buildPackageRunnerSubprocessEnv,
  resolvePackageRunnerInvocation,
  resolvePackageRunnerExecutable,
} from '../utils/platform-capabilities.js';

describe('platform-capabilities package runners', () => {
  it('resolves package runners as command-safe invocations', () => {
    const invocation = resolvePackageRunnerInvocation('npm');

    expect(invocation.command).toBeTruthy();
    expect(invocation.command.includes(' ')).toBe(false);

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

  it('prepends the Node bin directory to PATH', () => {
    const augmented = augmentPathWithNodeBin('/usr/bin:/bin');
    expect(augmented.startsWith(`${path.dirname(process.execPath)}:`)).toBe(true);
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
    expect(env.PATH?.split(':')).toContain(path.dirname(process.execPath));
  });
});
