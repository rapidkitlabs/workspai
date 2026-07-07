import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

function ensureDistBuilt() {
  const dist = path.resolve(__dirname, '..', '..', 'dist', 'index.js');
  if (!fs.existsSync(dist)) {
    // run build synchronously for tests (safe & idempotent in CI)
    const r = spawnSync('npm', ['run', 'build'], {
      cwd: path.resolve(__dirname, '..', '..'),
      stdio: 'inherit',
    });
    if (r.status !== 0) throw new Error('Failed to build dist for tests');
  }
  return dist;
}

describe('shell activate output', () => {
  it.skip('prints friendly activation header and snippet when context.json exists', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rapidkit-shell-'));
    const rapidDir = path.join(temp, '.rapidkit');
    fs.mkdirSync(rapidDir);
    fs.writeFileSync(path.join(rapidDir, 'context.json'), JSON.stringify({ engine: 'pip' }));
    fs.writeFileSync(path.join(rapidDir, 'activate'), '# placeholder');

    const dist = ensureDistBuilt();
    const out = spawnSync(process.execPath, [dist, 'shell', 'activate'], {
      cwd: temp,
      encoding: 'utf8',
    });

    expect(out.status).toBe(0);
    expect(out.stdout).toContain('Activation snippet');
    expect(out.stdout).toContain('# RapidKit: activation snippet');
    // ensure the snippet exports the RAPIDKIT_PROJECT_ROOT
    expect(out.stdout).toContain('export RAPIDKIT_PROJECT_ROOT');
  });

  it.skip('prints snippet even when context.json is missing but a .venv or activate exists', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rapidkit-shell-'));
    const rapidDir = path.join(temp, '.rapidkit');
    fs.mkdirSync(rapidDir);
    // no context.json, but create an activate file
    fs.writeFileSync(path.join(rapidDir, 'activate'), '# placeholder');

    const dist = ensureDistBuilt();
    const out = spawnSync(process.execPath, [dist, 'shell', 'activate'], {
      cwd: temp,
      encoding: 'utf8',
    });

    expect(out.status).toBe(0);
    expect(out.stdout).toContain('Activation snippet');
    expect(out.stdout).toContain('# RapidKit: activation snippet');
  });
});
