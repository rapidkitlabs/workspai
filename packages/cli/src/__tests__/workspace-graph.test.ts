import { describe, expect, it } from 'vitest';

import type {
  WorkspaceDependencyGraph,
  WorkspaceGraphEdge,
  WorkspaceGraphEdgeKind,
} from '../contracts/workspace-dependency-graph-contract.js';
import {
  buildGraphEmit,
  explainGraphNode,
  renderGraphDot,
  renderGraphMermaid,
} from '../workspace-graph.js';

function edge(
  from: string,
  to: string,
  kind: WorkspaceGraphEdgeKind = 'package-dep'
): WorkspaceGraphEdge {
  return { from, to, kind, source: 'inferred', confidence: 'high', evidence: [] };
}

const graph: WorkspaceDependencyGraph = {
  schemaVersion: 'workspace-dependency-graph.v1',
  generatedAt: '2026-06-22T00:00:00.000Z',
  nodes: [
    { id: 'api', path: 'api' },
    { id: 'core', path: 'core' },
    { id: 'web', path: 'web' },
  ],
  edges: [edge('web', 'api'), edge('api', 'core', 'service-dependsOn')],
  stats: {
    nodeCount: 3,
    edgeCount: 2,
    inferredEdges: 2,
    contractEdges: 0,
    manualEdges: 0,
    hasCycle: false,
  },
};

describe('workspace graph command surface', () => {
  it('explains a node with centrality and direct/transitive relationships', () => {
    const explain = explainGraphNode(graph, 'core');
    expect(explain.found).toBe(true);
    expect(explain.directDependents).toEqual(['api']);
    expect(explain.directDependencies).toEqual([]);
    // core is reached by web through api.
    const reached = explain.transitiveDependents.map((item) => item.id);
    expect(reached).toEqual(['api', 'web']);
    const web = explain.transitiveDependents.find((item) => item.id === 'web');
    expect(web?.distance).toBe(2);
    expect(web?.path).toEqual(['core', 'api', 'web']);
    expect(explain.centrality?.reach).toBe(2);
  });

  it('reports not-found for an unknown project', () => {
    const explain = explainGraphNode(graph, 'ghost');
    expect(explain.found).toBe(false);
    expect(explain.centrality).toBeNull();
  });

  it('renders deterministic DOT', () => {
    const dot = renderGraphDot(graph);
    expect(dot).toContain('digraph workspace {');
    expect(dot).toContain('"api" -> "core" [label="service-dependsOn", style=bold];');
    expect(dot).toContain('"web" -> "api" [label="package-dep", style=solid];');
    expect(renderGraphDot(graph)).toBe(dot);
  });

  it('renders deterministic Mermaid', () => {
    const mermaid = renderGraphMermaid(graph);
    expect(mermaid.startsWith('flowchart LR')).toBe(true);
    expect(mermaid).toContain('api -->|service-dependsOn| core');
    expect(mermaid).toContain('web -->|package-dep| api');
  });

  it('emits graph + integrity + hotspots together', () => {
    const emit = buildGraphEmit(graph);
    expect(emit.graph.stats.nodeCount).toBe(3);
    expect(emit.integrity.ok).toBe(true);
    expect(Array.isArray(emit.hotspots)).toBe(true);
  });
});
