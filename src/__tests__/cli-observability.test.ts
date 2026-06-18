import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLI_LOG_EVENT_SCHEMA_VERSION } from '../contracts/cli-log-event-contract.js';
import {
  buildCliLogEvent,
  emitCliLogEvent,
  resetCliRunIdForTests,
  setCliRunId,
} from '../observability/cli-log-event.js';
import { resolveCliLogFormat } from '../observability/cli-log-format.js';
import {
  finalizeCliRunContext,
  initializeCliRunContext,
  installCliProcessExitHook,
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
    delete process.env.RAPIDKIT_LOG_FORMAT;
  });

  afterEach(() => {
    stderrWrite.mockRestore();
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
