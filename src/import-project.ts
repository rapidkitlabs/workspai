import path from 'path';

import { execa } from 'execa';
import fsExtra from 'fs-extra';
import { buildImportReadinessReport } from './utils/import-readiness.js';

import {
  detectBackendFrameworkFromProject,
  type BackendConfidence,
  type BackendFrameworkDetection,
  type BackendImportStack,
  type BackendRuntimeFamily,
  type BackendSupportTier,
} from './utils/backend-framework-contract.js';
import {
  removeImportedProjectsRegistryEntries,
  upsertImportedProjectsRegistry,
  type ImportedProjectRegistryEntry,
} from './imported-projects-registry.js';

export type ImportSourceType = 'local-folder' | 'git-url';

export interface ImportProjectIntoWorkspaceOptions {
  workspacePath: string;
  source: string;
  name?: string;
  sourceType?: ImportSourceType;
}

export interface ImportedProjectResult {
  name: string;
  path: string;
  relativePath: string;
  stack: BackendImportStack;
  runtime: BackendRuntimeFamily;
  framework: string;
  frameworkDisplayName: string;
  supportTier: BackendSupportTier;
  moduleSupport: boolean;
  confidence: BackendConfidence;
  source: ImportSourceType;
  projectJsonPath: string;
  importJsonPath: string;
  importReadinessPath: string;
}

function normalizeProjectName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\.git$/i, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 64);
}

function deriveProjectNameFromGitUrl(gitUrl: string): string {
  const trimmed = gitUrl.trim();
  if (!trimmed) {
    return 'imported-project';
  }

  const slashBased = trimmed.replace(/\\/g, '/').replace(/\/+$/, '').split('/');
  const lastSlashSegment = slashBased[slashBased.length - 1] || trimmed;

  const colonSegments = lastSlashSegment.split(':');
  const candidate = (colonSegments[colonSegments.length - 1] || lastSlashSegment).replace(
    /\.git$/i,
    ''
  );

  const normalized = normalizeProjectName(candidate);
  return normalized || 'imported-project';
}

export function isGitUrl(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.includes('://') || trimmed.startsWith('git@');
}

export function detectImportSourceType(input: string): ImportSourceType {
  return isGitUrl(input) ? 'git-url' : 'local-folder';
}

async function resolveDestinationProjectPath(
  workspacePath: string,
  suggestedName: string
): Promise<string> {
  const baseName = normalizeProjectName(suggestedName) || 'imported-project';

  let attempt = 0;
  for (;;) {
    const candidateName =
      attempt === 0
        ? baseName
        : attempt === 1
          ? `${baseName}-imported`
          : `${baseName}-imported-${attempt}`;
    const candidatePath = path.join(workspacePath, candidateName);

    if (!(await fsExtra.pathExists(candidatePath))) {
      return candidatePath;
    }

    attempt += 1;
  }
}

