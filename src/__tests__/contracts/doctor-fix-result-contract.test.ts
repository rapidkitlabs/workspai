import { describe, expect, it } from 'vitest';

import {
  DOCTOR_FIX_RESULT_SCHEMA_VERSION,
  DOCTOR_FIX_VERIFY_RECOMMENDED,
  buildDoctorFixExecutionResult,
  isDoctorFixExecutionResult,
} from '../../contracts/doctor-fix-result-contract.js';

describe('doctor-fix-result contract', () => {
  it('pins the schema version', () => {
    expect(DOCTOR_FIX_RESULT_SCHEMA_VERSION).toBe('rapidkit-doctor-fix-result-v1');
  });

  it('builds a structured fix envelope with verify hint', () => {
    const result = buildDoctorFixExecutionResult({
      appliedFixes: [
        {
          path: '/tmp/demo',
          action: 'env-copy',
          outcome: 'applied',
          projectName: 'demo',
        },
      ],
      remainingBlockers: ['demo: missing tests'],
    });

    expect(result.schemaVersion).toBe(DOCTOR_FIX_RESULT_SCHEMA_VERSION);
    expect(result.appliedFixes).toHaveLength(1);
    expect(result.remainingBlockers).toEqual(['demo: missing tests']);
    expect(result.verifyRecommended).toBe(DOCTOR_FIX_VERIFY_RECOMMENDED);
    expect(isDoctorFixExecutionResult(result)).toBe(true);
  });

  it('accepts idempotent empty fix runs', () => {
    const empty = buildDoctorFixExecutionResult({
      appliedFixes: [],
      remainingBlockers: [],
    });
    expect(isDoctorFixExecutionResult(empty)).toBe(true);
    expect(empty.appliedFixes).toEqual([]);
  });

  it('rejects malformed envelopes', () => {
    expect(isDoctorFixExecutionResult(null)).toBe(false);
    expect(
      isDoctorFixExecutionResult({
        schemaVersion: 'bogus',
        appliedFixes: [],
        remainingBlockers: [],
        verifyRecommended: DOCTOR_FIX_VERIFY_RECOMMENDED,
      })
    ).toBe(false);
  });
});
