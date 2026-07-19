import { describe, expect, it } from 'vitest';

import {
  isWorkspaceRunStage,
  isWrapperLifecycleCommand,
  WORKSPACE_RUN_STAGES,
  WRAPPER_LIFECYCLE_COMMANDS,
} from '../utils/cli-lifecycle-contract.js';

describe('CLI lifecycle contract predicates', () => {
  it('accepts every declared wrapper lifecycle command and rejects absent or foreign values', () => {
    for (const command of WRAPPER_LIFECYCLE_COMMANDS) {
      expect(isWrapperLifecycleCommand(command), command).toBe(true);
    }
    expect(isWrapperLifecycleCommand(undefined)).toBe(false);
    expect(isWrapperLifecycleCommand('init')).toBe(false);
  });

  it('accepts only declared workspace run stages', () => {
    for (const stage of WORKSPACE_RUN_STAGES) {
      expect(isWorkspaceRunStage(stage), stage).toBe(true);
    }
    expect(isWorkspaceRunStage('dev')).toBe(false);
    expect(isWorkspaceRunStage('')).toBe(false);
  });
});
