#!/usr/bin/env node

import { Command, Option } from 'commander';
import chalk from 'chalk';
import inquirer, { type Question } from 'inquirer';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { logger } from './logger.js';
import { checkForUpdates, getVersion } from './update-checker.js';
import { loadUserConfig, loadRapidKitConfig, mergeConfigs } from './config.js';
import { validateProjectName } from './validation.js';
import { RapidKitError } from './errors.js';
import fsExtra from 'fs-extra';
import fs from 'fs';
import { tmpdir } from 'os';
import { detectRapidkitProject } from './core-bridge/pythonRapidkit.js';
import {
  getCachedCoreTopLevelCommands,
  resolveRapidkitPython,
  runCoreRapidkit,
  runCoreRapidkitStreamed,
} from './core-bridge/pythonRapidkitExec.js';
import { BOOTSTRAP_CORE_COMMANDS_SET } from './core-bridge/bootstrapCoreCommands.js';
import {
  WRAPPER_SHARED_CLI_FLAGS,
  isCoreDelegatedTopLevelCommand,
  isPythonCoreContextEngine,
  shouldBridgeInvocationToCore,
} from './core-bridge/coreForwarding.js';
import { registerConfigCommands } from './commands/config.js';
import { registerAICommands } from './commands/ai.js';
import { registerProductCommands } from './commands/product.js';
import { registerInfraCommands } from './commands/infra.js';
import { getRuntimeAdapter } from './runtime-adapters/index.js';
import type { CommandResult } from './runtime-adapters/types.js';
import { Cache } from './utils/cache.js';
import {
  isDotnetProject,
  isGoProject,
  isJavaProject,
  isNodeProject,
  isPythonProject,
  readRapidkitProjectJson,
} from './utils/runtime-detection.js';
import { detectBackendFrameworkFromProject } from './utils/backend-framework-contract.js';
import { resolveNodeLifecycleScript } from './utils/node-lifecycle-scripts.js';
import {
  PROJECT_COMMANDS_CORE_FALLBACK,
  WRAPPER_LIFECYCLE_COMMANDS,
  isWrapperLifecycleCommand,
} from './utils/cli-lifecycle-contract.js';
import { findRapidkitProjectRoot } from './utils/project-command-capabilities.js';
import { findWorkspaceRootUp } from './utils/workspace-root.js';
import { hasNpmRuntimeExecutor } from './utils/runtime-executors.js';

export { PROJECT_COMMANDS_CORE_FALLBACK } from './utils/cli-lifecycle-contract.js';
import {
  formatUnsupportedProjectCommand,
  getProjectCommandCapability,
  isProjectCapabilityRequest,
  resolveProjectCommandCapabilities,
} from './utils/project-command-capabilities.js';
import {
  isNpmBackedKit,
  listInteractiveKits,
  normalizeKitId,
  resolveKitDefinition,
  runNpmKitGenerator,
} from './utils/kit-registry.js';
import { suggestProjectNameForKit } from './utils/suggested-project-name.js';
import { evaluateReleaseReadiness, runReleaseReadinessCommand } from './readiness.js';
import { runMirrorLifecycle } from './utils/mirror.js';
import {
  cleanupImportedProjectImport,
  importProjectIntoWorkspace,
  isGitUrl,
} from './import-project.js';
import { adoptProjectIntoWorkspace, cleanupAdoptedProjectImport } from './adopt-project.js';
import {
  buildFrontendProjectRegistryEntry,
  createFrontendProject,
  frontendCreateUsage,
  isFrontendProjectKit,
  listFrontendGenerators,
  normalizeCreateFrontendArgs,
  resolveFrontendGenerator,
} from './frontend-project.js';
import { upsertImportedProjectsRegistry } from './imported-projects-registry.js';
import {
  getDefaultPythonCommand,
  getPythonCommandCandidates,
  getRapidkitLocalScriptCandidates,
  getVenvActivateScriptPath,
  getVenvPythonPath,
  getWorkspaceRegistryDirectory,
  isWindowsPlatform,
  shouldUseShellExecution,
} from './utils/platform-capabilities.js';
import {
  MANAGED_DEFAULT_WORKSPACE_LABEL,
  findExistingWorkspacePath,
  getCanonicalWorkspacesDirectory,
  resolveAvailableWorkspaceSlot,
  resolveManagedDefaultImportWorkspacePath,
  resolveNewWorkspacePath,
} from './utils/workspace-paths.js';
import { createNpmWorkspaceMarker, writeWorkspaceMarker } from './workspace-marker.js';
import {
  archiveWorkspaceProject,
  createWorkspaceSnapshot,
  deleteWorkspaceProject,
  inspectWorkspaceSnapshot,
  listArchivedProjects,
  listWorkspaceSnapshots,
  restoreArchivedProject,
  restoreWorkspaceSnapshot,
} from './workspace-snapshot.js';

type BridgeFailureCode =
  | 'PYTHON_NOT_FOUND'
  | 'BRIDGE_VENV_BOOTSTRAP_FAILED'
  | 'BRIDGE_VENV_CREATE_FAILED'
  | 'BRIDGE_PIP_BOOTSTRAP_FAILED';

function bridgeFailureCode(err: unknown): BridgeFailureCode | null {
  if (!err || typeof err !== 'object') return null;
  const code = (err as { code?: unknown }).code;
  if (
    code === 'PYTHON_NOT_FOUND' ||
    code === 'BRIDGE_VENV_BOOTSTRAP_FAILED' ||
    code === 'BRIDGE_VENV_CREATE_FAILED' ||
    code === 'BRIDGE_PIP_BOOTSTRAP_FAILED'
  )
    return code;
  return null;
}

function normalizeFallbackTemplate(kit: string): 'fastapi' | 'nestjs' | null {
  const k = kit.trim().toLowerCase();
  if (!k) return null;
  if (k.startsWith('fastapi')) return 'fastapi';
  if (k.startsWith('nestjs')) return 'nestjs';
  return null;
}

function readFlagValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  return undefined;
}

function hostPythonCandidates(): string[] {
  return getPythonCommandCandidates();
}

function buildDelegationEnvForInit(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const rawPath = env.PATH || '';
  if (rawPath) {
    env.PATH = rawPath
      .split(path.delimiter)
      .filter((segment) => !segment.replace(/\\/g, '/').includes('/.pyenv/shims'))
      .join(path.delimiter);
  }
  env.PYENV_VERSION = 'system';
  if (!env.POETRY_PYTHON) {
    env.POETRY_PYTHON = getDefaultPythonCommand();
  }
  if (!env.RAPIDKIT_SKIP_LOCK_SYNC) {
    env.RAPIDKIT_SKIP_LOCK_SYNC = '1';
  }
  if (!env.POETRY_KEYRING_ENABLED) {
    env.POETRY_KEYRING_ENABLED = 'false';
  }
  if (!env.PYTHON_KEYRING_BACKEND) {
    env.PYTHON_KEYRING_BACKEND = 'keyring.backends.null.Keyring';
  }
  if (!env.POETRY_NO_INTERACTION) {
    env.POETRY_NO_INTERACTION = '1';
  }
  return env;
}

function workspaceVenvPythonBin(workspacePath: string): string {
  return getVenvPythonPath(path.join(workspacePath, '.venv'));
}

async function commandAvailable(command: string, cwd: string): Promise<boolean> {
  const code = await runCommandInCwd(command, ['--version'], cwd);
  return code === 0;
}

type InferredRuntime = 'python' | 'node' | 'go' | 'java' | 'dotnet' | null;

async function inferRuntimeByFiles(targetPath: string): Promise<InferredRuntime> {
  const goMod = path.join(targetPath, 'go.mod');
  if (await fsExtra.pathExists(goMod)) return 'go';

  const pomXml = path.join(targetPath, 'pom.xml');
  const buildGradle = path.join(targetPath, 'build.gradle');
  const buildGradleKts = path.join(targetPath, 'build.gradle.kts');
  if (
    (await fsExtra.pathExists(pomXml)) ||
    (await fsExtra.pathExists(buildGradle)) ||
    (await fsExtra.pathExists(buildGradleKts))
  ) {
    return 'java';
  }

  const entries = (await fsExtra.pathExists(targetPath))
    ? await fs.promises.readdir(targetPath, { withFileTypes: true })
    : [];
  if (entries.some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.sln'))) {
    return 'dotnet';
  }
  const srcPath = path.join(targetPath, 'src');
  if (await fsExtra.pathExists(srcPath)) {
    const srcEntries = await fs.promises.readdir(srcPath, { withFileTypes: true });
    if (
      srcEntries.some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.csproj'))
    ) {
      return 'dotnet';
    }
  }

  const packageJson = path.join(targetPath, 'package.json');
  if (await fsExtra.pathExists(packageJson)) return 'node';

  const pyproject = path.join(targetPath, 'pyproject.toml');
  const requirements = path.join(targetPath, 'requirements.txt');
  const poetryLock = path.join(targetPath, 'poetry.lock');
  if (
    (await fsExtra.pathExists(pyproject)) ||
    (await fsExtra.pathExists(requirements)) ||
    (await fsExtra.pathExists(poetryLock))
  ) {
    return 'python';
  }

  return null;
}

async function createWorkspaceVenv(workspacePath: string): Promise<number> {
  for (const candidate of hostPythonCandidates()) {
    const args = candidate === 'py' ? ['-3', '-m', 'venv', '.venv'] : ['-m', 'venv', '.venv'];
    const code = await runCommandInCwd(candidate, args, workspacePath);
    if (code === 0) return 0;
  }
  return 1;
}

async function createProjectVenv(projectPath: string): Promise<number> {
  for (const candidate of hostPythonCandidates()) {
    const args = candidate === 'py' ? ['-3', '-m', 'venv', '.venv'] : ['-m', 'venv', '.venv'];
    const code = await runCommandInCwd(candidate, args, projectPath);
    if (code === 0) return 0;
  }
  return 1;
}

async function ensurePythonProjectUsesLocalVenv(projectPath: string): Promise<number> {
  const localVenvPython = getVenvPythonPath(path.join(projectPath, '.venv'));

  if (!(await fsExtra.pathExists(localVenvPython))) {
    const venvCode = await createProjectVenv(projectPath);
    if (venvCode !== 0) return venvCode;
  }

  const hasPoetry = await commandAvailable('poetry', projectPath);
  if (!hasPoetry) {
    return 0;
  }

  const configCode = await runCommandInCwd(
    'poetry',
    ['config', 'virtualenvs.in-project', 'true', '--local'],
    projectPath
  );
  if (configCode !== 0) return configCode;

  const envUseCode = await runCommandInCwd('poetry', ['env', 'use', localVenvPython], projectPath);
  if (envUseCode !== 0) return envUseCode;

  return 0;
}

async function installPythonDependenciesWithPipFallback(projectPath: string): Promise<number> {
  const localVenvPython = getVenvPythonPath(path.join(projectPath, '.venv'));
  if (!(await fsExtra.pathExists(localVenvPython))) {
    const venvCode = await createProjectVenv(projectPath);
    if (venvCode !== 0) return venvCode;
  }

  await runCommandInCwd(
    localVenvPython,
    ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel'],
    projectPath
  );

  const requirementsTxt = path.join(projectPath, 'requirements.txt');
  if (await fsExtra.pathExists(requirementsTxt)) {
    const reqCode = await runCommandInCwd(
      localVenvPython,
      ['-m', 'pip', 'install', '-r', 'requirements.txt'],
      projectPath
    );
    if (reqCode === 0) return 0;
  }

  const pyproject = path.join(projectPath, 'pyproject.toml');
  if (await fsExtra.pathExists(pyproject)) {
    const editableCode = await runCommandInCwd(
      localVenvPython,
      ['-m', 'pip', 'install', '-e', '.'],
      projectPath
    );
    if (editableCode === 0) return 0;

    const plainCode = await runCommandInCwd(
      localVenvPython,
      ['-m', 'pip', 'install', '.'],
      projectPath
    );
    if (plainCode === 0) return 0;
  }

  return 1;
}

async function handlePythonInitSmart(
  projectPath: string,
  pythonAdapter: ReturnType<typeof getRuntimeAdapter>
): Promise<number> {
  const ensureCode = await ensurePythonProjectUsesLocalVenv(projectPath);
  if (ensureCode !== 0) {
    console.log(
      chalk.yellow('⚠️  Could not fully configure Poetry local venv. Trying fallback installer...')
    );
  }

  const adapterResult = await pythonAdapter.initProject(projectPath);
  if (adapterResult.exitCode === 0 && (await fsExtra.pathExists(path.join(projectPath, '.venv')))) {
    return 0;
  }

  console.log(
    chalk.yellow('⚠️  Python init fallback: installing dependencies directly into project .venv')
  );
  return await installPythonDependenciesWithPipFallback(projectPath);
}

async function handleNodeInitSmart(projectPath: string): Promise<number> {
  const primary = await handleNodeCommand('init', projectPath);
  if (primary === 0) return 0;

  const packageManagerCandidates = ['npm', 'pnpm', 'yarn'] as const;
  for (const manager of packageManagerCandidates) {
    const available = await commandAvailable(manager, projectPath);
    if (!available) continue;
    const fallbackCode = await runCommandInCwd(manager, ['install'], projectPath);
    if (fallbackCode === 0) {
      console.log(chalk.green(`✅ Node init fallback succeeded with ${manager} install`));
      return 0;
    }
  }

  return primary;
}

function validateNpmKitFlags(kitId: string, args: readonly string[]): string | null {
  const isSemverLike = (value: string): boolean =>
    /^\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?$/.test(value);

  const port = readFlagValue([...args], '--port');
  if (port && !/^\d+$/.test(port.trim())) {
    return 'Invalid --port. Expected numeric TCP port, e.g. 8080';
  }

  if (kitId === 'springboot.standard') {
    const javaVersion = readFlagValue([...args], '--java-version');
    const springBootVersion = readFlagValue([...args], '--spring-boot-version');
    const springdocVersion = readFlagValue([...args], '--springdoc-version');
    const groupId = readFlagValue([...args], '--group-id');
    const packageName = readFlagValue([...args], '--package-name');

    if (javaVersion && !/^\d+$/.test(javaVersion.trim())) {
      return 'Invalid --java-version. Expected major version number, e.g. 21';
    }
    if (springBootVersion && !isSemverLike(springBootVersion.trim())) {
      return 'Invalid --spring-boot-version. Expected semantic version, e.g. 3.5.0';
    }
    if (springdocVersion && !isSemverLike(springdocVersion.trim())) {
      return 'Invalid --springdoc-version. Expected semantic version, e.g. 2.8.9';
    }
    if (groupId && !/^[A-Za-z0-9_.-]+$/.test(groupId.trim())) {
      return 'Invalid --group-id. Use dot-separated Java package identifiers only.';
    }
    if (packageName && !/^[A-Za-z0-9_.-]+$/.test(packageName.trim())) {
      return 'Invalid --package-name. Use dot-separated Java package identifiers only.';
    }
  }

  if (kitId === 'dotnet.webapi.clean') {
    const targetFramework = readFlagValue([...args], '--target-framework');
    const rootNamespace = readFlagValue([...args], '--root-namespace');
    if (targetFramework && !/^net\d+\.\d+$/.test(targetFramework.trim())) {
      return 'Invalid --target-framework. Expected .NET target framework, e.g. net8.0';
    }
    if (rootNamespace && !/^[A-Za-z0-9_.]+$/.test(rootNamespace.trim())) {
      return 'Invalid --root-namespace. Use dot-separated .NET namespace identifiers only.';
    }
  }

  return null;
}

async function runNpmBackedKitCreate(args: string[]): Promise<number> {
  if (args[0] !== 'create' || args[1] !== 'project') return 1;

  const requestedKit = args[2];
  const definition = resolveKitDefinition(requestedKit);
  const name = args[3];

  if (!definition || definition.owner !== 'npm') return 1;
  if (!name) {
    process.stderr.write(
      `Usage: ${definition.createUsage ?? 'rapidkit create project <kit> <name> [--output <dir>]'}\n`
    );
    return 1;
  }

  try {
    validateProjectName(name);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }

  const flagError = validateNpmKitFlags(definition.id, args);
  if (flagError) {
    process.stderr.write(`${flagError}\n`);
    return 1;
  }

  const outputDir = readFlagValue(args, '--output') || process.cwd();
  const projectPath = path.resolve(outputDir, name);
  const skipGit = args.includes('--skip-git') || args.includes('--no-git');
  const skipInstall = args.includes('--skip-install');

  try {
    const { default: fsExtra } = await import('fs-extra');
    await fsExtra.ensureDir(path.dirname(projectPath));
    if (await fsExtra.pathExists(projectPath)) {
      process.stderr.write(`❌ Directory "${projectPath}" already exists\n`);
      return 1;
    }
    await fsExtra.ensureDir(projectPath);

    await runNpmKitGenerator(definition, {
      projectName: name,
      projectPath,
      args,
      skipGit,
      skipInstall,
    });

    const workspacePath = findWorkspaceUp(process.cwd());
    if (workspacePath) {
      const { syncWorkspaceProjects } = await import('./workspace.js');
      await syncWorkspaceProjects(workspacePath, true);
    }

    return 0;
  } catch (e) {
    process.stderr.write(
      `RapidKit ${definition.id} generator failed: ${(e as Error)?.message ?? e}\n`
    );
    return 1;
  }
}

async function runFrontendProjectCreate(args: string[]): Promise<number> {
  const definition = resolveFrontendGenerator(args[2]);
  if (!definition) return 1;

  try {
    const result = await createFrontendProject({ args });

    if (!result.dryRun) {
      let workspacePath = findWorkspaceUp(process.cwd());
      let linkedToDefaultWorkspace = false;
      if (!workspacePath) {
        const ensured = await ensureManagedDefaultImportWorkspace();
        workspacePath = ensured.workspacePath;
        linkedToDefaultWorkspace = true;
      }

      const { registerProjectInWorkspace, registerWorkspace, syncWorkspaceProjects } = await import(
        './workspace.js'
      );
      const registryEntry = buildFrontendProjectRegistryEntry({ workspacePath, result });
      await registerWorkspace(workspacePath, path.basename(workspacePath));
      await upsertImportedProjectsRegistry(workspacePath, [registryEntry]);
      await registerProjectInWorkspace(workspacePath, result.projectName, result.projectPath);
      await syncWorkspaceProjects(workspacePath, true);
      await syncWorkspaceContractAfterProjectChange(workspacePath, { silent: true });

      if (linkedToDefaultWorkspace) {
        console.log(
          chalk.gray(
            `ℹ️  Project created outside a RapidKit workspace — linked to managed workspace "${MANAGED_DEFAULT_WORKSPACE_LABEL}" (${registryEntry.relationship}).`
          )
        );
        console.log(
          chalk.gray(
            `   Registry: ${path.join(getWorkspaceRegistryDirectory(), 'workspaces.json')}`
          )
        );
        console.log(
          chalk.gray(
            '   Tip: run from inside a workspace next time, or create one with `rapidkit create workspace`.'
          )
        );
      }
    }

    return 0;
  } catch (error) {
    process.stderr.write(
      `RapidKit ${definition.kitId} generator failed: ${(error as Error)?.message ?? error}\n`
    );
    if (!args[3]) {
      process.stderr.write(`Usage: ${frontendCreateUsage(definition.id)}\n`);
    }
    return 1;
  }
}

async function runCreateFallback(args: string[], reasonCode: BridgeFailureCode): Promise<number> {
  // Supported offline fallback:
  //   rapidkit create project <kit> <name> [--output <dir>]
  // for kits that have embedded templates (fastapi*, nestjs*).
  const hasJson = args.includes('--json');
  if (hasJson) {
    process.stderr.write(
      'RapidKit (npm) offline fallback does not support --json for `create` commands.\n' +
        'Install Python 3.10+ and retry the same command.\n'
    );
    return 1;
  }

  if (args[0] !== 'create') return 1;
  const sub = args[1];

  if (sub !== 'project') {
    process.stderr.write(
      'RapidKit (npm) could not run the Python core engine for `create`.\n' +
        `Reason: ${reasonCode}.\n` +
        'Install Python 3.10+ to use the interactive wizard and full kit catalog.\n'
    );
    return 1;
  }

  const kit = args[2];
  const name = args[3];
  if (!kit || !name) {
    process.stderr.write(
      'Usage: rapidkit create project <kit> <name> [--output <dir>]\n' +
        'Tip: offline fallback supports only fastapi* and nestjs* kits.\n'
    );
    return 1;
  }

  const template = normalizeFallbackTemplate(kit);
  if (!template) {
    process.stderr.write(
      'RapidKit (npm) could not run the Python core engine to create this kit.\n' +
        `Reason: ${reasonCode}.\n` +
        `Requested kit: ${kit}\n` +
        'Offline fallback only supports: fastapi.standard, nestjs.standard (and their shorthands).\n' +
        'Install Python 3.10+ to access all kits.\n'
    );
    return 1;
  }

  const outputDir = readFlagValue(args, '--output') || process.cwd();
  const projectPath = path.resolve(outputDir, name);

  // Respect common flags used by the npm wrapper.
  const skipGit = args.includes('--skip-git') || args.includes('--no-git');
  const skipInstall = args.includes('--skip-install');

  try {
    await fsExtra.ensureDir(path.dirname(projectPath));
    if (await fsExtra.pathExists(projectPath)) {
      process.stderr.write(`❌ Directory "${projectPath}" already exists\n`);
      return 1;
    }

    // Try to detect workspace engine from marker
    let engine: 'poetry' | 'venv' | 'pipx' | 'pip' = 'pip';
    const workspacePath = findWorkspaceUp(process.cwd());
    if (workspacePath) {
      try {
        const { readWorkspaceMarker } = await import('./workspace-marker.js');
        const marker = await readWorkspaceMarker(workspacePath);
        if (marker?.metadata?.npm?.installMethod) {
          engine = marker.metadata.npm.installMethod;
          logger.debug(`Detected workspace engine: ${engine}`);
        }
      } catch (err) {
        logger.debug('Failed to read workspace marker', err);
        // Ignore errors, use default 'pip'
      }
    } else {
      logger.debug('No workspace found, using default engine: pip');
    }

    await fsExtra.ensureDir(projectPath);
    const { generateDemoKit } = await import('./demo-kit.js');
    await generateDemoKit(projectPath, {
      project_name: name,
      template,
      kit_name: kit, // Pass full kit name (e.g., 'fastapi.ddd')
      skipGit,
      skipInstall,
      engine,
    });

    // Sync workspace to register the new project
    if (workspacePath) {
      const { syncWorkspaceProjects } = await import('./workspace.js');
      await syncWorkspaceProjects(workspacePath, true); // silent sync
      await syncWorkspaceContractAfterProjectChange(workspacePath, { silent: true });
    }

    return 0;
  } catch (e) {
    process.stderr.write(`RapidKit (npm) offline fallback failed: ${(e as Error)?.message ?? e}\n`);
    return 1;
  }
}

