import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));

const result = spawnSync(process.execPath, [resolve(packageRoot, 'bin', 'wspai.js'), '--version'], {
  cwd: packageRoot,
  encoding: 'utf8',
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}

if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (result.stdout.trim() !== packageJson.version) {
  console.error(`wspai smoke expected ${packageJson.version}, received ${result.stdout.trim() || '<empty>'}`);
  process.exit(1);
}
