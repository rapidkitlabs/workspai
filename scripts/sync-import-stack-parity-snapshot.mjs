import fs from 'fs';
import path from 'path';

const FILE_NAME = 'backend-import-stack-parity.snapshot.json';
const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');
const npmOnly = args.has('--npm-only');

const npmRoot = path.resolve(process.cwd());
const npmTarget = path.resolve(npmRoot, 'contracts', FILE_NAME);
const vscodeRoot = process.env.RAPIDKIT_VSCODE_REPO_PATH
  ? path.resolve(process.env.RAPIDKIT_VSCODE_REPO_PATH)
  : path.resolve(npmRoot, '..', 'rapidkit-vscode');
const vscodeTarget = path.resolve(vscodeRoot, 'contracts', FILE_NAME);

function normalizePath(value) {
  return path.resolve(value);
}

function pickSource() {
  const explicit = process.env.RAPIDKIT_BACKEND_IMPORT_PARITY_SNAPSHOT_SOURCE;
  const candidates = [
    explicit && explicit.trim().length > 0 ? normalizePath(explicit.trim()) : null,
    path.resolve(npmRoot, '..', 'contracts', FILE_NAME),
    npmTarget,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function writeTarget(targetPath, sourceContent) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, sourceContent, 'utf-8');
}

function verifyTarget(targetPath, sourceContent, label) {
  if (!fs.existsSync(targetPath)) {
    console.error(`${label} parity snapshot is missing: ${targetPath}`);
    process.exit(1);
  }

  const targetContent = fs.readFileSync(targetPath, 'utf-8');
  if (targetContent !== sourceContent) {
    console.error(`${label} parity snapshot is out of sync: ${targetPath}`);
    process.exit(1);
  }
}

const sourcePath = pickSource();
if (!sourcePath) {
  console.error('No parity snapshot source found.');
  console.error(`Expected one of: ${path.resolve(npmRoot, '..', 'contracts', FILE_NAME)} or ${npmTarget}`);
  process.exit(1);
}

const sourceContent = fs.readFileSync(sourcePath, 'utf-8');

if (checkOnly) {
  verifyTarget(npmTarget, sourceContent, 'npm');

  if (!npmOnly && fs.existsSync(vscodeRoot)) {
    verifyTarget(vscodeTarget, sourceContent, 'vscode');
  }

  console.log('Parity snapshot targets are in sync.');
  process.exit(0);
}

writeTarget(npmTarget, sourceContent);

if (!npmOnly && fs.existsSync(vscodeRoot)) {
  writeTarget(vscodeTarget, sourceContent);
}

console.log(`Parity snapshot synced from ${sourcePath}`);
console.log(`- npm target: ${npmTarget}`);
if (!npmOnly && fs.existsSync(vscodeRoot)) {
  console.log(`- vscode target: ${vscodeTarget}`);
}
