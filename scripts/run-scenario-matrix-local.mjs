#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const args = new Set(process.argv.slice(2));
const env = { ...process.env };

if (args.has('--full')) {
  env.RAPIDKIT_SCENARIO_FULL_BOOTSTRAP = '1';
}
if (args.has('--workspace-create')) {
  env.RAPIDKIT_SCENARIO_WORKSPACE_CREATE = '1';
}

const scriptPath = path.join(process.cwd(), 'scripts', 'scenario-matrix-local.sh');
const result = spawnSync('bash', [scriptPath], {
  stdio: 'inherit',
  env,
  shell: false,
});

if (result.error) {
  console.error(
    '[run-scenario-matrix-local] bash is required for the local scenario matrix. ' +
      'On Windows, install/use Git Bash or run the GitHub Actions workspace matrix.'
  );
  console.error(`[run-scenario-matrix-local] ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
