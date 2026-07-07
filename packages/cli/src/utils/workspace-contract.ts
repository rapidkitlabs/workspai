import path from 'path';
import fsExtra from 'fs-extra';

import { attachRunCorrelation } from '../observability/run-correlation.js';
import { auditWorkspaceModulePaths } from './module-layout.js';
import {
  readImportedProjectsRegistry,
  type ImportedProjectRegistryEntry,
} from '../imported-projects-registry.js';
import {
  firstExistingWorkspaceArtifactPath,
  resolveWorkspaceArtifactPath,
  writeWorkspaceArtifactJson,
} from './artifact-path-compat.js';
import { projectMetadataCandidates, workspaceMetadataCandidates } from './workspace-paths.js';

export const WORKSPACE_CONTRACT_PATH = '.workspai/workspace.contract.json';
export const WORKSPACE_CONTRACT_VERIFY_REPORT_PATH =
  '.workspai/reports/workspace-contract-verify-last-run.json';
export const WORKSPACE_CONTRACT_SCHEMA_VERSION = 1;
export const WORKSPACE_CONTRACT_VERIFY_SCHEMA_VERSION = 'workspace-contract-verify.v1' as const;

export type WorkspaceContractVerifyEvidence = {
  schemaVersion: typeof WORKSPACE_CONTRACT_VERIFY_SCHEMA_VERSION;
  generatedAt: string;
  status: 'passed' | 'failed';
  contractPath: string;
  projectCount: number;
  checks: WorkspaceContractVerificationResult['checks'];
  violations: string[];
};

export interface WorkspaceContractPort {
  name: string;
  port: number;
  protocol: 'http' | 'https' | 'grpc' | 'tcp' | 'udp';
}

export interface WorkspaceContractApi {
  name: string;
  basePath: string;
}

export interface WorkspaceContractProject {
  slug: string;
  relativePath: string;
  source?: 'workspace' | 'local-folder' | 'git-url' | 'adopted-local';
  relationship?: 'imported' | 'adopted';
  externalPath?: string;
  runtime?: string;
  framework?: string;
  kit?: string;
  modules: string[];
  ports: WorkspaceContractPort[];
  contracts: {
    owns: string[];
    apis: WorkspaceContractApi[];
    publishes: string[];
    consumes: string[];
    dependsOn: string[];
    env: string[];
  };
}

export interface WorkspaceContract {
  schemaVersion: typeof WORKSPACE_CONTRACT_SCHEMA_VERSION;
  kind: 'rapidkit.workspace.contract';
  generatedAt: string;
  workspace: {
    name: string;
    profile?: string;
  };
  projects: WorkspaceContractProject[];
}

export interface WorkspaceContractVerificationResult {
  status: 'passed' | 'failed';
  contractPath: string;
  projectCount: number;
  checks: Array<{ id: string; status: 'passed' | 'failed'; message: string }>;
  violations: string[];
}

export interface WorkspaceContractSyncResult {
  contractPath: string;
  contract: WorkspaceContract;
  addedProjects: string[];
  updatedProjects: string[];
  verification: WorkspaceContractVerificationResult;
}

export interface WorkspaceContractGraphNode {
  id: string;
  label: string;
  relativePath: string;
  source?: WorkspaceContractProject['source'];
  relationship?: WorkspaceContractProject['relationship'];
  externalPath?: string;
  runtime?: string;
  framework?: string;
  kit?: string;
  modules: string[];
  ports: WorkspaceContractPort[];
  apis: WorkspaceContractApi[];
  owns: string[];
  env: string[];
}

export interface WorkspaceContractGraphEdge {
  from: string;
  to: string;
  type: 'dependency' | 'event';
  label: string;
}

export interface WorkspaceContractGraph {
  schemaVersion: 1;
  kind: 'rapidkit.workspace.contract.graph';
  workspace: WorkspaceContract['workspace'];
  generatedAt: string;
  nodes: WorkspaceContractGraphNode[];
  edges: WorkspaceContractGraphEdge[];
  summary: {
    projectCount: number;
    dependencyEdges: number;
    eventEdges: number;
    portCount: number;
    apiCount: number;
  };
}

function toPosixPath(input: string): string {
  return input.replace(/\\/g, '/');
}

