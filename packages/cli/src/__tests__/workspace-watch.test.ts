import { describe, expect, it } from 'vitest';

import {
  WorkspaceWatchEngine,
  diffWatchModels,
  computeWatchModelHash,
  isWatchRelevantPath,
  WORKSPACE_WATCH_EVENT_SCHEMA_VERSION,
} from '../workspace-watch.js';
import type { WorkspaceModel, WorkspaceModelIncrementalMode } from '../workspace-model.js';
import type { WorkspaceGraphEdge } from '../contracts/workspace-dependency-graph-contract.js';

function edge(from: string, to: string): WorkspaceGraphEdge {
  return { from, to, kind: 'package-dep', source: 'inferred', confidence: 'high', evidence: [] };
}

function model(
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

function project(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { name, path: name, kind: 'service', runtime: 'node', framework: 'unknown', ...extra };
}

/** Build a fake rebuild that yields a queue of models with explicit modes. */
function fakeRebuild(
  sequence: Array<{ model: WorkspaceModel; mode: WorkspaceModelIncrementalMode }>
) {
  let i = 0;
  return async () => sequence[Math.min(i++, sequence.length - 1)];
}

describe('workspace watch engine (1.17)', () => {
  it('emits a ready event with the initial in-memory model', async () => {
    const initial = model([project('api'), project('core')], [edge('api', 'core')]);
    const engine = new WorkspaceWatchEngine(
      { workspacePath: '/tmp/ws' },
      {
        rebuild: fakeRebuild([{ model: initial, mode: 'full' }]),
        now: () => new Date('2026-06-22T00:00:00.000Z'),
      }
    );
    const ready = await engine.start();
    expect(ready.schemaVersion).toBe(WORKSPACE_WATCH_EVENT_SCHEMA_VERSION);
    expect(ready.kind).toBe('ready');
    expect(ready.mode).toBe('initial');
    expect(ready.graph.nodeCount).toBe(2);
    expect(ready.graph.edgeCount).toBe(1);
    expect(ready.modelHashChanged).toBe(true);
    expect(engine.currentModel).toBe(initial);
  });

  it('emits a changed event when a project content changes', async () => {
    const before = model([project('api'), project('core')], [edge('api', 'core')]);
    const after = model(
      [project('api'), project('core', { framework: 'changed' })],
      [edge('api', 'core')]
    );
    const engine = new WorkspaceWatchEngine(
      { workspacePath: '/tmp/ws' },
      {
        rebuild: fakeRebuild([
          { model: before, mode: 'full' },
          { model: after, mode: 'incremental' },
        ]),
      }
    );
    await engine.start();
    const event = await engine.pulse();
    expect(event.kind).toBe('changed');
    expect(event.mode).toBe('incremental');
    expect(event.changedProjects).toEqual(['core']);
    expect(event.modelHashChanged).toBe(true);
    expect(event.sequence).toBe(1);
  });

  it('emits unchanged when nothing structural moved', async () => {
    const same = model([project('api'), project('core')], [edge('api', 'core')]);
    const engine = new WorkspaceWatchEngine(
      { workspacePath: '/tmp/ws' },
      {
        rebuild: fakeRebuild([
          { model: same, mode: 'full' },
          { model: same, mode: 'unchanged' },
        ]),
      }
    );
    await engine.start();
    const event = await engine.pulse();
    expect(event.kind).toBe('unchanged');
    expect(event.changedProjects).toEqual([]);
    expect(event.modelHashChanged).toBe(false);
  });

  it('detects added/removed projects and graph edge deltas', () => {
    const before = model([project('api'), project('core')], [edge('api', 'core')]);
    const after = model(
      [project('api'), project('core'), project('web')],
      [edge('api', 'core'), edge('web', 'api')]
    );
    const diff = diffWatchModels(before, after);
    expect(diff.addedProjects).toEqual(['web']);
    expect(diff.removedProjects).toEqual([]);
    expect(diff.edgesAdded).toEqual([{ from: 'web', to: 'api', kind: 'package-dep' }]);
    expect(diff.edgesRemoved).toEqual([]);
  });

  it('model hash is deterministic and structure-only', () => {
    const a = model([project('api'), project('core')], [edge('api', 'core')]);
    const b = model([project('core'), project('api')], [edge('api', 'core')]);
    // Same structure, different ordering / no timestamps → identical hash.
    expect(computeWatchModelHash(a)).toBe(computeWatchModelHash(b));
  });

  it('ignores generated outputs but keeps project markers relevant', () => {
    expect(isWatchRelevantPath('services/api/src/main.ts')).toBe(true);
    expect(isWatchRelevantPath('.workspai/reports/workspace-model-cache.json')).toBe(false);
    expect(isWatchRelevantPath('node_modules/foo/index.js')).toBe(false);
    expect(isWatchRelevantPath('web/dist/bundle.js')).toBe(false);
    expect(isWatchRelevantPath('.git/HEAD')).toBe(false);
    // Project + workspace markers DO change the model and must trigger rebuilds.
    expect(isWatchRelevantPath('services/api/.rapidkit/project.json')).toBe(true);
    expect(isWatchRelevantPath('.rapidkit/workspace.json')).toBe(true);
  });
});
