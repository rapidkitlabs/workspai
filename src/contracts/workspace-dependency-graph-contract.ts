/**
 * Workspace dependency graph contract (`workspace-dependency-graph.v1`).
 *
 * The dependency graph is the foundation of the Workspace Intelligence reasoning
 * engine: it promotes inter-project relationships to a first-class, versioned,
 * machine-readable structure that `impact` (transitive blast radius), `verify`
 * (subgraph-scoped gating), `run --blast-radius`, and risk weighting all consume
 * from one source of truth — instead of the logic being locked inside
 * `workspace run` and the edges being hand-authored only.
 *
 * Single runtime source of the canonical enums; aligned with
 * `contracts/workspace-intelligence/workspace-dependency-graph.v1.json` via the
 * dependency-graph contract drift guard.
 */
export const WORKSPACE_DEPENDENCY_GRAPH_SCHEMA_VERSION = 'workspace-dependency-graph.v1' as const;

/**
 * Typed relationship between two projects. Aligned with the JSON schema
 * `edges.items.properties.kind.enum`.
 *
 * - `code-import`: a source import that crosses a project boundary.
 * - `package-dep`: a package-manager / workspace dependency (npm/pnpm/yarn workspace,
 *   pyproject/poetry path dep, `go.mod replace`, etc.).
 * - `event-pub-sub`: a publisher → consumer relationship via contract events.
 * - `service-dependsOn`: an explicit service-contract `dependsOn` link.
 * - `shared-resource`: a shared env/port/datastore reference between services.
 */
export const WORKSPACE_GRAPH_EDGE_KINDS = [
  'code-import',
  'package-dep',
  'event-pub-sub',
  'service-dependsOn',
  'shared-resource',
] as const;

/**
 * Provenance of an edge. Aligned with `edges.items.properties.source.enum`.
 *
 * `manual` and `contract` edges are authoritative and always override an
 * `inferred` edge between the same nodes of the same kind.
 */
export const WORKSPACE_GRAPH_EDGE_SOURCES = ['inferred', 'contract', 'manual'] as const;

/**
 * Confidence bucket for an edge. Aligned with `edges.items.properties.confidence.enum`.
 * `manual` / `contract` edges are emitted as `high`.
 */
export const WORKSPACE_GRAPH_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;

/** Required top-level fields, aligned with the JSON schema `required` array. */
export const WORKSPACE_DEPENDENCY_GRAPH_REQUIRED_FIELDS = [
  'schemaVersion',
  'generatedAt',
  'nodes',
  'edges',
  'stats',
] as const;

export type WorkspaceGraphEdgeKind = (typeof WORKSPACE_GRAPH_EDGE_KINDS)[number];
export type WorkspaceGraphEdgeSource = (typeof WORKSPACE_GRAPH_EDGE_SOURCES)[number];
export type WorkspaceGraphConfidence = (typeof WORKSPACE_GRAPH_CONFIDENCE_LEVELS)[number];

/** A single justification for an edge (so inferred edges are auditable). */
export type WorkspaceGraphEvidence = {
  /** Workspace-relative file that justifies the edge. */
  file: string;
  /** Optional human-readable specifics, e.g. `imports ../auth/client`. */
  detail?: string;
};

export type WorkspaceGraphNode = {
  /** Stable project identifier (project name). */
  id: string;
  /** Workspace-relative project path. */
  path: string;
  runtime?: string;
  framework?: string;
  kind?: string;
};

/**
 * A directed edge: `from` (the dependent / consumer) depends on `to` (the
 * dependency / producer). For blast radius, a change to `to` reaches every `from`.
 */
export type WorkspaceGraphEdge = {
  from: string;
  to: string;
  kind: WorkspaceGraphEdgeKind;
  source: WorkspaceGraphEdgeSource;
  confidence: WorkspaceGraphConfidence;
  evidence: WorkspaceGraphEvidence[];
};

export type WorkspaceDependencyGraphStats = {
  nodeCount: number;
  edgeCount: number;
  inferredEdges: number;
  contractEdges: number;
  manualEdges: number;
  /** True when at least one dependency cycle exists (integrity gate, item 1.13). */
  hasCycle: boolean;
};

export type WorkspaceDependencyGraph = {
  schemaVersion: typeof WORKSPACE_DEPENDENCY_GRAPH_SCHEMA_VERSION;
  generatedAt: string;
  nodes: WorkspaceGraphNode[];
  edges: WorkspaceGraphEdge[];
  stats: WorkspaceDependencyGraphStats;
};
