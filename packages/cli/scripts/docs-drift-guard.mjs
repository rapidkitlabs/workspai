import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readmePath = path.join(root, 'README.md');
const readme = fs.readFileSync(readmePath, 'utf8');
const repositoryReadmePath = path.resolve(root, '..', '..', 'README.md');
const repositoryReadme = fs.readFileSync(repositoryReadmePath, 'utf8');
const chainContract = JSON.parse(
  fs.readFileSync(path.join(root, 'contracts', 'workspace-intelligence-chain.v1.json'), 'utf8')
);
const runtimeContract = JSON.parse(
  fs.readFileSync(path.join(root, 'contracts', 'runtime-command-surface.v1.json'), 'utf8')
);
const runContract = JSON.parse(
  fs.readFileSync(
    path.join(root, 'contracts', 'workspace-intelligence', 'workspace-intelligence-run.v1.json'),
    'utf8'
  )
);
const agentGroundingExample = fs.readFileSync(
  path.join(root, 'docs', 'examples', 'ci-agent-grounding.yml'),
  'utf8'
);
const runnerDocumentationPath = path.join(root, 'docs', 'workspace-intelligence-runner.md');
const runnerDocumentation = fs.readFileSync(runnerDocumentationPath, 'utf8');
const repoRootCandidates = [root, path.resolve(root, '..', '..')];

const requiredSnippets = [
  'workspai doctor workspace',
  'workspai setup <python|node|go|java|dotnet> [--warm-deps]',
  'workspai workspace list',
  'workspai cache <status|clear|prune|repair>',
  'workspai mirror <status|sync|verify|rotate>',
  '.github/workflows/ci.yml',
  '.github/workflows/workspace-e2e-matrix.yml',
  '.github/workflows/windows-bridge-e2e.yml',
  '.github/workflows/e2e-smoke.yml',
  '.github/workflows/security.yml',
];

const errors = [];

const canonicalRunner = 'npx workspai workspace intelligence run --for-agent codex --strict --json';
const canonicalReport = '.workspai/reports/workspace-intelligence-run-last-run.json';
const orderedSteps = [...(chainContract.steps ?? [])].sort(
  (left, right) => left.ordinal - right.ordinal
);
if (orderedSteps.length === 0 || orderedSteps.some((step, index) => step.ordinal !== index + 1)) {
  errors.push('Workspace Intelligence chain ordinals must be contiguous and ordered');
}
const runnerDescriptor = (runtimeContract.commandDocumentation ?? []).find(
  (entry) => entry.invocation === 'workspace intelligence run'
);
if (runnerDescriptor?.canonicalArgv?.join(' ') !== 'workspace intelligence run') {
  errors.push('Runtime command surface is missing the canonical intelligence runner');
}
if (
  runContract?.properties?.artifactPath?.const !== canonicalReport ||
  runContract?.properties?.schemaVersion?.const !== 'workspace-intelligence-run.v1'
) {
  errors.push('Canonical intelligence run report path or schema version drifted');
}
const runStageIds = runContract?.properties?.stages?.prefixItems?.map(
  (stage) => stage?.properties?.id?.const
);
const chainStepIds = orderedSteps.map((step) => step.id);
if (
  runContract?.properties?.stages?.minItems !== chainStepIds.length ||
  runContract?.properties?.stages?.maxItems !== chainStepIds.length ||
  JSON.stringify(runStageIds) !== JSON.stringify(chainStepIds)
) {
  errors.push('Intelligence run report must preserve the exact canonical chain stage order');
}
const runPreflightIds = runContract?.properties?.preflight?.prefixItems?.map(
  (entry) => entry?.properties?.id?.const
);
if (
  runContract?.properties?.preflight?.minItems !== 2 ||
  runContract?.properties?.preflight?.maxItems !== 2 ||
  JSON.stringify(runPreflightIds) !== JSON.stringify(['sync', 'baseline'])
) {
  errors.push('Intelligence run report must preserve the sync/baseline execution envelope');
}
if (
  JSON.stringify(chainContract?.executionEnvelope?.operations?.map((entry) => entry.id)) !==
  JSON.stringify(['sync', 'baseline'])
) {
  errors.push('Workspace Intelligence chain contract is missing the canonical execution envelope');
}

