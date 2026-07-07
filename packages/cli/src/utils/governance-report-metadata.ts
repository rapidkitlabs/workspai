import { getCliRunContext } from '../observability/cli-run-context.js';

export type GovernanceRunMetadata = {
  commandId: string;
  exitCode: number;
  generatedAt: string;
  blockers?: string[];
  stderrTail?: string;
  runId?: string;
};

export const GOVERNANCE_STDERR_TAIL_MAX = 1600;

export function truncateStderrTail(text: string, max = GOVERNANCE_STDERR_TAIL_MAX): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return trimmed.slice(-max);
}

export function resolveGovernanceRunId(): string | undefined {
  return getCliRunContext()?.runId;
}

export function withGovernanceRunMetadata<T extends Record<string, unknown>>(
  payload: T,
  meta: GovernanceRunMetadata
): T & GovernanceRunMetadata {
  const { blockers, stderrTail, runId, generatedAt: metaGeneratedAt, ...restMeta } = meta;
  const generatedAt =
    metaGeneratedAt ||
    (typeof payload.generatedAt === 'string' ? payload.generatedAt : undefined) ||
    (typeof payload.timestamp === 'string' ? payload.timestamp : undefined) ||
    new Date().toISOString();

  return {
    ...payload,
    ...restMeta,
    generatedAt,
    ...(blockers && blockers.length > 0 ? { blockers } : {}),
    ...(stderrTail && stderrTail.trim() ? { stderrTail: stderrTail.trim() } : {}),
    ...(runId ? { runId } : {}),
  };
}

export function collectStringBlockers(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, limit);
}
