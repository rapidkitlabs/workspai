import type { WorkspaceRunStageName } from './cli-lifecycle-contract.js';
import { readProjectMetadata } from './project-metadata.js';
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

function readCustomStageOverride(projectPath: string, stage: string): string | undefined {
  const metadata = readProjectMetadata(projectPath);
  const commands = metadata?.contextJson?.commands;
  if (!commands || typeof commands !== 'object' || Array.isArray(commands)) {
    return undefined;
  }
  const override = (commands as Record<string, unknown>)[stage];
  if (typeof override === 'string' && override.trim().length > 0) {
    return override.trim();
  }
  if (override && typeof override === 'object' && !Array.isArray(override)) {
    const record = override as Record<string, unknown>;
    const preferred = record.default ?? record.dev;
    if (typeof preferred === 'string' && preferred.trim().length > 0) {
      return preferred.trim();
    }
  }
  return undefined;
}

export function isWorkspaceStageSupported(
  projectPath: string,
  stage: string,
  capabilities: ProjectCommandCapabilities = resolveProjectCommandCapabilities(projectPath)
): { supported: boolean; reason?: string; shouldFail?: boolean } {
  const capabilityCommand = resolveWorkspaceStageCapabilityCommand(stage);
  if (!capabilityCommand) {
    const customOverride = readCustomStageOverride(projectPath, stage);
    if (customOverride) {
      return { supported: true };
    }
    return {
      supported: false,
      reason: `Workspace stage "${stage}" is not part of the Workspai fleet contract.`,
    };
  }

  if (!capabilities.projectRoot) {
    return {
      supported: false,
      reason: 'No Workspai project metadata was detected for this target.',
    };
  }

  const capability = capabilities.commandMap[capabilityCommand];
  if (!capability || capability.status !== 'supported') {
    const observedOnly =
      capabilities.runtimeSupportTier === 'observed' ||
      capabilities.frameworkSupportTier === 'observed';
    return {
      supported: false,
      reason:
        capability?.reason ??
        `Command "${capabilityCommand}" is not supported for this project runtime/framework.`,
      shouldFail: !observedOnly,
    };
  }

  return { supported: true };
}
