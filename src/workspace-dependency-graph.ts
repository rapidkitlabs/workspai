import path from 'path';
import fsExtra from 'fs-extra';

import {
  WORKSPACE_DEPENDENCY_GRAPH_SCHEMA_VERSION,
  WORKSPACE_GRAPH_EDGE_KINDS,
  type WorkspaceDependencyGraph,
  type WorkspaceGraphConfidence,
  type WorkspaceGraphEdge,
  type WorkspaceGraphEdgeKind,
  type WorkspaceGraphEdgeSource,
  type WorkspaceGraphEvidence,
  type WorkspaceGraphNode,
} from './contracts/workspace-dependency-graph-contract.js';
import { computeInputsHash } from './contracts/freshness-metadata-contract.js';
import type { WorkspaceModel } from './workspace-model.js';
import {
  WORKSPACE_CONTRACT_PATH,
  type WorkspaceContract,
  type WorkspaceContractProject,
} from './utils/workspace-contract.js';

/**
 * Deterministic, multi-source dependency-graph inference engine.
 *
 * This is the reasoning-engine foundation (roadmap 1.7): it derives the typed
 * inter-project edges that `impact`/`verify`/`run`/risk consume, instead of the
 * edges being hand-authored only and the traversal being locked inside
 * `workspace run`. Every edge is auditable (carries `evidence`) and provenance-
 * ranked: `manual` overrides `contract` overrides `inferred` for the same
 * `(from, to, kind)` triple. Ordering and hashing are stable so the graph can be
 * embedded in `workspace-model.v1` without breaking deterministic hashing (1.8).
 */

/** Optional manual-override file: authoritative edges that win over inference. */
export const WORKSPACE_GRAPH_OVERRIDES_PATH = '.rapidkit/workspace-graph.overrides.json';

const SCANNABLE_IMPORT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const IMPORT_SCAN_SKIP_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  '.rapidkit',
  '.venv',
  'node_modules',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  'htmlcov',
  '.next',
  '.turbo',
  '.cache',
]);

const DEFAULT_MAX_IMPORT_FILES_PER_PROJECT = 600;
const MAX_EVIDENCE_PER_EDGE = 5;
const MAX_IMPORT_FILE_BYTES = 256 * 1024;

const SOURCE_PRECEDENCE: Record<WorkspaceGraphEdgeSource, number> = {
  inferred: 1,
  contract: 2,
  manual: 3,
};

export type InferWorkspaceDependencyGraphOptions = {
  workspacePath: string;
  model: WorkspaceModel;
  contract?: WorkspaceContract | null;
  now?: Date;
  /** Bound the per-project source scan so inference stays predictable on monorepos. */
  maxImportFilesPerProject?: number;
};

type CandidateEdge = {
  from: string;
  to: string;
  kind: WorkspaceGraphEdgeKind;
  source: WorkspaceGraphEdgeSource;
  confidence: WorkspaceGraphConfidence;
  evidence: WorkspaceGraphEvidence[];
};

type ProjectIndex = {
  /** Project id (model name) → absolute project directory. */
  idToDir: Map<string, string>;
  /** Absolute project directory → project id. */
  dirToId: Map<string, string>;
  /** Project directories sorted longest-first for most-specific containment lookup. */
  sortedDirs: Array<{ dir: string; id: string }>;
};

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

function relativeFromWorkspace(workspacePath: string, target: string): string {
  return toPosix(path.relative(workspacePath, target) || '.');
}

