import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { ensureDistBuilt } from './helpers/dist';

function runCli(dist: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv) {
  const childEnv = {
    ...process.env,
    ...env,
    CI: '1',
  };
  delete childEnv.VITEST;
  delete childEnv.VITEST_POOL_ID;
  delete childEnv.VITEST_WORKER_ID;
  delete childEnv.NODE_ENV;
  delete childEnv.NODE_OPTIONS;

  const result = spawnSync(process.execPath, [dist, ...args], {
    cwd,
    encoding: 'utf8',
    env: childEnv,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (!output.trim()) {
    return {
      ...result,
      output: `[empty output] status=${String(result.status)} signal=${String(
        result.signal
      )} error=${result.error?.message ?? 'none'} node=${process.execPath} dist=${dist} cwd=${cwd} args=${args.join(
        ' '
      )}`,
    };
  }
  return { ...result, output };
}

function parseJsonOutput<T>(output: string): T {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON object found in CLI output:\n${output}`);
  }
  return JSON.parse(output.slice(start, end + 1)) as T;
}

function isLocalSpawnBlocked(error: Error | undefined): boolean {
  return !!error && error.message.includes('EPERM') && process.env.CI !== 'true';
}

describe('workspace intelligence CLI chain', () => {
  it('executes the real unified runner and persists its exact contract on first and subsequent runs', () => {
    const dist = ensureDistBuilt('workspace intelligence unified runner');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-wi-runner-'));
    const workspaceDir = path.join(tempDir, 'workspace');
    const homeDir = path.join(tempDir, 'home');
    const projectDir = path.join(workspaceDir, 'services', 'api');

    try {
      fs.mkdirSync(path.join(workspaceDir, '.workspai'), { recursive: true });
      fs.mkdirSync(path.join(projectDir, '.workspai'), { recursive: true });
      fs.mkdirSync(homeDir, { recursive: true });
      fs.writeFileSync(
        path.join(workspaceDir, '.workspai-workspace'),
        JSON.stringify({
          signature: 'RAPIDKIT_WORKSPACE',
          createdBy: 'workspai',
          version: 'test',
          createdAt: '2026-07-18T00:00:00.000Z',
          name: 'workspace',
        })
      );
      fs.writeFileSync(
        path.join(workspaceDir, '.workspai', 'workspace.json'),
        JSON.stringify({ workspace_name: 'workspace', profile: 'enterprise' })
      );
      fs.writeFileSync(
        path.join(projectDir, '.workspai', 'project.json'),
        JSON.stringify({ name: 'api', runtime: 'python', kit_name: 'fastapi.standard' })
      );
      fs.writeFileSync(path.join(projectDir, 'pyproject.toml'), '[project]\nname = "api"\n');

      const expectedStages = [
        'model',
        'diff',
        'impact',
        'doctor-evidence',
        'contract-evidence',
        'analyze-evidence',
        'readiness-evidence',
        'verify',
        'context',
        'agent-sync',
        'explain',
      ];
      const execute = () =>
        runCli(
          dist,
          ['workspace', 'intelligence', 'run', '--for-agent', 'codex', '--json'],
          workspaceDir,
          { HOME: homeDir }
        );

      const first = execute();
      if (isLocalSpawnBlocked(first.error)) {
        console.warn(
          `Skipping unified runner: local sandbox blocked spawn (${first.error.message}).`
        );
        return;
      }
      expect([0, 2]).toContain(first.status);
      const firstReport = parseJsonOutput<{
        schemaVersion: string;
        baselineCreated: boolean;
        preflight: Array<{ id: string; status: string; result: string }>;
        status: string;
        exitCode: number;
        stages: Array<{ id: string; status: string; artifacts: string[]; exitCode: number }>;
        artifactPath: string;
      }>(first.output);
      expect(firstReport.schemaVersion).toBe('workspace-intelligence-run.v1');
      expect(firstReport.baselineCreated).toBe(true);
      expect(firstReport.preflight).toMatchObject([
        { id: 'sync', status: 'passed', result: 'synchronized' },
        { id: 'baseline', status: 'passed', result: 'created' },
      ]);
      expect(firstReport.stages.map((stage) => stage.id)).toEqual(expectedStages);
      expect(firstReport.stages).toHaveLength(11);
      expect(firstReport.exitCode).toBe(first.status);

      const reportPath = path.join(workspaceDir, firstReport.artifactPath);
      expect(fs.existsSync(reportPath)).toBe(true);
      expect(JSON.parse(fs.readFileSync(reportPath, 'utf8'))).toEqual(firstReport);
      for (const stage of firstReport.stages) {
        for (const artifact of stage.artifacts) {
          expect(fs.existsSync(path.join(workspaceDir, artifact)), `${stage.id}: ${artifact}`).toBe(
            true
          );
        }
      }

      const second = execute();
      expect([0, 2]).toContain(second.status);
      const secondReport = parseJsonOutput<typeof firstReport>(second.output);
      expect(secondReport.baselineCreated).toBe(false);
      expect(secondReport.preflight[1]).toMatchObject({
        id: 'baseline',
        status: 'passed',
        result: 'reused',
      });
      expect(secondReport.stages.map((stage) => stage.id)).toEqual(expectedStages);
      expect(secondReport.exitCode).toBe(second.status);
      expect(JSON.parse(fs.readFileSync(reportPath, 'utf8'))).toEqual(secondReport);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 120_000);

  it('runs model -> snapshot -> diff -> impact -> context for an observed frontend workspace', () => {
    const dist = ensureDistBuilt('workspace intelligence CLI chain');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rk-wi-cli-chain-'));
    const workspaceDir = path.join(tempDir, 'workspace');
    const apiDir = path.join(workspaceDir, 'services', 'api');
    const webDir = path.join(workspaceDir, 'apps', 'web');

    try {
      fs.mkdirSync(path.join(workspaceDir, '.workspai'), { recursive: true });
      fs.writeFileSync(
        path.join(workspaceDir, '.workspai-workspace'),
        JSON.stringify(
          {
            signature: 'RAPIDKIT_WORKSPACE',
            createdBy: 'rapidkit-npm',
            version: 'test',
            createdAt: '2026-06-15T00:00:00.000Z',
            name: 'workspace',
          },
          null,
          2
        )
      );
      fs.writeFileSync(
        path.join(workspaceDir, '.workspai', 'workspace.json'),
        JSON.stringify({ workspace_name: 'workspace', profile: 'polyglot' }, null, 2)
      );
      fs.mkdirSync(path.join(apiDir, '.workspai'), { recursive: true });
      fs.writeFileSync(
        path.join(apiDir, '.workspai', 'project.json'),
        JSON.stringify(
          {
            name: 'api',
            runtime: 'python',
            kit_name: 'fastapi.standard',
            modules: ['auth/core'],
          },
          null,
          2
        )
      );
      fs.writeFileSync(path.join(apiDir, 'pyproject.toml'), '[project]\nname = "api"\n');

      const modelBefore = runCli(dist, ['workspace', 'model', '--json'], workspaceDir);
      if (isLocalSpawnBlocked(modelBefore.error)) {
        console.warn(
          `Skipping workspace intelligence CLI chain: local sandbox blocked child process spawn (${modelBefore.error.message}).`
        );
        return;
      }
      expect(modelBefore.status).toBe(0);
      expect(
        parseJsonOutput<{ projects: Array<{ name: string }> }>(modelBefore.output).projects
      ).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'api' })]));

      const snapshot = runCli(dist, ['workspace', 'snapshot', '--json'], workspaceDir);
      expect(snapshot.status).toBe(0);
      const snapshotJson = parseJsonOutput<{ outputPath: string }>(snapshot.output);
      expect(fs.existsSync(snapshotJson.outputPath)).toBe(true);

      fs.mkdirSync(webDir, { recursive: true });
      fs.writeFileSync(
        path.join(webDir, 'package.json'),
        JSON.stringify(
          {
            private: true,
            dependencies: {
              vite: '^6.0.0',
              react: '^19.0.0',
              'react-dom': '^19.0.0',
            },
            scripts: {
              dev: 'vite',
              build: 'vite build',
              test: 'vitest run',
            },
          },
          null,
          2
        )
      );

      const diff = runCli(
        dist,
        ['workspace', 'diff', '--from', snapshotJson.outputPath, '--json'],
        workspaceDir
      );
      expect(diff.status).toBe(0);
      expect(
        parseJsonOutput<{ artifact: { summary: { addedProjects: number } } }>(diff.output).artifact
          .summary
      ).toMatchObject({
        addedProjects: 1,
      });

      const impact = runCli(
        dist,
        ['workspace', 'impact', '--from', snapshotJson.outputPath, '--json'],
        workspaceDir
      );
      expect(impact.status).toBe(0);
      const impactJson = parseJsonOutput<{
        artifact: {
          affectedProjects: Array<{
            target: string;
            project: { name: string; framework: string; kind: string };
            verification: Array<{ display: string; execute: string; required: boolean }>;
          }>;
        };
      }>(impact.output).artifact;
      expect(impactJson.affectedProjects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            target: 'apps/web',
            project: expect.objectContaining({
              name: 'web',
              framework: 'react',
              kind: 'frontend',
            }),
          }),
        ])
      );
      expect(
        impactJson.affectedProjects.find((item) => item.project.name === 'web')?.verification
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            display: 'npx workspai workspace run test --scope project:web --json',
            execute:
              'npx --yes --package workspai workspai workspace run test --scope project:web --json',
            required: true,
          }),
        ])
      );

      const context = runCli(
        dist,
        ['workspace', 'context', '--for-agent', '--scope', 'project:web', '--json'],
        workspaceDir
      );
      expect(context.status).toBe(0);
      const contextJson = parseJsonOutput<{
        scope: { requested: string; activeProject?: string };
        projects: Array<{ name: string; framework: string; safeCommands: string[] }>;
        safeCommands: Array<{ display: string; execute: string; project?: string }>;
      }>(context.output);
      expect(contextJson.scope).toMatchObject({
        requested: 'project:web',
        activeProject: 'web',
      });
      expect(contextJson.projects).toEqual([
        expect.objectContaining({
          name: 'web',
          framework: 'React',
          safeCommands: expect.arrayContaining(['workspace run test', 'workspace run build']),
        }),
      ]);
      expect(contextJson.safeCommands).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            project: 'web',
            display: 'npx workspai workspace run test --scope project:web',
            execute: 'npx --yes --package workspai workspai workspace run test --scope project:web',
          }),
          expect.objectContaining({
            project: 'web',
            display: 'npx workspai workspace run build --scope project:web',
            execute:
              'npx --yes --package workspai workspai workspace run build --scope project:web',
          }),
        ])
      );

      const verify = runCli(dist, ['workspace', 'verify', '--json'], workspaceDir);
      expect(verify.status).toBe(2);
      const verifyJson = parseJsonOutput<{
        artifact: {
          schemaVersion: string;
          summary: { verdict: string; exitCode: number };
          steps: Array<{ id: string; status: string }>;
          gate: { passed: boolean; mode: string; exitCode: number; reasons: string[] };
          freshness: { verdict: string; baseline: string; projectHashes: Record<string, string> };
          policyMode: string;
          policyViolations: Array<{ source: string; severity: string; code: string }>;
          graphIntegrity: { ok: boolean };
          affectedSubgraph: { directlyChanged: string[]; transitiveDependents: string[] };
        };
      }>(verify.output).artifact;
      expect(verifyJson.schemaVersion).toBe('workspace-verify.v1');
      expect(verifyJson.summary.verdict).toBe('blocked');
      expect(verifyJson.steps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'workspace.doctor',
            status: 'missing',
          }),
        ])
      );
      // New intelligence fields must flow through the real CLI JSON stream (1.18-1.20).
      expect(verifyJson.gate).toMatchObject({ passed: false, exitCode: 2 });
      expect(Array.isArray(verifyJson.gate.reasons)).toBe(true);
      expect(['fresh', 'stale', 'unknown']).toContain(verifyJson.freshness.verdict);
      expect(typeof verifyJson.policyMode).toBe('string');
      expect(Array.isArray(verifyJson.policyViolations)).toBe(true);
      expect(verifyJson.graphIntegrity.ok).toBe(true);

      // Strict gate exercised over the JSON stream: still blocked (exit 2).
      const verifyStrict = runCli(
        dist,
        ['workspace', 'verify', '--strict', '--json'],
        workspaceDir
      );
      expect(verifyStrict.status).toBe(2);

      // History artifact recorded by the verify runs (1.21).
      const historyPath = path.join(
        workspaceDir,
        '.workspai',
        'reports',
        'workspace-intelligence-history.json'
      );
      expect(fs.existsSync(historyPath)).toBe(true);
      const history = JSON.parse(fs.readFileSync(historyPath, 'utf8')) as {
        schemaVersion: string;
        entries: Array<{ verdict: string; gatePassed: boolean }>;
      };
      expect(history.schemaVersion).toBe('workspace-intelligence-history.v1');
      expect(history.entries.length).toBeGreaterThanOrEqual(2);
      expect(history.entries.at(-1)?.verdict).toBe('blocked');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }, 60_000);
});
