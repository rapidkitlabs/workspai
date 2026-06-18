import path from 'path';

import fsExtra from 'fs-extra';

import {
  buildWorkspaceImpact,
  WORKSPACE_IMPACT_REPORT_PATH,
  WORKSPACE_IMPACT_SCHEMA_VERSION,
  WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH,
  workspaceVerificationPlan,
  type WorkspaceImpact,
  type WorkspaceImpactCommand,
  type WorkspaceImpactRisk,
} from './workspace-intelligence.js';
import { resolveWorkspaceRunStageReport } from './utils/workspace-run-evidence.js';
import { buildWorkspaceModel, type BuildWorkspaceModelOptions } from './workspace-model.js';

export const WORKSPACE_VERIFY_SCHEMA_VERSION = 'workspace-verify.v1';
export const WORKSPACE_VERIFY_REPORT_PATH = '.rapidkit/reports/workspace-verify-last-run.json';

export type WorkspaceVerifyStepStatus = 'pass' | 'warn' | 'fail' | 'missing' | 'skipped';

export type WorkspaceVerifyStep = {
  id: string;
  label: string;
  scope: 'workspace' | 'project';
  project?: string;
  command: WorkspaceImpactCommand;
  status: WorkspaceVerifyStepStatus;
  required: boolean;
  evidencePath?: string;
  message: string;
};

export type WorkspaceVerifyVerdict = 'ready' | 'needs-attention' | 'blocked';

export type WorkspaceVerify = {
  schemaVersion: typeof WORKSPACE_VERIFY_SCHEMA_VERSION;
  generatedAt: string;
  workspacePath: string;
  mode: 'evidence';
  fromImpactRef?: string;
  scope?: string;
  impact: {
    changed: boolean;
    risk: WorkspaceImpactRisk;
    affectedProjects: number;
    recommendedCommands: number;
  };
  summary: {
    verdict: WorkspaceVerifyVerdict;
    exitCode: 0 | 1 | 2;
    stepsPassed: number;
    stepsWarn: number;
    stepsFailed: number;
    stepsMissing: number;
    stepsSkipped: number;
  };
  steps: WorkspaceVerifyStep[];
  missingEvidence: string[];
  blockingReasons: string[];
  verificationPlan: WorkspaceImpactCommand[];
};

export type BuildWorkspaceVerifyOptions = Pick<
  BuildWorkspaceModelOptions,
  'workspacePath' | 'includeAbsolutePaths' | 'includeEvidence' | 'observableScanDepth' | 'now'
> & {
  fromImpactPath?: string;
  scope?: string;
};

function resolveWorkspaceRelativePath(workspacePath: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(workspacePath, filePath);
}

async function readImpactFromPath(filePath: string): Promise<WorkspaceImpact> {
  const payload = (await fsExtra.readJson(filePath)) as unknown;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`Workspace impact input is not a JSON object: ${filePath}`);
  }
  const record = payload as Record<string, unknown>;
  if (record.schemaVersion !== WORKSPACE_IMPACT_SCHEMA_VERSION) {
    throw new Error(`Unsupported workspace impact schema: ${String(record.schemaVersion)}`);
  }
  return record as WorkspaceImpact;
}

