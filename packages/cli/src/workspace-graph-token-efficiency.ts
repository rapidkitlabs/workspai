import path from 'node:path';

import fsExtra from 'fs-extra';

import type { WorkspaceKnowledgeGraph } from './contracts/workspace-knowledge-graph-contract.js';
import {
  searchKnowledgeGraph,
  type WorkspaceKnowledgeSearchResult,
} from './workspace-knowledge-graph-query.js';

const CHARS_PER_ESTIMATED_TOKEN = 4;
export const WORKSPACE_GRAPH_TOKEN_EFFICIENCY_SCHEMA_VERSION =
  'workspace-graph-token-efficiency.v1' as const;

export type WorkspaceGraphTokenEfficiencyReport = {
  schemaVersion: typeof WORKSPACE_GRAPH_TOKEN_EFFICIENCY_SCHEMA_VERSION;
  generatedAt: string;
  workspacePath: string;
  query: string;
  graph: {
    schemaVersion: WorkspaceKnowledgeGraph['schemaVersion'];
    sourceArtifact: string;
    sourceHash: string;
    entityCount: number;
    relationCount: number;
    proofCount: number;
  };
  methodology: {
    id: 'indexed-corpus-vs-bounded-retrieval.v1';
    estimated: true;
    charsPerToken: 4;
    claimBoundary: string;
  };
  corpus: {
    artifactCount: number;
    characterCount: number;
    estimatedTokens: number;
    unreadableArtifacts: string[];
  };
  retrieval: {
    matchCount: number;
    characterCount: number;
    estimatedTokens: number;
    truncated: boolean;
    payload: WorkspaceKnowledgeSearchResult;
  };
  savings: {
    estimatedTokensAvoided: number;
    reductionRatio: number;
    reductionPercent: number;
  };
};

function estimatedTokens(characters: number): number {
  return Math.ceil(characters / CHARS_PER_ESTIMATED_TOKEN);
}

function safeArtifactPath(workspacePath: string, artifact: string): string | null {
  if (!artifact || path.isAbsolute(artifact)) return null;
  const root = path.resolve(workspacePath);
  const candidate = path.resolve(root, artifact);
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return candidate;
}

export async function buildWorkspaceGraphTokenEfficiencyReport(input: {
  workspacePath: string;
  graph: WorkspaceKnowledgeGraph;
  query: string;
  kind?: string;
  limit?: number;
  now?: Date;
}): Promise<WorkspaceGraphTokenEfficiencyReport> {
  const workspacePath = path.resolve(input.workspacePath);
  const payload = searchKnowledgeGraph(input.graph, {
    query: input.query,
    ...(input.kind ? { kind: input.kind } : {}),
    limit: input.limit,
  });
  const artifacts = [...new Set(input.graph.proofs.map((proof) => proof.artifact))].sort();
  const unreadableArtifacts: string[] = [];
  let characterCount = 0;
  let artifactCount = 0;
  for (const artifact of artifacts) {
    const absolutePath = safeArtifactPath(workspacePath, artifact);
    if (!absolutePath) {
      unreadableArtifacts.push(artifact);
      continue;
    }
    try {
      const content = await fsExtra.readFile(absolutePath, 'utf8');
      characterCount += content.length;
      artifactCount += 1;
    } catch {
      unreadableArtifacts.push(artifact);
    }
  }
  const retrievalCharacters = JSON.stringify(payload).length;
  const corpusTokens = estimatedTokens(characterCount);
  const retrievalTokens = estimatedTokens(retrievalCharacters);
  const avoided = Math.max(0, corpusTokens - retrievalTokens);
  return {
    schemaVersion: WORKSPACE_GRAPH_TOKEN_EFFICIENCY_SCHEMA_VERSION,
    generatedAt: (input.now ?? new Date()).toISOString(),
    workspacePath,
    query: input.query,
    graph: {
      schemaVersion: input.graph.schemaVersion,
      sourceArtifact: input.graph.source.artifact,
      sourceHash: input.graph.source.hash,
      entityCount: input.graph.entities.length,
      relationCount: input.graph.relations.length,
      proofCount: input.graph.proofs.length,
    },
    methodology: {
      id: 'indexed-corpus-vs-bounded-retrieval.v1',
      estimated: true,
      charsPerToken: CHARS_PER_ESTIMATED_TOKEN,
      claimBoundary:
        'Measures retrieval payload reduction against readable proof-source text; it does not claim equivalent answer quality or model-specific billing savings.',
    },
    corpus: {
      artifactCount,
      characterCount,
      estimatedTokens: corpusTokens,
      unreadableArtifacts,
    },
    retrieval: {
      matchCount: payload.entities.length,
      characterCount: retrievalCharacters,
      estimatedTokens: retrievalTokens,
      truncated: payload.truncated,
      payload,
    },
    savings: {
      estimatedTokensAvoided: avoided,
      reductionRatio:
        retrievalTokens === 0 ? 0 : Number((corpusTokens / retrievalTokens).toFixed(2)),
      reductionPercent:
        corpusTokens === 0 ? 0 : Number(((avoided / corpusTokens) * 100).toFixed(2)),
    },
  };
}
