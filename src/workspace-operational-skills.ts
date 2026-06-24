import path from 'node:path';

import fsExtra from 'fs-extra';

import { WORKSPACE_CONTEXT_AGENT_REPORT_PATH } from './workspace-context.js';
import { WORKSPACE_VERIFY_REPORT_PATH } from './workspace-verify.js';
import {
  BUILTIN_OPERATIONAL_SKILL_IDS,
  OPERATIONAL_SKILL_PROMPT_STEM,
  WORKSPACE_SKILLS_INDEX_PATH,
  type BuiltinOperationalSkillId,
} from './contracts/workspace-artifact-paths.js';
import {
  buildOperationalSkillRecordShell,
  type WorkspaceOperationalSkillRecord,
} from './contracts/workspace-operational-skill-contract.js';
import {
  buildWorkspaceSkillsIndex,
  type WorkspaceSkillsIndex,
} from './contracts/workspace-skills-index-contract.js';
import { computeInputsHash } from './contracts/freshness-metadata-contract.js';
import type { WorkspaceAgentContext } from './workspace-context.js';
import type { WorkspaceModel } from './workspace-model.js';
import type { WorkspaceContract } from './utils/workspace-contract.js';

const CORE_REQUIRED_REPORTS = [
  '.rapidkit/reports/INDEX.json',
  WORKSPACE_CONTEXT_AGENT_REPORT_PATH,
  WORKSPACE_VERIFY_REPORT_PATH,
] as const;

type SkillTemplate = {
  skillId: BuiltinOperationalSkillId;
  title: string;
  triggers: string[];
  objective: string;
  steps: string[];
};

const SKILL_TEMPLATES: SkillTemplate[] = [
  {
    skillId: 'rapidkit-diagnose-api-failure',
    title: 'Diagnose API failure',
    triggers: ['api failure', '500 error', 'integration test failed', 'service unreachable'],
    objective:
      'Investigate a failing API or service using RapidKit evidence before editing application code.',
    steps: [
      'Read `.rapidkit/reports/INDEX.json` and identify fail/warn reports for the scoped project.',
      'Read `.rapidkit/reports/doctor-last-run.json` and project-scoped run evidence if present.',
      'Map the failure to workspace vs project scope; cite exit codes and blocker messages.',
      'Propose the smallest safe fix (config, env, dependency) with explicit verification commands.',
    ],
  },
  {
    skillId: 'rapidkit-release-readiness',
    title: 'Release readiness',
    triggers: ['release', 'ship', 'production', 'readiness gate'],
    objective: 'Assess whether this workspace is release-ready using governed RapidKit gates.',
    steps: [
      'Read `.rapidkit/reports/release-readiness-last-run.json` and `pipeline-last-run.json`.',
      'Read `.rapidkit/reports/workspace-verify-last-run.json` for verdict and blocking reasons.',
      'List blocking gates first; never claim ready without cited report fields.',
      'Provide one safe next command and a verification checklist.',
    ],
  },
  {
    skillId: 'rapidkit-safe-schema-migration',
    title: 'Safe schema migration',
    triggers: ['migration', 'schema change', 'database migration', 'db migrate'],
    objective: 'Plan and verify a schema migration with blast-radius awareness.',
    steps: [
      'Identify affected projects from workspace model and dependency graph.',
      'Run or review impact/verify evidence for transitive dependents.',
      'Require project-scoped test/build commands before promoting the migration.',
      'Document rollback and verification signals.',
    ],
  },
  {
    skillId: 'rapidkit-dependency-upgrade',
    title: 'Dependency upgrade',
    triggers: ['upgrade dependency', 'bump package', 'security advisory', 'outdated deps'],
    objective: 'Upgrade dependencies with graph-aware verification.',
    steps: [
      'Scope the upgrade to the owning project from workspace model.',
      'Check transitive dependents via workspace graph / impact reports.',
      'Prefer workspace run test/build for affected projects.',
      'Re-run `workspace verify` after evidence refresh.',
    ],
  },
  {
    skillId: 'rapidkit-rename-contract',
    title: 'Rename contract safely',
    triggers: ['rename contract', 'rename event', 'breaking api', 'contract change'],
    objective: 'Rename or change a shared contract with consumer awareness.',
    steps: [
      'Read `.rapidkit/workspace.contract.json` for publishes/consumes/owns edges.',
      'List all consumer projects before proposing renames.',
      'Update contract file and regenerate workspace model.',
      'Verify contract gate and integration tests for consumers.',
    ],
  },
];

