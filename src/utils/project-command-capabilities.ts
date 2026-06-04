import fs from 'fs';
import path from 'path';

import {
  detectBackendFrameworkFromProject,
  type BackendFrameworkDetection,
} from './backend-framework-contract.js';
import { getRuntimeAdapter } from './runtime-adapters.js';
import { readRapidkitProjectJson, type RapidkitProjectJson } from './runtime-detection.js';
import {
  buildRuntimeCommandSupport,
  getFrameworkSupportTier,
  getRuntimeSupport,
  type RapidKitSupportTier,
} from './support-matrix.js';

export type CommandCapabilityStatus = 'supported' | 'unsupported' | 'global';
export type CommandCapabilityOwner = 'npm' | 'core' | 'runtime' | 'none';

export interface CommandCapability {
  command: string;
  owner: CommandCapabilityOwner;
  status: CommandCapabilityStatus;
  reason?: string;
}

export interface ProjectCommandCapabilities {
  schemaVersion: 1;
  scope: 'project';
  projectRoot: string | null;
  engine: 'npm' | 'pip' | 'python' | 'unknown';
  runtime: string;
  framework: string;
  frameworkDisplayName: string;
  frameworkConfidence: string;
  frameworkSupportTier: RapidKitSupportTier;
  runtimeSupportTier: RapidKitSupportTier;
  runtimeDoctorSupport: 'full' | 'readiness' | 'observed';
  moduleSupport: boolean;
  commandMap: Record<string, CommandCapability>;
  supportedCommands: string[];
  unsupportedCommands: string[];
  globalCommands: string[];
}

const UNIVERSAL_COMMANDS = ['version', 'commands', 'doctor', 'project'] as const;

const RUNTIME_COMMANDS = [
  'init',
  'dev',
  'start',
  'build',
  'test',
  'lint',
  'format',
  'help',
] as const;

const CORE_MODULE_COMMANDS = [
  'add',
  'modules',
  'upgrade',
  'diff',
  'merge',
  'reconcile',
  'rollback',
  'uninstall',
  'checkpoint',
  'snapshot',
  'optimize',
] as const;

const ENGINE_GLOBAL_COMMANDS = ['create', 'list', 'info', 'frameworks', 'license'] as const;

export const PROJECT_CAPABILITY_COMMANDS = [
  ...UNIVERSAL_COMMANDS,
  ...RUNTIME_COMMANDS,
  ...CORE_MODULE_COMMANDS,
  ...ENGINE_GLOBAL_COMMANDS,
] as const;

