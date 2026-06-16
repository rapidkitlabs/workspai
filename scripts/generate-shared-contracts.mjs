import fs from 'fs';
import path from 'path';
import { spawnSync } from 'node:child_process';

const npmRoot = path.resolve(process.cwd());
const contractsDir = path.resolve(npmRoot, 'contracts');

const GENERATED_FILES = [
  'runtime-command-surface.v1.json',
  'backend-import-stack-parity.snapshot.json',
  'module-layout.v1.json',
  'infra-stack.v1.json',
];

function runGenerator() {
  const scriptPath = path.resolve(npmRoot, 'scripts/run-generate-shared-contracts.ts');
  const result = spawnSync('npx', ['tsx', scriptPath], {
    cwd: npmRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

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
