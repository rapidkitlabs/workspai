import { describe, expect, it } from 'vitest';

import type {
  WorkspaceGraphEdge,
  WorkspaceGraphEdgeKind,
} from '../contracts/workspace-dependency-graph-contract.js';
import { computeGraphCentrality } from '../workspace-graph-centrality.js';

function edge(
  from: string,
  to: string,
  kind: WorkspaceGraphEdgeKind = 'package-dep'
): WorkspaceGraphEdge {
  return { from, to, kind, source: 'inferred', confidence: 'high', evidence: [] };
}

// web → api → core ; worker → api ; cli → core
// `core` is depended on (directly or transitively) by everything else.
const graph = {
  nodes: [
    { id: 'api', path: 'api' },
    { id: 'cli', path: 'cli' },
    { id: 'core', path: 'core' },
    { id: 'web', path: 'web' },
    { id: 'worker', path: 'worker' },
  ],
  edges: [edge('web', 'api'), edge('worker', 'api'), edge('api', 'core'), edge('cli', 'core')],
};

describe('workspace graph centrality', () => {
  it('computes fan-in/fan-out/reach and flags critical-path hotspots', () => {
    const centrality = computeGraphCentrality(graph);

    const core = centrality.byId.get('core')!;
    // core is depended on directly by api + cli (fanIn 2) and transitively reaches
    // api, cli, web, worker (reach 4).
    expect(core.fanIn).toBe(2);
    expect(core.fanOut).toBe(0);
    expect(core.reach).toBe(4);
    expect(core.isHotspot).toBe(true);

    const api = centrality.byId.get('api')!;
    expect(api.fanIn).toBe(2); // web + worker
    expect(api.fanOut).toBe(1); // core
    expect(api.reach).toBe(2); // web + worker
    expect(api.isHotspot).toBe(true); // reach 2 >= ceil(4/2)=2

    const web = centrality.byId.get('web')!;
    expect(web.reach).toBe(0);
    expect(web.isHotspot).toBe(false);

    // `api` is the intermediary on the shortest paths web→core and worker→core,
    // so it carries the betweenness; the sink `core` carries none.
    expect(api.betweenness).toBeGreaterThan(0);
    expect(core.betweenness).toBe(0);

    // hotspots ranked by reach desc: core (4) before api (2).
    expect(centrality.hotspots[0]).toBe('core');
    expect(centrality.hotspots).toContain('api');
  });

  it('is deterministic across runs', () => {
    const a = computeGraphCentrality(graph);
    const b = computeGraphCentrality(graph);
    expect(a.hotspots).toEqual(b.hotspots);
    expect(a.byId.get('api')).toEqual(b.byId.get('api'));
  });
});
