import type { WorkspaceRunStageName } from './cli-lifecycle-contract.js';
import {
  resolveProjectCommandCapabilities,
  type ProjectCommandCapabilities,
} from './project-command-capabilities.js';

const WORKSPACE_STAGE_TO_CAPABILITY: Record<WorkspaceRunStageName, string> = {
  init: 'init',
  test: 'test',
  build: 'build',
  start: 'start',
};

export function resolveWorkspaceStageCapabilityCommand(stage: string): string | null {
  if (stage in WORKSPACE_STAGE_TO_CAPABILITY) {
    return WORKSPACE_STAGE_TO_CAPABILITY[stage as WorkspaceRunStageName];
  }
  return null;
}

export function isWorkspaceStageSupported(
  projectPath: string,
  stage: string,
  capabilities: ProjectCommandCapabilities = resolveProjectCommandCapabilities(projectPath)
): { supported: boolean; reason?: string } {
  const capabilityCommand = resolveWorkspaceStageCapabilityCommand(stage);
  if (!capabilityCommand) {
    return {
      supported: false,
      reason: `Workspace stage "${stage}" is not part of the RapidKit fleet contract.`,
    };
  }

  if (!capabilities.projectRoot) {
    return {
      supported: false,
      reason: 'No RapidKit project metadata was detected for this target.',
    };
  }

  const capability = capabilities.commandMap[capabilityCommand];
  if (!capability || capability.status !== 'supported') {
    return {
      supported: false,
      reason:
        capability?.reason ??
        `Command "${capabilityCommand}" is not supported for this project runtime/framework.`,
    };
  }

  return { supported: true };
}
