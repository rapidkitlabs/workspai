import path from 'path';
import fsExtra from 'fs-extra';

import {
  buildWorkspaceModel,
  type WorkspaceModel,
  type WorkspaceModelValidationIssue,
  type WorkspaceModelValidationResult,
  type WorkspaceModelProject,
} from './workspace-model.js';

export const WORKSPACE_CONTEXT_SCHEMA_VERSION = 'workspace-context.v1';
export const WORKSPACE_CONTEXT_AGENT_REPORT_PATH = '.rapidkit/reports/workspace-context-agent.json';

export type WorkspaceContextAgent = 'generic' | 'codex' | 'claude' | 'cursor' | 'orca';

export type WorkspaceContextSafeCommand = {
  id: string;
  scope: 'workspace' | 'project';
  display: string;
  execute: string;
  description: string;
  project?: string;
};

export type WorkspaceContextProjectSummary = {
  name: string;
  path: string;
  kind: string;
  runtime: string;
  framework: string;
  generator?: WorkspaceModelProject['generator'];
  supportTier: string;
  safeCommands: string[];
  importantFiles: string[];
};

export type WorkspaceAgentContext = {
  schemaVersion: typeof WORKSPACE_CONTEXT_SCHEMA_VERSION;
  generatedAt: string;
  agent: WorkspaceContextAgent;
  workspaceSummary: string;
  modelRef: string;
  workspace: {
    name: string;
    root: string;
    type: string;
    profile?: string;
  };
  scope: {
    requested: string;
    activeProject?: string;
  };
  projects: WorkspaceContextProjectSummary[];
  safeCommands: WorkspaceContextSafeCommand[];
  evidence: {
    available: string[];
    missing: string[];
  };
  policies: {
    mode: string;
    source: string | null;
  };
  contracts: {
    exists: boolean;
    path: string;
  };
  validation: WorkspaceModelValidationResult;
  agentInstructions: string[];
  unsafeAssumptions: string[];
  humanSummary: string;
};

export type BuildWorkspaceAgentContextOptions = {
  workspacePath: string;
  agent?: string | boolean;
  scope?: string;
  includeEvidence?: boolean;
  observableScanDepth?: number;
  strict?: boolean;
  now?: Date;
  model?: WorkspaceModel;
};

function normalizeAgent(agent: string | boolean | undefined): WorkspaceContextAgent {
  if (typeof agent !== 'string' || !agent.trim() || agent === 'true') {
    return 'generic';
  }
  const normalized = agent.trim().toLowerCase();
  if (
    normalized === 'codex' ||
    normalized === 'claude' ||
    normalized === 'cursor' ||
    normalized === 'orca'
  ) {
    return normalized;
  }
  return 'generic';
}

function pinnedRapidkitCommand(args: string): string {
  return `npx --yes --package rapidkit rapidkit ${args}`.trim();
}

function displayRapidkitCommand(args: string): string {
  return `npx rapidkit ${args}`.trim();
}

function command(
  input: Omit<WorkspaceContextSafeCommand, 'display' | 'execute'> & { args: string }
): WorkspaceContextSafeCommand {
  return {
    id: input.id,
    scope: input.scope,
    display: displayRapidkitCommand(input.args),
    execute: pinnedRapidkitCommand(input.args),
    description: input.description,
    ...(input.project ? { project: input.project } : {}),
  };
}

function projectCommandArgs(project: WorkspaceModelProject, action: string): string {
  return `workspace run ${action} --scope project:${project.name}`;
}

function normalizeProjectScope(scope: string): string {
  return (scope.startsWith('project:') ? scope.slice('project:'.length) : scope)
    .trim()
    .toLowerCase();
}

function projectScopeCandidates(project: WorkspaceModelProject): string[] {
  return [project.name, project.path, path.basename(project.path), project.absolutePath]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim().toLowerCase());
}

