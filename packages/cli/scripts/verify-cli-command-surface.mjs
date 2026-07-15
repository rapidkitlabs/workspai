#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const packageRoot = process.cwd();
const cliPath = path.join(packageRoot, 'dist', 'index.js');
const contractPath = path.join(packageRoot, 'contracts', 'runtime-command-surface.v1.json');

function fail(message) {
  console.error(`[verify-cli-command-surface] ${message}`);
  process.exit(1);
}

function sorted(values) {
  return [...values].sort();
}

function assertSameSet(label, actual, expected) {
  const actualSorted = sorted(actual);
  const expectedSorted = sorted(expected);
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    const actualSet = new Set(actualSorted);
    const expectedSet = new Set(expectedSorted);
    const missing = expectedSorted.filter((value) => !actualSet.has(value));
    const unexpected = actualSorted.filter((value) => !expectedSet.has(value));
    fail(
      `${label} mismatch; missing from runtime: [${missing.join(', ')}]; ` +
        `missing from contract: [${unexpected.join(', ')}]`
    );
  }
}

if (!existsSync(cliPath)) {
  fail(`missing built CLI at ${cliPath}; run npm run build first`);
}
if (!existsSync(contractPath)) {
  fail(`missing runtime contract at ${contractPath}`);
}

const commandResult = spawnSync(process.execPath, [cliPath, 'commands', '--json'], {
  cwd: packageRoot,
  encoding: 'utf8',
  env: {
    ...process.env,
    NO_UPDATE_NOTIFIER: '1',
    RAPIDKIT_NO_UPDATE_CHECK: '1',
  },
});

if (commandResult.status !== 0) {
  fail(
    `packaged commands --json exited ${String(commandResult.status)}: ` +
      `${commandResult.stderr || commandResult.stdout}`.trim()
  );
}

let payload;
try {
  payload = JSON.parse(commandResult.stdout);
} catch (error) {
  fail(`packaged commands --json did not emit valid JSON: ${error.message}`);
}

const inventory = payload?.runtimeInventory;
if (inventory?.schemaVersion !== 'workspai-cli-runtime-command-inventory-v1') {
  fail(`unexpected runtime inventory schema: ${String(inventory?.schemaVersion)}`);
}
if (inventory.integrity?.ok !== true) {
  fail(`runtime inventory integrity failed: ${JSON.stringify(inventory.integrity)}`);
}

const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const runtimeTopLevel = inventory.topLevelCommands;
const runtimeScoped = inventory.commands
  .filter((entry) => entry.registrationKind === 'commander' && entry.path.length > 1)
  .map((entry) => entry.path.join(' '));
const contractScoped = contract.npmOwnedScopedCommands.map((entry) => entry.join(' '));

assertSameSet(
  'npm-owned top-level command surface',
  runtimeTopLevel,
  contract.npmOwnedTopLevelCommands
);
assertSameSet('npm-owned scoped command surface', runtimeScoped, contractScoped);
assertSameSet('commands.npmOwned projection', payload.commands?.npmOwned ?? [], runtimeTopLevel);
assertSameSet(
  'workspace command surface',
  payload.workspace?.subcommands ?? [],
  contract.workspaceSubcommands
);
assertSameSet(
  'workspace intelligence command surface',
  payload.workspace?.intelligenceSubcommands ?? [],
  contract.workspaceIntelligenceSubcommands
);

for (const command of runtimeTopLevel) {
  if (payload.commandMap?.[command]?.owner !== 'npm-wrapper') {
    fail(`commandMap is missing npm-wrapper ownership for ${command}`);
  }
}

console.log(
  `[verify-cli-command-surface] verified ${runtimeTopLevel.length} roots, ` +
    `${runtimeScoped.length} scoped commands, and workspace/runtime contract parity`
);
