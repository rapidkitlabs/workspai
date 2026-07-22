import type {
  WorkspaceKnowledgeEntity,
  WorkspaceKnowledgeProof,
  WorkspaceKnowledgeRelation,
} from './workspace-knowledge-graph-contract.js';

export const WORKSPACE_KNOWLEDGE_GRAPH_CHANGE_OVERLAY_SCHEMA_VERSION =
  'workspace-knowledge-graph-change-overlay.v1' as const;

export type WorkspaceKnowledgeGraphChange<T> = {
  id: string;
  before?: T;
  after?: T;
  changedFields: string[];
};

/**
 * A portable, deterministic graph-to-graph overlay for pre-merge and snapshot analysis.
 * It deliberately carries complete changed records so consumers do not need either graph
 * merely to explain the change.
 */
export type WorkspaceKnowledgeGraphChangeOverlay = {
  schemaVersion: typeof WORKSPACE_KNOWLEDGE_GRAPH_CHANGE_OVERLAY_SCHEMA_VERSION;
  generatedAt: string;
  workspace: { name: string; profile?: string };
  base: { schemaVersion: string; generatedAt: string; fingerprint: string };
  head: { schemaVersion: string; generatedAt: string; fingerprint: string };
  entities: {
    added: WorkspaceKnowledgeEntity[];
    removed: WorkspaceKnowledgeEntity[];
    changed: WorkspaceKnowledgeGraphChange<WorkspaceKnowledgeEntity>[];
  };
  relations: {
    added: WorkspaceKnowledgeRelation[];
    removed: WorkspaceKnowledgeRelation[];
    changed: WorkspaceKnowledgeGraphChange<WorkspaceKnowledgeRelation>[];
  };
  proofs: {
    added: WorkspaceKnowledgeProof[];
    removed: WorkspaceKnowledgeProof[];
    changed: WorkspaceKnowledgeGraphChange<WorkspaceKnowledgeProof>[];
  };
  impactedEntityIds: string[];
  changedArtifacts: string[];
  summary: {
    entityAdds: number;
    entityRemovals: number;
    entityChanges: number;
    relationAdds: number;
    relationRemovals: number;
    relationChanges: number;
    proofAdds: number;
    proofRemovals: number;
    proofChanges: number;
    impactedEntities: number;
    changedArtifacts: number;
    risk: 'none' | 'low' | 'medium' | 'high';
  };
};
