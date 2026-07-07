import { spawnSync } from 'child_process';
import { describe, expect, it } from 'vitest';

import { ensureDistBuilt } from './helpers/dist';

function cliEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_ENV;
  delete env.NODE_OPTIONS;
  for (const key of Object.keys(env)) {
    if (key.startsWith('VITEST')) {
      delete env[key];
    }
  }
  return env;
}

describe('CLI pipe output', () => {
  it('flushes --version --json when stdout is piped', () => {
    const cliPath = ensureDistBuilt('CLI pipe output');
    const result = spawnSync(process.execPath, [cliPath, '--version', '--json'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: cliEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim()).not.toBe('');

    const parsed = JSON.parse(result.stdout) as { schemaVersion?: string; version?: string };
    expect(parsed.schemaVersion).toBe('rapidkit-version-v1');
    expect(parsed.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  }, 30000);
});
