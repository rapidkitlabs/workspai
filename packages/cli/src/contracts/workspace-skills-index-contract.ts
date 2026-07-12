import { computeInputsHash } from './freshness-metadata-contract.js';
import { WORKSPACE_SKILLS_INDEX_PATH } from './workspace-artifact-paths.js';
import type { WorkspaceOperationalSkillRecord } from './workspace-operational-skill-contract.js';

import { WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMAS } from './workspace-intelligence-runtime-registry.js';

export const WORKSPACE_SKILLS_INDEX_SCHEMA_VERSION =
  WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMAS.skillsIndex;

export type WorkspaceSkillsIndexEntry = {
  skillId: string;
  path: string;
  schemaVersion: string;
  title: string;
};

export type WorkspaceSkillsIndex = {
  schemaVersion: typeof WORKSPACE_SKILLS_INDEX_SCHEMA_VERSION;
  generatedAt: string;
  inputsHash: string;
  skills: WorkspaceSkillsIndexEntry[];
};

export { WORKSPACE_SKILLS_INDEX_PATH };

export function buildWorkspaceSkillsIndex(input: {
  generatedAt: string;
  skills: WorkspaceOperationalSkillRecord[];
  inputsHash?: string;
}): WorkspaceSkillsIndex {
  const sorted = [...input.skills].sort((a, b) => a.skillId.localeCompare(b.skillId));
  const inputsHash =
    input.inputsHash ??
    computeInputsHash({
      skillIds: sorted.map((skill) => skill.skillId),
      paths: sorted.map((skill) => skill.canonicalPath),
    });
  return {
    schemaVersion: WORKSPACE_SKILLS_INDEX_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    inputsHash,
    skills: sorted.map((skill) => ({
      skillId: skill.skillId,
      path: skill.canonicalPath,
      schemaVersion: skill.schemaVersion,
      title: skill.title,
    })),
  };
}

export function isWorkspaceSkillsIndex(value: unknown): value is WorkspaceSkillsIndex {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === WORKSPACE_SKILLS_INDEX_SCHEMA_VERSION &&
    typeof record.generatedAt === 'string' &&
    Array.isArray(record.skills)
  );
}
