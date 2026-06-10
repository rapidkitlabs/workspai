import path from 'path';
import fsExtra from 'fs-extra';

export const MODULE_LAYOUT_SCHEMA_VERSION = 'rapidkit.module-layout.v1';
export const CANONICAL_MODULE_ROOT = 'src/modules/free';
export const MODULE_PATH_PATTERN = 'src/modules/free/{category}/{module}';
export const MODULE_SLUG_PATTERN = 'free/{category}/{module}';
export const MODULE_SLUG_PREFIX = 'free/';

export interface RegistryInstalledModule {
  slug?: string;
  name?: string;
  version?: string;
  [key: string]: unknown;
}

export interface ModulePathIssue {
  projectRoot: string;
  registryPath: string;
  slug: string;
  expectedPath: string;
  message: string;
}

export interface ModulePathAuditResult {
  status: 'passed' | 'failed';
  projectCount: number;
  moduleCount: number;
  issues: ModulePathIssue[];
}

export interface WorkspaceModulePathAuditResult extends ModulePathAuditResult {
  workspacePath: string;
  projects: Array<{
    projectRoot: string;
    moduleCount: number;
    issueCount: number;
    status: 'passed' | 'failed';
  }>;
}

function toPosixPath(input: string): string {
  return input.replace(/\\/g, '/');
}

export function isCanonicalModuleSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && slug.startsWith(MODULE_SLUG_PREFIX);
}

export function resolveCanonicalModulePath(projectRoot: string, slug: string): string {
  if (!isCanonicalModuleSlug(slug)) {
    throw new Error(`Module slug must start with ${MODULE_SLUG_PREFIX}: ${slug}`);
  }
  const relative = path.join(CANONICAL_MODULE_ROOT, ...slug.split('/').slice(1));
  return path.join(projectRoot, relative);
}

export function resolveCanonicalModuleRelativePath(slug: string): string {
  if (!isCanonicalModuleSlug(slug)) {
    throw new Error(`Module slug must start with ${MODULE_SLUG_PREFIX}: ${slug}`);
  }
  return toPosixPath(path.join(CANONICAL_MODULE_ROOT, ...slug.split('/').slice(1)));
}

async function moduleDirectoryExists(modulePath: string): Promise<boolean> {
  if (!(await fsExtra.pathExists(modulePath))) {
    return false;
  }
  const stat = await fsExtra.stat(modulePath);
  return stat.isDirectory();
}

export async function auditProjectModulePaths(projectRoot: string): Promise<ModulePathAuditResult> {
  const registryPath = path.join(projectRoot, 'registry.json');
  const issues: ModulePathIssue[] = [];
  let moduleCount = 0;

  if (!(await fsExtra.pathExists(registryPath))) {
    return {
      status: 'passed',
      projectCount: 1,
      moduleCount: 0,
      issues,
    };
  }

  const registry = (await fsExtra.readJson(registryPath)) as {
    installed_modules?: RegistryInstalledModule[];
  };

  for (const item of registry.installed_modules || []) {
    const slug = item?.slug;
    if (!isCanonicalModuleSlug(slug)) {
      continue;
    }
    moduleCount += 1;
    const expectedPath = resolveCanonicalModulePath(projectRoot, slug);
    if (!(await moduleDirectoryExists(expectedPath))) {
      issues.push({
        projectRoot,
        registryPath,
        slug,
        expectedPath,
        message: `Missing canonical module directory: ${toPosixPath(path.relative(projectRoot, expectedPath))}`,
      });
    }
  }

  return {
    status: issues.length > 0 ? 'failed' : 'passed',
    projectCount: 1,
    moduleCount,
    issues,
  };
}

export async function auditWorkspaceModulePaths(
  workspacePath: string
): Promise<WorkspaceModulePathAuditResult> {
  const registryPaths = await findProjectRegistries(workspacePath);
  const projects: WorkspaceModulePathAuditResult['projects'] = [];
  const issues: ModulePathIssue[] = [];
  let moduleCount = 0;

  for (const registryPath of registryPaths) {
    const projectRoot = path.dirname(registryPath);
    const projectAudit = await auditProjectModulePaths(projectRoot);
    moduleCount += projectAudit.moduleCount;
    issues.push(...projectAudit.issues);
    projects.push({
      projectRoot,
      moduleCount: projectAudit.moduleCount,
      issueCount: projectAudit.issues.length,
      status: projectAudit.status,
    });
  }

  return {
    workspacePath,
    status: issues.length > 0 ? 'failed' : 'passed',
    projectCount: projects.length,
    moduleCount,
    issues,
    projects,
  };
}

async function findProjectRegistries(workspacePath: string): Promise<string[]> {
  const entries = await fsExtra.readdir(workspacePath, { withFileTypes: true });
  const registryPaths: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const registryPath = path.join(workspacePath, entry.name, 'registry.json');
    if (await fsExtra.pathExists(registryPath)) {
      registryPaths.push(registryPath);
    }
  }
  return registryPaths.sort();
}

export function moduleLayoutContractSummary(): {
  schemaVersion: string;
  canonicalModuleRoot: string;
  pathPattern: string;
  slugPattern: string;
} {
  return {
    schemaVersion: MODULE_LAYOUT_SCHEMA_VERSION,
    canonicalModuleRoot: CANONICAL_MODULE_ROOT,
    pathPattern: MODULE_PATH_PATTERN,
    slugPattern: MODULE_SLUG_PATTERN,
  };
}
