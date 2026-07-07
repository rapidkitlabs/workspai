import type {
  WorkspaceDependencyGraph,
  WorkspaceGraphEdge,
  WorkspaceGraphEdgeKind,
} from './contracts/workspace-dependency-graph-contract.js';

/**
 * Shared, deterministic graph-traversal utility.
 *
 * This is the single implementation of dependency traversal (roadmap 1.9): the
 * reverse-deps/BFS logic used to live only inside `workspace run`'s blast-radius
 * expansion. It is now de-islanded here so `run`, `impact` (1.10), and `verify`
 * (1.11) all reason over the same edges with identical semantics.
 *
 * Edge direction convention (matches `workspace-dependency-graph.v1`): an edge
 * `from → to` means `from` depends on `to`. Therefore:
 * - "dependencies" of X = nodes X depends on  = follow edges forward (X → to).
 * - "dependents"   of X = nodes that depend on X = follow edges in reverse (from → X).
 * Blast radius (what a change to X breaks) walks **dependents**.
 */

export type TraversalDirection = 'dependents' | 'dependencies';

export type ReachedNode = {
  id: string;
  /** BFS distance from the nearest origin; origins are distance 0. */
  distance: number;
  /** Shortest path of node ids from an origin to this node (inclusive of both). */
  path: string[];
  /** Edge kind used on the final hop into this node (`null` for origins). */
  via: WorkspaceGraphEdgeKind | null;
};

export type TraversalOptions = {
  direction?: TraversalDirection;
  /** Stop expanding past this many hops from an origin (origins are depth 0). */
  maxDepth?: number;
};

export type GraphTraversalIndex = {
  /** from → sorted unique [to] (forward = dependencies). */
  forward: Map<string, string[]>;
  /** to → sorted unique [from] (reverse = dependents). */
  reverse: Map<string, string[]>;
  /** `${from}\u0000${to}` → lexicographically-sorted edge kinds connecting them. */
  kindsByPair: Map<string, WorkspaceGraphEdgeKind[]>;
  nodeIds: Set<string>;
};

function pairKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}

function pushUnique(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (!list) {
    map.set(key, [value]);
  } else if (!list.includes(value)) {
    list.push(value);
  }
}

/** Build sorted adjacency + edge-kind lookups once; reuse across queries. */
export function buildGraphTraversalIndex(graph: {
  nodes: WorkspaceDependencyGraph['nodes'];
  edges: WorkspaceGraphEdge[];
}): GraphTraversalIndex {
  const forward = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();
  const kindsByPair = new Map<string, WorkspaceGraphEdgeKind[]>();
  const nodeIds = new Set(graph.nodes.map((node) => node.id));

  for (const edge of graph.edges) {
    pushUnique(forward, edge.from, edge.to);
    pushUnique(reverse, edge.to, edge.from);
    const key = pairKey(edge.from, edge.to);
    const kinds = kindsByPair.get(key) ?? [];
    if (!kinds.includes(edge.kind)) {
      kinds.push(edge.kind);
    }
    kindsByPair.set(key, kinds);
  }

  for (const list of forward.values()) {
    list.sort((a, b) => a.localeCompare(b));
  }
  for (const list of reverse.values()) {
    list.sort((a, b) => a.localeCompare(b));
  }
  for (const kinds of kindsByPair.values()) {
    kinds.sort((a, b) => a.localeCompare(b));
  }

  return { forward, reverse, kindsByPair, nodeIds };
}

function representativeKind(
  index: GraphTraversalIndex,
  predecessor: string,
  node: string,
  direction: TraversalDirection
): WorkspaceGraphEdgeKind | null {
  // For dependents traversal we walked an edge `node → predecessor` (predecessor
  // depends on node); for dependencies we walked `predecessor → node`.
  const key = direction === 'dependents' ? pairKey(node, predecessor) : pairKey(predecessor, node);
  const kinds = index.kindsByPair.get(key);
  return kinds && kinds.length > 0 ? kinds[0] : null;
}

/**
 * Deterministic breadth-first traversal from `originIds`. Returns every reached
 * node (origins included, at distance 0) with shortest distance, shortest path,
 * and the edge kind used to enter it.
 */
