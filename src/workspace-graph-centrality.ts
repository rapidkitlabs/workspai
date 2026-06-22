import type {
  WorkspaceDependencyGraph,
  WorkspaceGraphEdge,
} from './contracts/workspace-dependency-graph-contract.js';
import { buildGraphTraversalIndex, traverseWithIndex } from './workspace-graph-traversal.js';

/**
 * Deterministic graph centrality (roadmap 1.12).
 *
 * Quantifies how "central" each project is so impact/verify can escalate risk for
 * changes to high-leverage nodes and surface critical-path hotspots:
 * - `fanIn`  = direct dependents (how many projects depend on this one).
 * - `fanOut` = direct dependencies (how many this project depends on).
 * - `reach`  = transitive dependents (the blast radius if this node changes).
 * - `betweenness` = Brandes betweenness over the directed graph (how often this
 *   node lies on shortest dependency paths — a broker / critical path).
 *
 * A node is a critical-path hotspot when its change reaches at least half of the
 * rest of the workspace (and at least two projects). Everything is computed from
 * sorted iteration so results are stable across runs.
 */

export type NodeCentrality = {
  id: string;
  fanIn: number;
  fanOut: number;
  reach: number;
  betweenness: number;
  isHotspot: boolean;
};

export type GraphCentrality = {
  byId: Map<string, NodeCentrality>;
  /** Hotspot ids, ranked by reach desc, then betweenness desc, then id asc. */
  hotspots: string[];
};

function brandesBetweenness(
  nodeIds: string[],
  forward: Map<string, string[]>
): Map<string, number> {
  const betweenness = new Map<string, number>();
  for (const id of nodeIds) {
    betweenness.set(id, 0);
  }

  for (const source of nodeIds) {
    const stack: string[] = [];
    const predecessors = new Map<string, string[]>();
    const sigma = new Map<string, number>();
    const distance = new Map<string, number>();
    for (const id of nodeIds) {
      predecessors.set(id, []);
      sigma.set(id, 0);
      distance.set(id, -1);
    }
    sigma.set(source, 1);
    distance.set(source, 0);

    const queue: string[] = [source];
    let head = 0;
    while (head < queue.length) {
      const v = queue[head++];
      stack.push(v);
      for (const w of forward.get(v) ?? []) {
        if ((distance.get(w) ?? -1) < 0) {
          distance.set(w, (distance.get(v) ?? 0) + 1);
          queue.push(w);
        }
        if ((distance.get(w) ?? -1) === (distance.get(v) ?? 0) + 1) {
          sigma.set(w, (sigma.get(w) ?? 0) + (sigma.get(v) ?? 0));
          predecessors.get(w)?.push(v);
        }
      }
    }

    const delta = new Map<string, number>();
    for (const id of nodeIds) {
      delta.set(id, 0);
    }
    while (stack.length > 0) {
      const w = stack.pop() as string;
      const sigmaW = sigma.get(w) ?? 0;
      for (const v of predecessors.get(w) ?? []) {
        const contribution =
          sigmaW === 0 ? 0 : ((sigma.get(v) ?? 0) / sigmaW) * (1 + (delta.get(w) ?? 0));
        delta.set(v, (delta.get(v) ?? 0) + contribution);
      }
      if (w !== source) {
        betweenness.set(w, (betweenness.get(w) ?? 0) + (delta.get(w) ?? 0));
      }
    }
  }

  return betweenness;
}

export function computeGraphCentrality(graph: {
  nodes: WorkspaceDependencyGraph['nodes'];
  edges: WorkspaceGraphEdge[];
}): GraphCentrality {
  const index = buildGraphTraversalIndex(graph);
  const nodeIds = [...index.nodeIds].sort((a, b) => a.localeCompare(b));
  const betweenness = brandesBetweenness(nodeIds, index.forward);
  const nodeCount = nodeIds.length;
  const hotspotThreshold = Math.max(2, Math.ceil((nodeCount - 1) / 2));

  const byId = new Map<string, NodeCentrality>();
  for (const id of nodeIds) {
    const fanIn = index.reverse.get(id)?.length ?? 0;
    const fanOut = index.forward.get(id)?.length ?? 0;
    const reach = traverseWithIndex(index, [id], { direction: 'dependents' }).size - 1;
    const score = Math.round((betweenness.get(id) ?? 0) * 1000) / 1000;
    byId.set(id, {
      id,
      fanIn,
      fanOut,
      reach,
      betweenness: score,
      isHotspot: reach >= 2 && reach >= hotspotThreshold,
    });
  }

  const hotspots = [...byId.values()]
    .filter((node) => node.isHotspot)
    .sort((a, b) => b.reach - a.reach || b.betweenness - a.betweenness || a.id.localeCompare(b.id))
    .map((node) => node.id);

  return { byId, hotspots };
}
