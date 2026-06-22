import crypto from 'node:crypto';

/**
 * Shared freshness metadata for workspace intelligence reports.
 *
 * Every report should be self-describing enough that any consumer (CLI verify,
 * Workspai, CI) can answer "is this report still fresh?" deterministically,
 * without re-running the whole intelligence chain:
 *
 * - `generatedAt`: ISO-8601 timestamp of when the report was produced.
 * - `inputsHash`: stable hash of the inputs that produced the report. If a live
 *   recomputed inputs hash differs from the recorded one, the report is stale.
 *
 * This module is the single source for the freshness envelope and the canonical
 * stable-hash utility. Report builders adopt it (roadmap items 1.6 / 1.9); the
 * `workspace verify` verdict consumes it to gate on staleness.
 */
export const FRESHNESS_METADATA_SCHEMA_VERSION = 'rapidkit-freshness-metadata-v1' as const;

export type FreshnessMetadata = {
  generatedAt: string;
  inputsHash: string;
};

export type FreshnessVerdict = 'fresh' | 'stale' | 'unknown';

/** Deterministically sort object keys so hashing is stable across runs. */
export function stableSort(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableSort(item));
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      output[key] = stableSort((value as Record<string, unknown>)[key]);
    }
    return output;
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableSort(value));
}

/** Canonical stable hash of arbitrary serializable inputs (sha256 hex). */
export function computeInputsHash(value: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function buildFreshnessMetadata(input: {
  inputsHash: string;
  now?: Date;
}): FreshnessMetadata {
  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    inputsHash: input.inputsHash,
  };
}

/**
 * Compare a recorded inputs hash against a freshly recomputed one.
 * Returns `unknown` when either side is missing (e.g. legacy reports).
 */
export function assessFreshness(params: {
  recordedInputsHash?: string | null;
  currentInputsHash?: string | null;
}): FreshnessVerdict {
  const recorded = params.recordedInputsHash?.trim();
  const current = params.currentInputsHash?.trim();
  if (!recorded || !current) {
    return 'unknown';
  }
  return recorded === current ? 'fresh' : 'stale';
}