function isSameOrInsideDirectory(parentPath: string, childPath: string): boolean {
  const resolvedParent = path.resolve(parentPath);
  const resolvedChild = path.resolve(childPath);
  const relativePath = path.relative(resolvedParent, resolvedChild);
  return (
    relativePath === '' ||
    (relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

function assertImportSourceOutsideWorkspace(workspacePath: string, sourcePath: string): void {
  if (isSameOrInsideDirectory(workspacePath, sourcePath)) {
    throw new Error('Import source must be outside the current workspace root.');
  }
}

function toPosixPath(input: string): string {
  return input.replace(/\\/g, '/');
}

function isSensitiveEnvFile(baseName: string): boolean {
  if (!baseName.startsWith('.env')) {
    return false;
  }

  return !['.env.example', '.env.sample', '.env.template', '.env.defaults', '.env.dist'].includes(
    baseName
  );
}

function shouldCopyProjectEntry(sourcePath: string): boolean {
  const baseName = path.basename(sourcePath);
  if (
    [
      '.git',
      'node_modules',
      '.venv',
      'venv',
      '__pycache__',
      '.pytest_cache',
      '.mypy_cache',
      '.ruff_cache',
      '.next',
      '.turbo',
      '.cache',
      'dist',
      'build',
      'target',
      'bin',
      'obj',
      'vendor',
      'packages',
    ].includes(baseName)
  ) {
    return false;
  }

  if (isSensitiveEnvFile(baseName) || baseName.endsWith('.pem') || baseName.endsWith('.key')) {
    return false;
  }

  return true;
}

function shouldEnableModuleSupport(existingProjectJson: Record<string, unknown> | null): boolean {
  // Imported projects are observed by default. Core module mutation is enabled
  // only when the project already opted in via RapidKit metadata.
  return existingProjectJson?.module_support === true;
}

async function readExistingProjectJson(
  projectPath: string
): Promise<Record<string, unknown> | null> {
  const projectJsonPath = path.join(projectPath, '.rapidkit', 'project.json');
  if (!(await fsExtra.pathExists(projectJsonPath))) {
    return null;
  }

  try {
    return (await fsExtra.readJson(projectJsonPath)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function writeImportedProjectMetadata(input: {
  workspacePath: string;
  projectPath: string;
  sourceType: ImportSourceType;
  detection: BackendFrameworkDetection;
  existingProjectJson: Record<string, unknown> | null;
}): Promise<{
  projectJsonPath: string;
  importJsonPath: string;
  importReadinessPath: string;
  moduleSupport: boolean;
}> {
  const importedAt = new Date().toISOString();
  const relativePath = toPosixPath(path.relative(input.workspacePath, input.projectPath));
  const projectJsonPath = path.join(input.projectPath, '.rapidkit', 'project.json');
  const importJsonPath = path.join(input.projectPath, '.rapidkit', 'import.json');
  const importReadinessPath = path.join(input.projectPath, '.rapidkit', 'import-readiness.json');
  const moduleSupport = shouldEnableModuleSupport(input.existingProjectJson);
  const existingModules = Array.isArray(input.existingProjectJson?.modules)
    ? input.existingProjectJson.modules
    : [];
  const existingContracts =
    input.existingProjectJson?.contracts &&
    typeof input.existingProjectJson.contracts === 'object' &&
    !Array.isArray(input.existingProjectJson.contracts)
      ? input.existingProjectJson.contracts
      : {
          owns: [],
          apis: [],
          publishes: [],
          consumes: [],
          dependsOn: [],
          env: [],
        };

  const payload = {
    ...(input.existingProjectJson || {}),
    schema_version:
      typeof input.existingProjectJson?.schema_version === 'string'
        ? input.existingProjectJson.schema_version
        : '1.0',
    name:
      typeof input.existingProjectJson?.name === 'string'
        ? input.existingProjectJson.name
        : path.basename(input.projectPath),
    slug:
      typeof input.existingProjectJson?.slug === 'string'
        ? input.existingProjectJson.slug
        : path.basename(input.projectPath),
    runtime: input.detection.runtime,
    framework: input.detection.key,
    kit:
      typeof input.existingProjectJson?.kit === 'string'
        ? input.existingProjectJson.kit
        : `imported.${input.detection.key}`,
    kit_name:
      typeof input.existingProjectJson?.kit_name === 'string'
        ? input.existingProjectJson.kit_name
        : `imported.${input.detection.key}`,
    engine:
      typeof input.existingProjectJson?.engine === 'string'
        ? input.existingProjectJson.engine
        : 'npm',
    module_support: moduleSupport,
    modules: existingModules,
    contracts: existingContracts,
    import: {
      managed_by: 'rapidkit-npm',
      source_type: input.sourceType,
      imported_at: importedAt,
      relative_path: relativePath,
      detection: {
        framework: input.detection.key,
        runtime: input.detection.runtime,
        confidence: input.detection.confidence,
        support_tier: input.detection.supportTier,
        source: input.detection.source,
      },
    },
  };

  const importPayload = {
    schema_version: '1.0',
    kind: 'rapidkit.imported_project',
    imported_at: importedAt,
    managed_by: 'rapidkit-npm',
    source: {
      type: input.sourceType,
      name: path.basename(input.projectPath),
    },
    project: {
      name: payload.name,
      slug: payload.slug,
      relative_path: relativePath,
      module_support: moduleSupport,
    },
    detection: {
      framework: input.detection.key,
      framework_display_name: input.detection.displayName,
      runtime: input.detection.runtime,
      confidence: input.detection.confidence,
      support_tier: input.detection.supportTier,
      import_stack: input.detection.importStack,
      source: input.detection.source,
    },
    policy: {
      copied_secrets: false,
      copied_dependency_caches: false,
      module_mutation_enabled: moduleSupport,
    },
  };
  const readinessPayload = buildImportReadinessReport({
    projectName: String(payload.name),
    relativePath,
    source: input.sourceType,
    detection: input.detection,
    moduleSupport,
    generatedAt: new Date(importedAt),
  });

  await fsExtra.ensureDir(path.dirname(projectJsonPath));
  await fsExtra.writeJson(projectJsonPath, payload, { spaces: 2 });
  await fsExtra.writeJson(importJsonPath, importPayload, { spaces: 2 });
  await fsExtra.writeJson(importReadinessPath, readinessPayload, { spaces: 2 });
  return { projectJsonPath, importJsonPath, importReadinessPath, moduleSupport };
}

async function writeImportedProjectRegistryEntry(
  workspacePath: string,
  importedProject: ImportedProjectResult
): Promise<void> {
  const entry: ImportedProjectRegistryEntry = {
    name: importedProject.name,
    path: importedProject.path,
    relativePath: importedProject.relativePath,
    stack: importedProject.stack,
    runtime: importedProject.runtime,
    framework: importedProject.framework,
    frameworkDisplayName: importedProject.frameworkDisplayName,
    supportTier: importedProject.supportTier,
    moduleSupport: importedProject.moduleSupport,
    confidence: importedProject.confidence,
    source: importedProject.source,
    importedAt: new Date().toISOString(),
  };

  await upsertImportedProjectsRegistry(workspacePath, [entry]);
}

async function rollbackImportedProject(destinationPath: string): Promise<void> {
  if (!(await fsExtra.pathExists(destinationPath))) {
    return;
  }

  await fsExtra.remove(destinationPath);
}

export async function cleanupImportedProjectImport(
  workspacePath: string,
  projectPath: string
): Promise<void> {
  await rollbackImportedProject(projectPath);
  await removeImportedProjectsRegistryEntries(workspacePath, [projectPath]);
}

export async function importProjectIntoWorkspace(
  options: ImportProjectIntoWorkspaceOptions
): Promise<ImportedProjectResult> {
  const workspacePath = path.resolve(options.workspacePath);
  const source = options.source.trim();
  const sourceType = options.sourceType ?? detectImportSourceType(source);
  const suggestedName =
    options.name ??
    (sourceType === 'git-url' ? deriveProjectNameFromGitUrl(source) : path.basename(source));
  const destinationPath = await resolveDestinationProjectPath(workspacePath, suggestedName);
  let destinationPrepared = false;

  try {
    if (sourceType === 'local-folder') {
      const sourcePath = path.resolve(source);
      const sourceStats = await fsExtra.stat(sourcePath).catch(() => null);
      if (!sourceStats || !sourceStats.isDirectory()) {
        throw new Error('Import source is not a directory.');
      }

      assertImportSourceOutsideWorkspace(workspacePath, sourcePath);
      destinationPrepared = true;
      await fsExtra.copy(sourcePath, destinationPath, {
        overwrite: false,
        errorOnExist: true,
        filter: shouldCopyProjectEntry,
      });
    } else {
      destinationPrepared = true;
      await execa('git', ['clone', '--depth', '1', source, destinationPath], {
        timeout: 120000,
      });
    }

    const existingProjectJson = await readExistingProjectJson(destinationPath);
    const detection = detectBackendFrameworkFromProject(destinationPath, existingProjectJson);
    const metadata = await writeImportedProjectMetadata({
      workspacePath,
      projectPath: destinationPath,
      sourceType,
      detection,
      existingProjectJson,
    });
    const importedProject: ImportedProjectResult = {
      name: path.basename(destinationPath),
      path: destinationPath,
      relativePath: toPosixPath(path.relative(workspacePath, destinationPath)),
      stack: detection.importStack,
      runtime: detection.runtime,
      framework: detection.key,
      frameworkDisplayName: detection.displayName,
      supportTier: detection.supportTier,
      moduleSupport: metadata.moduleSupport,
      confidence: detection.confidence,
      source: sourceType,
      projectJsonPath: metadata.projectJsonPath,
      importJsonPath: metadata.importJsonPath,
      importReadinessPath: metadata.importReadinessPath,
    };

    await writeImportedProjectRegistryEntry(workspacePath, importedProject);
    return importedProject;
  } catch (error) {
    if (destinationPrepared) {
      try {
        await rollbackImportedProject(destinationPath);
      } catch (cleanupError) {
        const originalMessage = error instanceof Error ? error.message : String(error);
        const cleanupMessage =
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        throw new Error(
          `Import failed: ${originalMessage}. Rollback also failed: ${cleanupMessage}`
        );
      }
    }

    throw error;
  }
}
