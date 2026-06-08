import fs from 'fs';
import path from 'path';

import chalk from 'chalk';
import { execa } from 'execa';
import {
  getStageCommand,
  detectRuntimeFromMarkers,
  categorizeError,
  validateCommand,
  resolveStageCommand,
  type RuntimeFamily,
  type ErrorCategory,
} from './framework-registry.js';
import {
  detectBackendFrameworkFromProject,
  detectRuntimeCandidatesFromProject,
  normalizeBackendFrameworkLabel,
  normalizeBackendRuntimeFamily,
  type BackendPlatformKey,
  type BackendRuntimeFamily,
} from './utils/backend-framework-contract.js';
import { discoverWorkspaceProjects as discoverWorkspaceProjectsShared } from './utils/workspace-discovery.js';

export type WorkspaceRunStage = 'init' | 'test' | 'build' | 'start';

export interface WorkspaceRunOptions {
  workspacePath: string;
  stage: WorkspaceRunStage;
  affected?: boolean;
  blastRadius?: boolean;
  since?: string;
  parallel?: boolean;
  maxWorkers?: number;
  continueOnError?: boolean;
  strict?: boolean;
  json?: boolean;
  enforceGates?: boolean;
}

type GateStatus = 'pass' | 'warn' | 'fail' | 'skipped';

interface GateResult {
  gate: 'doctor-workspace' | 'readiness';
  status: GateStatus;
  summary: string;
}

interface ProjectExecutionResult {
  path: string;
  relativePath: string;
  selected: boolean;
  affected: boolean;
  status: 'passed' | 'failed' | 'skipped';
  exitCode: number | null;
  durationMs: number;
  reason?: string;
  framework?: string;
  runtimeDetected?: RuntimeFamily;
  executionCommand?: string;
  // Enterprise features
  errorCategory?: ErrorCategory;
  errorMessage?: string;
  healthStatus?: {
    healthy: boolean;
    reason?: string;
  };
}

export type SelectionMode = 'all' | 'affected' | 'affected+blast-radius';
export type GraphStatus = 'loaded' | 'missing' | 'invalid' | 'not-applicable';

export interface WorkspaceRunReport {
  schemaVersion: '1.0';
  workspacePath: string;
  stage: WorkspaceRunStage;
  generatedAt: string;
  durationMs: number;
  options: {
    affected: boolean;
    blastRadius: boolean;
    since: string | null;
    parallel: boolean;
    maxWorkers: number;
    continueOnError: boolean;
    strict: boolean;
    enforceGates: boolean;
  };
  selection: {
    mode: SelectionMode;
    since: string | null;
    graphStatus: GraphStatus;
    expansionDepth: number;
  };
  gates: {
    enforced: boolean;
    results: GateResult[];
    blocked: boolean;
    blockingGate?: string;
  };
  summary: {
    projectCount: number;
    selectedCount: number;
    passed: number;
    failed: number;
    skipped: number;
    exitCode: number;
  };
  projects: ProjectExecutionResult[];
}

const STAGE_SET: Set<WorkspaceRunStage> = new Set(['init', 'test', 'build', 'start']);

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.rapidkit',
  '.venv',
  'dist',
  'build',
  'coverage',
  'htmlcov',
]);

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.promises.readFile(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

async function writeJsonFile(filePath: string, payload: unknown): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

function normalizePathForMatch(value: string): string {
  return value.replace(/\\/g, '/');
}

async function discoverWorkspaceProjects(workspacePath: string): Promise<string[]> {
  return discoverWorkspaceProjectsShared(workspacePath, {
    skipDirs: SKIP_DIRS,
    includeHiddenDirs: false,
    descendIntoMatchedProjects: false,
    isProjectDir: async (dirPath, rootPath) => {
      if (
        (await pathExists(path.join(dirPath, '.rapidkit', 'context.json'))) ||
        (await pathExists(path.join(dirPath, '.rapidkit', 'project.json')))
      ) {
        return true;
      }

      if (path.resolve(dirPath) === path.resolve(rootPath)) {
        return false;
      }

      return detectRuntimeCandidatesFromProject(dirPath).length > 0;
    },
  });
}

async function computeAffectedProjects(
  workspacePath: string,
  projects: string[],
  since: string
): Promise<Set<string>> {
  const changedFiles = await execa('git', ['diff', '--name-only', `${since}...HEAD`], {
    cwd: workspacePath,
    reject: false,
  });

  if (changedFiles.exitCode !== 0) {
    return new Set(projects);
  }

  const lines = changedFiles.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => normalizePathForMatch(line));

  if (lines.length === 0) {
    return new Set();
  }

  const matched = new Set<string>();
  for (const projectPath of projects) {
    const relative = normalizePathForMatch(path.relative(workspacePath, projectPath));
    if (!relative || relative === '.') {
      continue;
    }

    const prefix = `${relative}/`;
    if (lines.some((line) => line === relative || line.startsWith(prefix))) {
      matched.add(projectPath);
    }
  }

  return matched;
}