function buildNodes(model: WorkspaceModel): WorkspaceGraphNode[] {
  const byId = new Map<string, WorkspaceGraphNode>();
  for (const project of model.projects) {
    if (byId.has(project.name)) {
      // Duplicate project names are already flagged by model validation; keep the
      // first occurrence (projects arrive in stable, path-sorted order) so the
      // graph stays deterministic.
      continue;
    }
    byId.set(project.name, {
      id: project.name,
      path: project.path,
      ...(project.runtime ? { runtime: project.runtime } : {}),
      ...(project.framework ? { framework: project.framework } : {}),
      ...(project.kind ? { kind: project.kind } : {}),
    });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function buildProjectIndex(workspacePath: string, model: WorkspaceModel): ProjectIndex {
  const idToDir = new Map<string, string>();
  const dirToId = new Map<string, string>();
  for (const project of model.projects) {
    if (idToDir.has(project.name)) {
      continue;
    }
    const dir = project.absolutePath
      ? path.resolve(project.absolutePath)
      : path.resolve(workspacePath, project.path);
    idToDir.set(project.name, dir);
    if (!dirToId.has(dir)) {
      dirToId.set(dir, project.name);
    }
  }
  const sortedDirs = [...dirToId.entries()]
    .map(([dir, id]) => ({ dir, id }))
    .sort((a, b) => b.dir.length - a.dir.length || a.dir.localeCompare(b.dir));
  return { idToDir, dirToId, sortedDirs };
}

/** Resolve which project owns an absolute path via most-specific directory containment. */
function ownerOfPath(index: ProjectIndex, absolutePath: string): string | null {
  const resolved = path.resolve(absolutePath);
  for (const { dir, id } of index.sortedDirs) {
    if (resolved === dir || resolved.startsWith(`${dir}${path.sep}`)) {
      return id;
    }
  }
  return null;
}

async function readJson(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    if (!(await fsExtra.pathExists(filePath))) {
      return null;
    }
    const raw = await fsExtra.readJSON(filePath);
    return raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function readText(filePath: string): Promise<string | null> {
  try {
    if (!(await fsExtra.pathExists(filePath))) {
      return null;
    }
    return await fsExtra.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

// --- Source 1: package-manager dependencies ------------------------------------

async function inferPackageDependencyEdges(
  workspacePath: string,
  index: ProjectIndex
): Promise<CandidateEdge[]> {
  const edges: CandidateEdge[] = [];
  const npmNameToId = new Map<string, string>();

  for (const [id, dir] of index.idToDir.entries()) {
    const pkg = await readJson(path.join(dir, 'package.json'));
    const name = typeof pkg?.name === 'string' ? pkg.name.trim() : '';
    if (name && !npmNameToId.has(name)) {
      npmNameToId.set(name, id);
    }
  }

  for (const [id, dir] of index.idToDir.entries()) {
    const pkg = await readJson(path.join(dir, 'package.json'));
    if (pkg) {
      const depGroups = [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
      ];
      const seen = new Set<string>();
      for (const group of depGroups) {
        const block = pkg[group];
        if (!block || typeof block !== 'object' || Array.isArray(block)) {
          continue;
        }
        for (const depName of Object.keys(block as Record<string, unknown>)) {
          const target = npmNameToId.get(depName);
          if (!target || target === id || seen.has(target)) {
            continue;
          }
          seen.add(target);
          edges.push({
            from: id,
            to: target,
            kind: 'package-dep',
            source: 'inferred',
            confidence: 'high',
            evidence: [
              {
                file: relativeFromWorkspace(workspacePath, path.join(dir, 'package.json')),
                detail: `declares dependency ${depName}`,
              },
            ],
          });
        }
      }
    }

    edges.push(...(await inferPythonPathDeps(workspacePath, index, id, dir)));
    edges.push(...(await inferGoReplaceDeps(workspacePath, index, id, dir)));
  }

  return edges;
}

async function inferPythonPathDeps(
  workspacePath: string,
  index: ProjectIndex,
  fromId: string,
  dir: string
): Promise<CandidateEdge[]> {
  const text = await readText(path.join(dir, 'pyproject.toml'));
  if (!text) {
    return [];
  }
  const edges: CandidateEdge[] = [];
  const seen = new Set<string>();
  const pattern = /path\s*=\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const target = ownerOfPath(index, path.resolve(dir, match[1]));
    if (!target || target === fromId || seen.has(target)) {
      continue;
    }
    seen.add(target);
    edges.push({
      from: fromId,
      to: target,
      kind: 'package-dep',
      source: 'inferred',
      confidence: 'high',
      evidence: [
        {
          file: relativeFromWorkspace(workspacePath, path.join(dir, 'pyproject.toml')),
          detail: `path dependency ${match[1]}`,
        },
      ],
    });
  }
  return edges;
}

async function inferGoReplaceDeps(
  workspacePath: string,
  index: ProjectIndex,
  fromId: string,
  dir: string
): Promise<CandidateEdge[]> {
  const text = await readText(path.join(dir, 'go.mod'));
  if (!text) {
    return [];
  }
  const edges: CandidateEdge[] = [];
  const seen = new Set<string>();
  const pattern = /replace\s+\S+\s+=>\s+(\.[^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const target = ownerOfPath(index, path.resolve(dir, match[1]));
    if (!target || target === fromId || seen.has(target)) {
      continue;
    }
    seen.add(target);
    edges.push({
      from: fromId,
      to: target,
      kind: 'package-dep',
      source: 'inferred',
      confidence: 'high',
      evidence: [
        {
          file: relativeFromWorkspace(workspacePath, path.join(dir, 'go.mod')),
          detail: `go.mod replace ${match[1]}`,
        },
      ],
    });
  }
  return edges;
}

// --- Source 2: cross-boundary source imports -----------------------------------

async function collectSourceFiles(dir: string, max: number): Promise<string[]> {
  const files: string[] = [];
  const queue: string[] = [dir];
  while (queue.length > 0 && files.length < max) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    let entries: Array<{ isDirectory: () => boolean; isFile: () => boolean; name: string }> = [];
    try {
      entries = await fsExtra.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    const dirs: string[] = [];
    const localFiles: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IMPORT_SCAN_SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) {
          continue;
        }
        dirs.push(path.join(current, entry.name));
      } else if (entry.isFile() && SCANNABLE_IMPORT_EXTENSIONS.has(path.extname(entry.name))) {
        localFiles.push(path.join(current, entry.name));
      }
    }
    // Stable ordering: process files then nested dirs alphabetically.
    localFiles.sort((a, b) => a.localeCompare(b));
    dirs.sort((a, b) => a.localeCompare(b));
    for (const file of localFiles) {
      if (files.length >= max) {
        break;
      }
      files.push(file);
    }
    queue.push(...dirs);
  }
  return files;
}

const IMPORT_SPECIFIER_PATTERNS = [
  /\bfrom\s+["']([^"']+)["']/g,
  /\bimport\s+["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

function extractRelativeSpecifiers(content: string): string[] {
  const specifiers = new Set<string>();
  for (const pattern of IMPORT_SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const spec = match[1];
      if (spec.startsWith('.')) {
        specifiers.add(spec);
      }
    }
  }
  return [...specifiers];
}

async function inferCodeImportEdges(
  workspacePath: string,
  index: ProjectIndex,
  maxFilesPerProject: number,
  onlyFrom?: ReadonlySet<string>
): Promise<CandidateEdge[]> {
  // Aggregate evidence per (from,to) so each cross-boundary edge keeps a few
  // representative importing files instead of one edge per import.
  const byPair = new Map<
    string,
    { from: string; to: string; evidence: WorkspaceGraphEvidence[] }
  >();

  for (const [fromId, dir] of index.idToDir.entries()) {
    // Graph-aware incremental (1.16): only re-scan the source of changed projects;
    // the caller retains the unchanged projects' cached code-import edges.
    if (onlyFrom && !onlyFrom.has(fromId)) {
      continue;
    }
    const files = await collectSourceFiles(dir, maxFilesPerProject);
    for (const file of files) {
      const stat = await fsExtra.stat(file).catch(() => null);
      if (!stat || stat.size > MAX_IMPORT_FILE_BYTES) {
        continue;
      }
      const content = await readText(file);
      if (!content) {
        continue;
      }
      for (const spec of extractRelativeSpecifiers(content)) {
        const resolved = path.resolve(path.dirname(file), spec);
        const owner = ownerOfPath(index, resolved);
        if (!owner || owner === fromId) {
          continue;
        }
        const key = `${fromId}\u0000${owner}`;
        let entry = byPair.get(key);
        if (!entry) {
          entry = { from: fromId, to: owner, evidence: [] };
          byPair.set(key, entry);
        }
        if (entry.evidence.length < MAX_EVIDENCE_PER_EDGE) {
          entry.evidence.push({
            file: relativeFromWorkspace(workspacePath, file),
            detail: `imports ${spec}`,
          });
        }
      }
    }
  }

  return [...byPair.values()].map((entry) => ({
    from: entry.from,
    to: entry.to,
    kind: 'code-import',
    source: 'inferred',
    confidence: 'medium',
    evidence: entry.evidence,
  }));
}

// --- Sources 3 & 4: contract dependsOn + event publish/subscribe ----------------

function buildSlugToId(
  workspacePath: string,
  index: ProjectIndex,
  contract: WorkspaceContract
): Map<string, string> {
  const slugToId = new Map<string, string>();
  for (const project of contract.projects) {
    const target = resolveContractProjectId(workspacePath, index, project);
    if (target) {
      slugToId.set(project.slug, target);
    }
  }
  return slugToId;
}

function resolveContractProjectId(
  workspacePath: string,
  index: ProjectIndex,
  project: WorkspaceContractProject
): string | null {
  const candidates = [project.relativePath, project.externalPath].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );
  for (const candidate of candidates) {
    const abs = path.resolve(workspacePath, candidate);
    const owner = index.dirToId.get(abs) ?? ownerOfPath(index, abs);
    if (owner) {
      return owner;
    }
  }
  // Fall back to matching the slug against a known node id.
  return index.idToDir.has(project.slug) ? project.slug : null;
}

function inferContractEdges(
  workspacePath: string,
  index: ProjectIndex,
  contract: WorkspaceContract
): CandidateEdge[] {
  const edges: CandidateEdge[] = [];
  const slugToId = buildSlugToId(workspacePath, index, contract);
  const contractFile = WORKSPACE_CONTRACT_PATH;

  const publishesByEvent = new Map<string, Set<string>>();
  const consumesByEvent = new Map<string, Set<string>>();

  for (const project of contract.projects) {
    const fromId = slugToId.get(project.slug);
    if (!fromId) {
      continue;
    }
    const contracts = project.contracts ?? {
      owns: [],
      apis: [],
      publishes: [],
      consumes: [],
      dependsOn: [],
      env: [],
    };

    for (const depSlug of contracts.dependsOn ?? []) {
      const target = slugToId.get(depSlug);
      if (!target || target === fromId) {
        continue;
      }
      edges.push({
        from: fromId,
        to: target,
        kind: 'service-dependsOn',
        source: 'contract',
        confidence: 'high',
        evidence: [{ file: contractFile, detail: `dependsOn ${depSlug}` }],
      });
    }

    for (const event of contracts.publishes ?? []) {
      if (!publishesByEvent.has(event)) {
        publishesByEvent.set(event, new Set());
      }
      publishesByEvent.get(event)?.add(fromId);
    }
    for (const event of contracts.consumes ?? []) {
      if (!consumesByEvent.has(event)) {
        consumesByEvent.set(event, new Set());
      }
      consumesByEvent.get(event)?.add(fromId);
    }
  }

  for (const [event, publishers] of publishesByEvent.entries()) {
    const consumers = consumesByEvent.get(event);
    if (!consumers) {
      continue;
    }
    for (const consumer of consumers) {
      for (const publisher of publishers) {
        if (consumer === publisher) {
          continue;
        }
        edges.push({
          from: consumer,
          to: publisher,
          kind: 'event-pub-sub',
          source: 'contract',
          confidence: 'high',
          evidence: [{ file: contractFile, detail: `consumes event ${event}` }],
        });
      }
    }
  }

  edges.push(...inferSharedResourceEdges(contract, slugToId));
  return edges;
}

// --- Source 5: shared resources (env references to another service's port) ------

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function inferSharedResourceEdges(
  contract: WorkspaceContract,
  slugToId: Map<string, string>
): CandidateEdge[] {
  const edges: CandidateEdge[] = [];
  const targets = contract.projects
    .map((project) => ({ project, id: slugToId.get(project.slug) }))
    .filter((entry): entry is { project: WorkspaceContractProject; id: string } =>
      Boolean(entry.id)
    )
    .filter((entry) => normalizeToken(entry.project.slug).length >= 3);

  for (const project of contract.projects) {
    const fromId = slugToId.get(project.slug);
    if (!fromId) {
      continue;
    }
    const envEntries = project.contracts?.env ?? [];
    if (envEntries.length === 0) {
      continue;
    }
    const seen = new Set<string>();
    for (const envEntry of envEntries) {
      const normalizedEnv = normalizeToken(envEntry);
      for (const target of targets) {
        if (target.id === fromId || seen.has(target.id)) {
          continue;
        }
        const referencesOther =
          normalizedEnv.includes(normalizeToken(target.project.slug)) &&
          (target.project.ports?.length ?? 0) > 0;
        if (!referencesOther) {
          continue;
        }
        seen.add(target.id);
        edges.push({
          from: fromId,
          to: target.id,
          kind: 'shared-resource',
          source: 'inferred',
          confidence: 'low',
          evidence: [
            {
              file: WORKSPACE_CONTRACT_PATH,
              detail: `env ${envEntry} references ${target.project.slug}`,
            },
          ],
        });
      }
    }
  }
  return edges;
}

// --- Source 6: manual overrides -------------------------------------------------

async function readManualOverrideEdges(
  workspacePath: string,
  nodeIds: Set<string>
): Promise<CandidateEdge[]> {
  const payload = await readJson(path.join(workspacePath, WORKSPACE_GRAPH_OVERRIDES_PATH));
  const rawEdges = Array.isArray(payload?.edges) ? (payload?.edges as unknown[]) : [];
  const edges: CandidateEdge[] = [];
  const validKinds = new Set<string>(WORKSPACE_GRAPH_EDGE_KINDS);

  for (const raw of rawEdges) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      continue;
    }
    const row = raw as Record<string, unknown>;
    const from = typeof row.from === 'string' ? row.from : '';
    const to = typeof row.to === 'string' ? row.to : '';
    const kind = typeof row.kind === 'string' ? row.kind : '';
    if (!nodeIds.has(from) || !nodeIds.has(to) || from === to || !validKinds.has(kind)) {
      continue;
    }
    const evidence: WorkspaceGraphEvidence[] = Array.isArray(row.evidence)
      ? (row.evidence as unknown[])
          .map((item) =>
            item &&
            typeof item === 'object' &&
            typeof (item as Record<string, unknown>).file === 'string'
              ? {
                  file: (item as Record<string, unknown>).file as string,
                  ...(typeof (item as Record<string, unknown>).detail === 'string'
                    ? { detail: (item as Record<string, unknown>).detail as string }
                    : {}),
                }
              : null
          )
          .filter((item): item is WorkspaceGraphEvidence => Boolean(item))
      : [];
    edges.push({
      from,
      to,
      kind: kind as WorkspaceGraphEdgeKind,
      source: 'manual',
      confidence: 'high',
      evidence:
        evidence.length > 0
          ? evidence
          : [{ file: WORKSPACE_GRAPH_OVERRIDES_PATH, detail: 'manual edge' }],
    });
  }
  return edges;
}

