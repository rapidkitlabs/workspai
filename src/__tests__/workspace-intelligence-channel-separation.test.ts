import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { ensureDistBuilt } from './helpers/dist';

function runCli(dist: string, args: string[], cwd: string) {
  const childEnv = { ...process.env, CI: '1' };
  delete childEnv.VITEST;
  delete childEnv.VITEST_POOL_ID;
  delete childEnv.VITEST_WORKER_ID;
  delete childEnv.NODE_ENV;
  delete childEnv.NODE_OPTIONS;
  delete childEnv.RAPIDKIT_LOG_FORMAT;

  return spawnSync(process.execPath, [dist, ...args], { cwd, encoding: 'utf8', env: childEnv });
}

function isLocalSpawnBlocked(error: Error | undefined): boolean {
  return !!error && error.message.includes('EPERM') && process.env.CI !== 'true';
}

function setupWorkspace(): { tempDir: string; workspaceDir: string } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rk-wi-channel-'));
  const workspaceDir = path.join(tempDir, 'workspace');
  const apiDir = path.join(workspaceDir, 'services', 'api');

  fs.mkdirSync(path.join(workspaceDir, '.rapidkit'), { recursive: true });
  fs.writeFileSync(
    path.join(workspaceDir, '.rapidkit-workspace'),
    JSON.stringify({ signature: 'RAPIDKIT_WORKSPACE', name: 'workspace', version: 'test' }, null, 2)
  );
  fs.writeFileSync(
    path.join(workspaceDir, '.rapidkit', 'workspace.json'),
    JSON.stringify({ workspace_name: 'workspace', profile: 'polyglot' }, null, 2)
  );
  fs.mkdirSync(path.join(apiDir, '.rapidkit'), { recursive: true });
  fs.writeFileSync(
    path.join(apiDir, '.rapidkit', 'project.json'),
    JSON.stringify({ name: 'api', runtime: 'python', kit_name: 'fastapi.standard' }, null, 2)
  );
  fs.writeFileSync(path.join(apiDir, 'pyproject.toml'), '[project]\nname = "api"\n');

  return { tempDir, workspaceDir };
}

type LogEvent = { schemaVersion?: string; event?: string; component?: string };

function parseNdjson(text: string): LogEvent[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as LogEvent];
      } catch {
        return [];
      }
    });
}

describe('workspace intelligence channel separation (1.4)', () => {
  it('writes the JSON result to stdout and the NDJSON log stream to stderr — never mixed', () => {
    const dist = ensureDistBuilt('workspace intelligence channel separation');
    const { tempDir, workspaceDir } = setupWorkspace();

    try {
      const result = runCli(
        dist,
        ['workspace', 'model', '--json', '--log-format', 'json'],
        workspaceDir
      );
      if (isLocalSpawnBlocked(result.error)) {
        console.warn(
          `Skipping channel separation test: sandbox blocked spawn (${result.error?.message}).`
        );
        return;
      }

      expect(result.status).toBe(0);
      const stdout = result.stdout ?? '';
      const stderr = result.stderr ?? '';

      // --- stdout: exactly one JSON document (the command result), no log events.
      const stdoutParsed = JSON.parse(stdout.trim()) as { workspace?: { name?: string } };
      expect(stdoutParsed.workspace?.name).toBe('workspace');
      expect(stdout).not.toContain('cli-log-event-v1');
      expect(stdout).not.toContain('"event":"run.started"');
      expect(stdout).not.toContain('"event":"progress"');

      // --- stderr: NDJSON log events only, never the model result.
      const events = parseNdjson(stderr);
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        expect(event.schemaVersion).toBe('cli-log-event-v1');
      }
      const eventKinds = events.map((event) => event.event);
      expect(eventKinds).toContain('run.started');
      expect(eventKinds).toContain('progress');
      expect(eventKinds).toContain('run.completed');
      // The model result must not leak onto stderr.
      expect(stderr).not.toContain('"summary"');
      expect(stderr).not.toContain('"identity"');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }, 60_000);

  it('embeds the run stream runId in the persisted artifact for log correlation (1.5)', () => {
    const dist = ensureDistBuilt('workspace intelligence channel separation');
    const { tempDir, workspaceDir } = setupWorkspace();

    try {
      const result = runCli(
        dist,
        ['workspace', 'model', '--write', '--log-format', 'json'],
        workspaceDir
      );
      if (isLocalSpawnBlocked(result.error)) {
        console.warn(
          `Skipping correlation test: sandbox blocked spawn (${result.error?.message}).`
        );
        return;
      }
      expect(result.status).toBe(0);

      // runId reported on the stderr log stream...
      const events = parseNdjson(result.stderr ?? '');
      const started = events.find((event) => event.event === 'run.started') as
        | (LogEvent & { runId?: string })
        | undefined;
      expect(started?.runId).toBeTruthy();

      // ...must match the runId persisted into the on-disk artifact.
      const modelPath = path.join(workspaceDir, '.rapidkit', 'reports', 'workspace-model.json');
      expect(fs.existsSync(modelPath)).toBe(true);
      const persisted = JSON.parse(fs.readFileSync(modelPath, 'utf8')) as { runId?: string };
      expect(persisted.runId).toBe(started?.runId);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }, 60_000);

  it('emits no structured log events when --log-format json is absent (default text mode)', () => {
    const dist = ensureDistBuilt('workspace intelligence channel separation');
    const { tempDir, workspaceDir } = setupWorkspace();

    try {
      const result = runCli(dist, ['workspace', 'model', '--json'], workspaceDir);
      if (isLocalSpawnBlocked(result.error)) {
        console.warn(`Skipping text-mode test: sandbox blocked spawn (${result.error?.message}).`);
        return;
      }

      expect(result.status).toBe(0);
      expect(result.stderr ?? '').not.toContain('cli-log-event-v1');
      const stdoutParsed = JSON.parse((result.stdout ?? '').trim()) as {
        workspace?: { name?: string };
      };
      expect(stdoutParsed.workspace?.name).toBe('workspace');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }, 60_000);
});