function dedupeCommands(commands: WorkspaceImpactCommand[]): WorkspaceImpactCommand[] {
  const seen = new Set<string>();
  const output: WorkspaceImpactCommand[] = [];
  for (const command of commands) {
    const key = `${command.scope}:${command.project ?? ''}:${command.display}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(command);
  }
  return output;
}

function scopeMatchesCommand(scope: string | undefined, command: WorkspaceImpactCommand): boolean {
  if (!scope || scope === 'workspace') {
    return true;
  }
  const normalized = (scope.startsWith('project:') ? scope.slice('project:'.length) : scope)
    .trim()
    .toLowerCase();
  if (command.scope === 'workspace') {
    return true;
  }
  return (command.project ?? '').trim().toLowerCase() === normalized;
}

function evidencePathForCommand(
  command: WorkspaceImpactCommand,
  workspacePath: string
): string | undefined {
  if (command.id === 'workspace.doctor') {
    return path.join(workspacePath, '.rapidkit', 'reports', 'doctor-last-run.json');
  }
  if (command.id === 'workspace.contract.verify') {
    return path.join(
      workspacePath,
      '.rapidkit',
      'reports',
      'workspace-contract-verify-last-run.json'
    );
  }
  if (command.id === 'workspace.readiness') {
    return path.join(workspacePath, '.rapidkit', 'reports', 'release-readiness-last-run.json');
  }
  if (command.id === 'workspace.analyze') {
    return path.join(workspacePath, '.rapidkit', 'reports', 'analyze-last-run.json');
  }
  if (command.id === 'workspace.pipeline') {
    return path.join(workspacePath, '.rapidkit', 'reports', 'pipeline-last-run.json');
  }
  if (
    command.id.startsWith('project.') &&
    (command.id.endsWith('.test') || command.id.endsWith('.build'))
  ) {
    return path.join(workspacePath, '.rapidkit', 'reports', 'workspace-run-last.json');
  }
  return undefined;
}

type EvidenceEvaluation = {
  status: WorkspaceVerifyStepStatus;
  message: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function evaluateDoctorEvidence(payload: Record<string, unknown>): EvidenceEvaluation {
  const healthScore = asRecord(payload.healthScore);
  const errors = typeof healthScore?.errors === 'number' ? healthScore.errors : 0;
  const percent = typeof healthScore?.percent === 'number' ? healthScore.percent : undefined;
  if (errors > 0) {
    return { status: 'fail', message: `Doctor evidence reports ${errors} error(s).` };
  }
  if (typeof percent === 'number' && percent < 70) {
    return { status: 'warn', message: `Doctor health score is ${percent}%.` };
  }
  return { status: 'pass', message: 'Doctor evidence is present and healthy.' };
}

function evaluateReadinessEvidence(payload: Record<string, unknown>): EvidenceEvaluation {
  const overallStatus =
    typeof payload.overallStatus === 'string' ? payload.overallStatus : 'unknown';
  if (overallStatus === 'fail') {
    return { status: 'fail', message: 'Release readiness evidence reports blocking failures.' };
  }
  if (overallStatus === 'warn') {
    return { status: 'warn', message: 'Release readiness evidence reports warnings.' };
  }
  if (overallStatus === 'pass') {
    return { status: 'pass', message: 'Release readiness evidence passed.' };
  }
  return { status: 'warn', message: `Release readiness evidence status is ${overallStatus}.` };
}

function evaluateContractVerifyEvidence(payload: Record<string, unknown>): EvidenceEvaluation {
  const status = typeof payload.status === 'string' ? payload.status : 'unknown';
  if (status === 'failed' || status === 'fail') {
    return { status: 'fail', message: 'Workspace contract verify evidence failed.' };
  }
  if (status === 'passed' || status === 'pass') {
    return { status: 'pass', message: 'Workspace contract verify evidence passed.' };
  }
  return { status: 'warn', message: `Workspace contract verify evidence status is ${status}.` };
}

function evaluateAnalyzeEvidence(payload: Record<string, unknown>): EvidenceEvaluation {
  const summary = asRecord(payload.summary);
  const blocking = summary?.blocking === true || payload.blocking === true;
  if (blocking) {
    return { status: 'fail', message: 'Analyze evidence reports blocking findings.' };
  }
  const status = typeof summary?.status === 'string' ? summary.status : undefined;
  if (status === 'warn' || status === 'warning') {
    return { status: 'warn', message: 'Analyze evidence reports warnings.' };
  }
  return { status: 'pass', message: 'Analyze evidence is present.' };
}

function evaluatePipelineEvidence(payload: Record<string, unknown>): EvidenceEvaluation {
  const summary = asRecord(payload.summary);
  const verdict = typeof summary?.verdict === 'string' ? summary.verdict : undefined;
  if (verdict === 'blocked') {
    return { status: 'fail', message: 'Pipeline evidence is blocked.' };
  }
  if (verdict === 'needs-attention') {
    return { status: 'warn', message: 'Pipeline evidence needs attention.' };
  }
  if (verdict === 'ready') {
    return { status: 'pass', message: 'Pipeline evidence is ready.' };
  }
  return { status: 'warn', message: 'Pipeline evidence status is unknown.' };
}

function evaluateWorkspaceRunEvidence(
  payload: Record<string, unknown>,
  command: WorkspaceImpactCommand
): EvidenceEvaluation {
  const stage = command.id.endsWith('.build')
    ? 'build'
    : command.id.endsWith('.test')
      ? 'test'
      : null;
  const stageReport = resolveWorkspaceRunStageReport(
    payload,
    stage as 'init' | 'test' | 'build' | 'start' | undefined
  );
  if (!stageReport) {
    return {
      status: 'missing',
      message: 'Workspace run evidence is missing or unreadable.',
    };
  }
  const reportStage = stageReport.stage;
  if (stage && reportStage !== stage) {
    return {
      status: 'missing',
      message: `Workspace run evidence is for stage "${reportStage}", expected "${stage}".`,
    };
  }
  const summary = asRecord(stageReport.summary as unknown);
  const failed = typeof summary?.failed === 'number' ? summary.failed : 0;
  const exitCode = typeof summary?.exitCode === 'number' ? summary.exitCode : 0;
  const projects = Array.isArray(stageReport.projects) ? stageReport.projects : [];
  const projectName = command.project?.toLowerCase();
  const projectRow = projects.find((entry) => {
    const record = asRecord(entry);
    if (!record || !projectName) {
      return false;
    }
    const name = typeof record.projectName === 'string' ? record.projectName.toLowerCase() : '';
    const projectPath =
      typeof record.projectPath === 'string' ? record.projectPath.toLowerCase() : '';
    return (
      name === projectName || projectPath.endsWith(`/${projectName}`) || projectPath === projectName
    );
  });
  if (projectRow) {
    const record = asRecord(projectRow);
    const status = typeof record?.status === 'string' ? record.status : 'unknown';
    if (status === 'failed') {
      return { status: 'fail', message: `Workspace run evidence failed for ${command.project}.` };
    }
    if (status === 'passed') {
      return { status: 'pass', message: `Workspace run evidence passed for ${command.project}.` };
    }
    if (status === 'skipped') {
      return { status: 'warn', message: `Workspace run evidence skipped for ${command.project}.` };
    }
  }
  if (failed > 0 || exitCode !== 0) {
    return { status: 'fail', message: 'Workspace run evidence reports failures.' };
  }
  return { status: 'pass', message: 'Workspace run evidence is present.' };
}

async function evaluateCommandEvidence(
  command: WorkspaceImpactCommand,
  workspacePath: string,
  hasWorkspaceContract: boolean
): Promise<WorkspaceVerifyStep> {
  const evidencePath = evidencePathForCommand(command, workspacePath);
  const relativeEvidencePath = evidencePath
    ? path.relative(workspacePath, evidencePath).split(path.sep).join('/')
    : undefined;

  if (command.id === 'workspace.contract.verify' && !hasWorkspaceContract) {
    return {
      id: command.id,
      label: command.label,
      scope: command.scope,
      project: command.project,
      command,
      status: 'skipped',
      required: command.required,
      message: 'Workspace contract is not present; contract verify skipped.',
    };
  }

  if (!evidencePath || !(await fsExtra.pathExists(evidencePath))) {
    return {
      id: command.id,
      label: command.label,
      scope: command.scope,
      project: command.project,
      command,
      status: 'missing',
      required: command.required,
      evidencePath: relativeEvidencePath,
      message: relativeEvidencePath
        ? `Missing evidence report: ${relativeEvidencePath}`
        : 'No evidence mapping exists for this command.',
    };
  }

  const payload = asRecord(await fsExtra.readJson(evidencePath));
  if (!payload) {
    return {
      id: command.id,
      label: command.label,
      scope: command.scope,
      project: command.project,
      command,
      status: 'fail',
      required: command.required,
      evidencePath: relativeEvidencePath,
      message: 'Evidence report is not a JSON object.',
    };
  }

  let evaluation: EvidenceEvaluation;
  if (command.id === 'workspace.doctor') {
    evaluation = evaluateDoctorEvidence(payload);
  } else if (command.id === 'workspace.readiness') {
    evaluation = evaluateReadinessEvidence(payload);
  } else if (command.id === 'workspace.contract.verify') {
    evaluation = evaluateContractVerifyEvidence(payload);
  } else if (command.id === 'workspace.analyze') {
    evaluation = evaluateAnalyzeEvidence(payload);
  } else if (command.id === 'workspace.pipeline') {
    evaluation = evaluatePipelineEvidence(payload);
  } else if (command.id.startsWith('project.')) {
    evaluation = evaluateWorkspaceRunEvidence(payload, command);
  } else {
    evaluation = { status: 'pass', message: 'Evidence report is present.' };
  }

  return {
    id: command.id,
    label: command.label,
    scope: command.scope,
    project: command.project,
    command,
    status: evaluation.status,
    required: command.required,
    evidencePath: relativeEvidencePath,
    message: evaluation.message,
  };
}

function computeVerifySummary(steps: WorkspaceVerifyStep[]): WorkspaceVerify['summary'] {
  const stepsPassed = steps.filter((step) => step.status === 'pass').length;
  const stepsWarn = steps.filter((step) => step.status === 'warn').length;
  const stepsFailed = steps.filter((step) => step.status === 'fail').length;
  const stepsMissing = steps.filter((step) => step.status === 'missing').length;
  const stepsSkipped = steps.filter((step) => step.status === 'skipped').length;

  const blockingReasons = steps
    .filter((step) => step.required && (step.status === 'fail' || step.status === 'missing'))
    .map((step) => `${step.id}: ${step.message}`);

  const requiredMissing = steps.filter((step) => step.required && step.status === 'missing').length;

  let verdict: WorkspaceVerifyVerdict = 'ready';
  let exitCode: 0 | 1 | 2 = 0;
  if (blockingReasons.length > 0) {
    verdict = 'blocked';
    exitCode = 2;
  } else if (stepsWarn > 0 || requiredMissing > 0) {
    verdict = 'needs-attention';
    exitCode = 1;
  }

  return {
    verdict,
    exitCode,
    stepsPassed,
    stepsWarn,
    stepsFailed,
    stepsMissing,
    stepsSkipped,
  };
}

async function resolveImpactForVerify(
  options: BuildWorkspaceVerifyOptions
): Promise<{ impact: WorkspaceImpact; fromImpactRef?: string }> {
  const workspacePath = path.resolve(options.workspacePath);

  if (options.fromImpactPath) {
    const impactPath = resolveWorkspaceRelativePath(workspacePath, options.fromImpactPath);
    return {
      impact: await readImpactFromPath(impactPath),
      fromImpactRef: path.relative(workspacePath, impactPath).split(path.sep).join('/'),
    };
  }

  const defaultImpactPath = path.join(workspacePath, WORKSPACE_IMPACT_REPORT_PATH);
  if (await fsExtra.pathExists(defaultImpactPath)) {
    return {
      impact: await readImpactFromPath(defaultImpactPath),
      fromImpactRef: WORKSPACE_IMPACT_REPORT_PATH,
    };
  }

  const snapshotPath = path.join(workspacePath, WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH);
  if (await fsExtra.pathExists(snapshotPath)) {
    const impact = await buildWorkspaceImpact({
      workspacePath,
      fromPath: WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH,
      scope: options.scope,
      includeAbsolutePaths: options.includeAbsolutePaths,
      includeEvidence: options.includeEvidence,
      observableScanDepth: options.observableScanDepth,
      now: options.now,
    });
    return { impact, fromImpactRef: WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH };
  }

  const model = await buildWorkspaceModel({
    workspacePath,
    includeAbsolutePaths: options.includeAbsolutePaths,
    includeEvidence: options.includeEvidence,
    observableScanDepth: options.observableScanDepth,
    now: options.now,
  });

  return {
    impact: {
      schemaVersion: WORKSPACE_IMPACT_SCHEMA_VERSION,
      generatedAt: (options.now ?? new Date()).toISOString(),
      fromRef: 'baseline',
      diffRef: '.rapidkit/reports/workspace-model-diff-last-run.json',
      workspace: {
        name: model.workspace.name,
        profile: model.workspace.profile,
        type: model.workspace.type,
      },
      summary: {
        changed: false,
        risk: 'none',
        affectedProjects: 0,
        workspaceItems: 0,
        recommendedCommands: 0,
      },
      affectedProjects: [],
      workspaceImpact: [],
      verificationPlan: [],
      agentBrief: {
        headline: 'Baseline workspace verify run.',
        bullets: ['No impact report or snapshot was available; baseline gates were evaluated.'],
        unsafeAssumptions: ['Do not claim runtime verification passed unless evidence exists.'],
      },
      diff: {
        schemaVersion: 'workspace-model-diff.v1',
        generatedAt: (options.now ?? new Date()).toISOString(),
        fromRef: 'baseline',
        toRef: '.rapidkit/reports/workspace-model.json',
        fromHash: 'baseline',
        toHash: 'baseline',
        summary: {
          changed: false,
          addedProjects: 0,
          removedProjects: 0,
          changedProjects: 0,
          workspaceChanges: 0,
          validationChanges: 0,
          gitChangedFiles: 0,
        },
        git: {
          available: false,
          dirty: false,
          changedFiles: 0,
          untrackedFiles: 0,
          deletedFiles: 0,
        },
        changes: [],
        currentModel: model,
      },
    },
  };
}

export async function buildWorkspaceVerify(
  options: BuildWorkspaceVerifyOptions
): Promise<WorkspaceVerify> {
  const workspacePath = path.resolve(options.workspacePath);
  const { impact, fromImpactRef } = await resolveImpactForVerify(options);
  const model = impact.diff.currentModel;
  const verificationPlan = dedupeCommands([
    ...workspaceVerificationPlan(),
    ...impact.verificationPlan,
  ]).filter((command) => scopeMatchesCommand(options.scope, command));

  const steps: WorkspaceVerifyStep[] = [];
  for (const command of verificationPlan) {
    steps.push(
      await evaluateCommandEvidence(command, workspacePath, model.contracts.exists === true)
    );
  }

  const summary = computeVerifySummary(steps);
  const missingEvidence = steps
    .filter((step) => step.status === 'missing' && step.evidencePath)
    .map((step) => step.evidencePath as string);
  const blockingReasons = steps
    .filter((step) => step.required && (step.status === 'fail' || step.status === 'missing'))
    .map((step) => `${step.id}: ${step.message}`);

  return {
    schemaVersion: WORKSPACE_VERIFY_SCHEMA_VERSION,
    generatedAt: (options.now ?? new Date()).toISOString(),
    workspacePath,
    mode: 'evidence',
    fromImpactRef,
    scope: options.scope,
    impact: {
      changed: impact.summary.changed,
      risk: impact.summary.risk,
      affectedProjects: impact.summary.affectedProjects,
      recommendedCommands: impact.summary.recommendedCommands,
    },
    summary,
    steps,
    missingEvidence,
    blockingReasons,
    verificationPlan,
  };
}

export async function writeWorkspaceVerify(
  verify: WorkspaceVerify,
  workspacePath: string
): Promise<string> {
  const outputPath = path.join(workspacePath, WORKSPACE_VERIFY_REPORT_PATH);
  await fsExtra.ensureDir(path.dirname(outputPath));
  await fsExtra.writeJson(outputPath, verify, { spaces: 2 });
  return outputPath;
}

export function workspaceVerifyExitCode(
  verify: WorkspaceVerify,
  options?: { strict?: boolean }
): number {
  if (verify.summary.verdict === 'blocked') {
    return 2;
  }
  if (options?.strict && verify.summary.verdict !== 'ready') {
    return 1;
  }
  return verify.summary.exitCode;
}
