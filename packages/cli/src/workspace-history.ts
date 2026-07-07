import fsExtra from 'fs-extra';

import type { WorkspaceVerify } from './workspace-verify.js';
import type { AgentActionOutcomeRecord } from './contracts/agent-action-outcome-contract.js';
import type { DoctorFixExecutionResult } from './contracts/doctor-fix-result-contract.js';
import {
  firstExistingWorkspaceArtifactPath,
  writeWorkspaceArtifactJson,
} from './utils/artifact-path-compat.js';

/**
 * Lightweight health/impact history with retention (roadmap 1.21).
 *
 * Each `workspace verify` run appends a compact, deterministic record to a
 * bounded ring buffer so the extension/CI can render trends (verdict, risk,
 * freshness, policy posture) without re-running analysis. The file is capped to
 * `DEFAULT_HISTORY_RETENTION` most-recent entries to keep it cheap to read/write
 * and to avoid unbounded growth.
 *
 * Later phases add optional `kind: agent-action` and `kind: doctor-fix`
 * entries (additive; readers ignore unknown kinds).
 */

export const WORKSPACE_HISTORY_SCHEMA_VERSION = 'workspace-intelligence-history.v1' as const;
export const WORKSPACE_HISTORY_PATH = '.workspai/reports/workspace-intelligence-history.json';
export const DEFAULT_HISTORY_RETENTION = 50;

export type WorkspaceHistoryEntryKind = 'verify' | 'agent-action' | 'doctor-fix';

export type WorkspaceHistoryVerifyEntry = {
  /** Omitted on legacy entries; treat as `verify`. */
  kind?: 'verify';
  generatedAt: string;
  verdict: WorkspaceVerify['summary']['verdict'];
  risk: string;
  affectedProjects: number;
  freshness: WorkspaceVerify['freshness']['verdict'];
  gatePassed: boolean;
  blockingReasons: number;
  policyViolations: number;
};

export type WorkspaceHistoryAgentActionEntry = {
  kind: 'agent-action';
  generatedAt: string;
  actionId: string;
  scope: string;
  summary: string;
  outcome: 'ok' | 'failed';
  evidenceSha256?: string;
};

export type WorkspaceHistoryDoctorFixEntry = {
  kind: 'doctor-fix';
  generatedAt: string;
  scope: 'workspace' | 'project';
  summary: string;
  outcome: 'ok' | 'failed';
  applied: number;
  failed: number;
  skipped: number;
  remainingBlockers: number;
};

export type WorkspaceHistoryEntry =
  WorkspaceHistoryVerifyEntry | WorkspaceHistoryAgentActionEntry | WorkspaceHistoryDoctorFixEntry;

export type WorkspaceHistoryFile = {
  schemaVersion: typeof WORKSPACE_HISTORY_SCHEMA_VERSION;
  retention: number;
  entries: WorkspaceHistoryEntry[];
};

