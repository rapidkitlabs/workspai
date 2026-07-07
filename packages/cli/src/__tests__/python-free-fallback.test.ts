import { describe, expect, it } from 'vitest';

import { resolvePythonFreeFallbackProfile } from '../create';

describe('resolvePythonFreeFallbackProfile', () => {
  it('maps python-only directly to minimal', () => {
    expect(resolvePythonFreeFallbackProfile('python-only')).toBe('minimal');
  });

  it('maps polyglot directly to node-only', () => {
    expect(resolvePythonFreeFallbackProfile('polyglot')).toBe('node-only');
  });

  it('chains enterprise through polyglot to node-only', () => {
    expect(resolvePythonFreeFallbackProfile('enterprise')).toBe('node-only');
  });

  it('returns minimal for unknown profiles', () => {
    expect(resolvePythonFreeFallbackProfile('unknown-profile')).toBe('minimal');
  });
});
