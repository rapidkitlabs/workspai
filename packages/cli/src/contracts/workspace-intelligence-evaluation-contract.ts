import { WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMAS } from './workspace-intelligence-runtime-registry.js';

export const MODEL_USAGE_EVENT_SCHEMA_VERSION = 'model-usage-event.v1' as const;
export const WORKSPACE_INTELLIGENCE_EVALUATION_SCHEMA_VERSION =
  WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMAS.evaluationLive;
export const WORKSPACE_INTELLIGENCE_EVALUATION_COMPARISON_SCHEMA_VERSION =
  'workspace-intelligence-evaluation-comparison.v1' as const;

export const MODEL_USAGE_SOURCES = [
  'provider-reported',
  'tokenizer-counted',
  'estimated',
  'unavailable',
] as const;

export type ModelUsageSource = (typeof MODEL_USAGE_SOURCES)[number];

export type ModelUsageEvent = {
  schemaVersion: typeof MODEL_USAGE_EVENT_SCHEMA_VERSION;
  eventId: string;
  recordedAt: string;
  kind: 'model-call';
  stage?: string;
  modelCall: {
    provider: string;
    model: string;
    source: ModelUsageSource;
    tokenizer?: string;
    inputTokens: number | null;
    outputTokens: number | null;
    cachedInputTokens: number | null;
    reasoningTokens: number | null;
    latencyMs: number | null;
    promptHash?: string;
    responseHash?: string;
    cost?: {
      amount: number;
      currency: string;
      source: 'provider-reported' | 'catalog-estimated';
    };
  };
};

export type ToolUsageEvent = {
  schemaVersion: typeof MODEL_USAGE_EVENT_SCHEMA_VERSION;
  eventId: string;
  recordedAt: string;
  kind: 'tool-call';
  stage?: string;
  toolCall: {
    tool: string;
    result: 'passed' | 'failed' | 'blocked' | 'skipped';
    changedSource: boolean;
    durationMs: number | null;
    artifact?: string;
  };
};

export type EvaluationOutcomeEvent = {
  schemaVersion: typeof MODEL_USAGE_EVENT_SCHEMA_VERSION;
  eventId: string;
  recordedAt: string;
  kind: 'outcome';
  stage?: string;
  outcome: {
    status: 'passed' | 'failed' | 'blocked' | 'unknown';
    verified: boolean;
    blockersResolved: number;
    summary?: string;
  };
};

export type EvaluationMilestoneEvent = {
  schemaVersion: typeof MODEL_USAGE_EVENT_SCHEMA_VERSION;
  eventId: string;
  recordedAt: string;
  kind: 'milestone';
  stage?: string;
  milestone: { name: string; detail?: string };
};

export type WorkspaceEvaluationEvent =
  ModelUsageEvent | ToolUsageEvent | EvaluationOutcomeEvent | EvaluationMilestoneEvent;

export type WorkspaceEvaluationStrategy =
  'full-corpus' | 'grep' | 'vector' | 'graph' | 'workspace-intelligence' | 'custom';

export type WorkspaceIntelligenceEvaluation = {
  schemaVersion: typeof WORKSPACE_INTELLIGENCE_EVALUATION_SCHEMA_VERSION;
  runId: string;
  sessionId: string;
  status: 'live' | 'completed' | 'aborted';
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  workspace: { name: string; path: string };
  configuration: {
    taskId: string;
    strategy: WorkspaceEvaluationStrategy;
    provider?: string;
    model?: string;
    temperature?: number;
    baselineRunId?: string;
  };
  methodology: {
    id: 'provider-usage-and-verified-outcome.v1';
    claimBoundary: string;
  };
  events: WorkspaceEvaluationEvent[];
  summary: WorkspaceEvaluationSummary;
};

export type WorkspaceEvaluationSummary = {
  modelCalls: number;
  toolCalls: number;
  tokenSources: {
    providerReported: number;
    tokenizerCounted: number;
    estimated: number;
    unavailable: number;
  };
  tokens: {
    input: number;
    output: number;
    cachedInput: number;
    reasoning: number;
    observedTotal: number;
  };
  latencyMs: number;
  costs: Array<{
    currency: string;
    amount: number;
    providerReported: number;
    estimated: number;
  }>;
  outcome: {
    status: 'passed' | 'failed' | 'blocked' | 'unknown';
    verified: boolean;
    blockersResolved: number;
  };
  efficiency: {
    tokensPerVerifiedOutcome: number | null;
    noProgressDecisions: number;
    repeatedArtifactReads: number;
  };
};

export type WorkspaceIntelligenceEvaluationComparison = {
  schemaVersion: typeof WORKSPACE_INTELLIGENCE_EVALUATION_COMPARISON_SCHEMA_VERSION;
  generatedAt: string;
  taskAligned: boolean;
  current: {
    runId: string;
    strategy: WorkspaceEvaluationStrategy;
    tokens: number;
    verified: boolean;
    status: WorkspaceEvaluationSummary['outcome']['status'];
  };
  baseline: {
    runId: string;
    strategy: WorkspaceEvaluationStrategy;
    tokens: number;
    verified: boolean;
    status: WorkspaceEvaluationSummary['outcome']['status'];
  };
  delta: {
    tokens: number;
    reductionPercent: number | null;
    modelCalls: number;
    toolCalls: number;
    latencyMs: number;
  };
  comparableOutcome: boolean;
};
