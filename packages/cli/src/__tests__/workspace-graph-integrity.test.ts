import { describe, expect, it } from 'vitest';

import type {
  WorkspaceGraphEdge,
  WorkspaceGraphEdgeKind,
  WorkspaceGraphNode,
} from '../contracts/workspace-dependency-graph-contract.js';
import { checkGraphIntegrity, summarizeGraphIntegrity } from '../workspace-graph-integrity.js';

function node(id: string): WorkspaceGraphNode {
  return { id, path: id };
}

function edge(
  from: string,
  to: string,
  kind: WorkspaceGraphEdgeKind = 'package-dep'
): WorkspaceGraphEdge {
  return { from, to, kind, source: 'inferred', confidence: 'high', evidence: [] };
}

describe('workspace graph integrity', () => {
  it('passes a clean acyclic graph (orphans are informational, not blocking)', () => {
    const integrity = checkGraphIntegrity({
      nodes: [node('api'), node('web'), node('standalone')],
      edges: [edge('web', 'api')],
    });
    expect(integrity.ok).toBe(true);
    expect(integrity.cycles).toEqual([]);
    expect(integrity.danglingEdges).toEqual([]);
    expect(integrity.orphans).toEqual(['standalone']);
    expect(summarizeGraphIntegrity(integrity)).toEqual([]);
  });

  it('detects a directed cycle and returns a normalized path', () => {
    const integrity = checkGraphIntegrity({
      nodes: [node('a'), node('b'), node('c')],
      edges: [edge('b', 'c'), edge('c', 'a'), edge('a', 'b')],
    });
    expect(integrity.ok).toBe(false);
    expect(integrity.cycles).toHaveLength(1);
    // Normalized to start at the smallest id and closed.
    expect(integrity.cycles[0]).toEqual(['a', 'b', 'c', 'a']);
    expect(summarizeGraphIntegrity(integrity)[0]).toContain('graph.integrity.cycle');
  });

  it('detects dangling edges to/from missing nodes', () => {
    const integrity = checkGraphIntegrity({
      nodes: [node('api')],
      edges: [edge('api', 'ghost'), edge('phantom', 'api')],
    });
    expect(integrity.ok).toBe(false);
    expect(integrity.danglingEdges).toEqual([
      { from: 'api', to: 'ghost', kind: 'package-dep', missing: 'to' },
      { from: 'phantom', to: 'api', kind: 'package-dep', missing: 'from' },
    ]);
    expect(integrity.stats.danglingCount).toBe(2);
  });

  it('is deterministic across runs', () => {
    const graph = {
      nodes: [node('a'), node('b'), node('c')],
      edges: [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')],
    };
    expect(checkGraphIntegrity(graph)).toEqual(checkGraphIntegrity(graph));
  });
});
