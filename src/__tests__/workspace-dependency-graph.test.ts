import os from 'os';
import path from 'path';
import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import { buildWorkspaceModel } from '../workspace-model.js';
import {
  graphHasCycle,
  hashDependencyGraph,
  inferWorkspaceDependencyGraph,
} from '../workspace-dependency-graph.js';
import type { WorkspaceContract } from '../utils/workspace-contract.js';

const FIXED_NOW = new Date('2026-06-22T00:00:00.000Z');

function makeContract(): WorkspaceContract {
  return {
    schemaVersion: 1,
    kind: 'rapidkit.workspace.contract',
    generatedAt: FIXED_NOW.toISOString(),
    workspace: { name: 'shop' },
    projects: [
      {
        slug: 'web',
        relativePath: 'web',
        modules: [],
        ports: [],
        contracts: {
          owns: [],
          apis: [],
          publishes: [],
          consumes: ['order.created'],
          dependsOn: ['api'],
          env: ['API_URL'],
        },
      },
      {
        slug: 'api',
        relativePath: 'api',
        modules: [],
        ports: [{ name: 'http', port: 8080, protocol: 'http' }],
        contracts: {
          owns: [],
          apis: [],
          publishes: ['order.created'],
          consumes: [],
          dependsOn: [],
          env: [],
        },
      },
    ],
  };
}

describe('workspace dependency graph inference', () => {
  const tempDirs: string[] = [];

  async function makeWorkspace(): Promise<string> {
    const dir = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-graph-'));
    tempDirs.push(dir);
    await fsExtra.outputJson(path.join(dir, '.rapidkit', 'workspace.json'), {
      workspace_name: 'shop',
    });
    // api project (the dependency / producer)
    await fsExtra.outputJson(path.join(dir, 'api', 'package.json'), {
      name: '@acme/api',
      version: '1.0.0',
    });
    await fsExtra.outputFile(
      path.join(dir, 'api', 'client.ts'),
      'export const client = () => 1;\n'
    );
    // web project (the consumer) depends on api by package + cross-boundary import
    await fsExtra.outputJson(path.join(dir, 'web', 'package.json'), {
      name: '@acme/web',
      dependencies: { '@acme/api': 'workspace:*' },
    });
    await fsExtra.outputFile(
      path.join(dir, 'web', 'app.ts'),
      "import { client } from '../api/client';\nexport const run = () => client();\n"
    );
    return dir;
  }

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) await fsExtra.remove(dir);
    }
  });

  it('infers typed multi-source edges with evidence and stable ordering', async () => {
    const workspacePath = await makeWorkspace();
    const model = await buildWorkspaceModel({ workspacePath, now: FIXED_NOW });

    const graph = await inferWorkspaceDependencyGraph({
      workspacePath,
      model,
      contract: makeContract(),
      now: FIXED_NOW,
    });

    expect(graph.schemaVersion).toBe('workspace-dependency-graph.v1');
    expect(graph.nodes.map((node) => node.id)).toEqual(['api', 'web']);

    const webToApi = graph.edges.filter((edge) => edge.from === 'web' && edge.to === 'api');
    const kinds = webToApi.map((edge) => edge.kind).sort();
    expect(kinds).toEqual([
      'code-import',
      'event-pub-sub',
      'package-dep',
      'service-dependsOn',
      'shared-resource',
    ]);

    const packageDep = webToApi.find((edge) => edge.kind === 'package-dep');
    expect(packageDep?.source).toBe('inferred');
    expect(packageDep?.confidence).toBe('high');
    expect(packageDep?.evidence[0].file).toBe('web/package.json');

    const codeImport = webToApi.find((edge) => edge.kind === 'code-import');
    expect(codeImport?.source).toBe('inferred');
    expect(codeImport?.confidence).toBe('medium');
    expect(codeImport?.evidence[0].file).toBe('web/app.ts');

    const dependsOn = webToApi.find((edge) => edge.kind === 'service-dependsOn');
    expect(dependsOn?.source).toBe('contract');

    const pubSub = webToApi.find((edge) => edge.kind === 'event-pub-sub');
    expect(pubSub?.source).toBe('contract');

    const shared = webToApi.find((edge) => edge.kind === 'shared-resource');
    expect(shared?.source).toBe('inferred');
    expect(shared?.confidence).toBe('low');

    expect(graph.stats).toMatchObject({
      nodeCount: 2,
      edgeCount: 5,
      inferredEdges: 3,
      contractEdges: 2,
      manualEdges: 0,
      hasCycle: false,
    });
  });

  it('lets a manual override win over an inferred edge of the same kind', async () => {
    const workspacePath = await makeWorkspace();
    await fsExtra.outputJson(
      path.join(workspacePath, '.rapidkit', 'workspace-graph.overrides.json'),
      {
        edges: [
          {
            from: 'web',
            to: 'api',
            kind: 'code-import',
            evidence: [{ file: 'docs/architecture.md', detail: 'hand-declared link' }],
          },
        ],
      }
    );

    const model = await buildWorkspaceModel({ workspacePath, now: FIXED_NOW });
    const graph = await inferWorkspaceDependencyGraph({
      workspacePath,
      model,
      contract: makeContract(),
      now: FIXED_NOW,
    });

    const codeImport = graph.edges.find(
      (edge) => edge.from === 'web' && edge.to === 'api' && edge.kind === 'code-import'
    );
    expect(codeImport?.source).toBe('manual');
    expect(codeImport?.evidence.some((item) => item.file === 'docs/architecture.md')).toBe(true);
    expect(graph.stats.manualEdges).toBe(1);
  });

  it('is deterministic: same inputs produce the same hash', async () => {
    const workspacePath = await makeWorkspace();
    const model = await buildWorkspaceModel({ workspacePath, now: FIXED_NOW });

    const first = await inferWorkspaceDependencyGraph({
      workspacePath,
      model,
      contract: makeContract(),
      now: FIXED_NOW,
    });
    const second = await inferWorkspaceDependencyGraph({
      workspacePath,
      model,
      contract: makeContract(),
      now: FIXED_NOW,
    });

    expect(hashDependencyGraph(first)).toBe(hashDependencyGraph(second));
  });

  it('detects directed cycles for the integrity gate', () => {
    const nodes = [
      { id: 'a', path: 'a' },
      { id: 'b', path: 'b' },
    ];
    const acyclic = [
      {
        from: 'a',
        to: 'b',
        kind: 'package-dep' as const,
        source: 'inferred' as const,
        confidence: 'high' as const,
        evidence: [],
      },
    ];
    const cyclic = [
      ...acyclic,
      {
        from: 'b',
        to: 'a',
        kind: 'package-dep' as const,
        source: 'inferred' as const,
        confidence: 'high' as const,
        evidence: [],
      },
    ];
    expect(graphHasCycle(nodes, acyclic)).toBe(false);
    expect(graphHasCycle(nodes, cyclic)).toBe(true);
  });
});
