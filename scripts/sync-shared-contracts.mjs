import fs from 'fs';
import path from 'path';
import { spawnSync } from 'node:child_process';

/**
 * Single source-of-truth contract sync.
 *
 * Canonical contracts live in rapidkit-npm/contracts/.
 * This script:
 * - regenerates generated canonical contracts from npm source code
 * - mirrors every canonical JSON contract to Front/contracts/
 * - mirrors every canonical JSON contract to rapidkit-vscode/contracts/
 * - mirrors runtime-consumed extension JSON contracts to rapidkit-vscode/src/contracts/
 */

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');
const npmOnly = args.has('--npm-only');

const npmRoot = path.resolve(process.cwd());
const contractsDir = path.resolve(npmRoot, 'contracts');
const frontContractsRoot = path.resolve(npmRoot, '..', 'contracts');
const vscodeRoot = process.env.RAPIDKIT_VSCODE_REPO_PATH
  ? path.resolve(process.env.RAPIDKIT_VSCODE_REPO_PATH)
  : path.resolve(npmRoot, '..', 'rapidkit-vscode');

const GENERATED_FILES = [
  'runtime-command-surface.v1.json',
  'create-planner-capabilities.v1.json',
  'agent-customization-pack.v1.json',
  'backend-import-stack-parity.snapshot.json',
  'module-layout.v1.json',
  'infra-stack.v1.json',
];

const VSCODE_SRC_CONTRACT_FILES = [
  'agent-customization-pack.v1.json',
  'create-planner-capabilities.v1.json',
  'release-readiness.v1.json',
  'workspace-registry.v1.json',
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
  const result = spawnSync(
    hasLocalTsx ? localTsx : 'npx',
    hasLocalTsx ? [scriptPath] : ['tsx', scriptPath],
    {
      cwd: npmRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    }
  );

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

// Compare contract content independent of line-ending style. Windows checkouts
// (core.autocrlf=true) store CRLF while the generator writes LF; without this
// the --check gate reports false drift even though the contracts are identical.
function normalizeNewlines(value) {
  return value.replace(/\r\n/g, '\n');
}

function contractContentEquals(a, b) {
  return normalizeNewlines(a) === normalizeNewlines(b);
}

function listJsonContracts(dir, prefix = '') {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.join(prefix, entry.name);
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listJsonContracts(absolutePath, relativePath);
      }
      return entry.isFile() && entry.name.endsWith('.json') ? [relativePath] : [];
    })
    .sort();
}

function snapshotGeneratedFiles() {
  return Object.fromEntries(
    GENERATED_FILES.map((fileName) => {
      const targetPath = path.join(contractsDir, fileName);
      return [fileName, fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf-8') : ''];
    })
  );
}

function verifyGeneratedFiles(before) {
  for (const fileName of GENERATED_FILES) {
    const targetPath = path.join(contractsDir, fileName);
    const after = fs.readFileSync(targetPath, 'utf-8');
    if (!contractContentEquals(before[fileName], after)) {
      console.error(`Generated contract drift: ${targetPath}`);
      console.error('Run: npm run sync:shared-contracts');
      process.exit(1);
    }
  }
}

function readCanonical(relativePath) {
  const canonicalPath = path.resolve(contractsDir, relativePath);
  if (!fs.existsSync(canonicalPath)) {
    console.error(`Canonical contract missing in rapidkit-npm: ${canonicalPath}`);
    process.exit(1);
  }

  return {
    canonicalPath,
    content: fs.readFileSync(canonicalPath, 'utf-8'),
  };
}

function writeTarget(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf-8');
}

function verifyTarget(targetPath, content, label) {
  if (!fs.existsSync(targetPath)) {
    console.error(`${label} contract copy is missing: ${targetPath}`);
    process.exit(1);
  }

  const targetContent = fs.readFileSync(targetPath, 'utf-8');
  if (!contractContentEquals(targetContent, content)) {
    console.error(`${label} contract copy is out of sync: ${targetPath}`);
    console.error('Run from rapidkit-npm: npm run sync:shared-contracts');
    process.exit(1);
  }
}

function syncContract(relativePath, targetRoot, label, content) {
  const targetPath = path.resolve(targetRoot, relativePath);
  if (checkOnly) {
    verifyTarget(targetPath, content, label);
    return;
  }

  writeTarget(targetPath, content);
  console.log(`- ${label}: ${targetPath}`);
}

const generatedSnapshot = checkOnly ? snapshotGeneratedFiles() : null;
runGenerator();
if (checkOnly) {
  verifyGeneratedFiles(generatedSnapshot);
}

const canonicalFiles = listJsonContracts(contractsDir);
if (canonicalFiles.length === 0) {
  console.error(`No canonical contracts found in ${contractsDir}`);
  process.exit(1);
}

for (const relativePath of canonicalFiles) {
  const { canonicalPath, content } = readCanonical(relativePath);

  if (!checkOnly) {
    console.log(`Contract synced from ${canonicalPath}`);
  }

  if (fs.existsSync(frontContractsRoot)) {
    syncContract(relativePath, frontContractsRoot, 'Front/contracts', content);
  }

  if (!npmOnly && fs.existsSync(vscodeRoot)) {
    syncContract(
      relativePath,
      path.resolve(vscodeRoot, 'contracts'),
      'rapidkit-vscode/contracts',
      content
    );

    if (VSCODE_SRC_CONTRACT_FILES.includes(relativePath)) {
      syncContract(
        relativePath,
        path.resolve(vscodeRoot, 'src', 'contracts'),
        'rapidkit-vscode/src/contracts',
        content
      );
    }
  }
}

if (checkOnly) {
  console.log('Shared generated contracts and mirrors match rapidkit-npm/contracts/.');
} else {
  console.log('Shared contracts generated and synced from rapidkit-npm/contracts/.');
}
