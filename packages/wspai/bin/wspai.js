#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

function resolveWorkspaiEntrypoint() {
  const packageJsonPath = require.resolve('workspai/package.json');
  return path.join(path.dirname(packageJsonPath), 'dist', 'index.js');
}

const result = spawnSync(process.execPath, [resolveWorkspaiEntrypoint(), ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(`[wspai] Failed to launch Workspai: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