export function findRapidkitProjectRoot(start: string): string | null {
  let current = path.resolve(start);
  while (true) {
    const projectJson = path.join(current, '.rapidkit', 'project.json');
    if (fs.existsSync(projectJson)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function readContextEngine(projectRoot: string): ProjectCommandCapabilities['engine'] {
  const contextPath = path.join(projectRoot, '.rapidkit', 'context.json');
  if (!fs.existsSync(contextPath)) return 'unknown';
  try {
    const context = JSON.parse(fs.readFileSync(contextPath, 'utf8')) as Record<string, unknown>;
    const engine = context.engine;
    if (engine === 'npm' || engine === 'pip' || engine === 'python') return engine;
  } catch {
    // Ignore malformed context files; capabilities still fall back to project metadata.
  }
  return 'unknown';
}

function hasCoreModuleSupport(
  projectJson: RapidkitProjectJson,
  detection: BackendFrameworkDetection
) {
  if (projectJson?.module_support === false) return false;
  return getRuntimeSupport(detection.runtime).moduleCommands;
}

function capability(command: string, data: Omit<CommandCapability, 'command'>): CommandCapability {
  return { command, ...data };
}

export function resolveProjectCommandCapabilities(
  start: string = process.cwd()
): ProjectCommandCapabilities {
  const projectRoot = findRapidkitProjectRoot(start);
  const projectJson = projectRoot ? readRapidkitProjectJson(projectRoot) : null;
  const detection = projectRoot
    ? detectBackendFrameworkFromProject(projectRoot, projectJson)
    : detectBackendFrameworkFromProject(start, projectJson);
  const moduleSupport = projectRoot ? hasCoreModuleSupport(projectJson, detection) : false;
  const engine = projectRoot ? readContextEngine(projectRoot) : 'unknown';
  const runtimeAdapter = getRuntimeAdapter(detection.runtime);
  const runtimeSupport = getRuntimeSupport(detection.runtime);
  const runtimeCommandSupport = buildRuntimeCommandSupport({
    runtime: detection.runtime,
    moduleSupport,
  });
  const commandMap: Record<string, CommandCapability> = {};

  for (const command of UNIVERSAL_COMMANDS) {
    commandMap[command] = capability(command, {
      owner: command === 'project' ? 'core' : 'npm',
      status: 'supported',
      reason:
        command === 'project'
          ? 'Project detection is a Core contract; workspace project lifecycle remains npm-owned.'
          : 'Universal command available across RapidKit project types.',
    });
  }

  for (const command of RUNTIME_COMMANDS) {
    const runtimeSupported =
      !!projectRoot &&
      !!runtimeAdapter &&
      runtimeAdapter.supportedCommands.includes(command) &&
      runtimeCommandSupport.lifecycleCommands.includes(command);
    commandMap[command] = capability(command, {
      owner: 'runtime',
      status: runtimeSupported ? 'supported' : 'unsupported',
      reason: runtimeSupported
        ? `Handled by the ${runtimeAdapter.displayName} runtime adapter or project-local launcher.`
        : !projectRoot
          ? 'No RapidKit project was detected.'
          : runtimeAdapter
            ? `The ${detection.displayName} runtime is tracked, but ${command} is not supported at the ${runtimeSupport.tier} support tier.`
            : `No runtime adapter is available for ${detection.displayName} projects yet.`,
    });
  }

  for (const command of CORE_MODULE_COMMANDS) {
    commandMap[command] = capability(command, {
      owner: moduleSupport ? 'core' : 'none',
      status: moduleSupport ? 'supported' : 'unsupported',
      reason: moduleSupport
        ? 'Core module/template command supported for this project.'
        : `Core module/template commands are not available for ${detection.displayName} projects.`,
    });
  }

  for (const command of ENGINE_GLOBAL_COMMANDS) {
    commandMap[command] = capability(command, {
      owner: command === 'create' ? 'npm' : 'core',
      status: 'global',
      reason:
        command === 'create'
          ? 'Create is orchestrated by npm for multi-language workspace support.'
          : 'Engine catalog command; not specific to the selected project runtime.',
    });
  }

  const entries = Object.values(commandMap);
  return {
    schemaVersion: 1,
    scope: 'project',
    projectRoot,
    engine,
    runtime: detection.runtime,
    framework: detection.key,
    frameworkDisplayName: detection.displayName,
    frameworkConfidence: detection.confidence,
    frameworkSupportTier: getFrameworkSupportTier(detection.key),
    runtimeSupportTier: runtimeSupport.tier,
    runtimeDoctorSupport: runtimeSupport.doctorSupport,
    moduleSupport,
    commandMap,
    supportedCommands: entries
      .filter((entry) => entry.status === 'supported')
      .map((entry) => entry.command)
      .sort(),
    unsupportedCommands: entries
      .filter((entry) => entry.status === 'unsupported')
      .map((entry) => entry.command)
      .sort(),
    globalCommands: entries
      .filter((entry) => entry.status === 'global')
      .map((entry) => entry.command)
      .sort(),
  };
}

export function getProjectCommandCapability(
  args: readonly string[],
  start: string = process.cwd()
): CommandCapability | null {
  const command = args[0];
  if (!command) return null;
  const capabilities = resolveProjectCommandCapabilities(start);
  return capabilities.commandMap[command] ?? null;
}

export function isProjectCapabilityRequest(args: readonly string[]): boolean {
  if (args[0] === 'project' && args[1] === 'commands') return true;
  if (args[0] === 'commands' && args.includes('--scope')) {
    const idx = args.indexOf('--scope');
    return args[idx + 1] === 'project';
  }
  return args.some((arg) => arg === '--scope=project') && args[0] === 'commands';
}

export function formatUnsupportedProjectCommand(
  command: CommandCapability,
  capabilities: ProjectCommandCapabilities
): string {
  const lines = [
    `RapidKit command not supported for this project: ${command.command}`,
    '',
    `Project: ${capabilities.projectRoot ?? 'not detected'}`,
    `Runtime: ${capabilities.runtime}`,
    `Framework: ${capabilities.frameworkDisplayName}`,
    `Reason: ${command.reason ?? 'Unsupported for this project type.'}`,
    '',
    'Run `rapidkit project commands` to inspect supported commands for this project.',
  ];
  return lines.join('\n');
}
