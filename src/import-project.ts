import path from 'path';

import { execa } from 'execa';
import fsExtra from 'fs-extra';

import {
  detectBackendFrameworkFromProject,
  type BackendConfidence,
  type BackendImportStack,
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
  stack: BackendImportStack;
  confidence: BackendConfidence;
  source: ImportSourceType;
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

function assertImportSourceOutsideWorkspace(workspacePath: string, sourcePath: string): void {
  const resolvedWorkspace = path.resolve(workspacePath);
  const resolvedSource = path.resolve(sourcePath);
  if (
    resolvedSource === resolvedWorkspace ||
    resolvedSource.startsWith(`${resolvedWorkspace}${path.sep}`)
  ) {
    throw new Error('Import source must be outside the current workspace root.');
  }
}

async function writeImportedProjectRegistryEntry(
  workspacePath: string,
  importedProject: ImportedProjectResult
): Promise<void> {
  const entry: ImportedProjectRegistryEntry = {
    name: importedProject.name,
    path: importedProject.path,
    stack: importedProject.stack,
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
      await fsExtra.copy(sourcePath, destinationPath, {
        overwrite: false,
        errorOnExist: true,
      });
    } else {
      await execa('git', ['clone', '--depth', '1', source, destinationPath], {
        timeout: 120000,
      });
    }

    destinationPrepared = true;

    const detection = detectBackendFrameworkFromProject(destinationPath);
    const importedProject: ImportedProjectResult = {
      name: path.basename(destinationPath),
      path: destinationPath,
      stack: detection.importStack,
      confidence: detection.confidence,
      source: sourceType,
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