function isSafeContractRelativePath(inputPath: string): boolean {
  const normalized = toPosixPath(inputPath).trim();
  if (!normalized || normalized.startsWith('/') || normalized.startsWith('~')) {
    return false;
  }
  if (/^[a-zA-Z]:\//.test(normalized) || normalized.includes('\0')) {
    return false;
  }
  return !normalized
    .split('/')
    .filter(Boolean)
    .some((segment) => segment === '..' || segment === '.');
}

function normalizeProjectSlug(raw: string, fallback: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 80);
  return normalized || fallback;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

async function firstExistingFile(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (await fsExtra.pathExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function readWorkspaceMetadata(
  workspacePath: string
): Promise<{ name: string; profile?: string }> {
  for (const workspaceJsonPath of workspaceMetadataCandidates(workspacePath, 'workspace.json')) {
    try {
      const payload = (await fsExtra.readJson(workspaceJsonPath)) as Record<string, unknown>;
      const name =
        (typeof payload.workspace_name === 'string' && payload.workspace_name.trim()) ||
        (typeof payload.name === 'string' && payload.name.trim()) ||
        path.basename(workspacePath);
      return {
        name,
        profile: typeof payload.profile === 'string' ? payload.profile : undefined,
      };
    } catch {
      // Try the next metadata generation.
    }
  }
  return { name: path.basename(workspacePath) };
}

export async function discoverProjectJsonFiles(workspacePath: string): Promise<string[]> {
  const results: string[] = [];
  const queue = [workspacePath];
  const visited = new Set<string>();
  const ignored = new Set([
    '.git',
    'node_modules',
    '.venv',
    'venv',
    'dist',
    'build',
    'target',
    '.next',
    '.turbo',
    '.cache',
  ]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    const projectJson = await firstExistingFile(projectMetadataCandidates(current, 'project.json'));
    const contextJson = await firstExistingFile(projectMetadataCandidates(current, 'context.json'));
    if (projectJson || contextJson) {
      results.push(projectJson ?? contextJson ?? '');
      continue;
    }

    let entries: fsExtra.Dirent[];
    try {
      entries = await fsExtra.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || ignored.has(entry.name)) continue;
      queue.push(path.join(current, entry.name));
    }
  }

  return results.sort();
}

function projectKindFromKit(kit?: string): string | undefined {
  const value = (kit || '').toLowerCase();
  if (value.includes('fastapi')) return 'fastapi';
  if (value.includes('nestjs')) return 'nestjs';
  if (value.includes('springboot')) return 'springboot';
  if (value.includes('gofiber')) return 'fiber';
  if (value.includes('gogin')) return 'gin';
  return undefined;
}

function defaultPortForKit(kit?: string, runtime?: string): number | null {
  const value = (kit || '').toLowerCase();
  const runtimeValue = (runtime || '').toLowerCase();
  if (value.includes('fastapi')) return 8000;
  if (value.includes('nestjs')) return 3000;
  if (value.includes('springboot')) return 8080;
  if (value.includes('gofiber')) return 3000;
  if (value.includes('gogin')) return 8080;
  if (runtimeValue === 'node') return 3000;
  if (runtimeValue === 'python') return 8000;
  if (runtimeValue === 'java') return 8080;
  if (runtimeValue === 'go') return 8080;
  return null;
}

function nextAvailablePort(preferred: number, usedPorts: Set<number>): number {
  let port = preferred;
  while (usedPorts.has(port) && port < 65535) {
    port += 1;
  }
  return port;
}

function mergeProjectContract(
  existing: WorkspaceContractProject | undefined,
  discovered: WorkspaceContractProject,
  usedPorts: Set<number>
): { project: WorkspaceContractProject; changed: boolean } {
  const preferredPort = defaultPortForKit(discovered.kit, discovered.runtime);
  const existingPorts = existing?.ports || [];
  const ports =
    existingPorts.length > 0
      ? existingPorts
      : preferredPort
        ? [
            {
              name: 'http',
              port: nextAvailablePort(preferredPort, usedPorts),
              protocol: 'http' as const,
            },
          ]
        : [];

  for (const port of ports) {
    usedPorts.add(port.port);
  }

  const project: WorkspaceContractProject = {
    ...discovered,
    ...existing,
    slug: existing?.slug || discovered.slug,
    relativePath:
      existing?.relativePath && isSafeContractRelativePath(existing.relativePath)
        ? existing.relativePath
        : discovered.relativePath,
    source: existing?.source || discovered.source,
    relationship: existing?.relationship || discovered.relationship,
    externalPath: existing?.externalPath || discovered.externalPath,
    runtime: existing?.runtime || discovered.runtime,
    framework: existing?.framework || discovered.framework,
    kit: existing?.kit || discovered.kit,
    modules: existing?.modules?.length ? existing.modules : discovered.modules,
    ports,
    contracts: {
      owns: existing?.contracts?.owns || [],
      apis: existing?.contracts?.apis || [],
      publishes: existing?.contracts?.publishes || [],
      consumes: existing?.contracts?.consumes || [],
      dependsOn: existing?.contracts?.dependsOn || [],
      env: existing?.contracts?.env || [],
    },
  };

  const changed = JSON.stringify(existing || null) !== JSON.stringify(project);
  return { project, changed };
}

export async function buildWorkspaceContract(input: {
  workspacePath: string;
  now?: Date;
}): Promise<WorkspaceContract> {
  const workspacePath = path.resolve(input.workspacePath);
  const workspace = await readWorkspaceMetadata(workspacePath);
  const projectJsonFiles = await discoverProjectJsonFiles(workspacePath);
  const importedProjects = await readImportedProjectsRegistry(workspacePath);
  const externalProjectJsonFiles: Array<{
    projectJsonPath: string;
    registryEntry: ImportedProjectRegistryEntry;
  }> = [];
  for (const project of importedProjects) {
    const projectPath = path.resolve(project.path);
    const metadataPath =
      (await firstExistingFile(projectMetadataCandidates(projectPath, 'project.json'))) ??
      (await firstExistingFile(projectMetadataCandidates(projectPath, 'context.json')));
    if (
      !metadataPath ||
      projectJsonFiles.some((item) => path.resolve(item) === path.resolve(metadataPath))
    ) {
      continue;
    }
    externalProjectJsonFiles.push({ projectJsonPath: metadataPath, registryEntry: project });
  }
  const projects: WorkspaceContractProject[] = [];
  const projectInputs: Array<{
    projectJsonPath: string;
    registryEntry?: ImportedProjectRegistryEntry;
  }> = [
    ...projectJsonFiles.map((projectJsonPath) => ({ projectJsonPath })),
    ...externalProjectJsonFiles,
  ];

  for (const { projectJsonPath, registryEntry } of projectInputs) {
    const projectPath = path.dirname(path.dirname(projectJsonPath));
    const discoveredRelativePath = toPosixPath(path.relative(workspacePath, projectPath));
    const isExternalProject =
      registryEntry !== undefined && !isSafeContractRelativePath(discoveredRelativePath);
    const contractSlug = normalizeProjectSlug(
      registryEntry?.name || path.basename(projectPath),
      path.basename(projectPath)
    );
    const relativePath = isExternalProject
      ? `external/${contractSlug}`
      : discoveredRelativePath || contractSlug;
    const payload = (await fsExtra.readJson(projectJsonPath)) as Record<string, unknown>;
    const kit =
      (typeof payload.kit_name === 'string' && payload.kit_name) ||
      (typeof payload.kit === 'string' && payload.kit) ||
      undefined;
    const framework =
      (typeof payload.framework === 'string' && payload.framework) || projectKindFromKit(kit);

    projects.push({
      slug: registryEntry?.name || relativePath || path.basename(projectPath),
      relativePath,
      source: registryEntry?.source ?? 'workspace',
      relationship: registryEntry?.relationship,
      externalPath: isExternalProject ? projectPath : undefined,
      runtime: typeof payload.runtime === 'string' ? payload.runtime : undefined,
      framework,
      kit,
      modules: normalizeStringArray(payload.modules),
      ports: [],
      contracts: {
        owns: [],
        apis: [],
        publishes: [],
        consumes: [],
        dependsOn: [],
        env: [],
      },
    });
  }

  return {
    schemaVersion: WORKSPACE_CONTRACT_SCHEMA_VERSION,
    kind: 'rapidkit.workspace.contract',
    generatedAt: (input.now ?? new Date()).toISOString(),
    workspace,
    projects,
  };
}

export async function writeWorkspaceContract(input: {
  workspacePath: string;
  outputPath?: string;
  force?: boolean;
  now?: Date;
}): Promise<{ contractPath: string; contract: WorkspaceContract }> {
  const contractPath = path.resolve(
    input.outputPath || resolveWorkspaceArtifactPath(input.workspacePath, WORKSPACE_CONTRACT_PATH)
  );
  if ((await fsExtra.pathExists(contractPath)) && input.force !== true) {
    throw new Error(
      `Workspace contract already exists: ${contractPath}. Use --force to overwrite.`
    );
  }
  const discovered = await buildWorkspaceContract({
    workspacePath: input.workspacePath,
    now: input.now,
  });
  const usedPorts = new Set<number>();
  const contract: WorkspaceContract = {
    ...discovered,
    projects: discovered.projects.map(
      (project) => mergeProjectContract(undefined, project, usedPorts).project
    ),
  };
  if (input.outputPath) {
    await fsExtra.ensureDir(path.dirname(contractPath));
    await fsExtra.writeJson(contractPath, contract, { spaces: 2 });
  } else {
    await writeWorkspaceArtifactJson(input.workspacePath, WORKSPACE_CONTRACT_PATH, contract);
  }
  const { publishWorkspaceRegistrySummary } = await import('./workspace-registry-summary.js');
  await publishWorkspaceRegistrySummary(input.workspacePath, { now: input.now });
  return { contractPath, contract };
}

export async function syncWorkspaceContract(input: {
  workspacePath: string;
  now?: Date;
}): Promise<WorkspaceContractSyncResult> {
  const workspacePath = path.resolve(input.workspacePath);
  const contractPath = resolveWorkspaceArtifactPath(workspacePath, WORKSPACE_CONTRACT_PATH);
  const existingContractPath =
    (await firstExistingWorkspaceArtifactPath(workspacePath, WORKSPACE_CONTRACT_PATH)) ??
    contractPath;
  const discovered = await buildWorkspaceContract({ workspacePath, now: input.now });
  const existing = (await fsExtra.pathExists(existingContractPath))
    ? ((await fsExtra.readJson(existingContractPath)) as WorkspaceContract)
    : null;
  const existingBySlug = new Map(
    (existing?.projects || []).map((project) => [project.slug, project])
  );
  const usedPorts = new Set<number>();
  const addedProjects: string[] = [];
  const updatedProjects: string[] = [];
  const projects: WorkspaceContractProject[] = [];

  for (const project of discovered.projects) {
    const existingProject = existingBySlug.get(project.slug);
    const merged = mergeProjectContract(existingProject, project, usedPorts);
    if (!existingProject) {
      addedProjects.push(project.slug);
    } else if (merged.changed) {
      updatedProjects.push(project.slug);
    }
    projects.push(merged.project);
    existingBySlug.delete(project.slug);
  }

  for (const project of existingBySlug.values()) {
    const merged = mergeProjectContract(project, project, usedPorts);
    projects.push(merged.project);
  }

  const contract: WorkspaceContract = {
    schemaVersion: WORKSPACE_CONTRACT_SCHEMA_VERSION,
    kind: 'rapidkit.workspace.contract',
    generatedAt: (input.now ?? new Date()).toISOString(),
    workspace: {
      ...discovered.workspace,
      ...(existing?.workspace || {}),
      name: existing?.workspace?.name || discovered.workspace.name,
    },
    projects: projects.sort((a, b) => a.slug.localeCompare(b.slug)),
  };

  await writeWorkspaceArtifactJson(workspacePath, WORKSPACE_CONTRACT_PATH, contract);
  const verification = await verifyWorkspaceContract({ workspacePath });
  const { publishWorkspaceRegistrySummary } = await import('./workspace-registry-summary.js');
  await publishWorkspaceRegistrySummary(workspacePath, { now: input.now });
  return { contractPath, contract, addedProjects, updatedProjects, verification };
}

export async function readWorkspaceContract(input: {
  workspacePath: string;
  contractPath?: string;
}): Promise<{ contractPath: string; contract: WorkspaceContract }> {
  const contractPath =
    input.contractPath ??
    ((await firstExistingWorkspaceArtifactPath(input.workspacePath, WORKSPACE_CONTRACT_PATH)) ||
      resolveWorkspaceArtifactPath(input.workspacePath, WORKSPACE_CONTRACT_PATH));
  const contract = (await fsExtra.readJson(contractPath)) as WorkspaceContract;
  return { contractPath, contract };
}

export async function buildWorkspaceContractGraph(input: {
  workspacePath: string;
  contractPath?: string;
}): Promise<{ contractPath: string; graph: WorkspaceContractGraph }> {
  const { contractPath, contract } = await readWorkspaceContract(input);
  const nodes: WorkspaceContractGraphNode[] = contract.projects.map((project) => ({
    id: project.slug,
    label: project.slug,
    relativePath: project.relativePath,
    source: project.source,
    relationship: project.relationship,
    externalPath: project.externalPath,
    runtime: project.runtime,
    framework: project.framework,
    kit: project.kit,
    modules: project.modules,
    ports: project.ports,
    apis: project.contracts.apis,
    owns: project.contracts.owns,
    env: project.contracts.env,
  }));
  const knownProjects = new Set(nodes.map((node) => node.id));
  const publishersByEvent = new Map<string, Set<string>>();
  const edges: WorkspaceContractGraphEdge[] = [];

  for (const project of contract.projects) {
    for (const dependency of project.contracts.dependsOn || []) {
      if (!knownProjects.has(dependency)) continue;
      edges.push({
        from: dependency,
        to: project.slug,
        type: 'dependency',
        label: 'dependsOn',
      });
    }
    for (const eventName of project.contracts.publishes || []) {
      if (!publishersByEvent.has(eventName)) {
        publishersByEvent.set(eventName, new Set<string>());
      }
      publishersByEvent.get(eventName)?.add(project.slug);
    }
  }

  for (const project of contract.projects) {
    for (const eventName of project.contracts.consumes || []) {
      const publishers = publishersByEvent.get(eventName);
      if (!publishers) continue;
      for (const publisher of publishers) {
        if (publisher === project.slug) continue;
        edges.push({
          from: publisher,
          to: project.slug,
          type: 'event',
          label: eventName,
        });
      }
    }
  }

  const graph: WorkspaceContractGraph = {
    schemaVersion: 1,
    kind: 'rapidkit.workspace.contract.graph',
    workspace: contract.workspace,
    generatedAt: new Date().toISOString(),
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) =>
      `${a.from}:${a.to}:${a.type}:${a.label}`.localeCompare(
        `${b.from}:${b.to}:${b.type}:${b.label}`
      )
    ),
    summary: {
      projectCount: nodes.length,
      dependencyEdges: edges.filter((edge) => edge.type === 'dependency').length,
      eventEdges: edges.filter((edge) => edge.type === 'event').length,
      portCount: nodes.reduce((total, node) => total + node.ports.length, 0),
      apiCount: nodes.reduce((total, node) => total + node.apis.length, 0),
    },
  };

  return { contractPath, graph };
}

