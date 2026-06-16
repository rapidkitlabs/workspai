import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { ensureDistBuilt } from './helpers/dist';

function runCli(dist: string, args: string[], cwd: string) {
  const childEnv = {
    ...process.env,
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
  it('runs model -> snapshot -> diff -> impact -> context for an observed frontend workspace', () => {
    const dist = ensureDistBuilt('workspace intelligence CLI chain');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rk-wi-cli-chain-'));
    const workspaceDir = path.join(tempDir, 'workspace');
    const apiDir = path.join(workspaceDir, 'services', 'api');
    const webDir = path.join(workspaceDir, 'apps', 'web');

    try {
      fs.mkdirSync(path.join(workspaceDir, '.rapidkit'), { recursive: true });
      fs.writeFileSync(
        path.join(workspaceDir, '.rapidkit-workspace'),
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
        path.join(workspaceDir, '.rapidkit', 'workspace.json'),
        JSON.stringify({ workspace_name: 'workspace', profile: 'polyglot' }, null, 2)
      );
      fs.mkdirSync(path.join(apiDir, '.rapidkit'), { recursive: true });
      fs.writeFileSync(
        path.join(apiDir, '.rapidkit', 'project.json'),
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
        parseJsonOutput<{ summary: { addedProjects: number } }>(diff.output).summary
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
        affectedProjects: Array<{
          target: string;
          project: { name: string; framework: string; kind: string };
          verification: Array<{ display: string; execute: string; required: boolean }>;
        }>;
      }>(impact.output);
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
            display: 'npx rapidkit workspace run test --scope project:web --json',
            execute:
              'npx --yes --package rapidkit rapidkit workspace run test --scope project:web --json',
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
            display: 'npx rapidkit workspace run test --scope project:web',
            execute: 'npx --yes --package rapidkit rapidkit workspace run test --scope project:web',
          }),
          expect.objectContaining({
            project: 'web',
            display: 'npx rapidkit workspace run build --scope project:web',
            execute:
              'npx --yes --package rapidkit rapidkit workspace run build --scope project:web',
          }),
        ])
      );

      const verify = runCli(dist, ['workspace', 'verify', '--json'], workspaceDir);
      expect(verify.status).toBe(2);
      const verifyJson = parseJsonOutput<{
        schemaVersion: string;
        summary: { verdict: string; exitCode: number };
        steps: Array<{ id: string; status: string }>;
      }>(verify.output);
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
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }, 60_000);
});
