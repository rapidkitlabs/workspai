import os from 'os';
import path from 'path';
import fs from 'fs';

import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('execa', () => {
  return {
    execa: vi.fn(),
  };
});

import { execa } from 'execa';
import { runWorkspaceStage } from '../workspace-run';

async function createProject(workspacePath: string, relPath: string) {
  const projectPath = path.join(workspacePath, relPath);
  await fsExtra.ensureDir(path.join(projectPath, '.rapidkit'));
  await fsExtra.writeJSON(path.join(projectPath, '.rapidkit', 'context.json'), {
    name: relPath,
    runtime: 'node',
  });
  return projectPath;
}

async function createProjectWithoutContext(
  workspacePath: string,
  relPath: string
): Promise<string> {
  const projectPath = path.join(workspacePath, relPath);
  await fsExtra.ensureDir(projectPath);
  return projectPath;
}

function noGateMock(extraArgs?: Record<string, { exitCode: number; stdout: string }>) {
  const execaMock = execa as unknown as ReturnType<typeof vi.fn>;
  execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
    if (extraArgs) {
      for (const [key, val] of Object.entries(extraArgs)) {
        if (args.includes(key)) {
          return { exitCode: val.exitCode, stdout: val.stdout, stderr: '' };
        }
      }
    }
    return { exitCode: 0, stdout: '{}', stderr: '' };
  });
  return execaMock;
}

