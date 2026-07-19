#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();

function fail(message) {
  console.error(`[prepack-enterprise] ${message}`);
  process.exit(1);
}

function runNode(args, label, extraEnv = {}) {
  console.log(`[prepack-enterprise] ${label}`);
  execFileSync(process.execPath, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
      npm_config_user_agent: process.env.npm_config_user_agent || 'npm/10 workspai-prepack',
    },
  });
}

let tsupCli = path.join(repoRoot, 'node_modules', 'tsup', 'dist', 'cli-default.js');
if (!fs.existsSync(tsupCli)) {
  tsupCli = path.join(repoRoot, '..', '..', 'node_modules', 'tsup', 'dist', 'cli-default.js');
}
if (!fs.existsSync(tsupCli)) {
  fail(`missing tsup CLI at ${tsupCli}; run npm ci before packaging`);
}

runNode(
  ['scripts/generate-shared-contracts.mjs', '--check'],
  'checking generated contracts, including extension CLI compatibility'
);
runNode([tsupCli], 'building dist');
runNode(['scripts/prepare-mock-embeddings.mjs'], 'preparing packaged embeddings');
runNode(['scripts/verify-package-cli.mjs'], 'verifying bundled CLI command ownership');
runNode(
  ['scripts/verify-cli-command-surface.mjs'],
  'verifying live packaged CLI command surface against the published contract'
);
runNode(
  ['scripts/check-workspace-intelligence-runtime-conformance.mjs'],
  'validating Workspace Intelligence runtime artifacts against canonical schemas'
);
runNode(
  ['scripts/check-workspace-intelligence-adversarial.mjs'],
  'running Workspace Intelligence adversarial scenarios'
);
runNode(['scripts/enterprise-package-smoke.mjs'], 'running enterprise package smoke', {
  RAPIDKIT_ENTERPRISE_PREPACK: '1',
});

console.log('[prepack-enterprise] prepack checks passed');
