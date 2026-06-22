import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appendHistoryEntry,
  readWorkspaceHistory,
  recordWorkspaceHistory,
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
    await recordWorkspaceHistory(workspacePath, entry('t1', 'ready'), { retention: 5 });
    await recordWorkspaceHistory(workspacePath, entry('t2', 'blocked'), { retention: 5 });

    const reloaded = await readWorkspaceHistory(workspacePath);
    expect(reloaded?.entries).toHaveLength(2);
    expect(reloaded?.entries.at(-1)?.verdict).toBe('blocked');
  });

  it('returns null when no history exists', async () => {
    expect(await readWorkspaceHistory(workspacePath)).toBeNull();
  });
});
