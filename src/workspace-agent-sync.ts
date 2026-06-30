import path from 'path';
import fsExtra from 'fs-extra';

import {
  buildOperationalSkillsCatalogSection,
  buildWorkspaceOperationalSkills,
  hydrateOperationalPrompts,
  writeWorkspaceOperationalSkills,
} from './workspace-operational-skills.js';
import { WORKSPACE_SKILLS_INDEX_PATH } from './contracts/workspace-artifact-paths.js';
import { buildAgentCustomizationPackContract } from './contracts/agent-customization-pack-contract.js';
import { readWorkspaceContract } from './utils/workspace-contract.js';
import {
  buildWorkspaceModel,
  WORKSPACE_MODEL_REPORT_PATH,
  WORKSPACE_MODEL_SCHEMA_VERSION,
  type WorkspaceModel,
} from './workspace-model.js';
import {
  buildWorkspaceAgentContext,
  WORKSPACE_CONTEXT_AGENT_REPORT_PATH,
  writeWorkspaceAgentContext,
  type WorkspaceContextAgent,
} from './workspace-context.js';

export const AGENT_REPORTS_INDEX_SCHEMA = 'rapidkit-agent-reports-index.v1';
export const AGENT_CUSTOMIZATION_PACK_SCHEMA = 'rapidkit-agent-customization-pack.v1';
export const AGENT_REPORTS_INDEX_PATH = '.rapidkit/reports/INDEX.json';
export const AGENT_GROUNDING_DOC_PATH = '.rapidkit/AGENT-GROUNDING.md';
export const AGENT_CUSTOMIZATION_PACK_REPORT_PATH =
  '.rapidkit/reports/agent-customization-pack.json';

export type AgentGroundingTarget =
  | 'all'
  | 'vscode'
  | 'agents'
  | 'copilot'
  | 'cursor'
  | 'claude'
  | 'codex'
  | 'orca';

export type AgentCustomizationPackPreset = 'minimal' | 'enterprise';

export type AgentCustomizationOutputKind =
  | 'report'
  | 'grounding'
  | 'instruction'
  | 'prompt'
  | 'skill'
  | 'skill-resource'
  | 'operational-skill'
  | 'skills-index'
  | 'explain-report'
  | 'agent'
  | 'rule'
  | 'hook'
  | 'mcp-design';

export type AgentCustomizationOutputStatus = 'written' | 'planned' | 'skipped';

export type AgentCustomizationPackOutput = {
  path: string;
  kind: AgentCustomizationOutputKind;
  targets: AgentGroundingTarget[];
  required: boolean;
  status: AgentCustomizationOutputStatus;
};

export type AgentCustomizationPackReport = {
  schemaVersion: typeof AGENT_CUSTOMIZATION_PACK_SCHEMA;
  generatedAt: string;
  workspaceRoot: string;
  preset: AgentCustomizationPackPreset;
  targets: AgentGroundingTarget[];
  sourceReports: string[];
  outputInventory: AgentCustomizationPackOutput[];
  capabilityMatrix: Record<
    AgentGroundingTarget,
    {
      enabled: boolean;
      outputs: string[];
    }
  >;
  drift: {
    missingRequired: string[];
    staleReports: string[];
    strictViolations: string[];
  };
  answerContract: string[];
  refreshCommand: string;
  experimental: {
    hooksEnabled: boolean;
    mcpReady: boolean;
  };
};

export type AgentReportCatalogEntry = {
  relativePath: string;
  label: string;
  required: boolean;
};

export const AGENT_REPORT_CATALOG: AgentReportCatalogEntry[] = [
  {
    relativePath: WORKSPACE_CONTEXT_AGENT_REPORT_PATH,
    label: 'Agent context pack',
    required: true,
  },
  {
    relativePath: WORKSPACE_SKILLS_INDEX_PATH,
    label: 'Operational skills index',
    required: true,
  },
  {
    relativePath: '.rapidkit/reports/workspace-model.json',
    label: 'Workspace model graph',
    required: false,
  },
  {
    relativePath: '.rapidkit/reports/doctor-last-run.json',
    label: 'Workspace doctor',
    required: false,
  },
  {
    relativePath: '.rapidkit/reports/doctor-project-last-run.json',
    label: 'Project doctor',
    required: false,
  },
  {
    relativePath: '.rapidkit/reports/doctor-remediation-plan-last-run.json',
    label: 'Doctor remediation plan',
    required: false,
  },
  {
    relativePath: '.rapidkit/reports/doctor-fix-result-last-run.json',
    label: 'Doctor fix result',
    required: false,
  },
  {
    relativePath: '.rapidkit/reports/analyze-last-run.json',
    label: 'Workspace analyze',
    required: false,
  },
  {
    relativePath: '.rapidkit/reports/pipeline-last-run.json',
    label: 'Governance pipeline',
    required: false,
  },
  {
    relativePath: '.rapidkit/reports/release-readiness-last-run.json',
    label: 'Release readiness',
    required: false,
  },
  {
    relativePath: '.rapidkit/reports/workspace-impact-last-run.json',
    label: 'Workspace impact',
    required: false,
  },
  {
    relativePath: '.rapidkit/reports/workspace-verify-last-run.json',
    label: 'Workspace verify',
    required: false,
  },
  {
    relativePath: '.rapidkit/reports/workspace-model-snapshot.json',
    label: 'Workspace model snapshot',
    required: false,
  },
  {
    relativePath: '.rapidkit/reports/workspace-model-diff-last-run.json',
    label: 'Workspace model diff',
    required: false,
  },
  {
    relativePath: '.rapidkit/reports/workspace-explain-last-run.json',
    label: 'Workspace explain',
    required: false,
  },
  {
    relativePath: '.rapidkit/reports/workspace-contract-verify-last-run.json',
    label: 'Workspace contract verify',
    required: false,
  },
  {
    relativePath: '.rapidkit/reports/workspace-intelligence-history.json',
    label: 'Workspace intelligence history',
    required: false,
  },
];

export type AgentReportIndexEntry = {
  path: string;
  label: string;
  required: boolean;
  exists: boolean;
  generatedAt?: string;
  commandId?: string;
  exitCode?: number;
};

export type WorkspaceAgentReportsIndex = {
  schemaVersion: typeof AGENT_REPORTS_INDEX_SCHEMA;
  generatedAt: string;
  workspaceRoot: string;
  readOrder: string[];
  blockers: string[];
  staleAfterHours: number;
  reports: AgentReportIndexEntry[];
  refreshCommand: string;
};

