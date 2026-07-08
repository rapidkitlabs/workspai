#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveMonorepoEntrypoint() {
  const candidate = path.resolve(__dirname, '..', '..', 'cli', 'dist', 'index.js');
  return existsSync(candidate) ? candidate : null;
}

function resolveWorkspaiEntrypoint() {
  const monorepoEntrypoint = resolveMonorepoEntrypoint();
  if (monorepoEntrypoint) {
    return monorepoEntrypoint;
  }

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