function buildSafeCommands(
  model: WorkspaceModel,
  activeProject?: WorkspaceModelProject
): WorkspaceContextSafeCommand[] {
  const commands: WorkspaceContextSafeCommand[] = [
    command({
      id: 'workspace.model',
      scope: 'workspace',
      args: 'workspace model --json',
      description: 'Read the canonical workspace intelligence model.',
    }),
    command({
      id: 'workspace.doctor',
      scope: 'workspace',
      args: 'doctor workspace --json',
      description: 'Check workspace health before claiming verification.',
    }),
    command({
      id: 'workspace.pipeline',
      scope: 'workspace',
      args: 'pipeline --json',
      description: 'Run the governed sync, doctor, analyze, readiness, and autopilot loop.',
    }),
    command({
      id: 'workspace.contract.verify',
      scope: 'workspace',
      args: 'workspace contract verify --json',
      description: 'Verify workspace contract and dependency edges.',
    }),
    command({
      id: 'workspace.verify',
      scope: 'workspace',
      args: 'workspace verify --json',
      description: 'Evaluate evidence freshness and verification gates before release decisions.',
    }),
  ];

  const scopedProjects = activeProject ? [activeProject] : model.projects;
  for (const project of scopedProjects) {
    if (project.commands.fleetStages.includes('test')) {
      commands.push(
        command({
          id: `project.${project.name}.test`,
          scope: 'project',
          project: project.name,
          args: projectCommandArgs(project, 'test'),
          description: `Run tests for ${project.name} through workspace orchestration.`,
        })
      );
    }
    if (project.commands.fleetStages.includes('build')) {
      commands.push(
        command({
          id: `project.${project.name}.build`,
          scope: 'project',
          project: project.name,
          args: projectCommandArgs(project, 'build'),
          description: `Build ${project.name} through workspace orchestration.`,
        })
      );
    }
  }

  return commands;
}

function summarizeProjectSafeCommands(project: WorkspaceModelProject): string[] {
  return project.commands.fleetStages
    .filter((stage) => stage === 'test' || stage === 'build')
    .map((stage) => `workspace run ${stage}`);
}

function resolveActiveProject(
  model: WorkspaceModel,
  scope: string | undefined
): WorkspaceModelProject | undefined {
  if (!scope?.startsWith('project:')) {
    return undefined;
  }
  const requested = normalizeProjectScope(scope);
  if (!requested) {
    return undefined;
  }
  return model.projects.find((project) => projectScopeCandidates(project).includes(requested));
}