export type AgentGroundingSyncResult = {
  workspacePath: string;
  indexPath: string;
  packPath?: string;
  pack?: AgentCustomizationPackReport;
  contextPath?: string;
  writtenFiles: string[];
  skippedFiles: string[];
  blockers: string[];
  missingRequired: string[];
  staleReports: string[];
  strictViolations: string[];
};

export type SyncWorkspaceAgentGroundingOptions = {
  workspacePath: string;
  scope?: string;
  agent?: WorkspaceContextAgent | string | boolean;
  targets?: AgentGroundingTarget[];
  preset?: AgentCustomizationPackPreset;
  write?: boolean;
  dryRun?: boolean;
  strict?: boolean;
  staleAfterHours?: number;
  refreshContext?: boolean;
  experimentalHooks?: boolean;
  /** Hydrate matching `.github/prompts/rapidkit-*.prompt.md` with workspace verification steps. */
  hydratePrompts?: boolean;
};

function displayRapidkitCommand(args: string): string {
  return `npx rapidkit ${args}`.trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function collectStringBlockers(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, limit);
}

function extractBlockersFromReport(raw: Record<string, unknown>): string[] {
  const direct = collectStringBlockers(raw.blockers, 12);
  if (direct.length > 0) {
    return direct;
  }
  const blockingReasons = collectStringBlockers(raw.blockingReasons, 12);
  if (blockingReasons.length > 0) {
    return blockingReasons;
  }
  const summary = asRecord(raw.summary);
  if (summary && Array.isArray(summary.blockingReasons)) {
    return collectStringBlockers(summary.blockingReasons, 12);
  }
  return [];
}

