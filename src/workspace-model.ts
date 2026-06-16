import path from 'path';
import fsExtra from 'fs-extra';

import { readImportedProjectsRegistry } from './imported-projects-registry.js';
import {
  detectBackendFrameworkFromProject,
  detectRuntimeCandidatesFromProject,
  type BackendConfidence,
  type BackendRuntimeFamily,
  type BackendSupportTier,
} from './utils/backend-framework-contract.js';
import {
  resolveProjectCommandCapabilities,
  type CommandCapability,
} from './utils/project-command-capabilities.js';
import type { WorkspaceRunStageName } from './utils/cli-lifecycle-contract.js';
import { inferWorkspaceProjectKind, type WorkspaceProjectKind } from './utils/project-kind.js';
import { readRapidkitProjectJson } from './utils/runtime-detection.js';
import { getRuntimeSupport } from './utils/support-matrix.js';
import { discoverWorkspaceProjects } from './utils/workspace-discovery.js';
import { readWorkspaceMarker } from './workspace-marker.js';

export const WORKSPACE_MODEL_SCHEMA_VERSION = 'workspace-model.v1';
export const WORKSPACE_MODEL_REPORT_PATH = '.rapidkit/reports/workspace-model.json';

export type WorkspaceModelEvidenceRef = {
  path: string;
  exists: boolean;
  generatedAt?: string;
  status?: string;
};

export type WorkspaceModelProject = {
  name: string;
  path: string;
  absolutePath?: string;
  kind: WorkspaceProjectKind;
  runtime: BackendRuntimeFamily;
  runtimeCandidates: BackendRuntimeFamily[];
  framework: string;
  frameworkDisplayName: string;
  confidence: BackendConfidence;
  detectionSource: string;
  supportTier: BackendSupportTier;
  runtimeSupportTier: BackendSupportTier;
  runtimeDoctorSupport: 'full' | 'readiness' | 'observed';
  moduleSupport: boolean;
  kit?: string;
  engine?: string;
  generator?: {
    id?: string;
    kit?: string;
    displayName?: string;
    source: 'official-generator' | 'metadata';
    commandDisplay?: string;
  };
  commands: {
    supported: string[];
    unsupported: string[];
    global: string[];
    fleetStages: WorkspaceRunStageName[];
    localOnly: string[];
    map: Record<string, CommandCapability>;
  };
  importantFiles: string[];
  evidence: Record<string, WorkspaceModelEvidenceRef | null>;
  provenance: Record<string, string>;
};

export type WorkspaceModelValidationSeverity = 'error' | 'warning';

export type WorkspaceModelValidationIssue = {
  severity: WorkspaceModelValidationSeverity;
  code: string;
  message: string;
  target: string;
};

export type WorkspaceModelValidationResult = {
  status: 'passed' | 'warning' | 'failed';
  errors: number;
  warnings: number;
  issues: WorkspaceModelValidationIssue[];
};

export type WorkspaceModel = {
  schemaVersion: typeof WORKSPACE_MODEL_SCHEMA_VERSION;
  generatedAt: string;
  workspace: {
    name: string;
    root: string;
    profile?: string;
    type: 'rapidkit-workspace' | 'observed-workspace';
    marker?: {
      createdBy?: string;
      version?: string;
      createdAt?: string;
    };
  };
  identity: {
    workspaceType: string;
    surfaces: WorkspaceProjectKind[];
    runtimeFamilies: BackendRuntimeFamily[];
    businessCapabilities: string[];
  };
  discovery: {
    observableScanDepth: number;
  };
  projects: WorkspaceModelProject[];
  policies: {
    mode: string;
    source: string | null;
    exists: boolean;
  };
  contracts: {
    workspaceContractPath: string;
    exists: boolean;
    status: 'known' | 'missing' | 'unknown';
  };
  evidence: Record<string, WorkspaceModelEvidenceRef | null>;
  summary: {
    projectCount: number;
    runtimes: string[];
    frameworks: string[];
    firstClassProjects: number;
    observedProjects: number;
  };
  validation?: WorkspaceModelValidationResult;
};

export type BuildWorkspaceModelOptions = {
  workspacePath: string;
  includeAbsolutePaths?: boolean;
  includeEvidence?: boolean;
  observableScanDepth?: number;
  strict?: boolean;
  now?: Date;
};

