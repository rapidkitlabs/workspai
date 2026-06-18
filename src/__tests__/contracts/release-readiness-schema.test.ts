import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import { RELEASE_READINESS_SCHEMA_VERSION } from '../../readiness.js';

const SCHEMA_PATH = path.resolve(process.cwd(), 'contracts', 'release-readiness.v1.json');

describe('release-readiness contract', () => {
  it('schema const matches readiness writer', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')) as {
      properties?: { schemaVersion?: { enum?: string[] } };
    };
    const enumValues = schema.properties?.schemaVersion?.enum ?? [];
    expect(enumValues).toContain(RELEASE_READINESS_SCHEMA_VERSION);
  });
});
