import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import fsExtra from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  parseFeedbackStdinPayload,
  readStdinAll,
  recordWorkspaceFeedback,
} from '../workspace-feedback.js';
import { readWorkspaceHistory, WORKSPACE_HISTORY_PATH } from '../workspace-history.js';

let workspacePath: string;

beforeEach(async () => {
  workspacePath = await mkdtemp(path.join(tmpdir(), 'rk-feedback-'));
  await fsExtra.ensureDir(path.join(workspacePath, '.rapidkit', 'reports'));
});

afterEach(async () => {
  await rm(workspacePath, { recursive: true, force: true });
});

describe('workspace feedback (Phase 4.C)', () => {
  it('records agent-action entries in intelligence history', async () => {
    const result = await recordWorkspaceFeedback({
      workspacePath,
      payload: {
        actionId: 'studio-fix-loop',
        scope: 'workspace',
        summary: 'Applied patch and re-verified',
        outcome: 'ok',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.entry?.kind).toBe('agent-action');

    const history = await readWorkspaceHistory(workspacePath);
    expect(history?.entries.at(-1)?.kind).toBe('agent-action');
    expect(await fsExtra.pathExists(path.join(workspacePath, WORKSPACE_HISTORY_PATH))).toBe(true);
  });

  it('rejects invalid payloads', async () => {
    const result = await recordWorkspaceFeedback({
      workspacePath,
      payload: { actionId: 'x' },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Invalid agent-action-outcome payload');
    expect(result.historyPath).toBe(path.join(workspacePath, WORKSPACE_HISTORY_PATH));
  });

  it('parses valid stdin JSON and fails closed for blank or malformed input', () => {
    expect(parseFeedbackStdinPayload('  {"outcome":"ok"}\n')).toEqual({ outcome: 'ok' });
    expect(parseFeedbackStdinPayload('  ')).toBeNull();
    expect(parseFeedbackStdinPayload('{broken')).toBeNull();
  });

  it('reads string and buffer stdin chunks without changing their byte order', async () => {
    const stdin = Readable.from(['{"actionId":', Buffer.from('"agent-1"}')]);
    const stdinSpy = vi.spyOn(process, 'stdin', 'get').mockReturnValue(stdin as never);
    try {
      await expect(readStdinAll()).resolves.toBe('{"actionId":"agent-1"}');
    } finally {
      stdinSpy.mockRestore();
    }
  });
});
