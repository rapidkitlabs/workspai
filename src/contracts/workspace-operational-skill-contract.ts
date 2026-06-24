import { BUILTIN_OPERATIONAL_SKILL_IDS, operationalSkillPath } from './workspace-artifact-paths.js';
import {
  STANDARD_ANSWER_CONTRACT_SECTIONS,
  type StandardAnswerContractSection,
} from './standard-answer-contract.js';

export const WORKSPACE_OPERATIONAL_SKILL_SCHEMA_VERSION = 'workspace-operational-skill.v1' as const;

export type WorkspaceOperationalSkillRecord = {
  schemaVersion: typeof WORKSPACE_OPERATIONAL_SKILL_SCHEMA_VERSION;
  skillId: string;
  canonicalPath: string;
  title: string;
  triggers: string[];
  requiredReports: string[];
  scopedProjects: string[];
  verificationCommands: string[];
  answerContractSections: StandardAnswerContractSection[];
  promptStem?: string;
  markdown: string;
};

export function isWorkspaceOperationalSkillRecord(
  value: unknown
): value is WorkspaceOperationalSkillRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === WORKSPACE_OPERATIONAL_SKILL_SCHEMA_VERSION &&
    typeof record.skillId === 'string' &&
    typeof record.canonicalPath === 'string' &&
    typeof record.title === 'string' &&
    Array.isArray(record.triggers) &&
    Array.isArray(record.requiredReports) &&
    Array.isArray(record.verificationCommands)
  );
}

export function normalizeOperationalSkillId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (!normalized || normalized.includes('/') || normalized.includes('..')) {
    return null;
  }
  return normalized;
}

export function buildOperationalSkillRecordShell(input: {
  skillId: string;
  title: string;
  triggers: string[];
  requiredReports: string[];
  scopedProjects?: string[];
  verificationCommands: string[];
  promptStem?: string;
  markdown: string;
}): WorkspaceOperationalSkillRecord {
  const skillId = normalizeOperationalSkillId(input.skillId);
  if (!skillId) {
    throw new Error(`Invalid skill id: ${input.skillId}`);
  }
  return {
    schemaVersion: WORKSPACE_OPERATIONAL_SKILL_SCHEMA_VERSION,
    skillId,
    canonicalPath: operationalSkillPath(skillId),
    title: input.title,
    triggers: [...input.triggers].sort((a, b) => a.localeCompare(b)),
    requiredReports: [...input.requiredReports].sort((a, b) => a.localeCompare(b)),
    scopedProjects: [...(input.scopedProjects ?? [])].sort((a, b) => a.localeCompare(b)),
    verificationCommands: [...input.verificationCommands],
    answerContractSections: [...STANDARD_ANSWER_CONTRACT_SECTIONS],
    ...(input.promptStem ? { promptStem: input.promptStem } : {}),
    markdown: input.markdown,
  };
}

export { BUILTIN_OPERATIONAL_SKILL_IDS };
