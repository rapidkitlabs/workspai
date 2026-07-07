import { describe, expect, it } from 'vitest';

import {
  EXTERNAL_CREATE_ADOPT_CANDIDATES,
  resolveCreatePlannerCapability,
} from '../utils/create-planner-capabilities';
import { listFrontendGenerators } from '../frontend-project';
import { listInteractiveKits, resolveKitDefinition } from '../utils/kit-registry';

describe('create planner capabilities', () => {
  it('keeps every interactive kit in the native-create lane', () => {
    const nativeKitIds = [
      ...listInteractiveKits().map((kit) => kit.id),
      ...listFrontendGenerators().map((definition) => definition.kitId),
    ];

    for (const kitId of nativeKitIds) {
      const capability = resolveCreatePlannerCapability({ kitId });
      expect(capability).toMatchObject({
        lane: 'native-create',
        status: 'available',
        canExecuteCreate: true,
        resolved: kitId,
      });
    }
  });

  it('keeps external generator ecosystems planned and routed through adopt fallback', () => {
    for (const alias of ['wordpress', 'wordpress-block', 'laravel', 'symfony', 'rails']) {
      const capability = resolveCreatePlannerCapability({ framework: alias });
      expect(capability.lane).toBe('external-create-adopt');
      expect(capability.status).toBe('planned');
      expect(capability.canExecuteCreate).toBe(false);
      expect(capability.fallbackLane).toBe('adopt-only');
    }
  });

  it('does not publish planned external ecosystems as native kit definitions', () => {
    for (const candidate of EXTERNAL_CREATE_ADOPT_CANDIDATES) {
      expect(resolveKitDefinition(candidate.id)).toBeNull();
    }
  });

  it('routes existing or generic runtime projects through adopt-only', () => {
    expect(resolveCreatePlannerCapability({ runtime: 'php', projectExists: true })).toMatchObject({
      lane: 'adopt-only',
      status: 'available',
      canExecuteCreate: false,
    });
    expect(resolveCreatePlannerCapability({ runtime: 'php' })).toMatchObject({
      lane: 'adopt-only',
      status: 'available',
      canExecuteCreate: false,
    });
  });
});
