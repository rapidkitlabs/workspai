export const AGENT_ACTION_OUTCOME_SCHEMA_VERSION = 'agent-action-outcome.v1' as const;

export const AGENT_ACTION_OUTCOMES = ['ok', 'failed'] as const;
export type AgentActionOutcome = (typeof AGENT_ACTION_OUTCOMES)[number];

/** Aligns with extension sidebar audit + aiActionRegistry fields (Phase 4.C). */
export type AgentActionOutcomeRecord = {
  schemaVersion: typeof AGENT_ACTION_OUTCOME_SCHEMA_VERSION;
  generatedAt: string;
  actionId: string;
  scope: string;
  summary: string;
  outcome: AgentActionOutcome;
  affectedFiles?: string[];
  commandsRun?: string[];
  verifyBefore?: string;
  verifyAfter?: string;
  evidenceSha256?: string;
  evidencePath?: string;
};

export function normalizeAgentActionOutcome(value: unknown): AgentActionOutcome | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim() as AgentActionOutcome;
  return AGENT_ACTION_OUTCOMES.includes(normalized) ? normalized : null;
}

export function isAgentActionOutcomeRecord(value: unknown): value is AgentActionOutcomeRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === AGENT_ACTION_OUTCOME_SCHEMA_VERSION &&
    typeof record.actionId === 'string' &&
    typeof record.scope === 'string' &&
    typeof record.summary === 'string' &&
    normalizeAgentActionOutcome(record.outcome) != null
  );
}

export function parseAgentActionOutcomeInput(value: unknown): AgentActionOutcomeRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const outcome = normalizeAgentActionOutcome(record.outcome);
  if (typeof record.actionId !== 'string' || typeof record.summary !== 'string' || !outcome) {
    return null;
  }
  const scope =
    typeof record.scope === 'string' && record.scope.trim() ? record.scope.trim() : 'workspace';
  const generatedAt =
    typeof record.generatedAt === 'string' && record.generatedAt.trim()
      ? record.generatedAt.trim()
      : new Date().toISOString();
  return {
    schemaVersion: AGENT_ACTION_OUTCOME_SCHEMA_VERSION,
    generatedAt,
    actionId: record.actionId.trim(),
    scope,
    summary: record.summary.trim(),
    outcome,
    ...(Array.isArray(record.affectedFiles)
      ? {
          affectedFiles: record.affectedFiles.filter(
            (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
          ),
        }
      : {}),
    ...(Array.isArray(record.commandsRun)
      ? {
          commandsRun: record.commandsRun.filter(
            (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
          ),
        }
      : {}),
    ...(typeof record.verifyBefore === 'string' ? { verifyBefore: record.verifyBefore } : {}),
    ...(typeof record.verifyAfter === 'string' ? { verifyAfter: record.verifyAfter } : {}),
    ...(typeof record.evidenceSha256 === 'string' ? { evidenceSha256: record.evidenceSha256 } : {}),
    ...(typeof record.evidencePath === 'string' ? { evidencePath: record.evidencePath } : {}),
  };
}