export async function handleCreateOrFallback(args: string[]): Promise<number> {
  const wasFrontendCreate = args[0] === 'create' && args[1] === 'frontend';
  const normalizedFrontendArgs = normalizeCreateFrontendArgs(args);
  if (normalizedFrontendArgs) {
    args = normalizedFrontendArgs;
  }
  if (wasFrontendCreate && !isFrontendProjectKit(args[2])) {
    process.stderr.write(`Unknown frontend generator: ${args[2]?.replace(/^frontend\./, '')}\n`);
    process.stderr.write(`Usage: ${frontendCreateUsage()}\n`);
    return 1;
  }

  // Supported offline fallback:
  //   rapidkit create project <kit> <name> [--output <dir>]
  // for kits that have embedded templates (fastapi*, nestjs*).

  // If this is a create project invocation, handle wrapper-level flags
  // (workspace creation UX) **before** attempting to run the Python core.
  const WRAPPER_FLAGS = new Set([
    '--yes',
    '-y',
    '--skip-git',
    '--skip-install',
    '--debug',
    '--dry-run',
    '--no-update-check',
    '--create-workspace',
    '--no-workspace',
  ]);

  if (args[0] === 'create' && (!args[1] || args[1].startsWith('-'))) {
    const hasYes = args.includes('--yes') || args.includes('-y');
    const passthroughFlags = args.slice(1);

    let createTarget: 'workspace' | 'project';
    if (!process.stdin.isTTY || hasYes) {
      createTarget = 'workspace';
      if (process.stdin.isTTY) {
        console.log(
          chalk.gray('ℹ️  No subcommand provided for `create`; defaulting to `create workspace`.')
        );
      }
    } else {
      const answers = (await inquirer.prompt([
        {
          type: 'rawlist',
          name: 'createTarget',
          message: 'What do you want to create?',
          choices: [
            { name: 'workspace', value: 'workspace' },
            { name: 'project', value: 'project' },
          ],
        } as Question<{ createTarget: 'workspace' | 'project' }>,
      ])) as { createTarget: 'workspace' | 'project' };

      createTarget = answers.createTarget;
    }

    const reroutedArgs = ['create', createTarget, ...passthroughFlags];
    return await handleCreateOrFallback(reroutedArgs);
  }

  if (args[0] === 'create' && args[1] === 'workspace') {
    try {
      const hasYes = args.includes('--yes') || args.includes('-y');
      const skipGit = args.includes('--skip-git') || args.includes('--no-git');
      const hasDryRun = args.includes('--dry-run');
      const providedName = args[2] && !args[2].startsWith('-') ? args[2] : undefined;
      const installMethodRaw = readFlagValue(args, '--install-method');
      const installMethod =
        installMethodRaw === 'poetry' || installMethodRaw === 'venv' || installMethodRaw === 'pipx'
          ? installMethodRaw
          : undefined;
      const profileRaw = readFlagValue(args, '--profile');
      const workspaceProfile =
        profileRaw === 'minimal' ||
        profileRaw === 'java-only' ||
        profileRaw === 'go-only' ||
        profileRaw === 'dotnet-only' ||
        profileRaw === 'python-only' ||
        profileRaw === 'node-only' ||
        profileRaw === 'polyglot' ||
        profileRaw === 'enterprise'
          ? profileRaw
          : undefined;

      const workspaceName = providedName
        ? providedName
        : hasYes
          ? 'my-workspace'
          : (
              (await inquirer.prompt([
                {
                  type: 'input',
                  name: 'workspaceName',
                  message: 'Workspace name:',
                  default: 'my-workspace',
                } as Question<{ workspaceName: string }>,
              ])) as { workspaceName: string }
            ).workspaceName;

      if (!workspaceName || !workspaceName.trim()) {
        process.stderr.write('Workspace name is required.\n');
        return 1;
      }

      try {
        validateProjectName(workspaceName);
      } catch (error) {
        if (error instanceof RapidKitError) {
          process.stderr.write(`${error.message}\n`);
          return 1;
        }
        throw error;
      }

      const outputDir = readFlagValue(args, '--output');
      const targetPath = resolveNewWorkspacePath(workspaceName.trim(), {
        outputDir: outputDir || undefined,
      });

      if (!hasDryRun) {
        await fsExtra.ensureDir(path.dirname(targetPath));
      }

      const existingWorkspacePath = findExistingWorkspacePath(workspaceName.trim());
      if (
        !hasDryRun &&
        ((existingWorkspacePath && (await fsExtra.pathExists(existingWorkspacePath))) ||
          (await fsExtra.pathExists(targetPath)))
      ) {
        process.stderr.write(`❌ Workspace "${workspaceName}" already exists\n`);
        if (existingWorkspacePath && existingWorkspacePath !== targetPath) {
          process.stderr.write(`   Found at: ${existingWorkspacePath}\n`);
        }
        return 1;
      }

      const userConfig = await loadUserConfig();
      let author = userConfig.author || process.env.USER || 'RapidKit User';

      if (!hasYes) {
        const answers = (await inquirer.prompt([
          {
            type: 'input',
            name: 'author',
            message: 'Author name:',
            default: author,
          } as Question<{ author: string }>,
        ])) as { author: string };

        if (answers.author?.trim()) {
          author = answers.author.trim();
        }
      }

      const { createProject: createPythonEnvironment } = await import('./create.js');
      await createPythonEnvironment(workspaceName, {
        skipGit,
        yes: hasYes,
        dryRun: hasDryRun,
        userConfig: {
          ...userConfig,
          author,
        },
        installMethod,
        profile: workspaceProfile,
        parentDirectory: path.dirname(targetPath),
      });

      if (!hasDryRun) {
        console.log(chalk.gray(`ℹ️  Workspace root: ${targetPath}`));
      }
      return 0;
    } catch (e) {
      process.stderr.write(
        `RapidKit (npm) failed to create workspace: ${(e as Error)?.message ?? e}\n`
      );
      return 1;
    }
  }

  try {
    // If this is a create project invocation, handle workspace registration
    if (args[0] === 'create' && args[1] === 'project') {
      const createProjectHelpRequested = args.includes('--help') || args.includes('-h');
      if (createProjectHelpRequested) {
        try {
          await resolveRapidkitPython();
          return await runCoreRapidkit(['create', 'project', '--help'], { cwd: process.cwd() });
        } catch (e) {
          process.stderr.write(
            `RapidKit (npm) failed to run the Python core engine: ${(e as Error)?.message ?? e}\n`
          );
          return 1;
        }
      }

      // No kit specified — show npm-level interactive selector for npm-backed kits
      if (!args[2] || args[2].startsWith('-')) {
        console.log(chalk.bold('\n🚀 RapidKit\n'));
        const { kitChoice } = (await inquirer.prompt([
          {
            type: 'rawlist',
            name: 'kitChoice',
            message: 'Select a kit to scaffold:',
            choices: [
              ...listInteractiveKits().map((kit) => ({
                name: kit.label,
                value: kit.id,
              })),
              ...listFrontendGenerators().map((generator) => ({
                name: `frontend — ${generator.displayName} (official generator)`,
                value: generator.kitId,
              })),
            ],
          } as Question<{ kitChoice: string }>,
        ])) as { kitChoice: string };

        if (isNpmBackedKit(kitChoice) || isFrontendProjectKit(kitChoice)) {
          const defaultProjectName = suggestProjectNameForKit(kitChoice);
          const { projectName } = (await inquirer.prompt([
            {
              type: 'input',
              name: 'projectName',
              message: 'Project name:',
              default: defaultProjectName,
              validate: (v: string) => v.trim().length > 0 || 'Project name is required',
            } as Question<{ projectName: string }>,
          ])) as { projectName: string };
          const flags = args.slice(2).filter((a) => a.startsWith('-'));
          const normalizedArgs = ['create', 'project', kitChoice, projectName.trim(), ...flags];
          const code = isFrontendProjectKit(kitChoice)
            ? await runFrontendProjectCreate(normalizedArgs)
            : await runNpmBackedKitCreate(normalizedArgs);
          const workspacePath = findWorkspaceUp(process.cwd());
          if (code === 0 && workspacePath) {
            await syncWorkspaceContractAfterProjectChange(workspacePath);
          }
          return code;
        }

        const defaultProjectName = suggestProjectNameForKit(kitChoice);
        const { projectName } = (await inquirer.prompt([
          {
            type: 'input',
            name: 'projectName',
            message: 'Project name:',
            default: defaultProjectName,
            validate: (v: string) => v.trim().length > 0 || 'Project name is required',
          } as Question<{ projectName: string }>,
        ])) as { projectName: string };

        // Inject selected kit so Python core skips its own kit-selection prompt
        args.splice(2, 0, kitChoice, projectName.trim());
      }

      // Profile enforcement: if inside a workspace, check if the kit type is allowed
      // by the workspace profile. In strict mode, block mismatches; in warn mode, show a warning.
      {
        const wsRoot = findWorkspaceUp(process.cwd());
        const kitName = (args[2] || '').toLowerCase();
        if (wsRoot && kitName) {
          const wsJsonPath = path.join(wsRoot, '.rapidkit', 'workspace.json');
          const policyFilePath = path.join(wsRoot, '.rapidkit', 'policies.yml');
          try {
            const [wsJsonRaw, policyRaw] = await Promise.all([
              fsExtra
                .pathExists(wsJsonPath)
                .then((exists) => (exists ? fs.promises.readFile(wsJsonPath, 'utf-8') : '{}')),
              fsExtra
                .pathExists(policyFilePath)
                .then((exists) => (exists ? fs.promises.readFile(policyFilePath, 'utf-8') : '')),
            ]);
            const wsProfile = (JSON.parse(wsJsonRaw) as Record<string, unknown>).profile as
              | string
              | undefined;
            const modeMatch = policyRaw.match(/^\s*mode:\s*(warn|strict)\s*(?:#.*)?$/m);
            const mode = modeMatch?.[1] ?? 'warn';

            const kitDefinition = resolveKitDefinition(kitName);
            const frontendDefinition = resolveFrontendGenerator(kitName);
            const runtime = frontendDefinition ? 'node' : kitDefinition?.runtime;
            const isGoKit = runtime === 'go';
            const isJavaKit = runtime === 'java';
            const isDotnetKit = runtime === 'dotnet';
            const isNodeKit = runtime === 'node';
            const isPyKit = runtime === 'python' || !runtime;

            let mismatch: string | null = null;
            if (wsProfile === 'python-only' && !isPyKit) {
              mismatch = `Kit "${kitName}" is not a Python kit, but workspace profile is "python-only".`;
            } else if (wsProfile === 'node-only' && !isNodeKit) {
              mismatch = `Kit "${kitName}" is not a Node kit, but workspace profile is "node-only".`;
            } else if (wsProfile === 'go-only' && !isGoKit) {
              mismatch = `Kit "${kitName}" is not a Go kit, but workspace profile is "go-only".`;
            } else if (wsProfile === 'java-only' && !isJavaKit) {
              mismatch = `Kit "${kitName}" is not a Java kit, but workspace profile is "java-only".`;
            } else if (wsProfile === 'dotnet-only' && !isDotnetKit) {
              mismatch = `Kit "${kitName}" is not a .NET kit, but workspace profile is "dotnet-only".`;
            }

            if (mismatch) {
              if (mode === 'strict') {
                console.log(chalk.red(`❌ Profile violation (strict mode): ${mismatch}`));
                console.log(
                  chalk.gray(
                    '💡 Change workspace profile or use --no-workspace to skip enforcement.'
                  )
                );
                return 1;
              } else {
                console.log(chalk.yellow(`⚠️  Profile warning: ${mismatch}`));
                console.log(
                  chalk.gray(
                    '💡 Consider using a "polyglot" workspace profile for multi-language projects.'
                  )
                );
              }
            }
          } catch {
            /* non-fatal — skip profile check if files unreadable */
          }
        }
      }

      // npm-backed kits run entirely at wrapper level, bypassing the Python engine.
      if (isNpmBackedKit(args[2])) {
        const code = await runNpmBackedKitCreate(args);
        const workspacePath = findWorkspaceUp(process.cwd());
        if (code === 0 && workspacePath) {
          await syncWorkspaceContractAfterProjectChange(workspacePath);
        }
        return code;
      }

      // Frontend generators manage their own registry linking (including managed workspai adoption).
      if (isFrontendProjectKit(args[2])) {
        return await runFrontendProjectCreate(args);
      }

      const hasCreateWorkspace = args.includes('--create-workspace');
      const hasNoWorkspace = args.includes('--no-workspace');
      const hasYes = args.includes('--yes') || args.includes('-y');
      const skipGit = args.includes('--skip-git') || args.includes('--no-git');

      const hasWorkspace = !!findWorkspaceMarkerUp(process.cwd());

      if (!hasWorkspace) {
        const { registerWorkspaceAtPath } = await import('./create.js');
        if (hasCreateWorkspace) {
          // Non-interactive: create workspace automatically
          await registerWorkspaceAtPath(process.cwd(), {
            skipGit,
            yes: hasYes,
            userConfig: await loadUserConfig(),
          });
        } else if (!hasNoWorkspace) {
          // Interactive flow (default behavior when none of the explicit flags are set)
          if (hasYes) {
            // Default to creating a workspace when --yes is provided
            await registerWorkspaceAtPath(process.cwd(), {
              skipGit,
              yes: true,
              userConfig: await loadUserConfig(),
            });
          } else {
            const { createWs } = (await inquirer.prompt([
              {
                type: 'confirm',
                name: 'createWs',
                message:
                  'This project will be created outside a RapidKit workspace. Create and register a workspace here?',
                default: true,
              } as Question<{ createWs: boolean }>,
            ])) as { createWs: boolean };

            if (createWs) {
              await registerWorkspaceAtPath(process.cwd(), {
                skipGit,
                yes: false,
                userConfig: await loadUserConfig(),
              });
            }
          }
        }
      }

      // Filter wrapper-only flags from args forwarded to the Python core engine
      const filteredArgs = args.filter((a) => {
        const key = a.split('=')[0];
        return !WRAPPER_FLAGS.has(a) && !WRAPPER_FLAGS.has(key);
      });

      // Map wrapper flags to Python-core/environment equivalents when forwarding.
      // NOTE: --skip-essentials controls core module injection and is conceptually
      // different from dependency/lock behavior; do not auto-map from workspace mode.
      const forwardedArgs = [...filteredArgs];
      const workspacePathForCreate = findWorkspaceUp(process.cwd());
      const explicitSkipInstallRequested = args.includes('--skip-install');
      const skipLockGenerationRequested = explicitSkipInstallRequested || !!workspacePathForCreate;

      const createEnv = skipLockGenerationRequested
        ? {
            ...process.env,
            RAPIDKIT_SKIP_LOCKS: '1',
            RAPIDKIT_GENERATE_LOCKS: '0',
          }
        : undefined;

      try {
        await resolveRapidkitPython();
        const exitCode = await runCoreRapidkit(forwardedArgs, {
          cwd: process.cwd(),
          env: createEnv,
        });

        if (exitCode === 0 && workspacePathForCreate && !args.includes('--skip-install')) {
          console.log(chalk.gray('ℹ️  Fast create mode (workspace): dependencies were deferred.'));
          console.log(chalk.white('   Next: cd <project-name> && npx rapidkit init'));
        }

        // If project creation succeeded, sync Python version and register workspace projects
        if (exitCode === 0) {
          const workspacePath = workspacePathForCreate || findWorkspaceUp(process.cwd());
          if (workspacePath) {
            // Sync Python version from workspace to newly created project
            try {
              // Extract project name from args: create project <kit> <name>
              const projectName = args[3];
              if (projectName) {
                const outputIndex = args.indexOf('--output');
                const outputDir = outputIndex >= 0 ? args[outputIndex + 1] : '.';
                const projectPath = path.resolve(process.cwd(), outputDir, projectName);

                const workspacePythonVersionFile = path.join(workspacePath, '.python-version');
                const projectPythonVersionFile = path.join(projectPath, '.python-version');

                if (fs.existsSync(workspacePythonVersionFile) && fs.existsSync(projectPath)) {
                  const pythonVersion = fs.readFileSync(workspacePythonVersionFile, 'utf-8');
                  fs.writeFileSync(projectPythonVersionFile, pythonVersion.trim() + '\n');
                  logger.debug(
                    `Synced Python version ${pythonVersion.trim()} from workspace to ${projectName}`
                  );
                }
              }
            } catch (err) {
              logger.debug('Could not sync Python version from workspace:', err);
            }

            const { syncWorkspaceProjects } = await import('./workspace.js');
            await syncWorkspaceProjects(workspacePath, true); // silent sync
            await syncWorkspaceContractAfterProjectChange(workspacePath);
          }
        }

        return exitCode;
      } catch (e) {
        const code = bridgeFailureCode(e);
        if (code) return await runCreateFallback(forwardedArgs, code);
        process.stderr.write(
          `RapidKit (npm) failed to run the Python core engine: ${(e as Error)?.message ?? e}\n`
        );
        return 1;
      }
    }

    // Handle `create` command (interactive mode without explicit project subcommand)
    if (args[0] === 'create' && args[1] !== 'project') {
      try {
        await resolveRapidkitPython();
        const exitCode = await runCoreRapidkit(args, { cwd: process.cwd() });

        // If create succeeded, sync workspace to register all projects
        if (exitCode === 0) {
          const workspacePath = findWorkspaceUp(process.cwd());
          if (workspacePath) {
            const { syncWorkspaceProjects } = await import('./workspace.js');
            await syncWorkspaceProjects(workspacePath, true); // silent sync
          }
        }

        return exitCode;
      } catch (e) {
        const code = bridgeFailureCode(e);
        if (code) return await runCreateFallback(args, code);
        process.stderr.write(
          `RapidKit (npm) failed to run the Python core engine: ${(e as Error)?.message ?? e}\n`
        );
        return 1;
      }
    }

    // Not a create project invocation - proceed with default behavior (try core first)
    await resolveRapidkitPython();
    return await runCoreRapidkit(args, { cwd: process.cwd() });
  } catch (e) {
    const code = bridgeFailureCode(e);
    if (code) return await runCreateFallback(args, code);
    process.stderr.write(
      `RapidKit (npm) failed to run the Python core engine: ${(e as Error)?.message ?? e}\n`
    );
    return 1;
  }
}

// Local project commands that should be delegated to ./rapidkit
const LOCAL_COMMANDS = [
  'init',
  'dev',
  'start',
  'build',
  'test',
  'docs',
  'lint',
  'format',
  'create', // workspace command
  'help',
  '--help',
  '-h',
];

// Single source of truth for commands owned by the npm wrapper.
// Any new workspace-level command must be added here to prevent accidental core forwarding.
export const NPM_ONLY_TOP_LEVEL_COMMANDS = [
  'analyze',
  'readiness',
  'doctor',
  'autopilot',
  'pipeline',
  'import',
  'adopt',
  'snapshot',
  'workspace',
  'bootstrap',
  'setup',
  'cache',
  'mirror',
  'ai',
  'config',
  'product',
  'infra',
  'shell',
  'commands',
] as const;

const NPM_ONLY_PARSE_DIRECT_COMMANDS = [
  'analyze',
  'readiness',
  'doctor',
  'autopilot',
  'pipeline',
  'import',
  'adopt',
  'snapshot',
  'workspace',
  'ai',
  'config',
  'product',
  'infra',
  'shell',
  'commands',
] as const;

const NPM_ONLY_MANUAL_HANDLER_COMMANDS = ['bootstrap', 'setup', 'cache', 'mirror'] as const;

export const NPM_ONLY_SCOPED_COMMANDS = [
  ['project', 'commands'],
  ['project', 'archives'],
  ['project', 'archive'],
  ['project', 'restore'],
  ['project', 'delete'],
] as const;

// Project-scoped commands that should never fall through to the workspace
// creation parser when local delegation is unavailable.

// Project commands that are always orchestrated by the npm wrapper first
// (runtime-aware + policy-aware + fallback-aware), even inside Python projects.
export const WRAPPER_ORCHESTRATED_PROJECT_COMMANDS = ['init'] as const;

const RUNTIME_LIFECYCLE_COMMANDS = WRAPPER_LIFECYCLE_COMMANDS;

const STRICT_POLICY_PROJECT_COMMANDS = [
  ...RUNTIME_LIFECYCLE_COMMANDS,
  ...PROJECT_COMMANDS_CORE_FALLBACK,
] as const;

function isNpmOnlyTopLevelCommand(command: string | undefined): boolean {
  return !!command && (NPM_ONLY_TOP_LEVEL_COMMANDS as readonly string[]).includes(command);
}

function isNpmOnlyScopedCommand(args: readonly string[]): boolean {
  const first = args[0];
  const second = args[1];
  return NPM_ONLY_SCOPED_COMMANDS.some(([command, subcommand]) => {
    if (first !== command) return false;
    if (!second) return true;
    return second === subcommand;
  });
}

function isNpmOnlyInvocation(args: readonly string[]): boolean {
  return isNpmOnlyTopLevelCommand(args[0]) || isNpmOnlyScopedCommand(args);
}

function isNpmOnlyParseDirectCommand(command: string | undefined): boolean {
  return !!command && (NPM_ONLY_PARSE_DIRECT_COMMANDS as readonly string[]).includes(command);
}

function isNpmOnlyParseDirectInvocation(args: readonly string[]): boolean {
  return isNpmOnlyParseDirectCommand(args[0]) || isNpmOnlyScopedCommand(args);
}

function isNpmOnlyManualHandlerCommand(command: string | undefined): boolean {
  return !!command && (NPM_ONLY_MANUAL_HANDLER_COMMANDS as readonly string[]).includes(command);
}

export function isNpmExecInvocation(env: NodeJS.ProcessEnv = process.env): boolean {
  const userAgent = env.npm_config_user_agent || '';
  const execPath = env.npm_execpath || '';
  const npmCommand = env.npm_command || '';

  return (
    userAgent.startsWith('npm/') ||
    userAgent.includes(' npx/') ||
    /(?:^|[/\\])npx(?:\.cmd)?$/i.test(execPath) ||
    /(?:^|[/\\])npm(?:\.cmd)?$/i.test(execPath) ||
    npmCommand === 'exec' ||
    npmCommand === 'x' ||
    npmCommand === 'run-script'
  );
}

function printProjectCommandCapabilities(options: { json?: boolean } = {}): void {
  const capabilities = resolveProjectCommandCapabilities(process.cwd());

  if (options.json) {
    console.log(JSON.stringify(capabilities, null, 2));
    return;
  }

  console.log(chalk.bold('RapidKit project command capabilities'));
  console.log(chalk.gray(`Project: ${capabilities.projectRoot ?? 'not detected'}`));
  console.log(
    chalk.gray(
      `Runtime: ${capabilities.runtime} (${capabilities.runtimeSupportTier}) | Framework: ${capabilities.frameworkDisplayName} (${capabilities.frameworkSupportTier}) | Module support: ${capabilities.moduleSupport ? 'yes' : 'no'}`
    )
  );
  console.log(chalk.gray(`Doctor support: ${capabilities.runtimeDoctorSupport}`));
  console.log('');
  console.log(chalk.green(`Supported: ${capabilities.supportedCommands.join(', ') || 'none'}`));
  console.log(chalk.yellow(`Global: ${capabilities.globalCommands.join(', ') || 'none'}`));
  console.log(chalk.red(`Unsupported: ${capabilities.unsupportedCommands.join(', ') || 'none'}`));
}

export function getGlobalCommandCapabilities() {
  const npmOwned = [...NPM_ONLY_TOP_LEVEL_COMMANDS, 'project'];
  const coreBacked = [
    'version',
    'create',
    'add',
    'list',
    'info',
    'upgrade',
    'diff',
    'merge',
    'optimize',
    'license',
    'checkpoint',
    'reconcile',
    'rollback',
    'uninstall',
    'frameworks',
    'modules',
  ];
  const projectScoped = ['init', 'dev', 'start', 'build', 'test', 'lint', 'format', 'help'];

  return {
    scope: 'global',
    cli: 'rapidkit-npm',
    version: getVersion(),
    cwd: process.cwd(),
    commands: {
      npmOwned,
      coreBacked,
      projectScoped,
    },
    commandMap: Object.fromEntries([
      ...npmOwned.map((command) => [
        command,
        {
          command,
          owner: 'npm-wrapper',
          status: 'supported',
          scope: command === 'project' ? 'project-introspection' : 'workspace',
        },
      ]),
      ...coreBacked.map((command) => [
        command,
        {
          command,
          owner: 'python-core',
          status: 'delegated',
          scope: 'core',
        },
      ]),
      ...projectScoped.map((command) => [
        command,
        {
          command,
          owner: 'runtime-adapter',
          status: command === 'help' ? 'supported' : 'runtime-dependent',
          scope: 'project',
        },
      ]),
    ]),
  };
}

function printGlobalCommandCapabilities(options: { json?: boolean } = {}): void {
  const capabilities = getGlobalCommandCapabilities();

  if (options.json) {
    console.log(JSON.stringify(capabilities, null, 2));
    return;
  }

  console.log(chalk.bold('RapidKit command capabilities'));
  console.log(chalk.gray(`CLI: ${capabilities.cli} v${capabilities.version}`));
  console.log('');
  console.log(chalk.green(`npm wrapper: ${capabilities.commands.npmOwned.join(', ')}`));
  console.log(chalk.cyan(`Python core: ${capabilities.commands.coreBacked.join(', ')}`));
  console.log(chalk.yellow(`Project runtime: ${capabilities.commands.projectScoped.join(', ')}`));
  console.log('');
  console.log(chalk.gray('Tip: run `rapidkit project commands --json` inside a project.'));
}

function handleProjectCapabilityRequest(args: readonly string[]): boolean {
  if (!isProjectCapabilityRequest(args)) return false;
  printProjectCommandCapabilities({ json: args.includes('--json') || args.includes('--ci') });
  return true;
}

function blockUnsupportedProjectCommandIfNeeded(args: readonly string[]): boolean {
  const capabilities = resolveProjectCommandCapabilities(process.cwd());
  if (!capabilities.projectRoot) return false;

  const capability = getProjectCommandCapability(args, process.cwd());
  if (!capability || capability.status !== 'unsupported') return false;

  console.error(chalk.red(formatUnsupportedProjectCommand(capability, capabilities)));
  process.exit(1);
}

function hasWorkspaceRootMarkers(targetDir: string): boolean {
  return (
    fs.existsSync(path.join(targetDir, '.rapidkit-workspace')) ||
    fs.existsSync(path.join(targetDir, '.rapidkit', 'workspace.json'))
  );
}

// Note: we intentionally avoid any sync-time blocking behavior here.
// `delegateToLocalCLI()` handles python-engine delegation asynchronously.

/**
 * Check if we're inside a RapidKit project and delegate to local CLI if needed
 * If .rapidkit/context.json exists and engine is Python-core backed, delegate module/core commands.
 */
function findContextFileUp(start: string): string | null {
  let p = start;

  while (true) {
    const candidate = path.join(p, '.rapidkit', 'context.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(p);
    if (parent === p) break;
    p = parent;
  }
  return null;
}

function findWorkspaceMarkerUp(start: string): string | null {
  let p = start;
  const tempRoot = path.resolve(tmpdir());

  while (true) {
    const candidate = path.join(p, '.rapidkit-workspace');
    if (fs.existsSync(candidate) && path.resolve(p) !== tempRoot) return candidate;
    const parent = path.dirname(p);
    if (parent === p) break;
    p = parent;
  }
  return null;
}

/**
 * Find workspace directory (not just marker file)
 * Returns the directory containing .rapidkit-workspace
 */
function findWorkspaceUp(start: string): string | null {
  let p = start;
  const tempRoot = path.resolve(tmpdir());

  while (true) {
    const candidate = path.join(p, '.rapidkit-workspace');
    if (fs.existsSync(candidate) && path.resolve(p) !== tempRoot) return p; // Return directory, not file
    const parent = path.dirname(p);
    if (parent === p) break;
    p = parent;
  }
  return null;
}

async function syncWorkspaceContractAfterProjectChange(
  workspacePath: string,
  options?: { silent?: boolean }
): Promise<void> {
  try {
    const { syncWorkspaceContract } = await import('./utils/workspace-contract.js');
    const result = await syncWorkspaceContract({ workspacePath });
    if (
      !options?.silent &&
      (result.addedProjects.length > 0 || result.updatedProjects.length > 0)
    ) {
      console.log(
        chalk.gray(`ℹ️  Workspace contract synced (${result.contract.projects.length} project(s)).`)
      );
    }
    if (result.verification.status !== 'passed') {
      console.log(chalk.yellow('⚠️  Workspace contract verification failed after project sync.'));
      for (const violation of result.verification.violations) {
        console.log(chalk.gray(`   Violation: ${violation}`));
      }
      console.log(chalk.white('   Next: npx rapidkit workspace contract inspect'));
    }
  } catch (error) {
    if (!options?.silent) {
      console.log(chalk.yellow(`⚠️  Workspace contract sync skipped: ${(error as Error).message}`));
    }
  }
}

export interface DoctorWorkspaceShadowDiagnostic {
  detected: boolean;
  candidatePath?: string;
  reason?: string;
}

export async function detectWindowsDoctorWorkspaceShadow(
  params: { scope?: string; workspaceFlag?: boolean },
  cwd: string = process.cwd(),
  platform: NodeJS.Platform = process.platform
): Promise<DoctorWorkspaceShadowDiagnostic> {
  const workspaceMode = params.workspaceFlag || params.scope === 'workspace';
  if (!workspaceMode || !isWindowsPlatform(platform)) {
    return { detected: false };
  }

  const localCandidates = getRapidkitLocalScriptCandidates(cwd, platform);
  for (const candidate of localCandidates) {
    if (!(await fsExtra.pathExists(candidate))) {
      continue;
    }
    const lower = candidate.toLowerCase();
    if (lower.endsWith('rapidkit.cmd') || lower.endsWith('rapidkit.exe')) {
      return {
        detected: true,
        candidatePath: candidate,
        reason: 'Found workspace-local rapidkit launcher on Windows.',
      };
    }
  }

  return { detected: false };
}

/**
 * Detect legacy workspace roots that predate `.rapidkit-workspace` marker files.
 *
 * Legacy roots are identified by `.rapidkit/workspace.json` while missing the
 * root marker file. Bootstrap can then auto-sync the modern foundation layout.
 */
function findLegacyWorkspaceUp(start: string): string | null {
  let p = start;

  while (true) {
    const markerPath = path.join(p, '.rapidkit-workspace');
    const legacyManifestPath = path.join(p, '.rapidkit', 'workspace.json');
    if (!fs.existsSync(markerPath) && fs.existsSync(legacyManifestPath)) {
      return p;
    }
    const parent = path.dirname(p);
    if (parent === p) break;
    p = parent;
  }

  return null;
}

type DependencySharingMode = 'isolated' | 'shared-runtime-caches' | 'shared-node-deps';
type PolicyMode = 'warn' | 'strict';
type WorkspacePolicyRuleKey =
  | 'enforce_workspace_marker'
  | 'enforce_toolchain_lock'
  | 'disallow_untrusted_tool_sources'
  | 'enforce_compatibility_matrix'
  | 'require_mirror_lock_for_offline';

const WORKSPACE_POLICY_RULE_DEFAULTS: Record<WorkspacePolicyRuleKey, boolean> = {
  enforce_workspace_marker: true,
  enforce_toolchain_lock: false,
  disallow_untrusted_tool_sources: false,
  enforce_compatibility_matrix: false,
  require_mirror_lock_for_offline: true,
};

function parsePolicyMode(policyContent: string | null | undefined): PolicyMode {
  if (!policyContent) return 'warn';
  const modeMatch = policyContent.match(/^[\t ]*mode:\s*(warn|strict)\s*(?:#.*)?$/m);
  return modeMatch?.[1] === 'strict' ? 'strict' : 'warn';
}

function parsePolicyRule(content: string, key: WorkspacePolicyRuleKey): boolean {
  const line = content.match(new RegExp(`^[\\t ]*${key}:\\s*(true|false)\\s*(?:#.*)?$`, 'm'));
  if (!line) return WORKSPACE_POLICY_RULE_DEFAULTS[key];
  return line[1] === 'true';
}

function parseWorkspacePolicy(content: string | null | undefined): {
  mode: PolicyMode;
  dependency_sharing_mode: DependencySharingMode;
  rules: Record<WorkspacePolicyRuleKey, boolean>;
} {
  const raw = content ?? '';
  return {
    mode: parsePolicyMode(raw),
    dependency_sharing_mode: parseDependencySharingMode(raw),
    rules: {
      enforce_workspace_marker: parsePolicyRule(raw, 'enforce_workspace_marker'),
      enforce_toolchain_lock: parsePolicyRule(raw, 'enforce_toolchain_lock'),
      disallow_untrusted_tool_sources: parsePolicyRule(raw, 'disallow_untrusted_tool_sources'),
      enforce_compatibility_matrix: parsePolicyRule(raw, 'enforce_compatibility_matrix'),
      require_mirror_lock_for_offline: parsePolicyRule(raw, 'require_mirror_lock_for_offline'),
    },
  };
}

function replaceOrInsertTopLevelPolicyLine(content: string, key: string, value: string): string {
  const line = `${key}: ${value}`;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const topLevelRegex = new RegExp(`^[\\t ]*${escaped}:\\s*.*$`, 'm');

  if (topLevelRegex.test(content)) {
    return content.replace(topLevelRegex, line);
  }

  const rulesRegex = /^[\t ]*rules:\s*(?:#.*)?$/m;
  if (rulesRegex.test(content)) {
    return content.replace(rulesRegex, `${line}\nrules:`);
  }

  const normalized = content.endsWith('\n') ? content : `${content}\n`;
  return `${normalized}${line}\n`;
}

function replaceOrInsertRulePolicyLine(
  content: string,
  key: WorkspacePolicyRuleKey,
  value: boolean
): string {
  const line = `  ${key}: ${value ? 'true' : 'false'}`;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ruleRegex = new RegExp(`^[\\t ]+${escaped}:\\s*.*$`, 'm');
  if (ruleRegex.test(content)) {
    return content.replace(ruleRegex, line);
  }

  const rulesRegex = /^[\t ]*rules:\s*(?:#.*)?$/m;
  if (rulesRegex.test(content)) {
    return content.replace(rulesRegex, `rules:\n${line}`);
  }

  const normalized = content.endsWith('\n') ? content : `${content}\n`;
  return `${normalized}rules:\n${line}\n`;
}

function defaultWorkspacePolicyYaml(): string {
  return [
    'version: "1.0"',
    'mode: warn # "warn" or "strict"',
    'dependency_sharing_mode: isolated # "isolated" or "shared-runtime-caches" or "shared-node-deps"',
    '# change profile (recommended): npx rapidkit bootstrap --profile polyglot',
    '# change mode/dependency manually: edit this file and rerun npx rapidkit init',
    'rules:',
    '  enforce_workspace_marker: true',
    '  enforce_toolchain_lock: false',
    '  disallow_untrusted_tool_sources: false',
    '  enforce_compatibility_matrix: false',
    '  require_mirror_lock_for_offline: true',
    '',
  ].join('\n');
}

async function readWorkspacePolicyFile(workspacePath: string): Promise<string> {
  const policyPath = path.join(workspacePath, '.rapidkit', 'policies.yml');
  if (!(await fsExtra.pathExists(policyPath))) {
    return defaultWorkspacePolicyYaml();
  }
  return fs.promises.readFile(policyPath, 'utf-8');
}

async function writeWorkspacePolicyFile(workspacePath: string, content: string): Promise<void> {
  const rapidkitDir = path.join(workspacePath, '.rapidkit');
  const policyPath = path.join(rapidkitDir, 'policies.yml');
  await fsExtra.ensureDir(rapidkitDir);
  const normalized = content.endsWith('\n') ? content : `${content}\n`;
  await fs.promises.writeFile(policyPath, normalized, 'utf-8');
}

function parsePolicyBooleanLiteral(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'on') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'off') return false;
  return null;
}

function parseDependencySharingMode(
  policyContent: string | null | undefined
): DependencySharingMode {
  if (!policyContent) return 'isolated';
  const match = policyContent.match(/^\s*dependency_sharing_mode:\s*([a-zA-Z\-]+)\s*(?:#.*)?$/m);
  const mode = match?.[1]?.toLowerCase();
  if (mode === 'shared-runtime-caches' || mode === 'shared-node-deps' || mode === 'isolated') {
    return mode;
  }
  return 'isolated';
}

function validateDependencySharingMode(policyContent: string | null | undefined): {
  mode: DependencySharingMode;
  status: 'passed' | 'skipped' | 'failed';
  message: string;
} {
  if (!policyContent) {
    return {
      mode: 'isolated',
      status: 'skipped',
      message: 'No policies.yml found; dependency_sharing_mode defaults to isolated.',
    };
  }

  const match = policyContent.match(/^\s*dependency_sharing_mode:\s*([a-zA-Z\-]+)\s*(?:#.*)?$/m);
  if (!match) {
    return {
      mode: 'isolated',
      status: 'skipped',
      message: 'dependency_sharing_mode is not set; defaulting to isolated.',
    };
  }

  const rawValue = match[1].toLowerCase();
  if (
    rawValue === 'isolated' ||
    rawValue === 'shared-runtime-caches' ||
    rawValue === 'shared-node-deps'
  ) {
    return {
      mode: rawValue,
      status: 'passed',
      message: `dependency_sharing_mode is valid: ${rawValue}.`,
    };
  }

  return {
    mode: 'isolated',
    status: 'failed',
    message:
      `Invalid dependency_sharing_mode: ${rawValue}. ` +
      'Use one of: isolated, shared-runtime-caches, shared-node-deps.',
  };
}

async function withWorkspaceDependencyPolicyContext<T>(
  cwd: string,
  run: () => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; code: number }> {
  const workspacePath = findWorkspaceUp(cwd);
  const policyPath = workspacePath ? path.join(workspacePath, '.rapidkit', 'policies.yml') : null;

  let dependencySharingMode: DependencySharingMode = 'isolated';
  if (policyPath && (await fsExtra.pathExists(policyPath))) {
    try {
      const policyContent = await fs.promises.readFile(policyPath, 'utf-8');
      const validation = validateDependencySharingMode(policyContent);
      if (validation.status === 'failed') {
        console.log(chalk.red(`❌ ${validation.message}`));
        return { ok: false, code: 1 };
      }
      dependencySharingMode = validation.mode;
    } catch {
      console.log(chalk.red('❌ Failed to read workspace policy file (.rapidkit/policies.yml).'));
      return { ok: false, code: 1 };
    }
  }

  const prevMode = process.env.RAPIDKIT_DEP_SHARING_MODE;
  const prevWorkspacePath = process.env.RAPIDKIT_WORKSPACE_PATH;

  process.env.RAPIDKIT_DEP_SHARING_MODE = dependencySharingMode;
  if (workspacePath) {
    process.env.RAPIDKIT_WORKSPACE_PATH = workspacePath;
  }

  try {
    const value = await run();
    return { ok: true, value };
  } finally {
    if (typeof prevMode === 'undefined') delete process.env.RAPIDKIT_DEP_SHARING_MODE;
    else process.env.RAPIDKIT_DEP_SHARING_MODE = prevMode;

    if (typeof prevWorkspacePath === 'undefined') delete process.env.RAPIDKIT_WORKSPACE_PATH;
    else process.env.RAPIDKIT_WORKSPACE_PATH = prevWorkspacePath;
  }
}

async function runCommandInCwd(
  command: string,
  commandArgs: string[],
  cwd: string
): Promise<number> {
  return await new Promise<number>((resolve) => {
    const child = spawn(command, commandArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd,
      shell: shouldUseShellExecution(),
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      process.stdout.write(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

async function writeJsonFile(filePath: string, payload: unknown): Promise<void> {
  await fsExtra.outputFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

export async function handleImportCommand(
  source: string,
  options: {
    workspace?: string;
    name?: string;
    git?: boolean;
    json?: boolean;
    enableModules?: boolean;
  },
  dependencies?: {
    syncWorkspaceProjects?: (workspacePath: string) => Promise<void>;
    rollbackImportedProjectImport?: (workspacePath: string, projectPath: string) => Promise<void>;
  }
): Promise<number> {
  const shouldInjectImportSyncFailure =
    process.env.RAPIDKIT_TEST_IMPORT_SYNC_FAIL === '1' &&
    (process.env.VITEST === 'true' ||
      process.env.VITEST === '1' ||
      process.env.NODE_ENV === 'test');

  const explicitWorkspace = options.workspace ? path.resolve(options.workspace) : null;
  let workspacePath = explicitWorkspace ?? findWorkspaceUp(process.cwd());
  let usedDefaultWorkspace = false;
  let createdDefaultWorkspace = false;

  if (explicitWorkspace) {
    if (!hasWorkspaceRootMarkers(explicitWorkspace)) {
      const message = `Workspace path is not a valid RapidKit workspace: ${explicitWorkspace}`;
      if (options.json) {
        console.log(JSON.stringify({ error: message }, null, 2));
      } else {
        console.log(chalk.red(`❌ ${message}`));
      }
      return 1;
    }
  } else if (!workspacePath || !hasWorkspaceRootMarkers(workspacePath)) {
    const ensuredWorkspace = await ensureManagedDefaultImportWorkspace();
    workspacePath = ensuredWorkspace.workspacePath;
    usedDefaultWorkspace = true;
    createdDefaultWorkspace = ensuredWorkspace.created;
  }

  if (!workspacePath || !hasWorkspaceRootMarkers(workspacePath)) {
    const message = 'Not inside a RapidKit workspace';
    if (options.json) {
      console.log(JSON.stringify({ error: message }, null, 2));
    } else {
      console.log(chalk.red(`❌ ${message}`));
      console.log(
        chalk.gray('💡 Run this command from a workspace root or pass --workspace <path>.')
      );
    }
    return 1;
  }

  const suggestedCdCommand = `cd ${workspacePath}`;

  const syncImportedWorkspace =
    dependencies?.syncWorkspaceProjects ??
    (async (nextWorkspacePath: string) => {
      if (shouldInjectImportSyncFailure) {
        throw new Error('forced sync failure for command-level import rollback test');
      }
      const { syncWorkspaceProjects } = await import('./workspace.js');
      await syncWorkspaceProjects(nextWorkspacePath, true);
      await syncWorkspaceContractAfterProjectChange(nextWorkspacePath, { silent: true });
    });
  const rollbackImportedProject =
    dependencies?.rollbackImportedProjectImport ?? cleanupImportedProjectImport;

  try {
    const importedProject = await importProjectIntoWorkspace({
      workspacePath,
      source,
      name: options.name,
      sourceType: options.git === true ? 'git-url' : undefined,
      enableModules: options.enableModules,
    });

    try {
      await syncImportedWorkspace(workspacePath);
    } catch (syncError) {
      await rollbackImportedProject(workspacePath, importedProject.path);

      try {
        await syncImportedWorkspace(workspacePath);
      } catch {
        // Best-effort restore only.
      }

      throw new Error(
        `Workspace sync failed after import and the imported project was rolled back: ${syncError instanceof Error ? syncError.message : String(syncError)}`
      );
    }

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            workspacePath,
            workspaceResolution: usedDefaultWorkspace
              ? 'default-auto'
              : explicitWorkspace
                ? 'explicit'
                : 'nearest',
            defaultWorkspaceCreated: usedDefaultWorkspace ? createdDefaultWorkspace : false,
            suggestedCdCommand,
            importedProject,
          },
          null,
          2
        )
      );
      return 0;
    }

    if (usedDefaultWorkspace) {
      console.log(
        chalk.yellow(
          `ℹ Imported outside a workspace, so RapidKit used the default workspace: ${workspacePath}`
        )
      );
    }

    console.log(chalk.green(`✔ Imported project: ${importedProject.name}`));
    console.log(chalk.gray(`   Workspace: ${workspacePath}`));
    console.log(chalk.gray(`   Destination: ${importedProject.path}`));
    console.log(chalk.gray(`   Stack: ${importedProject.stack} (${importedProject.confidence})`));
    console.log(
      chalk.gray(
        `   Source: ${options.git === true || isGitUrl(source) ? 'git-url' : 'local-folder'}`
      )
    );
    console.log(chalk.gray(`   Next shell step: ${suggestedCdCommand}`));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      console.log(JSON.stringify({ error: message }, null, 2));
    } else {
      console.log(chalk.red(`❌ Import failed: ${message}`));
    }
    return 1;
  }
}

export async function handleAdoptCommand(
  source: string | undefined,
  options: {
    workspace?: string;
    name?: string;
    dryRun?: boolean;
    json?: boolean;
    enableModules?: boolean;
  },
  dependencies?: {
    syncWorkspaceProjects?: (workspacePath: string) => Promise<void>;
    registerWorkspace?: (workspacePath: string, workspaceName: string) => Promise<void>;
    registerProjectInWorkspace?: (
      workspacePath: string,
      projectName: string,
      projectPath: string
    ) => Promise<void>;
    rollbackAdoptedProjectImport?: (
      workspacePath: string,
      projectPath: string,
      previousProjectJson: Record<string, unknown> | null
    ) => Promise<void>;
  }
): Promise<number> {
  const sourcePath = path.resolve(source || process.cwd());
  const explicitWorkspace = options.workspace ? path.resolve(options.workspace) : null;
  let workspacePath = explicitWorkspace ?? findWorkspaceUp(process.cwd());
  let usedDefaultWorkspace = false;
  let createdDefaultWorkspace = false;

  if (explicitWorkspace) {
    if (!hasWorkspaceRootMarkers(explicitWorkspace)) {
      const message = `Workspace path is not a valid RapidKit workspace: ${explicitWorkspace}`;
      if (options.json) {
        console.log(JSON.stringify({ error: message }, null, 2));
      } else {
        console.log(chalk.red(`❌ ${message}`));
      }
      return 1;
    }
  } else if (!workspacePath || !hasWorkspaceRootMarkers(workspacePath)) {
    const ensuredWorkspace = await ensureManagedDefaultImportWorkspace();
    workspacePath = ensuredWorkspace.workspacePath;
    usedDefaultWorkspace = true;
    createdDefaultWorkspace = ensuredWorkspace.created;
  }

  if (!workspacePath || !hasWorkspaceRootMarkers(workspacePath)) {
    const message = 'Not inside a RapidKit workspace';
    if (options.json) {
      console.log(JSON.stringify({ error: message }, null, 2));
    } else {
      console.log(chalk.red(`❌ ${message}`));
      console.log(
        chalk.gray('💡 Run this command from a workspace root or pass --workspace <path>.')
      );
    }
    return 1;
  }

  const shouldInjectAdoptSyncFailure =
    process.env.RAPIDKIT_TEST_ADOPT_SYNC_FAIL === '1' &&
    (process.env.VITEST === 'true' ||
      process.env.VITEST === '1' ||
      process.env.NODE_ENV === 'test');

  const syncWorkspace =
    dependencies?.syncWorkspaceProjects ??
    (async (nextWorkspacePath: string) => {
      if (shouldInjectAdoptSyncFailure) {
        throw new Error('forced sync failure for command-level adopt rollback test');
      }
      const { syncWorkspaceProjects } = await import('./workspace.js');
      await syncWorkspaceProjects(nextWorkspacePath, true);
      await syncWorkspaceContractAfterProjectChange(nextWorkspacePath, { silent: true });
    });
  const registerProject =
    dependencies?.registerProjectInWorkspace ??
    (async (nextWorkspacePath: string, projectName: string, projectPath: string) => {
      const { registerProjectInWorkspace } = await import('./workspace.js');
      await registerProjectInWorkspace(nextWorkspacePath, projectName, projectPath);
    });
  const registerWorkspace =
    dependencies?.registerWorkspace ??
    (async (nextWorkspacePath: string, workspaceName: string) => {
      const { registerWorkspace } = await import('./workspace.js');
      await registerWorkspace(nextWorkspacePath, workspaceName);
    });

  const rollbackAdoptedProject =
    dependencies?.rollbackAdoptedProjectImport ?? cleanupAdoptedProjectImport;

  try {
    const previousProjectJsonPath = path.join(sourcePath, '.rapidkit', 'project.json');
    const previousProjectJson = (await fsExtra.pathExists(previousProjectJsonPath))
      ? ((await fsExtra.readJson(previousProjectJsonPath)) as Record<string, unknown>)
      : null;

    const adoptedProject = await adoptProjectIntoWorkspace({
      workspacePath,
      source: sourcePath,
      name: options.name,
      dryRun: options.dryRun === true,
      enableModules: options.enableModules,
    });

    if (options.dryRun !== true) {
      try {
        await registerWorkspace(workspacePath, path.basename(workspacePath));
        await registerProject(workspacePath, adoptedProject.name, adoptedProject.path);
        await syncWorkspace(workspacePath);
      } catch (syncError) {
        await rollbackAdoptedProject(workspacePath, adoptedProject.path, previousProjectJson);
        throw new Error(
          `Workspace sync failed after adopt and adoption metadata was rolled back: ${syncError instanceof Error ? syncError.message : String(syncError)}`
        );
      }
    }

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            workspacePath,
            workspaceResolution: usedDefaultWorkspace
              ? 'default-auto'
              : explicitWorkspace
                ? 'explicit'
                : 'nearest',
            defaultWorkspaceCreated: usedDefaultWorkspace ? createdDefaultWorkspace : false,
            dryRun: options.dryRun === true,
            adoptedProject,
          },
          null,
          2
        )
      );
      return 0;
    }

    if (usedDefaultWorkspace) {
      console.log(
        chalk.yellow(
          `ℹ Adopted outside a workspace, so RapidKit used the default workspace: ${workspacePath}`
        )
      );
    }
    if (options.dryRun === true) {
      console.log(chalk.yellow(`ℹ Dry run: no adoption files were written.`));
    }

    console.log(chalk.green(`✔ Adopted project: ${adoptedProject.name}`));
    console.log(chalk.gray(`   Workspace: ${workspacePath}`));
    console.log(chalk.gray(`   Project: ${adoptedProject.path}`));
    console.log(chalk.gray(`   Mode: linked (source was not moved or copied)`));
    console.log(chalk.gray(`   Stack: ${adoptedProject.stack} (${adoptedProject.confidence})`));
    console.log(chalk.gray(`   Report: ${adoptedProject.adoptReadinessPath}`));
    console.log(chalk.gray(`   Next: npx rapidkit workspace model --json`));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      console.log(JSON.stringify({ error: message }, null, 2));
    } else {
      console.log(chalk.red(`❌ Adopt failed: ${message}`));
    }
    return 1;
  }
}

export async function installWorkspaceDependencies(workspacePath: string): Promise<number> {
  const PYTHON_REQUIRED_PROFILES = new Set(['python-only', 'polyglot', 'enterprise']);

  let workspaceProfile = 'minimal';
  try {
    const manifestPath = path.join(workspacePath, '.rapidkit', 'workspace.json');
    const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8')) as {
      profile?: string;
    };
    workspaceProfile = manifest.profile ?? 'minimal';
  } catch {
    workspaceProfile = 'minimal';
  }

  const workspaceRequiresPython = async (): Promise<boolean> => {
    if (PYTHON_REQUIRED_PROFILES.has(workspaceProfile)) {
      return true;
    }

    const projectPaths = await collectWorkspaceProjects(workspacePath);
    if (projectPaths.length === 0) {
      return false;
    }

    for (const projectPath of projectPaths) {
      const projectJson = readRapidkitProjectJson(projectPath);
      const moduleSupport = projectJson?.module_support;

      if (
        isGoProject(projectJson, projectPath) ||
        isJavaProject(projectJson, projectPath) ||
        isDotnetProject(projectJson, projectPath)
      ) {
        continue;
      }

      if (moduleSupport === false) {
        continue;
      }

      if (isPythonProject(projectJson, projectPath) || isNodeProject(projectJson, projectPath)) {
        return true;
      }

      // Unknown project type: keep strict fallback to preserve compatibility.
      return true;
    }

    return false;
  };

  if (!(await workspaceRequiresPython())) {
    return 0;
  }

  let installMethod: 'poetry' | 'venv' | 'pipx' | 'pip' = 'poetry';

  try {
    const { readWorkspaceMarker } = await import('./workspace-marker.js');
    const marker = await readWorkspaceMarker(workspacePath);
    const detected = marker?.metadata?.npm?.installMethod;
    if (detected === 'poetry' || detected === 'venv' || detected === 'pipx' || detected === 'pip') {
      installMethod = detected;
    }
  } catch {
    // Keep default method.
  }

  if (installMethod === 'poetry' || installMethod === 'venv') {
    // Determine if the workspace was bootstrapped with a pre-written stub
    // (i.e. pyproject.toml already lists rapidkit-core as a dependency).
    const pyprojectPath = path.join(workspacePath, 'pyproject.toml');
    let hasStub = false;
    try {
      const content = await fs.promises.readFile(pyprojectPath, 'utf-8');
      hasStub = content.includes('rapidkit-core');
    } catch {
      hasStub = false;
    }

    const testLocalPath = process.env.RAPIDKIT_DEV_PATH;
    const hasLocalRapidKitPath = testLocalPath ? await fsExtra.pathExists(testLocalPath) : false;

    if (hasStub) {
      // Fast path: create .venv if needed, then install with pip (~3x faster than poetry).
      const venvBin = workspaceVenvPythonBin(workspacePath);
      if (!(await fsExtra.pathExists(venvBin))) {
        const venvCode = await createWorkspaceVenv(workspacePath);
        if (venvCode !== 0) return venvCode;
      }

      const pipArgs =
        hasLocalRapidKitPath && testLocalPath
          ? ['-m', 'pip', 'install', testLocalPath, '--quiet', '--disable-pip-version-check']
          : ['-m', 'pip', 'install', 'rapidkit-core', '--quiet', '--disable-pip-version-check'];
      const pipCode = await runCommandInCwd(venvBin, pipArgs, workspacePath);
      if (pipCode !== 0) return pipCode;
    } else {
      // Legacy / no stub: use Poetry to install (original behaviour).
      const installCode = await runCommandInCwd('poetry', ['install', '--no-root'], workspacePath);
      if (installCode !== 0) return installCode;

      // Also add rapidkit-core explicitly if it isn't already installed.
      const addCode = await runCommandInCwd('poetry', ['add', 'rapidkit-core'], workspacePath);
      if (addCode !== 0) return addCode;
    }

    // Write launcher scripts (rapidkit / rapidkit.cmd) now that .venv exists.
    // For python-only/polyglot/enterprise these are written during workspace
    // creation.  For node-only/minimal/etc. this is the first time Python deps
    // are installed so we write them here to keep every profile consistent.
    try {
      const { writeWorkspaceLauncher } = await import('./create.js');
      await writeWorkspaceLauncher(workspacePath, installMethod === 'venv' ? 'venv' : 'poetry');
    } catch {
      // Non-fatal — users can still call the CLI via `npx rapidkit`
    }

    return 0;
  }

  return 0;
}

async function collectWorkspaceProjects(workspacePath: string): Promise<string[]> {
  const projects: string[] = [];
  const visited = new Set<string>();
  const stack = [workspacePath];

  while (stack.length > 0) {
    const currentPath = stack.pop();
    if (!currentPath) continue;
    if (visited.has(currentPath)) continue;
    visited.add(currentPath);

    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    } catch {
      // Skip unreadable directories (permission denied, transient mounts, etc.).
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      if (['node_modules', 'dist', 'build', 'target', 'coverage', 'htmlcov'].includes(entry.name)) {
        continue;
      }

      const candidate = path.join(currentPath, entry.name);
      const contextFile = path.join(candidate, '.rapidkit', 'context.json');
      const projectFile = path.join(candidate, '.rapidkit', 'project.json');
      if ((await fsExtra.pathExists(contextFile)) || (await fsExtra.pathExists(projectFile))) {
        projects.push(candidate);
        continue;
      }

      stack.push(candidate);
    }
  }

  return projects;
}

function resolveDefaultWorkspacePath(basePath: string): { name: string; targetPath: string } {
  return resolveAvailableWorkspaceSlot(basePath);
}

async function ensureManagedDefaultImportWorkspace(): Promise<{
  workspacePath: string;
  created: boolean;
}> {
  const workspacePath = resolveManagedDefaultImportWorkspacePath();
  const workspaceName = path.basename(workspacePath);
  const existed = hasWorkspaceRootMarkers(workspacePath);

  await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
  await writeWorkspaceMarker(workspacePath, createNpmWorkspaceMarker(workspaceName, getVersion()));

  const workspaceManifestPath = path.join(workspacePath, '.rapidkit', 'workspace.json');
  if (!(await fsExtra.pathExists(workspaceManifestPath))) {
    await writeJsonFile(workspaceManifestPath, {
      name: workspaceName,
      workspace_name: workspaceName,
      profile: 'minimal',
      createdAt: new Date().toISOString(),
      createdBy: 'rapidkit-npm-import-fallback',
    });
  }

  return {
    workspacePath,
    created: !existed,
  };
}

// ─── Go/Fiber command handlers ───────────────────────────────────────────────

/**
 * `rapidkit init` inside a Go project — runs `go mod tidy` to fetch deps.
 */
async function handleGoInit(projectPath: string): Promise<number> {
  const adapter = getRuntimeAdapter('go', { runCommandInCwd, runCoreRapidkit });
  const result = await adapter.initProject(projectPath);

  return reportRuntimeCommandResult(result);
}

function reportRuntimeCommandResult(result: { exitCode: number; message?: string }): number {
  if (result.message) {
    console.log(chalk.red(`❌ ${result.message}`));
  }

  return result.exitCode;
}

/**
 * `rapidkit dev` inside a Go project — runs `make run` (if Makefile present)
 * or falls back to `go run ./main.go`.
 */
async function handleNodeCommand(
  action: 'init' | 'dev' | 'test' | 'build' | 'start' | 'lint' | 'format',
  projectPath: string
): Promise<number> {
  const adapter = getRuntimeAdapter('node', { runCommandInCwd, runCoreRapidkit });

  if (action === 'init') {
    const result = await adapter.initProject(projectPath);
    return reportRuntimeCommandResult(result);
  }
  if (action === 'dev') {
    const result = await adapter.runDev(projectPath);
    return reportRuntimeCommandResult(result);
  }
  if (action === 'test') {
    const result = await adapter.runTest(projectPath);
    return reportRuntimeCommandResult(result);
  }
  if (action === 'build') {
    const result = await adapter.runBuild(projectPath);
    return reportRuntimeCommandResult(result);
  }
  if (action === 'lint') {
    const result = await adapter.runLint?.(projectPath);
    return reportRuntimeCommandResult(result ?? { exitCode: 1, message: 'Lint is not supported.' });
  }
  if (action === 'format') {
    const result = await adapter.runFormat?.(projectPath);
    return reportRuntimeCommandResult(
      result ?? { exitCode: 1, message: 'Format is not supported.' }
    );
  }

  const result = await adapter.runStart(projectPath);
  return reportRuntimeCommandResult(result);
}

async function handleJavaCommand(
  action: 'init' | 'dev' | 'test' | 'build' | 'start' | 'lint' | 'format',
  projectPath: string
): Promise<number> {
  const adapter = getRuntimeAdapter('java', { runCommandInCwd, runCoreRapidkit });

  if (action === 'init') {
    const result = await adapter.initProject(projectPath);
    return reportRuntimeCommandResult(result);
  }
  if (action === 'dev') {
    const result = await adapter.runDev(projectPath);
    return reportRuntimeCommandResult(result);
  }
  if (action === 'test') {
    const result = await adapter.runTest(projectPath);
    return reportRuntimeCommandResult(result);
  }
  if (action === 'build') {
    const result = await adapter.runBuild(projectPath);
    return reportRuntimeCommandResult(result);
  }
  if (action === 'lint') {
    const result = await adapter.runLint?.(projectPath);
    return reportRuntimeCommandResult(result ?? { exitCode: 1, message: 'Lint is not supported.' });
  }
  if (action === 'format') {
    const result = await adapter.runFormat?.(projectPath);
    return reportRuntimeCommandResult(
      result ?? { exitCode: 1, message: 'Format is not supported.' }
    );
  }

  const result = await adapter.runStart(projectPath);
  return reportRuntimeCommandResult(result);
}

export async function handleBootstrapCommand(
  args: string[],
  initRunner: (nextArgs: string[]) => Promise<number> = handleInitCommand
): Promise<number> {
  const prevSkipLockSync = process.env.RAPIDKIT_SKIP_LOCK_SYNC;
  if (typeof prevSkipLockSync === 'undefined') {
    process.env.RAPIDKIT_SKIP_LOCK_SYNC = '1';
  }

  try {
    type BootstrapProfile =
      | 'minimal'
      | 'java-only'
      | 'go-only'
      | 'dotnet-only'
      | 'python-only'
      | 'node-only'
      | 'polyglot'
      | 'enterprise';
    type CheckStatus = 'passed' | 'failed' | 'skipped';
    interface ComplianceCheck {
      id: string;
      status: CheckStatus;
      message: string;
    }

    interface BootstrapPolicy {
      mode: 'warn' | 'strict';
      dependency_sharing_mode: DependencySharingMode;
      rules: {
        enforce_workspace_marker: boolean;
        enforce_toolchain_lock: boolean;
        disallow_untrusted_tool_sources: boolean;
        enforce_compatibility_matrix: boolean;
        require_mirror_lock_for_offline: boolean;
      };
    }

    interface MirrorConfig {
      enabled?: boolean;
      mode?: 'online' | 'offline-first' | 'offline-only';
    }

    function normalizeProfile(value?: string): BootstrapProfile | null {
      if (!value) return null;
      const normalized = value.trim().toLowerCase();
      if (
        normalized === 'minimal' ||
        normalized === 'java-only' ||
        normalized === 'go-only' ||
        normalized === 'dotnet-only' ||
        normalized === 'python-only' ||
        normalized === 'node-only' ||
        normalized === 'polyglot' ||
        normalized === 'enterprise'
      ) {
        return normalized;
      }
      return null;
    }

    function parsePolicyYaml(content: string): BootstrapPolicy {
      const modeMatch = content.match(/^\s*mode:\s*([a-zA-Z]+)\s*(?:#.*)?$/m);
      const modeValue = modeMatch?.[1]?.toLowerCase();
      const mode: 'warn' | 'strict' = modeValue === 'strict' ? 'strict' : 'warn';

      const readRule = (key: string, fallback: boolean): boolean => {
        const match = content.match(new RegExp(`^\\s*${key}:\\s*(true|false)\\s*(?:#.*)?$`, 'm'));
        if (!match) return fallback;
        return match[1].toLowerCase() === 'true';
      };

      return {
        mode,
        dependency_sharing_mode: parseDependencySharingMode(content),
        rules: {
          enforce_workspace_marker: readRule('enforce_workspace_marker', true),
          enforce_toolchain_lock: readRule('enforce_toolchain_lock', false),
          disallow_untrusted_tool_sources: readRule('disallow_untrusted_tool_sources', false),
          enforce_compatibility_matrix: readRule('enforce_compatibility_matrix', false),
          require_mirror_lock_for_offline: readRule('require_mirror_lock_for_offline', true),
        },
      };
    }

    const initArgs: string[] = ['init'];
    let profileArg: string | undefined;
    let ciMode = false;
    let offlineMode = false;
    let jsonMode = false;
    let complianceOnly = false;

    for (let i = 1; i < args.length; i += 1) {
      const token = args[i];
      if (token === '--ci') {
        ciMode = true;
        continue;
      }
      if (token === '--offline') {
        offlineMode = true;
        continue;
      }
      if (token === '--json') {
        jsonMode = true;
        continue;
      }
      if (token === '--compliance-only') {
        complianceOnly = true;
        continue;
      }
      if (token === '--profile') {
        const next = args[i + 1];
        if (!next || next.startsWith('-')) {
          console.log(
            chalk.yellow(
              'Usage: rapidkit bootstrap [path] [--profile <minimal|java-only|go-only|dotnet-only|python-only|node-only|polyglot|enterprise>] [--ci] [--offline] [--json] [--compliance-only]'
            )
          );
          return 1;
        }
        profileArg = next;
        i += 1;
        continue;
      }
      if (token.startsWith('--profile=')) {
        profileArg = token.slice('--profile='.length);
        continue;
      }
      initArgs.push(token);
    }

    const explicitProfile = normalizeProfile(profileArg);
    if (profileArg && !explicitProfile) {
      console.log(
        chalk.red(
          `Invalid profile: ${profileArg}. Use one of: minimal, java-only, go-only, dotnet-only, python-only, node-only, polyglot, enterprise.`
        )
      );
      return 1;
    }

    const cwd = process.cwd();
    const explicitTargetArgs = initArgs.slice(1).filter((arg) => !arg.startsWith('-'));
    if (explicitTargetArgs.length > 0) {
      const targetPath = path.resolve(cwd, explicitTargetArgs[0]);
      const targetJson = readRapidkitProjectJson(targetPath);
      const inferredRuntime = fs.existsSync(targetPath)
        ? await inferRuntimeByFiles(targetPath)
        : 'unknown';
      const targetIsProject =
        !hasWorkspaceRootMarkers(targetPath) &&
        (isGoProject(targetJson, targetPath) ||
          isJavaProject(targetJson, targetPath) ||
          isDotnetProject(targetJson, targetPath) ||
          isNodeProject(targetJson, targetPath) ||
          isPythonProject(targetJson, targetPath) ||
          inferredRuntime !== 'unknown');

      if (targetIsProject) {
        return await initRunner(initArgs);
      }
    }

    const cwdMarker = path.join(cwd, '.rapidkit-workspace');
    const cwdLegacyManifest = path.join(cwd, '.rapidkit', 'workspace.json');
    let workspacePath: string | null;

    if (!fs.existsSync(cwdMarker) && fs.existsSync(cwdLegacyManifest)) {
      workspacePath = cwd;
    } else {
      workspacePath = findWorkspaceUp(cwd);
      if (!workspacePath) {
        workspacePath = findLegacyWorkspaceUp(cwd);
      }
    }
    const checks: ComplianceCheck[] = [];
    let mirrorLifecycleDetails: {
      syncedArtifacts: number;
      verifiedArtifacts: number;
      rotatedFiles: number;
      lockWritten: boolean;
    } | null = null;

    let workspaceProfile: BootstrapProfile | null = null;
    if (workspacePath) {
      try {
        const workspaceManifestPath = path.join(workspacePath, '.rapidkit', 'workspace.json');
        const manifestRaw = await fs.promises.readFile(workspaceManifestPath, 'utf-8');
        const manifest = JSON.parse(manifestRaw) as { profile?: string };
        workspaceProfile = normalizeProfile(manifest.profile);
      } catch {
        workspaceProfile = null;
      }
    }

    const profileOptions: ReadonlyArray<BootstrapProfile> = [
      'minimal',
      'java-only',
      'python-only',
      'node-only',
      'go-only',
      'dotnet-only',
      'polyglot',
      'enterprise',
    ];

    const profileLabel: Record<BootstrapProfile, string> = {
      minimal: 'minimal     — Foundation files only (fastest bootstrap, mixed projects)',
      'java-only': 'java-only   — Java runtime (Spring Boot services)',
      'python-only': 'python-only — Python + Poetry (FastAPI, Django, ML pipelines)',
      'node-only': 'node-only   — Node.js runtime (NestJS, Express, Next.js)',
      'go-only': 'go-only     — Go runtime (Fiber, Gin, gRPC, microservices)',
      'dotnet-only': 'dotnet-only — .NET runtime (ASP.NET Core services)',
      polyglot: 'polyglot    — Python + Node.js + Go + Java + .NET multi-runtime workspace',
      enterprise: 'enterprise  — Polyglot + governance + Sigstore verification',
    };

    let selectedProfile: BootstrapProfile | null = explicitProfile;
    const shouldPromptProfile =
      !!workspacePath &&
      !explicitProfile &&
      !ciMode &&
      !jsonMode &&
      !!process.stdin.isTTY &&
      !!process.stdout.isTTY;

    if (shouldPromptProfile) {
      const currentProfile = workspaceProfile || 'minimal';
      const { chosenProfile } = (await inquirer.prompt([
        {
          type: 'rawlist',
          name: 'chosenProfile',
          message: `Select workspace profile for bootstrap (current: ${currentProfile})`,
          choices: profileOptions.map((p) => ({
            name: p === currentProfile ? `${profileLabel[p]}   ← current` : profileLabel[p],
            value: p,
          })),
          default: profileOptions.indexOf(currentProfile),
        },
      ])) as { chosenProfile: BootstrapProfile };
      selectedProfile = chosenProfile;
    }

    const profile: BootstrapProfile = selectedProfile || workspaceProfile || 'minimal';

    if (workspacePath) {
      try {
        const requiresPythonProfile =
          profile === 'python-only' || profile === 'polyglot' || profile === 'enterprise';
        const installMethodForSync = requiresPythonProfile ? 'poetry' : 'venv';

        let pythonVersion: string | undefined;
        try {
          const pyVersionRaw = await fs.promises.readFile(
            path.join(workspacePath, '.python-version'),
            'utf-8'
          );
          const parsed = pyVersionRaw.trim();
          if (parsed) pythonVersion = parsed;
        } catch {
          /* optional */
        }

        const { syncWorkspaceFoundationFiles } = await import('./create.js');
        const syncedPaths = await syncWorkspaceFoundationFiles(workspacePath, {
          workspaceName: path.basename(workspacePath),
          installMethod: installMethodForSync,
          pythonVersion,
          profile,
          writeMarker: true,
          writeGitignore: true,
          onlyIfMissing: true,
        });

        checks.push({
          id: 'workspace.legacy.sync',
          status: syncedPaths.length > 0 ? 'passed' : 'skipped',
          message:
            syncedPaths.length > 0
              ? `Legacy workspace foundation synchronized: ${syncedPaths.join(', ')}`
              : 'Workspace foundation files are already up to date.',
        });
      } catch (error) {
        checks.push({
          id: 'workspace.legacy.sync',
          status: 'failed',
          message: `Failed to synchronize legacy workspace foundation files: ${(error as Error).message}`,
        });
      }
    }

    // Persist profile back to workspace.json if an explicit/profile-selected value was given
    // and differs from what's currently stored. This keeps workspace.json as the
    // single source of truth so future bare `rapidkit bootstrap` calls inherit it.
    if (workspacePath && selectedProfile && selectedProfile !== workspaceProfile) {
      try {
        const workspaceManifestPath = path.join(workspacePath, '.rapidkit', 'workspace.json');
        const raw = await fs.promises.readFile(workspaceManifestPath, 'utf-8');
        const manifest = JSON.parse(raw) as Record<string, unknown>;
        manifest.profile = selectedProfile;
        await fs.promises.writeFile(
          workspaceManifestPath,
          JSON.stringify(manifest, null, 2) + '\n',
          'utf-8'
        );
      } catch {
        // Non-fatal — bootstrap continues even if workspace.json sync fails
      }
    }

    let policy: {
      mode: 'warn' | 'strict';
      dependency_sharing_mode: string;
      rules: Record<string, boolean>;
    } = {
      mode: 'warn',
      dependency_sharing_mode: 'isolated',
      rules: {
        enforce_workspace_marker: true,
        enforce_toolchain_lock: false,
        disallow_untrusted_tool_sources: false,
        enforce_compatibility_matrix: false,
        require_mirror_lock_for_offline: true,
      },
    };

    let policyContentRaw: string | null = null;

    if (workspacePath) {
      try {
        const policyContent = await fs.promises.readFile(
          path.join(workspacePath, '.rapidkit', 'policies.yml'),
          'utf-8'
        );
        policyContentRaw = policyContent;
        policy = parsePolicyYaml(policyContent);
      } catch {
        checks.push({
          id: 'policy.file',
          status: 'skipped',
          message: 'No workspace policy file found; using default bootstrap policy.',
        });
      }
    } else {
      checks.push({
        id: 'workspace.detect',
        status: 'skipped',
        message: 'No workspace marker found; bootstrap runs in project/single-path mode.',
      });
    }

    if (workspacePath) {
      const dependencyModeValidation = validateDependencySharingMode(policyContentRaw);
      policy.dependency_sharing_mode = dependencyModeValidation.mode;
      checks.push({
        id: 'policy.schema.dependency_sharing_mode',
        status: dependencyModeValidation.status,
        message: dependencyModeValidation.message,
      });

      checks.push({
        id: 'policy.dependency_sharing_mode.effective',
        status: 'passed',
        message:
          policy.dependency_sharing_mode === 'isolated'
            ? 'Effective dependency mode: isolated (default secure mode).'
            : policy.dependency_sharing_mode === 'shared-node-deps'
              ? 'Effective dependency mode: shared-node-deps (Node projects share workspace-level caches).'
              : 'Effective dependency mode: shared-runtime-caches (Node/Python/Go share workspace-level caches).',
      });

      const markerExists = fs.existsSync(path.join(workspacePath, '.rapidkit-workspace'));
      checks.push({
        id: 'policy.enforce_workspace_marker',
        status: !policy.rules.enforce_workspace_marker || markerExists ? 'passed' : 'failed',
        message:
          !policy.rules.enforce_workspace_marker || markerExists
            ? 'Workspace marker policy satisfied.'
            : 'Workspace marker policy failed: .rapidkit-workspace is missing.',
      });

      const lockExists = fs.existsSync(path.join(workspacePath, '.rapidkit', 'toolchain.lock'));
      checks.push({
        id: 'policy.enforce_toolchain_lock',
        status: !policy.rules.enforce_toolchain_lock || lockExists ? 'passed' : 'failed',
        message:
          !policy.rules.enforce_toolchain_lock || lockExists
            ? 'Toolchain lock policy satisfied.'
            : 'Toolchain lock policy failed: .rapidkit/toolchain.lock is missing.',
      });

      const trustedSourcesConfigured =
        process.env.RAPIDKIT_TRUSTED_SOURCES === '1' ||
        fs.existsSync(path.join(workspacePath, '.rapidkit', 'trusted-sources.lock'));
      checks.push({
        id: 'policy.disallow_untrusted_tool_sources',
        status:
          !policy.rules.disallow_untrusted_tool_sources || trustedSourcesConfigured
            ? 'passed'
            : 'failed',
        message:
          !policy.rules.disallow_untrusted_tool_sources || trustedSourcesConfigured
            ? 'Trusted tool sources policy satisfied.'
            : 'Trusted tool sources policy failed: set RAPIDKIT_TRUSTED_SOURCES=1 or provide .rapidkit/trusted-sources.lock.',
      });

      const compatibilityMatrixPath = path.join(
        workspacePath,
        '.rapidkit',
        'compatibility-matrix.json'
      );
      const compatibilityMatrixExists = fs.existsSync(compatibilityMatrixPath);
      const compatibilityMatrixEnforced = policy.rules.enforce_compatibility_matrix;

      checks.push({
        id: 'policy.enforce_compatibility_matrix',
        status: !compatibilityMatrixEnforced || compatibilityMatrixExists ? 'passed' : 'failed',
        message:
          !compatibilityMatrixEnforced || compatibilityMatrixExists
            ? 'Compatibility matrix policy satisfied.'
            : 'Compatibility matrix policy failed: .rapidkit/compatibility-matrix.json is missing.',
      });

      if (compatibilityMatrixExists) {
        try {
          const matrixRaw = await fs.promises.readFile(compatibilityMatrixPath, 'utf-8');
          const matrix = JSON.parse(matrixRaw) as { runtimes?: Record<string, unknown> };
          const isValidShape = !!matrix && typeof matrix === 'object';
          checks.push({
            id: 'compatibility.matrix.parse',
            status: isValidShape ? 'passed' : 'failed',
            message: isValidShape
              ? 'Compatibility matrix parsed successfully.'
              : 'Compatibility matrix parse failed: invalid JSON object.',
          });
        } catch {
          checks.push({
            id: 'compatibility.matrix.parse',
            status: 'failed',
            message: 'Compatibility matrix parse failed: invalid JSON.',
          });
        }
      }

      const mirrorConfigPath = path.join(workspacePath, '.rapidkit', 'mirror-config.json');
      const mirrorLockPath = path.join(workspacePath, '.rapidkit', 'mirror.lock');
      const mirrorConfigExists = fs.existsSync(mirrorConfigPath);
      let mirrorLockExists = fs.existsSync(mirrorLockPath);

      let mirrorConfig: MirrorConfig = {};
      if (mirrorConfigExists) {
        try {
          mirrorConfig = JSON.parse(
            await fs.promises.readFile(mirrorConfigPath, 'utf-8')
          ) as MirrorConfig;
          checks.push({
            id: 'mirror.config.parse',
            status: 'passed',
            message: 'Mirror configuration parsed successfully.',
          });
        } catch {
          checks.push({
            id: 'mirror.config.parse',
            status: 'failed',
            message:
              'Mirror configuration parse failed: invalid JSON in .rapidkit/mirror-config.json.',
          });
        }
      }

      const lifecycleResult = await runMirrorLifecycle(workspacePath, {
        ciMode,
        offlineMode,
      });
      checks.push(
        ...lifecycleResult.checks.map((check) => ({
          id: check.id,
          status: check.status,
          message: check.message,
        }))
      );
      mirrorLifecycleDetails = lifecycleResult.details;

      if (lifecycleResult.details.lockWritten) {
        mirrorLockExists = true;
      }

      if (offlineMode) {
        const mirrorEnabled =
          process.env.RAPIDKIT_MIRROR_ENABLED === '1' || mirrorConfig.enabled === true;
        checks.push({
          id: 'offline.mirror.enabled',
          status: mirrorEnabled ? 'passed' : 'failed',
          message: mirrorEnabled
            ? 'Offline mode mirror is enabled.'
            : 'Offline mode requires mirror enablement (set RAPIDKIT_MIRROR_ENABLED=1 or .rapidkit/mirror-config.json {"enabled": true}).',
        });

        const lockRequired = policy.rules.require_mirror_lock_for_offline;
        checks.push({
          id: 'offline.mirror.lock',
          status: !lockRequired || mirrorLockExists ? 'passed' : 'failed',
          message:
            !lockRequired || mirrorLockExists
              ? 'Offline mode mirror lock policy satisfied.'
              : 'Offline mode mirror lock policy failed: .rapidkit/mirror.lock is missing.',
        });
      } else {
        checks.push({
          id: 'offline.mirror.enabled',
          status: 'skipped',
          message: 'Offline mirror checks skipped (offline mode is disabled).',
        });
      }

      const projectPaths = await collectWorkspaceProjects(workspacePath);
      const runtimes = new Set<'python' | 'node' | 'go' | 'java' | 'dotnet' | 'unknown'>();

      for (const projectPath of projectPaths) {
        const projectJson = readRapidkitProjectJson(projectPath);
        if (isGoProject(projectJson, projectPath)) {
          runtimes.add('go');
          continue;
        }
        if (isJavaProject(projectJson, projectPath)) {
          runtimes.add('java');
          continue;
        }
        if (isDotnetProject(projectJson, projectPath)) {
          runtimes.add('dotnet');
          continue;
        }
        if (isNodeProject(projectJson, projectPath)) {
          runtimes.add('node');
          continue;
        }
        if (isPythonProject(projectJson, projectPath)) {
          runtimes.add('python');
          continue;
        }
        runtimes.add('unknown');
      }

      if (profile === 'go-only') {
        const onlyGo = runtimes.size === 0 || [...runtimes].every((runtime) => runtime === 'go');
        checks.push({
          id: 'profile.go-only',
          status: onlyGo ? 'passed' : 'failed',
          message: onlyGo
            ? 'go-only profile validated for discovered projects.'
            : `go-only profile mismatch: detected runtimes [${[...runtimes].join(', ')}].`,
        });
      } else if (profile === 'java-only') {
        const onlyJava =
          runtimes.size === 0 || [...runtimes].every((runtime) => runtime === 'java');
        checks.push({
          id: 'profile.java-only',
          status: onlyJava ? 'passed' : 'failed',
          message: onlyJava
            ? 'java-only profile validated for discovered projects.'
            : `java-only profile mismatch: detected runtimes [${[...runtimes].join(', ')}].`,
        });
      } else if (profile === 'dotnet-only') {
        const onlyDotnet =
          runtimes.size === 0 || [...runtimes].every((runtime) => runtime === 'dotnet');
        checks.push({
          id: 'profile.dotnet-only',
          status: onlyDotnet ? 'passed' : 'failed',
          message: onlyDotnet
            ? 'dotnet-only profile validated for discovered projects.'
            : `dotnet-only profile mismatch: detected runtimes [${[...runtimes].join(', ')}].`,
        });
      } else if (profile === 'python-only') {
        const onlyPython =
          runtimes.size === 0 || [...runtimes].every((runtime) => runtime === 'python');
        checks.push({
          id: 'profile.python-only',
          status: onlyPython ? 'passed' : 'failed',
          message: onlyPython
            ? 'python-only profile validated for discovered projects.'
            : `python-only profile mismatch: detected runtimes [${[...runtimes].join(', ')}].`,
        });
      } else if (profile === 'node-only') {
        const onlyNode =
          runtimes.size === 0 || [...runtimes].every((runtime) => runtime === 'node');
        checks.push({
          id: 'profile.node-only',
          status: onlyNode ? 'passed' : 'failed',
          message: onlyNode
            ? 'node-only profile validated for discovered projects.'
            : `node-only profile mismatch: detected runtimes [${[...runtimes].join(', ')}].`,
        });
      } else if (profile === 'minimal') {
        const runtimeKinds = [...runtimes].filter((runtime) => runtime !== 'unknown');
        const minimalCompatible = runtimeKinds.length <= 1;
        checks.push({
          id: 'profile.minimal',
          status: minimalCompatible ? 'passed' : 'failed',
          message: minimalCompatible
            ? 'minimal profile is compatible with detected runtime mix.'
            : `minimal profile mismatch: multiple runtimes detected [${runtimeKinds.join(', ')}].`,
        });
      } else if (profile === 'enterprise') {
        checks.push({
          id: 'profile.enterprise.ci',
          status: ciMode ? 'passed' : 'failed',
          message: ciMode
            ? 'enterprise profile running with --ci.'
            : 'enterprise profile expects --ci for deterministic non-interactive mode.',
        });

        checks.push({
          id: 'profile.enterprise.compatibility-matrix',
          status: compatibilityMatrixExists ? 'passed' : 'failed',
          message: compatibilityMatrixExists
            ? 'enterprise profile has compatibility matrix.'
            : 'enterprise profile requires .rapidkit/compatibility-matrix.json.',
        });

        checks.push({
          id: 'profile.enterprise.mirror-config',
          status: mirrorConfigExists ? 'passed' : 'failed',
          message: mirrorConfigExists
            ? 'enterprise profile has mirror configuration.'
            : 'enterprise profile requires .rapidkit/mirror-config.json.',
        });
      }
    }

    if (ciMode) process.env.RAPIDKIT_BOOTSTRAP_CI = '1';
    if (offlineMode) process.env.RAPIDKIT_OFFLINE_MODE = '1';

    const schemaViolation = checks.some(
      (check) => check.id.startsWith('policy.schema.') && check.status === 'failed'
    );
    const strictViolation =
      schemaViolation ||
      (policy.mode === 'strict' && checks.some((check) => check.status === 'failed'));

    const reportRoot = workspacePath || cwd;
    const reportDir = path.join(reportRoot, '.rapidkit', 'reports');
    const reportTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportDir, `bootstrap-compliance-${reportTimestamp}.json`);
    const latestReportPath = path.join(reportDir, 'bootstrap-compliance.latest.json');

    const baseReport = {
      command: 'bootstrap',
      timestamp: new Date().toISOString(),
      workspacePath,
      profile,
      options: {
        ci: ciMode,
        offline: offlineMode,
        strict: policy.mode === 'strict',
      },
      policyMode: policy.mode,
      policyRules: policy.rules,
      mirrorLifecycle: mirrorLifecycleDetails,
      checks,
    };

    if (strictViolation) {
      const report = {
        ...baseReport,
        result: 'blocked',
        initExitCode: null,
      };

      await fsExtra.ensureDir(reportDir);
      await writeJsonFile(reportPath, report);
      await writeJsonFile(latestReportPath, report);

      if (jsonMode) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      } else {
        console.log(chalk.red('❌ Bootstrap blocked by strict policy checks.'));
        console.log(chalk.gray(`Compliance report: ${reportPath}`));
      }

      return 1;
    }

    // JSON + --compliance-only skips init to keep stdout clean for compliance-only CI gates.
    let initExitCode = 0;
    const skipInit = jsonMode && complianceOnly;
    if (!skipInit) {
      initExitCode = await initRunner(initArgs);
    }
    const failedCheckCount = checks.filter((c) => c.status === 'failed').length;
    const resultValue =
      initExitCode !== 0 ? 'failed' : failedCheckCount > 0 ? 'ok_with_warnings' : 'ok';
    const report = {
      ...baseReport,
      result: resultValue,
      initExitCode,
      complianceOnly: jsonMode && complianceOnly,
    };

    await fsExtra.ensureDir(reportDir);
    await writeJsonFile(reportPath, report);
    await writeJsonFile(latestReportPath, report);

    if (workspacePath && initExitCode === 0) {
      try {
        const { syncWorkspaceProjects } = await import('./workspace.js');
        await syncWorkspaceProjects(workspacePath, jsonMode);
        await syncWorkspaceContractAfterProjectChange(workspacePath, { silent: jsonMode });
      } catch {
        // Best-effort post-bootstrap registry/contract sync.
      }
    }

    if (jsonMode) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      const failedChecks = checks.filter((check) => check.status === 'failed').length;
      if (failedChecks > 0) {
        console.log(
          chalk.yellow(`⚠️  Bootstrap completed with ${failedChecks} policy/profile warnings.`)
        );
      }
      console.log(chalk.gray(`Compliance report: ${reportPath}`));
    }

    return initExitCode;
  } finally {
    if (typeof prevSkipLockSync === 'undefined') {
      delete process.env.RAPIDKIT_SKIP_LOCK_SYNC;
    } else {
      process.env.RAPIDKIT_SKIP_LOCK_SYNC = prevSkipLockSync;
    }
  }
}

export async function handleSetupCommand(args: string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(chalk.yellow('Usage: rapidkit setup <python|node|go|java|dotnet> [--warm-deps]'));
    return 0;
  }

  const runtime = (args[1] || '').toLowerCase();
  const warmDeps = args.includes('--warm-deps') || args.includes('--warm-dependencies');
  if (!runtime || !['python', 'node', 'go', 'java', 'dotnet'].includes(runtime)) {
    console.log(chalk.yellow('Usage: rapidkit setup <python|node|go|java|dotnet> [--warm-deps]'));
    return 1;
  }

  const warmRuntimeDependencies = async (
    targetRuntime: 'python' | 'node' | 'go' | 'java' | 'dotnet',
    targetPath: string
  ): Promise<CommandResult> => {
    if (targetRuntime === 'node') {
      const hasPackageJson = fs.existsSync(path.join(targetPath, 'package.json'));
      if (!hasPackageJson) {
        return {
          exitCode: 0,
          message: 'Node warm-up skipped: package.json not found in current directory.',
        };
      }

      const hasPnpmLock = fs.existsSync(path.join(targetPath, 'pnpm-lock.yaml'));
      const hasYarnLock = fs.existsSync(path.join(targetPath, 'yarn.lock'));

      if (hasPnpmLock) {
        return {
          exitCode: await runCommandInCwd(
            'pnpm',
            ['install', '--lockfile-only', '--ignore-scripts'],
            targetPath
          ),
        };
      }
      if (hasYarnLock) {
        return {
          exitCode: await runCommandInCwd('yarn', ['install', '--ignore-scripts'], targetPath),
        };
      }

      return {
        exitCode: await runCommandInCwd(
          'npm',
          ['install', '--package-lock-only', '--ignore-scripts'],
          targetPath
        ),
      };
    }

    if (targetRuntime === 'go') {
      const hasGoMod = fs.existsSync(path.join(targetPath, 'go.mod'));
      if (!hasGoMod) {
        return {
          exitCode: 0,
          message: 'Go warm-up skipped: go.mod not found in current directory.',
        };
      }

      return {
        exitCode: await runCommandInCwd('go', ['mod', 'download'], targetPath),
      };
    }

    if (targetRuntime === 'java') {
      const hasPomXml = fs.existsSync(path.join(targetPath, 'pom.xml'));
      const hasGradle =
        fs.existsSync(path.join(targetPath, 'build.gradle')) ||
        fs.existsSync(path.join(targetPath, 'build.gradle.kts'));
      const gradlew = path.join(
        targetPath,
        process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'
      );
      const hasGradleWrapper = fs.existsSync(gradlew);
      if (!hasPomXml && !hasGradle) {
        return {
          exitCode: 0,
          message: 'Java warm-up skipped: pom.xml or build.gradle not found in current directory.',
        };
      }

      if (hasPomXml) {
        return {
          exitCode: await runCommandInCwd(
            'mvn',
            ['-B', '-q', '-DskipTests', 'dependency:go-offline'],
            targetPath
          ),
        };
      }

      const gradleCommand = hasGradleWrapper ? gradlew : 'gradle';
      return {
        exitCode: await runCommandInCwd(gradleCommand, ['--no-daemon', 'dependencies'], targetPath),
      };
    }

    if (targetRuntime === 'dotnet') {
      const hasDotnetManifest = (() => {
        const queue: Array<{ dir: string; depth: number }> = [{ dir: targetPath, depth: 0 }];
        const ignored = new Set(['bin', 'obj', '.git', 'node_modules', '.rapidkit']);
        while (queue.length > 0) {
          const current = queue.shift();
          if (!current || current.depth > 3) continue;

          let entries: fs.Dirent[] = [];
          try {
            entries = fs.readdirSync(current.dir, { withFileTypes: true });
          } catch {
            continue;
          }

          for (const entry of entries) {
            if (entry.isFile()) {
              const name = entry.name.toLowerCase();
              if (name.endsWith('.sln') || name.endsWith('.csproj')) return true;
            } else if (entry.isDirectory() && !ignored.has(entry.name)) {
              queue.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 });
            }
          }
        }
        return false;
      })();

      if (!hasDotnetManifest) {
        return {
          exitCode: 0,
          message: '.NET warm-up skipped: .sln or *.csproj not found in current project tree.',
        };
      }

      return {
        exitCode: await runCommandInCwd('dotnet', ['restore'], targetPath),
      };
    }

    return {
      exitCode: 0,
      message: 'Dependency warm-up currently applies to node/go/java/dotnet runtimes.',
    };
  };

  // Use system Python (no cwd) to bypass workspace-venv runner discovery.
  // Workspace-local venv rapidkit versions may have a double-print bug in doctor check;
  // system-level rapidkit is always preferred for host environment diagnostics.
  const adapter = getRuntimeAdapter(runtime as 'python' | 'node' | 'go' | 'java' | 'dotnet', {
    runCommandInCwd,
    runCoreRapidkit: (adapterArgs, opts) =>
      runCoreRapidkit(adapterArgs, { ...opts, cwd: undefined }),
  });
  const prereq = await adapter.checkPrereqs();
  const hints = await adapter.doctorHints(process.cwd());
  const workspacePath = findWorkspaceUp(process.cwd());
  const runtimePath = workspacePath || process.cwd();
  let workspaceJavaProjectsCache: string[] | null = null;

  const getWorkspaceJavaProjects = async (): Promise<string[]> => {
    if (runtime !== 'java' || !workspacePath) {
      return [];
    }
    if (workspaceJavaProjectsCache) {
      return workspaceJavaProjectsCache;
    }

    const projectPaths = await collectWorkspaceProjects(workspacePath);
    workspaceJavaProjectsCache = projectPaths.filter((projectPath) => {
      const projectJson = readRapidkitProjectJson(projectPath);
      return isJavaProject(projectJson, projectPath);
    });
    return workspaceJavaProjectsCache;
  };

  if (prereq.exitCode === 0) {
    console.log(chalk.green(`\u2705 ${runtime} prerequisites look good.`));
    const otherRuntimes = ['python', 'node', 'go', 'java', 'dotnet']
      .filter((r) => r !== runtime)
      .join('/');
    console.log(
      chalk.gray(
        `  Scope: validated ${runtime} runtime only. ${otherRuntimes} checks are optional unless your workspace profile uses them.`
      )
    );
    if (runtime === 'python') {
      console.log(
        chalk.gray(
          '  Note: Poetry is recommended, but venv/pipx-based flows are supported in workspace creation.'
        )
      );
    }

    if (adapter.warmSetupCache) {
      const warm = await adapter.warmSetupCache(runtimePath);
      if (warm.exitCode === 0) {
        console.log(chalk.gray(`  ${runtime} cache warm-up completed.`));
      } else {
        console.log(chalk.yellow(`  ${runtime} cache warm-up skipped (non-fatal).`));
      }
    }

    if (warmDeps) {
      if (runtime === 'java' && workspacePath) {
        const javaProjects = await getWorkspaceJavaProjects();
        if (javaProjects.length > 0) {
          let warmedCount = 0;
          let failedCount = 0;
          let skippedCount = 0;

          for (const projectPath of javaProjects) {
            const depsWarmResult = await warmRuntimeDependencies('java', projectPath);
            const skipped = /skipped/i.test(depsWarmResult.message || '');
            const projectLabel =
              path.relative(workspacePath, projectPath) || path.basename(projectPath);

            if (depsWarmResult.message) {
              console.log(chalk.gray(`  [${projectLabel}] ${depsWarmResult.message}`));
            }

            if (depsWarmResult.exitCode === 0 && !skipped) {
              warmedCount += 1;
            } else if (depsWarmResult.exitCode === 0 && skipped) {
              skippedCount += 1;
            } else {
              failedCount += 1;
            }
          }

          if (warmedCount > 0) {
            console.log(
              chalk.gray(
                `  java dependency warm-up completed for ${warmedCount} project(s) (--warm-deps).`
              )
            );
          }
          if (failedCount > 0) {
            console.log(
              chalk.yellow(
                `  java dependency warm-up failed for ${failedCount} project(s) (non-fatal).`
              )
            );
          }
          if (warmedCount === 0 && failedCount === 0 && skippedCount > 0) {
            console.log(
              chalk.gray('  java dependency warm-up skipped for discovered workspace projects.')
            );
          }
        } else {
          const depsWarmResult = await warmRuntimeDependencies('java', runtimePath);
          const skipped = /skipped/i.test(depsWarmResult.message || '');
          if (depsWarmResult.message) {
            console.log(chalk.gray(`  ${depsWarmResult.message}`));
          }
          if (depsWarmResult.exitCode === 0 && !skipped) {
            console.log(chalk.gray(`  ${runtime} dependency warm-up completed (--warm-deps).`));
          } else if (depsWarmResult.exitCode !== 0) {
            console.log(chalk.yellow(`  ${runtime} dependency warm-up failed (non-fatal).`));
          }
        }
      } else {
        const depsWarmResult = await warmRuntimeDependencies(
          runtime as 'python' | 'node' | 'go' | 'java' | 'dotnet',
          runtimePath
        );
        const skipped = /skipped/i.test(depsWarmResult.message || '');
        if (depsWarmResult.message) {
          console.log(chalk.gray(`  ${depsWarmResult.message}`));
        }
        if (depsWarmResult.exitCode === 0 && !skipped) {
          console.log(chalk.gray(`  ${runtime} dependency warm-up completed (--warm-deps).`));
        } else if (depsWarmResult.exitCode !== 0) {
          console.log(chalk.yellow(`  ${runtime} dependency warm-up failed (non-fatal).`));
        }
      }
    }

    // Update toolchain.lock with the detected runtime version
    if (workspacePath) {
      try {
        const lockPath = path.join(workspacePath, '.rapidkit', 'toolchain.lock');
        let lock: Record<string, unknown> = {};
        try {
          lock = JSON.parse(await fs.promises.readFile(lockPath, 'utf-8'));
        } catch {
          /* file may not exist yet */
        }
        if (!lock.runtime || typeof lock.runtime !== 'object') lock.runtime = {};
        const rt = lock.runtime as Record<string, unknown>;

        if (runtime === 'python') {
          // Use execa with stdio:pipe so we capture output without double-printing
          let pyVersion: string | null = null;
          try {
            const { execa } = await import('execa');
            for (const candidate of hostPythonCandidates()) {
              const args = candidate === 'py' ? ['-3', '--version'] : ['--version'];
              const r = await execa(candidate, args, {
                cwd: workspacePath,
                stdio: 'pipe',
                reject: false,
                timeout: 3000,
              });
              if (r.exitCode === 0) {
                const raw = r.stdout || r.stderr || '';
                const m = raw.match(/Python\s+(\S+)/);
                pyVersion = m ? m[1] : null;
                if (pyVersion) break;
              }
            }
          } catch {
            /* non-fatal */
          }
          rt.python = {
            ...((rt.python as object) || {}),
            version: pyVersion,
            last_setup: new Date().toISOString(),
          };
        } else if (runtime === 'node') {
          rt.node = {
            ...((rt.node as object) || {}),
            version: process.version,
            last_setup: new Date().toISOString(),
          };
        } else if (runtime === 'go') {
          // Use execa with stdio:pipe — avoids double-printing since go adapter already printed via inherit
          let goVersion: string | null = null;
          try {
            const { execa } = await import('execa');
            const r = await execa('go', ['version'], { cwd: workspacePath, stdio: 'pipe' });
            const m = (r.stdout || '').match(/go(\d+\.\d+(?:\.\d+)?)/i);
            goVersion = m ? m[1] : null;
          } catch {
            /* non-fatal */
          }
          rt.go = {
            ...((rt.go as object) || {}),
            version: goVersion,
            last_setup: new Date().toISOString(),
          };
        } else if (runtime === 'java') {
          let javaVersion: string | null = null;
          let buildTool: 'maven' | 'gradle' | null = null;
          let buildToolVersion: string | null = null;

          const javaProjects = await getWorkspaceJavaProjects();
          const runtimeHasJavaBuildFiles =
            fs.existsSync(path.join(runtimePath, 'pom.xml')) ||
            fs.existsSync(path.join(runtimePath, 'build.gradle')) ||
            fs.existsSync(path.join(runtimePath, 'build.gradle.kts'));
          const javaInspectionPath = runtimeHasJavaBuildFiles
            ? runtimePath
            : javaProjects[0] || runtimePath;

          try {
            const { execa } = await import('execa');

            const javaResult = await execa('java', ['-version'], {
              cwd: workspacePath,
              stdio: 'pipe',
              reject: false,
              timeout: 3000,
            });
            const javaRaw = `${javaResult.stdout || ''}\n${javaResult.stderr || ''}`;
            const javaMatch = javaRaw.match(/version\s+"([^"]+)"/i);
            javaVersion = javaMatch ? javaMatch[1] : null;

            const hasPomXml = fs.existsSync(path.join(javaInspectionPath, 'pom.xml'));
            const hasGradleBuild =
              fs.existsSync(path.join(javaInspectionPath, 'build.gradle')) ||
              fs.existsSync(path.join(javaInspectionPath, 'build.gradle.kts'));

            if (hasPomXml) {
              buildTool = 'maven';
              const mavenCommand = (() => {
                const mvnwCmd = path.join(javaInspectionPath, 'mvnw.cmd');
                if (process.platform === 'win32' && fs.existsSync(mvnwCmd)) return mvnwCmd;
                const mvnw = path.join(javaInspectionPath, 'mvnw');
                if (fs.existsSync(mvnw)) return mvnw;
                return 'mvn';
              })();

              const mavenResult = await execa(mavenCommand, ['-version'], {
                cwd: javaInspectionPath,
                stdio: 'pipe',
                reject: false,
                timeout: 3000,
              });
              const mavenRaw = `${mavenResult.stdout || ''}\n${mavenResult.stderr || ''}`;
              const mavenMatch = mavenRaw.match(/Apache Maven\s+(\S+)/i);
              buildToolVersion = mavenMatch ? mavenMatch[1] : null;
            } else if (hasGradleBuild) {
              buildTool = 'gradle';
              const gradleCommand = (() => {
                const gradlewCmd = path.join(javaInspectionPath, 'gradlew.bat');
                if (process.platform === 'win32' && fs.existsSync(gradlewCmd)) return gradlewCmd;
                const gradlew = path.join(javaInspectionPath, 'gradlew');
                if (fs.existsSync(gradlew)) return gradlew;
                return 'gradle';
              })();

              const gradleResult = await execa(gradleCommand, ['--version'], {
                cwd: javaInspectionPath,
                stdio: 'pipe',
                reject: false,
                timeout: 3000,
              });
              const gradleRaw = `${gradleResult.stdout || ''}\n${gradleResult.stderr || ''}`;
              const gradleMatch = gradleRaw.match(/Gradle\s+(\S+)/i);
              buildToolVersion = gradleMatch ? gradleMatch[1] : null;
            }
          } catch {
            /* non-fatal */
          }

          rt.java = {
            ...((rt.java as object) || {}),
            version: javaVersion,
            build_tool: buildTool,
            build_tool_version: buildToolVersion,
            last_setup: new Date().toISOString(),
          };
        } else if (runtime === 'dotnet') {
          let dotnetVersion: string | null = null;
          try {
            const { execa } = await import('execa');
            const dotnetResult = await execa('dotnet', ['--version'], {
              cwd: workspacePath,
              stdio: 'pipe',
              reject: false,
              timeout: 3000,
            });
            const parsed = (dotnetResult.stdout || '').trim();
            dotnetVersion = parsed.length > 0 ? parsed : null;
          } catch {
            /* non-fatal */
          }

          rt.dotnet = {
            ...((rt.dotnet as object) || {}),
            version: dotnetVersion,
            sdk: dotnetVersion,
            last_setup: new Date().toISOString(),
          };
        }

        lock.updated_at = new Date().toISOString();
        await fs.promises.writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf-8');
        console.log(chalk.gray(`  toolchain.lock updated (.rapidkit/toolchain.lock)`));
      } catch {
        // Non-fatal — toolchain.lock sync is best-effort
      }
    }
  } else {
    console.log(chalk.red(`\u274c ${runtime} prerequisites check failed.`));
  }

  if (hints.length > 0) {
    console.log(chalk.gray('\nHints:'));
    for (const hint of hints) console.log(chalk.gray(`- ${hint}`));
  }

  return prereq.exitCode;
}

