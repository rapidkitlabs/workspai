import { describe, expect, it } from 'vitest';

import { buildWorkspaceManifest } from '../create.js';

describe('workspace manifest bootstrap metadata', () => {
  it('embeds profile_requested and bootstrap_note when bootstrap falls back', () => {
    const manifest = JSON.parse(
      buildWorkspaceManifest('fallback-wsp', 'venv', undefined, 'node-only', {
        profileRequested: 'polyglot',
        bootstrapNote: 'python-free-fallback',
      })
    ) as Record<string, unknown>;

    expect(manifest.profile).toBe('node-only');
    expect(manifest.profile_requested).toBe('polyglot');
    expect(manifest.bootstrap_note).toBe('python-free-fallback');
  });

  it('omits bootstrap metadata for normal workspace creation', () => {
    const manifest = JSON.parse(
      buildWorkspaceManifest('normal-wsp', 'venv', '3.12', 'polyglot')
    ) as Record<string, unknown>;

    expect(manifest.profile).toBe('polyglot');
    expect(manifest.profile_requested).toBeUndefined();
    expect(manifest.bootstrap_note).toBeUndefined();
  });
});
