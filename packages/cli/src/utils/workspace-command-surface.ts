/**
 * Canonical `workspai workspace <action>` command surface.
 *
 * Single source of truth consumed by:
 * - `rapidkit commands --json` (runtime capability detection for IDE/CI)
 * - the generated `runtime-command-surface.v1` contract
 * - the `workspace <action>` unknown-action help text
 *
 * Workspai (the VS Code extension) and any other IDE/CI integration MUST detect
 * these capabilities from the contract or `commands --json`, never by
 * regex-parsing `rapidkit --help` text.
 */
export const WORKSPACE_SUBCOMMANDS = [
  'list',
  'sync',
  'registry',
  'foundation',
  'model',
  'snapshot',
  'diff',
  'impact',
  'verify',
  'graph',
  'watch',
  'context',
  'agent-sync',
  'remediation-plan',
  'explain',
  'why',
  'trace',
  'feedback',
  'mcp',
  'policy',
  'contract',
  'share',
  'export',
  'archive',
  'hydrate',
  'import',
  'run',
  'init',
] as const;

export type WorkspaceSubcommand = (typeof WORKSPACE_SUBCOMMANDS)[number];

/**
 * Deterministic Workspace Intelligence chain plus agent grounding subcommands.
 *
 * These are the capabilities the extension gates on before running the
 * intelligence chain, advisor, or agent context pack. Order follows the
 * canonical chain: model -> snapshot -> diff -> impact -> verify -> context
 * -> agent-sync -> explain -> why -> trace.
 */
export const WORKSPACE_INTELLIGENCE_SUBCOMMANDS = [
  'model',
  'snapshot',
  'diff',
  'impact',
  'verify',
  'context',
  'agent-sync',
  'remediation-plan',
  'explain',
  'why',
  'trace',
] as const;

export type WorkspaceIntelligenceSubcommand = (typeof WORKSPACE_INTELLIGENCE_SUBCOMMANDS)[number];

export function isWorkspaceSubcommand(value: string): value is WorkspaceSubcommand {
  return (WORKSPACE_SUBCOMMANDS as readonly string[]).includes(value);
}

export function isWorkspaceIntelligenceSubcommand(
  value: string
): value is WorkspaceIntelligenceSubcommand {
  return (WORKSPACE_INTELLIGENCE_SUBCOMMANDS as readonly string[]).includes(value);
}
