import { describe, expect, it } from 'vitest';

import {
  assertWorkspaceIntelligenceRunSemantics,
  type WorkspaceIntelligenceRunReport,
} from '../../contracts/workspace-intelligence-run-contract';
import {
  WORKSPACE_INTELLIGENCE_ARTIFACTS,
  WORKSPACE_INTELLIGENCE_PREFLIGHT_ARTIFACTS,
  WORKSPACE_INTELLIGENCE_RUNTIME_STEPS,
  WORKSPACE_INTELLIGENCE_STEP_IDS,
} from '../../contracts/workspace-intelligence-runtime-registry';
import { WORKSPACE_INTELLIGENCE_CHAIN_SCHEMA_VERSION } from '../../contracts/workspace-intelligence-chain-contract';
import { assertJsonSchemaContract } from '../../utils/json-schema-contract';

const RUN_CONTRACT = 'contracts/workspace-intelligence/workspace-intelligence-run.v1.json';

function validReport(): WorkspaceIntelligenceRunReport {
  return {
    schemaVersion: 'workspace-intelligence-run.v1',
    chainSchemaVersion: WORKSPACE_INTELLIGENCE_CHAIN_SCHEMA_VERSION,
    generatedAt: '2026-07-18T00:00:00.000Z',
    workspacePath: '/workspace',
    baselineCreated: true,
    preflight: [
      {
        id: 'sync',
        status: 'passed',
        result: 'synchronized',
        durationMs: 1,
        artifacts: [...WORKSPACE_INTELLIGENCE_PREFLIGHT_ARTIFACTS.sync],
        message: 'workspace synchronized',
      },
      {
        id: 'baseline',
        status: 'passed',
        result: 'created',
        durationMs: 1,
        artifacts: [...WORKSPACE_INTELLIGENCE_PREFLIGHT_ARTIFACTS.baseline],
        message: 'baseline created',
      },
    ],
    status: 'passed',
    exitCode: 0,
    stages: WORKSPACE_INTELLIGENCE_STEP_IDS.map((id) => ({
      id,
      status: 'passed',
      durationMs: 1,
      artifacts: [...WORKSPACE_INTELLIGENCE_RUNTIME_STEPS[id].produces],
      exitCode: 0,
      message: `${id} passed`,
    })),
    artifactPath: WORKSPACE_INTELLIGENCE_ARTIFACTS.intelligenceRun,
  };
}

function cloneReport(report = validReport()): WorkspaceIntelligenceRunReport {
  return structuredClone(report);
}

describe('workspace intelligence run contract', () => {
  it('accepts the exact canonical execution envelope and chain', () => {
    const report = validReport();
    expect(() => assertJsonSchemaContract(report, RUN_CONTRACT, 'run report')).not.toThrow();
    expect(() => assertWorkspaceIntelligenceRunSemantics(report)).not.toThrow();
  });

  it('rejects missing, additional, reordered, and renamed canonical stages', () => {
    const malformed = [
      (() => {
        const report = cloneReport();
        report.stages.pop();
        return report;
      })(),
      (() => {
        const report = cloneReport();
        report.stages.push(structuredClone(report.stages[0]));
        return report;
      })(),
      (() => {
        const report = cloneReport();
        [report.stages[0], report.stages[1]] = [report.stages[1], report.stages[0]];
        return report;
      })(),
      (() => {
        const report = cloneReport();
        (report.stages[0] as { id: string }).id = 'sync';
        return report;
      })(),
    ];

    for (const report of malformed) {
      expect(() => assertJsonSchemaContract(report, RUN_CONTRACT, 'run report')).toThrow();
    }
  });

  it('rejects artifact drift even when the rest of the stage is valid', () => {
    const report = cloneReport();
    report.stages[2].artifacts = ['.workspai/reports/wrong-impact.json'];

    expect(() => assertWorkspaceIntelligenceRunSemantics(report)).toThrow(/artifacts/);
  });

  it('rejects incoherent stage and aggregate exit semantics', () => {
    const passedWithFailureCode = cloneReport();
    passedWithFailureCode.stages[0].exitCode = 1;
    expect(() => assertWorkspaceIntelligenceRunSemantics(passedWithFailureCode)).toThrow(
      /passed stage must have exitCode 0/
    );

    const blockedAggregate = cloneReport();
    blockedAggregate.stages[3].status = 'blocked';
    blockedAggregate.stages[3].exitCode = 1;
    expect(() => assertWorkspaceIntelligenceRunSemantics(blockedAggregate)).toThrow(
      /status must be blocked/
    );
  });

  it('requires every downstream stage to be skipped after a hard failure', () => {
    const report = cloneReport();
    report.stages[2].status = 'failed';
    report.stages[2].exitCode = 1;
    report.status = 'failed';
    report.exitCode = 1;

    expect(() => assertWorkspaceIntelligenceRunSemantics(report)).toThrow(
      /doctor-evidence must be skipped after a hard failure/
    );

    for (const stage of report.stages.slice(3)) {
      stage.status = 'skipped';
      stage.durationMs = 0;
      stage.exitCode = 0;
      stage.message = 'skipped after failure';
    }
    expect(() => assertWorkspaceIntelligenceRunSemantics(report)).not.toThrow();
  });

  it('binds baselineCreated to the baseline resolution result', () => {
    const report = cloneReport();
    report.preflight[1].result = 'reused';

    expect(() => assertWorkspaceIntelligenceRunSemantics(report)).toThrow(
      /baselineCreated must match/
    );
    report.baselineCreated = false;
    expect(() => assertWorkspaceIntelligenceRunSemantics(report)).not.toThrow();
  });

  it('models sync, model, and baseline hard-failure propagation in execution order', () => {
    const baselineFailure = cloneReport();
    baselineFailure.preflight[1] = {
      ...baselineFailure.preflight[1],
      status: 'failed',
      result: 'failed',
      message: 'baseline write failed',
    };
    baselineFailure.baselineCreated = false;
    baselineFailure.status = 'failed';
    baselineFailure.exitCode = 1;
    for (const stage of baselineFailure.stages.slice(1)) {
      stage.status = 'skipped';
      stage.durationMs = 0;
      stage.exitCode = 0;
      stage.message = 'skipped after baseline failure';
    }
    expect(() => assertWorkspaceIntelligenceRunSemantics(baselineFailure)).not.toThrow();

    const syncFailure = cloneReport();
    syncFailure.preflight[0] = {
      ...syncFailure.preflight[0],
      status: 'failed',
      result: 'failed',
      message: 'sync failed',
    };
    syncFailure.preflight[1] = {
      ...syncFailure.preflight[1],
      status: 'skipped',
      result: 'skipped',
      durationMs: 0,
      message: 'skipped after sync failure',
    };
    syncFailure.baselineCreated = false;
    syncFailure.status = 'failed';
    syncFailure.exitCode = 1;
    for (const stage of syncFailure.stages) {
      stage.status = 'skipped';
      stage.durationMs = 0;
      stage.exitCode = 0;
      stage.message = 'skipped after sync failure';
    }
    expect(() => assertWorkspaceIntelligenceRunSemantics(syncFailure)).not.toThrow();

    const unexplainedSkip = cloneReport();
    unexplainedSkip.preflight[1] = {
      ...unexplainedSkip.preflight[1],
      status: 'skipped',
      result: 'skipped',
      durationMs: 0,
    };
    unexplainedSkip.baselineCreated = false;
    expect(() => assertWorkspaceIntelligenceRunSemantics(unexplainedSkip)).toThrow(
      /baseline may be skipped only after an upstream failure/
    );
  });
});
