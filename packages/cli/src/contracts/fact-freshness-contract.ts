import { computeInputsHash, type FreshnessVerdict } from './freshness-metadata-contract.js';

export const FACT_FRESHNESS_SCHEMA_VERSION = 'rapidkit-fact-freshness-v1' as const;

export type FactFreshnessKind =
  'durable' | 'derived' | 'evidence-backed' | 'live' | 'verify-before-use';

export type FactFreshnessCategory = 'structure' | 'verification' | 'state';

export type WorkspaceFactScope =
  'workspace' | 'project' | 'evidence' | 'policy' | 'contract' | 'command' | 'graph';

export type FactFreshnessContract = {
  schemaVersion: typeof FACT_FRESHNESS_SCHEMA_VERSION;
  kind: FactFreshnessKind;
  category: FactFreshnessCategory;
  generatedAt: string;
  ttlSeconds: number | null;
  expiresAt?: string;
  status: FreshnessVerdict;
  verifyBeforeUse: boolean;
  sourceArtifact?: string;
  sourcePath?: string;
  inputsHash?: string;
  reason: string;
};

export type WorkspaceFact = {
  id: string;
  label: string;
  scope: WorkspaceFactScope;
  value: unknown;
  freshness: FactFreshnessContract;
  project?: string;
};

export type FactFreshnessSummary = {
  schemaVersion: typeof FACT_FRESHNESS_SCHEMA_VERSION;
  generatedAt: string;
  status: FreshnessVerdict;
  totalFacts: number;
  staleFacts: number;
  unknownFacts: number;
  liveFacts: number;
  verifyBeforeUseFacts: number;
  byKind: Record<FactFreshnessKind, number>;
  byCategory: Record<FactFreshnessCategory, number>;
};

export const FACT_FRESHNESS_TTL_SECONDS = {
  durable: 30 * 24 * 60 * 60,
  derived: 7 * 24 * 60 * 60,
  evidenceBacked: 24 * 60 * 60,
  live: 5 * 60,
  verifyBeforeUse: 24 * 60 * 60,
} as const;

function ttlForKind(kind: FactFreshnessKind): number | null {
  switch (kind) {
    case 'durable':
      return FACT_FRESHNESS_TTL_SECONDS.durable;
    case 'derived':
      return FACT_FRESHNESS_TTL_SECONDS.derived;
    case 'evidence-backed':
      return FACT_FRESHNESS_TTL_SECONDS.evidenceBacked;
    case 'live':
      return FACT_FRESHNESS_TTL_SECONDS.live;
    case 'verify-before-use':
      return FACT_FRESHNESS_TTL_SECONDS.verifyBeforeUse;
  }
}

function resolveStatus(input: {
  generatedAt: string;
  ttlSeconds: number | null;
  status?: FreshnessVerdict;
  now: Date;
}): FreshnessVerdict {
  if (input.status) {
    return input.status;
  }
  if (input.ttlSeconds === null) {
    return 'unknown';
  }
  const generatedTime = Date.parse(input.generatedAt);
  if (!Number.isFinite(generatedTime)) {
    return 'unknown';
  }
  const expiresAt = generatedTime + input.ttlSeconds * 1000;
  return input.now.getTime() > expiresAt ? 'stale' : 'fresh';
}

export function buildFactFreshnessContract(input: {
  kind: FactFreshnessKind;
  category: FactFreshnessCategory;
  generatedAt?: string;
  now?: Date;
  ttlSeconds?: number | null;
  status?: FreshnessVerdict;
  verifyBeforeUse?: boolean;
  sourceArtifact?: string;
  sourcePath?: string;
  inputsHash?: string;
  value?: unknown;
  reason: string;
}): FactFreshnessContract {
  const now = input.now ?? new Date();
  const generatedAt = input.generatedAt ?? now.toISOString();
  const ttlSeconds = input.ttlSeconds === undefined ? ttlForKind(input.kind) : input.ttlSeconds;
  const status = resolveStatus({
    generatedAt,
    ttlSeconds,
    status: input.status,
    now,
  });
  const expiresAt =
    ttlSeconds === null ? undefined : new Date(Date.parse(generatedAt) + ttlSeconds * 1000);
  const verifyBeforeUse =
    input.verifyBeforeUse ??
    (input.kind === 'live' ||
      input.kind === 'verify-before-use' ||
      input.category !== 'structure' ||
      status !== 'fresh');

  return {
    schemaVersion: FACT_FRESHNESS_SCHEMA_VERSION,
    kind: input.kind,
    category: input.category,
    generatedAt,
    ttlSeconds,
    ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}),
    status,
    verifyBeforeUse,
    ...(input.sourceArtifact ? { sourceArtifact: input.sourceArtifact } : {}),
    ...(input.sourcePath ? { sourcePath: input.sourcePath } : {}),
    inputsHash: input.inputsHash ?? computeInputsHash(input.value ?? null),
    reason: input.reason,
  };
}

export function buildWorkspaceFact(input: {
  id: string;
  label: string;
  scope: WorkspaceFactScope;
  value: unknown;
  project?: string;
  freshness: Omit<Parameters<typeof buildFactFreshnessContract>[0], 'value'>;
}): WorkspaceFact {
  return {
    id: input.id,
    label: input.label,
    scope: input.scope,
    value: input.value,
    ...(input.project ? { project: input.project } : {}),
    freshness: buildFactFreshnessContract({ ...input.freshness, value: input.value }),
  };
}

export function summarizeFactFreshness(input: {
  facts: WorkspaceFact[];
  generatedAt?: string;
  now?: Date;
}): FactFreshnessSummary {
  const generatedAt = input.generatedAt ?? (input.now ?? new Date()).toISOString();
  const byKind: Record<FactFreshnessKind, number> = {
    durable: 0,
    derived: 0,
    'evidence-backed': 0,
    live: 0,
    'verify-before-use': 0,
  };
  const byCategory: Record<FactFreshnessCategory, number> = {
    structure: 0,
    verification: 0,
    state: 0,
  };
  let staleFacts = 0;
  let unknownFacts = 0;
  let liveFacts = 0;
  let verifyBeforeUseFacts = 0;

  for (const fact of input.facts) {
    byKind[fact.freshness.kind] += 1;
    byCategory[fact.freshness.category] += 1;
    if (fact.freshness.status === 'stale') staleFacts += 1;
    if (fact.freshness.status === 'unknown') unknownFacts += 1;
    if (fact.freshness.kind === 'live') liveFacts += 1;
    if (fact.freshness.verifyBeforeUse) verifyBeforeUseFacts += 1;
  }

  return {
    schemaVersion: FACT_FRESHNESS_SCHEMA_VERSION,
    generatedAt,
    status: staleFacts > 0 ? 'stale' : unknownFacts > 0 ? 'unknown' : 'fresh',
    totalFacts: input.facts.length,
    staleFacts,
    unknownFacts,
    liveFacts,
    verifyBeforeUseFacts,
    byKind,
    byCategory,
  };
}
