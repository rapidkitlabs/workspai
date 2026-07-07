/**
 * Single source of truth for npm-wrapper lifecycle command surfaces.
 * Used by CLI routing, local launcher delegation, and strict policy gates.
 */
export const WRAPPER_LIFECYCLE_COMMANDS = [
  'build',
  'dev',
  'start',
  'test',
  'lint',
  'format',
] as const;

export type WrapperLifecycleCommand = (typeof WRAPPER_LIFECYCLE_COMMANDS)[number];

/** Fleet/workspace orchestration stages (dev is intentionally excluded). */
export const WORKSPACE_RUN_STAGES = ['init', 'test', 'build', 'start'] as const;

export type WorkspaceRunStageName = (typeof WORKSPACE_RUN_STAGES)[number];

export const PROJECT_COMMANDS_CORE_FALLBACK = ['lint', 'format', 'docs'] as const;

export type ProjectCommandCoreFallback = (typeof PROJECT_COMMANDS_CORE_FALLBACK)[number];

export function isWrapperLifecycleCommand(
  command: string | undefined
): command is WrapperLifecycleCommand {
  return !!command && (WRAPPER_LIFECYCLE_COMMANDS as readonly string[]).includes(command);
}

export function isWorkspaceRunStage(stage: string): stage is WorkspaceRunStageName {
  return (WORKSPACE_RUN_STAGES as readonly string[]).includes(stage);
}
