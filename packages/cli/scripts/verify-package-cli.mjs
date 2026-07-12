import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, 'dist', 'index.js');
const distPath = path.join(repoRoot, 'dist');

const checks = [
  {
    name: 'workspace command is npm-owned',
    expected: ['workspace <action> [subaction] [key] [value]', 'workspace run <stage>'],
  },
  {
    name: 'snapshot create command is npm-owned',
    expected: ['snapshot', 'Create a recoverable workspace snapshot'],
  },
  {
    name: 'doctor workspace scope is npm-owned',
    expected: ['doctor [scope]', 'Unknown doctor scope'],
  },
  {
    name: 'bootstrap command is npm-owned',
    expected: ['handleBootstrapCommand', 'profile'],
  },
];

function fail(message) {
  console.error(`[verify-package-cli] ${message}`);
  process.exit(1);
}

if (!existsSync(cliPath)) {
  fail(`missing built CLI at ${cliPath}; run npm run build before packing`);
}

const bundledJavaScript = readdirSync(distPath, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
  .map((entry) => readFileSync(path.join(distPath, entry.name), 'utf8'))
  .join('\n');

for (const check of checks) {
  for (const token of check.expected) {
    if (!bundledJavaScript.includes(token)) {
      fail(`${check.name} missing expected bundled token "${token}"`);
    }
  }
}

console.log(`[verify-package-cli] verified ${checks.length} npm-owned command surfaces`);
