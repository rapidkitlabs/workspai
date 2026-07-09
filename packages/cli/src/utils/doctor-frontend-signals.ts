import fsExtra from 'fs-extra';
import path from 'path';
import { existsSync } from 'fs';

import type { BackendFrameworkDetection } from './backend-framework-contract.js';
import {
  getFrontendFrameworkContract,
  getFrontendLifecycleScriptCandidates,
  type FrontendLifecycleCommand,
  type FrontendPlatformKey,
} from './frontend-framework-contract.js';
import {
  buildMissingPackageScriptRepairCapability,
  inferFrontendTestScriptValue,
  type DoctorRepairCapability,
} from './doctor-repair-capabilities.js';

export type DoctorFrontendProbe = {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  severity: 'info' | 'warn' | 'error';
  scope: 'project-scoped';
  reason: string;
  recommendation?: string;
  repairCapability?: DoctorRepairCapability;
};

const NODE_ESLINT_CONFIG_FILES = [
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yaml',
  '.eslintrc.yml',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
] as const;

const NODE_TEST_DIRECTORIES = [
  'tests',
  'test',
  'src/test',
  '__tests__',
  'e2e',
  'playwright',
  'cypress',
] as const;

const NODE_TEST_CONFIG_FILES = [
  'vitest.config.ts',
  'vitest.config.js',
  'vitest.config.mjs',
  'jest.config.js',
  'jest.config.ts',
  'jest.config.mjs',
  'playwright.config.ts',
  'playwright.config.js',
  'cypress.config.js',
  'cypress.config.ts',
] as const;

const FRONTEND_SOURCE_DIRECTORIES = ['src', 'app', 'pages'] as const;

const FRONTEND_LIFECYCLE_COMMANDS: FrontendLifecycleCommand[] = ['dev', 'build', 'test', 'lint'];

function readPackageScripts(
  packageJsonData: Record<string, unknown> | null | undefined
): Record<string, string> {
  const scripts = packageJsonData?.scripts;
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) {
    return {};
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(scripts)) {
    if (typeof value === 'string' && value.trim().length > 0) {
      normalized[key] = value;
    }
  }
  return normalized;
}

export async function detectNodeEslintConfigured(
  projectPath: string,
  packageJsonData?: Record<string, unknown> | null
): Promise<boolean> {
  for (const candidate of NODE_ESLINT_CONFIG_FILES) {
    if (await fsExtra.pathExists(path.join(projectPath, candidate))) {
      return true;
    }
  }

  const packageJson =
    packageJsonData ??
    ((await fsExtra.pathExists(path.join(projectPath, 'package.json')))
      ? ((await fsExtra.readJson(path.join(projectPath, 'package.json'))) as Record<
          string,
          unknown
        >)
      : null);

  if (!packageJson) {
    return false;
  }

  if (packageJson.eslintConfig) {
    return true;
  }

  const dependencies = {
    ...((packageJson.dependencies as Record<string, unknown> | undefined) ?? {}),
    ...((packageJson.devDependencies as Record<string, unknown> | undefined) ?? {}),
  };

  return Boolean(
    dependencies.eslint || dependencies['@eslint/js'] || dependencies['@eslint/eslintrc']
  );
}

export async function detectNodeTestSurface(
  projectPath: string,
  packageJsonData?: Record<string, unknown> | null
): Promise<boolean> {
  for (const directory of NODE_TEST_DIRECTORIES) {
    if (await fsExtra.pathExists(path.join(projectPath, directory))) {
      return true;
    }
  }

  for (const configFile of NODE_TEST_CONFIG_FILES) {
    if (await fsExtra.pathExists(path.join(projectPath, configFile))) {
      return true;
    }
  }

  const scripts = readPackageScripts(packageJsonData);
  if (
    scripts.test ||
    scripts['test:unit'] ||
    scripts['test:e2e'] ||
    scripts['test:ci'] ||
    scripts['test:watch']
  ) {
    return true;
  }

  const dependencies = {
    ...((packageJsonData?.dependencies as Record<string, unknown> | undefined) ?? {}),
    ...((packageJsonData?.devDependencies as Record<string, unknown> | undefined) ?? {}),
  };
  if (
    dependencies.vitest ||
    dependencies.jest ||
    dependencies['@playwright/test'] ||
    dependencies.cypress
  ) {
    return true;
  }

  return await hasFrontendTestFiles(projectPath);
}

async function hasFrontendTestFiles(projectPath: string): Promise<boolean> {
  const roots = ['src', 'app', 'pages', 'components'];
  const testFilePattern = /\.(test|spec)\.(tsx?|jsx?|vue|svelte)$/i;
  const maxDepth = 3;
  const ignoredDirs = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    'coverage',
    '.turbo',
  ]);

  for (const root of roots) {
    const rootPath = path.join(projectPath, root);
    if (!(await fsExtra.pathExists(rootPath))) {
      continue;
    }

    const queue: Array<{ dir: string; depth: number }> = [{ dir: rootPath, depth: 0 }];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        break;
      }

      let entries: string[] = [];
      try {
        entries = await fsExtra.readdir(current.dir);
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(current.dir, entry);
        if (testFilePattern.test(entry)) {
          return true;
        }

        if (current.depth >= maxDepth || ignoredDirs.has(entry) || entry.startsWith('.')) {
          continue;
        }

        try {
          const stat = await fsExtra.stat(fullPath);
          if (stat.isDirectory()) {
            queue.push({ dir: fullPath, depth: current.depth + 1 });
          }
        } catch {
          continue;
        }
      }
    }
  }

  return false;
}

