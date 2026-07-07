#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const distPath = path.resolve('dist');

function sizeOf(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;

  return fs
    .readdirSync(filePath)
    .reduce((total, entry) => total + sizeOf(path.join(filePath, entry)), 0);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

if (!fs.existsSync(distPath)) {
  console.error('[report-dist-size] dist/ does not exist. Run npm run build first.');
  process.exit(1);
}

const files = fs
  .readdirSync(distPath)
  .map((entry) => {
    const filePath = path.join(distPath, entry);
    return {
      entry,
      size: sizeOf(filePath),
      isDirectory: fs.statSync(filePath).isDirectory(),
    };
  })
  .sort((a, b) => b.size - a.size);

console.log(`dist total: ${formatBytes(sizeOf(distPath))}`);
for (const file of files.slice(0, 30)) {
  console.log(
    `${formatBytes(file.size).padStart(10)}  ${file.entry}${file.isDirectory ? '/' : ''}`
  );
}