// --- Merge, order, finalize -----------------------------------------------------

function edgeIdentity(edge: CandidateEdge): string {
  return `${edge.from}\u0000${edge.to}\u0000${edge.kind}`;
}

function dedupeEvidence(evidence: WorkspaceGraphEvidence[]): WorkspaceGraphEvidence[] {
  const seen = new Set<string>();
  const output: WorkspaceGraphEvidence[] = [];
  for (const item of evidence) {
    const key = `${item.file}\u0000${item.detail ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output
    .sort((a, b) => a.file.localeCompare(b.file) || (a.detail ?? '').localeCompare(b.detail ?? ''))
    .slice(0, MAX_EVIDENCE_PER_EDGE);
}

/** Resolve candidates by `(from,to,kind)`: highest-precedence source wins, evidence merges. */
function mergeEdges(candidates: CandidateEdge[]): WorkspaceGraphEdge[] {
  const byIdentity = new Map<string, CandidateEdge>();
  for (const candidate of candidates) {
    const key = edgeIdentity(candidate);
    const existing = byIdentity.get(key);
    if (!existing) {
      byIdentity.set(key, { ...candidate, evidence: [...candidate.evidence] });
      continue;
    }
    const existingRank = SOURCE_PRECEDENCE[existing.source];
    const candidateRank = SOURCE_PRECEDENCE[candidate.source];
    if (candidateRank > existingRank) {
      byIdentity.set(key, {
        ...candidate,
        evidence: [...candidate.evidence, ...existing.evidence],
      });
    } else if (candidateRank === existingRank) {
      existing.evidence.push(...candidate.evidence);
    }
    // Lower precedence: keep the authoritative edge; its evidence already won.
  }

  return [...byIdentity.values()]
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      source: edge.source,
      confidence: edge.confidence,
      evidence: dedupeEvidence(edge.evidence),
    }))
    .sort(
      (a, b) =>
        a.from.localeCompare(b.from) ||
        a.to.localeCompare(b.to) ||
        a.kind.localeCompare(b.kind) ||
        a.source.localeCompare(b.source)
    );
}

/** Detect any directed cycle (integrity signal for the 1.13 gate). */
export function graphHasCycle(nodes: WorkspaceGraphNode[], edges: WorkspaceGraphEdge[]): boolean {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) {
      adjacency.set(edge.from, []);
    }
    adjacency.get(edge.from)?.push(edge.to);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of adjacency.keys()) {
    color.set(id, WHITE);
  }

  const visit = (start: string): boolean => {
    const stack: Array<{ id: string; index: number }> = [{ id: start, index: 0 }];
    color.set(start, GRAY);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const neighbors = adjacency.get(frame.id) ?? [];
      if (frame.index >= neighbors.length) {
        color.set(frame.id, BLACK);
        stack.pop();
        continue;
      }
      const next = neighbors[frame.index];
      frame.index += 1;
      const state = color.get(next) ?? WHITE;
      if (state === GRAY) {
        return true;
      }
      if (state === WHITE) {
        color.set(next, GRAY);
        stack.push({ id: next, index: 0 });
      }
    }
    return false;
  };

  for (const id of [...adjacency.keys()].sort()) {
    if (color.get(id) === WHITE && visit(id)) {
      return true;
    }
  }
  return false;
}

/** Stable hash of the graph's structural content (excludes `generatedAt`). */
export function hashDependencyGraph(graph: WorkspaceDependencyGraph): string {
  return computeInputsHash({ nodes: graph.nodes, edges: graph.edges, stats: graph.stats });
}

function finalizeDependencyGraph(
  nodes: WorkspaceGraphNode[],
  nodeIds: Set<string>,
  candidates: CandidateEdge[],
  now: Date | undefined
): WorkspaceDependencyGraph {
  const edges = mergeEdges(
    candidates.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
  );
  return {
    schemaVersion: WORKSPACE_DEPENDENCY_GRAPH_SCHEMA_VERSION,
    generatedAt: (now ?? new Date()).toISOString(),
    nodes,
    edges,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      inferredEdges: edges.filter((edge) => edge.source === 'inferred').length,
      contractEdges: edges.filter((edge) => edge.source === 'contract').length,
      manualEdges: edges.filter((edge) => edge.source === 'manual').length,
      hasCycle: graphHasCycle(nodes, edges),
    },
  };
}

export async function inferWorkspaceDependencyGraph(
  options: InferWorkspaceDependencyGraphOptions
): Promise<WorkspaceDependencyGraph> {
  const workspacePath = path.resolve(options.workspacePath);
  const maxFiles = options.maxImportFilesPerProject ?? DEFAULT_MAX_IMPORT_FILES_PER_PROJECT;
  const nodes = buildNodes(options.model);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const index = buildProjectIndex(workspacePath, options.model);

  const candidates: CandidateEdge[] = [];
  candidates.push(...(await inferPackageDependencyEdges(workspacePath, index)));
  candidates.push(...(await inferCodeImportEdges(workspacePath, index, maxFiles)));
  if (options.contract) {
    candidates.push(...inferContractEdges(workspacePath, index, options.contract));
  }
  candidates.push(...(await readManualOverrideEdges(workspacePath, nodeIds)));

  return finalizeDependencyGraph(nodes, nodeIds, candidates, options.now);
}

export type IncrementalDependencyGraphOptions = InferWorkspaceDependencyGraphOptions & {
  /** The previously inferred graph whose unchanged edges are reused. */
  previousGraph: WorkspaceDependencyGraph;
  /** Project ids whose source content changed (their outgoing code-import edges are re-scanned). */
  changedProjectIds: ReadonlySet<string>;
  /**
   * When the node set changed (project added/removed) the code-import scan cannot
   * be safely scoped, so the caller sets this to force a full re-scan.
   */
  structuralChange: boolean;
};

/**
 * Graph-aware incremental inference (roadmap 1.16). Re-derives only the edges
 * incident to changed projects:
 * - cheap sources (package-dep, contract, manual) are always recomputed fully;
 * - the expensive code-import scan is restricted to `changedProjectIds`, and the
 *   previous graph's code-import edges from unchanged projects are retained.
 *
 * When `structuralChange` is true (a project was added or removed) the node set
 * differs, so the code-import scan runs fully to stay correct.
 */
export async function inferWorkspaceDependencyGraphIncremental(
  options: IncrementalDependencyGraphOptions
): Promise<WorkspaceDependencyGraph> {
  const workspacePath = path.resolve(options.workspacePath);
  const maxFiles = options.maxImportFilesPerProject ?? DEFAULT_MAX_IMPORT_FILES_PER_PROJECT;
  const nodes = buildNodes(options.model);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const index = buildProjectIndex(workspacePath, options.model);

  const candidates: CandidateEdge[] = [];
  candidates.push(...(await inferPackageDependencyEdges(workspacePath, index)));

  if (options.structuralChange) {
    candidates.push(...(await inferCodeImportEdges(workspacePath, index, maxFiles)));
  } else {
    // Re-scan only changed projects' outgoing imports; retain unchanged ones.
    candidates.push(
      ...(await inferCodeImportEdges(workspacePath, index, maxFiles, options.changedProjectIds))
    );
    for (const edge of options.previousGraph.edges) {
      if (
        edge.kind === 'code-import' &&
        edge.source === 'inferred' &&
        !options.changedProjectIds.has(edge.from) &&
        nodeIds.has(edge.from) &&
        nodeIds.has(edge.to)
      ) {
        candidates.push({
          from: edge.from,
          to: edge.to,
          kind: 'code-import',
          source: 'inferred',
          confidence: edge.confidence,
          evidence: edge.evidence,
        });
      }
    }
  }

  if (options.contract) {
    candidates.push(...inferContractEdges(workspacePath, index, options.contract));
  }
  candidates.push(...(await readManualOverrideEdges(workspacePath, nodeIds)));

  return finalizeDependencyGraph(nodes, nodeIds, candidates, options.now);
}
