import { describe, expect, it } from 'vitest';

import { OFFICIAL_CREATE_CANDIDATES, resolveCreatePlannerCapability } from '../utils/create-planner-capabilities';
import { listFrontendGenerators } from '../frontend-project';
import { listInteractiveKits, resolveKitDefinition } from '../utils/kit-registry';

describe('create planner capabilities', () => {
  it('keeps Workspai-owned backend kits in the native lane', () => {
    const nativeKitIds = listInteractiveKits().map((kit) => kit.id);

    for (const kitId of nativeKitIds) {
      const capability = resolveCreatePlannerCapability({ kitId });
      expect(capability).toMatchObject({
        lane: 'native',
        status: 'available',
        canExecuteCreate: true,
        resolved: kitId,
      });
    }
  });

  it('routes official frontend generators through the available official lane', () => {
    for (const definition of listFrontendGenerators()) {
      const capability = resolveCreatePlannerCapability({ kitId: definition.kitId });
      expect(capability).toMatchObject({
        lane: 'official',
        status: 'available',
        canExecuteCreate: true,
        resolved: definition.kitId,
      });
      expect(capability.fallbackLane).toBeUndefined();
    }
  });

  it('keeps external generator ecosystems planned and routed through adopt fallback', () => {
    for (const alias of ['wordpress', 'wordpress-block', 'laravel', 'symfony', 'rails']) {
      const capability = resolveCreatePlannerCapability({ framework: alias });
      expect(capability.lane).toBe('official');
      expect(capability.status).toBe('planned');
      expect(capability.canExecuteCreate).toBe(false);
      expect(capability.fallbackLane).toBe('existing');
    }
  });

  it('does not publish planned external ecosystems as native kit definitions', () => {
    for (const candidate of OFFICIAL_CREATE_CANDIDATES) {
      expect(resolveKitDefinition(candidate.id)).toBeNull();
    }
  });

  it('routes existing or generic runtime projects through existing', () => {
    expect(resolveCreatePlannerCapability({ runtime: 'php', projectExists: true })).toMatchObject({
      lane: 'existing',
      status: 'available',
      canExecuteCreate: false,
    });
    expect(resolveCreatePlannerCapability({ runtime: 'php' })).toMatchObject({
      lane: 'existing',
      status: 'available',
      canExecuteCreate: false,
    });
    expect(resolveCreatePlannerCapability({ runtime: 'zig' })).toMatchObject({
      lane: 'existing',
      status: 'available',
      canExecuteCreate: false,
    });
  });
});
