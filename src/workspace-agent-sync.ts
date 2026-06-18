import path from 'path';
import fsExtra from 'fs-extra';

import {
  buildWorkspaceAgentContext,
  WORKSPACE_CONTEXT_AGENT_REPORT_PATH,
  writeWorkspaceAgentContext,
  type WorkspaceContextAgent,
} from './workspace-context.js';

export const AGENT_REPORTS_INDEX_SCHEMA = 'rapidkit-agent-reports-index.v1';
export const AGENT_REPORTS_INDEX_PATH = '.rapidkit/reports/INDEX.json';
export const AGENT_GROUNDING_DOC_PATH = '.rapidkit/AGENT-GROUNDING.md';

export type AgentGroundingTarget =
  | 'all'
  | 'agents'
  | 'copilot'
  | 'cursor'
  | 'claude'
  | 'codex'
  | 'orca';

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
  write?: boolean;
  dryRun?: boolean;
  strict?: boolean;
  staleAfterHours?: number;
  refreshContext?: boolean;
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

export async function syncWorkspaceAgentGrounding(
  options: SyncWorkspaceAgentGroundingOptions
): Promise<AgentGroundingSyncResult> {
  const workspacePath = path.resolve(options.workspacePath);
  const now = new Date();
  const staleAfterHours = options.staleAfterHours ?? 24;
  const selectedTargets = normalizeTargets(options.targets);
  const write = options.write === true;
  const strict = options.strict === true;

  let contextPath: string | undefined;
  let context: Awaited<ReturnType<typeof buildWorkspaceAgentContext>> | null = null;

  if (options.refreshContext) {
    context = await buildWorkspaceAgentContext({
      workspacePath,
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

  const missingRequired = index.reports
    .filter((report) => report.required && !report.exists)
    .map((r) => r.path);
  const staleReports = index.reports
    .filter((report) => report.exists && isStale(report.generatedAt, staleAfterHours, now))
    .map((report) => report.path);

  const strictViolations: string[] = [];
  if (strict) {
    if (missingRequired.length > 0) {
      strictViolations.push(`Missing required reports: ${missingRequired.join(', ')}`);
    }
    if (staleReports.length > 0) {
      strictViolations.push(`Stale reports (>${staleAfterHours}h): ${staleReports.join(', ')}`);
    }
  }

  const writtenFiles: string[] = [];
  const skippedFiles: string[] = [];

  const record = (result: 'written' | 'skipped', relativePath: string) => {
    if (result === 'written') {
      writtenFiles.push(relativePath);
    } else {
      skippedFiles.push(relativePath);
    }
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

  if (targetEnabled(selectedTargets, 'agents')) {
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

  if (targetEnabled(selectedTargets, 'copilot')) {
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
    record(
      await writeTextFile(
        path.join(workspacePath, '.github/skills/rapidkit-grounding/SKILL.md'),
        buildCopilotSkill(),
        write
      ),
      '.github/skills/rapidkit-grounding/SKILL.md'
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

  return {
    workspacePath,
    indexPath: path.join(workspacePath, AGENT_REPORTS_INDEX_PATH),
    contextPath,
    writtenFiles,
    skippedFiles,
    blockers: index.blockers,
    missingRequired,
    staleReports,
    strictViolations,
  };
}
