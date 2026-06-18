import fs from 'fs';
import path from 'path';

/**
 * Canonical shared contracts live in rapidkit-npm/contracts/ (git).
 * This script distributes copies to:
 * - ../contracts/ (local Front monorepo mirror for ../contracts test paths)
 * - ../rapidkit-vscode/contracts/ (extension subset)
 */
const NPM_CANONICAL_CONTRACT_FILES = [
  'runtime-command-surface.v1.json',
  'backend-import-stack-parity.snapshot.json',
  'module-layout.v1.json',
  'pipeline-last-run.v1.json',
  'infra-stack.v1.json',
  'workspace-registry.v1.json',
  'release-readiness.v1.json',
  'workspace-run-last.v1.json',
  'doctor-workspace-evidence.v1.json',
  'doctor-project-evidence.v1.json',
  'analyze-last-run.v1.json',
];

const VSCODE_MIRROR_FILES = [
  'runtime-command-surface.v1.json',
  'backend-import-stack-parity.snapshot.json',
  'module-support.v1.json',
  'workspace-registry.v1.json',
  'release-readiness.v1.json',
  'workspace-run-last.v1.json',
  'doctor-workspace-evidence.v1.json',
  'doctor-project-evidence.v1.json',
  'analyze-last-run.v1.json',
];

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');
const npmOnly = args.has('--npm-only');

const npmRoot = path.resolve(process.cwd());
const frontContractsRoot = path.resolve(npmRoot, '..', 'contracts');
const vscodeRoot = process.env.RAPIDKIT_VSCODE_REPO_PATH
  ? path.resolve(process.env.RAPIDKIT_VSCODE_REPO_PATH)
  : path.resolve(npmRoot, '..', 'rapidkit-vscode');

function readCanonical(fileName) {
  const canonicalPath = path.resolve(npmRoot, 'contracts', fileName);
  if (!fs.existsSync(canonicalPath)) {
    console.error(`Canonical contract missing in rapidkit-npm: ${canonicalPath}`);
    console.error('Edit contracts/ in rapidkit-npm, then run: npm run sync:parity-snapshot');
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
  if (targetContent !== content) {
    console.error(`${label} contract copy is out of sync: ${targetPath}`);
    console.error('Run from rapidkit-npm: npm run sync:parity-snapshot');
    process.exit(1);
  }
}

for (const fileName of NPM_CANONICAL_CONTRACT_FILES) {
  const { canonicalPath, content } = readCanonical(fileName);
  const frontTarget = path.resolve(frontContractsRoot, fileName);
  const vscodeTarget = path.resolve(vscodeRoot, 'contracts', fileName);
  const mirrorToVscode = VSCODE_MIRROR_FILES.includes(fileName);

  if (checkOnly) {
    if (fs.existsSync(frontContractsRoot)) {
      verifyTarget(frontTarget, content, 'Front/contracts');
    }

    if (!npmOnly && mirrorToVscode && fs.existsSync(vscodeRoot)) {
      verifyTarget(vscodeTarget, content, 'vscode');
    }
    continue;
  }

  writeTarget(frontTarget, content);
  console.log(`Contract synced from ${canonicalPath}`);
  console.log(`- Front mirror: ${frontTarget}`);

  if (!npmOnly && mirrorToVscode && fs.existsSync(vscodeRoot)) {
    writeTarget(vscodeTarget, content);
    console.log(`- vscode target: ${vscodeTarget}`);
  }
}

if (checkOnly) {
  console.log('Shared contract copies match rapidkit-npm/contracts/ canonical source.');
}