export function normalizeHistoryEntry(raw: unknown): WorkspaceHistoryEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.generatedAt !== 'string') {
    return null;
  }
  if (record.kind === 'agent-action') {
    if (
      typeof record.actionId !== 'string' ||
      typeof record.summary !== 'string' ||
      (record.outcome !== 'ok' && record.outcome !== 'failed')
    ) {
      return null;
    }
    return {
      kind: 'agent-action',
      generatedAt: record.generatedAt,
      actionId: record.actionId,
      scope: typeof record.scope === 'string' ? record.scope : 'workspace',
      summary: record.summary,
      outcome: record.outcome,
      ...(typeof record.evidenceSha256 === 'string'
        ? { evidenceSha256: record.evidenceSha256 }
        : {}),
    };
  }
  if (record.kind === 'doctor-fix') {
    if (
      (record.scope !== 'workspace' && record.scope !== 'project') ||
      typeof record.summary !== 'string' ||
      (record.outcome !== 'ok' && record.outcome !== 'failed')
    ) {
      return null;
    }
    return {
      kind: 'doctor-fix',
      generatedAt: record.generatedAt,
      scope: record.scope,
      summary: record.summary,
      outcome: record.outcome,
      applied: typeof record.applied === 'number' ? record.applied : 0,
      failed: typeof record.failed === 'number' ? record.failed : 0,
      skipped: typeof record.skipped === 'number' ? record.skipped : 0,
      remainingBlockers:
        typeof record.remainingBlockers === 'number' ? record.remainingBlockers : 0,
    };
  }
  if (
    typeof record.verdict !== 'string' ||
    typeof record.risk !== 'string' ||
    typeof record.gatePassed !== 'boolean'
  ) {
    return null;
  }
  return {
    kind: 'verify',
    generatedAt: record.generatedAt,
    verdict: record.verdict as WorkspaceVerify['summary']['verdict'],
    risk: String(record.risk),
    affectedProjects: typeof record.affectedProjects === 'number' ? record.affectedProjects : 0,
    freshness: (record.freshness as WorkspaceVerify['freshness']['verdict']) ?? 'unknown',
    gatePassed: record.gatePassed,
    blockingReasons: typeof record.blockingReasons === 'number' ? record.blockingReasons : 0,
    policyViolations: typeof record.policyViolations === 'number' ? record.policyViolations : 0,
  };
}

export function historyEntryFromVerify(
  verify: WorkspaceVerify,
  gatePassed: boolean
): WorkspaceHistoryVerifyEntry {
  return {
    kind: 'verify',
    generatedAt: verify.generatedAt,
    verdict: verify.summary.verdict,
    risk: verify.impact.risk,
    affectedProjects: verify.impact.affectedProjects,
    freshness: verify.freshness.verdict,
    gatePassed,
    blockingReasons: verify.blockingReasons.length,
    policyViolations: verify.policyViolations.length,
  };
}

export function historyEntryFromAgentAction(
  outcome: AgentActionOutcomeRecord
): WorkspaceHistoryAgentActionEntry {
  return {
    kind: 'agent-action',
    generatedAt: outcome.generatedAt,
    actionId: outcome.actionId,
    scope: outcome.scope,
    summary: outcome.summary,
    outcome: outcome.outcome,
    ...(outcome.evidenceSha256 ? { evidenceSha256: outcome.evidenceSha256 } : {}),
  };
}

export function historyEntryFromDoctorFixResult(
  result: DoctorFixExecutionResult,
  scope: 'workspace' | 'project'
): WorkspaceHistoryDoctorFixEntry {
  const applied = result.appliedFixes.filter((fix) => fix.outcome === 'applied').length;
  const failed = result.appliedFixes.filter((fix) => fix.outcome === 'failed').length;
  const skipped = result.appliedFixes.filter((fix) => fix.outcome === 'skipped').length;
  const guidance = result.appliedFixes.filter((fix) => fix.outcome === 'guidance').length;
  const remainingBlockers = result.remainingBlockers.length;
  const outcome = failed > 0 || remainingBlockers > 0 ? 'failed' : 'ok';
  return {
    kind: 'doctor-fix',
    generatedAt: result.generatedAt,
    scope,
    summary: `${applied} applied, ${failed} failed, ${skipped} skipped, ${guidance} guidance, ${remainingBlockers} blocker(s) remaining`,
    outcome,
    applied,
    failed,
    skipped,
    remainingBlockers,
  };
}

export async function readWorkspaceHistory(
  workspacePath: string
): Promise<WorkspaceHistoryFile | null> {
  const filePath = await firstExistingWorkspaceArtifactPath(workspacePath, WORKSPACE_HISTORY_PATH);
  try {
    if (!filePath || !(await fsExtra.pathExists(filePath))) {
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
      entries: payload.entries
        .map((entry) => normalizeHistoryEntry(entry))
        .filter((entry): entry is WorkspaceHistoryEntry => entry != null),
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
  await writeWorkspaceArtifactJson(workspacePath, WORKSPACE_HISTORY_PATH, next);
  return next;
}
