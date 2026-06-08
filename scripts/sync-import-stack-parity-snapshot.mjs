import fs from 'fs';
import path from 'path';

const FILE_NAMES = [
  'backend-import-stack-parity.snapshot.json',
  'runtime-command-surface.v1.json',
];
const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');
const npmOnly = args.has('--npm-only');

const npmRoot = path.resolve(process.cwd());
const vscodeRoot = process.env.RAPIDKIT_VSCODE_REPO_PATH
  ? path.resolve(process.env.RAPIDKIT_VSCODE_REPO_PATH)
  : path.resolve(npmRoot, '..', 'rapidkit-vscode');

function normalizePath(value) {
  return path.resolve(value);
}

function pickSource(fileName) {
  const explicit = process.env.RAPIDKIT_BACKEND_IMPORT_PARITY_SNAPSHOT_SOURCE;
  const runtimeExplicit = process.env.RAPIDKIT_RUNTIME_COMMAND_SURFACE_CONTRACT_SOURCE;
  const npmTarget = path.resolve(npmRoot, 'contracts', fileName);
  const candidates = [
    fileName === 'backend-import-stack-parity.snapshot.json' && explicit?.trim()
      ? normalizePath(explicit.trim())
      : null,
    fileName === 'runtime-command-surface.v1.json' && runtimeExplicit?.trim()
      ? normalizePath(runtimeExplicit.trim())
      : null,
    path.resolve(npmRoot, '..', 'contracts', fileName),
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

for (const fileName of FILE_NAMES) {
  const npmTarget = path.resolve(npmRoot, 'contracts', fileName);
  const vscodeTarget = path.resolve(vscodeRoot, 'contracts', fileName);
  const sourcePath = pickSource(fileName);
  if (!sourcePath) {
    console.error(`No contract source found for ${fileName}.`);
    console.error(`Expected one of: ${path.resolve(npmRoot, '..', 'contracts', fileName)} or ${npmTarget}`);
    process.exit(1);
  }

  const sourceContent = fs.readFileSync(sourcePath, 'utf-8');

  if (checkOnly) {
    verifyTarget(npmTarget, sourceContent, 'npm');

    if (!npmOnly && fs.existsSync(vscodeRoot)) {
      verifyTarget(vscodeTarget, sourceContent, 'vscode');
    }
    continue;
  }

  writeTarget(npmTarget, sourceContent);

  if (!npmOnly && fs.existsSync(vscodeRoot)) {
    writeTarget(vscodeTarget, sourceContent);
  }

  console.log(`Contract synced from ${sourcePath}`);
  console.log(`- npm target: ${npmTarget}`);
  if (!npmOnly && fs.existsSync(vscodeRoot)) {
    console.log(`- vscode target: ${vscodeTarget}`);
  }
}

if (checkOnly) {
  console.log('Parity contract targets are in sync.');
}
