import path from 'node:path';
import fsExtra from 'fs-extra';

import type { WorkspaceVerify } from './workspace-verify.js';

/**
 * Lightweight health/impact history with retention (roadmap 1.21).
 *
 * Each `workspace verify` run appends a compact, deterministic record to a
 * bounded ring buffer so the extension/CI can render trends (verdict, risk,
 * freshness, policy posture) without re-running analysis. The file is capped to
 * `DEFAULT_HISTORY_RETENTION` most-recent entries to keep it cheap to read/write
 * and to avoid unbounded growth.
 */

export const WORKSPACE_HISTORY_SCHEMA_VERSION = 'workspace-intelligence-history.v1' as const;
export const WORKSPACE_HISTORY_PATH = '.rapidkit/reports/workspace-intelligence-history.json';
export const DEFAULT_HISTORY_RETENTION = 50;

export type WorkspaceHistoryEntry = {
  generatedAt: string;
  kind: 'verify';
  verdict: WorkspaceVerify['summary']['verdict'];
  risk: string;
  affectedProjects: number;
  freshness: WorkspaceVerify['freshness']['verdict'];
  gatePassed: boolean;
  blockingReasons: number;
  policyViolations: number;
};

export type WorkspaceHistoryFile = {
  schemaVersion: typeof WORKSPACE_HISTORY_SCHEMA_VERSION;
  retention: number;
  entries: WorkspaceHistoryEntry[];
};

export function historyEntryFromVerify(
  verify: WorkspaceVerify,
  gatePassed: boolean
): WorkspaceHistoryEntry {
  return {
    generatedAt: verify.generatedAt,
    kind: 'verify',
    verdict: verify.summary.verdict,
    risk: verify.impact.risk,
    affectedProjects: verify.impact.affectedProjects,
    freshness: verify.freshness.verdict,
    gatePassed,
    blockingReasons: verify.blockingReasons.length,
    policyViolations: verify.policyViolations.length,
  };
}

export async function readWorkspaceHistory(
  workspacePath: string
): Promise<WorkspaceHistoryFile | null> {
  const filePath = path.join(workspacePath, WORKSPACE_HISTORY_PATH);
  try {
    if (!(await fsExtra.pathExists(filePath))) {
      return null;
    }
    const payload = (await fsExtra.readJson(filePath)) as Partial<WorkspaceHistoryFile>;
    if (
      payload?.schemaVersion !== WORKSPACE_HISTORY_SCHEMA_VERSION ||
      !Array.isArray(payload.entries)
    ) {
      return null;
    }
    return {
      schemaVersion: WORKSPACE_HISTORY_SCHEMA_VERSION,
      retention:
        typeof payload.retention === 'number' ? payload.retention : DEFAULT_HISTORY_RETENTION,
      entries: payload.entries as WorkspaceHistoryEntry[],
    };
  } catch {
    return null;
  }
}

export function appendHistoryEntry(
  existing: WorkspaceHistoryFile | null,
  entry: WorkspaceHistoryEntry,
  retention = DEFAULT_HISTORY_RETENTION
): WorkspaceHistoryFile {
  const cap = Math.max(1, Math.floor(retention));
  const entries = [...(existing?.entries ?? []), entry];
  // Keep only the most-recent `cap` entries (ring buffer).
  const trimmed = entries.slice(Math.max(0, entries.length - cap));
  return {
    schemaVersion: WORKSPACE_HISTORY_SCHEMA_VERSION,
    retention: cap,
    entries: trimmed,
  };
}

export async function recordWorkspaceHistory(
  workspacePath: string,
  entry: WorkspaceHistoryEntry,
  options?: { retention?: number }
): Promise<WorkspaceHistoryFile> {
  const existing = await readWorkspaceHistory(workspacePath);
  const next = appendHistoryEntry(existing, entry, options?.retention ?? DEFAULT_HISTORY_RETENTION);
  const filePath = path.join(workspacePath, WORKSPACE_HISTORY_PATH);
  await fsExtra.ensureDir(path.dirname(filePath));
  await fsExtra.writeJson(filePath, next, { spaces: 2 });
  return next;
}
