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

const PRIMARY_COMMAND = 'workspai';

function resolveCommandCandidates(commandName) {
  const command = isWindows() ? 'where' : 'which';
  const args = isWindows() ? [commandName] : ['-a', commandName];
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
  // On Windows, PATH ordering can route a globally installed CLI name to the
  // wrong shim. Workspai publishes only the `workspai` binary; the legacy
  // `rapidkit` alias is intentionally owned by the legacy package/Python Core.
  if (!isWindows()) return;

  const candidates = resolveCommandCandidates(PRIMARY_COMMAND);
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
  console.warn('[workspai] Windows CLI resolution warning');
  console.warn(`The first \`${PRIMARY_COMMAND}\` command on PATH is not the npm global shim.`);
  console.warn(`First match: ${candidates[0]}`);
  if (npmCandidate) {
    console.warn(`npm shim:    ${npmCandidate}`);
  }
  console.warn('');
  console.warn('This can make `workspai doctor workspace`, `workspai workspace ...`,');
  console.warn('and other npm-owned commands route to an unexpected executable.');
  console.warn('');
  console.warn('Fix: move the npm global bin directory before Python Scripts in PATH, or run:');
  console.warn('  npx --yes workspai <command>');
  console.warn('');
}

main();
