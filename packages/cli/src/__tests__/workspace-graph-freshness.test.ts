import { describe, expect, it } from 'vitest';

import {
  compareFreshness,
  computeProjectFreshnessHashes,
  freshnessHashRecord,
} from '../workspace-graph-freshness.js';
import type { WorkspaceModel } from '../workspace-model.js';
import type { WorkspaceGraphEdge } from '../contracts/workspace-dependency-graph-contract.js';

function project(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { name, path: name, kind: 'service', runtime: 'node', framework: 'unknown', ...extra };
}

function edge(from: string, to: string): WorkspaceGraphEdge {
  return { from, to, kind: 'package-dep', source: 'inferred', confidence: 'high', evidence: [] };
}

function modelWith(
  projects: Array<Record<string, unknown>>,
  edges: WorkspaceGraphEdge[]
): WorkspaceModel {
  return {
    projects,
    graph: {
      schemaVersion: 'workspace-dependency-graph.v1',
      generatedAt: '2026-06-22T00:00:00.000Z',
      nodes: projects.map((p) => ({ id: p.name as string, path: p.name as string })),
      edges,
      stats: {
        nodeCount: projects.length,
        edgeCount: edges.length,
        inferredEdges: edges.length,
        contractEdges: 0,
        manualEdges: 0,
        hasCycle: false,
      },
    },
  } as unknown as WorkspaceModel;
}

describe('workspace graph transitive freshness (1.18)', () => {
  it('propagates a dependency change to its dependents transitively', () => {
    // web -> api -> core
    const baseModel = modelWith(
      [project('core'), project('api'), project('web')],
      [edge('web', 'api'), edge('api', 'core')]
    );
    const before = computeProjectFreshnessHashes(baseModel);

    // core changes; web and api depend on it (directly/transitively).
    const changedModel = modelWith(
      [project('core', { framework: 'changed' }), project('api'), project('web')],
      [edge('web', 'api'), edge('api', 'core')]
    );
    const after = computeProjectFreshnessHashes(changedModel);

    // core's own + transitive hash changed.
    expect(after.get('core')!.transitiveInputsHash).not.toBe(
      before.get('core')!.transitiveInputsHash
    );
    // api depends on core => transitive hash changed even though api's own didn't.
    expect(after.get('api')!.ownHash).toBe(before.get('api')!.ownHash);
    expect(after.get('api')!.transitiveInputsHash).not.toBe(
      before.get('api')!.transitiveInputsHash
    );
    // web depends transitively on core => also changed.
    expect(after.get('web')!.transitiveInputsHash).not.toBe(
      before.get('web')!.transitiveInputsHash
    );
  });

  it('does not change a project whose dependencies are unaffected', () => {
    const model = modelWith(
      [project('core'), project('api'), project('web')],
      [edge('web', 'api'), edge('api', 'core')]
    );
    const before = computeProjectFreshnessHashes(model);
    // Change web (a leaf dependent): core/api do not depend on web, so unaffected.
    const changed = modelWith(
      [project('core'), project('api'), project('web', { framework: 'changed' })],
      [edge('web', 'api'), edge('api', 'core')]
    );
    const after = computeProjectFreshnessHashes(changed);
    expect(after.get('core')!.transitiveInputsHash).toBe(before.get('core')!.transitiveInputsHash);
    expect(after.get('api')!.transitiveInputsHash).toBe(before.get('api')!.transitiveInputsHash);
    expect(after.get('web')!.transitiveInputsHash).not.toBe(
      before.get('web')!.transitiveInputsHash
    );
  });

  it('is cycle-safe and deterministic', () => {
    const model = modelWith([project('a'), project('b')], [edge('a', 'b'), edge('b', 'a')]);
    const first = computeProjectFreshnessHashes(model);
    const second = computeProjectFreshnessHashes(model);
    expect(freshnessHashRecord(first)).toEqual(freshnessHashRecord(second));
  });

  it('compareFreshness yields unknown without a baseline, then fresh/stale', () => {
    const model = modelWith([project('api')], []);
    const hashes = computeProjectFreshnessHashes(model);
    expect(compareFreshness(hashes, undefined).verdict).toBe('unknown');

    const record = freshnessHashRecord(hashes);
    expect(compareFreshness(hashes, record).verdict).toBe('fresh');

    const changedModel = modelWith([project('api', { framework: 'changed' })], []);
    const changedHashes = computeProjectFreshnessHashes(changedModel);
    const comparison = compareFreshness(changedHashes, record);
    expect(comparison.verdict).toBe('stale');
    expect(comparison.changed).toEqual(['api']);
  });
});
