import { assertWorkspaceArtifactContract } from './artifact-contract-registry.js';
import {
  WORKSPACE_INTELLIGENCE_ARTIFACTS,
  WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMAS,
  WORKSPACE_INTELLIGENCE_PREFLIGHT_ARTIFACTS,
  WORKSPACE_INTELLIGENCE_PREFLIGHT_IDS,
  WORKSPACE_INTELLIGENCE_RUNTIME_STEPS,
  WORKSPACE_INTELLIGENCE_STEP_IDS,
  type WorkspaceIntelligencePreflightId,
  type WorkspaceIntelligenceStepId,
} from './workspace-intelligence-runtime-registry.js';
import { WORKSPACE_INTELLIGENCE_CHAIN_SCHEMA_VERSION } from './workspace-intelligence-chain-contract.js';

export type WorkspaceIntelligenceRunStageStatus = 'passed' | 'blocked' | 'failed' | 'skipped';

export type WorkspaceIntelligenceRunPreflightStatus = 'passed' | 'failed' | 'skipped';

export type WorkspaceIntelligenceRunPreflight = {
  id: WorkspaceIntelligencePreflightId;
  status: WorkspaceIntelligenceRunPreflightStatus;
  result: 'synchronized' | 'created' | 'reused' | 'failed' | 'skipped';
  durationMs: number;
  artifacts: string[];
  message: string;
};

export type WorkspaceIntelligenceRunStage = {
  id: WorkspaceIntelligenceStepId;
  status: WorkspaceIntelligenceRunStageStatus;
  durationMs: number;
  artifacts: string[];
  exitCode: number;
  message: string;
};

export type WorkspaceIntelligenceRunReport = {
  schemaVersion: typeof WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMAS.intelligenceRun;
  chainSchemaVersion: typeof WORKSPACE_INTELLIGENCE_CHAIN_SCHEMA_VERSION;
  generatedAt: string;
  workspacePath: string;
  baselineCreated: boolean;
  preflight: WorkspaceIntelligenceRunPreflight[];
  status: 'passed' | 'blocked' | 'failed';
  exitCode: 0 | 1 | 2;
  stages: WorkspaceIntelligenceRunStage[];
  artifactPath: typeof WORKSPACE_INTELLIGENCE_ARTIFACTS.intelligenceRun;
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Workspace Intelligence run semantic violation: ${message}`);
  }
}

function sameStrings(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  );
}

export function assertWorkspaceIntelligenceRunSemantics(
  report: WorkspaceIntelligenceRunReport
): void {
  assertWorkspaceArtifactContract(
    WORKSPACE_INTELLIGENCE_ARTIFACTS.intelligenceRun,
    report,
    'Workspace Intelligence run report'
  );

  invariant(
    report.chainSchemaVersion === WORKSPACE_INTELLIGENCE_CHAIN_SCHEMA_VERSION,
    `chainSchemaVersion must be ${WORKSPACE_INTELLIGENCE_CHAIN_SCHEMA_VERSION}`
  );
  invariant(
    report.artifactPath === WORKSPACE_INTELLIGENCE_ARTIFACTS.intelligenceRun,
    `artifactPath must be ${WORKSPACE_INTELLIGENCE_ARTIFACTS.intelligenceRun}`
  );
  invariant(
    report.preflight.length === WORKSPACE_INTELLIGENCE_PREFLIGHT_IDS.length,
    `preflight must contain exactly ${WORKSPACE_INTELLIGENCE_PREFLIGHT_IDS.length} entries`
  );

  for (const [index, expectedId] of WORKSPACE_INTELLIGENCE_PREFLIGHT_IDS.entries()) {
    const entry = report.preflight[index];
    invariant(entry?.id === expectedId, `preflight[${index}].id must be ${expectedId}`);
    invariant(
      sameStrings(entry.artifacts, WORKSPACE_INTELLIGENCE_PREFLIGHT_ARTIFACTS[expectedId]),
      `${expectedId} preflight artifacts must match the runtime registry`
    );
    if (expectedId === 'sync') {
      invariant(
        (entry.status === 'passed' && entry.result === 'synchronized') ||
          (entry.status === 'failed' && entry.result === 'failed'),
        'sync preflight status and result are incoherent'
      );
    } else {
      invariant(
        (entry.status === 'passed' && (entry.result === 'created' || entry.result === 'reused')) ||
          (entry.status === 'failed' && entry.result === 'failed') ||
          (entry.status === 'skipped' && entry.result === 'skipped'),
        'baseline preflight status and result are incoherent'
      );
    }
  }

  const baseline = report.preflight[1];
  invariant(
    report.baselineCreated === (baseline?.result === 'created'),
    'baselineCreated must match the baseline preflight result'
  );
  invariant(
    report.stages.length === WORKSPACE_INTELLIGENCE_STEP_IDS.length,
    `stages must contain exactly ${WORKSPACE_INTELLIGENCE_STEP_IDS.length} canonical steps`
  );

  const sync = report.preflight[0];
  let hardFailureSeen = sync?.status === 'failed';
  for (const [index, expectedId] of WORKSPACE_INTELLIGENCE_STEP_IDS.entries()) {
    const stage = report.stages[index];
    invariant(stage?.id === expectedId, `stages[${index}].id must be ${expectedId}`);
    invariant(
      sameStrings(stage.artifacts, WORKSPACE_INTELLIGENCE_RUNTIME_STEPS[expectedId].produces),
      `${expectedId} artifacts must match the runtime registry`
    );

    if (hardFailureSeen) {
      invariant(stage.status === 'skipped', `${expectedId} must be skipped after a hard failure`);
    }
    if (stage.status === 'passed') {
      invariant(stage.exitCode === 0, `${expectedId} passed stage must have exitCode 0`);
    } else if (stage.status === 'blocked') {
      invariant(stage.exitCode !== 0, `${expectedId} blocked stage must have a non-zero exitCode`);
    } else if (stage.status === 'failed') {
      invariant(stage.exitCode === 1, `${expectedId} failed stage must have exitCode 1`);
      hardFailureSeen = true;
    } else {
      invariant(stage.exitCode === 0, `${expectedId} skipped stage must have exitCode 0`);
      invariant(stage.durationMs === 0, `${expectedId} skipped stage must have durationMs 0`);
    }

    // Baseline resolution happens after Model has produced the current in-memory
    // observation and before Diff consumes the persisted baseline. It belongs to
    // the execution envelope, not the canonical stage list.
    if (index === 0) {
      if (sync?.status === 'failed' || stage.status === 'failed') {
        invariant(
          baseline?.status === 'skipped',
          'baseline must be skipped when sync or model fails'
        );
      }
      if (baseline?.status === 'skipped') {
        invariant(
          sync?.status === 'failed' || stage.status === 'failed' || stage.status === 'skipped',
          'baseline may be skipped only after an upstream failure'
        );
      }
      if (baseline?.status !== 'passed') hardFailureSeen = true;
    }
  }

  const hasFailure =
    report.preflight.some((entry) => entry.status === 'failed') ||
    report.stages.some((stage) => stage.status === 'failed');
  const hasBlocked = report.stages.some((stage) => stage.status === 'blocked');
  const expectedStatus = hasFailure ? 'failed' : hasBlocked ? 'blocked' : 'passed';
  const expectedExitCode = expectedStatus === 'failed' ? 1 : expectedStatus === 'blocked' ? 2 : 0;
  invariant(report.status === expectedStatus, `status must be ${expectedStatus}`);
  invariant(report.exitCode === expectedExitCode, `exitCode must be ${expectedExitCode}`);
}
