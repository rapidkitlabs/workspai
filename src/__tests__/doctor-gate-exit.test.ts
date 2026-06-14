import { describe, expect, it } from 'vitest';
import { computeDoctorGateExitCode } from '../doctor.js';

describe('computeDoctorGateExitCode', () => {
  it('returns 0 when strict/ci are disabled', () => {
    expect(computeDoctorGateExitCode({ errors: 3, warnings: 2 }, {})).toBe(0);
  });

  it('returns 1 on errors under strict mode', () => {
    expect(computeDoctorGateExitCode({ errors: 1, warnings: 0 }, { strict: true })).toBe(1);
  });

  it('returns 1 on warnings under strict mode', () => {
    expect(computeDoctorGateExitCode({ errors: 0, warnings: 2 }, { strict: true })).toBe(1);
  });

  it('returns 2 on warnings under ci mode', () => {
    expect(computeDoctorGateExitCode({ errors: 0, warnings: 1 }, { ci: true })).toBe(2);
  });

  it('returns 1 on errors under ci mode before warning exit code', () => {
    expect(computeDoctorGateExitCode({ errors: 2, warnings: 3 }, { ci: true })).toBe(1);
  });
});
