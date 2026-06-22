import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  CLI_LOG_EVENT_KINDS,
  CLI_LOG_EVENT_REQUIRED_FIELDS,
  CLI_LOG_EVENT_SCHEMA_VERSION,
  CLI_LOG_LEVELS,
} from '../../contracts/cli-log-event-contract.js';

type JsonSchema = {
  required?: string[];
  properties?: {
    schemaVersion?: { const?: string };
    level?: { enum?: string[] };
    event?: { enum?: string[] };
  };
};

function readSchema(): JsonSchema {
  const schemaPath = path.resolve(process.cwd(), 'contracts', 'cli-log-event.v1.json');
  expect(fs.existsSync(schemaPath), 'cli-log-event.v1.json must exist').toBe(true);
  return JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as JsonSchema;
}

describe('cli-log-event.v1 contract drift guard', () => {
  it('keeps the TypeScript schemaVersion aligned with the JSON schema const', () => {
    const schema = readSchema();
    expect(schema.properties?.schemaVersion?.const).toBe(CLI_LOG_EVENT_SCHEMA_VERSION);
  });

  it('keeps TypeScript log levels aligned with the JSON schema enum', () => {
    const schema = readSchema();
    expect(schema.properties?.level?.enum).toEqual([...CLI_LOG_LEVELS]);
  });

  it('keeps TypeScript event kinds aligned with the JSON schema enum', () => {
    const schema = readSchema();
    expect(schema.properties?.event?.enum).toEqual([...CLI_LOG_EVENT_KINDS]);
  });

  it('keeps TypeScript required fields aligned with the JSON schema required array', () => {
    const schema = readSchema();
    expect(schema.required).toEqual([...CLI_LOG_EVENT_REQUIRED_FIELDS]);
  });

  it('exposes the deterministic run lifecycle events consumed by IDE/CI', () => {
    for (const event of ['run.started', 'run.completed', 'run.failed'] as const) {
      expect(CLI_LOG_EVENT_KINDS).toContain(event);
    }
  });
});