interface BlastRadiusResult {
  expanded: Set<string>;
  graphStatus: 'loaded' | 'missing' | 'invalid';
  expansionDepth: number;
}

async function expandAffectedWithBlastRadius(
  workspacePath: string,
  projects: string[],
  initialAffected: Set<string>
): Promise<BlastRadiusResult> {
  const contractPath = path.join(workspacePath, '.rapidkit', 'workspace.contract.json');
  if (await pathExists(contractPath)) {
    try {
      const contractResult = await expandAffectedWithContract(
        workspacePath,
        projects,
        initialAffected,
        contractPath
      );
      if (contractResult.graphStatus !== 'missing') {
        return contractResult;
      }
    } catch {
      return { expanded: initialAffected, graphStatus: 'invalid', expansionDepth: 0 };
    }
  }

  const graphPath = path.join(workspacePath, '.rapidkit', 'workspace-dependency-graph.json');
  if (!(await pathExists(graphPath))) {
    return { expanded: initialAffected, graphStatus: 'missing', expansionDepth: 0 };
  }

  let payload: unknown;
  try {
    payload = await readJsonFile(graphPath);
  } catch {
    return { expanded: initialAffected, graphStatus: 'invalid', expansionDepth: 0 };
  }

  const knownProjects = new Set(projects.map((projectPath) => path.resolve(projectPath)));
  const reverseDeps = new Map<string, Set<string>>();

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { expanded: initialAffected, graphStatus: 'invalid', expansionDepth: 0 };
  }

  const projectEntries = Array.isArray((payload as Record<string, unknown>).projects)
    ? ((payload as Record<string, unknown>).projects as unknown[])
    : [];

  for (const entry of projectEntries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }

    const row = entry as Record<string, unknown>;
    const rawPath = typeof row.path === 'string' ? row.path : '';
    const sourceProject = path.resolve(workspacePath, rawPath);
    if (!knownProjects.has(sourceProject)) {
      continue;
    }

    const dependsOn = Array.isArray(row.dependsOn)
      ? row.dependsOn.filter((item): item is string => typeof item === 'string')
      : [];

    for (const dep of dependsOn) {
      const dependencyProject = path.resolve(workspacePath, dep);
      if (!knownProjects.has(dependencyProject)) {
        continue;
      }
      if (!reverseDeps.has(dependencyProject)) {
        reverseDeps.set(dependencyProject, new Set<string>());
      }
      reverseDeps.get(dependencyProject)?.add(sourceProject);
    }
  }

  const expanded = new Set(initialAffected);
  const queue = [...expanded];
  let expansionDepth = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const dependents = reverseDeps.get(current);
    if (!dependents) {
      continue;
    }

    for (const dependent of dependents) {
      if (!expanded.has(dependent)) {
        expanded.add(dependent);
        queue.push(dependent);
        expansionDepth += 1;
      }
    }
  }

  return { expanded, graphStatus: 'loaded', expansionDepth };
}

