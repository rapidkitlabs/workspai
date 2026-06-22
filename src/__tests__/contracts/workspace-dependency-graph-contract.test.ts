import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  WORKSPACE_DEPENDENCY_GRAPH_REQUIRED_FIELDS,
  WORKSPACE_DEPENDENCY_GRAPH_SCHEMA_VERSION,
  WORKSPACE_GRAPH_CONFIDENCE_LEVELS,
  WORKSPACE_GRAPH_EDGE_KINDS,
  WORKSPACE_GRAPH_EDGE_SOURCES,
} from '../../contracts/workspace-dependency-graph-contract.js';

type JsonSchema = {
  $schema?: string;
  required?: string[];
  properties?: {
    schemaVersion?: { const?: string };
    edges?: {
      items?: {
        properties?: {
          kind?: { enum?: string[] };
          source?: { enum?: string[] };
          confidence?: { enum?: string[] };
        };
      };
    };
  };
};

function readSchema(): JsonSchema {
  const schemaPath = path.resolve(
    process.cwd(),
    'contracts',
    'workspace-intelligence',
    'workspace-dependency-graph.v1.json'
  );
  expect(fs.existsSync(schemaPath), 'workspace-dependency-graph.v1.json must exist').toBe(true);
  return JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as JsonSchema;
}

describe('workspace-dependency-graph.v1 contract drift guard', () => {
  it('pins the JSON Schema dialect and schema version const', () => {
    const schema = readSchema();
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.properties?.schemaVersion?.const).toBe(WORKSPACE_DEPENDENCY_GRAPH_SCHEMA_VERSION);
  });

  it('keeps TypeScript edge kinds aligned with the JSON schema enum', () => {
    const schema = readSchema();
    expect(schema.properties?.edges?.items?.properties?.kind?.enum).toEqual([
      ...WORKSPACE_GRAPH_EDGE_KINDS,
    ]);
  });

  it('keeps TypeScript edge sources aligned with the JSON schema enum', () => {
    const schema = readSchema();
    expect(schema.properties?.edges?.items?.properties?.source?.enum).toEqual([
      ...WORKSPACE_GRAPH_EDGE_SOURCES,
    ]);
  });

  it('keeps TypeScript confidence levels aligned with the JSON schema enum', () => {
    const schema = readSchema();
    expect(schema.properties?.edges?.items?.properties?.confidence?.enum).toEqual([
      ...WORKSPACE_GRAPH_CONFIDENCE_LEVELS,
    ]);
  });

  it('keeps the required top-level fields aligned with the JSON schema required array', () => {
    const schema = readSchema();
    expect(schema.required).toEqual([...WORKSPACE_DEPENDENCY_GRAPH_REQUIRED_FIELDS]);
  });

  it('treats manual and contract as authoritative provenance over inferred', () => {
    // Guard the ordering assumption the inference engine (1.7) relies on.
    expect(WORKSPACE_GRAPH_EDGE_SOURCES).toContain('manual');
    expect(WORKSPACE_GRAPH_EDGE_SOURCES).toContain('contract');
    expect(WORKSPACE_GRAPH_EDGE_SOURCES).toContain('inferred');
  });
});