const canonicalSurfaces = [
  ['README.md', readme],
  ['../../README.md', repositoryReadme],
  ['docs/README.md', fs.readFileSync(path.join(root, 'docs', 'README.md'), 'utf8')],
  [
    'docs/OPEN_SOURCE_USER_SCENARIOS.md',
    fs.readFileSync(path.join(root, 'docs', 'OPEN_SOURCE_USER_SCENARIOS.md'), 'utf8'),
  ],
  [
    'docs/commands-reference.md',
    fs.readFileSync(path.join(root, 'docs', 'commands-reference.md'), 'utf8'),
  ],
  [
    'docs/from-code-to-shared-understanding.md',
    fs.readFileSync(path.join(root, 'docs', 'from-code-to-shared-understanding.md'), 'utf8'),
  ],
  [
    'docs/examples/ci-agent-grounding.yml',
    fs.readFileSync(path.join(root, 'docs', 'examples', 'ci-agent-grounding.yml'), 'utf8'),
  ],
];
for (const [file, source] of canonicalSurfaces) {
  if (!source.includes(canonicalRunner)) {
    errors.push(`${file} is missing the canonical strict Workspace Intelligence runner`);
  }
}

const runnerDocumentationRefs = [
  ['README.md', readme],
  ['../../README.md', repositoryReadme],
  ['docs/README.md', fs.readFileSync(path.join(root, 'docs', 'README.md'), 'utf8')],
  [
    'docs/commands-reference.md',
    fs.readFileSync(path.join(root, 'docs', 'commands-reference.md'), 'utf8'),
  ],
  [
    'docs/workspace-operations.md',
    fs.readFileSync(path.join(root, 'docs', 'workspace-operations.md'), 'utf8'),
  ],
  [
    'docs/OPEN_SOURCE_USER_SCENARIOS.md',
    fs.readFileSync(path.join(root, 'docs', 'OPEN_SOURCE_USER_SCENARIOS.md'), 'utf8'),
  ],
  [
    'docs/from-code-to-shared-understanding.md',
    fs.readFileSync(path.join(root, 'docs', 'from-code-to-shared-understanding.md'), 'utf8'),
  ],
  ['docs/ci-workflows.md', fs.readFileSync(path.join(root, 'docs', 'ci-workflows.md'), 'utf8')],
];
for (const [file, source] of runnerDocumentationRefs) {
  if (!source.includes('workspace-intelligence-runner.md')) {
    errors.push(`${file} is missing the canonical Unified Runner documentation link`);
  }
}

const requiredRunnerSemantics = [
  'exactly two ordered `preflight` entries',
  'exactly these 11 ordered `stages`',
  '`passed` → `0`',
  '`failed` → `1`',
  '`blocked` → `2`',
  '`created` or `reused`',
  'Downstream stages are recorded as `skipped`',
  'does not silently replace an existing baseline',
  'Structural schema validation is necessary but not sufficient',
];
for (const semantic of requiredRunnerSemantics) {
  if (!runnerDocumentation.includes(semantic)) {
    errors.push(`Unified Runner documentation is missing required semantics: ${semantic}`);
  }
}

const artifactCatalog = fs.readFileSync(
  path.join(root, 'docs', 'contracts', 'ARTIFACT_CATALOG.md'),
  'utf8'
);
if (
  !artifactCatalog.includes(canonicalReport) &&
  !artifactCatalog.includes(path.basename(canonicalReport))
) {
  errors.push('Artifact Catalog is missing the canonical intelligence run report');
}

const docsIndex = fs.readFileSync(path.join(root, 'docs', 'README.md'), 'utf8');
const contractDocs = fs.readFileSync(path.join(root, 'docs', 'contracts', 'README.md'), 'utf8');
const graphGuide = fs.readFileSync(path.join(root, 'docs', 'workspace-knowledge-graph.md'), 'utf8');
const graphBenchmarkGuide = fs.readFileSync(
  path.join(root, 'docs', 'graph-benchmark-methodology.md'),
  'utf8'
);
const glossary = fs.readFileSync(path.join(root, 'docs', 'GLOSSARY.md'), 'utf8');
const aiQuickstart = fs.readFileSync(path.join(root, 'docs', 'AI_QUICKSTART.md'), 'utf8');

