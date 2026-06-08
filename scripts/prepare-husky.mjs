#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

if (process.env.HUSKY === '0' || process.env.CI === 'true') {
  process.exit(0);
}

const binName = process.platform === 'win32' ? 'husky.cmd' : 'husky';
const huskyBin = path.resolve('node_modules', '.bin', binName);

if (!fs.existsSync(huskyBin)) {
  process.exit(0);
}

const result = spawnSync(huskyBin, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
