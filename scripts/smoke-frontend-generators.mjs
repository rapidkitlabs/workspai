import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, 'dist', 'index.js');
const nodeBin = resolveNodeBin();

const generatorIds = [
  'nextjs',
  'remix',
  'vite-react',
  'vite-vue',
  'vite-svelte',
  'vite-solid',
  'vite-vanilla',
  'nuxt',
  'angular',
  'astro',
  'sveltekit',
];

const bundleTokens = {
  nextjs: ['frontend.nextjs', 'create-next-app@latest'],
  remix: ['frontend.remix', 'create-react-router@latest'],
  'vite-react': ['frontend.vite-react', 'react-ts'],
  'vite-vue': ['frontend.vite-vue', 'vue-ts'],
  'vite-svelte': ['frontend.vite-svelte', 'svelte-ts'],
  'vite-solid': ['frontend.vite-solid', 'solid-ts'],
  'vite-vanilla': ['frontend.vite-vanilla', 'vanilla-ts'],
  nuxt: ['frontend.nuxt', 'nuxi@latest'],
  angular: ['frontend.angular', '@angular/cli@19'],
  astro: ['frontend.astro', 'create astro@4'],
  sveltekit: ['frontend.sveltekit', 'sv@latest'],
};

const args = process.argv.slice(2);
const execute =
  args.includes('--execute') || process.env.RAPIDKIT_FRONTEND_GENERATOR_SMOKE === 'network';
const keep = args.includes('--keep') || process.env.RAPIDKIT_FRONTEND_GENERATOR_KEEP === '1';
const timeoutMs =
  Number.parseInt(process.env.RAPIDKIT_FRONTEND_GENERATOR_TIMEOUT_MS ?? '', 10) || 180_000;
const selected = readListOption('--generators') ?? process.env.RAPIDKIT_FRONTEND_GENERATORS;
const targets = selected
  ? selected
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  : generatorIds;

function readListOption(name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }
  return args[index + 1] ?? '';
}

function fail(message) {
  console.error(`[frontend-generator-smoke] ${message}`);
  process.exit(1);
}

function resolveNodeBin() {
  const explicit = process.env.RAPIDKIT_FRONTEND_SMOKE_NODE;
  if (explicit) {
    return explicit;
  }

  const candidates = [
    process.env.HOME
      ? path.join(process.env.HOME, '.nvm', 'versions', 'node', 'v20.20.0', 'bin', 'node')
      : null,
    process.env.npm_node_execpath,
    process.execPath,
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) ?? process.execPath;
}

if (!existsSync(cliPath)) {
  fail(`missing built CLI at ${cliPath}; run npm run build first`);
}

const unknown = targets.filter((target) => !generatorIds.includes(target));
if (unknown.length > 0) {
  fail(`unknown generator(s): ${unknown.join(', ')}. Known: ${generatorIds.join(', ')}`);
}

if (!execute) {
  const bundle = readFileSync(cliPath, 'utf8');
  for (const generator of targets) {
    for (const token of bundleTokens[generator] ?? []) {
      if (!bundle.includes(token)) {
        fail(`${generator} missing bundled token "${token}"`);
      }
    }
  }
  console.log(
    `[frontend-generator-smoke] PASS dry-run contract for ${targets.length} generator(s)`
  );
  process.exit(0);
}

const workspaceDir = mkdtempSync(path.join(tmpdir(), 'rapidkit-frontend-smoke-'));
mkdirSync(path.join(workspaceDir, '.rapidkit'), { recursive: true });
writeFileSync(
  path.join(workspaceDir, '.rapidkit-workspace'),
  `${JSON.stringify(
    {
      signature: 'RAPIDKIT_WORKSPACE',
      createdBy: 'rapidkit-npm',
      version: 'smoke',
      createdAt: new Date().toISOString(),
      name: path.basename(workspaceDir),
    },
    null,
    2
  )}\n`
);
writeFileSync(
  path.join(workspaceDir, '.rapidkit', 'workspace.json'),
  `${JSON.stringify(
    {
      name: path.basename(workspaceDir),
      version: 1,
      projects: [],
    },
    null,
    2
  )}\n`
);
const mode = execute ? 'network execute' : 'dry-run contract';
console.log(`[frontend-generator-smoke] mode=${mode}`);
console.log(`[frontend-generator-smoke] workspace=${workspaceDir}`);
console.log(`[frontend-generator-smoke] node=${nodeBin}`);

try {
  for (const generator of targets) {
    const projectName = `rk-${generator.replace(/[^a-z0-9-]/gi, '-')}`;
    const command = [
      cliPath,
      'create',
      'frontend',
      generator,
      projectName,
      '--output',
      workspaceDir,
      '--skip-install',
      '--skip-git',
      ...(execute ? [] : ['--dry-run']),
    ];

    console.log(`[frontend-generator-smoke] ${generator}: ${nodeBin} ${command.join(' ')}`);
    const result = spawnSync(nodeBin, command, {
      cwd: workspaceDir,
      encoding: 'utf8',
      timeout: timeoutMs,
      env: {
        ...process.env,
        CI: '1',
        npm_config_yes: 'true',
      },
    });

    if (result.error) {
      fail(`${generator} failed to launch: ${result.error.message}`);
    }
    if (result.status !== 0) {
      console.error(result.stdout);
      console.error(result.stderr);
      fail(`${generator} exited with ${result.status}`);
    }

    const output = `${result.stdout}\n${result.stderr}`;
    if (!execute && !output.includes('Display command:')) {
      console.error(output);
      fail(`${generator} dry-run did not print a display command`);
    }
    if (!execute && !output.includes('Execution command:')) {
      console.error(output);
      fail(`${generator} dry-run did not print an execution command`);
    }
  }

  console.log(`[frontend-generator-smoke] PASS ${targets.length} generator(s)`);
} finally {
  if (keep) {
    console.log(`[frontend-generator-smoke] kept workspace ${workspaceDir}`);
  } else {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}
