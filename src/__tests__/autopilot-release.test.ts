import os from 'os';
import path from 'path';

import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('execa', () => {
  return {
    execa: vi.fn(),
  };
});

vi.mock('../workspace-run.js', () => {
  return {
    runWorkspaceStage: vi.fn(),
  };
});

import { execa } from 'execa';
import { runWorkspaceStage } from '../workspace-run.js';
import { runAutopilotRelease, AUTOPILOT_RELEASE_ALIAS_FILENAME } from '../autopilot-release.js';

const createdPaths: string[] = [];

async function makeWorkspace(): Promise<string> {
  const workspace = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rapidkit-autopilot-'));
  createdPaths.push(workspace);

  await fsExtra.writeJSON(path.join(workspace, '.rapidkit-workspace'), {
    signature: 'RAPIDKIT_WORKSPACE',
    name: 'autopilot-test',
  });

  const projectPath = path.join(workspace, 'services', 'api');
  await fsExtra.ensureDir(path.join(projectPath, '.rapidkit'));
  await fsExtra.writeJSON(path.join(projectPath, '.rapidkit', 'context.json'), {
    name: 'api',
    runtime: 'node',
  });

  return workspace;
}

afterEach(async () => {
  vi.restoreAllMocks();
  while (createdPaths.length > 0) {
    const target = createdPaths.pop();
    if (target) {
      await fsExtra.remove(target);
    }
  }
});