export function traverseGraph(
  graph: { nodes: WorkspaceDependencyGraph['nodes']; edges: WorkspaceGraphEdge[] },
  originIds: Iterable<string>,
  options: TraversalOptions = {}
): Map<string, ReachedNode> {
  const index = buildGraphTraversalIndex(graph);
  return traverseWithIndex(index, originIds, options);
}

export function traverseWithIndex(
  index: GraphTraversalIndex,
  originIds: Iterable<string>,
  options: TraversalOptions = {}
): Map<string, ReachedNode> {
  const direction = options.direction ?? 'dependents';
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const adjacency = direction === 'dependents' ? index.reverse : index.forward;

  const reached = new Map<string, ReachedNode>();
  // Deterministic, de-duplicated origin order.
  const origins = [...new Set(originIds)].sort((a, b) => a.localeCompare(b));
  const queue: string[] = [];

  for (const origin of origins) {
    if (!reached.has(origin)) {
      reached.set(origin, { id: origin, distance: 0, path: [origin], via: null });
      queue.push(origin);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const currentNode = reached.get(current);
    if (!currentNode || currentNode.distance >= maxDepth) {
      continue;
    }
    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (reached.has(neighbor)) {
        continue;
      }
      reached.set(neighbor, {
        id: neighbor,
        distance: currentNode.distance + 1,
        path: [...currentNode.path, neighbor],
        via: representativeKind(index, current, neighbor, direction),
      });
      queue.push(neighbor);
    }
  }

  return reached;
}

/** Transitive dependents of the origins (the blast radius of a change). */
export function transitiveDependents(
  graph: { nodes: WorkspaceDependencyGraph['nodes']; edges: WorkspaceGraphEdge[] },
  originIds: Iterable<string>,
  options: Omit<TraversalOptions, 'direction'> = {}
): Map<string, ReachedNode> {
  return traverseGraph(graph, originIds, { ...options, direction: 'dependents' });
}

/** Transitive dependencies of the origins (everything they rely on). */
export function transitiveDependencies(
  graph: { nodes: WorkspaceDependencyGraph['nodes']; edges: WorkspaceGraphEdge[] },
  originIds: Iterable<string>,
  options: Omit<TraversalOptions, 'direction'> = {}
): Map<string, ReachedNode> {
  return traverseGraph(graph, originIds, { ...options, direction: 'dependencies' });
}

/** Direct (one-hop) dependents of a single node. */
export function directDependents(
  graph: { nodes: WorkspaceDependencyGraph['nodes']; edges: WorkspaceGraphEdge[] },
  id: string
): string[] {
  return [...(buildGraphTraversalIndex(graph).reverse.get(id) ?? [])];
}

/** Direct (one-hop) dependencies of a single node. */
export function directDependencies(
  graph: { nodes: WorkspaceDependencyGraph['nodes']; edges: WorkspaceGraphEdge[] },
  id: string
): string[] {
  return [...(buildGraphTraversalIndex(graph).forward.get(id) ?? [])];
}

export type AdjacencyClosure = {
  /** All reached members, including the origins. */
  reached: Set<string>;
  /** Number of members added beyond the origins (kept for run's expansion metric). */
  added: number;
};

/**
 * Low-level BFS closure over a pre-built adjacency map. Used by `workspace run`
 * to expand an affected set without re-implementing the queue/visited dance.
 * `adjacency` maps a node to the nodes that should be pulled in when it is reached
 * (e.g. dependency → its dependents for blast-radius expansion).
 */
export function closureFromAdjacency(
  adjacency: Map<string, Iterable<string>>,
  origins: Iterable<string>,
  options: { maxDepth?: number } = {}
): AdjacencyClosure {
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const reached = new Set<string>();
  const depth = new Map<string, number>();
  const queue: string[] = [];

  for (const origin of origins) {
    if (!reached.has(origin)) {
      reached.add(origin);
      depth.set(origin, 0);
      queue.push(origin);
    }
  }
  const originCount = reached.size;

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const currentDepth = depth.get(current) ?? 0;
    if (currentDepth >= maxDepth) {
      continue;
    }
    const next = adjacency.get(current);
    if (!next) {
      continue;
    }
    for (const candidate of next) {
      if (!reached.has(candidate)) {
        reached.add(candidate);
        depth.set(candidate, currentDepth + 1);
        queue.push(candidate);
      }
    }
  }

  return { reached, added: reached.size - originCount };
}
