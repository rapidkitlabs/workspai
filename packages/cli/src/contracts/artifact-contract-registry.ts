import path from 'node:path';

import { assertJsonSchemaContract } from '../utils/json-schema-contract.js';
import {
  WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMA_CONTRACTS,
  WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMAS,
  WORKSPACE_INTELLIGENCE_ARTIFACTS,
  type WorkspaceIntelligenceArtifactId,
} from './workspace-intelligence-runtime-registry.js';

export type WorkspaceArtifactContractDescriptor = {
  artifactPath: string;
  schemaVersion: string;
  contractPath: string;
};

const descriptors = Object.keys(WORKSPACE_INTELLIGENCE_ARTIFACTS).flatMap((id) => {
  const artifactId = id as WorkspaceIntelligenceArtifactId;
  const schemaVersion = WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMAS[artifactId];
  const contractPath = WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMA_CONTRACTS[artifactId];
  if (!schemaVersion || !contractPath) return [];
  return [
    {
      artifactPath: WORKSPACE_INTELLIGENCE_ARTIFACTS[artifactId],
      schemaVersion,
      contractPath,
    },
  ];
});

const supplementalDescriptors: WorkspaceArtifactContractDescriptor[] = [
  {
    artifactPath: '.workspai/cache/workspace-model.v1.json',
    schemaVersion: 'workspace-model-cache.v1',
    contractPath: 'contracts/workspace-model-cache.v1.json',
  },
  {
    artifactPath: '.workspai/workspace-registry.v1.json',
    schemaVersion: 'workspace-registry.v1',
    contractPath: 'contracts/workspace-registry.v1.json',
  },
  {
    artifactPath: '.workspai/reports/doctor-project-last-run.json',
    schemaVersion: 'doctor-project-evidence-v1',
    contractPath: 'contracts/doctor-project-evidence.v1.json',
  },
  {
    artifactPath: '.workspai/reports/doctor-remediation-plan-last-run.json',
    schemaVersion: 'doctor-remediation-plan-v2',
    contractPath: 'contracts/doctor-remediation-plan.v2.json',
  },
  {
    artifactPath: '.workspai/reports/artifact-remediation-plan-last-run.json',
    schemaVersion: 'artifact-remediation-plan-v1',
    contractPath: 'contracts/artifact-remediation-plan.v1.json',
  },
  {
    artifactPath: '.workspai/reports/doctor-fix-result-last-run.json',
    schemaVersion: 'rapidkit-doctor-fix-result-v1',
    contractPath: 'contracts/workspace-intelligence/doctor-fix-result.v1.json',
  },
  {
    artifactPath: '.workspai/reports/pipeline-last-run.json',
    schemaVersion: 'rapidkit-pipeline-v1',
    contractPath: 'contracts/pipeline-last-run.v1.json',
  },
  {
    artifactPath: '.workspai/reports/autopilot-release-last-run.json',
    schemaVersion: 'autopilot-release-v1',
    contractPath: 'contracts/autopilot-release.v1.json',
  },
  {
    artifactPath: '.workspai/reports/autopilot-release.json',
    schemaVersion: 'autopilot-release-v1',
    contractPath: 'contracts/autopilot-release.v1.json',
  },
  {
    artifactPath: '.workspai/reports/workspace-run-last.json',
    schemaVersion: 'workspace-run-v1',
    contractPath: 'contracts/workspace-run-last.v1.json',
  },
  {
    artifactPath: '.workspai/reports/workspai-mcp-design.json',
    schemaVersion: 'workspai-mcp-design.v1',
    contractPath: 'contracts/workspace-intelligence/mcp-design.v1.json',
  },
  {
    artifactPath: '.workspai/reports/workspace-why-last-run.json',
    schemaVersion: WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMAS.explain,
    contractPath: WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMA_CONTRACTS.explain,
  },
  {
    artifactPath: '.workspai/reports/workspace-trace-last-run.json',
    schemaVersion: WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMAS.explain,
    contractPath: WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMA_CONTRACTS.explain,
  },
  {
    artifactPath: '.vscode/workspai-agent-hooks.json',
    schemaVersion: 'workspai-agent-hooks.v1',
    contractPath: 'contracts/workspace-intelligence/agent-hooks.v1.json',
  },
];

export const WORKSPACE_ARTIFACT_CONTRACTS = Object.freeze(
  Object.fromEntries(
    [...descriptors, ...supplementalDescriptors].map((descriptor) => [
      descriptor.artifactPath,
      descriptor,
    ])
  )
) as Readonly<Record<string, WorkspaceArtifactContractDescriptor>>;

function normalizeArtifactPath(artifactPath: string): string {
  return artifactPath.split(path.sep).join('/').replace(/^\.\//, '');
}

export function workspaceArtifactContractFor(
  artifactPath: string
): WorkspaceArtifactContractDescriptor | null {
  return WORKSPACE_ARTIFACT_CONTRACTS[normalizeArtifactPath(artifactPath)] ?? null;
}

export function assertWorkspaceArtifactContract(
  artifactPath: string,
  payload: unknown,
  artifactLabel = artifactPath
): void {
  const descriptor = workspaceArtifactContractFor(artifactPath);
  if (!descriptor) return;

  const schemaVersion =
    payload && typeof payload === 'object' && 'schemaVersion' in payload
      ? (payload as { schemaVersion?: unknown }).schemaVersion
      : undefined;
  if (schemaVersion !== descriptor.schemaVersion) {
    throw new Error(
      `${artifactLabel} schemaVersion is ${String(schemaVersion)}, expected ${descriptor.schemaVersion}`
    );
  }
  assertJsonSchemaContract(payload, descriptor.contractPath, artifactLabel);
}