function displayRapidkitCommand(args: string): string {
  return `npx rapidkit ${args}`.trim();
}

function buildSkillMarkdown(input: {
  template: SkillTemplate;
  workspaceName: string;
  scopedProjects: string[];
  verificationCommands: string[];
  contractSummary?: string;
}): string {
  const lines = [
    `# ${input.template.title}`,
    '',
    `> Workspace: **${input.workspaceName}** · Skill: \`${input.template.skillId}\``,
    '',
    '## Objective',
    '',
    input.template.objective,
    '',
    '## Triggers',
    '',
    ...input.template.triggers.map((trigger) => `- ${trigger}`),
    '',
    '## Required evidence (read first)',
    '',
    ...CORE_REQUIRED_REPORTS.map((report) => `- \`${report}\``),
    '',
    '## Procedure',
    '',
    ...input.template.steps.map((step, index) => `${index + 1}. ${step}`),
    '',
  ];

  if (input.scopedProjects.length > 0) {
    lines.push('## Scoped projects', '', ...input.scopedProjects.map((p) => `- ${p}`), '');
  }

  if (input.contractSummary) {
    lines.push('## Contract context', '', input.contractSummary, '');
  }

  if (input.verificationCommands.length > 0) {
    lines.push('## Verification commands (this workspace)', '');
    for (const command of input.verificationCommands) {
      lines.push(`- \`${command}\``);
    }
    lines.push('');
  }

  lines.push(
    '## Answer contract',
    '',
    'Return: Scope, Evidence, Diagnosis, Fix Plan, Run, Verify, Assumptions.',
    '',
    '## Refresh stale evidence',
    '',
    '```bash',
    displayRapidkitCommand('workspace agent-sync --write --refresh-context'),
    '```',
    ''
  );

  return lines.join('\n');
}

function collectVerificationCommands(context: WorkspaceAgentContext | null): string[] {
  if (!context?.safeCommands?.length) {
    return [
      displayRapidkitCommand('workspace verify --json'),
      displayRapidkitCommand('doctor workspace --json'),
    ];
  }
  return context.safeCommands.slice(0, 8).map((entry) => entry.display);
}

function summarizeContract(contract: WorkspaceContract | null): string | undefined {
  if (!contract?.projects?.length) {
    return undefined;
  }
  const lines = contract.projects.slice(0, 12).map((project) => {
    const owns = project.contracts.owns.join(', ') || 'none';
    const publishes = project.contracts.publishes.join(', ') || 'none';
    const consumes = project.contracts.consumes.join(', ') || 'none';
    return `- **${project.slug}**: owns \`${owns}\`; publishes \`${publishes}\`; consumes \`${consumes}\``;
  });
  return lines.join('\n');
}

export type BuildWorkspaceOperationalSkillsInput = {
  workspacePath: string;
  model: WorkspaceModel;
  context?: WorkspaceAgentContext | null;
  contract?: WorkspaceContract | null;
  generatedAt?: Date;
};

export function buildWorkspaceOperationalSkills(
  input: BuildWorkspaceOperationalSkillsInput
): WorkspaceOperationalSkillRecord[] {
  const workspaceName = input.model.workspace.name;
  const scopedProjects = input.model.projects.map((project) => project.name).sort();
  const verificationCommands = collectVerificationCommands(input.context ?? null);
  const contractSummary = summarizeContract(input.contract ?? null);

  return SKILL_TEMPLATES.map((template) => {
    const markdown = buildSkillMarkdown({
      template,
      workspaceName,
      scopedProjects,
      verificationCommands,
      contractSummary,
    });
    return buildOperationalSkillRecordShell({
      skillId: template.skillId,
      title: template.title,
      triggers: template.triggers,
      requiredReports: [...CORE_REQUIRED_REPORTS],
      scopedProjects,
      verificationCommands,
      promptStem: OPERATIONAL_SKILL_PROMPT_STEM[template.skillId],
      markdown,
    });
  });
}

export type WriteWorkspaceOperationalSkillsResult = {
  skills: WorkspaceOperationalSkillRecord[];
  index: WorkspaceSkillsIndex;
  writtenPaths: string[];
};