describe('workspace-run', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── existing tests ────────────────────────────────────────────────────────

  it('runs only affected projects when --affected is enabled', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-run-'));
    await createProject(workspacePath, 'services/api-a');
    await createProject(workspacePath, 'services/api-b');

    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('diff')) {
        return { exitCode: 0, stdout: 'services/api-a/src/users.ts\n', stderr: '' };
      }
      if (args.includes('test')) {
        return { exitCode: 0, stdout: 'ok', stderr: '' };
      }
      return { exitCode: 0, stdout: '{}', stderr: '' };
    });

    const report = await runWorkspaceStage({
      workspacePath,
      stage: 'test',
      affected: true,
      since: 'HEAD~1',
      enforceGates: false,
      json: true,
    });

    expect(report.summary.selectedCount).toBe(1);
    expect(report.summary.passed).toBe(1);
    expect(report.summary.failed).toBe(0);
    expect(
      report.projects.filter((item) => item.selected).map((item) => item.relativePath)
    ).toEqual(['services/api-a']);

    const reportPath = path.join(workspacePath, '.rapidkit', 'reports', 'workspace-run-last.json');
    expect(await fsExtra.pathExists(reportPath)).toBe(true);

    await fsExtra.remove(workspacePath);
  });

  it('blocks project execution when readiness gate fails', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-run-'));
    await createProject(workspacePath, 'services/api-a');

    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('doctor')) {
        return { exitCode: 0, stdout: JSON.stringify({ healthScore: { errors: 0 } }), stderr: '' };
      }
      if (args.includes('readiness')) {
        return { exitCode: 0, stdout: JSON.stringify({ overallStatus: 'fail' }), stderr: '' };
      }
      if (args.includes('build')) {
        throw new Error('build should not execute when gate fails');
      }
      return { exitCode: 0, stdout: '{}', stderr: '' };
    });

    const report = await runWorkspaceStage({
      workspacePath,
      stage: 'build',
      json: true,
      strict: true,
    });

    expect(report.gates.blocked).toBe(true);
    expect(report.summary.passed).toBe(0);
    expect(report.summary.failed).toBe(0);
    expect(report.summary.exitCode).toBe(1);

    await fsExtra.remove(workspacePath);
  });

  it('does not block init stage on readiness gate failure', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-run-'));
    await createProject(workspacePath, 'services/api-a');

    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('init')) {
        return { exitCode: 0, stdout: 'ok', stderr: '' };
      }
      if (args.includes('doctor')) {
        return { exitCode: 0, stdout: JSON.stringify({ healthScore: { errors: 0 } }), stderr: '' };
      }
      if (args.includes('readiness')) {
        return { exitCode: 0, stdout: JSON.stringify({ overallStatus: 'fail' }), stderr: '' };
      }
      return { exitCode: 0, stdout: '{}', stderr: '' };
    });

    const report = await runWorkspaceStage({
      workspacePath,
      stage: 'init',
      json: true,
    });

    expect(report.gates.enforced).toBe(false);
    expect(report.gates.blocked).toBe(false);
    expect(report.summary.passed).toBe(1);
    expect(report.summary.failed).toBe(0);
    expect(report.summary.exitCode).toBe(0);

    await fsExtra.remove(workspacePath);
  });

  it('respects workspace policy override to disable gates', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-run-'));
    await createProject(workspacePath, 'services/api-a');
    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fs.promises.writeFile(
      path.join(workspacePath, '.rapidkit', 'policies.yml'),
      'mode: warn\nrules.enforce_workspace_run_gates: false\n',
      'utf-8'
    );

    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('start')) {
        return { exitCode: 0, stdout: 'ok', stderr: '' };
      }
      if (args.includes('doctor') || args.includes('readiness')) {
        throw new Error('gates should be skipped by policy override');
      }
      return { exitCode: 0, stdout: '{}', stderr: '' };
    });

    const report = await runWorkspaceStage({
      workspacePath,
      stage: 'start',
      json: true,
    });

    expect(report.gates.enforced).toBe(false);
    expect(report.summary.passed).toBe(1);
    expect(report.summary.exitCode).toBe(0);

    await fsExtra.remove(workspacePath);
  });

  it('expands affected set with blast-radius dependency graph', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-run-'));
    await createProject(workspacePath, 'apps/api-a');
    await createProject(workspacePath, 'apps/api-b');
    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fsExtra.writeJSON(
      path.join(workspacePath, '.rapidkit', 'workspace-dependency-graph.json'),
      {
        projects: [
          { path: 'apps/api-a', dependsOn: [] },
          { path: 'apps/api-b', dependsOn: ['apps/api-a'] },
        ],
      }
    );

    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('diff')) {
        return { exitCode: 0, stdout: 'apps/api-a/src/users.ts\n', stderr: '' };
      }
      if (args.includes('test')) {
        return { exitCode: 0, stdout: 'ok', stderr: '' };
      }
      return { exitCode: 0, stdout: '{}', stderr: '' };
    });

    const report = await runWorkspaceStage({
      workspacePath,
      stage: 'test',
      affected: true,
      blastRadius: true,
      enforceGates: false,
      json: true,
    });

    expect(
      report.projects.filter((item) => item.selected).map((item) => item.relativePath)
    ).toEqual(['apps/api-a', 'apps/api-b']);
    expect(report.summary.selectedCount).toBe(2);
    expect(report.summary.passed).toBe(2);

    await fsExtra.remove(workspacePath);
  });

  // ─── selection provenance tests ────────────────────────────────────────────

  it('selection provenance: mode=all when affected is not set', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-run-'));
    await createProject(workspacePath, 'apps/api-a');
    noGateMock({ build: { exitCode: 0, stdout: 'ok' } });

    const report = await runWorkspaceStage({
      workspacePath,
      stage: 'build',
      enforceGates: false,
      json: true,
    });

    expect(report.selection.mode).toBe('all');
    expect(report.selection.since).toBeNull();
    expect(report.selection.graphStatus).toBe('not-applicable');
    expect(report.selection.expansionDepth).toBe(0);

    await fsExtra.remove(workspacePath);
  });

  it('selection provenance: mode=affected when --affected without blast-radius', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-run-'));
    await createProject(workspacePath, 'apps/api-a');

    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('diff')) {
        return { exitCode: 0, stdout: 'apps/api-a/readme.md\n', stderr: '' };
      }
      return { exitCode: 0, stdout: '{}', stderr: '' };
    });

    const report = await runWorkspaceStage({
      workspacePath,
      stage: 'test',
      affected: true,
      since: 'origin/main',
      enforceGates: false,
      json: true,
    });

    expect(report.selection.mode).toBe('affected');
    expect(report.selection.since).toBe('origin/main');
    expect(report.selection.graphStatus).toBe('not-applicable');

    await fsExtra.remove(workspacePath);
  });

  it('selection provenance: mode=affected+blast-radius and graphStatus=loaded', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-run-'));
    await createProject(workspacePath, 'apps/api-a');
    await createProject(workspacePath, 'apps/api-b');
    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fsExtra.writeJSON(
      path.join(workspacePath, '.rapidkit', 'workspace-dependency-graph.json'),
      {
        projects: [
          { path: 'apps/api-a', dependsOn: [] },
          { path: 'apps/api-b', dependsOn: ['apps/api-a'] },
        ],
      }
    );

    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('diff')) {
        return { exitCode: 0, stdout: 'apps/api-a/src/x.ts\n', stderr: '' };
      }
      return { exitCode: 0, stdout: '{}', stderr: '' };
    });

    const report = await runWorkspaceStage({
      workspacePath,
      stage: 'test',
      affected: true,
      blastRadius: true,
      enforceGates: false,
      json: true,
    });

    expect(report.selection.mode).toBe('affected+blast-radius');
    expect(report.selection.graphStatus).toBe('loaded');
    expect(report.selection.expansionDepth).toBeGreaterThan(0);

    await fsExtra.remove(workspacePath);
  });

  // ─── blast-radius graph fallback observability tests ──────────────────────

  it('blast-radius graph missing: falls back to direct affected set with graphStatus=missing', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-run-'));
    await createProject(workspacePath, 'apps/api-a');
    await createProject(workspacePath, 'apps/api-b');
    // No dependency graph file written

    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('diff')) {
        return { exitCode: 0, stdout: 'apps/api-a/src/x.ts\n', stderr: '' };
      }
      return { exitCode: 0, stdout: '{}', stderr: '' };
    });

    const report = await runWorkspaceStage({
      workspacePath,
      stage: 'test',
      affected: true,
      blastRadius: true,
      enforceGates: false,
      json: true,
    });

    expect(report.selection.graphStatus).toBe('missing');
    // Only api-a affected; api-b should NOT be expanded (no graph)
    expect(report.projects.filter((p) => p.selected).map((p) => p.relativePath)).toEqual([
      'apps/api-a',
    ]);

    await fsExtra.remove(workspacePath);
  });

  it('blast-radius graph invalid JSON: falls back to affected set with graphStatus=invalid', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-run-'));
    await createProject(workspacePath, 'apps/api-a');
    await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fs.promises.writeFile(
      path.join(workspacePath, '.rapidkit', 'workspace-dependency-graph.json'),
      'NOT VALID JSON }{',
      'utf-8'
    );

    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('diff')) {
        return { exitCode: 0, stdout: 'apps/api-a/src/x.ts\n', stderr: '' };
      }
      return { exitCode: 0, stdout: '{}', stderr: '' };
    });

    const report = await runWorkspaceStage({
      workspacePath,
      stage: 'test',
      affected: true,
      blastRadius: true,
      enforceGates: false,
      json: true,
    });

    expect(report.selection.graphStatus).toBe('invalid');

    await fsExtra.remove(workspacePath);
  });

  // ─── gate strict/warn matrix tests ────────────────────────────────────────

  it('strict mode: readiness gate=warn causes non-zero exit', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-run-'));
    await createProject(workspacePath, 'apps/api-a');

    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('doctor')) {
        return { exitCode: 0, stdout: JSON.stringify({ healthScore: { errors: 0 } }), stderr: '' };
      }
      if (args.includes('readiness')) {
        return { exitCode: 0, stdout: JSON.stringify({ overallStatus: 'warn' }), stderr: '' };
      }
      if (args.includes('build')) {
        return { exitCode: 0, stdout: 'ok', stderr: '' };
      }
      return { exitCode: 0, stdout: '{}', stderr: '' };
    });

    const report = await runWorkspaceStage({
      workspacePath,
      stage: 'build',
      strict: true,
      json: true,
    });

    // gates not blocked (warn != fail), stage runs, but strict => non-zero exit
    expect(report.gates.blocked).toBe(false);
    expect(report.summary.passed).toBe(1);
    expect(report.summary.exitCode).toBe(1);

    await fsExtra.remove(workspacePath);
  });

  it('warn mode: readiness gate=warn causes zero exit when no stage fails', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-run-'));
    await createProject(workspacePath, 'apps/api-a');

    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('doctor')) {
        return { exitCode: 0, stdout: JSON.stringify({ healthScore: { errors: 0 } }), stderr: '' };
      }
      if (args.includes('readiness')) {
        return { exitCode: 0, stdout: JSON.stringify({ overallStatus: 'warn' }), stderr: '' };
      }
      if (args.includes('build')) {
        return { exitCode: 0, stdout: 'ok', stderr: '' };
      }
      return { exitCode: 0, stdout: '{}', stderr: '' };
    });

    const report = await runWorkspaceStage({
      workspacePath,
      stage: 'build',
      strict: false,
      json: true,
    });

    expect(report.gates.blocked).toBe(false);
    expect(report.summary.passed).toBe(1);
    expect(report.summary.exitCode).toBe(0);

    await fsExtra.remove(workspacePath);
  });

  // ─── report mandatory field presence tests ────────────────────────────────

  it('report contains all mandatory contract fields', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-run-'));
    await createProject(workspacePath, 'apps/api-a');
    noGateMock({ build: { exitCode: 0, stdout: 'ok' } });

    const report = await runWorkspaceStage({
      workspacePath,
      stage: 'build',
      enforceGates: false,
      json: true,
    });

    // top-level mandatory fields
    expect(report.schemaVersion).toBe('1.0');
    expect(typeof report.generatedAt).toBe('string');
    expect(typeof report.workspacePath).toBe('string');
    expect(typeof report.stage).toBe('string');
    expect(typeof report.durationMs).toBe('number');

    // options block
    expect(typeof report.options.affected).toBe('boolean');
    expect(typeof report.options.blastRadius).toBe('boolean');
    expect(typeof report.options.parallel).toBe('boolean');
    expect(typeof report.options.strict).toBe('boolean');
    expect(typeof report.options.enforceGates).toBe('boolean');

    // selection provenance block
    expect(['all', 'affected', 'affected+blast-radius']).toContain(report.selection.mode);
    expect(typeof report.selection.graphStatus).toBe('string');
    expect(typeof report.selection.expansionDepth).toBe('number');

    // gates block
    expect(typeof report.gates.enforced).toBe('boolean');
    expect(typeof report.gates.blocked).toBe('boolean');
    expect(Array.isArray(report.gates.results)).toBe(true);

    // summary block
    expect(typeof report.summary.projectCount).toBe('number');
    expect(typeof report.summary.selectedCount).toBe('number');
    expect(typeof report.summary.passed).toBe('number');
    expect(typeof report.summary.failed).toBe('number');
    expect(typeof report.summary.skipped).toBe('number');
    expect(typeof report.summary.exitCode).toBe('number');

    // projects array
    expect(Array.isArray(report.projects)).toBe(true);
    for (const project of report.projects) {
      expect(typeof project.path).toBe('string');
      expect(typeof project.relativePath).toBe('string');
      expect(typeof project.selected).toBe('boolean');
      expect(typeof project.status).toBe('string');
      expect(typeof project.durationMs).toBe('number');
    }

    await fsExtra.remove(workspacePath);
  });

  it('detects rails from manifests and uses the explicit framework init command without context metadata', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-run-'));
    const projectPath = await createProjectWithoutContext(workspacePath, 'apps/rails-api');
    await fsExtra.writeFile(path.join(projectPath, 'Gemfile'), 'gem "rails", "~> 7.1.0"\n');
    await fsExtra.ensureDir(path.join(projectPath, 'config'));
    await fsExtra.writeFile(
      path.join(projectPath, 'config', 'application.rb'),
      'require "rails/all"\n'
    );

    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;
    execaMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'bundle install && rails db:prepare') {
        return { exitCode: 0, stdout: 'ok', stderr: '' };
      }
      return { exitCode: 0, stdout: '{}', stderr: '' };
    });

    const report = await runWorkspaceStage({
      workspacePath,
      stage: 'init',
      enforceGates: false,
      json: true,
    });

    const projectReport = report.projects.find((item) => item.relativePath === 'apps/rails-api');
    expect(projectReport?.framework).toBe('rails');
    expect(projectReport?.runtimeDetected).toBe('ruby');
    expect(projectReport?.executionCommand).toBe('bundle install && rails db:prepare');
    expect(projectReport?.status).toBe('passed');

    await fsExtra.remove(workspacePath);
  });

  it('reports canonical framework labels from manifest detection when context metadata is missing', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-run-'));
    const projectPath = await createProjectWithoutContext(workspacePath, 'apps/gin-api');
    await fsExtra.writeFile(
      path.join(projectPath, 'go.mod'),
      'module example\n\nrequire github.com/gin-gonic/gin v1.9.1\n'
    );

    const execaMock = execa as unknown as ReturnType<typeof vi.fn>;
    execaMock.mockImplementation(async (_cmd: string, args: string[]) => {
      if (args.includes('test')) {
        return { exitCode: 0, stdout: 'ok', stderr: '' };
      }
      return { exitCode: 0, stdout: '{}', stderr: '' };
    });

    const report = await runWorkspaceStage({
      workspacePath,
      stage: 'test',
      enforceGates: false,
      json: true,
    });

    const projectReport = report.projects.find((item) => item.relativePath === 'apps/gin-api');
    expect(projectReport?.framework).toBe('gogin');
    expect(projectReport?.runtimeDetected).toBe('go');
    expect(projectReport?.executionCommand).toBe('rapidkit test');
    expect(projectReport?.status).toBe('passed');

    await fsExtra.remove(workspacePath);
  });

  // ─── invalid stage validation ─────────────────────────────────────────────

  it('throws for invalid stage name', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-run-'));
    await createProject(workspacePath, 'apps/api-a');
    noGateMock();

    await expect(
      runWorkspaceStage({
        workspacePath,
        stage: 'dev' as never,
        enforceGates: false,
        json: true,
      })
    ).rejects.toThrow('Unsupported workspace run stage: dev');

    await fsExtra.remove(workspacePath);
  });
});