const requiredDocumentationLinks = [
  'workspace-intelligence-runner.md',
  'workspace-knowledge-graph.md',
  'graph-benchmark-methodology.md',
  'GLOSSARY.md',
  'contracts/ARTIFACT_CATALOG.md',
];
for (const documentationLink of requiredDocumentationLinks) {
  if (!docsIndex.includes(documentationLink)) {
    errors.push(`Documentation index is missing the user entry point: ${documentationLink}`);
  }
}

const graphSchemaNames = [
  'workspace-knowledge-graph.v1.json',
  'workspace-knowledge-graph-change-overlay.v1.json',
  'workspace-knowledge-search.v1.json',
  'workspace-graph-token-efficiency.v1.json',
];
if (!contractDocs.includes('published-contract-catalog.v1.json')) {
  errors.push('Contract documentation is missing complete machine-readable catalog discovery');
}
for (const schemaName of graphSchemaNames) {
  if (!contractDocs.includes(schemaName)) {
    errors.push(`Contract documentation is missing the graph schema: ${schemaName}`);
  }
}

const requiredGraphConsumerSemantics = [
  'workspace graph search <query> --limit <n> --json',
  'searchWorkspaceGraph',
  'Read the full context, model, or graph only when the bounded result is insufficient',
];
for (const semantic of requiredGraphConsumerSemantics) {
  if (!artifactCatalog.includes(semantic)) {
    errors.push(`Artifact Catalog is missing bounded agent retrieval semantics: ${semantic}`);
  }
}

for (const semantic of [
  'derived representation bound to an exact model revision',
  'not a prompt',
  'token estimate',
]) {
  if (!graphGuide.includes(semantic) && !graphBenchmarkGuide.includes(semantic)) {
    errors.push(`Graph documentation is missing required claim boundary: ${semantic}`);
  }
}

for (const term of ['Workspace Model', 'Knowledge Graph', 'Proof path', 'Unified runner']) {
  if (!glossary.includes(term)) {
    errors.push(`Glossary is missing the canonical term: ${term}`);
  }
}

for (const semantic of [
  'does not require an API key',
  'deterministic mock mode',
  'not confidence',
]) {
  if (!aiQuickstart.includes(semantic)) {
    errors.push(`AI quickstart is missing the module-recommender boundary: ${semantic}`);
  }
}
const groundingWorkflow = canonicalSurfaces.find(
  ([file]) => file === 'docs/examples/ci-agent-grounding.yml'
)?.[1];
if (
  !groundingWorkflow?.includes('pipeline --json --strict --no-agent-sync') ||
  !groundingWorkflow?.includes(canonicalReport)
) {
  errors.push('Agent grounding CI must keep pipeline separate and upload the canonical run report');
}

const markdownFiles = [
  repositoryReadmePath,
  readmePath,
  ...fs
    .readdirSync(path.join(root, 'docs'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(entry.parentPath, entry.name)),
];
for (const filePath of markdownFiles) {
  const source = fs.readFileSync(filePath, 'utf8');
  for (const match of source.matchAll(/```(?:bash|sh|shell)\s*\n([\s\S]*?)```/g)) {
    const block = match[1].replace(/^\s*npx\s+/gm, '');
    const commandCount = (block.match(/^\s*workspai\b/gm) ?? []).length;
    const hasRunner = block.includes('workspai workspace intelligence run');
    const hasPipeline = /^\s*workspai pipeline\b/m.test(block);
    if (hasRunner && hasPipeline) {
      errors.push(
        `${path.relative(root, filePath)} combines the canonical runner and pipeline in one recipe`
      );
    }
    if (
      commandCount <= 8 &&
      /^\s*workspai workspace model\b/m.test(block) &&
      /^\s*workspai workspace context\b/m.test(block)
    ) {
      errors.push(
        `${path.relative(root, filePath)} teaches model + context as a partial replacement loop`
      );
    }
  }
}
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
  const hasWorkflow = repoRootCandidates.some((candidateRoot) =>
    fs.existsSync(path.join(candidateRoot, '.github', 'workflows', wf))
  );
  if (!hasWorkflow) {
    errors.push(`Workflow referenced in README but missing: .github/workflows/${wf}`);
  }
}

for (const metadataPath of ["'.workspai/**'", "'.rapidkit/**'"]) {
  if (!agentGroundingExample.includes(metadataPath)) {
    errors.push(`Agent grounding CI example missing metadata path: ${metadataPath}`);
  }
}

if (errors.length) {
  console.error('❌ Docs drift guard failed:\n');
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

console.log('✅ Docs drift guard passed.');