export async function writeWorkspaceOperationalSkills(input: {
  workspacePath: string;
  skills: WorkspaceOperationalSkillRecord[];
  generatedAt: string;
  write: boolean;
}): Promise<WriteWorkspaceOperationalSkillsResult> {
  const workspacePath = path.resolve(input.workspacePath);
  const writtenPaths: string[] = [];
  const inputsHash = computeInputsHash({
    skills: input.skills.map((skill) => ({
      id: skill.skillId,
      path: skill.canonicalPath,
      hash: computeInputsHash({ markdown: skill.markdown }),
    })),
  });
  const index = buildWorkspaceSkillsIndex({
    generatedAt: input.generatedAt,
    skills: input.skills,
    inputsHash,
  });

  if (input.write) {
    for (const skill of input.skills) {
      const absolutePath = path.join(workspacePath, skill.canonicalPath);
      await fsExtra.ensureDir(path.dirname(absolutePath));
      await fsExtra.writeFile(absolutePath, skill.markdown, 'utf8');
      writtenPaths.push(skill.canonicalPath);
    }
    const indexPath = path.join(workspacePath, WORKSPACE_SKILLS_INDEX_PATH);
    await fsExtra.ensureDir(path.dirname(indexPath));
    await fsExtra.writeJson(indexPath, index, { spaces: 2 });
    writtenPaths.push(WORKSPACE_SKILLS_INDEX_PATH);
  }

  return { skills: input.skills, index, writtenPaths };
}

export function buildOperationalSkillsCatalogSection(index: WorkspaceSkillsIndex): string {
  const lines = [
    '## Operational skills (canonical)',
    '',
    'Read workspace-native playbooks from `.rapidkit/skills/` before generic repo scans:',
    '',
    ...index.skills.map((skill) => `- \`${skill.path}\` — ${skill.title} (\`${skill.skillId}\`)`),
    '',
    'Regenerate:',
    '',
    '```bash',
    displayRapidkitCommand('workspace agent-sync --write --refresh-context'),
    '```',
    '',
  ];
  return lines.join('\n');
}

export { BUILTIN_OPERATIONAL_SKILL_IDS };

export const OPERATIONAL_SKILL_PROMPT_PATHS: Partial<Record<BuiltinOperationalSkillId, string>> = {
  'rapidkit-diagnose-api-failure': '.github/prompts/rapidkit-diagnose.prompt.md',
  'rapidkit-release-readiness': '.github/prompts/rapidkit-release-readiness.prompt.md',
};

const HYDRATED_PROMPT_MARKER = '## Workspace verification (hydrated)';

export function buildHydratedPromptSection(skill: WorkspaceOperationalSkillRecord): string {
  const lines = [
    HYDRATED_PROMPT_MARKER,
    '',
    'Verification commands for this workspace:',
    '',
    ...(skill.verificationCommands.length
      ? skill.verificationCommands.map((command) => `- \`${command}\``)
      : ['- `npx rapidkit workspace verify --json`']),
  ];
  if (skill.scopedProjects.length > 0) {
    lines.push(
      '',
      'Scoped projects:',
      '',
      ...skill.scopedProjects.map((project) => `- ${project}`)
    );
  }
  lines.push('');
  return lines.join('\n');
}

export async function hydrateOperationalPrompts(input: {
  workspacePath: string;
  skills: WorkspaceOperationalSkillRecord[];
  write: boolean;
}): Promise<string[]> {
  const workspacePath = path.resolve(input.workspacePath);
  const hydratedPaths: string[] = [];
  for (const skill of input.skills) {
    const relativePath = OPERATIONAL_SKILL_PROMPT_PATHS[skill.skillId as BuiltinOperationalSkillId];
    if (!relativePath) {
      continue;
    }
    const absolutePath = path.join(workspacePath, relativePath);
    if (!(await fsExtra.pathExists(absolutePath))) {
      continue;
    }
    const existing = await fsExtra.readFile(absolutePath, 'utf8');
    const section = buildHydratedPromptSection(skill);
    const next = existing.includes(HYDRATED_PROMPT_MARKER)
      ? existing.replace(new RegExp(`${HYDRATED_PROMPT_MARKER}[\\s\\S]*$`), section.trimEnd())
      : `${existing.trimEnd()}\n\n${section}`;
    if (input.write) {
      await fsExtra.writeFile(absolutePath, `${next.trimEnd()}\n`, 'utf8');
    }
    hydratedPaths.push(relativePath);
  }
  return hydratedPaths;
}
