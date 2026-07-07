import os from 'os';
import path from 'path';
import { performance } from 'node:perf_hooks';
import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import { buildWorkspaceModel, buildWorkspaceModelIncremental } from '../workspace-model.js';
import { inferWorkspaceDependencyGraph } from '../workspace-dependency-graph.js';

/**
 * Performance benchmark on a large synthetic monorepo (roadmap 1.23).
 *
 * Builds a deterministic layered workspace, then times: (a) full model build,
 * (b) standalone graph inference, and (c) an incremental rebuild after a single
 * change. Assertions use generous absolute ceilings so the suite catches gross
 * regressions without being flaky. Scale up with `RK_BENCH_PROJECTS` for ad-hoc
 * large-monorepo runs (e.g. `RK_BENCH_PROJECTS=500 npm run benchmark:intelligence`).
 */

const PROJECT_COUNT = Number.parseInt(process.env.RK_BENCH_PROJECTS ?? '120', 10);
const NOW = new Date('2026-06-22T00:00:00.000Z');
/** Generous ceilings (scaled by project count) to catch gross regressions only. */
const BENCH_PERFORMANCE_CEILING_MS = 30_000 + PROJECT_COUNT * 200;
/** Vitest default (5s) is too low for Windows CI under full-suite load. */
const BENCH_TEST_TIMEOUT_MS = BENCH_PERFORMANCE_CEILING_MS + 20_000;

async function generateMonorepo(workspacePath: string, count: number): Promise<void> {
  await fsExtra.outputJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
    workspace_name: 'bench',
  });
  const writes: Array<Promise<void>> = [];
  for (let i = 0; i < count; i += 1) {
    const name = `@bench/p${i}`;
    const dependencies: Record<string, string> = {};
    // Deterministic layered edges: each project depends on the two prior ones.
    if (i >= 1) dependencies[`@bench/p${i - 1}`] = 'workspace:*';
    if (i >= 2) dependencies[`@bench/p${i - 2}`] = 'workspace:*';
    writes.push(
      fsExtra.outputJson(path.join(workspacePath, `p${i}`, 'package.json'), {
        name,
        version: '1.0.0',
        ...(Object.keys(dependencies).length > 0 ? { dependencies } : {}),
      })
    );
  }
  await Promise.all(writes);
}

describe('workspace intelligence benchmark (1.23)', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) await fsExtra.remove(dir);
    }
  });

  it(
    `builds model + graph for ${PROJECT_COUNT} projects within a generous ceiling`,
    async () => {
      const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-bench-'));
      tempDirs.push(workspacePath);
      await generateMonorepo(workspacePath, PROJECT_COUNT);

      const fullStart = performance.now();
      const model = await buildWorkspaceModel({ workspacePath, now: NOW });
      const fullMs = performance.now() - fullStart;

      expect(model.projects.length).toBe(PROJECT_COUNT);
      expect(model.graph?.nodes.length).toBe(PROJECT_COUNT);
      // Layered chain → roughly 2 edges per project (minus the first two).
      expect(model.graph!.edges.length).toBeGreaterThanOrEqual(PROJECT_COUNT - 2);

      const graphStart = performance.now();
      const graph = await inferWorkspaceDependencyGraph({ workspacePath, model, now: NOW });
      const graphMs = performance.now() - graphStart;
      expect(graph.nodes.length).toBe(PROJECT_COUNT);

      const incrStart = performance.now();
      const incremental = await buildWorkspaceModelIncremental({ workspacePath, now: NOW });
      const incrMs = performance.now() - incrStart;
      // First incremental run seeds the cache (full); a second confirms reuse.
      const incremental2Start = performance.now();
      const incremental2 = await buildWorkspaceModelIncremental({ workspacePath, now: NOW });
      const incr2Ms = performance.now() - incremental2Start;

      expect(incremental.model.graph?.nodes.length).toBe(PROJECT_COUNT);
      expect(['full', 'incremental', 'unchanged']).toContain(incremental.mode);
      expect(incremental2.mode).toBe('unchanged');

      console.log(
        `[bench] projects=${PROJECT_COUNT} fullModel=${fullMs.toFixed(1)}ms graphInfer=${graphMs.toFixed(
          1
        )}ms incrementalSeed=${incrMs.toFixed(1)}ms incrementalUnchanged=${incr2Ms.toFixed(1)}ms ` +
          `nodes=${model.graph?.nodes.length} edges=${model.graph?.edges.length}`
      );

      // Generous ceilings (scaled by project count) to catch gross regressions only.
      expect(fullMs).toBeLessThan(BENCH_PERFORMANCE_CEILING_MS);
      expect(graphMs).toBeLessThan(BENCH_PERFORMANCE_CEILING_MS);
    },
    BENCH_TEST_TIMEOUT_MS
  );
});
