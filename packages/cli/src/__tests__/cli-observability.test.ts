import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLI_LOG_EVENT_SCHEMA_VERSION } from '../contracts/cli-log-event-contract.js';
import {
  buildCliLogEvent,
  emitCliLogEvent,
  resetCliRunIdForTests,
  setCliRunId,
} from '../observability/cli-log-event.js';
import { isCliJsonLogFormat, resolveCliLogFormat } from '../observability/cli-log-format.js';
import { emitWorkspacePhase } from '../observability/cli-progress.js';
import {
  isWorkspaceIntelligenceSubcommand,
  isWorkspaceSubcommand,
  WORKSPACE_SUBCOMMANDS,
} from '../utils/workspace-command-surface.js';
import {
  finalizeCliRunContext,
  initializeCliRunContext,
  installCliProcessExitHook,
  normalizeObservabilityInvocation,
  resetCliProcessExitHookForTests,
  resetCliRunContextForTests,
} from '../observability/cli-run-context.js';

describe('cli observability', () => {
  let stderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    resetCliRunContextForTests();
    resetCliProcessExitHookForTests();
    resetCliRunIdForTests();
    delete process.env.WORKSPAI_LOG_FORMAT;
    delete process.env.RAPIDKIT_LOG_FORMAT;
  });

  afterEach(() => {
    stderrWrite.mockRestore();
    delete process.env.WORKSPAI_LOG_FORMAT;
    delete process.env.RAPIDKIT_LOG_FORMAT;
    resetCliRunContextForTests();
    resetCliProcessExitHookForTests();
    resetCliRunIdForTests();
  });

  it('defaults to text log format', () => {
    expect(resolveCliLogFormat(['node', 'rapidkit', 'create'])).toBe('text');
  });

  it('resolves json log format from env and argv', () => {
    process.env.RAPIDKIT_LOG_FORMAT = 'json';
    expect(resolveCliLogFormat(['node', 'rapidkit', 'create'])).toBe('json');

    delete process.env.RAPIDKIT_LOG_FORMAT;
    expect(resolveCliLogFormat(['node', 'rapidkit', '--log-format', 'json', 'create'])).toBe(
      'json'
    );
    expect(resolveCliLogFormat(['node', 'rapidkit', '--log-json', 'create'])).toBe('json');
  });

  it('normalizes every text/json form and gives canonical env precedence', () => {
    process.env.WORKSPAI_LOG_FORMAT = ' TEXT ';
    process.env.RAPIDKIT_LOG_FORMAT = 'json';
    expect(resolveCliLogFormat(['node', 'workspai', '--log-json'])).toBe('text');

    process.env.WORKSPAI_LOG_FORMAT = 'invalid';
    delete process.env.RAPIDKIT_LOG_FORMAT;
    expect(resolveCliLogFormat(['node', 'workspai', '--log-format=text'])).toBe('text');
    expect(resolveCliLogFormat(['node', 'workspai', '--log-format=json'])).toBe('json');
    expect(resolveCliLogFormat(['node', 'workspai', '--log-format', ' TEXT '])).toBe('text');
    expect(resolveCliLogFormat(['node', 'workspai', '--log-format', 'invalid'])).toBe('text');
    expect(isCliJsonLogFormat(['node', 'workspai', '--log-format=json'])).toBe(true);
    expect(isCliJsonLogFormat(['node', 'workspai'])).toBe(false);
  });

  it('recognizes the complete workspace command surface and rejects unknown actions', () => {
    for (const action of WORKSPACE_SUBCOMMANDS) {
      expect(isWorkspaceSubcommand(action), action).toBe(true);
    }
    expect(isWorkspaceSubcommand('unknown')).toBe(false);
    expect(isWorkspaceIntelligenceSubcommand('unknown')).toBe(false);
  });

  it('builds schema-compliant log events', () => {
    setCliRunId('run-test-12345678');
    const event = buildCliLogEvent({
      level: 'info',
      event: 'log',
      component: 'create',
      message: 'hello',
      metadata: { phase: 'workspace.install.pypi' },
    });

    expect(event.schemaVersion).toBe(CLI_LOG_EVENT_SCHEMA_VERSION);
    expect(event.runId).toBe('run-test-12345678');
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('emits run.started and run.completed on stderr as NDJSON', () => {
    process.env.RAPIDKIT_LOG_FORMAT = 'json';

    initializeCliRunContext({
      argv: ['node', 'rapidkit', '--log-format', 'json', 'create', 'workspace'],
      cwd: '/tmp/tests',
      rapidkitVersion: '0.36.0',
    });

    finalizeCliRunContext(0);

    expect(stderrWrite).toHaveBeenCalledTimes(2);
    const started = JSON.parse(String(stderrWrite.mock.calls[0][0]).trim());
    const completed = JSON.parse(String(stderrWrite.mock.calls[1][0]).trim());

    expect(started.event).toBe('run.started');
    expect(started.command).toEqual(['create', 'workspace']);
    expect(completed.event).toBe('run.completed');
    expect(completed.metadata.exitCode).toBe(0);
  });

  it('emits run.failed for non-zero exit codes', () => {
    process.env.RAPIDKIT_LOG_FORMAT = 'json';

    initializeCliRunContext({
      argv: ['node', 'rapidkit', 'doctor'],
      cwd: '/tmp/tests',
      rapidkitVersion: '0.36.0',
    });
    finalizeCliRunContext(2, 'doctor blocked');

    const failed = JSON.parse(String(stderrWrite.mock.calls[1][0]).trim());
    expect(failed.event).toBe('run.failed');
    expect(failed.level).toBe('error');
    expect(failed.metadata.exitCode).toBe(2);
    expect(failed.message).toBe('doctor blocked');
  });

  it('does not write structured logs in text mode', () => {
    initializeCliRunContext({
      argv: ['node', 'rapidkit', 'create'],
      cwd: '/tmp/tests',
      rapidkitVersion: '0.36.0',
    });
    emitCliLogEvent({
      level: 'info',
      event: 'log',
      component: 'cli',
      message: 'ignored in text mode',
    });
    finalizeCliRunContext(0);

    expect(stderrWrite).not.toHaveBeenCalled();
  });

  it('emits a structured progress event for workspace intelligence phases (1.3)', () => {
    process.env.RAPIDKIT_LOG_FORMAT = 'json';
    setCliRunId('run-ws-12345678');

    emitWorkspacePhase({
      action: 'verify',
      status: 'started',
      message: 'workspace verify started',
      metadata: { json: true, strict: true },
    });

    expect(stderrWrite).toHaveBeenCalledTimes(1);
    const event = JSON.parse(String(stderrWrite.mock.calls[0][0]).trim());
    expect(event.schemaVersion).toBe(CLI_LOG_EVENT_SCHEMA_VERSION);
    expect(event.event).toBe('progress');
    expect(event.component).toBe('workspace');
    expect(event.runId).toBe('run-ws-12345678');
    expect(event.metadata.phase).toBe('workspace.verify');
    expect(event.metadata.action).toBe('verify');
    expect(event.metadata.status).toBe('started');
    expect(event.metadata.json).toBe(true);
    expect(event.metadata.strict).toBe(true);
  });

  it('maps failed/warn workspace phases to the matching log level', () => {
    process.env.RAPIDKIT_LOG_FORMAT = 'json';

    emitWorkspacePhase({ action: 'impact', status: 'failed', message: 'impact failed' });
    emitWorkspacePhase({ action: 'diff', status: 'warn', message: 'diff warning' });

    const failed = JSON.parse(String(stderrWrite.mock.calls[0][0]).trim());
    const warned = JSON.parse(String(stderrWrite.mock.calls[1][0]).trim());
    expect(failed.level).toBe('error');
    expect(warned.level).toBe('warn');
  });

  it('does not emit workspace phase events in text mode', () => {
    emitWorkspacePhase({ action: 'model', status: 'started', message: 'model started' });
    expect(stderrWrite).not.toHaveBeenCalled();
  });

  it('instruments every canonical intelligence subcommand', () => {
    for (const action of [
      'model',
      'snapshot',
      'diff',
      'impact',
      'verify',
      'context',
      'agent-sync',
    ]) {
      expect(isWorkspaceIntelligenceSubcommand(action), action).toBe(true);
    }
  });

  describe('normalizeObservabilityInvocation (1.3/1.4)', () => {
    let originalArgv: string[];

    beforeEach(() => {
      originalArgv = process.argv;
    });

    afterEach(() => {
      process.argv = originalArgv;
    });

    it('makes --log-format json sticky via env and strips the flag from argv', () => {
      process.argv = ['node', 'rapidkit', 'workspace', 'model', '--log-format', 'json', '--json'];
      normalizeObservabilityInvocation(process.argv);

      expect(process.env.RAPIDKIT_LOG_FORMAT).toBe('json');
      // The observability flag is stripped so commander never sees it...
      expect(process.argv).toEqual(['node', 'rapidkit', 'workspace', 'model', '--json']);
      // ...but the result flag (--json) is preserved for channel separation.
      expect(process.argv).toContain('--json');
    });

    it('strips --log-json alias too', () => {
      process.argv = ['node', 'rapidkit', 'workspace', 'verify', '--log-json'];
      normalizeObservabilityInvocation(process.argv);
      expect(process.env.RAPIDKIT_LOG_FORMAT).toBe('json');
      expect(process.argv).toEqual(['node', 'rapidkit', 'workspace', 'verify']);
    });

    it('leaves argv untouched in text mode', () => {
      process.argv = ['node', 'rapidkit', 'workspace', 'model'];
      normalizeObservabilityInvocation(process.argv);
      expect(process.argv).toEqual(['node', 'rapidkit', 'workspace', 'model']);
    });
  });

  it('finalizes run context when process.exit is hooked', () => {
    process.env.RAPIDKIT_LOG_FORMAT = 'json';

    const originalExit = process.exit;
    const exitMock = vi.fn((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    });
    process.exit = exitMock as typeof process.exit;

    try {
      initializeCliRunContext({
        argv: ['node', 'rapidkit', 'doctor'],
        cwd: '/tmp/tests',
        rapidkitVersion: '0.36.0',
      });

      installCliProcessExitHook({ force: true });

      expect(() => process.exit(3)).toThrow('exit:3');
      expect(exitMock).toHaveBeenCalledWith(3);

      const failed = JSON.parse(String(stderrWrite.mock.calls[1][0]).trim());
      expect(failed.event).toBe('run.failed');
      expect(failed.metadata.exitCode).toBe(3);
    } finally {
      process.exit = originalExit;
    }
  });
});
