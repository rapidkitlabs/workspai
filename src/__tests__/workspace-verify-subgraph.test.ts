import { describe, expect, it } from 'vitest';

import { computeAffectedSubgraphGate, type WorkspaceVerifyStep } from '../workspace-verify.js';
import type {
  WorkspaceImpact,
  WorkspaceImpactCommand,
  WorkspaceImpactItem,
} from '../workspace-intelligence.js';

function projectItem(name: string, origin: 'direct' | 'transitive'): WorkspaceImpactItem {
  return {
    id: `${origin}:${name}`,
    scope: 'project',
    target: name,
    title: name,
    summary: '',
    risk: 'low',
    reasons: [],
    project: {
      name,
      path: name,
      kind: 'service',
      runtime: 'node',
      framework: 'unknown',
      supportTier: 'observed',
    },
    verification: [],
    origin,
  };
}

function step(
  project: string,
  suffix: 'test' | 'build',
  status: WorkspaceVerifyStep['status'],
  required: boolean
): WorkspaceVerifyStep {
  const command: WorkspaceImpactCommand = {
    id: `project.${project}.${suffix}`,
    label: `${suffix} ${project}`,
    scope: 'project',
    project,
    display: `npx rapidkit workspace run ${suffix} --scope project:${project} --json`,
    execute: '',
    required,
  };
  return {
    id: command.id,
    label: command.label,
    scope: 'project',
    project,
    command,
    status,
    required,
    message: `${suffix} ${status}`,
  };
}

function impactWith(
  direct: string[],
  transitive: string[]
): Pick<WorkspaceImpact, 'affectedProjects' | 'transitiveImpact'> {
  return {
    affectedProjects: direct.map((name) => projectItem(name, 'direct')),
    transitiveImpact: transitive.map((name) => projectItem(name, 'transitive')),
  };
}

describe('graph-aware verify subgraph gate (1.11)', () => {
  it('gates the whole affected subgraph, not just the changed node', () => {
    const impact = impactWith(['api'], ['web', 'worker', 'db', 'cache']) as WorkspaceImpact;
    const steps: WorkspaceVerifyStep[] = [
      step('api', 'test', 'pass', true),
      step('web', 'test', 'fail', false), // failed dependent → block
      step('worker', 'test', 'missing', true), // missing required dependent → block
      step('db', 'test', 'missing', false), // missing non-required dependent → needs-attention
      // cache has no verification step at all → unverifiable
    ];

    const gate = computeAffectedSubgraphGate(impact, steps);

    expect(gate.subgraph.directlyChanged).toEqual(['api']);
    expect(gate.subgraph.transitiveDependents).toEqual(['cache', 'db', 'web', 'worker']);
    expect(gate.subgraph.covered).toEqual(['api']);
    expect(gate.subgraph.uncovered).toEqual(['db', 'web', 'worker']);
    expect(gate.subgraph.unverifiable).toEqual(['cache']);

    expect(gate.blockingReasons.some((reason) => reason.includes('graph.subgraph.web'))).toBe(true);
    expect(gate.blockingReasons.some((reason) => reason.includes('graph.subgraph.worker'))).toBe(
      true
    );
    // db is only missing + non-required → escalates, does not hard-block.
    expect(gate.blockingReasons.some((reason) => reason.includes('graph.subgraph.db'))).toBe(false);
    expect(gate.needsAttention).toBe(true);
  });

  it('reports a fully covered subgraph as covered with no blocking', () => {
    const impact = impactWith(['api'], ['web']) as WorkspaceImpact;
    const steps: WorkspaceVerifyStep[] = [
      step('api', 'test', 'pass', true),
      step('web', 'test', 'pass', true),
    ];

    const gate = computeAffectedSubgraphGate(impact, steps);
    expect(gate.subgraph.covered).toEqual(['api', 'web']);
    expect(gate.subgraph.uncovered).toEqual([]);
    expect(gate.blockingReasons).toEqual([]);
    expect(gate.needsAttention).toBe(false);
  });
});
