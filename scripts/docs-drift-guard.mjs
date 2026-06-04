import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readmePath = path.join(root, 'README.md');
const readme = fs.readFileSync(readmePath, 'utf8');

const requiredSnippets = [
  'rapidkit doctor workspace',
  'rapidkit setup <python|node|go|java|dotnet> [--warm-deps]',
  'rapidkit workspace list',
  'rapidkit cache <status|clear|prune|repair>',
  'rapidkit mirror <status|sync|verify|rotate>',
  '.github/workflows/ci.yml',
  '.github/workflows/workspace-e2e-matrix.yml',
  '.github/workflows/windows-bridge-e2e.yml',
  '.github/workflows/e2e-smoke.yml',
  '.github/workflows/security.yml',
];

const errors = [];
for (const snippet of requiredSnippets) {
  if (!readme.includes(snippet)) {
    errors.push(`README missing required snippet: ${snippet}`);
  }
}

const workflowRefs = [
  'ci.yml',
  'workspace-e2e-matrix.yml',
  'windows-bridge-e2e.yml',
  'e2e-smoke.yml',
  'security.yml',
];
for (const wf of workflowRefs) {
  const wfPath = path.join(root, '.github', 'workflows', wf);
  if (!fs.existsSync(wfPath)) {
    errors.push(`Workflow referenced in README but missing: .github/workflows/${wf}`);
  }
}

if (errors.length) {
  console.error('❌ Docs drift guard failed:\n');
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

console.log('✅ Docs drift guard passed.');