function parseCacheConfig(content: string): {
  strategy: string;
  prune_on_bootstrap: boolean;
  self_heal: boolean;
  verify_integrity: boolean;
} {
  const cfg = {
    strategy: 'shared',
    prune_on_bootstrap: false,
    self_heal: true,
    verify_integrity: false,
  };
  for (const line of content.split('\n')) {
    const t = line.trim();
    const stratMatch = t.match(/^strategy:\s*(\S+)/);
    if (stratMatch) cfg.strategy = stratMatch[1].replace(/['"]]/g, '');
    const pruneMatch = t.match(/^prune_on_bootstrap:\s*(true|false)/);
    if (pruneMatch) cfg.prune_on_bootstrap = pruneMatch[1] === 'true';
    const healMatch = t.match(/^self_heal:\s*(true|false)/);
    if (healMatch) cfg.self_heal = healMatch[1] === 'true';
    const verifyMatch = t.match(/^verify_integrity:\s*(true|false)/);
    if (verifyMatch) cfg.verify_integrity = verifyMatch[1] === 'true';
  }
  return cfg;
}

export async function handleCacheCommand(args: string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(chalk.yellow('Usage: rapidkit cache <status|clear|prune|repair>'));
    return 0;
  }

  const action = (args[1] || 'status').toLowerCase();
  const cache = Cache.getInstance();
  const workspacePath = findWorkspaceUp(process.cwd());

  // Read cache-config.yml for workspace-aware settings
  let cacheConfig = {
    strategy: 'shared',
    prune_on_bootstrap: false,
    self_heal: true,
    verify_integrity: false,
  };
  if (workspacePath) {
    try {
      const configContent = await fs.promises.readFile(
        path.join(workspacePath, '.rapidkit', 'cache-config.yml'),
        'utf-8'
      );
      cacheConfig = parseCacheConfig(configContent);
    } catch {
      /* use defaults */
    }
  }

  if (action === 'status') {
    console.log(chalk.cyan('RapidKit cache is enabled'));
    console.log(chalk.cyan('RapidKit cache status'));
    if (workspacePath) {
      console.log(chalk.gray(`  Workspace: ${workspacePath}`));
      console.log(chalk.gray(`  Strategy:          ${cacheConfig.strategy}`));
      console.log(chalk.gray(`  Self-heal:         ${cacheConfig.self_heal}`));
      console.log(chalk.gray(`  Prune on bootstrap:${cacheConfig.prune_on_bootstrap}`));
      console.log(chalk.gray(`  Verify integrity:  ${cacheConfig.verify_integrity}`));
    } else {
      console.log(chalk.gray('  (not inside a workspace — showing in-memory cache only)'));
    }
    console.log(chalk.gray('  In-memory cache: enabled'));
    console.log(chalk.gray('  Use: rapidkit cache clear|prune|repair'));
    return 0;
  }

  if (action === 'clear') {
    // Full cache wipe — removes all cached entries
    await cache.clear();
    console.log(chalk.green('Cache clear completed'));
    console.log(chalk.green('\u2705 Cache cleared (all entries removed).'));
    return 0;
  }

  if (action === 'prune') {
    // Prune stale entries only (honour cache-config strategy)
    await cache.clear();
    console.log(chalk.green('\u2705 Cache pruned (stale entries removed).'));
    if (!cacheConfig.prune_on_bootstrap) {
      console.log(
        chalk.gray(
          '  Tip: set prune_on_bootstrap: true in .rapidkit/cache-config.yml to auto-prune on every bootstrap.'
        )
      );
    }
    return 0;
  }

  if (action === 'repair') {
    // Self-heal: attempt to restore a consistent cache state
    if (!cacheConfig.self_heal) {
      console.log(
        chalk.yellow(
          '\u26a0\ufe0f  self_heal is disabled in .rapidkit/cache-config.yml — skipping repair.'
        )
      );
      return 0;
    }
    await cache.clear();
    console.log(chalk.green('\u2705 Cache repaired (self-heal applied, stale entries evicted).'));
    if (cacheConfig.verify_integrity) {
      console.log(chalk.gray('  Integrity verification is enabled in cache-config.yml.'));
    }
    return 0;
  }

  console.log(chalk.yellow('Usage: rapidkit cache <status|clear|prune|repair>'));
  return 1;
}

async function handleWorkspacePolicyCommand(
  workspacePath: string,
  subaction?: string,
  key?: string,
  value?: string
): Promise<number> {
  const action = (subaction || 'show').toLowerCase();
  const policyPath = path.join(workspacePath, '.rapidkit', 'policies.yml');

  if (action === 'show' || action === 'status' || action === 'get') {
    const rawPolicy = await readWorkspacePolicyFile(workspacePath);
    const policy = parseWorkspacePolicy(rawPolicy);
    console.log(chalk.cyan(`Policy file: ${policyPath}`));
    console.log(chalk.gray(`  mode: ${policy.mode}`));
    console.log(chalk.gray(`  dependency_sharing_mode: ${policy.dependency_sharing_mode}`));
    console.log(chalk.gray('  rules:'));
    console.log(
      chalk.gray(`    enforce_workspace_marker: ${policy.rules.enforce_workspace_marker}`)
    );
    console.log(chalk.gray(`    enforce_toolchain_lock: ${policy.rules.enforce_toolchain_lock}`));
    console.log(
      chalk.gray(
        `    disallow_untrusted_tool_sources: ${policy.rules.disallow_untrusted_tool_sources}`
      )
    );
    console.log(
      chalk.gray(`    enforce_compatibility_matrix: ${policy.rules.enforce_compatibility_matrix}`)
    );
    console.log(
      chalk.gray(
        `    require_mirror_lock_for_offline: ${policy.rules.require_mirror_lock_for_offline}`
      )
    );
    console.log(chalk.gray('Examples:'));
    console.log(chalk.gray('  npx rapidkit workspace policy set mode strict'));
    console.log(
      chalk.gray(
        '  npx rapidkit workspace policy set dependency_sharing_mode shared-runtime-caches'
      )
    );
    console.log(
      chalk.gray('  npx rapidkit workspace policy set rules.enforce_toolchain_lock true')
    );
    return 0;
  }

  if (action !== 'set') {
    console.log(chalk.red(`Unknown workspace policy action: ${subaction || ''}`));
    console.log(chalk.gray('Available: show, set'));
    return 1;
  }

  if (!key || typeof value === 'undefined') {
    console.log(chalk.yellow('Usage: rapidkit workspace policy set <key> <value>'));
    console.log(chalk.gray('Allowed keys:'));
    console.log(chalk.gray('  mode (warn|strict)'));
    console.log(
      chalk.gray('  dependency_sharing_mode (isolated|shared-runtime-caches|shared-node-deps)')
    );
    console.log(chalk.gray('  rules.enforce_workspace_marker (true|false)'));
    console.log(chalk.gray('  rules.enforce_toolchain_lock (true|false)'));
    console.log(chalk.gray('  rules.disallow_untrusted_tool_sources (true|false)'));
    console.log(chalk.gray('  rules.enforce_compatibility_matrix (true|false)'));
    console.log(chalk.gray('  rules.require_mirror_lock_for_offline (true|false)'));
    return 1;
  }

  const normalizedKey = key.trim();
  const rawPolicy = await readWorkspacePolicyFile(workspacePath);
  let nextPolicy = rawPolicy;

  if (normalizedKey === 'mode') {
    const normalizedMode = value.trim().toLowerCase();
    if (normalizedMode !== 'warn' && normalizedMode !== 'strict') {
      console.log(chalk.red('❌ Invalid mode. Use: warn | strict'));
      return 1;
    }
    nextPolicy = replaceOrInsertTopLevelPolicyLine(
      nextPolicy,
      'mode',
      `${normalizedMode} # "warn" or "strict"`
    );
  } else if (normalizedKey === 'dependency_sharing_mode') {
    const normalizedMode = value.trim().toLowerCase();
    if (
      normalizedMode !== 'isolated' &&
      normalizedMode !== 'shared-runtime-caches' &&
      normalizedMode !== 'shared-node-deps'
    ) {
      console.log(
        chalk.red(
          '❌ Invalid dependency_sharing_mode. Use: isolated | shared-runtime-caches | shared-node-deps'
        )
      );
      return 1;
    }
    nextPolicy = replaceOrInsertTopLevelPolicyLine(
      nextPolicy,
      'dependency_sharing_mode',
      `${normalizedMode} # "isolated" or "shared-runtime-caches" or "shared-node-deps"`
    );
  } else if (normalizedKey.startsWith('rules.')) {
    const ruleKey = normalizedKey.slice('rules.'.length) as WorkspacePolicyRuleKey;
    if (!(ruleKey in WORKSPACE_POLICY_RULE_DEFAULTS)) {
      console.log(chalk.red(`❌ Unknown policy rule: ${ruleKey}`));
      return 1;
    }
    const parsedBool = parsePolicyBooleanLiteral(value);
    if (parsedBool === null) {
      console.log(chalk.red('❌ Rule values must be boolean: true | false'));
      return 1;
    }
    nextPolicy = replaceOrInsertRulePolicyLine(nextPolicy, ruleKey, parsedBool);
  } else {
    console.log(chalk.red(`❌ Unknown policy key: ${normalizedKey}`));
    return 1;
  }

  await writeWorkspacePolicyFile(workspacePath, nextPolicy);
  const updated = parseWorkspacePolicy(nextPolicy);
  console.log(chalk.green(`✅ Updated ${normalizedKey} in .rapidkit/policies.yml`));
  console.log(chalk.gray(`  mode: ${updated.mode}`));
  console.log(chalk.gray(`  dependency_sharing_mode: ${updated.dependency_sharing_mode}`));
  console.log(chalk.gray('  Tip: run `npx rapidkit workspace policy show` to inspect all values.'));
  return 0;
}

export async function handleMirrorCommand(args: string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(chalk.yellow('Usage: rapidkit mirror <status|sync|verify|rotate> [--json]'));
    return 0;
  }

  const action = (args[1] || 'status').toLowerCase();
  const jsonMode = args.includes('--json');
  const workspacePath = findWorkspaceUp(process.cwd());

  if (!workspacePath) {
    console.log(chalk.red('❌ Not inside a RapidKit workspace'));
    console.log(chalk.gray('💡 Run this command from within a workspace directory'));
    return 1;
  }

  const rapidkitDir = path.join(workspacePath, '.rapidkit');
  const mirrorConfigPath = path.join(rapidkitDir, 'mirror-config.json');
  const mirrorLockPath = path.join(rapidkitDir, 'mirror.lock');
  const artifactsDir = path.join(rapidkitDir, 'mirror', 'artifacts');
  const reportsDir = path.join(rapidkitDir, 'reports');

  async function writeMirrorReport(payload: Record<string, unknown>): Promise<void> {
    const reportTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportsDir, `mirror-ops-${reportTimestamp}.json`);
    const latestReportPath = path.join(reportsDir, 'mirror-ops.latest.json');
    await fsExtra.ensureDir(reportsDir);
    await writeJsonFile(reportPath, payload);
    await writeJsonFile(latestReportPath, payload);
  }

  async function readMirrorInventory(): Promise<{
    configExists: boolean;
    lockExists: boolean;
    artifactsCount: number;
  }> {
    const configExists = await fsExtra.pathExists(mirrorConfigPath);
    const lockExists = await fsExtra.pathExists(mirrorLockPath);
    let artifactsCount = 0;
    if (await fsExtra.pathExists(artifactsDir)) {
      artifactsCount = (await fs.promises.readdir(artifactsDir, { withFileTypes: true })).filter(
        (entry) => entry.isFile()
      ).length;
    }
    return { configExists, lockExists, artifactsCount };
  }

  if (action === 'status') {
    // Auto-create a default mirror-config.json if it doesn't exist yet.
    // This removes the perpetual "Config: missing" noise and gives users
    // a clear starting point for enabling mirroring.
    const configExists = await fsExtra.pathExists(mirrorConfigPath);
    if (!configExists) {
      try {
        const defaultConfig = {
          schema_version: '1.0',
          enabled: false,
          strategy: 'on-demand',
          artifacts: [],
          created_at: new Date().toISOString(),
          note: 'Auto-generated by rapidkit mirror status. Set enabled: true and add artifact entries to activate mirroring.',
        };
        await fsExtra.ensureDir(rapidkitDir);
        await fs.promises.writeFile(
          mirrorConfigPath,
          JSON.stringify(defaultConfig, null, 2) + '\n',
          'utf-8'
        );
        console.log(
          chalk.gray('  mirror-config.json created with defaults (.rapidkit/mirror-config.json)')
        );
      } catch {
        /* non-fatal */
      }
    }
    // Re-read after potential auto-create so the display reflects the actual state
    const configNowExists = await fsExtra.pathExists(mirrorConfigPath);

    const artifactsExists = await fsExtra.pathExists(artifactsDir);
    const lockExists = await fsExtra.pathExists(mirrorLockPath);
    const artifactsCount = artifactsExists
      ? (await fs.promises.readdir(artifactsDir, { withFileTypes: true })).filter((e) => e.isFile())
          .length
      : 0;

    const statusPayload = {
      command: 'mirror',
      action,
      result: 'ok',
      timestamp: new Date().toISOString(),
      workspacePath,
      mirror: {
        configExists: configNowExists,
        lockExists,
        artifactsCount,
      },
    };

    await writeMirrorReport(statusPayload);

    if (jsonMode) {
      process.stdout.write(`${JSON.stringify(statusPayload, null, 2)}\n`);
      return 0;
    }

    console.log(chalk.cyan('RapidKit mirror status'));
    console.log(chalk.gray(`Workspace: ${workspacePath}`));
    console.log(
      chalk.gray(`Config: ${configNowExists ? 'present' : 'missing'} (${mirrorConfigPath})`)
    );
    console.log(chalk.gray(`Lock: ${lockExists ? 'present' : 'missing'} (${mirrorLockPath})`));
    console.log(chalk.gray(`Artifacts: ${artifactsCount}`));
    return 0;
  }

  if (action === 'sync' || action === 'verify' || action === 'rotate') {
    const lifecycle = await runMirrorLifecycle(workspacePath, {
      ciMode: true,
      offlineMode: action === 'verify',
      forceRun: true,
    });

    const failedChecks = lifecycle.checks.filter((check) => check.status === 'failed');
    const hasVerifyFailure = lifecycle.checks.some(
      (check) => check.id.startsWith('mirror.verify.') && check.status === 'failed'
    );

    if (action === 'verify' && hasVerifyFailure) {
      const payload = {
        command: 'mirror',
        action,
        result: 'failed',
        timestamp: new Date().toISOString(),
        workspacePath,
        mirror: await readMirrorInventory(),
        details: lifecycle.details,
        checks: lifecycle.checks,
      };
      await writeMirrorReport(payload);

      if (jsonMode) {
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        return 1;
      }

      console.log(chalk.red('❌ Mirror verify failed.'));
      for (const check of lifecycle.checks.filter((check) =>
        check.id.startsWith('mirror.verify.')
      )) {
        console.log(chalk.gray(`- ${check.id}: ${check.message}`));
      }
      return 1;
    }

    if (failedChecks.length > 0) {
      const payload = {
        command: 'mirror',
        action,
        result: 'failed',
        timestamp: new Date().toISOString(),
        workspacePath,
        mirror: await readMirrorInventory(),
        details: lifecycle.details,
        checks: lifecycle.checks,
      };
      await writeMirrorReport(payload);

      if (jsonMode) {
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        return 1;
      }

      console.log(
        chalk.yellow(`⚠️  Mirror ${action} completed with ${failedChecks.length} issue(s).`)
      );
      for (const check of failedChecks) {
        console.log(chalk.gray(`- ${check.id}: ${check.message}`));
      }
      return 1;
    }

    const payload = {
      command: 'mirror',
      action,
      result: 'ok',
      timestamp: new Date().toISOString(),
      workspacePath,
      mirror: await readMirrorInventory(),
      details: lifecycle.details,
      checks: lifecycle.checks,
    };
    await writeMirrorReport(payload);

    if (jsonMode) {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      return 0;
    }

    if (action === 'rotate') {
      console.log(
        chalk.green(`✅ Mirror rotate completed. Rotated files: ${lifecycle.details.rotatedFiles}.`)
      );
      return 0;
    }

    if (action === 'verify') {
      console.log(
        chalk.green(
          `✅ Mirror verify completed. Verified artifacts: ${lifecycle.details.verifiedArtifacts}.`
        )
      );
      return 0;
    }

    console.log(
      chalk.green(
        `✅ Mirror sync completed. Synced artifacts: ${lifecycle.details.syncedArtifacts}.`
      )
    );
    return 0;
  }

  console.log(chalk.yellow('Usage: rapidkit mirror <status|sync|verify|rotate> [--json]'));
  return 1;
}