function buildContextValidation(
  model: WorkspaceModel,
  scope: string | undefined,
  activeProject: WorkspaceModelProject | undefined
): WorkspaceModelValidationResult {
  const issues: WorkspaceModelValidationIssue[] = [...(model.validation?.issues ?? [])];
  if (scope?.startsWith('project:') && !activeProject) {
    issues.push({
      severity: 'error',
      code: 'context.scope.project.missing',
      message: `Requested project scope was not found: ${scope}`,
      target: scope,
    });
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

function evidenceState(model: WorkspaceModel): { available: string[]; missing: string[] } {
  const available: string[] = [];
  const missing: string[] = [];
  for (const [key, ref] of Object.entries(model.evidence)) {
    if (ref?.exists) {
      available.push(`${key}: ${ref.path}`);
    } else {
      missing.push(key);
    }
  }
  return { available: available.sort(), missing: missing.sort() };
}

function summarizeWorkspace(model: WorkspaceModel): string {
  const projectCount = model.summary.projectCount;
  const runtimeText = model.summary.runtimes.length
    ? model.summary.runtimes.join(', ')
    : 'no runtime';
  const surfaceText = model.identity.surfaces.length
    ? model.identity.surfaces.join(', ')
    : 'no detected surfaces';
  return `${model.workspace.name} is a ${model.identity.workspaceType} with ${projectCount} project${projectCount === 1 ? '' : 's'}, ${runtimeText} runtime coverage, and ${surfaceText}.`;
}

function unsafeAssumptions(model: WorkspaceModel): string[] {
  const assumptions: string[] = [
    'Do not claim a command passed unless a report or command output proves it.',
    'Do not infer secrets or environment values from file names.',
    'Do not change project scope without checking the selected project.',
  ];
  if (!model.contracts.exists) {
    assumptions.push('Workspace contract is missing; dependency and API edges may be incomplete.');
  }
  if (model.summary.observedProjects > 0) {
    assumptions.push(
      'Some projects are observed rather than first-class; command support may be partial.'
    );
  }
  return assumptions;
}

export async function buildWorkspaceAgentContext(
  input: BuildWorkspaceAgentContextOptions
): Promise<WorkspaceAgentContext> {
  const model =
    input.model ??
    (await buildWorkspaceModel({
      workspacePath: input.workspacePath,
      includeEvidence: input.includeEvidence === true,
      observableScanDepth: input.observableScanDepth,
      now: input.now,
    }));
  const agent = normalizeAgent(input.agent);
  const activeProject = resolveActiveProject(model, input.scope);
  const validation = buildContextValidation(model, input.scope, activeProject);
  if (input.strict === true && validation.status !== 'passed') {
    const summary = validation.issues
      .map((item) => `${item.severity}:${item.code}:${item.target}`)
      .join(', ');
    throw new Error(`Workspace context strict validation failed: ${summary}`);
  }
  const projects = (activeProject ? [activeProject] : model.projects).map((project) => ({
    name: project.name,
    path: project.path,
    kind: project.kind,
    runtime: project.runtime,
    framework: project.frameworkDisplayName,
    ...(project.generator ? { generator: project.generator } : {}),
    supportTier: project.supportTier,
    safeCommands: summarizeProjectSafeCommands(project),
    importantFiles: project.importantFiles,
  }));
  const evidence = evidenceState(model);
  const workspaceSummary = summarizeWorkspace(model);

  return {
    schemaVersion: WORKSPACE_CONTEXT_SCHEMA_VERSION,
    generatedAt: (input.now ?? new Date()).toISOString(),
    agent,
    workspaceSummary,
    modelRef: '.rapidkit/reports/workspace-model.json',
    workspace: {
      name: model.workspace.name,
      root: model.workspace.root,
      type: model.identity.workspaceType,
      ...(model.workspace.profile ? { profile: model.workspace.profile } : {}),
    },
    scope: {
      requested: input.scope ?? 'workspace',
      ...(activeProject ? { activeProject: activeProject.name } : {}),
    },
    projects,
    safeCommands: buildSafeCommands(model, activeProject),
    evidence,
    policies: {
      mode: model.policies.mode,
      source: model.policies.source,
    },
    contracts: {
      exists: model.contracts.exists,
      path: model.contracts.workspaceContractPath,
    },
    validation,
    agentInstructions: [
      'Read `.rapidkit/reports/INDEX.json` first, then this context pack and linked evidence reports.',
      'Use this context as the workspace source of truth before inspecting random files.',
      'Prefer workspace-level evidence over generic framework assumptions.',
      'Use `display` commands when explaining steps to a human.',
      'Use `execute` commands when launching commands from automation or tooling.',
      'Keep project-scoped advice tied to the active project scope.',
      'Regenerate stale grounding with `npx rapidkit workspace agent-sync --write --refresh-context`.',
    ],
    unsafeAssumptions: unsafeAssumptions(model),
    humanSummary: [
      workspaceSummary,
      `Evidence available: ${evidence.available.length}. Missing evidence groups: ${evidence.missing.join(', ') || 'none'}.`,
      activeProject
        ? `Active project scope: ${activeProject.name} (${activeProject.frameworkDisplayName}).`
        : 'Scope: whole workspace.',
    ].join('\n'),
  };
}

export async function writeWorkspaceAgentContext(
  context: WorkspaceAgentContext,
  workspacePath: string
): Promise<string> {
  const outputPath = path.join(workspacePath, WORKSPACE_CONTEXT_AGENT_REPORT_PATH);
  await fsExtra.ensureDir(path.dirname(outputPath));
  await fsExtra.writeJSON(outputPath, context, { spaces: 2 });
  return outputPath;
}
