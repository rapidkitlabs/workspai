/**
 * Single source of truth for Phase 4 canonical artifact paths (roadmap 4.0).
 * Consumed by generators, pack contract, and extension parity tests via sync.
 */

export const RAPIDKIT_SKILLS_DIR = '.rapidkit/skills' as const;
export const WORKSPACE_SKILLS_INDEX_PATH = '.rapidkit/reports/workspace-skills-index.json' as const;
export const WORKSPACE_EXPLAIN_REPORT_PATH =
  '.rapidkit/reports/workspace-explain-last-run.json' as const;
export const WORKSPACE_WHY_REPORT_PATH = '.rapidkit/reports/workspace-why-last-run.json' as const;
export const WORKSPACE_TRACE_REPORT_PATH =
  '.rapidkit/reports/workspace-trace-last-run.json' as const;

export const BUILTIN_OPERATIONAL_SKILL_PREFIX = 'rapidkit-' as const;

export const BUILTIN_OPERATIONAL_SKILL_IDS = [
  'rapidkit-diagnose-api-failure',
  'rapidkit-release-readiness',
  'rapidkit-safe-schema-migration',
  'rapidkit-dependency-upgrade',
  'rapidkit-rename-contract',
] as const;

export type BuiltinOperationalSkillId = (typeof BUILTIN_OPERATIONAL_SKILL_IDS)[number];

export function operationalSkillPath(skillId: string): string {
  const normalized = skillId.trim();
  if (!normalized || normalized.includes('..') || normalized.includes('/')) {
    throw new Error(`Invalid operational skill id: ${skillId}`);
  }
  return `${RAPIDKIT_SKILLS_DIR}/${normalized}.md`;
}

export function isBuiltinOperationalSkillId(value: string): value is BuiltinOperationalSkillId {
  return (BUILTIN_OPERATIONAL_SKILL_IDS as readonly string[]).includes(value);
}

/** L2 mirror: existing Copilot meta-skill (unchanged path). */
export const RAPIDKIT_WORKSPACE_INTELLIGENCE_SKILL_PATH =
  '.github/skills/rapidkit-workspace-intelligence/SKILL.md' as const;

export const OPERATIONAL_SKILL_PROMPT_STEM: Record<BuiltinOperationalSkillId, string> = {
  'rapidkit-diagnose-api-failure': 'rapidkit-diagnose',
  'rapidkit-release-readiness': 'rapidkit-release-readiness',
  'rapidkit-safe-schema-migration': 'rapidkit-safe-schema-migration',
  'rapidkit-dependency-upgrade': 'rapidkit-dependency-upgrade',
  'rapidkit-rename-contract': 'rapidkit-rename-contract',
};
