import { describe, expect, it } from 'vitest';

import { buildProjectEntryCapabilityContract } from '../../contracts/project-entry-capability-contract';

describe('project entry capability contract', () => {
  it('defines adopt/import as open-ended for readable projects', () => {
    const contract = buildProjectEntryCapabilityContract();

    expect(contract.plainLanguageRule).toContain('Any readable project can enter');
    expect(contract.universalExistingProjectEntry.appliesTo).toEqual(
      expect.arrayContaining(['known runtimes, unknown runtimes, and mixed stacks'])
    );
    expect(contract.universalExistingProjectEntry.doesNotRequire).toEqual(
      expect.arrayContaining(['native scaffold support', 'a known runtime detector'])
    );
  });

  it('keeps runtime signals as hints, not an allowlist', () => {
    const contract = buildProjectEntryCapabilityContract();

    expect(contract.runtimeSignals.examples).toEqual(
      expect.arrayContaining(['php', 'ruby', 'rust'])
    );
    expect(contract.runtimeSignals.rule).toBe(
      'Runtime signals are examples for detection and messaging, not a closed allowlist for adopt/import.'
    );
    expect(contract.boundaries.forbiddenClaims).toContain(
      'Do not say adopt/import supports only the listed runtime signals.'
    );
  });
});
