import { describe, expect, it } from 'vitest';

import {
  assessFreshness,
  buildFreshnessMetadata,
  computeInputsHash,
  FRESHNESS_METADATA_SCHEMA_VERSION,
  stableStringify,
} from '../../contracts/freshness-metadata-contract.js';

describe('freshness metadata contract', () => {
  it('pins the schema version', () => {
    expect(FRESHNESS_METADATA_SCHEMA_VERSION).toBe('rapidkit-freshness-metadata-v1');
  });

  it('produces a stable hash regardless of key order', () => {
    const a = computeInputsHash({ b: 1, a: [3, 2, 1], nested: { y: 1, x: 2 } });
    const b = computeInputsHash({ a: [3, 2, 1], nested: { x: 2, y: 1 }, b: 1 });
    expect(a).toBe(b);
  });

  it('changes the hash when inputs change', () => {
    expect(computeInputsHash({ projects: 1 })).not.toBe(computeInputsHash({ projects: 2 }));
  });

  it('stableStringify sorts object keys deterministically', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('builds a freshness envelope with generatedAt + inputsHash', () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const meta = buildFreshnessMetadata({ inputsHash: 'abc123', now });
    expect(meta).toEqual({ generatedAt: '2026-06-22T00:00:00.000Z', inputsHash: 'abc123' });
  });

  describe('assessFreshness', () => {
    it('returns fresh when hashes match', () => {
      expect(assessFreshness({ recordedInputsHash: 'hash-x', currentInputsHash: 'hash-x' })).toBe(
        'fresh'
      );
    });

    it('returns stale when hashes differ', () => {
      expect(assessFreshness({ recordedInputsHash: 'hash-x', currentInputsHash: 'hash-y' })).toBe(
        'stale'
      );
    });

    it('returns unknown when either hash is missing (legacy reports)', () => {
      expect(assessFreshness({ recordedInputsHash: undefined, currentInputsHash: 'x' })).toBe(
        'unknown'
      );
      expect(assessFreshness({ recordedInputsHash: 'x', currentInputsHash: null })).toBe('unknown');
    });
  });
});
