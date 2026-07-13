import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appendHistoryEntry,
  normalizeHistoryEntry,
  readWorkspaceHistory,
  recordWorkspaceHistory,
  WORKSPACE_HISTORY_PATH,
  WORKSPACE_HISTORY_SCHEMA_VERSION,
  type WorkspaceHistoryEntry,
} from '../workspace-history.js';

function entry(
  generatedAt: string,
  verdict: WorkspaceHistoryEntry['verdict']
): WorkspaceHistoryEntry {
  return {
    generatedAt,
    kind: 'verify',
    verdict,
    risk: 'low',
    affectedProjects: 1,
    freshness: 'fresh',
    gatePassed: verdict === 'ready',
    blockingReasons: 0,
    policyViolations: 0,
  };
}

let workspacePath: string;

beforeEach(async () => {
  workspacePath = await mkdtemp(path.join(tmpdir(), 'rk-history-'));
});

afterEach(async () => {
  await rm(workspacePath, { recursive: true, force: true });
});

describe('workspace intelligence history (1.21)', () => {
  it('appends entries and enforces retention as a ring buffer', () => {
    let file = appendHistoryEntry(null, entry('t1', 'ready'), 3);
    file = appendHistoryEntry(file, entry('t2', 'ready'), 3);
    file = appendHistoryEntry(file, entry('t3', 'needs-attention'), 3);
    file = appendHistoryEntry(file, entry('t4', 'blocked'), 3);

    expect(file.entries).toHaveLength(3);
    // Oldest (t1) dropped; most-recent retained in order.
    expect(file.entries.map((e) => e.generatedAt)).toEqual(['t2', 't3', 't4']);
    expect(file.retention).toBe(3);
    expect(file.schemaVersion).toBe(WORKSPACE_HISTORY_SCHEMA_VERSION);
  });

  it('persists and reloads history across runs', async () => {
    await recordWorkspaceHistory(workspacePath, entry('2026-07-13T00:00:00.000Z', 'ready'), {
      retention: 5,
    });
    await recordWorkspaceHistory(workspacePath, entry('2026-07-13T00:01:00.000Z', 'blocked'), {
      retention: 5,
    });

    const reloaded = await readWorkspaceHistory(workspacePath);
    expect(reloaded?.entries).toHaveLength(2);
    expect(reloaded?.entries.at(-1)?.verdict).toBe('blocked');
  });

  it('does not lose entries during concurrent updates', async () => {
    const entries = Array.from({ length: 20 }, (_, index) =>
      entry(`2026-07-12T00:00:${String(index).padStart(2, '0')}.000Z`, 'ready')
    );

    await Promise.all(entries.map((item) => recordWorkspaceHistory(workspacePath, item)));

    const reloaded = await readWorkspaceHistory(workspacePath);
    expect(reloaded?.entries).toHaveLength(entries.length);
    expect(new Set(reloaded?.entries.map((item) => item.generatedAt))).toEqual(
      new Set(entries.map((item) => item.generatedAt))
    );
    await expect(
      readFile(path.join(workspacePath, `${WORKSPACE_HISTORY_PATH}.lock`), 'utf8')
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves corrupt history instead of silently replacing it', async () => {
    const historyPath = path.join(workspacePath, WORKSPACE_HISTORY_PATH);
    await mkdir(path.dirname(historyPath), { recursive: true });
    await writeFile(historyPath, '{broken-json', 'utf8');

    await expect(recordWorkspaceHistory(workspacePath, entry('t1', 'ready'))).rejects.toThrow(
      /refusing to overwrite/i
    );
    expect(await readFile(historyPath, 'utf8')).toBe('{broken-json');
  });

  it('returns null when no history exists', async () => {
    expect(await readWorkspaceHistory(workspacePath)).toBeNull();
  });

  it('normalizes legacy verify entries without kind', () => {
    const legacy = normalizeHistoryEntry({
      generatedAt: 't0',
      verdict: 'ready',
      risk: 'low',
      affectedProjects: 0,
      freshness: 'fresh',
      gatePassed: true,
      blockingReasons: 0,
      policyViolations: 0,
    });
    expect(legacy?.kind).toBe('verify');
  });
});