async function expandAffectedWithContract(
  workspacePath: string,
  projects: string[],
  initialAffected: Set<string>,
  contractPath: string
): Promise<BlastRadiusResult> {
  const payload = await readJsonFile<unknown>(contractPath);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { expanded: initialAffected, graphStatus: 'invalid', expansionDepth: 0 };
  }

  const contract = payload as Record<string, unknown>;
  const projectEntries = Array.isArray(contract.projects) ? contract.projects : null;
  if (!projectEntries) {
    return { expanded: initialAffected, graphStatus: 'invalid', expansionDepth: 0 };
  }

  const projectBySlug = new Map<string, string>();
  const projectByPath = new Map<string, string>();
  for (const projectPath of projects) {
    const relativePath = normalizePathForMatch(path.relative(workspacePath, projectPath));
    projectByPath.set(relativePath, path.resolve(projectPath));
  }

  const publishes = new Map<string, Set<string>>();
  const consumersByEvent = new Map<string, Set<string>>();
  const reverseDeps = new Map<string, Set<string>>();

  for (const entry of projectEntries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const slug = typeof row.slug === 'string' ? row.slug : '';
    const relativePath =
      typeof row.relativePath === 'string' ? normalizePathForMatch(row.relativePath) : slug;
    const projectPath = projectByPath.get(relativePath);
    if (!slug || !projectPath) continue;
    projectBySlug.set(slug, projectPath);
  }

  for (const entry of projectEntries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const slug = typeof row.slug === 'string' ? row.slug : '';
    const sourceProject = projectBySlug.get(slug);
    if (!sourceProject) continue;

    const contracts =
      row.contracts && typeof row.contracts === 'object' && !Array.isArray(row.contracts)
        ? (row.contracts as Record<string, unknown>)
        : {};
    const dependsOn = Array.isArray(contracts.dependsOn)
      ? contracts.dependsOn.filter((item): item is string => typeof item === 'string')
      : [];
    const publishesEvents = Array.isArray(contracts.publishes)
      ? contracts.publishes.filter((item): item is string => typeof item === 'string')
      : [];
    const consumesEvents = Array.isArray(contracts.consumes)
      ? contracts.consumes.filter((item): item is string => typeof item === 'string')
      : [];

    for (const dependencySlug of dependsOn) {
      const dependencyProject = projectBySlug.get(dependencySlug);
      if (!dependencyProject) continue;
      if (!reverseDeps.has(dependencyProject)) {
        reverseDeps.set(dependencyProject, new Set<string>());
      }
      reverseDeps.get(dependencyProject)?.add(sourceProject);
    }

    for (const eventName of publishesEvents) {
      if (!publishes.has(eventName)) {
        publishes.set(eventName, new Set<string>());
      }
      publishes.get(eventName)?.add(sourceProject);
    }
    for (const eventName of consumesEvents) {
      if (!consumersByEvent.has(eventName)) {
        consumersByEvent.set(eventName, new Set<string>());
      }
      consumersByEvent.get(eventName)?.add(sourceProject);
    }
  }

  for (const [eventName, publisherProjects] of publishes.entries()) {
    const consumerProjects = consumersByEvent.get(eventName);
    if (!consumerProjects) continue;
    for (const publisherProject of publisherProjects) {
      if (!reverseDeps.has(publisherProject)) {
        reverseDeps.set(publisherProject, new Set<string>());
      }
      for (const consumerProject of consumerProjects) {
        if (consumerProject !== publisherProject) {
          reverseDeps.get(publisherProject)?.add(consumerProject);
        }
      }
    }
  }

  const expanded = new Set(initialAffected);
  const queue = [...expanded];
  let expansionDepth = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const dependents = reverseDeps.get(current);
    if (!dependents) continue;
    for (const dependent of dependents) {
      if (!expanded.has(dependent)) {
        expanded.add(dependent);
        queue.push(dependent);
        expansionDepth += 1;
      }
    }
  }

  return { expanded, graphStatus: 'loaded', expansionDepth };
}