export async function assessFrontendSourceTree(projectPath: string): Promise<boolean> {
  for (const directory of FRONTEND_SOURCE_DIRECTORIES) {
    const candidatePath = path.join(projectPath, directory);
    if (!(await fsExtra.pathExists(candidatePath))) {
      continue;
    }

    try {
      const entries = await fsExtra.readdir(candidatePath);
      if (entries.some((entry) => !entry.startsWith('.'))) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

function resolveFrontendPlatformKey(detection: BackendFrameworkDetection): FrontendPlatformKey {
  const key = detection.key;
  const contract = getFrontendFrameworkContract(key as FrontendPlatformKey);
  return contract.key;
}

function hasLifecycleScript(
  scripts: Record<string, string>,
  frameworkKey: FrontendPlatformKey,
  command: FrontendLifecycleCommand
): boolean {
  const candidates = getFrontendLifecycleScriptCandidates(frameworkKey, command);
  return candidates.some((candidate) => Boolean(scripts[candidate]));
}

export async function buildFrontendDoctorProbes(input: {
  projectPath: string;
  detection: BackendFrameworkDetection;
  packageJsonData?: Record<string, unknown> | null;
}): Promise<DoctorFrontendProbe[]> {
  const { projectPath, detection, packageJsonData } = input;
  const frameworkKey = resolveFrontendPlatformKey(detection);
  const contract = getFrontendFrameworkContract(frameworkKey);
  const scripts = readPackageScripts(packageJsonData);
  const probes: DoctorFrontendProbe[] = [];

  const lockExists =
    (await fsExtra.pathExists(path.join(projectPath, 'package-lock.json'))) ||
    (await fsExtra.pathExists(path.join(projectPath, 'pnpm-lock.yaml'))) ||
    (await fsExtra.pathExists(path.join(projectPath, 'yarn.lock'))) ||
    (await fsExtra.pathExists(path.join(projectPath, 'bun.lockb')));
  probes.push({
    id: 'frontend-lockfile-integrity',
    label: 'Frontend lockfile integrity',
    status: lockExists ? 'pass' : 'warn',
    severity: 'warn',
    scope: 'project-scoped',
    reason: lockExists
      ? 'Node lockfile detected for deterministic dependency restore.'
      : 'No Node lockfile detected (package-lock/yarn.lock/pnpm-lock.yaml/bun.lockb).',
    recommendation: lockExists
      ? undefined
      : 'Commit a lockfile for deterministic installs and CI parity.',
  });

  const tsconfigExists = await fsExtra.pathExists(path.join(projectPath, 'tsconfig.json'));
  const jsconfigExists = await fsExtra.pathExists(path.join(projectPath, 'jsconfig.json'));
  const hasTypeScriptSurface = tsconfigExists || jsconfigExists;
  probes.push({
    id: 'frontend-typescript-surface',
    label: 'TypeScript project surface',
    status: hasTypeScriptSurface ? 'pass' : 'warn',
    severity: 'warn',
    scope: 'project-scoped',
    reason: hasTypeScriptSurface
      ? tsconfigExists
        ? 'tsconfig.json detected.'
        : 'jsconfig.json detected.'
      : 'No tsconfig.json or jsconfig.json detected.',
    recommendation: hasTypeScriptSurface
      ? undefined
      : 'Add tsconfig.json (or jsconfig.json) for typed frontend builds and IDE parity.',
  });

  const frameworkConfigExists =
    contract.fileHints.length > 0 &&
    contract.fileHints.some((candidate) => existsSync(path.join(projectPath, candidate)));
  probes.push({
    id: 'frontend-framework-config',
    label: `${contract.displayName} config surface`,
    status: frameworkConfigExists ? 'pass' : 'warn',
    severity: 'warn',
    scope: 'project-scoped',
    reason: frameworkConfigExists
      ? `${contract.displayName} configuration artifacts detected.`
      : `No ${contract.displayName} config markers detected (${contract.fileHints.join(', ') || 'n/a'}).`,
    recommendation: frameworkConfigExists
      ? undefined
      : 'Keep framework config files in-repo for reproducible dev/build behavior.',
  });

  for (const command of FRONTEND_LIFECYCLE_COMMANDS) {
    const hasScript = hasLifecycleScript(scripts, frameworkKey, command);
    const required = command === 'dev' || command === 'build';
    const repairCapability =
      !hasScript && command === 'test'
        ? buildMissingPackageScriptRepairCapability({
            projectPath,
            frameworkDisplayName: contract.displayName,
            scriptName: command,
            scriptValue: inferFrontendTestScriptValue(scripts),
          })
        : undefined;
    probes.push({
      id: `frontend-script-${command}`,
      label: `${command} script surface`,
      status: hasScript ? 'pass' : required ? 'fail' : 'warn',
      severity: required ? 'error' : 'warn',
      scope: 'project-scoped',
      reason: hasScript
        ? `package.json exposes a ${command} script for ${contract.displayName}.`
        : `No ${command} script detected for ${contract.displayName}.`,
      recommendation: hasScript
        ? undefined
        : `Add a "${getFrontendLifecycleScriptCandidates(frameworkKey, command)[0] ?? command}" script to package.json.`,
      repairCapability,
    });
  }

  const sourceTreeHealthy = await assessFrontendSourceTree(projectPath);
  probes.push({
    id: 'frontend-source-tree',
    label: 'Frontend source tree',
    status: sourceTreeHealthy ? 'pass' : 'warn',
    severity: 'warn',
    scope: 'project-scoped',
    reason: sourceTreeHealthy
      ? 'Application source directories detected (src/app/pages).'
      : 'No frontend source directories detected under src/, app/, or pages/.',
    recommendation: sourceTreeHealthy
      ? undefined
      : 'Ensure the scaffolded application tree exists before running lifecycle commands.',
  });

  return probes;
}
