import fs from 'fs';
import path from 'path';
import { spawnSync } from 'node:child_process';

const npmRoot = path.resolve(process.cwd());
const contractsDir = path.resolve(npmRoot, 'contracts');

const GENERATED_FILES = [
  'runtime-command-surface.v1.json',
  'create-planner-capabilities.v1.json',
  'backend-import-stack-parity.snapshot.json',
  'module-layout.v1.json',
  'infra-stack.v1.json',
];

function runGenerator() {
  const scriptPath = path.resolve(npmRoot, 'scripts/run-generate-shared-contracts.ts');
  const localTsx = path.resolve(
    npmRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
  );
  const hasLocalTsx = fs.existsSync(localTsx);
  const result = spawnSync(hasLocalTsx ? localTsx : 'npx', hasLocalTsx ? [scriptPath] : ['tsx', scriptPath], {
    cwd: npmRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    console.error('Could not run shared contract generator.');
    console.error(
      hasLocalTsx
        ? `Failed runner: ${localTsx}`
        : 'Neither local node_modules/.bin/tsx nor npx is available.'
    );
    console.error('Install npm dependencies or run through npm so npx can resolve tsx.');
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const checkOnly = process.argv.includes('--check');

if (checkOnly) {
  const before = Object.fromEntries(
    GENERATED_FILES.map((fileName) => [
      fileName,
      fs.existsSync(path.join(contractsDir, fileName))
        ? fs.readFileSync(path.join(contractsDir, fileName), 'utf-8')
        : '',
    ])
  );

  runGenerator();

  for (const fileName of GENERATED_FILES) {
    const targetPath = path.join(contractsDir, fileName);
    const after = fs.readFileSync(targetPath, 'utf-8');
    if (before[fileName] !== after) {
      console.error(`Generated contract drift: ${targetPath}`);
      console.error('Run: npm run generate:contracts && npm run sync:parity-snapshot');
      process.exit(1);
    }
  }

  console.log('Generated contracts match committed rapidkit-npm/contracts/ files.');
  process.exit(0);
}

runGenerator();
console.log('Generated shared contracts in rapidkit-npm/contracts/.');
console.log('Next: npm run sync:parity-snapshot');
