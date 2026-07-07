import type {
  WorkspaceDependencyGraph,
  WorkspaceGraphEdge,
  WorkspaceGraphEdgeKind,
} from './contracts/workspace-dependency-graph-contract.js';
import {
  buildGraphTraversalIndex,
  traverseWithIndex,
  type ReachedNode,
} from './workspace-graph-traversal.js';
import { computeGraphCentrality, type NodeCentrality } from './workspace-graph-centrality.js';
import { checkGraphIntegrity, type WorkspaceGraphIntegrity } from './workspace-graph-integrity.js';

/**
 * Presentation surface for the dependency graph (roadmap 1.14).
 *
 * Renders the deterministic `workspace-dependency-graph.v1` into stable, diffable
 * artifacts (Graphviz DOT, Mermaid) and explains a single node's role
 * (centrality + direct/transitive dependents and dependencies). All output is
 * sorted so it can be committed and reviewed.
 */

export type WorkspaceGraphReachItem = {
  id: string;
  distance: number;
  path: string[];
  via: WorkspaceGraphEdgeKind | null;
};

export type WorkspaceGraphExplain = {
  project: string;
  found: boolean;
  centrality: NodeCentrality | null;
  directDependents: string[];
  directDependencies: string[];
  transitiveDependents: WorkspaceGraphReachItem[];
  transitiveDependencies: WorkspaceGraphReachItem[];
};

function reachToItems(
  reached: Map<string, ReachedNode>,
  origin: string
): WorkspaceGraphReachItem[] {
  return [...reached.values()]
    .filter((node) => node.id !== origin)
    .map((node) => ({ id: node.id, distance: node.distance, path: node.path, via: node.via }))
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
}

export function explainGraphNode(
  graph: { nodes: WorkspaceDependencyGraph['nodes']; edges: WorkspaceGraphEdge[] },
  project: string
): WorkspaceGraphExplain {
  const index = buildGraphTraversalIndex(graph);
  const found = index.nodeIds.has(project);
  if (!found) {
    return {
      project,
      found: false,
      centrality: null,
      directDependents: [],
      directDependencies: [],
      transitiveDependents: [],
      transitiveDependencies: [],
    };
  }

  const centrality = computeGraphCentrality(graph).byId.get(project) ?? null;
  const dependents = traverseWithIndex(index, [project], { direction: 'dependents' });
  const dependencies = traverseWithIndex(index, [project], { direction: 'dependencies' });

  const directDependents = (index.reverse.get(project) ?? [])
    .slice()
    .sort((a, b) => a.localeCompare(b));
  const directDependencies = (index.forward.get(project) ?? [])
    .slice()
    .sort((a, b) => a.localeCompare(b));

  return {
    project,
    found: true,
    centrality,
    directDependents,
    directDependencies,
    transitiveDependents: reachToItems(dependents, project),
    transitiveDependencies: reachToItems(dependencies, project),
  };
}

function escapeDotId(id: string): string {
  return id.replace(/"/g, '\\"');
}

const EDGE_STYLE: Record<WorkspaceGraphEdgeKind, string> = {
  'code-import': 'solid',
  'package-dep': 'solid',
  'event-pub-sub': 'dashed',
  'service-dependsOn': 'bold',
  'shared-resource': 'dotted',
};

export function renderGraphDot(graph: {
  nodes: WorkspaceDependencyGraph['nodes'];
  edges: WorkspaceGraphEdge[];
}): string {
  const nodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...graph.edges].sort(
    (a, b) =>
      a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind)
  );
  const lines: string[] = ['digraph workspace {', '  rankdir=LR;', '  node [shape=box];'];
  for (const node of nodes) {
    lines.push(`  "${escapeDotId(node.id)}";`);
  }
  for (const edge of edges) {
    const style = EDGE_STYLE[edge.kind] ?? 'solid';
    lines.push(
      `  "${escapeDotId(edge.from)}" -> "${escapeDotId(edge.to)}" [label="${edge.kind}", style=${style}];`
    );
  }
  lines.push('}');
  return lines.join('\n');
}

function mermaidId(id: string): string {
  const sanitized = id.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(sanitized) ? sanitized : `n_${sanitized}`;
}

export function renderGraphMermaid(graph: {
  nodes: WorkspaceDependencyGraph['nodes'];
  edges: WorkspaceGraphEdge[];
}): string {
  const nodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...graph.edges].sort(
    (a, b) =>
      a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind)
  );
  const lines: string[] = ['flowchart LR'];
  for (const node of nodes) {
    lines.push(`  ${mermaidId(node.id)}["${node.id}"]`);
  }
  for (const edge of edges) {
    lines.push(`  ${mermaidId(edge.from)} -->|${edge.kind}| ${mermaidId(edge.to)}`);
  }
  return lines.join('\n');
}

export type WorkspaceGraphEmit = {
  graph: WorkspaceDependencyGraph;
  integrity: WorkspaceGraphIntegrity;
  hotspots: string[];
};

export function buildGraphEmit(graph: WorkspaceDependencyGraph): WorkspaceGraphEmit {
  return {
    graph,
    integrity: checkGraphIntegrity(graph),
    hotspots: computeGraphCentrality(graph).hotspots,
  };
}