const OBSERVABLE_PROJECT_MARKERS = [
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Cargo.toml',
  'composer.json',
  'Gemfile',
  'mix.exs',
  'deno.json',
  'deno.jsonc',
  'bun.lock',
  'bun.lockb',
  'deps.edn',
  'project.clj',
  'build.sbt',
  'docker-compose.yml',
  'docker-compose.yaml',
  'terraform.tf',
];

const SKIP_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  '.rapidkit',
  '.venv',
  'node_modules',
  'dist',
  'build',
  'target',
  'coverage',
  'htmlcov',
  '.next',
  '.turbo',
]);

function toPosixRelative(workspacePath: string, targetPath: string): string {
  const relativePath = path.relative(workspacePath, targetPath) || '.';
  return relativePath.split(path.sep).join('/');
}

async function readJsonIfExists(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    if (!(await fsExtra.pathExists(filePath))) {
      return null;
    }
    const raw = await fsExtra.readJSON(filePath);
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function hasAnyFile(dirPath: string, fileNames: string[]): Promise<boolean> {
  for (const fileName of fileNames) {
    if (await fsExtra.pathExists(path.join(dirPath, fileName))) {
      return true;
    }
  }
  return false;
}

function resolveObservableScanDepth(input: number | undefined): number {
  const envDepth = Number.parseInt(process.env.RAPIDKIT_WORKSPACE_MODEL_SCAN_DEPTH ?? '', 10);
  const rawDepth =
    typeof input === 'number' && Number.isFinite(input)
      ? input
      : Number.isFinite(envDepth)
        ? envDepth
        : 4;
  return Math.min(12, Math.max(1, Math.trunc(rawDepth)));
}

async function discoverObservableProjectRoots(
  workspacePath: string,
  maxDepth: number
): Promise<string[]> {
  const root = path.resolve(workspacePath);
  const queue: Array<{ dirPath: string; depth: number }> = [{ dirPath: root, depth: 0 }];
  const observed = new Set<string>();
  const visited = new Set<string>();

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) {
      continue;
    }
    const dirPath = path.resolve(item.dirPath);
    if (visited.has(dirPath)) {
      continue;
    }
    visited.add(dirPath);

    if (dirPath !== root && (await hasAnyFile(dirPath, OBSERVABLE_PROJECT_MARKERS))) {
      observed.add(dirPath);
      continue;
    }

    if (item.depth >= maxDepth) {
      continue;
    }

    let entries: Array<{ isDirectory: () => boolean; name: string }> = [];
    try {
      entries = await fsExtra.readdir(dirPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) {
        continue;
      }
      if (entry.name.startsWith('.') && entry.name !== '.config') {
        continue;
      }
      queue.push({ dirPath: path.join(dirPath, entry.name), depth: item.depth + 1 });
    }
  }

  return Array.from(observed).sort((a, b) => a.localeCompare(b));
}

function collectUniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of paths) {
    const resolved = path.resolve(item);
    if (seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    output.push(resolved);
  }
  return output.sort((a, b) => a.localeCompare(b));
}

