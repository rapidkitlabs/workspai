import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  DOCTOR_PROJECT_EVIDENCE_SCHEMA,
  DOCTOR_WORKSPACE_EVIDENCE_SCHEMA,
} from '../../utils/doctor-evidence-contract.js';
import { WORKSPACE_REGISTRY_SUMMARY_SCHEMA_VERSION } from '../../utils/workspace-registry-summary.js';
import { WORKSPACE_RUN_EVIDENCE_SCHEMA_VERSION } from '../../utils/workspace-run-evidence.js';

const CONTRACTS_DIR = path.resolve(process.cwd(), 'contracts');

const GOVERNANCE_ARTIFACT_SCHEMAS = [
  {
    fileName: 'workspace-registry.v1.json',
    schemaVersion: WORKSPACE_REGISTRY_SUMMARY_SCHEMA_VERSION,
  },
  {
    fileName: 'workspace-run-last.v1.json',
    schemaVersion: WORKSPACE_RUN_EVIDENCE_SCHEMA_VERSION,
  },
  {
    fileName: 'doctor-workspace-evidence.v1.json',
    schemaVersion: DOCTOR_WORKSPACE_EVIDENCE_SCHEMA,
  },
  {
    fileName: 'doctor-project-evidence.v1.json',
    schemaVersion: DOCTOR_PROJECT_EVIDENCE_SCHEMA,
  },
  {
    fileName: 'analyze-last-run.v1.json',
    schemaVersion: 'rapidkit-analyze-v1',
  },
  {
    fileName: 'cli-log-event.v1.json',
    schemaVersion: 'cli-log-event-v1',
  },
] as const;

function readSchema(fileName: string): Record<string, unknown> {
  const filePath = path.join(CONTRACTS_DIR, fileName);
  expect(fs.existsSync(filePath), `${fileName} must exist`).toBe(true);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

function schemaConst(schema: Record<string, unknown>): string | undefined {
  const properties = schema.properties as Record<string, unknown> | undefined;
  const schemaVersion = properties?.schemaVersion as Record<string, unknown> | undefined;
  if (typeof schemaVersion?.const === 'string') {
    return schemaVersion.const;
  }
  const enumValues = schemaVersion?.enum as string[] | undefined;
  return enumValues?.[0];
}

describe('governance artifact JSON schemas', () => {
  for (const contract of GOVERNANCE_ARTIFACT_SCHEMAS) {
    it(`keeps ${contract.fileName} aligned with writer schemaVersion`, () => {
      const schema = readSchema(contract.fileName);
      expect(schemaConst(schema)).toBe(contract.schemaVersion);
    });
  }
});