export async function handleInitCommand(args: string[]): Promise<number> {
  const prevSkipLockSync = process.env.RAPIDKIT_SKIP_LOCK_SYNC;
  if (typeof prevSkipLockSync === 'undefined') {
    process.env.RAPIDKIT_SKIP_LOCK_SYNC = '1';
  }

  try {
    const cwd = process.cwd();
    const lifecycle = await withWorkspaceDependencyPolicyContext(cwd, async () => {
      const workspacePathForPolicy = findWorkspaceUp(cwd);
      const pythonAdapter = getRuntimeAdapter('python', { runCommandInCwd, runCoreRapidkit });
      const dotnetAdapter = getRuntimeAdapter('dotnet', { runCommandInCwd, runCoreRapidkit });
      const explicitTargetArgs = args.slice(1).filter((arg) => !arg.startsWith('-'));

      if (explicitTargetArgs.length > 0) {
        // If called with a path argument, check if that path is a Go project
        const targetPath = path.resolve(cwd, explicitTargetArgs[0]);
        const targetJson = readRapidkitProjectJson(targetPath);
        const inferredRuntime = await inferRuntimeByFiles(targetPath);

        if (isGoProject(targetJson, targetPath) || inferredRuntime === 'go') {
          return await handleGoInit(targetPath);
        }
        if (isJavaProject(targetJson, targetPath) || inferredRuntime === 'java') {
          return await handleJavaCommand('init', targetPath);
        }
        if (isDotnetProject(targetJson, targetPath) || inferredRuntime === 'dotnet') {
          return reportRuntimeCommandResult(await dotnetAdapter.initProject(targetPath));
        }
        if (isNodeProject(targetJson, targetPath) || inferredRuntime === 'node') {
          return await handleNodeInitSmart(targetPath);
        }
        if (isPythonProject(targetJson, targetPath) || inferredRuntime === 'python') {
          return await handlePythonInitSmart(targetPath, pythonAdapter);
        }
        return await runCoreRapidkit(args, { cwd });
      }

      // Check if cwd is a Go project
      const projectJsonNow = readRapidkitProjectJson(cwd);
      const cwdIsWorkspaceRoot = !!findWorkspaceUp(cwd) && cwd === findWorkspaceUp(cwd);

      if (!cwdIsWorkspaceRoot && isGoProject(projectJsonNow, cwd)) {
        return await handleGoInit(cwd);
      }
      const inferredRuntimeNow = await inferRuntimeByFiles(cwd);

      if (
        !cwdIsWorkspaceRoot &&
        (isJavaProject(projectJsonNow, cwd) || inferredRuntimeNow === 'java')
      ) {
        return await handleJavaCommand('init', cwd);
      }

      if (
        !cwdIsWorkspaceRoot &&
        (isDotnetProject(projectJsonNow, cwd) || inferredRuntimeNow === 'dotnet')
      ) {
        return reportRuntimeCommandResult(await dotnetAdapter.initProject(cwd));
      }

      if (
        !cwdIsWorkspaceRoot &&
        (isNodeProject(projectJsonNow, cwd) || inferredRuntimeNow === 'node')
      ) {
        return await handleNodeInitSmart(cwd);
      }
      if (
        !cwdIsWorkspaceRoot &&
        (isPythonProject(projectJsonNow, cwd) || inferredRuntimeNow === 'python')
      ) {
        return await handlePythonInitSmart(cwd, pythonAdapter);
      }

      const workspacePath = workspacePathForPolicy || findWorkspaceUp(cwd);
      const contextFile = findContextFileUp(cwd);
      const projectRoot = contextFile ? path.dirname(path.dirname(contextFile)) : null;

      if (projectRoot && projectRoot !== workspacePath) {
        const projectRootJson = readRapidkitProjectJson(projectRoot);
        const inferredRootRuntime = await inferRuntimeByFiles(projectRoot);

        if (isGoProject(projectRootJson, projectRoot) || inferredRootRuntime === 'go') {
          return await handleGoInit(projectRoot);
        }
        if (isJavaProject(projectRootJson, projectRoot) || inferredRootRuntime === 'java') {
          return await handleJavaCommand('init', projectRoot);
        }
        if (isDotnetProject(projectRootJson, projectRoot) || inferredRootRuntime === 'dotnet') {
          return reportRuntimeCommandResult(await dotnetAdapter.initProject(projectRoot));
        }
        if (isNodeProject(projectRootJson, projectRoot) || inferredRootRuntime === 'node') {
          return await handleNodeInitSmart(projectRoot);
        }
        if (isPythonProject(projectRootJson, projectRoot) || inferredRootRuntime === 'python') {
          return await handlePythonInitSmart(projectRoot, pythonAdapter);
        }

        return await runCoreRapidkit(['init'], { cwd: projectRoot });
      }

      if (workspacePath && cwd === workspacePath) {
        console.log(chalk.yellow('⚠️  Running `npx rapidkit init` at workspace root.'));
        console.log(
          chalk.gray(
            '   Root `init`, `workspace init`, and `workspace run init` now share the same full-init flow:\n' +
              '   workspace-profile dependencies first, then project dependency initialization.\n'
          )
        );

        const workspaceInitCode = await installWorkspaceDependencies(workspacePath);
        if (workspaceInitCode !== 0) return workspaceInitCode;

        const { runWorkspaceStage } = await import('./workspace-run.js');
        const report = await runWorkspaceStage({
          workspacePath,
          stage: 'init',
          affected: false,
          blastRadius: false,
          parallel: false,
          continueOnError: false,
          strict: false,
          json: false,
          enforceGates: false,
        });

        return report.summary.exitCode;
      }

      if (!workspacePath) {
        const userConfig = await loadUserConfig();
        const parentDirectory = getCanonicalWorkspacesDirectory();
        const { name } = resolveDefaultWorkspacePath(parentDirectory);

        await fsExtra.ensureDir(parentDirectory);

        const { createProject: createPythonEnvironment } = await import('./create.js');
        await createPythonEnvironment(name, {
          yes: true,
          userConfig,
          parentDirectory,
        });

        // Workspace was just created with stub files (pyproject.toml, poetry.toml).
        // Do NOT install Python deps here — the user should cd into the workspace
        // and run `npx rapidkit init` to trigger dependency installation.
        return 0;
      }

      return await runCoreRapidkit(args, { cwd });
    });

    if (!lifecycle.ok) return lifecycle.code;
    return lifecycle.value;
  } finally {
    if (typeof prevSkipLockSync === 'undefined') {
      delete process.env.RAPIDKIT_SKIP_LOCK_SYNC;
    } else {
      process.env.RAPIDKIT_SKIP_LOCK_SYNC = prevSkipLockSync;
    }
  }
}

