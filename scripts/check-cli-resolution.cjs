#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const process = require('node:process');

function isWindows() {
  return process.platform === 'win32';
}

function npmGlobalBinDir() {
  const prefix = process.env.npm_config_prefix;
  if (!prefix) return null;
  return isWindows() ? prefix : path.join(prefix, 'bin');
}

function resolveRapidkitCandidates() {
  const command = isWindows() ? 'where' : 'which';
  const args = isWindows() ? ['rapidkit'] : ['-a', 'rapidkit'];
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalize(value) {
  return value.replace(/\\/g, '/').toLowerCase();
}

function main() {
  // The collision is painful mostly on Windows because Python creates rapidkit.exe
  // under Python/Scripts while npm creates rapidkit.cmd under the npm prefix.
  if (!isWindows()) return;

  const candidates = resolveRapidkitCandidates();
  if (candidates.length <= 1) return;

  const npmBin = npmGlobalBinDir();
  const expectedPrefix = npmBin ? normalize(npmBin) : null;
  const first = normalize(candidates[0]);
  const npmShimIsFirst = expectedPrefix ? first.startsWith(expectedPrefix) : false;

  if (npmShimIsFirst) return;

  const npmCandidate = expectedPrefix
    ? candidates.find((candidate) => normalize(candidate).startsWith(expectedPrefix))
    : null;

  console.warn('');
  console.warn('[rapidkit] Windows CLI resolution warning');
  console.warn('The first `rapidkit` command on PATH is not the npm global shim.');
  console.warn(`First match: ${candidates[0]}`);
  if (npmCandidate) {
    console.warn(`npm shim:    ${npmCandidate}`);
  }
  console.warn('');
  console.warn('This can make `rapidkit doctor workspace`, `rapidkit workspace ...`,');
  console.warn('`rapidkit bootstrap`, and other npm-owned commands route to the Python engine.');
  console.warn('');
  console.warn('Fix: move the npm global bin directory before Python Scripts in PATH, or run:');
  console.warn('  npx --yes --package rapidkit rapidkit <command>');
  console.warn('');
}

main();
