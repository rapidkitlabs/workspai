import fs from 'fs';
import path from 'path';
import { gzipSync } from 'zlib';

const distDir = path.resolve('dist');

if (!fs.existsSync(distDir)) {
  console.error('dist/ does not exist. Run the build first.');
  process.exit(1);
}

const files = fs
  .readdirSync(distDir)
  .filter((file) => file.endsWith('.js'))
  .map((file) => {
    const fullPath = path.join(distDir, file);
    const content = fs.readFileSync(fullPath);
    return {
      file,
      rawBytes: content.byteLength,
      gzipBytes: gzipSync(content).byteLength,
    };
  })
  .sort((left, right) => right.rawBytes - left.rawBytes);

const totalRaw = files.reduce((sum, file) => sum + file.rawBytes, 0);
const totalGzip = files.reduce((sum, file) => sum + file.gzipBytes, 0);

const formatKiB = (bytes) => `${(bytes / 1024).toFixed(2)} KB`;

console.log('RapidKit dist bundle analysis');
console.log('');
console.table(
  files.map((file) => ({
    file: file.file,
    raw: formatKiB(file.rawBytes),
    gzip: formatKiB(file.gzipBytes),
  }))
);
console.log(`Total raw: ${formatKiB(totalRaw)}`);
console.log(`Total gzip: ${formatKiB(totalGzip)}`);
