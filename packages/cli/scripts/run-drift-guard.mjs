#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const vitestBin = path.join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vitest.cmd' : 'vitest'
);

const result = spawnSync(vitestBin, ['run', 'src/__tests__/drift-guard.test.ts'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    RAPIDKIT_DRIFT_GUARD: '1',
  },
  shell: false,
});

if (result.error) {
  console.error(`[run-drift-guard] ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