describe('autopilot-release', () => {
  it('blocks full enforce flow when workspace test/build gate warns', async () => {
    const workspace = await makeWorkspace();

    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('doctor') && args.includes('--plan')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ remediationPlan: { totalSteps: 0 } }),
          stderr: '',
        };
      }
      if (args.includes('doctor') && args.includes('--json')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ healthScore: { errors: 0, warnings: 0 } }),
          stderr: '',
        };
      }
      if (args.includes('readiness')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ overallStatus: 'pass' }),
          stderr: '',
        };
      }
      if (args.includes('diff')) {
        return { exitCode: 0, stdout: 'services/api/package.json', stderr: '' };
      }
      return { exitCode: 0, stdout: '{}', stderr: '' };
    });

    const runWorkspaceStageMock = runWorkspaceStage as unknown as ReturnType<typeof vi.fn>;
    runWorkspaceStageMock.mockImplementation(async ({ stage }: { stage: string }) => {
      if (stage === 'test') {
        return {
          stage: 'test',
          affectedOnly: true,
          strict: false,
          completedAt: new Date().toISOString(),
          summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
          projects: [],
          gates: {
            enabled: true,
            results: [{ name: 'test-warn', status: 'warn', message: 'test gate warning' }],
          },
        };
      }

      return {
        stage: 'build',
        affectedOnly: true,
        strict: false,
        completedAt: new Date().toISOString(),
        summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
        projects: [],
        gates: { enabled: true, results: [] },
      };
    });

    const report = await runAutopilotRelease({
      workspacePath: workspace,
      mode: 'enforce',
      json: true,
    });

    expect(report.summary.verdict).toBe('blocked');
    expect(report.summary.exitCode).toBe(1);
    expect(
      report.blockingReasons.some((reason) =>
        reason.includes('workspace run test reported warnings under enforce mode')
      )
    ).toBe(true);
    expect(report.stages.find((stage) => stage.name === 'workspace-run-test-build')?.status).toBe(
      'warn'
    );
  });

  it('returns approved verdict in audit mode for healthy workspace', async () => {
    const workspace = await makeWorkspace();

    const runWorkspaceStageMock = runWorkspaceStage as unknown as ReturnType<typeof vi.fn>;
    runWorkspaceStageMock.mockResolvedValue({
      stage: 'test',
      affectedOnly: true,
      strict: false,
      completedAt: new Date().toISOString(),
      summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
      projects: [],
      gates: { enabled: true, results: [] },
    });

    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('doctor') && args.includes('--plan')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ remediationPlan: { totalSteps: 0 } }),
          stderr: '',
        };
      }
      if (args.includes('doctor') && args.includes('--json')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ healthScore: { errors: 0, warnings: 0 } }),
          stderr: '',
        };
      }
      if (args.includes('readiness')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ overallStatus: 'pass' }),
          stderr: '',
        };
      }
      if (args.includes('diff')) {
        return { exitCode: 1, stdout: '', stderr: 'not a git repo' };
      }
      if (args.includes('test') || args.includes('build')) {
        return { exitCode: 0, stdout: 'ok', stderr: '' };
      }
      return { exitCode: 0, stdout: '{}', stderr: '' };
    });

    const report = await runAutopilotRelease({
      workspacePath: workspace,
      mode: 'audit',
      json: true,
    });

    expect(report.summary.verdict).toBe('approved');
    expect(report.summary.exitCode).toBe(0);
    expect(report.summary.blockers).toBe(0);
    expect(report.artifacts.workspaceRunTestPath).toContain('autopilot-workspace-run-test.json');
    expect(report.artifacts.workspaceRunBuildPath).toContain('autopilot-workspace-run-build.json');

    const reportPath = path.join(
      workspace,
      '.rapidkit',
      'reports',
      'autopilot-release-last-run.json'
    );
    const testArtifactPath = path.join(
      workspace,
      '.rapidkit',
      'reports',
      'autopilot-workspace-run-test.json'
    );
    const buildArtifactPath = path.join(
      workspace,
      '.rapidkit',
      'reports',
      'autopilot-workspace-run-build.json'
    );
    expect(await fsExtra.pathExists(reportPath)).toBe(true);
    const aliasPath = path.join(
      workspace,
      '.rapidkit',
      'reports',
      AUTOPILOT_RELEASE_ALIAS_FILENAME
    );
    expect(await fsExtra.pathExists(aliasPath)).toBe(true);
    const aliasPayload = JSON.parse(await fsExtra.readFile(aliasPath, 'utf8'));
    expect(aliasPayload.summary.verdict).toBe('approved');
    expect(report.artifacts.aliasEvidencePath).toBe(aliasPath);
    expect(report.enterpriseControls?.aliasEvidencePath).toBe(
      `.rapidkit/reports/${AUTOPILOT_RELEASE_ALIAS_FILENAME}`
    );
    expect(await fsExtra.pathExists(testArtifactPath)).toBe(true);
    expect(await fsExtra.pathExists(buildArtifactPath)).toBe(true);
  });

  it('blocks in enforce mode when readiness is warn', async () => {
    const workspace = await makeWorkspace();

    const runWorkspaceStageMock = runWorkspaceStage as unknown as ReturnType<typeof vi.fn>;
    runWorkspaceStageMock.mockResolvedValue({
      stage: 'test',
      affectedOnly: true,
      strict: false,
      completedAt: new Date().toISOString(),
      summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
      projects: [],
      gates: { enabled: true, results: [] },
    });

    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('doctor') && args.includes('--plan')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ remediationPlan: { totalSteps: 0 } }),
          stderr: '',
        };
      }
      if (args.includes('doctor') && args.includes('--json')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ healthScore: { errors: 0, warnings: 0 } }),
          stderr: '',
        };
      }
      if (args.includes('readiness')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ overallStatus: 'warn' }),
          stderr: '',
        };
      }
      if (args.includes('diff')) {
        return { exitCode: 1, stdout: '', stderr: 'not a git repo' };
      }
      if (args.includes('test') || args.includes('build')) {
        return { exitCode: 0, stdout: 'ok', stderr: '' };
      }
      return { exitCode: 0, stdout: '{}', stderr: '' };
    });

    const report = await runAutopilotRelease({
      workspacePath: workspace,
      mode: 'enforce',
      json: true,
    });

    expect(report.summary.verdict).toBe('blocked');
    expect(report.summary.exitCode).toBe(1);
    expect(report.summary.blockers).toBeGreaterThan(0);
    expect(
      report.blockingReasons.some((reason) => reason.includes('readiness reported warnings'))
    ).toBe(true);
  });

  it('executes doctor apply stage in safe-fix mode', async () => {
    const workspace = await makeWorkspace();

    const runWorkspaceStageMock = runWorkspaceStage as unknown as ReturnType<typeof vi.fn>;
    runWorkspaceStageMock.mockResolvedValue({
      stage: 'test',
      affectedOnly: true,
      strict: false,
      completedAt: new Date().toISOString(),
      summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
      projects: [],
      gates: { enabled: true, results: [] },
    });

    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('doctor') && args.includes('--apply')) {
        return { exitCode: 0, stdout: 'applied', stderr: '' };
      }
      if (args.includes('doctor') && args.includes('--plan')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ remediationPlan: { totalSteps: 2 } }),
          stderr: '',
        };
      }
      if (args.includes('doctor') && args.includes('--json')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ healthScore: { errors: 0, warnings: 1 } }),
          stderr: '',
        };
      }
      if (args.includes('readiness')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ overallStatus: 'pass' }),
          stderr: '',
        };
      }
      if (args.includes('diff')) {
        return { exitCode: 1, stdout: '', stderr: 'not a git repo' };
      }
      if (args.includes('test') || args.includes('build')) {
        return { exitCode: 0, stdout: 'ok', stderr: '' };
      }
      return { exitCode: 0, stdout: '{}', stderr: '' };
    });

    const report = await runAutopilotRelease({
      workspacePath: workspace,
      mode: 'safe-fix',
      json: true,
    });

    expect(report.summary.safeFixesApplied).toBe(2);
    expect(report.stages.find((stage) => stage.name === 'remediation-apply')?.status).toBe('pass');

    const applyCalled = execaMock.mock.calls.some((call) => {
      const args = (call[1] ?? []) as string[];
      return args.includes('doctor') && args.includes('--apply');
    });
    expect(applyCalled).toBe(true);

    const doctorJsonCalls = execaMock.mock.calls.filter((call) => {
      const args = (call[1] ?? []) as string[];
      return args.includes('doctor') && args.includes('--json');
    }).length;
    const readinessJsonCalls = execaMock.mock.calls.filter((call) => {
      const args = (call[1] ?? []) as string[];
      return args.includes('readiness') && args.includes('--json');
    }).length;

    expect(doctorJsonCalls).toBeGreaterThanOrEqual(2);
    expect(readinessJsonCalls).toBeGreaterThanOrEqual(2);
  });

  it('returns exitCode 3 on command execution crash', async () => {
    const workspace = await makeWorkspace();

    const runWorkspaceStageMock = runWorkspaceStage as unknown as ReturnType<typeof vi.fn>;
    runWorkspaceStageMock.mockResolvedValue({
      stage: 'test',
      affectedOnly: true,
      strict: false,
      completedAt: new Date().toISOString(),
      summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
      projects: [],
      gates: { enabled: true, results: [] },
    });

    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('doctor') && args.includes('--json')) {
        throw new Error('spawn failed');
      }

      return { exitCode: 0, stdout: '{}', stderr: '' };
    });

    const report = await runAutopilotRelease({
      workspacePath: workspace,
      mode: 'audit',
      json: true,
    });

    expect(report.summary.exitCode).toBe(3);
    expect(report.summary.verdict).toBe('blocked');
    expect(report.blockingReasons.some((reason) => reason.includes('execution error'))).toBe(true);
  });
});
