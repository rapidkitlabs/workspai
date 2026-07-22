import { describe, expect, it } from 'vitest';

import type { WorkspaceKnowledgeGraph } from '../contracts/workspace-knowledge-graph-contract.js';
import {
  renderWorkspaceKnowledgeGraphGexf,
  renderWorkspaceKnowledgeGraphGraphMl,
  renderWorkspaceKnowledgeGraphJsonLd,
} from '../workspace-knowledge-graph-export.js';

const graph = {
  schemaVersion: 'workspace-knowledge-graph.v1',
  generatedAt: '2026-07-22T00:00:00.000Z',
  source: {
    kind: 'workspace-model',
    artifact: '.workspai/reports/workspace-model.json',
    hashAlgorithm: 'sha256',
    hash: 'a'.repeat(64),
  },
  workspace: { name: 'demo & workspace' },
  projectTopology: {
    schemaVersion: 'workspace-dependency-graph.v1',
    generatedAt: '2026-07-22T00:00:00.000Z',
    nodes: [],
    edges: [],
    stats: {
      nodeCount: 0,
      edgeCount: 0,
      inferredEdges: 0,
      contractEdges: 0,
      manualEdges: 0,
      authoritativeEdges: 0,
      lowConfidenceEdges: 0,
      orphanCount: 0,
      connectedNodeCount: 0,
      density: 0,
      edgeCoverageRatio: 1,
      evidenceCoverageRatio: 1,
      hotspotCount: 0,
      hasCycle: false,
    },
  },
  entities: [
    {
      id: 'service:a',
      kind: 'service',
      label: 'API <gateway>',
      identity: { key: 'service:a', scope: 'workspace', aliases: [], fingerprint: 'a' },
      attributes: { ports: [3000, 3001] },
      proofIds: ['proof:1'],
    },
    {
      id: 'database:b',
      kind: 'database',
      label: 'Primary DB',
      identity: { key: 'database:b', scope: 'workspace', aliases: [], fingerprint: 'b' },
      attributes: {},
      proofIds: ['proof:1'],
    },
  ],
  relations: [
    {
      id: 'relation:1',
      from: 'service:a',
      to: 'database:b',
      kind: 'reads-from',
      derivation: 'extracted',
      trust: 'authoritative',
      confidence: 'high',
      proofIds: ['proof:1'],
    },
  ],
  proofs: [
    {
      id: 'proof:1',
      provider: 'manifest',
      artifact: 'package.json',
      observedAt: '2026-07-22T00:00:00.000Z',
      derivation: 'extracted',
      trust: 'authoritative',
      confidence: 'high',
      freshness: 'fresh',
    },
  ],
  providers: [],
  quality: {
    entityCount: 2,
    relationCount: 1,
    proofCount: 1,
    entityProofCoverageRatio: 1,
    relationProofCoverageRatio: 1,
    providerSuccessRatio: 1,
    conflictCount: 0,
    unknownCount: 0,
    portable: true,
    secretValuesEmitted: false,
  },
  diagnostics: [],
} satisfies WorkspaceKnowledgeGraph;

describe('workspace knowledge graph interchange exports', () => {
  it('emits portable JSON-LD with entities, relations and evidence', () => {
    const payload = JSON.parse(renderWorkspaceKnowledgeGraphJsonLd(graph));
    expect(payload['@context'].wsp).toBe('https://workspai.dev/ns/workspace#');
    expect(payload['@graph']).toHaveLength(4);
    expect(
      payload['@graph'].some((item: Record<string, unknown>) => item['@type'] === 'wsp:Evidence')
    ).toBe(true);
  });

  it('escapes GraphML and retains typed relation metadata', () => {
    const output = renderWorkspaceKnowledgeGraphGraphMl(graph);
    expect(output).toContain('demo &amp; workspace');
    expect(output).toContain('API &lt;gateway&gt;');
    expect(output).toContain('<data key="relationKind">reads-from</data>');
  });

  it('emits GEXF suitable for interactive 2D or 3D graph consumers', () => {
    const output = renderWorkspaceKnowledgeGraphGexf(graph);
    expect(output).toContain('<gexf xmlns="http://gexf.net/1.3" version="1.3">');
    expect(output).toContain('source="service:a" target="database:b"');
    expect(output).toContain('label="reads-from" weight="1"');
  });
});
