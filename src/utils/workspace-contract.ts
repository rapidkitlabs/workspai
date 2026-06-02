import path from 'path';
import fsExtra from 'fs-extra';

export const WORKSPACE_CONTRACT_PATH = '.rapidkit/workspace.contract.json';
export const WORKSPACE_CONTRACT_SCHEMA_VERSION = 1;

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

function toPosixPath(input: string): string {
  return input.replace(/\\/g, '/');
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

async function readWorkspaceMetadata(
  workspacePath: string
): Promise<{ name: string; profile?: string }> {
  const workspaceJsonPath = path.join(workspacePath, '.rapidkit', 'workspace.json');
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
    return { name: path.basename(workspacePath) };
  }
}

async function discoverProjectJsonFiles(workspacePath: string): Promise<string[]> {
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

    const projectJson = path.join(current, '.rapidkit', 'project.json');
    if (await fsExtra.pathExists(projectJson)) {
      results.push(projectJson);
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

export async function buildWorkspaceContract(input: {
  workspacePath: string;
  now?: Date;
}): Promise<WorkspaceContract> {
  const workspacePath = path.resolve(input.workspacePath);
  const workspace = await readWorkspaceMetadata(workspacePath);
  const projectJsonFiles = await discoverProjectJsonFiles(workspacePath);
  const projects: WorkspaceContractProject[] = [];

  for (const projectJsonPath of projectJsonFiles) {
    const projectPath = path.dirname(path.dirname(projectJsonPath));
    const relativePath = toPosixPath(path.relative(workspacePath, projectPath));
    const payload = (await fsExtra.readJson(projectJsonPath)) as Record<string, unknown>;
    const kit =
      (typeof payload.kit_name === 'string' && payload.kit_name) ||
      (typeof payload.kit === 'string' && payload.kit) ||
      undefined;
    const framework =
      (typeof payload.framework === 'string' && payload.framework) || projectKindFromKit(kit);

    projects.push({
      slug: relativePath || path.basename(projectPath),
      relativePath,
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
    input.outputPath || path.join(input.workspacePath, WORKSPACE_CONTRACT_PATH)
  );
  if ((await fsExtra.pathExists(contractPath)) && input.force !== true) {
    throw new Error(
      `Workspace contract already exists: ${contractPath}. Use --force to overwrite.`
    );
  }
  const contract = await buildWorkspaceContract({
    workspacePath: input.workspacePath,
    now: input.now,
  });
  await fsExtra.ensureDir(path.dirname(contractPath));
  await fsExtra.writeJson(contractPath, contract, { spaces: 2 });
  return { contractPath, contract };
}

export async function readWorkspaceContract(input: {
  workspacePath: string;
  contractPath?: string;
}): Promise<{ contractPath: string; contract: WorkspaceContract }> {
  const contractPath = path.resolve(
    input.contractPath || path.join(input.workspacePath, WORKSPACE_CONTRACT_PATH)
  );
  const contract = (await fsExtra.readJson(contractPath)) as WorkspaceContract;
  return { contractPath, contract };
}

export async function verifyWorkspaceContract(input: {
  workspacePath: string;
  contractPath?: string;
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
    }
    for (const port of project.ports || []) {
      if (!Number.isInteger(port.port) || port.port < 1 || port.port > 65535) {
        violations.push(`Project ${project.slug} declares invalid port: ${port.port}.`);
      }
      const owner = claimedPorts.get(port.port);
      if (owner && owner !== project.slug) {
        violations.push(`Port ${port.port} is claimed by both ${owner} and ${project.slug}.`);
      }
      claimedPorts.set(port.port, project.slug);
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

  return {
    status: violations.length > 0 ? 'failed' : 'passed',
    contractPath,
    projectCount: Array.isArray(contract.projects) ? contract.projects.length : 0,
    checks,
    violations,
  };
}