function stringFromRecord(
  record: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function boolFromRecord(record: Record<string, unknown> | undefined, key: string): boolean {
  return record?.[key] === true;
}

function resolveGeneratorIdentity(
  projectJson: Record<string, unknown> | null,
  kit: string | undefined,
  fallbackDisplayName: string
): WorkspaceModelProject['generator'] | undefined {
  const frontend =
    projectJson?.frontend &&
    typeof projectJson.frontend === 'object' &&
    !Array.isArray(projectJson.frontend)
      ? (projectJson.frontend as Record<string, unknown>)
      : undefined;
  const generatorId = stringFromRecord(frontend, 'generator');
  const commandDisplay = stringFromRecord(frontend, 'command_display');
  const isFrontendKit = typeof kit === 'string' && kit.startsWith('frontend.');

  if (!generatorId && !isFrontendKit) {
    return undefined;
  }

  return {
    ...(generatorId ? { id: generatorId } : {}),
    ...(kit ? { kit } : {}),
    displayName: fallbackDisplayName,
    source: boolFromRecord(frontend, 'official_generator') ? 'official-generator' : 'metadata',
    ...(commandDisplay ? { commandDisplay } : {}),
  };
}

async function collectImportantFiles(projectPath: string): Promise<string[]> {
  const candidates = [
    '.rapidkit/project.json',
    '.rapidkit/context.json',
    'package.json',
    'pyproject.toml',
    'requirements.txt',
    'go.mod',
    'pom.xml',
    'build.gradle',
    'build.gradle.kts',
    'Cargo.toml',
    'composer.json',
    'Gemfile',
    'mix.exs',
    'deno.json',
    'Dockerfile',
    'docker-compose.yml',
    'README.md',
  ];
  const existing: string[] = [];
  for (const candidate of candidates) {
    if (await fsExtra.pathExists(path.join(projectPath, candidate))) {
      existing.push(candidate);
    }
  }
  return existing;
}

async function evidenceRef(
  workspacePath: string,
  relativePath: string,
  includeEvidence: boolean
): Promise<WorkspaceModelEvidenceRef | null> {
  const artifactPath = path.join(workspacePath, relativePath);
  const exists = await fsExtra.pathExists(artifactPath);
  const ref: WorkspaceModelEvidenceRef = {
    path: relativePath.split(path.sep).join('/'),
    exists,
  };

  if (exists && includeEvidence) {
    const raw = await readJsonIfExists(artifactPath);
    if (typeof raw?.generatedAt === 'string') {
      ref.generatedAt = raw.generatedAt;
    }
    const status = raw?.status ?? raw?.result ?? raw?.verdict;
    if (typeof status === 'string') {
      ref.status = status;
    }
  }

  return ref;
}

async function projectEvidenceRefs(
  workspacePath: string,
  projectPath: string,
  includeEvidence: boolean
): Promise<Record<string, WorkspaceModelEvidenceRef | null>> {
  const projectRelative = toPosixRelative(workspacePath, projectPath);
  const projectReportPrefix = `${projectRelative}/.rapidkit/reports`;
  const projectDoctor = await evidenceRef(
    workspacePath,
    `${projectReportPrefix}/doctor-project-last-run.json`,
    includeEvidence
  );
  const legacyProjectDoctor =
    projectDoctor?.exists === true
      ? projectDoctor
      : await evidenceRef(
          workspacePath,
          `${projectReportPrefix}/doctor-last-run.json`,
          includeEvidence
        );
  return {
    doctor: legacyProjectDoctor,
    analyze: await evidenceRef(
      workspacePath,
      `${projectReportPrefix}/analyze-last-run.json`,
      includeEvidence
    ),
    readiness: await evidenceRef(
      workspacePath,
      `${projectReportPrefix}/release-readiness-last-run.json`,
      includeEvidence
    ),
  };
}

async function buildProjectModel(
  workspacePath: string,
  projectPath: string,
  options: Required<Pick<BuildWorkspaceModelOptions, 'includeAbsolutePaths' | 'includeEvidence'>>
): Promise<WorkspaceModelProject> {
  const projectJson = readRapidkitProjectJson(projectPath);
  const detection = detectBackendFrameworkFromProject(projectPath, projectJson);
  const capabilities = resolveProjectCommandCapabilities(projectPath);
  const runtimeSupport = getRuntimeSupport(detection.runtime);
  const kind = await inferWorkspaceProjectKind(projectPath, projectJson);
  const projectName =
    typeof projectJson?.name === 'string' && projectJson.name.trim()
      ? projectJson.name.trim()
      : path.basename(projectPath);
  const kit =
    typeof projectJson?.kit_name === 'string'
      ? projectJson.kit_name
      : typeof projectJson?.kit === 'string'
        ? projectJson.kit
        : undefined;
  const engine =
    typeof projectJson?.engine === 'string'
      ? projectJson.engine
      : capabilities.engine !== 'unknown'
        ? capabilities.engine
        : undefined;
  const generator = resolveGeneratorIdentity(projectJson, kit, detection.displayName);

  return {
    name: projectName,
    path: toPosixRelative(workspacePath, projectPath),
    ...(options.includeAbsolutePaths ? { absolutePath: projectPath } : {}),
    kind,
    runtime: detection.runtime,
    runtimeCandidates: detectRuntimeCandidatesFromProject(projectPath),
    framework: detection.key,
    frameworkDisplayName: detection.displayName,
    confidence: detection.confidence,
    detectionSource: detection.source,
    supportTier: detection.supportTier,
    runtimeSupportTier: runtimeSupport.tier,
    runtimeDoctorSupport: runtimeSupport.doctorSupport,
    moduleSupport: capabilities.moduleSupport,
    ...(kit ? { kit } : {}),
    ...(engine ? { engine } : {}),
    ...(generator ? { generator } : {}),
    commands: {
      supported: capabilities.supportedCommands,
      unsupported: capabilities.unsupportedCommands,
      global: capabilities.globalCommands,
      fleetStages: capabilities.fleetStages,
      localOnly: capabilities.localOnlyCommands,
      map: capabilities.commandMap,
    },
    importantFiles: await collectImportantFiles(projectPath),
    evidence: await projectEvidenceRefs(workspacePath, projectPath, options.includeEvidence),
    provenance: {
      path: 'filesystem discovery',
      runtime: detection.source,
      framework: detection.source,
      commands: 'project command capability matrix',
      evidence: 'project .rapidkit/reports',
    },
  };
}

async function readWorkspaceJson(workspacePath: string): Promise<Record<string, unknown> | null> {
  return readJsonIfExists(path.join(workspacePath, '.rapidkit', 'workspace.json'));
}

function inferWorkspaceType(projects: WorkspaceModelProject[]): string {
  if (projects.some((project) => project.kind === 'frontend') && projects.length > 1) {
    return 'full-stack-workspace';
  }
  if (projects.some((project) => project.kind === 'frontend')) {
    return 'frontend-workspace';
  }
  if (projects.length > 1) {
    return 'backend-platform';
  }
  return 'backend-workspace';
}

function inferBusinessCapabilities(projects: WorkspaceModelProject[]): string[] {
  const capabilityHints = new Set<string>();
  for (const project of projects) {
    const normalized = `${project.name} ${project.path}`.toLowerCase();
    for (const capability of [
      'auth',
      'billing',
      'payment',
      'notification',
      'order',
      'admin',
      'report',
      'search',
      'analytics',
    ]) {
      if (normalized.includes(capability)) {
        capabilityHints.add(capability);
      }
    }
  }
  return Array.from(capabilityHints).sort();
}

function issue(
  severity: WorkspaceModelValidationSeverity,
  code: string,
  message: string,
  target: string
): WorkspaceModelValidationIssue {
  return { severity, code, message, target };
}

function validateWorkspaceModel(
  model: Omit<WorkspaceModel, 'validation'>
): WorkspaceModelValidationResult {
  const issues: WorkspaceModelValidationIssue[] = [];

  if (!model.workspace.name.trim()) {
    issues.push(
      issue('error', 'workspace.name.missing', 'Workspace name could not be resolved.', 'workspace')
    );
  }

  if (model.workspace.type === 'observed-workspace') {
    issues.push(
      issue(
        'warning',
        'workspace.marker.missing',
        'Workspace marker is missing; model is based on filesystem observation.',
        'workspace.marker'
      )
    );
  }

  if (model.summary.projectCount === 0) {
    issues.push(
      issue(
        'warning',
        'workspace.projects.empty',
        'No project roots were detected in this workspace.',
        'projects'
      )
    );
  }

  if (!model.contracts.exists) {
    issues.push(
      issue(
        'warning',
        'workspace.contract.missing',
        'Workspace contract is missing; dependency and API edges may be incomplete.',
        model.contracts.workspaceContractPath
      )
    );
  }

  const seenProjectNames = new Map<string, WorkspaceModelProject[]>();
  for (const project of model.projects) {
    const key = project.name.toLowerCase();
    const bucket = seenProjectNames.get(key) ?? [];
    bucket.push(project);
    seenProjectNames.set(key, bucket);

    if (!project.importantFiles.length) {
      issues.push(
        issue(
          'warning',
          'project.markers.missing',
          `Project ${project.name} has no important manifest files recorded.`,
          project.path
        )
      );
    }

    if (project.runtime === 'unknown') {
      issues.push(
        issue(
          'warning',
          'project.runtime.unknown',
          `Project ${project.name} runtime could not be confidently detected.`,
          project.path
        )
      );
    }

    const advertisedCommands = ['test', 'build'];
    for (const commandName of advertisedCommands) {
      if (
        project.commands.supported.includes(commandName) &&
        project.commands.unsupported.includes(commandName)
      ) {
        issues.push(
          issue(
            'error',
            'project.commands.conflict',
            `Project ${project.name} marks ${commandName} as both supported and unsupported.`,
            project.path
          )
        );
      }
    }

    const fleetStageSet = new Set<string>(project.commands.fleetStages);
    const localOnlySet = new Set<string>(project.commands.localOnly);
    for (const commandName of project.commands.fleetStages) {
      if (localOnlySet.has(commandName)) {
        issues.push(
          issue(
            'error',
            'project.commands.scope-conflict',
            `Project ${project.name} marks ${commandName} as both fleet and local-only.`,
            project.path
          )
        );
      }

      const capability = project.commands.map[commandName];
      if (
        !capability ||
        capability.status !== 'supported' ||
        capability.fleetEligible !== true ||
        capability.executionScope !== 'fleet'
      ) {
        issues.push(
          issue(
            'error',
            'project.commands.fleet-stage-invalid',
            `Project ${project.name} advertises ${commandName} as a fleet stage without a supported fleet capability.`,
            project.path
          )
        );
      }
    }

    for (const commandName of project.commands.localOnly) {
      const capability = project.commands.map[commandName];
      if (
        !capability ||
        capability.status !== 'supported' ||
        capability.executionScope !== 'local-only' ||
        capability.fleetEligible === true
      ) {
        issues.push(
          issue(
            'error',
            'project.commands.local-only-invalid',
            `Project ${project.name} advertises ${commandName} as local-only without a matching local-only capability.`,
            project.path
          )
        );
      }
    }

    for (const capability of Object.values(project.commands.map)) {
      if (capability.status !== 'supported') {
        continue;
      }
      if (capability.fleetEligible === true && !fleetStageSet.has(capability.command)) {
        issues.push(
          issue(
            'error',
            'project.commands.fleet-stage-missing',
            `Project ${project.name} capability ${capability.command} is fleet-eligible but missing from fleetStages.`,
            project.path
          )
        );
      }
      if (
        capability.executionScope === 'local-only' &&
        capability.fleetEligible !== true &&
        !localOnlySet.has(capability.command)
      ) {
        issues.push(
          issue(
            'error',
            'project.commands.local-only-missing',
            `Project ${project.name} capability ${capability.command} is local-only but missing from localOnly commands.`,
            project.path
          )
        );
      }
    }
  }

  for (const [name, projects] of seenProjectNames.entries()) {
    if (projects.length > 1) {
      issues.push(
        issue(
          'error',
          'project.name.duplicate',
          `Project name "${name}" is ambiguous across ${projects.length} project roots.`,
          projects.map((project) => project.path).join(', ')
        )
      );
    }
  }

  const errors = issues.filter((item) => item.severity === 'error').length;
  const warnings = issues.filter((item) => item.severity === 'warning').length;
  return {
    status: errors > 0 ? 'failed' : warnings > 0 ? 'warning' : 'passed',
    errors,
    warnings,
    issues,
  };
}

export function validateWorkspaceModelStrict(
  model: WorkspaceModel
): WorkspaceModelValidationResult {
  return validateWorkspaceModel(model);
}

export async function buildWorkspaceModel(
  input: BuildWorkspaceModelOptions
): Promise<WorkspaceModel> {
  const workspacePath = path.resolve(input.workspacePath);
  const includeAbsolutePaths = input.includeAbsolutePaths === true;
  const includeEvidence = input.includeEvidence === true;
  const observableScanDepth = resolveObservableScanDepth(input.observableScanDepth);
  const now = input.now ?? new Date();
  const [marker, workspaceJson, importedProjects, rapidkitProjectPaths, observableProjectPaths] =
    await Promise.all([
      readWorkspaceMarker(workspacePath),
      readWorkspaceJson(workspacePath),
      readImportedProjectsRegistry(workspacePath),
      discoverWorkspaceProjects(workspacePath, { descendIntoMatchedProjects: false }),
      discoverObservableProjectRoots(workspacePath, observableScanDepth),
    ]);

  const projectPaths = collectUniquePaths([
    ...rapidkitProjectPaths,
    ...observableProjectPaths,
    ...importedProjects.map((project) =>
      path.isAbsolute(project.path) ? project.path : path.join(workspacePath, project.path)
    ),
  ]);
  const projects = await Promise.all(
    projectPaths.map((projectPath) =>
      buildProjectModel(workspacePath, projectPath, { includeAbsolutePaths, includeEvidence })
    )
  );

  const workspaceName =
    typeof workspaceJson?.workspace_name === 'string'
      ? workspaceJson.workspace_name
      : typeof workspaceJson?.name === 'string'
        ? workspaceJson.name
        : marker?.name || path.basename(workspacePath);
  const workspaceProfile =
    typeof workspaceJson?.profile === 'string'
      ? workspaceJson.profile
      : typeof workspaceJson?.mode === 'string'
        ? workspaceJson.mode
        : undefined;
  const surfaces = Array.from(new Set(projects.map((project) => project.kind))).sort();
  const runtimeFamilies = Array.from(new Set(projects.map((project) => project.runtime))).sort();
  const frameworks = Array.from(new Set(projects.map((project) => project.framework))).sort();
  const policiesSource = ['.rapidkit/policies.yml', '.rapidkit/policies.yaml'].find((candidate) =>
    fsExtra.existsSync(path.join(workspacePath, candidate))
  );
  const contractPath = '.rapidkit/workspace.contract.json';
  const contractExists = await fsExtra.pathExists(path.join(workspacePath, contractPath));

  const model: Omit<WorkspaceModel, 'validation'> = {
    schemaVersion: WORKSPACE_MODEL_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    workspace: {
      name: workspaceName,
      root: workspacePath,
      ...(workspaceProfile ? { profile: workspaceProfile } : {}),
      type: marker ? 'rapidkit-workspace' : 'observed-workspace',
      ...(marker
        ? {
            marker: {
              createdBy: marker.createdBy,
              version: marker.version,
              createdAt: marker.createdAt,
            },
          }
        : {}),
    },
    identity: {
      workspaceType: inferWorkspaceType(projects),
      surfaces,
      runtimeFamilies,
      businessCapabilities: inferBusinessCapabilities(projects),
    },
    discovery: {
      observableScanDepth,
    },
    projects,
    policies: {
      mode:
        typeof workspaceJson?.policy_mode === 'string'
          ? workspaceJson.policy_mode
          : typeof workspaceJson?.policyMode === 'string'
            ? workspaceJson.policyMode
            : 'warn',
      source: policiesSource ?? null,
      exists: Boolean(policiesSource),
    },
    contracts: {
      workspaceContractPath: contractPath,
      exists: contractExists,
      status: contractExists ? 'known' : 'missing',
    },
    evidence: {
      doctor: await evidenceRef(
        workspacePath,
        '.rapidkit/reports/doctor-last-run.json',
        includeEvidence
      ),
      analyze: await evidenceRef(
        workspacePath,
        '.rapidkit/reports/analyze-last-run.json',
        includeEvidence
      ),
      readiness: await evidenceRef(
        workspacePath,
        '.rapidkit/reports/release-readiness-last-run.json',
        includeEvidence
      ),
      pipeline: await evidenceRef(
        workspacePath,
        '.rapidkit/reports/pipeline-last-run.json',
        includeEvidence
      ),
    },
    summary: {
      projectCount: projects.length,
      runtimes: runtimeFamilies,
      frameworks,
      firstClassProjects: projects.filter((project) => project.supportTier === 'first-class')
        .length,
      observedProjects: projects.filter((project) => project.supportTier === 'observed').length,
    },
  };
  const validation = validateWorkspaceModel(model);
  return {
    ...model,
    validation,
  };
}

export async function writeWorkspaceModel(
  model: WorkspaceModel,
  workspacePath: string
): Promise<string> {
  const outputPath = path.join(workspacePath, WORKSPACE_MODEL_REPORT_PATH);
  await fsExtra.ensureDir(path.dirname(outputPath));
  await fsExtra.writeJSON(outputPath, model, { spaces: 2 });
  return outputPath;
}