async function shouldEnforceWorkspaceRunGates(
  workspacePath: string,
  explicitFlag: boolean | undefined
): Promise<boolean> {
  if (typeof explicitFlag === 'boolean') {
    return explicitFlag;
  }

  const policyPath = path.join(workspacePath, '.rapidkit', 'policies.yml');
  if (!(await pathExists(policyPath))) {
    return true;
  }

  let raw = '';
  try {
    raw = await fs.promises.readFile(policyPath, 'utf-8');
  } catch {
    return true;
  }

  const match = raw.match(/^[\t ]*rules\.enforce_workspace_run_gates:\s*(true|false)\s*(?:#.*)?$/m);
  if (!match) {
    return true;
  }

  return match[1] === 'true';
}

async function runRapidkitSelfCommand(args: string[], cwd: string) {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: 'RapidKit entrypoint is unavailable for nested workspace-run execution.',
    };
  }

  const result = await execa(process.execPath, [entrypoint, ...args], {
    cwd,
    reject: false,
    env: {
      ...process.env,
      RAPIDKIT_WORKSPACE_RUN_CHILD: '1',
    },
  });

  return {
    exitCode: Number(result.exitCode ?? 1),
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function isWrapperOwnedRuntime(runtime: RuntimeFamily): boolean {
  return runtime === 'node' || runtime === 'go' || runtime === 'java' || runtime === 'python';
}

function isVitestRuntime(): boolean {
  return (
    process.env.VITEST === 'true' || process.env.VITEST === '1' || process.env.NODE_ENV === 'test'
  );
}

async function runRapidkitInitInProcess(cwd: string) {
  const originalCwd = process.cwd();
  try {
    process.chdir(cwd);
    const { handleInitCommand } = await import('./index.js');
    const exitCode = await handleInitCommand(['init']);
    return {
      exitCode,
      stdout: '',
      stderr: '',
    };
  } finally {
    process.chdir(originalCwd);
  }
}

/**
 * Detect project framework from metadata and file markers.
 * Reads .rapidkit/context.json for explicit configuration, falls back to file marker detection.
 * Also extracts command overrides and environment configuration.
 */
async function detectProjectFramework(projectPath: string): Promise<{
  runtime: RuntimeFamily;
  framework?: string;
  commandOverrides?: Record<string, string>;
  environment?: 'dev' | 'staging' | 'prod';
}> {
  const toWorkspaceRuntime = (runtime: string | undefined): RuntimeFamily => {
    const canonicalRuntime = normalizeBackendRuntimeFamily(runtime);
    if (canonicalRuntime === 'node' || canonicalRuntime === 'bun') return 'node';
    if (canonicalRuntime === 'python') return 'python';
    if (canonicalRuntime === 'go') return 'go';
    if (canonicalRuntime === 'java') return 'java';
    if (canonicalRuntime === 'php') return 'php';
    if (canonicalRuntime === 'ruby') return 'ruby';
    if (canonicalRuntime === 'rust') return 'rust';
    if (canonicalRuntime === 'dotnet') return 'dotnet';
    if (canonicalRuntime === 'elixir') return 'elixir';
    if (
      canonicalRuntime === 'clojure' ||
      canonicalRuntime === 'scala' ||
      canonicalRuntime === 'kotlin'
    ) {
      return 'jvm-generic';
    }

    const markerRuntime = detectRuntimeFromMarkers(projectPath);
    return markerRuntime;
  };

  const toWorkspaceFramework = (framework: string | undefined): string | undefined => {
    if (!framework) {
      return undefined;
    }

    const canonicalFramework = normalizeBackendFrameworkLabel(framework);
    const specificFrameworks = new Set<BackendPlatformKey>([
      'fastapi',
      'django',
      'flask',
      'nestjs',
      'express',
      'fastify',
      'koa',
      'gofiber',
      'gogin',
      'echo',
      'springboot',
      'laravel',
      'symfony',
      'rails',
      'sinatra',
      'dotnet',
      'actix',
      'axum',
      'rocket',
      'phoenix',
    ]);

    if (specificFrameworks.has(canonicalFramework)) {
      return canonicalFramework;
    }

    return undefined;
  };

  // Check .rapidkit/context.json for explicit metadata
  const contextPath = path.join(projectPath, '.rapidkit', 'context.json');
  if (fs.existsSync(contextPath)) {
    try {
      const context = JSON.parse(fs.readFileSync(contextPath, 'utf-8')) as Record<string, unknown>;
      if (typeof context.runtime === 'string') {
        // Extract command overrides
        const commandOverrides: Record<string, string> = {};
        if (context.commands && typeof context.commands === 'object') {
          for (const [key, val] of Object.entries(context.commands)) {
            if (typeof val === 'string') {
              commandOverrides[key] = val;
            }
          }
        }

        return {
          runtime: toWorkspaceRuntime(context.runtime),
          framework: toWorkspaceFramework(
            typeof context.framework === 'string' ? context.framework : undefined
          ),
          commandOverrides: Object.keys(commandOverrides).length > 0 ? commandOverrides : undefined,
          environment:
            typeof context.environment === 'string'
              ? (context.environment as 'dev' | 'staging' | 'prod')
              : undefined,
        };
      }
    } catch {
      // Fallback to marker detection
    }
  }

  const detection = detectBackendFrameworkFromProject(projectPath);
  const runtime = toWorkspaceRuntime(detection.runtime as BackendRuntimeFamily);
  const framework = toWorkspaceFramework(detection.key);
  return { runtime, framework };
}

/**
 * Execute a stage command with enterprise features:
 * - Command override support
 * - Preflight validation
 * - Error categorization
 * - Health checks
 */
async function executeStageCommand(
  projectPath: string,
  stage: string,
  runtime: RuntimeFamily,
  framework?: string,
  commandOverrides?: Record<string, string>,
  environment?: 'dev' | 'staging' | 'prod'
): Promise<{
  exitCode: number;
  command: string;
  message?: string;
  errorCategory?: ErrorCategory;
  healthStatus?: { healthy: boolean; reason?: string };
}> {
  const useRapidkitWrapper = !commandOverrides?.[stage] && isWrapperOwnedRuntime(runtime);

  // Step 0: Resolve the command, checking overrides first
  let baseCommand: string | undefined;

  // Check if override exists for this stage
  if (commandOverrides && commandOverrides[stage]) {
    baseCommand = commandOverrides[stage];
  } else if (useRapidkitWrapper) {
    // For npm adapters, use 'rapidkit' wrapper
    baseCommand = `rapidkit ${stage}`;
  } else {
    // Try framework registry
    baseCommand = getStageCommand(runtime, framework, stage);
  }

  if (!baseCommand) {
    return {
      exitCode: 127,
      command: `<stage not supported for ${runtime}>`,
      message: `No stage command found for runtime '${runtime}' and framework '${framework || 'unknown'}'`,
      errorCategory: 'runtime',
    };
  }

  // Resolve environment variants if needed
  const finalCommand = resolveStageCommand(baseCommand, commandOverrides, environment);
  if (!finalCommand) {
    return {
      exitCode: 127,
      command: baseCommand,
      message: 'Failed to resolve stage command',
      errorCategory: 'runtime',
    };
  }

  // Step 1: Preflight validation
  if (!useRapidkitWrapper) {
    const validation = await validateCommand(finalCommand);
    if (!validation.valid) {
      return {
        exitCode: 127,
        command: finalCommand,
        message: validation.reason || 'Command not available',
        errorCategory: 'setup',
      };
    }
  }

  // Step 2: Execute the command
  let exitCode = 0;
  let stdout = '';
  let stderr = '';
  let errorCategory: ErrorCategory | undefined;

  try {
    const result = useRapidkitWrapper
      ? stage === 'init' && isVitestRuntime()
        ? await runRapidkitInitInProcess(projectPath)
        : await runRapidkitSelfCommand([stage], projectPath)
      : await execa(finalCommand, [], {
          cwd: projectPath,
          reject: false,
          shell: true,
        });

    exitCode = Number(result.exitCode ?? 0);
    stdout = result.stdout;
    stderr = result.stderr;

    // Categorize error if non-zero exit
    if (exitCode !== 0) {
      const output = `${stdout}\n${stderr}`;
      errorCategory = categorizeError(output);
    }
  } catch (error) {
    return {
      exitCode: 1,
      command: finalCommand,
      message: error instanceof Error ? error.message : 'Command execution failed',
      errorCategory: 'runtime',
    };
  }

  // Step 3: Health check (if configured)
  let healthStatus: { healthy: boolean; reason?: string } | undefined;
  // Note: Health checks would be looked up from framework registry
  // For now, we return the exit code result

  return {
    exitCode,
    command: finalCommand,
    errorCategory,
    healthStatus,
    message: exitCode !== 0 ? `Stage failed with exit code ${exitCode}` : undefined,
  };
}

function parseJsonOutput<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function runtimeInstallHint(runtime: RuntimeFamily | undefined): string | null {
  switch (runtime) {
    case 'dotnet':
      return 'Install .NET 8+ SDK, then rerun `npx rapidkit setup dotnet` or `npx rapidkit init`.';
    case 'go':
      return 'Install Go 1.21+, then rerun `npx rapidkit setup go` or `npx rapidkit init`.';
    case 'java':
    case 'jvm-generic':
      return 'Install Java 21+ and Maven/Gradle, then rerun `npx rapidkit setup java` or `npx rapidkit init`.';
    case 'node':
      return 'Install Node.js LTS and npm/pnpm/yarn, then rerun `npx rapidkit setup node` or `npx rapidkit init`.';
    case 'python':
      return 'Install Python 3.10+ and pip/Poetry, then rerun `npx rapidkit setup python` or `npx rapidkit init`.';
    default:
      return null;
  }
}

async function runWorkspaceGates(workspacePath: string): Promise<GateResult[]> {
  const gates: GateResult[] = [];

  const doctor = await runRapidkitSelfCommand(['doctor', 'workspace', '--json'], workspacePath);
  if (doctor.exitCode !== 0) {
    gates.push({
      gate: 'doctor-workspace',
      status: 'fail',
      summary: 'doctor workspace command failed',
    });
  } else {
    const payload = parseJsonOutput<Record<string, unknown>>(doctor.stdout);
    const health = payload?.healthScore as Record<string, unknown> | undefined;
    const errors = Number(health?.errors ?? 0);
    if (Number.isFinite(errors) && errors > 0) {
      gates.push({
        gate: 'doctor-workspace',
        status: 'fail',
        summary: `doctor workspace reports ${errors} error(s)`,
      });
    } else {
      gates.push({
        gate: 'doctor-workspace',
        status: 'pass',
        summary: 'doctor workspace passed',
      });
    }
  }

  const readiness = await runRapidkitSelfCommand(['readiness', '--json'], workspacePath);
  if (readiness.exitCode !== 0) {
    gates.push({
      gate: 'readiness',
      status: 'fail',
      summary: 'readiness command failed',
    });
  } else {
    const payload = parseJsonOutput<Record<string, unknown>>(readiness.stdout);
    const overallStatus = String(payload?.overallStatus ?? '').toLowerCase();
    if (overallStatus === 'fail') {
      gates.push({
        gate: 'readiness',
        status: 'fail',
        summary: 'readiness overall status is fail',
      });
    } else if (overallStatus === 'warn') {
      gates.push({
        gate: 'readiness',
        status: 'warn',
        summary: 'readiness overall status is warn',
      });
    } else {
      gates.push({
        gate: 'readiness',
        status: 'pass',
        summary: 'readiness overall status is pass',
      });
    }
  }

  return gates;
}

function ensureValidStage(stage: string): stage is WorkspaceRunStage {
  return STAGE_SET.has(stage as WorkspaceRunStage);
}

function normalizeWorkers(maxWorkers: number | undefined, projectCount: number): number {
  const fallback = Math.max(1, Math.min(4, projectCount));
  const parsed = Number(maxWorkers ?? fallback);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.min(16, Math.trunc(parsed)));
}

export async function runWorkspaceStage(options: WorkspaceRunOptions): Promise<WorkspaceRunReport> {
  if (!ensureValidStage(options.stage)) {
    throw new Error(`Unsupported workspace run stage: ${options.stage}`);
  }

  const startedAt = Date.now();
  const workspacePath = path.resolve(options.workspacePath);
  const projectPaths = await discoverWorkspaceProjects(workspacePath);

  const affectedOnly = options.affected === true;
  const blastRadius = options.blastRadius === true;
  const since = options.since?.trim() || 'HEAD~1';
  const initialAffectedProjects = affectedOnly
    ? await computeAffectedProjects(workspacePath, projectPaths, since)
    : new Set(projectPaths);

  let affectedProjects: Set<string>;
  let graphStatus: GraphStatus = 'not-applicable';
  let expansionDepth = 0;
  let selectionMode: SelectionMode = 'all';

  if (affectedOnly && blastRadius) {
    const result = await expandAffectedWithBlastRadius(
      workspacePath,
      projectPaths,
      initialAffectedProjects
    );
    affectedProjects = result.expanded;
    graphStatus = result.graphStatus;
    expansionDepth = result.expansionDepth;
    selectionMode = 'affected+blast-radius';
  } else if (affectedOnly) {
    affectedProjects = initialAffectedProjects;
    selectionMode = 'affected';
  } else {
    affectedProjects = initialAffectedProjects;
    selectionMode = 'all';
  }

  const enforceGates =
    options.stage === 'init'
      ? false
      : await shouldEnforceWorkspaceRunGates(workspacePath, options.enforceGates);
  const gateResults: GateResult[] = enforceGates
    ? await runWorkspaceGates(workspacePath)
    : [
        {
          gate: 'doctor-workspace',
          status: 'skipped',
          summary: 'workspace run gates disabled',
        },
        {
          gate: 'readiness',
          status: 'skipped',
          summary: 'workspace run gates disabled',
        },
      ];
  const blockingGate = gateResults.find((gate) => gate.status === 'fail');

  const runTargets = projectPaths.filter((projectPath) => affectedProjects.has(projectPath));
  const continueOnError = options.continueOnError === true || options.stage === 'init';
  const parallel = options.parallel === true;
  const maxWorkers = normalizeWorkers(options.maxWorkers, runTargets.length);
  const totalTargets = runTargets.length;
  let completedTargets = 0;

  if (!options.json) {
    console.log(
      chalk.gray(
        `Workspace run (${options.stage}) started: ${totalTargets} target(s), ${parallel ? `parallel x${maxWorkers}` : 'sequential'}`
      )
    );
  }

  const executionRows = new Map<string, ProjectExecutionResult>();
  for (const projectPath of projectPaths) {
    executionRows.set(projectPath, {
      path: projectPath,
      relativePath: normalizePathForMatch(path.relative(workspacePath, projectPath)),
      selected: affectedProjects.has(projectPath),
      affected: affectedProjects.has(projectPath),
      status: affectedProjects.has(projectPath) ? 'skipped' : 'skipped',
      exitCode: null,
      durationMs: 0,
      reason: affectedProjects.has(projectPath) ? undefined : 'not affected',
      framework: undefined,
      runtimeDetected: undefined,
      executionCommand: undefined,
    });
  }

  if (blockingGate) {
    for (const projectPath of runTargets) {
      const row = executionRows.get(projectPath);
      if (row) {
        row.status = 'skipped';
        row.reason = `blocked by ${blockingGate.gate}`;
      }
    }
  } else {
    const runOne = async (projectPath: string): Promise<void> => {
      const row = executionRows.get(projectPath);
      if (!row) {
        return;
      }

      const relativePath = normalizePathForMatch(path.relative(workspacePath, projectPath));

      if (!options.json) {
        console.log(
          chalk.gray(`⏳ [${completedTargets}/${totalTargets}] ${options.stage} ${relativePath}`)
        );
      }

      row.selected = true;
      row.affected = true;
      const started = Date.now();

      // Detect framework and runtime for this project (with overrides)
      const { runtime, framework, commandOverrides, environment } =
        await detectProjectFramework(projectPath);
      row.runtimeDetected = runtime;
      row.framework = framework;

      // Execute stage command with enterprise features
      const execResult = await executeStageCommand(
        projectPath,
        options.stage,
        runtime,
        framework,
        commandOverrides,
        environment
      );
      row.executionCommand = execResult.command;
      row.errorCategory = execResult.errorCategory;
      row.healthStatus = execResult.healthStatus;
      row.durationMs = Date.now() - started;
      row.exitCode = execResult.exitCode;

      if (execResult.exitCode === 0) {
        row.status = 'passed';
        row.reason = undefined;
      } else {
        row.status = 'failed';
        row.reason = execResult.message || 'stage command failed';
        row.errorMessage = execResult.message;
      }

      completedTargets += 1;

      if (!options.json) {
        const percentage =
          totalTargets > 0 ? Math.round((completedTargets / totalTargets) * 100) : 100;
        const statusIcon = row.status === 'passed' ? chalk.green('✅') : chalk.red('❌');
        console.log(
          chalk.gray(
            `${statusIcon} [${completedTargets}/${totalTargets}] (${percentage}%) ${relativePath} ${row.durationMs}ms`
          )
        );
        if (row.status === 'failed') {
          if (row.reason) {
            console.log(chalk.red(`   Reason: ${row.reason}`));
          }
          if (row.executionCommand) {
            console.log(chalk.gray(`   Command: ${row.executionCommand}`));
          }
          const hint = runtimeInstallHint(row.runtimeDetected);
          if (hint && row.errorCategory === 'setup') {
            console.log(chalk.gray(`   Hint: ${hint}`));
          }
        }
      }
    };

    if (parallel && runTargets.length > 1) {
      let index = 0;
      let failed = false;
      const workers = new Array(maxWorkers).fill(null).map(async () => {
        while (index < runTargets.length) {
          if (failed && !continueOnError) {
            return;
          }

          const currentIndex = index;
          index += 1;
          const projectPath = runTargets[currentIndex];
          await runOne(projectPath);

          const row = executionRows.get(projectPath);
          if (row?.status === 'failed') {
            failed = true;
          }
        }
      });

      await Promise.all(workers);

      if (!continueOnError && failed) {
        let stop = false;
        for (const projectPath of runTargets) {
          const row = executionRows.get(projectPath);
          if (!row) continue;

          if (row.status === 'failed') {
            stop = true;
            continue;
          }

          if (stop && row.status === 'skipped') {
            row.reason = row.reason || 'stopped after failure';
          }
        }
      }
    } else {
      for (const projectPath of runTargets) {
        await runOne(projectPath);
        const row = executionRows.get(projectPath);
        if (!continueOnError && row?.status === 'failed') {
          const pending = runTargets.slice(runTargets.indexOf(projectPath) + 1);
          for (const pendingPath of pending) {
            const pendingRow = executionRows.get(pendingPath);
            if (pendingRow) {
              pendingRow.status = 'skipped';
              pendingRow.reason = 'stopped after failure';
            }
          }
          break;
        }
      }
    }
  }

  const rows: ProjectExecutionResult[] = [];
  for (const projectPath of projectPaths) {
    const row = executionRows.get(projectPath);
    if (!row) {
      continue;
    }
    rows.push(row);
  }
  const passed = rows.filter((row) => row.status === 'passed').length;
  const failed = rows.filter((row) => row.status === 'failed').length;
  const skipped = rows.filter((row) => row.status === 'skipped').length;

  const strict = options.strict === true;
  const exitCode =
    failed > 0 || (strict && gateResults.some((gate) => gate.status !== 'pass')) ? 1 : 0;

  const report: WorkspaceRunReport = {
    schemaVersion: '1.0',
    workspacePath,
    stage: options.stage,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    options: {
      affected: affectedOnly,
      blastRadius,
      since: affectedOnly ? since : null,
      parallel,
      maxWorkers,
      continueOnError,
      strict,
      enforceGates,
    },
    selection: {
      mode: selectionMode,
      since: affectedOnly ? since : null,
      graphStatus,
      expansionDepth,
    },
    gates: {
      enforced: enforceGates,
      results: gateResults,
      blocked: Boolean(blockingGate),
      blockingGate: blockingGate?.gate,
    },
    summary: {
      projectCount: projectPaths.length,
      selectedCount: runTargets.length,
      passed,
      failed,
      skipped,
      exitCode,
    },
    projects: rows,
  };

  const reportPath = path.join(workspacePath, '.rapidkit', 'reports', 'workspace-run-last.json');
  await writeJsonFile(reportPath, report);

  if (!options.json) {
    if (blockingGate) {
      console.log(chalk.red(`❌ Workspace run blocked by ${blockingGate.gate}`));
      console.log(chalk.gray(`   ${blockingGate.summary}`));
    }
    console.log(
      chalk.cyan(
        `Workspace run (${options.stage}) => passed: ${passed}, failed: ${failed}, skipped: ${skipped}`
      )
    );
    console.log(chalk.gray(`Report: ${reportPath}`));
  }

  return report;
}
