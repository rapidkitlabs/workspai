import type { BlockerResolution } from './blocker-resolution-contract.js';
import { WORKSPACE_EXPLAIN_REPORT_PATH } from './workspace-artifact-paths.js';

export const WORKSPACE_EXPLAIN_SCHEMA_VERSION = 'workspace-explain.v1' as const;

export const WORKSPACE_EXPLAIN_TARGETS = [
  'project',
  'release-blocked',
  'blocker',
  'trace',
] as const;

export type WorkspaceExplainTargetKind = (typeof WORKSPACE_EXPLAIN_TARGETS)[number];

export type WorkspaceExplainTarget =
  | { kind: 'project'; project: string }
  | { kind: 'release-blocked' }
  | { kind: 'blocker'; blockerId: string }
  | { kind: 'trace'; diffRef: string };

export type WorkspaceExplainSection = {
  id: string;
  title: string;
  body: string;
};

export type WorkspaceExplainReport = {
  schemaVersion: typeof WORKSPACE_EXPLAIN_SCHEMA_VERSION;
  generatedAt: string;
  workspacePath: string;
  target: WorkspaceExplainTarget;
  summary: string;
  sections: WorkspaceExplainSection[];
  releaseRisk?: string;
  blockingReasons?: string[];
  resolutionHints?: BlockerResolution[];
};

export { WORKSPACE_EXPLAIN_REPORT_PATH };

export function parseWorkspaceExplainTarget(raw: string): WorkspaceExplainTarget | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }
  if (value === 'release-blocked') {
    return { kind: 'release-blocked' };
  }
  if (value.startsWith('project:')) {
    const project = value.slice('project:'.length).trim();
    return project ? { kind: 'project', project } : null;
  }
  if (value.startsWith('blocker:')) {
    const blockerId = value.slice('blocker:'.length).trim();
    return blockerId ? { kind: 'blocker', blockerId } : null;
  }
  if (value.startsWith('trace:')) {
    const diffRef = value.slice('trace:'.length).trim();
    return diffRef ? { kind: 'trace', diffRef } : null;
  }
  return { kind: 'project', project: value };
}

export function isWorkspaceExplainReport(value: unknown): value is WorkspaceExplainReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === WORKSPACE_EXPLAIN_SCHEMA_VERSION &&
    typeof record.generatedAt === 'string' &&
    typeof record.summary === 'string' &&
    Array.isArray(record.sections) &&
    record.target != null &&
    typeof record.target === 'object' &&
    !Array.isArray(record.target) &&
    typeof (record.target as Record<string, unknown>).kind === 'string'
  );
}
