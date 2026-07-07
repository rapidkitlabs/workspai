import type {
  WorkspaceDependencyGraph,
  WorkspaceGraphEdge,
  WorkspaceGraphEdgeKind,
  WorkspaceGraphNode,
} from './contracts/workspace-dependency-graph-contract.js';

/**
 * Deterministic graph integrity gate (roadmap 1.13).
 *
 * Checks structural health of the dependency graph so impact/verify and the
 * graph command surface can fail fast on corruption:
 * - `cycles`        : directed dependency cycles (each returned as a node path,
 *                     normalized to start at its lexicographically smallest id).
 * - `danglingEdges` : edges whose `from`/`to` references a node that is not in
 *                     the node set (broken/stale manual overrides, etc.).
 * - `orphans`       : nodes with no incident edge in either direction.
 *
 * Cycles and dangling edges are errors (they break graph-aware reasoning);
 * orphans are informational (standalone projects are legitimate).
 */

export type WorkspaceGraphDanglingEdge = {
  from: string;
  to: string;
  kind: WorkspaceGraphEdgeKind;
  missing: 'from' | 'to' | 'both';
};

export type WorkspaceGraphIntegrity = {
  ok: boolean;
  cycles: string[][];
  danglingEdges: WorkspaceGraphDanglingEdge[];
  orphans: string[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    cycleCount: number;
    danglingCount: number;
    orphanCount: number;
  };
};

function normalizeCycle(path: string[]): string[] {
  // `path` is a closed walk where the first and last ids are equal. Drop the
  // duplicate tail, then rotate so the smallest id is first for a stable form.
  const ring = path.slice(0, -1);
  if (ring.length === 0) {
    return path;
  }
  let minIndex = 0;
  for (let i = 1; i < ring.length; i += 1) {
    if (ring[i].localeCompare(ring[minIndex]) < 0) {
      minIndex = i;
    }
  }
  const rotated = [...ring.slice(minIndex), ...ring.slice(0, minIndex)];
  rotated.push(rotated[0]);
  return rotated;
}

function findCycles(nodeIds: string[], adjacency: Map<string, string[]>): string[][] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of nodeIds) {
    color.set(id, WHITE);
  }

  const cycles: string[][] = [];
  const seen = new Set<string>();

  const visit = (start: string): void => {
    const stack: Array<{ id: string; index: number }> = [{ id: start, index: 0 }];
    color.set(start, GRAY);
    const pathStack: string[] = [start];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const neighbors = adjacency.get(frame.id) ?? [];
      if (frame.index >= neighbors.length) {
        color.set(frame.id, BLACK);
        stack.pop();
        pathStack.pop();
        continue;
      }
      const next = neighbors[frame.index];
      frame.index += 1;
      const state = color.get(next) ?? WHITE;
      if (state === GRAY) {
        const cycleStart = pathStack.lastIndexOf(next);
        if (cycleStart >= 0) {
          const cycle = normalizeCycle([...pathStack.slice(cycleStart), next]);
          const key = cycle.join('>');
          if (!seen.has(key)) {
            seen.add(key);
            cycles.push(cycle);
          }
        }
        continue;
      }
      if (state === WHITE) {
        color.set(next, GRAY);
        stack.push({ id: next, index: 0 });
        pathStack.push(next);
      }
    }
  };

  for (const id of nodeIds) {
    if (color.get(id) === WHITE) {
      visit(id);
    }
  }

  return cycles.sort((a, b) => a.join('>').localeCompare(b.join('>')));
}

export function checkGraphIntegrity(graph: {
  nodes: WorkspaceGraphNode[];
  edges: WorkspaceGraphEdge[];
}): WorkspaceGraphIntegrity {
  const nodeIds = [...new Set(graph.nodes.map((node) => node.id))].sort((a, b) =>
    a.localeCompare(b)
  );
  const nodeSet = new Set(nodeIds);

  const danglingEdges: WorkspaceGraphDanglingEdge[] = [];
  const adjacency = new Map<string, string[]>();
  const incident = new Set<string>();
  for (const id of nodeIds) {
    adjacency.set(id, []);
  }

  for (const edge of graph.edges) {
    const fromMissing = !nodeSet.has(edge.from);
    const toMissing = !nodeSet.has(edge.to);
    if (fromMissing || toMissing) {
      danglingEdges.push({
        from: edge.from,
        to: edge.to,
        kind: edge.kind,
        missing: fromMissing && toMissing ? 'both' : fromMissing ? 'from' : 'to',
      });
      continue;
    }
    adjacency.get(edge.from)?.push(edge.to);
    incident.add(edge.from);
    incident.add(edge.to);
  }

  for (const neighbors of adjacency.values()) {
    neighbors.sort((a, b) => a.localeCompare(b));
  }

  const cycles = findCycles(nodeIds, adjacency);
  const orphans = nodeIds.filter((id) => !incident.has(id));
  danglingEdges.sort(
    (a, b) =>
      a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind)
  );

  return {
    ok: cycles.length === 0 && danglingEdges.length === 0,
    cycles,
    danglingEdges,
    orphans,
    stats: {
      nodeCount: nodeIds.length,
      edgeCount: graph.edges.length,
      cycleCount: cycles.length,
      danglingCount: danglingEdges.length,
      orphanCount: orphans.length,
    },
  };
}

export function summarizeGraphIntegrity(integrity: WorkspaceGraphIntegrity): string[] {
  const reasons: string[] = [];
  for (const cycle of integrity.cycles) {
    reasons.push(`graph.integrity.cycle: ${cycle.join(' -> ')}`);
  }
  for (const edge of integrity.danglingEdges) {
    reasons.push(
      `graph.integrity.dangling: ${edge.from} -> ${edge.to} (${edge.kind}); missing ${edge.missing} endpoint.`
    );
  }
  return reasons;
}

export type { WorkspaceDependencyGraph };
