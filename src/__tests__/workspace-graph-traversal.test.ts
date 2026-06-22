import { describe, expect, it } from 'vitest';

import type {
  WorkspaceGraphEdge,
  WorkspaceGraphEdgeKind,
} from '../contracts/workspace-dependency-graph-contract.js';
import {
  closureFromAdjacency,
  directDependents,
  transitiveDependencies,
  transitiveDependents,
} from '../workspace-graph-traversal.js';

function edge(
  from: string,
  to: string,
  kind: WorkspaceGraphEdgeKind = 'package-dep'
): WorkspaceGraphEdge {
  return { from, to, kind, source: 'inferred', confidence: 'high', evidence: [] };
}

// web → api → db   (web depends on api, api depends on db)
// worker → api
const graph = {
  nodes: [
    { id: 'api', path: 'api' },
    { id: 'db', path: 'db' },
    { id: 'web', path: 'web' },
    { id: 'worker', path: 'worker' },
  ],
  edges: [edge('web', 'api', 'code-import'), edge('worker', 'api'), edge('api', 'db')],
};

describe('workspace graph traversal', () => {
  it('walks transitive dependents (blast radius of a change)', () => {
    // A change to `db` reaches api (depends on db) and then web + worker (depend on api).
    const reached = transitiveDependents(graph, ['db']);
    expect([...reached.keys()].sort()).toEqual(['api', 'db', 'web', 'worker']);
    expect(reached.get('db')?.distance).toBe(0);
    expect(reached.get('api')?.distance).toBe(1);
    expect(reached.get('web')?.distance).toBe(2);
    expect(reached.get('web')?.path).toEqual(['db', 'api', 'web']);
    expect(reached.get('web')?.via).toBe('code-import');
    expect(reached.get('api')?.via).toBe('package-dep');
  });

  it('walks transitive dependencies (what a node relies on)', () => {
    const reached = transitiveDependencies(graph, ['web']);
    expect([...reached.keys()].sort()).toEqual(['api', 'db', 'web']);
    expect(reached.get('db')?.distance).toBe(2);
    expect(reached.get('db')?.path).toEqual(['web', 'api', 'db']);
  });

  it('respects maxDepth', () => {
    const reached = transitiveDependents(graph, ['db'], { maxDepth: 1 });
    expect([...reached.keys()].sort()).toEqual(['api', 'db']);
  });

  it('exposes direct dependents', () => {
    expect(directDependents(graph, 'api').sort()).toEqual(['web', 'worker']);
    expect(directDependents(graph, 'db')).toEqual(['api']);
  });

  it('terminates on cycles without infinite loops', () => {
    const cyclic = {
      nodes: [
        { id: 'a', path: 'a' },
        { id: 'b', path: 'b' },
      ],
      edges: [edge('a', 'b'), edge('b', 'a')],
    };
    const reached = transitiveDependents(cyclic, ['a']);
    expect([...reached.keys()].sort()).toEqual(['a', 'b']);
  });

  it('closureFromAdjacency reaches the full set and counts additions', () => {
    const adjacency = new Map<string, Iterable<string>>([
      ['db', ['api']],
      ['api', new Set(['web', 'worker'])],
    ]);
    const closure = closureFromAdjacency(adjacency, ['db']);
    expect([...closure.reached].sort()).toEqual(['api', 'db', 'web', 'worker']);
    expect(closure.added).toBe(3);
  });
});