function reportGeneratedAt(raw: Record<string, unknown>): string | undefined {
  for (const key of ['generatedAt', 'timestamp'] as const) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function isStale(generatedAt: string | undefined, staleAfterHours: number, now: Date): boolean {
  if (!generatedAt) {
    return true;
  }
  const parsed = Date.parse(generatedAt);
  if (!Number.isFinite(parsed)) {
    return true;
  }
  return now.getTime() - parsed > staleAfterHours * 60 * 60 * 1000;
}

function normalizeTargets(targets: AgentGroundingTarget[] | undefined): Set<AgentGroundingTarget> {
  const input = targets && targets.length > 0 ? targets : (['all'] as AgentGroundingTarget[]);
  if (input.includes('all')) {
    return new Set<AgentGroundingTarget>([
      'all',
      'vscode',
      'agents',
      'copilot',
      'cursor',
      'claude',
      'codex',
      'orca',
    ]);
  }
  return new Set(input);
}

function targetEnabled(selected: Set<AgentGroundingTarget>, target: AgentGroundingTarget): boolean {
  return selected.has('all') || selected.has(target);
}

function targetEnabledForCopilot(selected: Set<AgentGroundingTarget>): boolean {
  return targetEnabled(selected, 'copilot') || targetEnabled(selected, 'vscode');
}

function normalizePreset(
  preset: AgentCustomizationPackPreset | undefined
): AgentCustomizationPackPreset {
  return preset ?? 'enterprise';
}

function inferOutputKind(relativePath: string): AgentCustomizationOutputKind {
  if (relativePath === WORKSPACE_SKILLS_INDEX_PATH) {
    return 'skills-index';
  }
  if (relativePath.includes('workspace-explain-last-run.json')) {
    return 'explain-report';
  }
  if (relativePath.startsWith('.rapidkit/skills/') && relativePath.endsWith('.md')) {
    return 'operational-skill';
  }
  if (relativePath.includes('hooks') || relativePath.endsWith('rapidkit-agent-hooks.json')) {
    return 'hook';
  }
  if (relativePath.includes('mcp') || relativePath.endsWith('rapidkit-mcp-design.json')) {
    return 'mcp-design';
  }
  if (relativePath.endsWith('.json')) {
    return 'report';
  }
  if (relativePath.includes('/instructions/') || relativePath.endsWith('copilot-instructions.md')) {
    return 'instruction';
  }
  if (relativePath.includes('/prompts/')) {
    return 'prompt';
  }
  if (relativePath.includes('/skills/') && relativePath.endsWith('/SKILL.md')) {
    return 'skill';
  }
  if (relativePath.includes('/skills/')) {
    return 'skill-resource';
  }
  if (relativePath.includes('/agents/')) {
    return 'agent';
  }
  if (relativePath.includes('/rules/') || relativePath.endsWith('.mdc')) {
    return 'rule';
  }
  return 'grounding';
}

function inferOutputTargets(relativePath: string): AgentGroundingTarget[] {
  if (relativePath.startsWith('.github/')) {
    return ['vscode', 'copilot'];
  }
  if (relativePath.startsWith('.cursor/')) {
    return ['cursor'];
  }
  if (relativePath.startsWith('.claude/') || relativePath === 'CLAUDE.md') {
    return ['claude'];
  }
  if (relativePath === 'AGENTS.md' || relativePath.startsWith('.rapidkit/')) {
    return ['agents', 'codex', 'orca', 'vscode'];
  }
  if (relativePath.startsWith('.vscode/')) {
    return ['vscode'];
  }
  return ['agents'];
}

function isRequiredPackOutput(relativePath: string, preset: AgentCustomizationPackPreset): boolean {
  const contract = buildAgentCustomizationPackContract();
  return contract.presets[preset].requiredOutputs.includes(relativePath);
}

function isPersistedWorkspaceModel(raw: Record<string, unknown>): raw is WorkspaceModel {
  return (
    raw.schemaVersion === WORKSPACE_MODEL_SCHEMA_VERSION &&
    typeof raw.generatedAt === 'string' &&
    raw.summary != null &&
    typeof raw.summary === 'object' &&
    !Array.isArray(raw.summary) &&
    Array.isArray(raw.projects)
  );
}

async function resolveModelForAgentSync(
  workspacePath: string,
  prefetched?: WorkspaceModel
): Promise<WorkspaceModel> {
  if (prefetched) {
    return prefetched;
  }
  const reportPath = path.join(workspacePath, WORKSPACE_MODEL_REPORT_PATH);
  if (await fsExtra.pathExists(reportPath)) {
    try {
      const raw = (await fsExtra.readJson(reportPath)) as Record<string, unknown>;
      if (isPersistedWorkspaceModel(raw)) {
        return raw;
      }
    } catch {
      // fall through to live build
    }
  }
  return buildWorkspaceModel({
    workspacePath,
    includeEvidence: true,
  });
}

function isSafeWorkspaceRelativePath(relativePath: string): boolean {
  return (
    relativePath.length > 0 &&
    !path.isAbsolute(relativePath) &&
    !relativePath.split(/[\\/]+/).includes('..')
  );
}

function buildCapabilityMatrix(input: {
  targets: AgentGroundingTarget[];
  outputs: AgentCustomizationPackOutput[];
}): AgentCustomizationPackReport['capabilityMatrix'] {
  const knownTargets: AgentGroundingTarget[] = [
    'all',
    'vscode',
    'agents',
    'copilot',
    'cursor',
    'claude',
    'codex',
    'orca',
  ];
  return Object.fromEntries(
    knownTargets.map((target) => [
      target,
      {
        enabled: input.targets.includes('all') || input.targets.includes(target),
        outputs: input.outputs
          .filter((output) => output.targets.includes(target))
          .map((output) => output.path)
          .sort(),
      },
    ])
  ) as AgentCustomizationPackReport['capabilityMatrix'];
}

async function readJsonIfExists(absolutePath: string): Promise<Record<string, unknown> | null> {
  try {
    if (!(await fsExtra.pathExists(absolutePath))) {
      return null;
    }
    const raw = await fsExtra.readJson(absolutePath);
    return asRecord(raw);
  } catch {
    return null;
  }
}

export async function buildWorkspaceAgentReportsIndex(input: {
  workspacePath: string;
  staleAfterHours?: number;
  now?: Date;
}): Promise<WorkspaceAgentReportsIndex> {
  const now = input.now ?? new Date();
  const staleAfterHours = input.staleAfterHours ?? 24;
  const reports: AgentReportIndexEntry[] = [];
  const blockers: string[] = [];

  for (const entry of AGENT_REPORT_CATALOG) {
    const absolutePath = path.join(input.workspacePath, entry.relativePath);
    const raw = await readJsonIfExists(absolutePath);
    const exists = raw !== null;
    if (exists && raw) {
      blockers.push(...extractBlockersFromReport(raw));
    }
    reports.push({
      path: entry.relativePath,
      label: entry.label,
      required: entry.required,
      exists,
      generatedAt: raw ? reportGeneratedAt(raw) : undefined,
      commandId: typeof raw?.commandId === 'string' ? raw.commandId : undefined,
      exitCode: typeof raw?.exitCode === 'number' ? raw.exitCode : undefined,
    });
  }

  const uniqueBlockers = [...new Set(blockers.map((item) => item.trim()).filter(Boolean))].slice(
    0,
    16
  );

  return {
    schemaVersion: AGENT_REPORTS_INDEX_SCHEMA,
    generatedAt: now.toISOString(),
    workspaceRoot: input.workspacePath,
    readOrder: AGENT_REPORT_CATALOG.map((entry) => entry.relativePath),
    blockers: uniqueBlockers,
    staleAfterHours,
    reports,
    refreshCommand: displayRapidkitCommand('workspace agent-sync --write --refresh-context'),
  };
}

function buildAgentsMarkdown(input: {
  index: WorkspaceAgentReportsIndex;
  context?: Awaited<ReturnType<typeof buildWorkspaceAgentContext>> | null;
}): string {
  const lines = [
    '# RapidKit agent grounding',
    '',
    'Cross-tool instructions for Copilot, Cursor, Claude Code, Codex, Grok, and other agents.',
    '',
    '## Read order (mandatory before workspace diagnosis)',
    '',
    '1. `.rapidkit/reports/INDEX.json` — latest blockers, timestamps, and report paths',
    '2. `.rapidkit/reports/workspace-context-agent.json` — canonical agent context pack',
    '3. Evidence artifacts listed in the index (doctor, analyze, pipeline, readiness, impact, verify)',
    '',
    'Do **not** full-repo scan until these reports are read or regenerated.',
    '',
    '## Regenerate intelligence',
    '',
    '```bash',
    displayRapidkitCommand('workspace agent-sync --write --refresh-context'),
    displayRapidkitCommand('workspace context --for-agent --json --write'),
    displayRapidkitCommand('pipeline --json --write'),
    '```',
    '',
  ];

  if (input.index.blockers.length > 0) {
    lines.push('## Current blockers', '');
    for (const blocker of input.index.blockers.slice(0, 12)) {
      lines.push(`- ${blocker}`);
    }
    lines.push('');
  }

  if (input.context?.safeCommands?.length) {
    lines.push('## Safe commands (prefer these)', '');
    for (const command of input.context.safeCommands.slice(0, 10)) {
      lines.push(`- \`${command.display}\` — ${command.description}`);
    }
    lines.push('');
  }

  lines.push(
    '## Rules',
    '',
    '- Treat `.rapidkit/reports/*` as the source of truth for health, gates, and release posture.',
    '- Prefer deterministic RapidKit CLI commands over heuristic framework guesses.',
    '- If evidence is missing or stale, run the refresh commands above before proposing fixes.',
    '- Keep project-scoped advice aligned with the active project named in the context pack.',
    ''
  );

  return lines.join('\n');
}

function buildAgentGroundingDoc(index: WorkspaceAgentReportsIndex): string {
  return [
    '# RapidKit agent grounding',
    '',
    `Generated: ${index.generatedAt}`,
    '',
    'This file is tool-agnostic. Synced agents should read it together with `.rapidkit/reports/INDEX.json`.',
    '',
    '## Mandatory read order',
    '',
    ...index.readOrder.map((reportPath, idx) => `${idx + 1}. \`${reportPath}\``),
    '',
    index.blockers.length > 0 ? '## Blockers' : '',
    ...(index.blockers.length > 0 ? index.blockers.map((blocker) => `- ${blocker}`) : []),
    '',
    '## Refresh',
    '',
    '```bash',
    index.refreshCommand,
    '```',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function buildCopilotInstructions(): string {
  return [
    '# RapidKit workspace grounding',
    '',
    'Before answering workspace, release, or architecture questions:',
    '',
    '1. Read `AGENTS.md` (managed RapidKit section).',
    '2. Read `.rapidkit/reports/INDEX.json` and `.rapidkit/reports/workspace-context-agent.json`.',
    '3. Use evidence reports before scanning the full repository.',
    '',
    'Regenerate stale intelligence:',
    '',
    '```bash',
    displayRapidkitCommand('workspace agent-sync --write --refresh-context'),
    '```',
    '',
  ].join('\n');
}

function buildClaudeMarkdown(): string {
  return [
    '## Claude Code',
    '',
    '- Load `.rapidkit/reports/INDEX.json` before diagnosing blockers.',
    '- Use `.claude/rules/rapidkit-evidence.md` when editing files under `.rapidkit/`.',
    '- Refresh grounding with `npx rapidkit workspace agent-sync --write`.',
    '',
  ].join('\n');
}

function buildCursorRule(): string {
  return [
    '---',
    'description: RapidKit workspace evidence and intelligence grounding',
    'globs: []',
    'alwaysApply: true',
    '---',
    '',
    'Before proposing fixes in this workspace:',
    '',
    '1. Read `AGENTS.md` and `.rapidkit/reports/INDEX.json`.',
    '2. Read `.rapidkit/reports/workspace-context-agent.json`.',
    '3. Prefer evidence in `.rapidkit/reports/*` over full-repo exploration.',
    '',
    'Refresh when stale:',
    '',
    '```bash',
    displayRapidkitCommand('workspace agent-sync --write --refresh-context'),
    '```',
    '',
  ].join('\n');
}

function buildCopilotEvidenceInstructions(): string {
  return [
    '---',
    'applyTo: ".rapidkit/**,**/.rapidkit/**"',
    'description: RapidKit evidence and intelligence artifacts',
    '---',
    '',
    'When working under `.rapidkit/`:',
    '',
    '- Treat JSON reports as canonical gate and health evidence.',
    '- Start from `reports/INDEX.json` for read order and blockers.',
    '- Do not invent pass/fail state — cite `exitCode`, `blockers`, and `generatedAt` fields.',
    '',
  ].join('\n');
}

function buildCopilotWorkspaceInstructions(): string {
  return [
    '---',
    'applyTo: "**"',
    'description: RapidKit workspace scope, evidence, and command discipline',
    '---',
    '',
    '# RapidKit Workspace Intelligence',
    '',
    'Use RapidKit reports as the workspace source of truth before giving architectural, repair, release, or project lifecycle advice.',
    '',
    '## Scope rules',
    '',
    '- Start from `.rapidkit/reports/INDEX.json` and `.rapidkit/reports/workspace-context-agent.json`.',
    '- Distinguish workspace-level blockers from project-level blockers.',
    '- When a project is active, cite its name, path, framework, and evidence source.',
    '- Do not translate unsupported stack requests into unrelated native kits.',
    '',
    '## Answer contract',
    '',
    'Return answers with: Scope, Evidence, Diagnosis, Fix Plan, Run, Verify, Assumptions.',
    '',
  ].join('\n');
}

function buildClaudeEvidenceRule(): string {
  return [
    '# RapidKit evidence',
    '',
    'Applies when reading or editing `.rapidkit/reports/*`.',
    '',
    '- Start from `INDEX.json`, then `workspace-context-agent.json`.',
    '- Use report blockers as the primary fix target.',
    '- Regenerate with `npx rapidkit workspace agent-sync --write`.',
    '',
  ].join('\n');
}

function buildCopilotDiagnosePrompt(): string {
  return [
    '---',
    'description: Diagnose RapidKit workspace blockers from evidence reports',
    '---',
    '',
    'Diagnose this workspace using RapidKit evidence only.',
    '',
    'Read:',
    '',
    '- `.rapidkit/reports/INDEX.json`',
    '- `.rapidkit/reports/workspace-context-agent.json`',
    '- Any fail/warn reports referenced in the index',
    '',
    'Return:',
    '',
    '1. Root cause grounded in report blockers',
    '2. Smallest safe fix path (commands + file edits)',
    '3. One verification command to prove recovery',
    '',
  ].join('\n');
}

function buildWorkflowPrompt(input: {
  description: string;
  objective: string;
  expectedOutput: string[];
}): string {
  return [
    '---',
    `description: ${input.description}`,
    '---',
    '',
    input.objective,
    '',
    'Read first:',
    '',
    '- `.rapidkit/reports/INDEX.json`',
    '- `.rapidkit/reports/workspace-context-agent.json`',
    '- Any report referenced by the current blocker or task',
    '',
    'Return:',
    '',
    ...input.expectedOutput.map((item, index) => `${index + 1}. ${item}`),
    '',
    'Use the standard RapidKit answer contract: Scope, Evidence, Diagnosis, Fix Plan, Run, Verify, Assumptions.',
    '',
  ].join('\n');
}

function buildSkillResource(input: { title: string; lines: string[] }): string {
  return ['# ' + input.title, '', ...input.lines, ''].join('\n');
}

function buildMcpToolsResource(): string {
  return buildSkillResource({
    title: 'MCP Tool Design',
    lines: [
      'RapidKit MCP is a future read-mostly bridge. Use the CLI reports today; do not assume a running MCP server exists.',
      '',
      'Candidate read tools:',
      '- `getWorkspaceModel` — read `.rapidkit/reports/workspace-model.json`.',
      '- `getEvidenceIndex` — read `.rapidkit/reports/INDEX.json`.',
      '- `getBlockers` — derive current blockers from INDEX and gate reports.',
      '- `getSafeCommands` — read safe commands from `workspace-context-agent.json`.',
      '- `getProjectContext` — return one project-scoped slice of the workspace model.',
      '- `getArtifact` — read one explicit artifact path inside the workspace root.',
      '- `listOperationalSkills` — read `.rapidkit/reports/workspace-skills-index.json`.',
      '- `getWorkspaceExplain` — read/build workspace explain for release-blocked or project scope.',
      '- `refreshWorkspaceIntelligence` — explicit user-approved refresh command only.',
      '',
      'Write or repair tools require explicit approval boundaries and are intentionally not part of the first read-mostly design.',
    ],
  });
}

function buildMcpDesignManifest(input: { workspacePath: string; generatedAt: string }): string {
  return `${JSON.stringify(
    {
      schemaVersion: 'rapidkit-mcp-design.v1',
      generatedAt: input.generatedAt,
      workspaceRoot: input.workspacePath,
      status: 'design-only',
      mode: 'read-mostly',
      safety: {
        writeToolsEnabled: false,
        approvalRequiredForRefresh: true,
        artifactReadsMustStayInsideWorkspace: true,
      },
      candidateTools: [
        {
          name: 'getWorkspaceModel',
          reads: ['.rapidkit/reports/workspace-model.json'],
          mutates: false,
        },
        {
          name: 'getEvidenceIndex',
          reads: ['.rapidkit/reports/INDEX.json'],
          mutates: false,
        },
        {
          name: 'getBlockers',
          reads: [
            '.rapidkit/reports/INDEX.json',
            '.rapidkit/reports/workspace-verify-last-run.json',
            '.rapidkit/reports/pipeline-last-run.json',
          ],
          mutates: false,
        },
        {
          name: 'getSafeCommands',
          reads: ['.rapidkit/reports/workspace-context-agent.json'],
          mutates: false,
        },
        {
          name: 'getProjectContext',
          reads: [
            '.rapidkit/reports/workspace-model.json',
            '.rapidkit/reports/workspace-context-agent.json',
          ],
          mutates: false,
        },
        {
          name: 'getArtifact',
          reads: ['requested workspace-relative artifact path'],
          mutates: false,
        },
        {
          name: 'listOperationalSkills',
          reads: ['.rapidkit/reports/workspace-skills-index.json'],
          mutates: false,
        },
        {
          name: 'getWorkspaceExplain',
          reads: [
            '.rapidkit/reports/workspace-explain-last-run.json',
            '.rapidkit/reports/workspace-verify-last-run.json',
            '.rapidkit/reports/workspace-impact-last-run.json',
          ],
          mutates: false,
        },
        {
          name: 'refreshWorkspaceIntelligence',
          command: displayRapidkitCommand('workspace agent-sync --write --refresh-context'),
          mutates: true,
          approvalRequired: true,
        },
      ],
    },
    null,
    2
  )}\n`;
}

function buildExperimentalHooksConfig(input: {
  workspacePath: string;
  generatedAt: string;
}): string {
  return `${JSON.stringify(
    {
      schemaVersion: 'rapidkit-agent-hooks.v1',
      generatedAt: input.generatedAt,
      workspaceRoot: input.workspacePath,
      enabledByDefault: false,
      mode: 'advisory',
      hooks: [
        {
          name: 'rapidkit-pre-tool-use-workspace-boundary',
          event: 'PreToolUse',
          purpose: 'Block or warn on state-changing commands outside the active workspace root.',
          defaultAction: 'warn',
          rules: [
            'Allow read-only commands.',
            'Warn before write/delete commands outside workspaceRoot.',
            'Never run destructive commands without explicit user approval.',
          ],
        },
        {
          name: 'rapidkit-post-tool-use-verify-suggestion',
          event: 'PostToolUse',
          purpose: 'Suggest non-destructive verification commands after edits.',
          defaultAction: 'suggest',
          commands: [
            displayRapidkitCommand('doctor workspace'),
            displayRapidkitCommand('workspace verify --strict --json'),
          ],
        },
        {
          name: 'rapidkit-user-prompt-submit-scope-hint',
          event: 'UserPromptSubmit',
          purpose: 'Inject lightweight workspace scope and evidence index hints.',
          defaultAction: 'inject-context-hint',
          reads: ['.rapidkit/reports/INDEX.json', '.rapidkit/reports/workspace-context-agent.json'],
        },
      ],
    },
    null,
    2
  )}\n`;
}

function buildWorkspaceIntelligenceSkill(catalogSection?: string): string {
  const lines = [
    '---',
    'name: rapidkit-workspace-intelligence',
    'description: Use RapidKit workspace intelligence reports to answer, repair, verify, and release with evidence',
    '---',
    '',
    '# RapidKit Workspace Intelligence',
    '',
    'Use this skill for workspace architecture, project lifecycle, blocker repair, release readiness, agent grounding, and CI evidence questions.',
    '',
    '## Decision flow',
    '',
    '1. Load `resources/scope-model.md`.',
    '2. Load `.rapidkit/reports/INDEX.json`.',
    '3. Load `.rapidkit/reports/workspace-context-agent.json`.',
    '4. Load `.rapidkit/reports/workspace-skills-index.json` when operational playbooks are needed.',
    '5. Load the smallest evidence report required for the task.',
    '6. Answer with Scope, Evidence, Diagnosis, Fix Plan, Run, Verify, Assumptions.',
    '',
    '## Rules',
    '',
    '- Prefer RapidKit reports over full-repo scans.',
    '- Never claim a gate passed without a cited report.',
    '- Separate display commands from execution requests.',
    '- Keep project-scoped fixes inside the active project unless workspace evidence says otherwise.',
    '',
  ];
  if (catalogSection?.trim()) {
    lines.push(catalogSection.trim(), '');
  }
  return lines.join('\n');
}

function buildWorkspaiAgent(input: {
  name: string;
  description: string;
  mode: 'read-only' | 'repair' | 'release' | 'onboard';
  tools: string[];
}): string {
  return [
    '---',
    `name: ${input.name}`,
    `description: ${input.description}`,
    `tools: [${input.tools.map((tool) => `'${tool}'`).join(', ')}]`,
    '---',
    '',
    `You are the ${input.name} agent for RapidKit Workspace Intelligence.`,
    '',
    `Mode: ${input.mode}.`,
    '',
    'Start every task by reading `.rapidkit/reports/INDEX.json` and `.rapidkit/reports/workspace-context-agent.json`.',
    '',
    'Use this answer contract:',
    '',
    '- Scope',
    '- Evidence',
    '- Diagnosis',
    '- Fix Plan',
    '- Run',
    '- Verify',
    '- Assumptions',
    '',
    'Do not invent health, readiness, or policy status. Cite report paths and command outputs.',
    '',
  ].join('\n');
}

function buildCopilotSkill(): string {
  return [
    '---',
    'name: rapidkit-grounding',
    'description: Load RapidKit workspace intelligence reports before diagnosing or changing code',
    '---',
    '',
    '# RapidKit grounding',
    '',
    'Use when the user asks about workspace health, release gates, doctor/pipeline failures, or project structure.',
    '',
    '## Workflow',
    '',
    '1. Read `.rapidkit/reports/INDEX.json`',
    '2. Read `.rapidkit/reports/workspace-context-agent.json`',
    '3. Read fail/warn evidence artifacts listed in the index',
    '4. Propose the smallest safe fix with explicit verification commands',
    '',
    '## Refresh stale evidence',
    '',
    '```bash',
    displayRapidkitCommand('workspace agent-sync --write --refresh-context'),
    '```',
    '',
  ].join('\n');
}

async function writeTextFile(
  absolutePath: string,
  content: string,
  write: boolean
): Promise<'written' | 'skipped'> {
  if (!write) {
    return 'skipped';
  }
  await fsExtra.ensureDir(path.dirname(absolutePath));
  await fsExtra.writeFile(absolutePath, content, 'utf8');
  return 'written';
}

async function writeManagedMarkdownFile(input: {
  absolutePath: string;
  generatedBody: string;
  preamble?: string;
  write: boolean;
}): Promise<'written' | 'skipped'> {
  if (!input.write) {
    return 'skipped';
  }
  const existing = (await fsExtra.pathExists(input.absolutePath))
    ? await fsExtra.readFile(input.absolutePath, 'utf8')
    : null;
  const { upsertManagedAgentSection } = await import('./utils/managed-agent-markers.js');
  const managed = upsertManagedAgentSection(existing, input.generatedBody);
  const content = input.preamble ? `${input.preamble.trimEnd()}\n\n${managed}` : managed;
  await fsExtra.ensureDir(path.dirname(input.absolutePath));
  await fsExtra.writeFile(input.absolutePath, content, 'utf8');
  return 'written';
}

export function parseAgentGroundingTargets(input?: string): AgentGroundingTarget[] | undefined {
  if (!input?.trim()) {
    return undefined;
  }
  const allowed = new Set<AgentGroundingTarget>([
    'all',
    'vscode',
    'agents',
    'copilot',
    'cursor',
    'claude',
    'codex',
    'orca',
  ]);
  const parsed = input
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part): part is AgentGroundingTarget => allowed.has(part as AgentGroundingTarget));
  return parsed.length > 0 ? parsed : undefined;
}

function buildAgentCustomizationPackReport(input: {
  workspacePath: string;
  generatedAt: string;
  preset: AgentCustomizationPackPreset;
  targets: AgentGroundingTarget[];
  index: WorkspaceAgentReportsIndex;
  outputs: AgentCustomizationPackOutput[];
  missingRequired: string[];
  staleReports: string[];
  strictViolations: string[];
  experimentalHooks: boolean;
}): AgentCustomizationPackReport {
  const outputInventory = [...input.outputs].sort((a, b) => a.path.localeCompare(b.path));
  return {
    schemaVersion: AGENT_CUSTOMIZATION_PACK_SCHEMA,
    generatedAt: input.generatedAt,
    workspaceRoot: input.workspacePath,
    preset: input.preset,
    targets: [...input.targets].sort(),
    sourceReports: input.index.reports
      .filter((report) => report.exists)
      .map((report) => report.path)
      .sort(),
    outputInventory,
    capabilityMatrix: buildCapabilityMatrix({ targets: input.targets, outputs: outputInventory }),
    drift: {
      missingRequired: input.missingRequired,
      staleReports: input.staleReports,
      strictViolations: input.strictViolations,
    },
    answerContract: ['Scope', 'Evidence', 'Diagnosis', 'Fix Plan', 'Run', 'Verify', 'Assumptions'],
    refreshCommand: displayRapidkitCommand(
      `workspace agent-sync --write --refresh-context --preset ${input.preset}`
    ),
    experimental: {
      hooksEnabled: input.experimentalHooks,
      mcpReady: outputInventory.some((output) => output.kind === 'mcp-design'),
    },
  };
}

export async function syncWorkspaceAgentGrounding(
  options: SyncWorkspaceAgentGroundingOptions
): Promise<AgentGroundingSyncResult> {
  const workspacePath = path.resolve(options.workspacePath);
  const now = new Date();
  const staleAfterHours = options.staleAfterHours ?? 24;
  const selectedTargets = normalizeTargets(options.targets);
  const selectedTargetList = [...selectedTargets].sort();
  const preset = normalizePreset(options.preset);
  const write = options.write === true;
  const strict = options.strict === true;

  let contextPath: string | undefined;
  let context: Awaited<ReturnType<typeof buildWorkspaceAgentContext>> | null = null;
  let sharedModel: WorkspaceModel | undefined;

  if (options.refreshContext) {
    sharedModel = await buildWorkspaceModel({
      workspacePath,
      includeEvidence: true,
    });
    context = await buildWorkspaceAgentContext({
      workspacePath,
      model: sharedModel,
      agent: options.agent ?? 'generic',
      scope: options.scope,
      includeEvidence: true,
    });
    if (write) {
      contextPath = await writeWorkspaceAgentContext(context, workspacePath);
    }
  }

  const index = await buildWorkspaceAgentReportsIndex({
    workspacePath,
    staleAfterHours,
    now,
  });

  const strictViolations: string[] = [];

  const writtenFiles: string[] = [];
  const skippedFiles: string[] = [];
  const outputs: AgentCustomizationPackOutput[] = [];

  const record = (result: 'written' | 'skipped', relativePath: string) => {
    if (result === 'written') {
      writtenFiles.push(relativePath);
    } else {
      skippedFiles.push(relativePath);
    }
    outputs.push({
      path: relativePath,
      kind: inferOutputKind(relativePath),
      targets: inferOutputTargets(relativePath),
      required: isRequiredPackOutput(relativePath, preset),
      status: result === 'written' ? 'written' : options.dryRun ? 'planned' : 'skipped',
    });
  };

  record(
    await writeTextFile(
      path.join(workspacePath, AGENT_REPORTS_INDEX_PATH),
      `${JSON.stringify(index, null, 2)}\n`,
      write
    ),
    AGENT_REPORTS_INDEX_PATH
  );

  record(
    await writeTextFile(
      path.join(workspacePath, AGENT_GROUNDING_DOC_PATH),
      `${buildAgentGroundingDoc(index)}\n`,
      write
    ),
    AGENT_GROUNDING_DOC_PATH
  );

  let operationalSkillsCatalogSection = '';
  const model = await resolveModelForAgentSync(workspacePath, sharedModel);
  let contract: Awaited<ReturnType<typeof readWorkspaceContract>>['contract'] | null = null;
  try {
    contract = (await readWorkspaceContract({ workspacePath })).contract;
  } catch {
    contract = null;
  }
  const operationalSkills = buildWorkspaceOperationalSkills({
    workspacePath,
    model,
    context,
    contract,
    generatedAt: now,
  });
  const skillsWrite = await writeWorkspaceOperationalSkills({
    workspacePath,
    skills: operationalSkills,
    generatedAt: now.toISOString(),
    write,
  });
  for (const skill of skillsWrite.skills) {
    record(write ? 'written' : 'skipped', skill.canonicalPath);
  }
  record(write ? 'written' : 'skipped', WORKSPACE_SKILLS_INDEX_PATH);
  operationalSkillsCatalogSection = buildOperationalSkillsCatalogSection(skillsWrite.index);

  if (targetEnabled(selectedTargets, 'agents') || targetEnabled(selectedTargets, 'vscode')) {
    record(
      await writeManagedMarkdownFile({
        absolutePath: path.join(workspacePath, 'AGENTS.md'),
        generatedBody: buildAgentsMarkdown({ index, context }),
        write,
      }),
      'AGENTS.md'
    );
  }

  if (targetEnabled(selectedTargets, 'claude')) {
    const claudePath = path.join(workspacePath, 'CLAUDE.md');
    if (write) {
      const { upsertManagedAgentSection } = await import('./utils/managed-agent-markers.js');
      const existing = (await fsExtra.pathExists(claudePath))
        ? await fsExtra.readFile(claudePath, 'utf8')
        : '';
      const withManaged = upsertManagedAgentSection(existing, buildClaudeMarkdown());
      const content = withManaged.includes('@AGENTS.md')
        ? withManaged
        : `@AGENTS.md\n\n${withManaged}`;
      await fsExtra.ensureDir(path.dirname(claudePath));
      await fsExtra.writeFile(claudePath, content, 'utf8');
      writtenFiles.push('CLAUDE.md');
    } else {
      skippedFiles.push('CLAUDE.md');
    }
    record(
      await writeTextFile(
        path.join(workspacePath, '.claude/rules/rapidkit-evidence.md'),
        `${buildClaudeEvidenceRule()}\n`,
        write
      ),
      '.claude/rules/rapidkit-evidence.md'
    );
  }

  if (targetEnabled(selectedTargets, 'cursor')) {
    record(
      await writeTextFile(
        path.join(workspacePath, '.cursor/rules/rapidkit-grounding.mdc'),
        buildCursorRule(),
        write
      ),
      '.cursor/rules/rapidkit-grounding.mdc'
    );
  }

  if (targetEnabledForCopilot(selectedTargets)) {
    record(
      await writeManagedMarkdownFile({
        absolutePath: path.join(workspacePath, '.github/copilot-instructions.md'),
        generatedBody: buildCopilotInstructions(),
        write,
      }),
      '.github/copilot-instructions.md'
    );
    record(
      await writeTextFile(
        path.join(workspacePath, '.github/instructions/rapidkit-workspace.instructions.md'),
        buildCopilotWorkspaceInstructions(),
        write
      ),
      '.github/instructions/rapidkit-workspace.instructions.md'
    );
    record(
      await writeTextFile(
        path.join(workspacePath, '.github/instructions/rapidkit-evidence.instructions.md'),
        buildCopilotEvidenceInstructions(),
        write
      ),
      '.github/instructions/rapidkit-evidence.instructions.md'
    );
    record(
      await writeTextFile(
        path.join(workspacePath, '.github/prompts/rapidkit-diagnose.prompt.md'),
        buildCopilotDiagnosePrompt(),
        write
      ),
      '.github/prompts/rapidkit-diagnose.prompt.md'
    );
    if (preset === 'enterprise') {
      const promptDefinitions = [
        [
          '.github/prompts/rapidkit-repair.prompt.md',
          buildWorkflowPrompt({
            description: 'Repair RapidKit blockers with evidence and verification',
            objective: 'Plan the smallest safe repair for the current RapidKit blocker.',
            expectedOutput: [
              'Blocker and affected workspace/project scope',
              'Evidence paths and exact failing signals',
              'Minimal fix plan',
              'Human-run commands',
              'Verification command and expected success signal',
            ],
          }),
        ],
        [
          '.github/prompts/rapidkit-release-readiness.prompt.md',
          buildWorkflowPrompt({
            description: 'Assess RapidKit release readiness from evidence',
            objective: 'Assess whether this workspace is release-ready using RapidKit gates.',
            expectedOutput: [
              'Readiness verdict with cited reports',
              'Blocking gates',
              'Safe next command',
              'Verification checklist',
            ],
          }),
        ],
        [
          '.github/prompts/rapidkit-project-onboard.prompt.md',
          buildWorkflowPrompt({
            description: 'Onboard a project into RapidKit Workspace Intelligence',
            objective:
              'Guide project onboarding using workspace model and create planner capabilities.',
            expectedOutput: [
              'Target project scope',
              'Native create, external create-adopt, or adopt-only lane',
              'Safe commands',
              'Post-onboarding verification',
            ],
          }),
        ],
        [
          '.github/prompts/rapidkit-adopt-project.prompt.md',
          buildWorkflowPrompt({
            description: 'Adopt an existing project into RapidKit governance',
            objective: 'Adopt an existing project without changing its runtime behavior.',
            expectedOutput: [
              'Detected stack and confidence',
              'Adoption plan',
              'Generated metadata expectations',
              'Doctor and workspace model verification',
            ],
          }),
        ],
      ] as const;

      for (const [relativePath, content] of promptDefinitions) {
        record(
          await writeTextFile(path.join(workspacePath, relativePath), content, write),
          relativePath
        );
      }

      if (options.hydratePrompts === true) {
        for (const relativePath of await hydrateOperationalPrompts({
          workspacePath,
          skills: skillsWrite.skills,
          write,
        })) {
          record(write ? 'written' : 'skipped', relativePath);
        }
      }
    }
    record(
      await writeTextFile(
        path.join(workspacePath, '.github/skills/rapidkit-grounding/SKILL.md'),
        buildCopilotSkill(),
        write
      ),
      '.github/skills/rapidkit-grounding/SKILL.md'
    );
    if (preset === 'enterprise') {
      record(
        await writeTextFile(
          path.join(workspacePath, '.github/skills/rapidkit-workspace-intelligence/SKILL.md'),
          buildWorkspaceIntelligenceSkill(operationalSkillsCatalogSection),
          write
        ),
        '.github/skills/rapidkit-workspace-intelligence/SKILL.md'
      );
      const resources = [
        [
          'artifact-map.md',
          buildSkillResource({
            title: 'Artifact Map',
            lines: AGENT_REPORT_CATALOG.map(
              (entry) => `- \`${entry.relativePath}\` — ${entry.label}`
            ),
          }),
        ],
        [
          'command-map.md',
          buildSkillResource({
            title: 'Command Map',
            lines: [
              '- `npx rapidkit workspace agent-sync --write --refresh-context` — refresh agent grounding.',
              '- `npx rapidkit workspace model --json --write` — refresh workspace model.',
              '- `npx rapidkit doctor workspace` — refresh health evidence.',
              '- `npx rapidkit workspace verify --strict --json` — verify release gates.',
            ],
          }),
        ],
        [
          'scope-model.md',
          buildSkillResource({
            title: 'Scope Model',
            lines: [
              '- Workspace scope is the default source of truth.',
              '- Project scope is selected only when the active task targets a specific project.',
              '- Always name the workspace and project when giving repair or lifecycle advice.',
            ],
          }),
        ],
        [
          'runtime-support.md',
          buildSkillResource({
            title: 'Runtime Support',
            lines: [
              '- Native create is available only for RapidKit-owned scaffold contracts.',
              '- Unsupported stacks should use external-create-adopt when a stable ecosystem generator exists.',
              '- Existing projects should use adopt-only when native create is unavailable.',
            ],
          }),
        ],
        [
          'create-planner-capabilities.md',
          buildSkillResource({
            title: 'Create Planner Capabilities',
            lines: [
              '- Use `contracts/create-planner-capabilities.v1.json` to decide native-create, external-create-adopt, or adopt-only.',
              '- Do not map PHP, WordPress, Laravel, Rails, or Symfony requests to unrelated native kits.',
              '- Explain unsupported native create requests and guide users to adopt/import.',
            ],
          }),
        ],
        ['mcp-tools.md', buildMcpToolsResource()],
      ] as const;

      for (const [fileName, content] of resources) {
        const relativePath = `.github/skills/rapidkit-workspace-intelligence/resources/${fileName}`;
        record(
          await writeTextFile(path.join(workspacePath, relativePath), content, write),
          relativePath
        );
      }

      const agents = [
        [
          'workspai-advisor.agent.md',
          buildWorkspaiAgent({
            name: 'Workspai Advisor',
            description: 'Read-only workspace and project guidance using RapidKit evidence',
            mode: 'read-only',
            tools: ['search', 'read'],
          }),
        ],
        [
          'workspai-repair.agent.md',
          buildWorkspaiAgent({
            name: 'Workspai Repair',
            description: 'Turn RapidKit blockers into minimal fixes and verification steps',
            mode: 'repair',
            tools: ['search', 'read', 'edit'],
          }),
        ],
        [
          'workspai-release.agent.md',
          buildWorkspaiAgent({
            name: 'Workspai Release',
            description: 'Assess readiness, governance gates, and release safety from evidence',
            mode: 'release',
            tools: ['search', 'read'],
          }),
        ],
        [
          'workspai-project-onboarder.agent.md',
          buildWorkspaiAgent({
            name: 'Workspai Project Onboarder',
            description: 'Guide create, import, and adopt flows with RapidKit contracts',
            mode: 'onboard',
            tools: ['search', 'read', 'edit'],
          }),
        ],
      ] as const;

      for (const [fileName, content] of agents) {
        const relativePath = `.github/agents/${fileName}`;
        record(
          await writeTextFile(path.join(workspacePath, relativePath), content, write),
          relativePath
        );
      }
    }
  }

  if (preset === 'enterprise') {
    record(
      await writeTextFile(
        path.join(workspacePath, '.rapidkit/reports/rapidkit-mcp-design.json'),
        buildMcpDesignManifest({ workspacePath, generatedAt: index.generatedAt }),
        write
      ),
      '.rapidkit/reports/rapidkit-mcp-design.json'
    );
  }

  if (preset === 'enterprise' && options.experimentalHooks === true) {
    record(
      await writeTextFile(
        path.join(workspacePath, '.vscode/rapidkit-agent-hooks.json'),
        buildExperimentalHooksConfig({ workspacePath, generatedAt: index.generatedAt }),
        write
      ),
      '.vscode/rapidkit-agent-hooks.json'
    );
  }

  if (targetEnabled(selectedTargets, 'codex') || targetEnabled(selectedTargets, 'orca')) {
    // Codex/Grok/Orca: rely on AGENTS.md + INDEX; no separate proprietary format yet.
    if (!targetEnabled(selectedTargets, 'agents')) {
      record(
        await writeManagedMarkdownFile({
          absolutePath: path.join(workspacePath, 'AGENTS.md'),
          generatedBody: buildAgentsMarkdown({ index, context }),
          write,
        }),
        'AGENTS.md'
      );
    }
  }

  const finalIndex = write
    ? await buildWorkspaceAgentReportsIndex({
        workspacePath,
        staleAfterHours,
        now,
      })
    : index;
  const missingRequired = finalIndex.reports
    .filter((report) => report.required && !report.exists)
    .map((r) => r.path);
  const staleReports = finalIndex.reports
    .filter((report) => report.exists && isStale(report.generatedAt, staleAfterHours, now))
    .map((report) => report.path);

  if (strict) {
    if (missingRequired.length > 0) {
      strictViolations.push(`Missing required reports: ${missingRequired.join(', ')}`);
    }
    if (staleReports.length > 0) {
      strictViolations.push(`Stale reports (>${staleAfterHours}h): ${staleReports.join(', ')}`);
    }
    const unsafeOutputs = outputs
      .map((output) => output.path)
      .filter((relativePath) => !isSafeWorkspaceRelativePath(relativePath));
    if (unsafeOutputs.length > 0) {
      strictViolations.push(`Unsafe generated output paths: ${unsafeOutputs.join(', ')}`);
    }
  }

  const pack = buildAgentCustomizationPackReport({
    workspacePath,
    generatedAt: now.toISOString(),
    preset,
    targets: selectedTargetList,
    index: finalIndex,
    outputs: [
      ...outputs,
      {
        path: AGENT_CUSTOMIZATION_PACK_REPORT_PATH,
        kind: 'report',
        targets: ['agents', 'vscode', 'copilot', 'codex', 'orca'],
        required: true,
        status: write ? 'written' : options.dryRun ? 'planned' : 'skipped',
      },
    ],
    missingRequired,
    staleReports,
    strictViolations,
    experimentalHooks: options.experimentalHooks === true,
  });

  record(
    await writeTextFile(
      path.join(workspacePath, AGENT_CUSTOMIZATION_PACK_REPORT_PATH),
      `${JSON.stringify(pack, null, 2)}\n`,
      write
    ),
    AGENT_CUSTOMIZATION_PACK_REPORT_PATH
  );

  return {
    workspacePath,
    indexPath: path.join(workspacePath, AGENT_REPORTS_INDEX_PATH),
    packPath: path.join(workspacePath, AGENT_CUSTOMIZATION_PACK_REPORT_PATH),
    pack,
    contextPath,
    writtenFiles,
    skippedFiles,
    blockers: index.blockers,
    missingRequired,
    staleReports,
    strictViolations,
  };
}