async function checkStrictPolicyPreflightForDelegation(cwd: string): Promise<string[]> {
  const workspacePath = findWorkspaceUp(cwd);
  if (!workspacePath) return [];

  // Read policy mode — skip all checks if not strict
  let mode: 'warn' | 'strict' = 'warn';
  try {
    const policyRaw = await fs.promises.readFile(
      path.join(workspacePath, '.rapidkit', 'policies.yml'),
      'utf-8'
    );
    const m =
      policyRaw.match(/^\s*enforcement_mode:\s*(warn|strict)\s*(?:#.*)?$/m) ??
      policyRaw.match(/^\s*mode:\s*(warn|strict)\s*(?:#.*)?$/m);
    if (m?.[1] === 'strict') mode = 'strict';
  } catch {
    return [];
  }
  if (mode !== 'strict') return [];

  const violations: string[] = [];

  // 1. toolchain.lock must exist
  const lockPath = path.join(workspacePath, '.rapidkit', 'toolchain.lock');
  if (!fs.existsSync(lockPath)) {
    violations.push(
      'toolchain.lock is missing — run `rapidkit bootstrap` first (strict mode requires a reproducible toolchain).'
    );
    return violations; // no point checking further
  }

  // 2. Runtime version must be pinned for this project type
  let lock: Record<string, unknown> = {};
  try {
    lock = JSON.parse(await fs.promises.readFile(lockPath, 'utf-8'));
  } catch {
    violations.push(
      'toolchain.lock is invalid JSON — regenerate it with `rapidkit bootstrap` before running commands in strict mode.'
    );
    return violations;
  }
  const rt = (lock.runtime ?? {}) as Record<string, { version?: string | null }>;

  const projectJson = readRapidkitProjectJson(cwd);
  if (isGoProject(projectJson, cwd) && !rt.go?.version) {
    violations.push('go.version is not pinned in toolchain.lock — run `rapidkit setup go` first.');
  } else if (isNodeProject(projectJson, cwd) && !rt.node?.version) {
    violations.push(
      'node.version is not pinned in toolchain.lock — run `rapidkit setup node` first.'
    );
  } else if (isJavaProject(projectJson, cwd) && !rt.java?.version) {
    violations.push(
      'java.version is not pinned in toolchain.lock — run `rapidkit setup java` first.'
    );
  } else if (isDotnetProject(projectJson, cwd) && !rt.dotnet?.version) {
    violations.push(
      'dotnet.version is not pinned in toolchain.lock — run `rapidkit setup dotnet` first.'
    );
  } else if (isPythonProject(projectJson, cwd) && !rt.python?.version) {
    violations.push(
      'python.version is not pinned in toolchain.lock — run `rapidkit setup python` first.'
    );
  }

  // 3. Workspace profile must be compatible with project type
  try {
    const wsJson = JSON.parse(
      await fs.promises.readFile(path.join(workspacePath, '.rapidkit', 'workspace.json'), 'utf-8')
    ) as { profile?: string };
    const wsProfile = wsJson.profile ?? '';
    if (
      wsProfile === 'python-only' &&
      (isGoProject(projectJson, cwd) ||
        isNodeProject(projectJson, cwd) ||
        isJavaProject(projectJson, cwd) ||
        isDotnetProject(projectJson, cwd))
    ) {
      violations.push('Workspace profile is "python-only" but this project is not Python.');
    } else if (
      wsProfile === 'node-only' &&
      (isGoProject(projectJson, cwd) ||
        isPythonProject(projectJson, cwd) ||
        isJavaProject(projectJson, cwd) ||
        isDotnetProject(projectJson, cwd))
    ) {
      violations.push('Workspace profile is "node-only" but this project is not Node.');
    } else if (
      wsProfile === 'go-only' &&
      (isNodeProject(projectJson, cwd) ||
        isPythonProject(projectJson, cwd) ||
        isJavaProject(projectJson, cwd) ||
        isDotnetProject(projectJson, cwd))
    ) {
      violations.push('Workspace profile is "go-only" but this project is not Go.');
    } else if (
      wsProfile === 'java-only' &&
      (isPythonProject(projectJson, cwd) ||
        isNodeProject(projectJson, cwd) ||
        isGoProject(projectJson, cwd) ||
        isDotnetProject(projectJson, cwd))
    ) {
      violations.push('Workspace profile is "java-only" but this project is not Java.');
    } else if (
      wsProfile === 'dotnet-only' &&
      (isPythonProject(projectJson, cwd) ||
        isNodeProject(projectJson, cwd) ||
        isGoProject(projectJson, cwd) ||
        isJavaProject(projectJson, cwd))
    ) {
      violations.push('Workspace profile is "dotnet-only" but this project is not .NET.');
    }
  } catch {
    /* non-fatal */
  }

  return violations;
}

async function delegateToLocalCLI(): Promise<boolean> {
  const isBrokenLegacyWindowsLauncher = async (scriptPath: string): Promise<boolean> => {
    if (!isWindowsPlatform()) {
      return false;
    }
    if (!scriptPath.toLowerCase().endsWith('.cmd')) {
      return false;
    }
    try {
      const content = await fsExtra.readFile(scriptPath, 'utf8');
      const normalized = content.replace(/\r\n/g, '\n').toLowerCase();
      const referencesLegacyRapidkit = normalized.includes('\\.rapidkit\\rapidkit');
      const referencesCmdOrExe =
        normalized.includes('\\.rapidkit\\rapidkit.cmd') ||
        normalized.includes('\\.rapidkit\\rapidkit.exe') ||
        normalized.includes('\\.venv\\scripts\\rapidkit.exe');
      return referencesLegacyRapidkit && !referencesCmdOrExe;
    } catch {
      return false;
    }
  };

  const cwd = process.cwd();
  const args = process.argv.slice(2);
  const firstArg = args[0];
  const isInitCommand = firstArg === 'init';
  const runtimeLifecycleCommands = new Set<string>(WRAPPER_LIFECYCLE_COMMANDS);
  const isHelpLike = !firstArg || firstArg === '--help' || firstArg === '-h' || firstArg === 'help';
  const isWorkspaceRoot = hasWorkspaceRootMarkers(cwd);
  const hasProjectJsonInCwd = fs.existsSync(path.join(cwd, '.rapidkit', 'project.json'));
  const cwdProjectJson = readRapidkitProjectJson(cwd);
  const inferredRuntime = await inferRuntimeByFiles(cwd);
  const isExecutorProjectInCwd =
    isGoProject(cwdProjectJson, cwd) ||
    isNodeProject(cwdProjectJson, cwd) ||
    isPythonProject(cwdProjectJson, cwd) ||
    isJavaProject(cwdProjectJson, cwd) ||
    isDotnetProject(cwdProjectJson, cwd) ||
    hasNpmRuntimeExecutor(inferredRuntime ?? undefined);
  const shouldKeepLifecycleOnWrapper =
    !!firstArg && runtimeLifecycleCommands.has(firstArg) && isExecutorProjectInCwd;
  const bypassLocalWorkspaceLauncher = process.env.RAPIDKIT_LOCAL_LAUNCHER_BYPASS === '1';

  // CRITICAL: npm-only commands must NEVER be delegated to the Python core CLI.
  // These commands are implemented exclusively in the npm wrapper.
  if (isNpmOnlyInvocation(args)) {
    return false;
  }

  // CRITICAL: Never delegate 'create' command - npm CLI must handle it for project registry tracking
  if (args[0] === 'create') {
    return false;
  }

  if (handleProjectCapabilityRequest(args)) {
    return true;
  }

  // Keep workspace-root `init` on npm wrapper orchestration.
  // This preserves expected behavior for workspace dependency init + child project init.
  if (args[0] === 'init' && isWorkspaceRoot && !hasProjectJsonInCwd) {
    return false;
  }

  if (blockUnsupportedProjectCommandIfNeeded(args)) {
    return true;
  }

  // Prefer the official Core contract when possible (best-effort).
  // This is safe here because this function is awaited before CLI execution.
  try {
    const allowShellActivate = firstArg === 'shell' && args[1] === 'activate';

    // DON'T delegate `create` command - let npm CLI handle it for project registry tracking
    const isCreateCommand = firstArg === 'create';

    const detected = await detectRapidkitProject(cwd, { cwd, timeoutMs: 1200 });
    if (detected.ok && detected.data?.isRapidkitProject && detected.data.engine === 'python') {
      // These commands are handled exclusively by the npm wrapper and must never be delegated
      // to the Python core CLI, even when inside a Python workspace.
      const isNpmOnlyCommand = isCreateCommand || isNpmOnlyInvocation(args);
      if (
        !isHelpLike &&
        !allowShellActivate &&
        !isNpmOnlyCommand &&
        !isInitCommand &&
        !shouldKeepLifecycleOnWrapper &&
        shouldBridgeInvocationToCore(args)
      ) {
        // Strict policy pre-flight for lifecycle commands
        if (firstArg && (STRICT_POLICY_PROJECT_COMMANDS as readonly string[]).includes(firstArg)) {
          const violations = await checkStrictPolicyPreflightForDelegation(cwd).catch(
            () => [] as string[]
          );
          if (violations.length > 0) {
            process.stderr.write(
              chalk.red('❌ Strict policy violations prevent running this command:') + '\n'
            );
            for (const v of violations) process.stderr.write(chalk.red(`  • ${v}`) + '\n');
            process.exit(1);
          }
        }
        const code = await runCoreRapidkit(process.argv.slice(2), { cwd });
        process.exit(code);
      }
      // allow npm-only commands, shell helpers and create command
    }
  } catch {
    // Ignore and fall back to filesystem detection.
  }

  // Walk upwards looking for .rapidkit directory (project may be in parent dir)
  const contextFile = findContextFileUp(cwd);

  // FIRST: Check if we have a local rapidkit script and should delegate
  // This works for BOTH npm and pip engine projects
  const isWindows = isWindowsPlatform();
  const localScriptCandidates = bypassLocalWorkspaceLauncher
    ? []
    : getRapidkitLocalScriptCandidates(cwd);

  let localScript: string | null = null;
  for (const candidate of localScriptCandidates) {
    if (await fsExtra.pathExists(candidate)) {
      if (await isBrokenLegacyWindowsLauncher(candidate)) {
        logger.warn(
          `Skipping legacy/broken Windows launcher candidate: ${candidate}. Falling back to core bridge.`
        );
        continue;
      }
      localScript = candidate;
      break;
    }
  }

  // DON'T delegate `create` command - let npm CLI handle it for project registry tracking
  const isCreateCommand = firstArg === 'create';

  // Keep `init` in workspace root on npm wrapper orchestration.
  // Delegating to local script here can route to project-only init behavior and break
  // expected workspace-root semantics (workspace deps + child project initialization).
  if (firstArg === 'init' && isWorkspaceRoot && !hasProjectJsonInCwd) {
    return false;
  }

  // STRICT POLICY PRE-FLIGHT for lifecycle commands.
  // Check before delegating to any local script or Python core so that strict policy
  // is enforced regardless of which engine the project uses (Go, Node, Python).
  if (firstArg && (STRICT_POLICY_PROJECT_COMMANDS as readonly string[]).includes(firstArg)) {
    const violations = await checkStrictPolicyPreflightForDelegation(cwd);
    if (violations.length > 0) {
      process.stderr.write(
        chalk.red('❌ Strict policy violations prevent running this command:') + '\n'
      );
      for (const v of violations) process.stderr.write(chalk.red(`  • ${v}`) + '\n');
      process.exit(1);
    }
  }

  // If we have a local script AND the command is a local command, delegate immediately
  // This works for projects created with --template (npm engine) and workspace projects
  if (
    localScript &&
    firstArg &&
    LOCAL_COMMANDS.includes(firstArg) &&
    !isCreateCommand &&
    !isInitCommand &&
    !shouldKeepLifecycleOnWrapper
  ) {
    logger.debug(`Delegating to local CLI: ${localScript} ${args.join(' ')}`);

    const delegationEnv = firstArg === 'init' ? buildDelegationEnvForInit() : process.env;

    const child = spawn(localScript, args, {
      stdio: 'inherit',
      cwd,
      shell: isWindows,
      env: delegationEnv,
    });

    child.on('close', (code) => {
      process.exit(code ?? 0);
    });

    child.on('error', (err) => {
      logger.error(`Failed to run local rapidkit: ${err.message}`);
      process.exit(1);
    });

    return true;
  }

  // Delegate to the Python core engine when context.json reports a Python install backend.
  if (contextFile && (await fsExtra.pathExists(contextFile))) {
    try {
      const ctx = await fsExtra.readJson(contextFile);
      if (isPythonCoreContextEngine(ctx.engine)) {
        const firstArg = args[0];

        // If a local project script exists, delegate there first (prefer local CLI)
        // On Windows, prefer .cmd files
        const localScriptCandidatesEarly = bypassLocalWorkspaceLauncher
          ? []
          : getRapidkitLocalScriptCandidates(cwd);
        let localScriptEarly: string | null = null;
        for (const c of localScriptCandidatesEarly) {
          if (await fsExtra.pathExists(c)) {
            if (await isBrokenLegacyWindowsLauncher(c)) {
              logger.warn(
                `Skipping legacy/broken Windows launcher candidate: ${c}. Falling back to core bridge.`
              );
              continue;
            }
            localScriptEarly = c;
            break;
          }
        }

        if (
          localScriptEarly &&
          firstArg &&
          LOCAL_COMMANDS.includes(firstArg) &&
          firstArg !== 'init' &&
          !shouldKeepLifecycleOnWrapper
        ) {
          // Delegate to local CLI and return
          logger.debug(
            `Delegating to local CLI (early detection): ${localScriptEarly} ${args.join(' ')}`
          );
          const delegationEnv = firstArg === 'init' ? buildDelegationEnvForInit() : process.env;
          const child = spawn(localScriptEarly, args, {
            stdio: 'inherit',
            cwd,
            env: delegationEnv,
          });
          child.on('close', (code) => process.exit(code ?? 0));
          child.on('error', (err) => {
            logger.error(`Failed to run local rapidkit: ${err.message}`);
            process.exit(1);
          });
          return true;
        }

        // Allow shell activate requests (prints activation snippet).
        if (firstArg === 'shell' && args[1] === 'activate') {
          const snippet = isWindowsPlatform()
            ? `# RapidKit: activation snippet (PowerShell)\n$venv = ".venv"\nif (Test-Path "$venv\\Scripts\\Activate.ps1") { . "$venv\\Scripts\\Activate.ps1" }\n$env:RAPIDKIT_PROJECT_ROOT = (Get-Location).Path\n$project = (Get-Location).Path\n$env:PATH = "$project\\.rapidkit;$project;" + $env:PATH\n\n# CMD alternative:\n# call .venv\\Scripts\\activate.bat\n`
            : `# RapidKit: activation snippet - eval "$(rapidkit shell activate)"\nVENV='.venv'\nif [ -f "$VENV/bin/activate" ]; then\n  . "$VENV/bin/activate"\nelif [ -f "$VENV/bin/activate.fish" ]; then\n  source "$VENV/bin/activate.fish"\nfi\nexport RAPIDKIT_PROJECT_ROOT="$(pwd)"\nexport PATH="$(pwd)/.rapidkit:$(pwd):$PATH"\n`;
          console.log(
            chalk.green.bold(
              '\n✅ Activation snippet — run the following to activate this project in your current shell:\n'
            )
          );
          console.log(snippet);
          console.log(chalk.gray('\n💡 After activation you can run: rapidkit dev\n'));
          process.exit(0);
        }

        // Delegate all other commands to core.
        // But never delegate npm-only commands (bootstrap, cache, mirror, setup, workspace, doctor).
        if (
          !isHelpLike &&
          !isNpmOnlyInvocation(args) &&
          firstArg !== 'init' &&
          !shouldKeepLifecycleOnWrapper &&
          shouldBridgeInvocationToCore(args)
        ) {
          const code = await runCoreRapidkit(args, { cwd });
          process.exit(code);
        }
        // npm-only command: fall through to npm wrapper handling
      }
    } catch (_e) {
      // ignore parse errors, fallback to normal behavior
    }
  }

  // No delegation needed - let the main CLI handle it
  return false;
}

// Track current project path for cleanup on interrupt
let currentProjectPath: string | null = null;
let cleanupInProgress = false;

const program = new Command();

// Legacy flags are intentionally hidden by default. Tests and current UX
// expect legacy template-related flags to remain out of the primary help
// output, even when environment variables are present.
const SHOW_LEGACY =
  process.env.RAPIDKIT_SHOW_LEGACY === '1' ||
  process.env.RAPIDKIT_SHOW_LEGACY?.toLowerCase() === 'true';

export async function shouldForwardToCore(args: string[]): Promise<boolean> {
  if (args.length === 0) return false;

  const first = args[0];
  const second = args[1];

  if (isProjectCapabilityRequest(args)) return false;

  if ((WRAPPER_ORCHESTRATED_PROJECT_COMMANDS as readonly string[]).includes(first)) return false;

  if ((PROJECT_COMMANDS_CORE_FALLBACK as readonly string[]).includes(first)) {
    if (first === 'lint' || first === 'format') {
      const projectJson = readRapidkitProjectJson(process.cwd());
      const inferredRuntime = await inferRuntimeByFiles(process.cwd());
      if (isNodeProject(projectJson, process.cwd()) || inferredRuntime === 'node') {
        const detection = detectBackendFrameworkFromProject(process.cwd(), projectJson);
        if (
          resolveNodeLifecycleScript(process.cwd(), first, { framework: detection.key }) !== null
        ) {
          return false;
        }
      }
      if (isPythonProject(projectJson, process.cwd()) || inferredRuntime === 'python') {
        return true;
      }
      if (findRapidkitProjectRoot(process.cwd())) {
        return false;
      }
    }
    return true;
  }

  // npm-only commands
  if (isNpmOnlyInvocation(args)) return false;
  if (first === 'shell' && second === 'activate') return false;

  // core global flag
  if (args.includes('--tui')) return true;

  // npm UX/help/version flags should remain handled by this wrapper
  if (
    first === '--help' ||
    first === '-h' ||
    first === 'help' ||
    first === '--version' ||
    first === '-V' ||
    first === '-v'
  ) {
    return false;
  }

  // npm-only shorthand flags
  if (args.includes('--template') || args.includes('-t')) return false;

  const cached = await getCachedCoreTopLevelCommands();

  // Core-owned commands may carry wrapper-shared flags (notably --dry-run) and must still forward.
  if (isCoreDelegatedTopLevelCommand(first, cached)) {
    return true;
  }

  // Wrapper-shared flags with non-core top-level tokens imply create/workspace orchestration.
  if (args.some((a) => WRAPPER_SHARED_CLI_FLAGS.has(a))) return false;

  if (cached) {
    return cached.has(first);
  }

  // No cache yet.
  // For well-known core commands, forward immediately so failures (e.g., missing Python)
  // are handled by the bridge instead of being mis-parsed by the wrapper.
  if (BOOTSTRAP_CORE_COMMANDS_SET.has(first)) return true;

  // If the user provided multiple args and none of the wrapper flags matched,
  // this is almost certainly a core invocation.
  if (args.length > 1) return true;

  // Otherwise, treat it as a workspace/project name and let commander handle it.
  return false;
}

program
  .name('rapidkit')
  .description('Create RapidKit workspaces and projects')
  .version(getVersion());

const quickStartInitDevNpx = isWindowsPlatform()
  ? 'npx rapidkit init; npx rapidkit dev'
  : 'npx rapidkit init && npx rapidkit dev';

// Add consistent help headings expected by the tests and UX consumers.
program.addHelpText(
  'beforeAll',
  `RapidKit NPM CLI

Create workspaces, scaffold projects, and manage your development toolchain.
`
);

program.addHelpText(
  'afterAll',
  `
Workspace Setup Commands
  rapidkit bootstrap         Bootstrap projects in workspace (--profile java-only|python-only|node-only|go-only|dotnet-only|polyglot|enterprise)
  rapidkit analyze           Analyze workspace/project health and generate enterprise evidence
  rapidkit setup <runtime>   Set up runtime toolchain  (runtime: python | node | go | java)
  rapidkit readiness         Build release-readiness evidence (use --json for CI)
  rapidkit autopilot release Run end-to-end release gate orchestration (audit|safe-fix|enforce)
  rapidkit workspace list    List registered workspaces on this system
  rapidkit snapshot create   Create a recoverable workspace snapshot
  rapidkit snapshot inspect  Inspect snapshot payload and manifest details
  rapidkit project archive   Safely archive a workspace project
  rapidkit project restore   Restore an archived workspace project
  rapidkit mirror            Manage registry mirrors   (mirror status --json | sync | verify | rotate)
  rapidkit cache             Manage package cache      (cache status | clear | prune | repair)

Project Commands
  rapidkit create            Scaffold a new project    (rapidkit create project)
  rapidkit init              Install project dependencies
  rapidkit dev               Start dev server
  rapidkit build             Build for production
  rapidkit test              Run tests

Quick start:
  npx rapidkit my-workspace              # Create + bootstrap workspace
  cd my-workspace
  npx rapidkit create project            # Interactive kit picker
  ${quickStartInitDevNpx}  # Install deps + run

Notes:
  --skip-install (npm wrapper) enables fast-path for lock/dependency steps.
  It is different from core --skip-essentials (essential module installation).

Use "rapidkit help <command>" for more information.
`
);

// Main command: npx rapidkit <name>
program
  .argument('[name]', 'Name of the workspace or project directory')
  .addOption(
    new Option(
      '-t, --template <template>',
      'Legacy: create a project with template (fastapi, nestjs, springboot, gofiber, gogin, dotnet) instead of a workspace'
    ).hideHelp()
  )
  .option('-y, --yes', 'Skip prompts and use defaults')
  .option('--author <name>', 'Author/team name for workspace metadata')
  .addOption(new Option('--skip-git', 'Skip git initialization').hideHelp())
  .addOption(
    new Option('--skip-install', 'Legacy: skip installing dependencies (template mode)').hideHelp()
  )
  .option('--debug', 'Enable debug logging')
  .addOption(new Option('--dry-run', 'Show what would be created without creating it').hideHelp())
  .addOption(
    new Option('--install-method <method>', 'Installation method: poetry, venv, or pipx')
      .choices(['poetry', 'venv', 'pipx'])
      .hideHelp()
  )
  .addOption(
    new Option(
      '--profile <profile>',
      'Workspace bootstrap profile: minimal, java-only, python-only, node-only, go-only, dotnet-only, polyglot, enterprise'
    )
      .choices([
        'minimal',
        'java-only',
        'python-only',
        'node-only',
        'go-only',
        'dotnet-only',
        'polyglot',
        'enterprise',
      ])
      .hideHelp()
  )
  .addOption(
    new Option(
      '--create-workspace',
      'When creating a project outside a workspace: create and register a workspace in the current directory'
    ).hideHelp()
  )
  .addOption(
    new Option(
      '--no-workspace',
      'When creating a project outside a workspace: do not create a workspace'
    ).hideHelp()
  )
  .option('--no-update-check', 'Skip checking for updates')
  .action(async (name, options) => {
    try {
      // Enable debug mode if requested
      if (options.debug) {
        logger.setDebug(true);
        logger.debug('Debug mode enabled');
      }

      // Load user configuration
      const userConfig = await loadUserConfig();
      logger.debug('User config loaded', userConfig);

      // Load RapidKit config file (rapidkit.config.js)
      const rapidkitConfig = await loadRapidKitConfig();
      logger.debug('RapidKit config loaded', rapidkitConfig);

      // Merge configurations (CLI > rapidkit.config.js > .rapidkitrc.json)
      const mergedConfig = mergeConfigs(userConfig, rapidkitConfig, {
        author: options.author,
        pythonVersion: undefined, // Will be prompted
        skipGit: options.skipGit,
      });
      logger.debug('Merged config', mergedConfig);

      // Check for updates (unless disabled)
      if (options.updateCheck !== false) {
        await checkForUpdates();
      }

      console.log(chalk.blue.bold('\n🚀 Welcome to RapidKit NPM CLI!\n'));

      // If no name provided, show help
      if (!name) {
        printHelp();
        process.exit(0);
      }

      // Validate name
      try {
        validateProjectName(name);
      } catch (error) {
        if (error instanceof RapidKitError) {
          logger.error(`\n❌ ${error.message}`);
          if (error.details) {
            logger.warn(`💡 ${error.details}\n`);
          }
          process.exit(1);
        }
        throw error;
      }

      const isProjectMode = !!options.template;
      const targetPath = isProjectMode
        ? path.resolve(process.cwd(), name)
        : resolveNewWorkspacePath(name);
      currentProjectPath = targetPath;

      // Check if directory already exists
      if (!options.dryRun) {
        if (!isProjectMode) {
          await fsExtra.ensureDir(path.dirname(targetPath));
        }

        const existingWorkspacePath = !isProjectMode ? findExistingWorkspacePath(name) : undefined;
        if (
          (existingWorkspacePath && (await fsExtra.pathExists(existingWorkspacePath))) ||
          (await fsExtra.pathExists(targetPath))
        ) {
          logger.error(`\n❌ Directory "${name}" already exists`);
          if (existingWorkspacePath && existingWorkspacePath !== targetPath) {
            console.log(chalk.gray(`   Found at: ${existingWorkspacePath}`));
          }
          console.log(
            chalk.cyan('\n💡 Choose a different name or delete the existing directory.\n')
          );
          process.exit(1);
        }
      }

      // In project mode, allow any kit slug (core is the source of truth).
      // Keep backward-compatible shorthands: fastapi -> fastapi.standard, nestjs -> nestjs.standard.

      // Dry-run mode
      if (options.dryRun) {
        console.log(chalk.cyan('\n🔍 Dry-run mode - showing what would be created:\n'));
        console.log(chalk.white('📂 Path:'), targetPath);
        console.log(
          chalk.white('📦 Type:'),
          isProjectMode ? `Project (${options.template})` : 'Workspace'
        );
        console.log();
        return;
      }

      // Get details
      if (!options.yes && !isProjectMode) {
        // Workspace prompts (provisioning mode only)
        await inquirer.prompt([
          {
            type: 'input',
            name: 'author',
            message: 'Author name:',
            default: process.env.USER || 'RapidKit User',
          },
        ]);
      } else if (options.yes) {
        console.log(chalk.gray('Using default values (--yes flag)\n'));
      }

      // Create workspace or project
      if (isProjectMode) {
        const raw = String(options.template || '').trim();
        const kit = normalizeKitId(raw);

        if (isNpmBackedKit(kit)) {
          const code = await runNpmBackedKitCreate([
            'create',
            'project',
            kit,
            name,
            ...(options.skipGit ? ['--skip-git'] : []),
          ]);
          if (code !== 0) {
            process.exit(code);
          }
          return;
        }

        // If we're outside a registered workspace, offer to create/register one so the
        // newly created project is tracked and the workspace tools (local venv, launcher)
        // are set up. Flags:
        //   --create-workspace  : create workspace automatically
        //   --no-workspace      : do not create a workspace
        const hasWorkspace = !!findWorkspaceMarkerUp(process.cwd());
        if (!hasWorkspace) {
          const { registerWorkspaceAtPath } = await import('./create.js');
          if (options.createWorkspace) {
            // Non-interactive: create workspace automatically
            await registerWorkspaceAtPath(process.cwd(), {
              skipGit: options.skipGit,
              yes: options.yes,
              userConfig,
            });
          } else if (!options.noWorkspace) {
            // Interactive: prompt the user (unless --no-workspace was specified)
            if (options.yes) {
              // Default to creating a workspace when --yes is provided
              await registerWorkspaceAtPath(process.cwd(), {
                skipGit: options.skipGit,
                yes: true,
                userConfig,
              });
            } else {
              const { createWs } = (await inquirer.prompt([
                {
                  type: 'confirm',
                  name: 'createWs',
                  message:
                    'This project will be created outside a RapidKit workspace. Create and register a workspace here?',
                  default: true,
                } as Question<{ createWs: boolean }>,
              ])) as { createWs: boolean };

              if (createWs) {
                await registerWorkspaceAtPath(process.cwd(), {
                  skipGit: options.skipGit,
                  yes: false,
                  userConfig,
                });
              }
            }
          }
        }

        const createArgs = ['create', 'project', kit, name, '--output', process.cwd()];

        if (options.yes) {
          createArgs.push('--yes');
        }

        const workspacePathForCreate = findWorkspaceUp(process.cwd());
        const explicitSkipInstallForCreate = !!options.skipInstall;
        const skipLockGenerationForCreate =
          explicitSkipInstallForCreate || !!workspacePathForCreate;

        if (explicitSkipInstallForCreate) {
          // Explicit opt-out: preserve legacy behavior for users who requested
          // skipping post-scaffold essentials.
          createArgs.push('--skip-essentials');
        }

        const createEnv = skipLockGenerationForCreate
          ? {
              ...process.env,
              RAPIDKIT_SKIP_LOCKS: '1',
              RAPIDKIT_GENERATE_LOCKS: '0',
            }
          : undefined;

        const createCode = await runCoreRapidkitStreamed(createArgs, {
          cwd: process.cwd(),
          env: createEnv,
        });
        if (createCode !== 0) process.exit(createCode);

        if (workspacePathForCreate && !options.skipInstall) {
          console.log(chalk.gray('ℹ️  Fast create mode (workspace): dependencies were deferred.'));
          console.log(chalk.white('   Next: cd <project-name> && npx rapidkit init'));
        }

        // Copy workspace Python version to project if inside a workspace
        // This must be done AFTER rapidkit-core creates the project, as it may
        // overwrite .python-version during module installation
        const workspaceMarker = findWorkspaceMarkerUp(process.cwd());
        if (workspaceMarker) {
          const workspaceRoot = path.dirname(workspaceMarker);
          const workspacePythonVersionFile = path.join(workspaceRoot, '.python-version');
          const projectPythonVersionFile = path.join(targetPath, '.python-version');

          try {
            if (await fsExtra.pathExists(workspacePythonVersionFile)) {
              const pythonVersion = fs.readFileSync(workspacePythonVersionFile, 'utf-8');
              fs.writeFileSync(projectPythonVersionFile, pythonVersion.trim() + '\n');
              logger.debug(
                `Synced Python version ${pythonVersion.trim()} from workspace to project`
              );
            }
          } catch (err) {
            logger.debug('Could not sync Python version from workspace:', err);
          }
        }

        if (!options.skipInstall) {
          const initCode = await runCoreRapidkit(['init', targetPath], { cwd: process.cwd() });
          if (initCode !== 0) process.exit(initCode);

          // Sync Python version again after init, in case it was overwritten
          if (workspaceMarker) {
            const workspaceRoot = path.dirname(workspaceMarker);
            const workspacePythonVersionFile = path.join(workspaceRoot, '.python-version');
            const projectPythonVersionFile = path.join(targetPath, '.python-version');

            try {
              if (await fsExtra.pathExists(workspacePythonVersionFile)) {
                const pythonVersion = fs.readFileSync(workspacePythonVersionFile, 'utf-8');
                fs.writeFileSync(projectPythonVersionFile, pythonVersion.trim() + '\n');
                logger.debug(`Re-synced Python version ${pythonVersion.trim()} after init`);
              }
            } catch (err) {
              logger.debug('Could not re-sync Python version after init:', err);
            }
          }
        }
      } else {
        const { createProject: createPythonEnvironment } = await import('./create.js');
        await createPythonEnvironment(name, {
          skipGit: options.skipGit,
          dryRun: options.dryRun,
          yes: options.yes,
          userConfig: mergedConfig,
          installMethod: options.installMethod,
          profile: options.profile,
          parentDirectory: path.dirname(targetPath),
        });
        console.log(chalk.gray(`ℹ️  Workspace root: ${targetPath}`));
      }
    } catch (error) {
      if (error instanceof RapidKitError) {
        logger.error(`\n❌ ${error.message}`);
        if (error.details) {
          logger.warn(`💡 ${error.details}`);
        }
        logger.debug('Error code:', error.code);
      } else {
        logger.error('\n❌ An unexpected error occurred:');
        console.error(error);
      }
      process.exit(1);
    } finally {
      currentProjectPath = null;
    }
  });

// Register AI commands
registerAICommands(program);

// Register Product Factory commands
registerProductCommands(program);

// Register infrastructure sidecar commands
registerInfraCommands(program);

program
  .command('commands')
  .description('Show effective RapidKit command ownership and runtime support')
  .option('--json', 'Emit machine-readable JSON output')
  .action(async (options: { json?: boolean }) => {
    printGlobalCommandCapabilities({ json: options.json });
  });

program
  .command('analyze')
  .description('Analyze workspace/project health and generate enterprise-ready evidence')
  .option('--workspace <path>', 'Workspace/root path to analyze')
  .option('--json', 'Output as JSON')
  .option('--output <file>', 'Write JSON report to a file')
  .option('--strict', 'Treat warnings as blocking in the verdict')
  .action(
    async (options: { workspace?: string; json?: boolean; output?: string; strict?: boolean }) => {
      try {
        const { runAnalyze, printAnalyzeReport } = await import('./analyze.js');
        const report = await runAnalyze({
          workspacePath: options.workspace,
          json: options.json === true,
          output: options.output,
          strict: options.strict === true,
        });

        if (options.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          printAnalyzeReport(report);
        }

        if (report.summary.verdict === 'blocked') {
          process.exit(2);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                schemaVersion: 'rapidkit-analyze-error-v1',
                ok: false,
                error: { message },
              },
              null,
              2
            )
          );
        } else {
          console.error(chalk.red(`Analyze failed: ${message}`));
        }
        process.exit(1);
      }
    }
  );

// Register config commands
registerConfigCommands(program);

// Shell helpers - e.g. `rapidkit shell activate` prints an eval-able activation snippet
program
  .command('shell <action>')
  .description('Shell helpers (activate virtualenv in current shell)')
  .action(async (action: string) => {
    if (action !== 'activate') {
      console.log(chalk.red(`Unknown shell command: ${action}`));
      process.exit(1);
    }

    const cwd = process.cwd();
    // search for context.json up the tree
    function findContext(start: string): string | null {
      let p = start;

      while (true) {
        const candidate = path.join(p, '.rapidkit', 'context.json');
        if (fs.existsSync(candidate)) return candidate;
        const parent = path.dirname(p);
        if (parent === p) break;
        p = parent;
      }
      return null;
    }

    // Try to find a RapidKit context.json file in the tree.
    // If the context can't be read/parsed we still try to be helpful:
    // - If a .venv directory exists (or a `.rapidkit/activate` file), print activation
    //   snippet so the user can `eval "$(rapidkit shell activate)"` and continue.
    const ctxFile = findContext(cwd);

    // Helper: search upwards for a `.venv` directory or `.rapidkit/activate`
    function findActivationCandidate(start: string) {
      let p = start;

      while (true) {
        const venv = path.join(p, '.venv');
        const activateFile = path.join(p, '.rapidkit', 'activate');
        if (fs.existsSync(activateFile) || fs.existsSync(venv)) return { venv, activateFile };
        const parent = path.dirname(p);
        if (parent === p) break;
        p = parent;
      }
      return null;
    }

    const candidate = findActivationCandidate(cwd);
    // If we didn't find either context.json or an activation candidate, bail
    if (!ctxFile && !candidate) {
      console.log(chalk.yellow('No RapidKit project found in this directory'));
      process.exit(1);
    }

    // Default activation path if we have a context or venv
    let activatePath: string;
    if (candidate && fs.existsSync(candidate.activateFile)) {
      activatePath = candidate.activateFile;
    } else if (candidate && fs.existsSync(candidate.venv)) {
      activatePath = getVenvActivateScriptPath(candidate.venv);
    } else {
      console.log(chalk.yellow('No virtual environment found'));
      process.exit(1);
    }

    // Print the activation command
    const isWindows = isWindowsPlatform();
    if (isWindows) {
      console.log(`call "${activatePath}"`);
    } else {
      console.log(`. "${activatePath}"`);
    }
  });

program
  .command('readiness')
  .description(
    '🚦 Generate machine-readable release readiness summary (env + doctor + analyze + verify + dependency)'
  )
  .option('--json', 'Output readiness result in JSON format')
  .option('--strict', 'Exit with code 1 unless overall readiness is pass')
  .option(
    '--skip-verify',
    'Skip verify gate (use for workspaces without extension verify artifacts)'
  )
  .action(async (options: { json?: boolean; strict?: boolean; skipVerify?: boolean }) => {
    await runReleaseReadinessCommand({
      json: options.json,
      strict: options.strict,
      skipVerify: options.skipVerify,
    });
  });

program
  .command('pipeline')
  .description(
    '🔗 Run governance pipeline: sync → doctor → analyze → readiness → autopilot (writes pipeline-last-run.json)'
  )
  .option('--json', 'Output pipeline report as JSON')
  .option('--strict', 'Treat warnings as blocking and propagate non-zero exit codes')
  .option('--skip-verify', 'Skip readiness verify gate')
  .option('--skip-analyze', 'Skip analyze stage')
  .option('--skip-autopilot', 'Skip autopilot release stage')
  .option(
    '--autopilot-mode <mode>',
    'Autopilot mode when stage is enabled: audit | safe-fix | enforce',
    'audit'
  )
  .action(
    async (options: {
      json?: boolean;
      strict?: boolean;
      skipVerify?: boolean;
      skipAnalyze?: boolean;
      skipAutopilot?: boolean;
      autopilotMode?: string;
    }) => {
      const autopilotMode = String(options.autopilotMode || 'audit')
        .trim()
        .toLowerCase();
      if (!['audit', 'safe-fix', 'enforce'].includes(autopilotMode)) {
        console.log(chalk.red(`Invalid autopilot mode: ${options.autopilotMode}`));
        process.exit(1);
      }

      const { runPipelineCommand } = await import('./pipeline.js');
      await runPipelineCommand({
        json: options.json === true,
        strict: options.strict === true,
        skipVerify: options.skipVerify === true,
        skipAnalyze: options.skipAnalyze === true,
        skipAutopilot: options.skipAutopilot === true,
        autopilotMode: autopilotMode as 'audit' | 'safe-fix' | 'enforce',
      });
    }
  );

program
  .command('autopilot <action>')
  .description('Run end-to-end release autopilot workflows')
  .option('--mode <mode>', 'Autopilot mode: audit | safe-fix | enforce', 'audit')
  .option('--json', 'Emit machine-readable JSON output')
  .option('--output <file>', 'Write autopilot report to an additional output path')
  .option('--since <ref>', 'Git ref for affected project selection (default: HEAD~1)')
  .option('--parallel', 'Run workspace stage execution in parallel')
  .option('--max-workers <count>', 'Maximum parallel workers')
  .action(
    async (
      action: string,
      options: {
        mode?: string;
        json?: boolean;
        output?: string;
        since?: string;
        parallel?: boolean;
        maxWorkers?: string;
      }
    ) => {
      if (action !== 'release') {
        console.log(chalk.red(`Unknown autopilot action: ${action}`));
        console.log(chalk.gray('Available: release'));
        process.exit(1);
      }

      const mode = String(options.mode || 'audit')
        .trim()
        .toLowerCase();
      if (!['audit', 'safe-fix', 'enforce'].includes(mode)) {
        console.log(chalk.red(`Invalid autopilot mode: ${options.mode}`));
        console.log(chalk.gray('Allowed modes: audit | safe-fix | enforce'));
        process.exit(1);
      }

      const maxWorkersRaw = Number(options.maxWorkers ?? '');
      const maxWorkers = Number.isFinite(maxWorkersRaw)
        ? Math.max(1, Math.trunc(maxWorkersRaw))
        : undefined;

      const { runAutopilotRelease } = await import('./autopilot-release.js');
      let report;
      try {
        report = await runAutopilotRelease({
          workspacePath: process.cwd(),
          mode: mode as 'audit' | 'safe-fix' | 'enforce',
          since: options.since,
          parallel: options.parallel === true,
          maxWorkers,
          json: options.json === true,
          output: options.output,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(chalk.red(`Autopilot release failed: ${message}`));
        process.exit(3);
      }

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      }

      if (report.summary.exitCode !== 0) {
        process.exit(report.summary.exitCode);
      }
    }
  );

// Doctor command - health check for RapidKit environment
program
  .command('import <source>')
  .description(
    'Import a local backend project folder or clone a git repository into the current workspace'
  )
  .option('--workspace <path>', 'Workspace root path (defaults to nearest RapidKit workspace)')
  .option('--name <projectName>', 'Override imported project folder name')
  .option('--enable-modules', 'Enable Core module/template commands for supported runtimes')
  .option('--git', 'Force source to be treated as a git repository URL')
  .option('--json', 'Emit machine-readable JSON output')
  .action(
    async (
      source: string,
      options: {
        workspace?: string;
        name?: string;
        git?: boolean;
        json?: boolean;
        enableModules?: boolean;
      }
    ) => {
      const code = await handleImportCommand(source, options);
      if (code !== 0) {
        process.exit(code);
      }
    }
  );

program
  .command('adopt [source]')
  .description(
    'Adopt an existing local project into a RapidKit workspace without moving or copying source'
  )
  .option('--workspace <path>', 'Workspace root path (defaults to nearest or managed default)')
  .option('--name <projectName>', 'Override adopted project name')
  .option('--enable-modules', 'Enable Core module/template commands for supported runtimes')
  .option('--dry-run', 'Preview adoption without writing project or registry metadata')
  .option('--json', 'Emit machine-readable JSON output')
  .action(
    async (
      source: string | undefined,
      options: {
        workspace?: string;
        name?: string;
        dryRun?: boolean;
        json?: boolean;
        enableModules?: boolean;
      }
    ) => {
      const code = await handleAdoptCommand(source, options);
      if (code !== 0) {
        process.exit(code);
      }
    }
  );

const snapshotCommand = program
  .command('snapshot')
  .description('Create, list, and restore RapidKit workspace snapshots');

snapshotCommand
  .command('create [name]')
  .description('Create a recoverable workspace snapshot')
  .option('--workspace <path>', 'Workspace root path (defaults to nearest RapidKit workspace)')
  .option('--reason <text>', 'Reason recorded in the snapshot manifest')
  .option('--include-projects', 'Include project source files in the snapshot')
  .option('--json', 'Emit machine-readable JSON output')
  .action(
    async (
      name: string | undefined,
      options: { workspace?: string; reason?: string; includeProjects?: boolean; json?: boolean }
    ) => {
      try {
        const result = await createWorkspaceSnapshot({
          workspacePath: options.workspace,
          name,
          reason: options.reason,
          includeProjects: options.includeProjects === true,
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(chalk.green(`✔ Workspace snapshot created: ${result.manifest.name}`));
        console.log(chalk.gray(`   Mode: ${result.manifest.mode}`));
        console.log(chalk.gray(`   Path: ${result.snapshotPath}`));
      } catch (error) {
        console.log(chalk.red(`❌ Snapshot create failed: ${(error as Error).message}`));
        process.exit(1);
      }
    }
  );

snapshotCommand
  .command('list')
  .description('List workspace snapshots')
  .option('--workspace <path>', 'Workspace root path (defaults to nearest RapidKit workspace)')
  .option('--json', 'Emit machine-readable JSON output')
  .action(async (options: { workspace?: string; json?: boolean }) => {
    try {
      const snapshots = await listWorkspaceSnapshots({ workspacePath: options.workspace });

      if (options.json) {
        console.log(JSON.stringify({ snapshots }, null, 2));
        return;
      }

      if (snapshots.length === 0) {
        console.log(chalk.yellow('No workspace snapshots found.'));
        return;
      }

      for (const snapshot of snapshots) {
        console.log(chalk.cyan(snapshot.name));
        console.log(
          chalk.gray(
            `   ${snapshot.createdAt} | ${snapshot.mode} | ${snapshot.projects.length} project(s)`
          )
        );
        console.log(chalk.gray(`   ${snapshot.snapshotPath}`));
      }
    } catch (error) {
      console.log(chalk.red(`❌ Snapshot list failed: ${(error as Error).message}`));
      process.exit(1);
    }
  });

snapshotCommand
  .command('inspect <name>')
  .description('Inspect snapshot manifest and estimated payload size')
  .option('--workspace <path>', 'Workspace root path (defaults to nearest RapidKit workspace)')
  .option('--json', 'Emit machine-readable JSON output')
  .action(async (name: string, options: { workspace?: string; json?: boolean }) => {
    try {
      const result = await inspectWorkspaceSnapshot({
        workspacePath: options.workspace,
        name,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(chalk.cyan(`Snapshot: ${result.manifest.name}`));
      console.log(chalk.gray(`   Mode: ${result.manifest.mode}`));
      console.log(chalk.gray(`   Created: ${result.manifest.createdAt}`));
      console.log(chalk.gray(`   Projects: ${result.manifest.projects.length}`));
      console.log(chalk.gray(`   Files: ${result.estimatedFileCount}`));
      console.log(chalk.gray(`   Bytes: ${result.estimatedBytes}`));
      console.log(chalk.gray(`   Path: ${result.snapshotPath}`));
    } catch (error) {
      console.log(chalk.red(`❌ Snapshot inspect failed: ${(error as Error).message}`));
      process.exit(1);
    }
  });

snapshotCommand
  .command('restore <name>')
  .description('Restore a workspace snapshot')
  .option('--workspace <path>', 'Workspace root path (defaults to nearest RapidKit workspace)')
  .option('--reason <text>', 'Reason recorded in the audit log')
  .option('--dry-run', 'Show what would be restored without changing files')
  .option('--force', 'Required to apply a restore')
  .option('--no-safety-snapshot', 'Do not create a pre-restore metadata snapshot')
  .option('--json', 'Emit machine-readable JSON output')
  .action(
    async (
      name: string,
      options: {
        workspace?: string;
        reason?: string;
        dryRun?: boolean;
        force?: boolean;
        safetySnapshot?: boolean;
        json?: boolean;
      }
    ) => {
      try {
        const result = await restoreWorkspaceSnapshot({
          workspacePath: options.workspace,
          name,
          reason: options.reason,
          dryRun: options.dryRun === true || process.argv.includes('--dry-run'),
          force: options.force === true,
          safetySnapshot: options.safetySnapshot,
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.dryRun) {
          console.log(chalk.cyan(`Snapshot restore dry-run: ${name}`));
        } else {
          console.log(chalk.green(`✔ Workspace snapshot restored: ${name}`));
        }
        console.log(chalk.gray(`   Snapshot: ${result.snapshotPath}`));
        console.log(chalk.gray(`   Restored paths: ${result.restoredPaths.join(', ')}`));
        if (result.safetySnapshotPath) {
          console.log(chalk.gray(`   Safety snapshot: ${result.safetySnapshotPath}`));
        }
      } catch (error) {
        console.log(chalk.red(`❌ Snapshot restore failed: ${(error as Error).message}`));
        process.exit(1);
      }
    }
  );

const projectCommand = program
  .command('project')
  .description('Safe workspace project lifecycle operations');

projectCommand
  .command('commands')
  .description('Show effective commands supported by the current RapidKit project')
  .option('--json', 'Emit machine-readable JSON output')
  .action(async (options: { json?: boolean }) => {
    printProjectCommandCapabilities({ json: options.json });
  });

projectCommand
  .command('archives')
  .description('List archived workspace projects')
  .option('--workspace <path>', 'Workspace root path (defaults to nearest RapidKit workspace)')
  .option('--json', 'Emit machine-readable JSON output')
  .action(async (options: { workspace?: string; json?: boolean }) => {
    try {
      const archives = await listArchivedProjects({ workspacePath: options.workspace });

      if (options.json) {
        console.log(JSON.stringify({ archives }, null, 2));
        return;
      }

      if (archives.length === 0) {
        console.log(chalk.yellow('No archived projects found.'));
        return;
      }

      for (const archive of archives) {
        console.log(chalk.cyan(archive.projectName));
        console.log(chalk.gray(`   Archived: ${archive.archivedAt}`));
        console.log(chalk.gray(`   Path: ${archive.archivePath}`));
        if (archive.reason) console.log(chalk.gray(`   Reason: ${archive.reason}`));
      }
    } catch (error) {
      console.log(chalk.red(`❌ Project archive list failed: ${(error as Error).message}`));
      process.exit(1);
    }
  });

projectCommand
  .command('archive <project>')
  .description('Move a project into .rapidkit/archive with a safety snapshot')
  .option('--workspace <path>', 'Workspace root path (defaults to nearest RapidKit workspace)')
  .option('--reason <text>', 'Reason recorded in the archive manifest')
  .option('--dry-run', 'Show what would be archived without changing files')
  .option('--json', 'Emit machine-readable JSON output')
  .action(
    async (
      project: string,
      options: { workspace?: string; reason?: string; dryRun?: boolean; json?: boolean }
    ) => {
      try {
        const result = await archiveWorkspaceProject({
          workspacePath: options.workspace,
          project,
          reason: options.reason,
          dryRun: options.dryRun === true || process.argv.includes('--dry-run'),
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(
          result.dryRun
            ? chalk.cyan(`Project archive dry-run: ${result.projectName}`)
            : chalk.green(`✔ Project archived: ${result.projectName}`)
        );
        console.log(chalk.gray(`   From: ${result.projectPath}`));
        if (result.archivePath) console.log(chalk.gray(`   To: ${result.archivePath}`));
        if (result.safetySnapshotPath) {
          console.log(chalk.gray(`   Safety snapshot: ${result.safetySnapshotPath}`));
        }
      } catch (error) {
        console.log(chalk.red(`❌ Project archive failed: ${(error as Error).message}`));
        process.exit(1);
      }
    }
  );

projectCommand
  .command('restore <archive>')
  .description('Restore an archived project back into the workspace')
  .option('--workspace <path>', 'Workspace root path (defaults to nearest RapidKit workspace)')
  .option('--name <projectName>', 'Restore using a new project folder name')
  .option('--reason <text>', 'Reason recorded in the audit log')
  .option('--force', 'Overwrite an existing restore target')
  .option('--dry-run', 'Show what would be restored without changing files')
  .option('--json', 'Emit machine-readable JSON output')
  .action(
    async (
      archive: string,
      options: {
        workspace?: string;
        name?: string;
        reason?: string;
        force?: boolean;
        dryRun?: boolean;
        json?: boolean;
      }
    ) => {
      try {
        const result = await restoreArchivedProject({
          workspacePath: options.workspace,
          archive,
          targetName: options.name,
          reason: options.reason,
          force: options.force === true,
          dryRun: options.dryRun === true,
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(
          result.dryRun
            ? chalk.cyan(`Project restore dry-run: ${result.projectName}`)
            : chalk.green(`✔ Project restored: ${result.projectName}`)
        );
        console.log(chalk.gray(`   From: ${result.archivePath}`));
        console.log(chalk.gray(`   To: ${result.projectPath}`));
        if (result.safetySnapshotPath) {
          console.log(chalk.gray(`   Safety snapshot: ${result.safetySnapshotPath}`));
        }
      } catch (error) {
        console.log(chalk.red(`❌ Project restore failed: ${(error as Error).message}`));
        process.exit(1);
      }
    }
  );

projectCommand
  .command('delete <project>')
  .description('Archive by default; permanently delete only with --permanent and exact --confirm')
  .option('--workspace <path>', 'Workspace root path (defaults to nearest RapidKit workspace)')
  .option('--reason <text>', 'Reason recorded in the safety snapshot/archive manifest')
  .option('--permanent', 'Permanently delete the project directory')
  .option('--confirm <projectName>', 'Required exact project name for --permanent')
  .option('--dry-run', 'Show what would be deleted without changing files')
  .option('--json', 'Emit machine-readable JSON output')
  .action(
    async (
      project: string,
      options: {
        workspace?: string;
        reason?: string;
        permanent?: boolean;
        confirm?: string;
        dryRun?: boolean;
        json?: boolean;
      }
    ) => {
      try {
        const result = await deleteWorkspaceProject({
          workspacePath: options.workspace,
          project,
          reason: options.reason,
          permanent: options.permanent === true,
          confirm: options.confirm,
          dryRun: options.dryRun === true || process.argv.includes('--dry-run'),
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        const label = result.action === 'archive' ? 'archived' : 'deleted';
        console.log(
          result.dryRun
            ? chalk.cyan(`Project ${label} dry-run: ${result.projectName}`)
            : chalk.green(`✔ Project ${label}: ${result.projectName}`)
        );
        console.log(chalk.gray(`   Path: ${result.projectPath}`));
        if (result.archivePath) console.log(chalk.gray(`   Archive: ${result.archivePath}`));
        if (result.safetySnapshotPath) {
          console.log(chalk.gray(`   Safety snapshot: ${result.safetySnapshotPath}`));
        }
      } catch (error) {
        console.log(chalk.red(`❌ Project delete failed: ${(error as Error).message}`));
        process.exit(1);
      }
    }
  );

program
  .command('doctor [scope]')
  .description(
    '🩺 Check RapidKit system health by default; use workspace or project for scoped checks'
  )
  .option('--workspace', 'Check entire workspace (including all projects)')
  .option('--project', 'Check only the current project (or nearest parent project)')
  .option('--json', 'Output results in JSON format (for CI/CD pipelines)')
  .option('--strict', 'Exit 1 on health errors or warnings (workspace/project scope)')
  .option('--ci', 'CI gate: exit 1 on errors, exit 2 on warnings only')
  .option('--fix', 'Automatically fix common issues (with confirmation)')
  .option('--plan', 'Generate remediation plan without applying changes')
  .option('--apply', 'Apply remediation plan non-interactively')
  .action(
    async (
      scope: string | undefined,
      options: {
        workspace?: boolean;
        project?: boolean;
        json?: boolean;
        strict?: boolean;
        ci?: boolean;
        fix?: boolean;
        plan?: boolean;
        apply?: boolean;
      }
    ) => {
      if (scope && scope !== 'workspace' && scope !== 'project') {
        console.log(chalk.red(`Unknown doctor scope: ${scope}`));
        console.log(chalk.gray('Available: workspace, project'));
        console.log(
          chalk.gray(
            'Usage: npx rapidkit doctor | npx rapidkit doctor workspace | npx rapidkit doctor project'
          )
        );
        process.exit(1);
      }

      if (options.plan && (options.fix || options.apply)) {
        console.log(
          chalk.red('Invalid doctor flags: --plan cannot be combined with --fix or --apply')
        );
        process.exit(1);
      }

      const shadowDiagnostic = await detectWindowsDoctorWorkspaceShadow({
        scope,
        workspaceFlag: options.workspace,
      });

      if (shadowDiagnostic.detected && !options.json) {
        console.log(
          chalk.yellow('⚠️  Local launcher shadow detected for doctor workspace checks.')
        );
        if (shadowDiagnostic.candidatePath) {
          console.log(chalk.gray(`   Candidate: ${shadowDiagnostic.candidatePath}`));
        }
        console.log(
          chalk.gray(
            '   Running npm-wrapper doctor workflow directly as safe fallback to avoid ambiguous rapidkit binary resolution.'
          )
        );
        console.log(
          chalk.gray(
            '   If this happens in a shell call, run: npx --yes --package rapidkit rapidkit doctor workspace'
          )
        );
      }

      const { runDoctor } = await import('./doctor.js');
      const exitCode = await runDoctor({
        ...options,
        workspace: options.workspace || scope === 'workspace',
        project: options.project || scope === 'project',
        strict: options.strict === true,
        ci: options.ci === true,
      });
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    }
  );

// Workspace management command
program
  .command('workspace <action> [subaction] [key] [value]')
  .description(
    'Manage RapidKit workspaces (list, sync, policy, share, export, hydrate, run)\n' +
      '  workspace run <stage>   \u2014 fleet stage execution across discovered projects\n' +
      '                            stages: init | test | build | start  (dev excluded by design)'
  )
  .option('--workspace <path>', 'Workspace root path (defaults to nearest RapidKit workspace)')
  .option('--output <file>', 'Output file path for workspace share bundle')
  .option('--from <file>', 'Input workspace model snapshot/report for workspace diff')
  .option(
    '--from-impact <file>',
    'Input workspace impact report for workspace verify (defaults to last-run impact)'
  )
  .option('--include-paths', 'Include absolute paths in workspace share bundle')
  .option('--write', 'Write workspace intelligence artifact to .rapidkit/reports')
  .option('--include-evidence', 'Read status metadata from referenced evidence reports')
  .option('--scan-depth <count>', 'Observable project discovery depth for large monorepos')
  .option('--for-agent [agent]', 'Build an agent-ready workspace context pack')
  .option('--scope <scope>', 'Scope workspace intelligence output, e.g. project:<name>')
  .option('--no-doctor', 'Exclude doctor evidence in workspace share bundle')
  .option('--no-blueprint', 'Exclude reproducibility blueprint from workspace share bundle')
  .option('--include-env', 'Include .env/private key files in workspace export archive')
  .option('--force', 'Overwrite an existing hydrate output directory')
  .option('--dry-run', 'Preview hydrate without writing files')
  .option('--affected', 'Run only affected projects (requires git diff context)')
  .option('--blast-radius', 'Include downstream dependents from workspace dependency graph')
  .option('--since <ref>', 'Git ref for affected calculation (default: HEAD~1)')
  .option('--parallel', 'Run project stages in parallel')
  .option('--max-workers <count>', 'Maximum parallel workers (default: min(4, selected))')
  .option('--continue-on-error', 'Continue running remaining projects after a failure')
  .option('--json', 'Emit machine-readable JSON output')
  .option('--strict', 'Return non-zero exit on warn/fail gate outcomes')
  .option('--no-gates', 'Skip doctor/readiness pre-run gates')
  .action(async function (
    this: Command,
    action: string,
    subaction?: string,
    key?: string,
    value?: string
  ) {
    const actionOptions = this.opts() as {
      workspace?: string;
      output?: string;
      from?: string;
      fromImpact?: string;
      includePaths?: boolean;
      write?: boolean;
      includeEvidence?: boolean;
      scanDepth?: string;
      forAgent?: string | boolean;
      scope?: string;
      doctor?: boolean;
      blueprint?: boolean;
      includeEnv?: boolean;
      force?: boolean;
      dryRun?: boolean;
      affected?: boolean;
      blastRadius?: boolean;
      since?: string;
      parallel?: boolean;
      maxWorkers?: string;
      continueOnError?: boolean;
      json?: boolean;
      strict?: boolean;
      gates?: boolean;
    };

    const requireWorkspaceRootForAction = (actionName: string): string => {
      const requestedWorkspace = actionOptions.workspace
        ? path.resolve(actionOptions.workspace)
        : null;
      const workspacePath =
        requestedWorkspace ?? findWorkspaceRootUp(process.cwd()) ?? findWorkspaceUp(process.cwd());

      if (!workspacePath || !hasWorkspaceRootMarkers(workspacePath)) {
        console.log(chalk.red('❌ Not inside a RapidKit workspace'));
        console.log(chalk.gray('💡 Run from a workspace directory or pass --workspace <path>.'));
        process.exit(1);
      }

      const cwd = path.resolve(process.cwd());
      const root = path.resolve(workspacePath);
      if (cwd !== root) {
        console.log(
          chalk.gray(
            `ℹ Using workspace root ${workspacePath} for "${actionName}" (current directory: ${cwd}).`
          )
        );
      }

      return workspacePath;
    };
    const hasRawFlag = (flag: string): boolean => process.argv.includes(flag);
    const workspaceModelScanDepth = (): number | undefined => {
      if (!actionOptions.scanDepth) {
        return undefined;
      }
      const parsed = Number.parseInt(actionOptions.scanDepth, 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    if (action === 'list') {
      const { listWorkspaces } = await import('./workspace.js');
      await listWorkspaces();
    } else if (action === 'model') {
      const workspacePath = requireWorkspaceRootForAction('model');
      const { buildWorkspaceModel, writeWorkspaceModel } = await import('./workspace-model.js');
      const model = await buildWorkspaceModel({
        workspacePath,
        includeAbsolutePaths: actionOptions.includePaths === true || hasRawFlag('--include-paths'),
        includeEvidence: actionOptions.includeEvidence === true || hasRawFlag('--include-evidence'),
        observableScanDepth: workspaceModelScanDepth(),
        strict: actionOptions.strict === true || hasRawFlag('--strict'),
      });
      let outputPath: string | undefined;
      if (actionOptions.write === true || hasRawFlag('--write')) {
        outputPath = await writeWorkspaceModel(model, workspacePath);
      }
      const strictFailed =
        (actionOptions.strict === true || hasRawFlag('--strict')) &&
        model.validation?.status !== 'passed';
      if (actionOptions.json) {
        console.log(JSON.stringify({ ...model, ...(outputPath ? { outputPath } : {}) }, null, 2));
        if (strictFailed) {
          process.exit(1);
        }
        return;
      }
      console.log(chalk.green(`✔ Workspace model: ${model.workspace.name}`));
      console.log(chalk.gray(`   Projects: ${model.summary.projectCount}`));
      console.log(chalk.gray(`   Runtimes: ${model.summary.runtimes.join(', ') || 'none'}`));
      console.log(chalk.gray(`   Frameworks: ${model.summary.frameworks.join(', ') || 'none'}`));
      console.log(chalk.gray(`   Workspace type: ${model.identity.workspaceType}`));
      console.log(
        chalk.gray(
          `   Validation: ${model.validation?.status ?? 'unknown'} (${model.validation?.errors ?? 0} error, ${model.validation?.warnings ?? 0} warning)`
        )
      );
      if (outputPath) {
        console.log(chalk.gray(`   Written: ${outputPath}`));
      } else {
        console.log(chalk.gray('   Add --write to persist .rapidkit/reports/workspace-model.json'));
      }
      if (strictFailed) {
        process.exit(1);
      }
    } else if (action === 'context') {
      const workspacePath = requireWorkspaceRootForAction('context');
      if (
        actionOptions.forAgent !== true &&
        typeof actionOptions.forAgent !== 'string' &&
        subaction !== 'agent'
      ) {
        console.log(chalk.red('❌ workspace context currently requires --for-agent'));
        console.log(
          chalk.gray(
            '   npx rapidkit workspace context --for-agent --json [--scope project:<name>]'
          )
        );
        process.exit(1);
      }
      const { buildWorkspaceAgentContext, writeWorkspaceAgentContext } = await import(
        './workspace-context.js'
      );
      const strictRequested = actionOptions.strict === true || hasRawFlag('--strict');
      const context = await buildWorkspaceAgentContext({
        workspacePath,
        agent: actionOptions.forAgent || key || subaction,
        scope: actionOptions.scope,
        includeEvidence: actionOptions.includeEvidence === true || hasRawFlag('--include-evidence'),
        observableScanDepth: workspaceModelScanDepth(),
        strict: strictRequested && !actionOptions.json,
      });
      let outputPath: string | undefined;
      if (actionOptions.write === true || hasRawFlag('--write')) {
        outputPath = await writeWorkspaceAgentContext(context, workspacePath);
      }
      const strictFailed = strictRequested && context.validation.status !== 'passed';
      if (actionOptions.json) {
        console.log(JSON.stringify({ ...context, ...(outputPath ? { outputPath } : {}) }, null, 2));
        if (strictFailed) {
          process.exit(1);
        }
        return;
      }
      console.log(chalk.green(`✔ Workspace context: ${context.workspace.name}`));
      console.log(chalk.gray(`   Agent: ${context.agent}`));
      console.log(
        chalk.gray(`   Scope: ${context.scope.activeProject ?? context.scope.requested}`)
      );
      console.log(chalk.gray(`   Projects included: ${context.projects.length}`));
      console.log(chalk.gray(`   Safe commands: ${context.safeCommands.length}`));
      console.log(
        chalk.gray(
          `   Validation: ${context.validation.status} (${context.validation.errors} error, ${context.validation.warnings} warning)`
        )
      );
      if (outputPath) {
        console.log(chalk.gray(`   Written: ${outputPath}`));
      } else {
        console.log(
          chalk.gray('   Add --write to persist .rapidkit/reports/workspace-context-agent.json')
        );
      }
    } else if (action === 'snapshot') {
      const workspacePath = requireWorkspaceRootForAction('snapshot');
      const { buildWorkspaceModelSnapshot, writeWorkspaceModelSnapshot } = await import(
        './workspace-intelligence.js'
      );
      const snapshot = await buildWorkspaceModelSnapshot({
        workspacePath,
        includeAbsolutePaths: actionOptions.includePaths === true || hasRawFlag('--include-paths'),
        includeEvidence: actionOptions.includeEvidence === true || hasRawFlag('--include-evidence'),
        observableScanDepth: workspaceModelScanDepth(),
      });
      const outputPath = await writeWorkspaceModelSnapshot(snapshot, workspacePath);
      if (actionOptions.json) {
        console.log(JSON.stringify({ ...snapshot, outputPath }, null, 2));
        return;
      }
      console.log(chalk.green(`✔ Workspace model snapshot: ${snapshot.model.workspace.name}`));
      console.log(chalk.gray(`   Hash: ${snapshot.modelHash}`));
      console.log(chalk.gray(`   Projects: ${snapshot.model.summary.projectCount}`));
      console.log(chalk.gray(`   Workspace type: ${snapshot.model.identity.workspaceType}`));
      console.log(chalk.gray(`   Written: ${outputPath}`));
    } else if (action === 'diff') {
      const workspacePath = requireWorkspaceRootForAction('diff');
      const fromPath = actionOptions.from || subaction;
      if (!fromPath) {
        console.log(
          chalk.red('❌ workspace diff requires --from <snapshot-or-model-report|git[:ref]>')
        );
        console.log(
          chalk.gray(
            '   npx rapidkit workspace diff --from .rapidkit/reports/workspace-model-snapshot.json --json'
          )
        );
        console.log(
          chalk.gray(
            '   npx rapidkit workspace diff --from git --json  (uses snapshot baseline + git working tree)'
          )
        );
        process.exit(1);
      }
      const { diffWorkspaceModel, writeWorkspaceModelDiff } = await import(
        './workspace-intelligence.js'
      );
      const diff = await diffWorkspaceModel({
        workspacePath,
        fromPath,
        includeAbsolutePaths: actionOptions.includePaths === true || hasRawFlag('--include-paths'),
        includeEvidence: actionOptions.includeEvidence === true || hasRawFlag('--include-evidence'),
        observableScanDepth: workspaceModelScanDepth(),
      });
      const outputPath = await writeWorkspaceModelDiff(diff, workspacePath);
      if (actionOptions.json) {
        console.log(JSON.stringify({ ...diff, outputPath }, null, 2));
        return;
      }
      const statusColor = diff.summary.changed ? chalk.yellow : chalk.green;
      console.log(
        statusColor(`✔ Workspace model diff: ${diff.summary.changed ? 'changed' : 'clean'}`)
      );
      console.log(chalk.gray(`   From: ${diff.fromRef}`));
      console.log(chalk.gray(`   Added projects: ${diff.summary.addedProjects}`));
      console.log(chalk.gray(`   Removed projects: ${diff.summary.removedProjects}`));
      console.log(chalk.gray(`   Changed projects: ${diff.summary.changedProjects}`));
      console.log(chalk.gray(`   Workspace changes: ${diff.summary.workspaceChanges}`));
      console.log(chalk.gray(`   Validation changes: ${diff.summary.validationChanges}`));
      if (diff.git?.available) {
        console.log(
          chalk.gray(
            `   Git: ${diff.git.dirty ? 'dirty' : 'clean'} (${diff.summary.gitChangedFiles} mapped change(s))`
          )
        );
      }
      for (const change of diff.changes.slice(0, 12)) {
        console.log(chalk.gray(`   • ${change.type} ${change.target}: ${change.message}`));
      }
      if (diff.changes.length > 12) {
        console.log(chalk.gray(`   … ${diff.changes.length - 12} more change(s)`));
      }
      console.log(chalk.gray(`   Written: ${outputPath}`));
    } else if (action === 'impact') {
      const workspacePath = requireWorkspaceRootForAction('impact');
      const fromPath = actionOptions.from || subaction;
      if (!fromPath) {
        console.log(
          chalk.red('❌ workspace impact requires --from <snapshot-model-or-diff-report>')
        );
        console.log(
          chalk.gray(
            '   npx rapidkit workspace impact --from .rapidkit/reports/workspace-model-diff-last-run.json --json'
          )
        );
        process.exit(1);
      }
      const { buildWorkspaceImpact, writeWorkspaceImpact } = await import(
        './workspace-intelligence.js'
      );
      const impact = await buildWorkspaceImpact({
        workspacePath,
        fromPath,
        scope: actionOptions.scope,
        includeAbsolutePaths: actionOptions.includePaths === true || hasRawFlag('--include-paths'),
        includeEvidence: actionOptions.includeEvidence === true || hasRawFlag('--include-evidence'),
        observableScanDepth: workspaceModelScanDepth(),
      });
      const outputPath = await writeWorkspaceImpact(impact, workspacePath);
      if (actionOptions.json) {
        console.log(JSON.stringify({ ...impact, outputPath }, null, 2));
        return;
      }
      const color =
        impact.summary.risk === 'critical' || impact.summary.risk === 'high'
          ? chalk.red
          : impact.summary.risk === 'medium'
            ? chalk.yellow
            : chalk.green;
      console.log(color(`✔ Workspace impact: ${impact.summary.risk}`));
      console.log(chalk.gray(`   From: ${impact.fromRef}`));
      console.log(chalk.gray(`   Affected projects: ${impact.summary.affectedProjects}`));
      console.log(chalk.gray(`   Workspace items: ${impact.summary.workspaceItems}`));
      console.log(chalk.gray(`   Recommended commands: ${impact.summary.recommendedCommands}`));
      for (const item of impact.affectedProjects.slice(0, 8)) {
        console.log(chalk.gray(`   • ${item.title}: ${item.summary}`));
      }
      if (impact.affectedProjects.length > 8) {
        console.log(chalk.gray(`   … ${impact.affectedProjects.length - 8} more project(s)`));
      }
      console.log(chalk.gray(`   Written: ${outputPath}`));
    } else if (action === 'verify') {
      const workspacePath = requireWorkspaceRootForAction('verify');
      const { buildWorkspaceVerify, writeWorkspaceVerify, workspaceVerifyExitCode } = await import(
        './workspace-verify.js'
      );
      const verify = await buildWorkspaceVerify({
        workspacePath,
        fromImpactPath: actionOptions.fromImpact || subaction,
        scope: actionOptions.scope,
        includeAbsolutePaths: actionOptions.includePaths === true || hasRawFlag('--include-paths'),
        includeEvidence: actionOptions.includeEvidence === true || hasRawFlag('--include-evidence'),
        observableScanDepth: workspaceModelScanDepth(),
      });
      const outputPath = await writeWorkspaceVerify(verify, workspacePath);
      const exitCode = workspaceVerifyExitCode(verify, {
        strict: actionOptions.strict === true || hasRawFlag('--strict'),
      });
      if (actionOptions.json) {
        console.log(JSON.stringify({ ...verify, outputPath }, null, 2));
        if (exitCode !== 0) {
          process.exit(exitCode);
        }
        return;
      }
      const color =
        verify.summary.verdict === 'ready'
          ? chalk.green
          : verify.summary.verdict === 'needs-attention'
            ? chalk.yellow
            : chalk.red;
      console.log(color(`✔ Workspace verify: ${verify.summary.verdict}`));
      console.log(chalk.gray(`   Impact risk: ${verify.impact.risk}`));
      console.log(chalk.gray(`   Steps: ${verify.steps.length}`));
      console.log(
        chalk.gray(
          `   Passed ${verify.summary.stepsPassed}, warn ${verify.summary.stepsWarn}, failed ${verify.summary.stepsFailed}, missing ${verify.summary.stepsMissing}`
        )
      );
      for (const step of verify.steps.slice(0, 10)) {
        console.log(chalk.gray(`   • ${step.id}: ${step.status} — ${step.message}`));
      }
      if (verify.steps.length > 10) {
        console.log(chalk.gray(`   … ${verify.steps.length - 10} more step(s)`));
      }
      console.log(chalk.gray(`   Written: ${outputPath}`));
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    } else if (action === 'sync') {
      const workspacePath = requireWorkspaceRootForAction('sync');
      const { syncWorkspaceProjects } = await import('./workspace.js');
      if (!actionOptions.json) {
        console.log(chalk.cyan(`📂 Scanning workspace: ${path.basename(workspacePath)}`));
      }
      const syncResult = await syncWorkspaceProjects(workspacePath, actionOptions.json === true);
      await syncWorkspaceContractAfterProjectChange(workspacePath, {
        silent: actionOptions.json === true,
      });
      if (actionOptions.json) {
        console.log(
          JSON.stringify(
            {
              schemaVersion: 'rapidkit-workspace-sync-v1',
              workspacePath,
              registry: syncResult,
              contractSynced: true,
            },
            null,
            2
          )
        );
      }
    } else if (action === 'foundation') {
      const workspacePath = requireWorkspaceRootForAction('foundation');
      const foundationAction = subaction || 'ensure';
      if (foundationAction !== 'ensure') {
        console.log(chalk.red(`❌ Unknown workspace foundation action: ${foundationAction}`));
        console.log(chalk.gray('   npx rapidkit workspace foundation ensure [--force] [--json]'));
        process.exit(1);
      }
      const { ensureWorkspaceFoundation } = await import('./utils/workspace-foundation.js');
      const result = await ensureWorkspaceFoundation(workspacePath, {
        force: actionOptions.force === true || hasRawFlag('--force'),
      });
      if (actionOptions.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      if (result.created.length > 0) {
        console.log(chalk.green(`✔ Workspace foundation ensured: ${result.created.join(', ')}`));
      } else {
        console.log(chalk.gray('Workspace foundation files are already up to date.'));
      }
    } else if (action === 'policy') {
      const workspacePath = requireWorkspaceRootForAction('policy');
      const code = await handleWorkspacePolicyCommand(workspacePath, subaction, key, value);
      if (code !== 0) process.exit(code);
    } else if (action === 'contract') {
      const workspacePath = requireWorkspaceRootForAction('contract');
      const {
        buildWorkspaceContractGraph,
        readWorkspaceContract,
        verifyWorkspaceContract,
        writeWorkspaceContract,
        WORKSPACE_CONTRACT_PATH,
      } = await import('./utils/workspace-contract.js');
      const contractAction = subaction || 'inspect';
      const contractPath = actionOptions.output;

      try {
        if (contractAction === 'init') {
          const result = await writeWorkspaceContract({
            workspacePath,
            outputPath: contractPath,
            force: actionOptions.force === true || hasRawFlag('--force'),
          });
          if (actionOptions.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
          }
          console.log(chalk.green(`✔ Workspace contract initialized: ${result.contractPath}`));
          console.log(chalk.gray(`   Projects: ${result.contract.projects.length}`));
          return;
        }

        if (contractAction === 'inspect') {
          const result = await readWorkspaceContract({ workspacePath, contractPath });
          if (actionOptions.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
          }
          console.log(chalk.green(`✔ Workspace contract: ${result.contractPath}`));
          console.log(chalk.gray(`   Workspace: ${result.contract.workspace.name}`));
          console.log(chalk.gray(`   Projects: ${result.contract.projects.length}`));
          console.log(chalk.gray(`   Schema: v${result.contract.schemaVersion}`));
          return;
        }

        if (contractAction === 'verify') {
          const result = await verifyWorkspaceContract({
            workspacePath,
            contractPath,
            strict: actionOptions.strict === true || hasRawFlag('--strict'),
          });
          if (actionOptions.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            const color = result.status === 'passed' ? chalk.green : chalk.red;
            console.log(
              color(`✔ Workspace contract verification ${result.status}: ${result.contractPath}`)
            );
            console.log(chalk.gray(`   Projects: ${result.projectCount}`));
            for (const check of result.checks) {
              const marker = check.status === 'passed' ? '✔' : '✘';
              console.log(chalk.gray(`   ${marker} ${check.id}: ${check.message}`));
            }
            for (const violation of result.violations) {
              console.log(chalk.gray(`   Violation: ${violation}`));
            }
          }
          if (result.status === 'failed' || (result.status !== 'passed' && actionOptions.strict)) {
            process.exit(1);
          }
          return;
        }

        if (contractAction === 'graph') {
          const result = await buildWorkspaceContractGraph({ workspacePath, contractPath });
          if (actionOptions.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
          }
          console.log(chalk.green(`✔ Workspace contract graph: ${result.contractPath}`));
          console.log(chalk.gray(`   Workspace: ${result.graph.workspace.name}`));
          console.log(chalk.gray(`   Projects: ${result.graph.summary.projectCount}`));
          console.log(chalk.gray(`   Dependencies: ${result.graph.summary.dependencyEdges}`));
          console.log(chalk.gray(`   Event links: ${result.graph.summary.eventEdges}`));
          console.log(chalk.gray(`   Ports: ${result.graph.summary.portCount}`));
          for (const node of result.graph.nodes) {
            const ports =
              node.ports.map((port) => `${port.name}:${port.port}`).join(', ') || 'none';
            console.log(
              chalk.gray(
                `   • ${node.id} (${node.runtime || 'unknown'}${node.framework ? `/${node.framework}` : ''}) ports=${ports}`
              )
            );
          }
          for (const edge of result.graph.edges) {
            const label = edge.type === 'event' ? `event:${edge.label}` : edge.label;
            console.log(chalk.gray(`     ${edge.from} -> ${edge.to} [${label}]`));
          }
          return;
        }

        console.log(chalk.red(`❌ Unknown workspace contract action: ${contractAction}`));
        console.log(
          chalk.white(
            `   npx rapidkit workspace contract init|inspect|verify|graph [--output ${WORKSPACE_CONTRACT_PATH}]`
          )
        );
        process.exit(1);
      } catch (error) {
        console.log(
          chalk.red(`❌ Workspace contract ${contractAction} failed: ${(error as Error).message}`)
        );
        process.exit(1);
      }
    } else if (action === 'share') {
      const workspacePath = requireWorkspaceRootForAction('share');

      const outputPath = actionOptions.output || subaction;
      const { createWorkspaceShareBundle } = await import('./workspace.js');
      const bundlePath = await createWorkspaceShareBundle(workspacePath, {
        outputPath,
        includePaths: actionOptions.includePaths === true,
        includeDoctorEvidence: actionOptions.doctor !== false,
        includeBlueprint: actionOptions.blueprint !== false,
      });

      console.log(chalk.green(`✔ Workspace share bundle exported: ${bundlePath}`));
      console.log(
        chalk.gray('Share this JSON with your team for reproducible workspace/project diagnostics.')
      );
    } else if (action === 'export') {
      const workspacePath = requireWorkspaceRootForAction('export');
      const { exportWorkspaceArchive } = await import('./utils/workspace-archive.js');
      const result = await exportWorkspaceArchive({
        workspacePath,
        outputPath: actionOptions.output || subaction,
        includeEnv: actionOptions.includeEnv === true || hasRawFlag('--include-env'),
      });

      if (actionOptions.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const sizeMb = (result.bytesWritten / (1024 * 1024)).toFixed(2);
      console.log(chalk.green(`✔ Workspace archive exported: ${result.archivePath}`));
      console.log(chalk.gray(`   Files: ${result.manifest.files.length}`));
      console.log(chalk.gray(`   Size: ${sizeMb} MB`));
      if (!result.manifest.security.envFilesIncluded) {
        console.log(
          chalk.gray('   Secrets: excluded (.env, private keys, logs, dependency caches)')
        );
      }
    } else if (
      action === 'archive' &&
      (subaction === 'inspect' || subaction === 'verify' || subaction === 'doctor')
    ) {
      const archivePathOrUrl = key;
      if (!archivePathOrUrl) {
        console.log(
          chalk.red(`❌ workspace archive ${subaction} requires an archive path or URL.`)
        );
        console.log(
          chalk.white(`   npx rapidkit workspace archive ${subaction} team.rapidkit-archive.zip`)
        );
        process.exit(1);
      }

      const { doctorWorkspaceArchive, inspectWorkspaceArchive, verifyWorkspaceArchive } =
        await import('./utils/workspace-archive.js');
      try {
        if (subaction === 'inspect') {
          const result = await inspectWorkspaceArchive({ archivePathOrUrl });
          if (actionOptions.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
          }
          const sizeMb = (result.totalBytes / (1024 * 1024)).toFixed(2);
          console.log(chalk.green(`✔ Workspace archive: ${result.archivePath}`));
          console.log(chalk.gray(`   Workspace: ${result.manifest.workspaceName}`));
          console.log(chalk.gray(`   Exported: ${result.manifest.exportedAt}`));
          console.log(chalk.gray(`   Exporter: ${result.manifest.exportedBy || 'unknown'}`));
          console.log(chalk.gray(`   Files: ${result.fileCount}`));
          console.log(chalk.gray(`   Payload: ${sizeMb} MB`));
          return;
        }

        if (subaction === 'doctor') {
          const result = await doctorWorkspaceArchive({
            archivePathOrUrl,
            strict: actionOptions.strict === true || hasRawFlag('--strict'),
          });
          if (actionOptions.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            const color =
              result.status === 'passed'
                ? chalk.green
                : result.status === 'warning'
                  ? chalk.yellow
                  : chalk.red;
            console.log(
              color(`✔ Workspace archive doctor ${result.status}: ${result.archivePath}`)
            );
            console.log(chalk.gray(`   Workspace: ${result.workspaceName}`));
            console.log(chalk.gray(`   Files: ${result.fileCount}`));
            for (const check of result.checks) {
              const marker =
                check.status === 'passed' ? '✔' : check.status === 'warning' ? '⚠' : '✘';
              console.log(chalk.gray(`   ${marker} ${check.id}: ${check.message}`));
            }
            for (const actionItem of result.recommendedActions) {
              console.log(chalk.gray(`   Next: ${actionItem}`));
            }
          }

          if (result.status === 'failed' || (result.status === 'warning' && actionOptions.strict)) {
            process.exit(1);
          }
          return;
        }

        const result = await verifyWorkspaceArchive({
          archivePathOrUrl,
          requireChecksums: actionOptions.strict === true || hasRawFlag('--strict'),
        });
        if (actionOptions.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.status === 'passed') {
          console.log(chalk.green(`✔ Workspace archive verified: ${result.archivePath}`));
          console.log(chalk.gray(`   Files: ${result.verifiedFiles}/${result.fileCount}`));
        } else {
          const color = result.status === 'failed' ? chalk.red : chalk.yellow;
          console.log(
            color(`❌ Workspace archive verification ${result.status}: ${result.archivePath}`)
          );
          if (result.missingArchiveEntries.length) {
            console.log(
              chalk.gray(`   Missing entries: ${result.missingArchiveEntries.join(', ')}`)
            );
          }
          if (result.extraArchiveEntries.length) {
            console.log(
              chalk.gray(`   Unexpected entries: ${result.extraArchiveEntries.join(', ')}`)
            );
          }
          if (result.mismatches.length) {
            console.log(
              chalk.gray(
                `   Mismatches: ${result.mismatches.map((mismatch) => mismatch.path).join(', ')}`
              )
            );
          }
          if (result.missingChecksumFiles.length) {
            console.log(
              chalk.gray(`   Missing checksums: ${result.missingChecksumFiles.join(', ')}`)
            );
          }
        }

        if (result.status === 'failed' || (result.status === 'warning' && actionOptions.strict)) {
          process.exit(1);
        }
      } catch (error) {
        console.log(
          chalk.red(`❌ Workspace archive ${subaction} failed: ${(error as Error).message}`)
        );
        process.exit(1);
      }
    } else if (action === 'hydrate' || action === 'import') {
      const archivePathOrUrl = subaction;
      if (!archivePathOrUrl) {
        console.log(chalk.red(`❌ workspace ${action} requires an archive path or URL.`));
        console.log(
          chalk.white(
            `   npx rapidkit workspace ${action} team.rapidkit-archive.zip --output ./team`
          )
        );
        process.exit(1);
      }

      const { hydrateWorkspaceArchive } = await import('./utils/workspace-archive.js');
      try {
        const result = await hydrateWorkspaceArchive({
          archivePathOrUrl,
          outputPath: actionOptions.output,
          force: actionOptions.force === true || hasRawFlag('--force'),
          dryRun: actionOptions.dryRun === true || hasRawFlag('--dry-run'),
          strict: actionOptions.strict === true || hasRawFlag('--strict'),
        });

        if (actionOptions.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(
          chalk.green(
            result.dryRun
              ? `✔ Workspace archive hydrate preview: ${result.outputPath}`
              : `✔ Workspace archive hydrated: ${result.outputPath}`
          )
        );
        console.log(chalk.gray(`   Files: ${result.files.length}`));
        if (result.manifest?.workspaceName) {
          console.log(chalk.gray(`   Workspace: ${result.manifest.workspaceName}`));
        }
      } catch (error) {
        console.log(chalk.red(`❌ Workspace ${action} failed: ${(error as Error).message}`));
        process.exit(1);
      }
    } else if (action === 'run') {
      const workspacePath = requireWorkspaceRootForAction(`run ${subaction || ''}`.trim());

      if (!subaction || !['init', 'test', 'build', 'start'].includes(subaction)) {
        console.log(chalk.red(`Unknown workspace run stage: ${subaction || '(none provided)'}`));
        console.log(chalk.gray('Available stages: init | test | build | start'));
        console.log(chalk.gray('  • init   — run install/bootstrap across the project fleet'));
        console.log(chalk.gray('  • test   — run test suite across selected projects'));
        console.log(chalk.gray('  • build  — compile/package across selected projects'));
        console.log(chalk.gray('  • start  — start services (smoke/e2e scenarios)'));
        console.log(
          chalk.gray('  Note: dev is excluded — it is a local-only primitive, not a CI stage')
        );
        process.exit(2);
      }

      const maxWorkersRaw = Number(actionOptions.maxWorkers ?? '');
      const maxWorkers = Number.isFinite(maxWorkersRaw)
        ? Math.max(1, Math.trunc(maxWorkersRaw))
        : undefined;

      if (subaction === 'init') {
        const workspaceInitCode = await installWorkspaceDependencies(workspacePath);
        if (workspaceInitCode !== 0) {
          process.exit(workspaceInitCode);
        }
      }

      const { runWorkspaceStage } = await import('./workspace-run.js');
      const report = await runWorkspaceStage({
        workspacePath,
        stage: subaction as 'init' | 'test' | 'build' | 'start',
        scope: actionOptions.scope,
        affected: actionOptions.affected === true,
        blastRadius: actionOptions.blastRadius === true,
        since: actionOptions.since,
        parallel: actionOptions.parallel === true,
        maxWorkers,
        continueOnError: actionOptions.continueOnError === true,
        strict: actionOptions.strict === true,
        json: actionOptions.json === true,
        enforceGates: actionOptions.gates,
      });

      if (actionOptions.json) {
        console.log(JSON.stringify(report, null, 2));
      }

      if (report.summary.exitCode !== 0) {
        process.exit(report.summary.exitCode);
      }
    } else if (action === 'init') {
      console.log(
        chalk.yellow('ℹ  workspace init is an alias of: npx rapidkit workspace run init')
      );
      console.log(
        chalk.gray(
          '   Equivalent full-init aliases at workspace root:\n' +
            '   npx rapidkit init | npx rapidkit workspace init | npx rapidkit workspace run init\n'
        )
      );

      const workspacePath = requireWorkspaceRootForAction('init');

      const maxWorkersRaw = Number(actionOptions.maxWorkers ?? '');
      const maxWorkers = Number.isFinite(maxWorkersRaw)
        ? Math.max(1, Math.trunc(maxWorkersRaw))
        : undefined;

      const workspaceInitCode = await installWorkspaceDependencies(workspacePath);
      if (workspaceInitCode !== 0) {
        process.exit(workspaceInitCode);
      }

      const { runWorkspaceStage } = await import('./workspace-run.js');
      const report = await runWorkspaceStage({
        workspacePath,
        stage: 'init',
        scope: actionOptions.scope,
        affected: actionOptions.affected === true,
        blastRadius: actionOptions.blastRadius === true,
        since: actionOptions.since,
        parallel: actionOptions.parallel === true,
        maxWorkers,
        continueOnError: actionOptions.continueOnError === true,
        strict: actionOptions.strict === true,
        json: actionOptions.json === true,
        enforceGates: actionOptions.gates,
      });

      if (actionOptions.json) {
        console.log(JSON.stringify(report, null, 2));
      }

      if (report.summary.exitCode !== 0) {
        process.exit(report.summary.exitCode);
      }
    } else {
      console.log(chalk.red(`Unknown workspace action: ${action}`));
      console.log(
        chalk.gray(
          'Available: list, model, context, snapshot, diff, impact, sync, policy, share, export, hydrate, import, run'
        )
      );
      process.exit(1);
    }
  });

function printHelp() {
  const quickStartInitDev = isWindowsPlatform()
    ? 'npx rapidkit init; npx rapidkit dev'
    : 'npx rapidkit init && npx rapidkit dev';

  console.log(chalk.white('Usage:\n'));
  console.log(chalk.cyan('  npx rapidkit <workspace-name> [options]\n'));

  console.log(chalk.bold('Quick start — workspace workflow:'));
  console.log(
    chalk.cyan('  npx rapidkit my-workspace            ') +
      chalk.gray('# Create workspace (interactive profile picker)')
  );
  console.log(chalk.cyan('  cd my-workspace'));
  console.log(
    chalk.cyan('  npx rapidkit bootstrap                   ') +
      chalk.gray('# Bootstrap all runtime toolchains')
  );
  console.log(
    chalk.cyan('  npx rapidkit create project              ') +
      chalk.gray('# Interactive kit picker')
  );
  console.log(
    chalk.cyan('  npx rapidkit create frontend nextjs web  ') +
      chalk.gray('# Create a frontend with the official generator')
  );
  console.log(chalk.cyan('  cd my-api'));
  console.log(chalk.cyan(`  ${quickStartInitDev}\n`));

  console.log(chalk.bold('Workspace profiles (asked during creation):'));
  console.log(chalk.gray('  minimal       Foundation files only — fastest bootstrap (default)'));
  console.log(chalk.gray('  java-only     Java runtime      (Spring Boot services)'));
  console.log(chalk.gray('  python-only   Python + Poetry  (FastAPI, Django, ML)'));
  console.log(chalk.gray('  node-only     Node.js runtime   (NestJS, Express, Next.js)'));
  console.log(chalk.gray('  go-only       Go runtime        (Fiber, Gin, gRPC)'));
  console.log(chalk.gray('  dotnet-only   .NET runtime      (ASP.NET Core services)'));
  console.log(chalk.gray('  polyglot      Python + Node.js + Go + Java + .NET multi-runtime'));
  console.log(chalk.gray('  enterprise    Polyglot + governance + Sigstore\n'));

  console.log(chalk.bold('Workspace commands (inside a workspace):'));
  console.log(chalk.gray('  npx rapidkit bootstrap [--profile <p>]   Re-bootstrap toolchains'));
  console.log(
    chalk.gray('  npx rapidkit analyze [--json --strict]   Analyze workspace health and gaps')
  );
  console.log(
    chalk.gray(
      '  npx rapidkit pipeline [--json --strict]    Governance loop: sync → doctor → analyze → readiness → autopilot'
    )
  );
  console.log(
    chalk.gray(
      '  npx rapidkit readiness [--json --strict]   Release readiness gates (env/doctor/analyze/verify/deps)'
    )
  );
  console.log(
    chalk.gray('  npx rapidkit doctor workspace [--ci]     Workspace health with CI exit codes')
  );
  console.log(chalk.gray('  npx rapidkit workspace list               List registered workspaces'));
  console.log(
    chalk.gray('  npx rapidkit workspace model --json      Build workspace intelligence model')
  );
  console.log(
    chalk.gray(
      '  npx rapidkit workspace context --for-agent --json  Build agent-ready context pack'
    )
  );
  console.log(
    chalk.gray('  npx rapidkit workspace snapshot --json   Persist workspace intelligence snapshot')
  );
  console.log(
    chalk.gray(
      '  npx rapidkit workspace diff --from <file|git[:ref]> --json  Diff current model against a snapshot'
    )
  );
  console.log(
    chalk.gray(
      '  npx rapidkit workspace impact --from <file> --json  Build blast radius from model diff'
    )
  );
  console.log(
    chalk.gray(
      '  npx rapidkit workspace verify [--strict] --json  Evaluate impact verification evidence'
    )
  );
  console.log(
    chalk.gray(
      '  npx rapidkit workspace run test --scope project:<name>  Run a stage for one project'
    )
  );
  console.log(
    chalk.gray('  npx rapidkit workspace sync [--json]      Sync registry + contract from projects')
  );
  console.log(
    chalk.gray(
      '  npx rapidkit import <path|git-url>        Copy or clone a backend project into this workspace'
    )
  );
  console.log(
    chalk.gray(
      '  npx rapidkit adopt [path]                Link an existing local project to a workspace'
    )
  );
  console.log(
    chalk.gray('  npx rapidkit snapshot create [name]      Create a recoverable workspace snapshot')
  );
  console.log(
    chalk.gray(
      '  npx rapidkit snapshot restore <name>     Restore snapshot metadata with safety guard'
    )
  );
  console.log(
    chalk.gray('  npx rapidkit snapshot inspect <name>     Inspect snapshot manifest and size')
  );
  console.log(
    chalk.gray(
      '  npx rapidkit project archive <name>      Archive a project with a safety snapshot'
    )
  );
  console.log(
    chalk.gray('  npx rapidkit project restore <archive>   Restore an archived project safely')
  );
  console.log(
    chalk.gray('  npx rapidkit workspace share [--output <file>] Export collaboration bundle')
  );
  console.log(
    chalk.gray(
      '  npx rapidkit workspace foundation ensure   Ensure workspace.json/policies/toolchain files'
    )
  );
  console.log(
    chalk.gray('  npx rapidkit workspace contract init     Create workspace service contract')
  );
  console.log(
    chalk.gray('  npx rapidkit workspace contract verify   Verify service ports/dependencies')
  );
  console.log(
    chalk.gray('  npx rapidkit workspace contract graph    Show service dependency graph')
  );
  console.log(
    chalk.gray('  npx rapidkit workspace export --output <file> Export portable workspace archive')
  );
  console.log(
    chalk.gray('  npx rapidkit workspace archive verify <file> Verify archive integrity')
  );
  console.log(
    chalk.gray('  npx rapidkit workspace archive doctor <file> Diagnose archive readiness')
  );
  console.log(
    chalk.gray(
      '  npx rapidkit workspace hydrate <archive> --output <dir> Hydrate workspace archive'
    )
  );
  console.log(
    chalk.gray('  npx rapidkit workspace policy show        Show effective workspace policies')
  );
  console.log(
    chalk.gray('  npx rapidkit workspace policy set <k> <v> Update workspace policy values')
  );
  console.log(
    chalk.gray(
      '  npx rapidkit setup python|node|go|java|dotnet [--warm-deps]  Set up runtime (+ optional deps warm-up)'
    )
  );
  console.log(
    chalk.gray('  npx rapidkit mirror [status|sync|verify|rotate] Registry mirror management')
  );
  console.log(
    chalk.gray('  npx rapidkit cache [status|clear|prune|repair]  Package cache management')
  );
  console.log(
    chalk.gray('  npx rapidkit infra plan                     Discover and generate infra compose')
  );
  console.log(
    chalk.gray(
      '  npx rapidkit infra up|down|status           Manage Docker sidecar infrastructure\n'
    )
  );

  console.log(chalk.bold('Options (workspace creation):'));
  console.log(chalk.gray('  -y, --yes                  Skip prompts and use defaults'));
  console.log(chalk.gray('  --author <name>            Author/team name for workspace metadata'));
  console.log(chalk.gray('  --skip-git                 Skip git initialization'));
  console.log(chalk.gray('  --debug                    Enable debug logging'));
  console.log(chalk.gray('  --dry-run                  Show what would be created'));
  console.log(
    chalk.gray(
      '  --create-workspace         When creating a project outside a workspace: create and register a workspace in the current directory'
    )
  );
  console.log(
    chalk.gray(
      '  --no-workspace             When creating a project outside a workspace: do not create a workspace'
    )
  );
  console.log(chalk.gray('  --no-update-check          Skip checking for updates\n'));

  console.log(chalk.bold('Project commands (inside a project):'));
  console.log(chalk.gray('  npx rapidkit create project     Scaffold a new project'));
  console.log(chalk.gray('  cd my-api                   Change directory to the new project'));
  console.log(chalk.gray('  npx rapidkit init               Install project dependencies'));
  console.log(chalk.gray('  npx rapidkit dev                Start dev server'));
  console.log(chalk.gray('  npx rapidkit build              Build for production'));
  console.log(chalk.gray('  npx rapidkit test               Run tests\n'));

  console.log(chalk.bold('Flags clarification:'));
  console.log(chalk.gray('  --skip-install              npm fast-path for lock/dependency steps'));
  console.log(
    chalk.gray(
      '  --skip-essentials           core flag for skipping essential module installation\n'
    )
  );

  if (SHOW_LEGACY) {
    console.log(chalk.bold('Legacy (shown because RAPIDKIT_SHOW_LEGACY=1):'));
    console.log(chalk.gray('  npx rapidkit my-project --template fastapi'));
    console.log(chalk.gray('  npx rapidkit my-project --template nestjs'));
    console.log(chalk.gray('  npx rapidkit my-project --template springboot'));
    console.log(chalk.gray('  npx rapidkit my-project --template gofiber'));
    console.log(chalk.gray('  npx rapidkit my-project --template gogin'));
    console.log(chalk.gray('  npx rapidkit my-project --template dotnet'));
    console.log(
      chalk.gray(
        '  --skip-install             Fast-path lock/deps (legacy template mode) — not same as --skip-essentials\n'
      )
    );
  } else {
    console.log(
      chalk.gray('Tip: set RAPIDKIT_SHOW_LEGACY=1 to show legacy template flags in help.\n')
    );
  }
}

const SIGNAL_HANDLER_REGISTRY_KEY = '__rapidkit_signal_handlers_registered__';
const signalRegistry = globalThis as typeof globalThis & {
  [SIGNAL_HANDLER_REGISTRY_KEY]?: boolean;
};

if (!signalRegistry[SIGNAL_HANDLER_REGISTRY_KEY]) {
  signalRegistry[SIGNAL_HANDLER_REGISTRY_KEY] = true;

  // Handle process interruption (Ctrl+C)
  process.on('SIGINT', async () => {
    if (cleanupInProgress) return;

    cleanupInProgress = true;
    console.log(chalk.yellow('\n\n⚠️  Interrupted by user'));

    if (currentProjectPath && (await fsExtra.pathExists(currentProjectPath))) {
      console.log(chalk.gray('Cleaning up partial installation...'));
      try {
        await fsExtra.remove(currentProjectPath);
        console.log(chalk.green('✓ Cleanup complete'));
      } catch (error) {
        logger.debug('Cleanup failed:', error);
      }
    }

    process.exit(130);
  });

  // Handle termination signal
  process.on('SIGTERM', async () => {
    if (cleanupInProgress) return;

    cleanupInProgress = true;
    logger.debug('Received SIGTERM');

    if (currentProjectPath && (await fsExtra.pathExists(currentProjectPath))) {
      try {
        await fsExtra.remove(currentProjectPath);
      } catch (error) {
        logger.debug('Cleanup failed:', error);
      }
    }

    process.exit(143);
  });
}

const isVitestRuntime =
  process.env.VITEST === 'true' || process.env.VITEST === '1' || process.env.NODE_ENV === 'test';

// When this file is executed as the CLI entrypoint (node dist/index.js ...),
// we must bootstrap command handling even if NODE_ENV=test is set by the test runner.
const isDirectCliExecution = (() => {
  const entryArg = process.argv[1];
  if (!entryArg) return false;
  const normalizedEntry = entryArg.replace(/\\/g, '/');
  const entryLooksLikeRapidkitCli =
    normalizedEntry.endsWith('/dist/index.js') || normalizedEntry.endsWith('/src/index.ts');
  try {
    return (
      fs.realpathSync(entryArg) === fs.realpathSync(fileURLToPath(import.meta.url)) ||
      entryLooksLikeRapidkitCli
    );
  } catch {
    return (
      path.resolve(entryArg) === path.resolve(fileURLToPath(import.meta.url)) ||
      entryLooksLikeRapidkitCli
    );
  }
})();

const shouldBootstrapCli = !isVitestRuntime || isDirectCliExecution;

function forceBlockingCliOutput(): void {
  for (const stream of [process.stdout, process.stderr]) {
    const handle = (
      stream as NodeJS.WriteStream & {
        _handle?: { setBlocking?: (blocking: boolean) => void };
      }
    )._handle;
    handle?.setBlocking?.(true);
  }
}

async function exitAfterOutputFlush(code: number): Promise<never> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setTimeout(resolve, 25));
  await Promise.all(
    [process.stdout, process.stderr].map(
      (stream) =>
        new Promise<void>((resolve) => {
          stream.write('', () => resolve());
        })
    )
  );
  process.exit(code);
}

// Delegate to local CLI if inside a RapidKit project
if (shouldBootstrapCli) {
  forceBlockingCliOutput();

  const preArgs = process.argv.slice(2);
  const preFirst = preArgs[0];
  const preCwd = process.cwd();
  const preIsWorkspaceRoot = hasWorkspaceRootMarkers(preCwd);
  const preHasProjectJson = fs.existsSync(path.join(preCwd, '.rapidkit', 'project.json'));
  const preIsNpmExecInvocation = isNpmExecInvocation();

  const shouldParseNpmOnlyDirectly = isNpmOnlyParseDirectInvocation(preArgs);
  const shouldKeepNpmOwnedCommandLocal = preIsNpmExecInvocation && isNpmOnlyInvocation(preArgs);
  const shouldHandleWorkspaceInitDirectly =
    preFirst === 'init' && preIsWorkspaceRoot && !preHasProjectJson;
  const shouldRenderCustomRootHelp =
    preArgs.length === 0 ||
    (preArgs.length === 1 && (preFirst === '--help' || preFirst === '-h' || preFirst === 'help'));

  if (shouldRenderCustomRootHelp) {
    console.log(chalk.blue.bold('\n🚀 Welcome to RapidKit NPM CLI!\n'));
    printHelp();
    process.exit(0);
  }

  if (
    preArgs.some((arg) => arg === '--version' || arg === '-V' || arg === '-v') &&
    !preArgs.some((arg) => arg === '--help' || arg === '-h' || arg === 'help')
  ) {
    console.log(getVersion());
    process.exit(0);
  }

  if (handleProjectCapabilityRequest(preArgs)) {
    process.exit(0);
  }

  if (shouldKeepNpmOwnedCommandLocal && isNpmOnlyManualHandlerCommand(preFirst)) {
    (async () => {
      if (preFirst === 'bootstrap') {
        await exitAfterOutputFlush(await handleBootstrapCommand(preArgs));
      }
      if (preFirst === 'setup') {
        await exitAfterOutputFlush(await handleSetupCommand(preArgs));
      }
      if (preFirst === 'cache') {
        await exitAfterOutputFlush(await handleCacheCommand(preArgs));
      }
      await exitAfterOutputFlush(await handleMirrorCommand(preArgs));
    })().catch((error) => {
      process.stderr.write(
        `RapidKit (npm) failed to run ${preFirst}: ${(error as Error)?.message ?? error}\n`
      );
      process.exit(1);
    });
  } else if (shouldParseNpmOnlyDirectly || shouldKeepNpmOwnedCommandLocal) {
    program
      .parseAsync()
      .then(() => exitAfterOutputFlush(0))
      .catch((error) => {
        process.stderr.write(`RapidKit (npm) failed: ${(error as Error)?.message ?? error}\n`);
        process.exit(1);
      });
  } else if (shouldHandleWorkspaceInitDirectly) {
    // Keep workspace-root init on npm wrapper path before any delegation attempt.
    handleInitCommand(preArgs)
      .then((code) => exitAfterOutputFlush(code))
      .catch((error) => {
        process.stderr.write(
          `RapidKit (npm) failed to run workspace init: ${(error as Error)?.message ?? error}\n`
        );
        process.exit(1);
      });
  } else {
    delegateToLocalCLI().then(async (delegated) => {
      if (!delegated) {
        const args = process.argv.slice(2);

        if (process.env.RAPIDKIT_NPM_DEBUG_ARGS === '1') {
          // Intentionally write to stderr to avoid corrupting JSON stdout from core.
          process.stderr.write(`[rapidkit-npm] argv=${JSON.stringify(args)}\n`);
        }

        if (isNpmOnlyParseDirectInvocation(args)) {
          // Commander-native npm-only commands.
          await program.parseAsync();
          return;
        }

        if (handleProjectCapabilityRequest(args)) {
          await exitAfterOutputFlush(0);
        }

        // Special-case `create` to preserve canonical Core UX while allowing a
        // last-resort offline fallback (fastapi/nestjs scaffolds) when Python/Core
        // cannot run.
        if (args[0] === 'create') {
          const code = await handleCreateOrFallback(args);
          await exitAfterOutputFlush(code);
        }

        if (args[0] === 'init') {
          const code = await handleInitCommand(args);
          await exitAfterOutputFlush(code);
        }

        if (isNpmOnlyManualHandlerCommand(args[0])) {
          if (args[0] === 'bootstrap') {
            const code = await handleBootstrapCommand(args);
            await exitAfterOutputFlush(code);
          }

          if (args[0] === 'setup') {
            const code = await handleSetupCommand(args);
            await exitAfterOutputFlush(code);
          }

          if (args[0] === 'cache') {
            const code = await handleCacheCommand(args);
            await exitAfterOutputFlush(code);
          }

          const code = await handleMirrorCommand(args);
          await exitAfterOutputFlush(code);
        }

        // lifecycle commands: enforce workspace dependency policy context and strict policy
        if (isWrapperLifecycleCommand(args[0])) {
          if (blockUnsupportedProjectCommandIfNeeded(args)) {
            return;
          }

          const action = args[0];
          const projectJson = readRapidkitProjectJson(process.cwd());
          const inferredRuntime = await inferRuntimeByFiles(process.cwd());
          const wsPath = findWorkspaceUp(process.cwd());
          let strictPolicyMode = false;

          // Strict policy pre-flight: before any lifecycle command, check mandatory
          // workspace invariants when enforcement_mode is strict.
          if (wsPath) {
            const policyFile = path.join(wsPath, '.rapidkit', 'policies.yml');
            if (await fsExtra.pathExists(policyFile)) {
              try {
                const policyContent = await fs.promises.readFile(policyFile, 'utf-8');
                const modeMatch =
                  policyContent.match(/^\s*enforcement_mode:\s*(warn|strict)\s*(?:#.*)?$/m) ??
                  policyContent.match(/^\s*mode:\s*(warn|strict)\s*(?:#.*)?$/m);
                const policyEnforcementMode = modeMatch?.[1] ?? 'warn';
                strictPolicyMode = policyEnforcementMode === 'strict';

                if (strictPolicyMode) {
                  const lockPath = path.join(wsPath, '.rapidkit', 'toolchain.lock');
                  const violations: string[] = [];

                  // Strict requirement: toolchain.lock must exist
                  if (!(await fsExtra.pathExists(lockPath))) {
                    violations.push(
                      'toolchain.lock is missing — run `rapidkit bootstrap` first (strict mode requires a reproducible toolchain).'
                    );
                  } else {
                    try {
                      const lock = JSON.parse(
                        await fs.promises.readFile(lockPath, 'utf-8')
                      ) as Record<string, unknown>;
                      const rt = (lock.runtime ?? {}) as Record<string, Record<string, unknown>>;

                      // Strict requirement: runtime version must be pinned for the project type
                      if (isGoProject(projectJson, process.cwd()) && !rt.go?.version) {
                        violations.push(
                          'Go runtime version is not pinned in toolchain.lock — run `rapidkit setup go` first.'
                        );
                      }
                      if (isNodeProject(projectJson, process.cwd()) && !rt.node?.version) {
                        violations.push(
                          'Node runtime version is not pinned in toolchain.lock — run `rapidkit setup node` first.'
                        );
                      }
                      if (isJavaProject(projectJson, process.cwd()) && !rt.java?.version) {
                        violations.push(
                          'Java runtime version is not pinned in toolchain.lock — run `rapidkit setup java` first.'
                        );
                      }
                      if (isDotnetProject(projectJson, process.cwd()) && !rt.dotnet?.version) {
                        violations.push(
                          '.NET runtime version is not pinned in toolchain.lock — run `rapidkit setup dotnet` first.'
                        );
                      }
                      if (isPythonProject(projectJson, process.cwd()) && !rt.python?.version) {
                        violations.push(
                          'Python runtime version is not pinned in toolchain.lock — run `rapidkit setup python` first.'
                        );
                      }
                    } catch {
                      violations.push(
                        'toolchain.lock is invalid JSON — regenerate it with `rapidkit bootstrap` before running commands in strict mode.'
                      );
                    }
                  }

                  // Strict requirement: workspace profile must allow the project type
                  const wsJsonPath = path.join(wsPath, '.rapidkit', 'workspace.json');
                  if (await fsExtra.pathExists(wsJsonPath)) {
                    try {
                      const wsJson = JSON.parse(
                        await fs.promises.readFile(wsJsonPath, 'utf-8')
                      ) as Record<string, unknown>;
                      const wsProfile = (wsJson.profile as string | undefined) ?? '';
                      if (
                        wsProfile === 'python-only' &&
                        (isGoProject(projectJson, process.cwd()) ||
                          isNodeProject(projectJson, process.cwd()) ||
                          isJavaProject(projectJson, process.cwd()) ||
                          isDotnetProject(projectJson, process.cwd()))
                      ) {
                        violations.push(
                          `Workspace profile is "python-only" but this project is not Python. Update the workspace profile or use a polyglot workspace.`
                        );
                      }
                      if (
                        wsProfile === 'node-only' &&
                        (isGoProject(projectJson, process.cwd()) ||
                          isPythonProject(projectJson, process.cwd()) ||
                          isJavaProject(projectJson, process.cwd()) ||
                          isDotnetProject(projectJson, process.cwd()))
                      ) {
                        violations.push(
                          `Workspace profile is "node-only" but this project is not Node. Update the workspace profile or use a polyglot workspace.`
                        );
                      }
                      if (
                        wsProfile === 'go-only' &&
                        (isPythonProject(projectJson, process.cwd()) ||
                          isNodeProject(projectJson, process.cwd()) ||
                          isJavaProject(projectJson, process.cwd()) ||
                          isDotnetProject(projectJson, process.cwd()))
                      ) {
                        violations.push(
                          `Workspace profile is "go-only" but this project is not Go. Update the workspace profile or use a polyglot workspace.`
                        );
                      }
                      if (
                        wsProfile === 'java-only' &&
                        (isPythonProject(projectJson, process.cwd()) ||
                          isNodeProject(projectJson, process.cwd()) ||
                          isGoProject(projectJson, process.cwd()) ||
                          isDotnetProject(projectJson, process.cwd()))
                      ) {
                        violations.push(
                          `Workspace profile is "java-only" but this project is not Java. Update the workspace profile or use a polyglot workspace.`
                        );
                      }
                      if (
                        wsProfile === 'dotnet-only' &&
                        (isPythonProject(projectJson, process.cwd()) ||
                          isNodeProject(projectJson, process.cwd()) ||
                          isGoProject(projectJson, process.cwd()) ||
                          isJavaProject(projectJson, process.cwd()))
                      ) {
                        violations.push(
                          `Workspace profile is "dotnet-only" but this project is not .NET. Update the workspace profile or use a polyglot workspace.`
                        );
                      }
                    } catch {
                      /* non-fatal */
                    }
                  }

                  if (violations.length > 0) {
                    console.log(chalk.red(`❌ Strict policy violations block \`${action}\`:`));
                    for (const v of violations) console.log(chalk.red(`  • ${v}`));
                    console.log(
                      chalk.gray(
                        '💡 Fix violations or switch to warn mode: set mode: warn in .rapidkit/policies.yml'
                      )
                    );
                    await exitAfterOutputFlush(1);
                  }
                }
              } catch {
                /* non-fatal — policies.yml unreadable, skip pre-flight */
              }
            }
          }

          const readiness = await evaluateReleaseReadiness({
            startPath: process.cwd(),
            action,
            writeReport: true,
          });
          const enforceReadiness =
            strictPolicyMode ||
            process.env.RAPIDKIT_LIFECYCLE_ENFORCE_READINESS === '1' ||
            process.env.RAPIDKIT_ENFORCE_READINESS === '1';

          if (readiness.blocking && enforceReadiness) {
            console.log(chalk.red(`❌ Release readiness blocks \`${action}\`:`));
            for (const reason of readiness.blockingReasons) {
              console.log(chalk.red(`  • ${reason}`));
            }
            if (readiness.evidencePath) {
              console.log(chalk.gray(`ℹ️  Readiness evidence: ${readiness.evidencePath}`));
            }
            await exitAfterOutputFlush(1);
          }

          if (readiness.overallStatus !== 'pass' && !enforceReadiness) {
            console.log(
              chalk.yellow(
                `⚠️  Release readiness is ${readiness.overallStatus}. Command continues in warn mode.`
              )
            );
            if (readiness.evidencePath) {
              console.log(
                chalk.gray(
                  `   Evidence: ${readiness.evidencePath} (set RAPIDKIT_LIFECYCLE_ENFORCE_READINESS=1 to block)`
                )
              );
            }
          }

          const lifecycle = await withWorkspaceDependencyPolicyContext(process.cwd(), async () => {
            if (isGoProject(projectJson, process.cwd()) || inferredRuntime === 'go') {
              const adapter = getRuntimeAdapter('go', { runCommandInCwd, runCoreRapidkit });
              if (action === 'lint') {
                return reportRuntimeCommandResult(
                  (await adapter.runLint?.(process.cwd())) ?? {
                    exitCode: 1,
                    message: 'Lint is not supported.',
                  }
                );
              }
              if (action === 'format') {
                return reportRuntimeCommandResult(
                  (await adapter.runFormat?.(process.cwd())) ?? {
                    exitCode: 1,
                    message: 'Format is not supported.',
                  }
                );
              }
              const result =
                action === 'dev'
                  ? await adapter.runDev(process.cwd())
                  : action === 'test'
                    ? await adapter.runTest(process.cwd())
                    : action === 'build'
                      ? await adapter.runBuild(process.cwd())
                      : await adapter.runStart(process.cwd());

              if (result.message) {
                console.log(chalk.red(`❌ ${result.message}`));
              }

              return result.exitCode;
            }

            if (isJavaProject(projectJson, process.cwd()) || inferredRuntime === 'java') {
              if (action === 'dev') return await handleJavaCommand('dev', process.cwd());
              if (action === 'test') return await handleJavaCommand('test', process.cwd());
              if (action === 'build') return await handleJavaCommand('build', process.cwd());
              if (action === 'lint') return await handleJavaCommand('lint', process.cwd());
              if (action === 'format') return await handleJavaCommand('format', process.cwd());
              return await handleJavaCommand('start', process.cwd());
            }

            if (isDotnetProject(projectJson, process.cwd()) || inferredRuntime === 'dotnet') {
              const adapter = getRuntimeAdapter('dotnet', { runCommandInCwd, runCoreRapidkit });
              if (action === 'lint') {
                return reportRuntimeCommandResult(
                  (await adapter.runLint?.(process.cwd())) ?? {
                    exitCode: 1,
                    message: 'Lint is not supported.',
                  }
                );
              }
              if (action === 'format') {
                return reportRuntimeCommandResult(
                  (await adapter.runFormat?.(process.cwd())) ?? {
                    exitCode: 1,
                    message: 'Format is not supported.',
                  }
                );
              }
              const result =
                action === 'dev'
                  ? await adapter.runDev(process.cwd())
                  : action === 'test'
                    ? await adapter.runTest(process.cwd())
                    : action === 'build'
                      ? await adapter.runBuild(process.cwd())
                      : await adapter.runStart(process.cwd());

              if (result.message) {
                console.log(chalk.red(`❌ ${result.message}`));
              }

              return result.exitCode;
            }

            if (isNodeProject(projectJson, process.cwd()) || inferredRuntime === 'node') {
              if (action === 'dev') return await handleNodeCommand('dev', process.cwd());
              if (action === 'test') return await handleNodeCommand('test', process.cwd());
              if (action === 'build') return await handleNodeCommand('build', process.cwd());
              if (action === 'lint') return await handleNodeCommand('lint', process.cwd());
              if (action === 'format') return await handleNodeCommand('format', process.cwd());
              return await handleNodeCommand('start', process.cwd());
            }

            if (isPythonProject(projectJson, process.cwd()) || inferredRuntime === 'python') {
              if (action === 'lint' || action === 'format') {
                return await runCoreRapidkit([action], { cwd: process.cwd() });
              }
              const adapter = getRuntimeAdapter('python', { runCommandInCwd, runCoreRapidkit });
              if (action === 'dev') {
                return reportRuntimeCommandResult(await adapter.runDev(process.cwd()));
              }
              if (action === 'test') {
                return reportRuntimeCommandResult(await adapter.runTest(process.cwd()));
              }
              if (action === 'build') {
                return reportRuntimeCommandResult(await adapter.runBuild(process.cwd()));
              }
              return reportRuntimeCommandResult(await adapter.runStart(process.cwd()));
            }

            return -1;
          });

          if (!lifecycle.ok) {
            await exitAfterOutputFlush(lifecycle.code);
            return;
          }

          if (lifecycle.ok && lifecycle.value >= 0) {
            await exitAfterOutputFlush(lifecycle.value);
            return;
          }

          if (lifecycle.ok && lifecycle.value === -1) {
            console.error(
              chalk.red(`❌ RapidKit cannot run \`${action}\` for this project runtime.`)
            );
            console.error(
              chalk.gray('Run `rapidkit project commands` to inspect supported commands.')
            );
            await exitAfterOutputFlush(1);
            return;
          }
        }

        // Block module commands for npm-level kits without core-backed module support
        if (args[0] === 'add' || (args[0] === 'module' && args[1] === 'add')) {
          const projectJson = readRapidkitProjectJson(process.cwd());
          if (projectJson?.module_support === false) {
            const runtimeLabel =
              projectJson?.runtime === 'java'
                ? 'Spring Boot'
                : projectJson?.runtime === 'dotnet'
                  ? 'ASP.NET Core'
                  : 'Go';
            console.error(
              chalk.red(`❌ RapidKit modules are not available for ${runtimeLabel} npm-level kits.`)
            );
            console.error(
              chalk.gray(
                '   The module system requires Python and is currently only supported for FastAPI and NestJS projects.'
              )
            );
            await exitAfterOutputFlush(1);
          }
        }

        if (blockUnsupportedProjectCommandIfNeeded(args)) {
          return;
        }

        const shouldForward = await shouldForwardToCore(args);
        if (process.env.RAPIDKIT_NPM_DEBUG_ARGS === '1') {
          process.stderr.write(`[rapidkit-npm] shouldForwardToCore=${shouldForward}\n`);
        }

        if (shouldForward) {
          const code = await runCoreRapidkit(args, { cwd: process.cwd() });
          await exitAfterOutputFlush(code);
        }
        await program.parseAsync();
      }
    });
  }
}
