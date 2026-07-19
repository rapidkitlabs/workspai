import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildCliLogEvent,
  emitCliLogEvent,
  getCliRunId,
  resetCliRunIdForTests,
  sanitizeMetadata,
  setCliRunId,
} from '../observability/cli-log-event.js';
import {
  detectNodePackageManager,
  formatNodeInstallCommand,
  formatNodeScriptCommand,
} from '../utils/node-package-manager.js';

const roots: string[] = [];

describe('previously low-coverage utility boundaries', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    resetCliRunIdForTests();
    delete process.env.WORKSPAI_LOG_FORMAT;
    delete process.env.RAPIDKIT_LOG_FORMAT;
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it('detects every Node package-manager marker in precedence order', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-package-manager-'));
    roots.push(root);
    expect(detectNodePackageManager(root)).toBe('npm');
    await fs.writeFile(path.join(root, 'package-lock.json'), '');
    expect(detectNodePackageManager(root)).toBe('npm');
    await fs.writeFile(path.join(root, 'yarn.lock'), '');
    expect(detectNodePackageManager(root)).toBe('yarn');
    await fs.writeFile(path.join(root, 'pnpm-lock.yaml'), '');
    expect(detectNodePackageManager(root)).toBe('pnpm');
    await fs.writeFile(path.join(root, 'bun.lock'), '');
    expect(detectNodePackageManager(root)).toBe('bun');
    expect(formatNodeScriptCommand(root, 'test', 'npm')).toBe('npm run test');
    expect(formatNodeScriptCommand(root, 'build', 'pnpm')).toBe('pnpm run build');
    expect(formatNodeInstallCommand(root, 'yarn')).toBe('yarn install');
    expect(formatNodeInstallCommand(root)).toBe('bun install');
  });

  it('builds, sanitizes, emits, and resets structured CLI log events', () => {
    setCliRunId('run-1');
    expect(getCliRunId()).toBe('run-1');
    const metadata = sanitizeMetadata({
      omitted: undefined,
      error: new TypeError('bad'),
      nil: null,
      text: 'value',
      count: 2,
      enabled: true,
      array: ['x', 1, false, null, { nested: true }],
      object: { nested: true },
    });
    expect(metadata).not.toHaveProperty('omitted');
    expect(metadata.error).toEqual({ name: 'TypeError', message: 'bad' });
    expect(metadata.array).toEqual(['x', 1, false, 'null', '[object Object]']);
    expect(metadata.object).toBe('[object Object]');
    const event = buildCliLogEvent({
      level: 'info',
      event: 'run.started',
      component: 'test',
      message: 'started',
      command: ['doctor'],
      metadata: { error: new TypeError('bad'), count: 2 },
    });
    expect(event).toMatchObject({
      runId: 'run-1',
      command: ['doctor'],
      metadata: { error: { name: 'TypeError', message: 'bad' }, count: 2 },
    });
    expect(
      buildCliLogEvent({
        level: 'info',
        event: 'run.started',
        component: 'test',
        message: 'x',
        metadata: {},
      })
    ).not.toHaveProperty('metadata');

    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    emitCliLogEvent({ level: 'info', event: 'run.started', component: 'test', message: 'hidden' });
    expect(write).not.toHaveBeenCalled();
    process.env.WORKSPAI_LOG_FORMAT = 'json';
    emitCliLogEvent({ level: 'error', event: 'run.failed', component: 'test', message: 'visible' });
    expect(write).toHaveBeenCalledOnce();
    resetCliRunIdForTests();
    expect(getCliRunId()).toBe('unknown-run');
  });
});
