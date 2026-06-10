import path from 'path';
import { describe, expect, it } from 'vitest';

import { normalizeComposeFilePath } from '../utils/infra-docker.js';

describe('infra docker helpers', () => {
  it('normalizes compose file paths for cross-platform docker -f arguments', () => {
    const normalized = normalizeComposeFilePath(
      path.join('/tmp', 'workspace', '.rapidkit', 'infra', 'docker-compose.yml')
    );
    expect(normalized).toBe('/tmp/workspace/.rapidkit/infra/docker-compose.yml');
    expect(normalized).not.toContain('\\');
  });
});