export async function verifyWorkspaceContract(input: {
  workspacePath: string;
  contractPath?: string;
  strict?: boolean;
}): Promise<WorkspaceContractVerificationResult> {
  const { contractPath, contract } = await readWorkspaceContract(input);
  const violations: string[] = [];
  const checks: WorkspaceContractVerificationResult['checks'] = [];

  if (contract.kind !== 'rapidkit.workspace.contract') {
    violations.push('Contract kind must be rapidkit.workspace.contract.');
  }
  if (contract.schemaVersion !== WORKSPACE_CONTRACT_SCHEMA_VERSION) {
    violations.push(`Contract schemaVersion must be ${WORKSPACE_CONTRACT_SCHEMA_VERSION}.`);
  }
  if (!contract.workspace?.name) {
    violations.push('Contract workspace.name is required.');
  }
  if (!Array.isArray(contract.projects)) {
    violations.push('Contract projects must be an array.');
  }

  const projectSlugs = new Set<string>();
  const claimedPorts = new Map<number, string>();
  for (const project of contract.projects || []) {
    if (!project.slug) {
      violations.push('Every project must declare slug.');
      continue;
    }
    if (projectSlugs.has(project.slug)) {
      violations.push(`Duplicate project slug: ${project.slug}.`);
    }
    projectSlugs.add(project.slug);
    if (!project.relativePath) {
      violations.push(`Project ${project.slug} must declare relativePath.`);
    } else if (!isSafeContractRelativePath(project.relativePath)) {
      violations.push(
        `Project ${project.slug} declares unsafe relativePath: ${project.relativePath}.`
      );
    }
    if (project.externalPath) {
      const externalSource =
        project.relationship === 'adopted' ||
        project.source === 'adopted-local' ||
        project.source === 'local-folder' ||
        project.source === 'git-url';
      if (!externalSource) {
        violations.push(
          `Project ${project.slug} declares externalPath without imported/adopted provenance.`
        );
      }
      if (!path.isAbsolute(project.externalPath)) {
        violations.push(`Project ${project.slug} declares non-absolute externalPath.`);
      }
    }
    for (const port of project.ports || []) {
      if (!Number.isInteger(port.port) || port.port < 1 || port.port > 65535) {
        violations.push(`Project ${project.slug} declares invalid port: ${port.port}.`);
      }
      const owner = claimedPorts.get(port.port);
      if (owner) {
        violations.push(`Port ${port.port} is claimed by both ${owner} and ${project.slug}.`);
      }
      claimedPorts.set(port.port, project.slug);
    }
    for (const api of project.contracts?.apis || []) {
      if (!api.name?.trim() || !api.basePath?.startsWith('/')) {
        violations.push(`Project ${project.slug} declares invalid API contract.`);
      }
    }
    for (const eventName of [
      ...(project.contracts?.publishes || []),
      ...(project.contracts?.consumes || []),
    ]) {
      if (!eventName.trim()) {
        violations.push(`Project ${project.slug} declares an empty event contract.`);
      }
    }
    for (const envName of project.contracts?.env || []) {
      if (!/^[A-Z_][A-Z0-9_]*$/.test(envName)) {
        violations.push(`Project ${project.slug} declares invalid env contract: ${envName}.`);
      }
    }
    for (const dependency of project.contracts?.dependsOn || []) {
      if (!projectSlugs.has(dependency)) {
        // checked again after full set is built below
      }
    }
  }

  for (const project of contract.projects || []) {
    for (const dependency of project.contracts?.dependsOn || []) {
      if (!projectSlugs.has(dependency)) {
        violations.push(`Project ${project.slug} depends on unknown project: ${dependency}.`);
      }
    }
  }

  checks.push({
    id: 'schema',
    status:
      contract.kind === 'rapidkit.workspace.contract' &&
      contract.schemaVersion === WORKSPACE_CONTRACT_SCHEMA_VERSION
        ? 'passed'
        : 'failed',
    message: 'Contract schema and kind are valid.',
  });
  checks.push({
    id: 'projects',
    status: Array.isArray(contract.projects) ? 'passed' : 'failed',
    message: `Contract declares ${Array.isArray(contract.projects) ? contract.projects.length : 0} project(s).`,
  });
  checks.push({
    id: 'ports',
    status: violations.some((item) => item.toLowerCase().includes('port')) ? 'failed' : 'passed',
    message: 'Project port declarations are valid and collision-free.',
  });
  checks.push({
    id: 'dependencies',
    status: violations.some((item) => item.includes('depends on unknown project'))
      ? 'failed'
      : 'passed',
    message: 'Project dependencies point to known project slugs.',
  });
  checks.push({
    id: 'contracts',
    status: violations.some(
      (item) =>
        item.includes('unsafe relativePath') ||
        item.includes('invalid API contract') ||
        item.includes('event contract') ||
        item.includes('env contract')
    )
      ? 'failed'
      : 'passed',
    message: 'Project path, API, event, and env contracts are valid.',
  });

  const moduleAudit = await auditWorkspaceModulePaths(input.workspacePath);
  if (moduleAudit.moduleCount > 0) {
    for (const issue of moduleAudit.issues) {
      violations.push(`${path.basename(issue.projectRoot)}: ${issue.message} (slug=${issue.slug})`);
    }
    checks.push({
      id: 'module-paths',
      status: moduleAudit.status,
      message:
        moduleAudit.status === 'passed'
          ? `All ${moduleAudit.moduleCount} registered module(s) resolve under canonical paths.`
          : `${moduleAudit.issues.length} registered module(s) missing canonical install paths.`,
    });
  } else if (input.strict) {
    checks.push({
      id: 'module-paths',
      status: 'passed',
      message: 'No registry-backed modules declared in workspace projects.',
    });
  }

  return {
    status: violations.length > 0 ? 'failed' : 'passed',
    contractPath,
    projectCount: Array.isArray(contract.projects) ? contract.projects.length : 0,
    checks,
    violations,
  };
}

export async function writeWorkspaceContractVerifyEvidence(input: {
  workspacePath: string;
  result: WorkspaceContractVerificationResult;
  generatedAt?: string;
}): Promise<string> {
  const workspacePath = path.resolve(input.workspacePath);
  const payload: WorkspaceContractVerifyEvidence = {
    schemaVersion: WORKSPACE_CONTRACT_VERIFY_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    status: input.result.status,
    contractPath: input.result.contractPath,
    projectCount: input.result.projectCount,
    checks: input.result.checks,
    violations: input.result.violations,
  };
  return writeWorkspaceArtifactJson(
    workspacePath,
    WORKSPACE_CONTRACT_VERIFY_REPORT_PATH,
    attachRunCorrelation(payload)
  );
}
