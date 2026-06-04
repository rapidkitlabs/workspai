import fsExtra from 'fs-extra';
import * as path from 'path';

import type {
  BackendConfidence,
  BackendImportStack,
  BackendRuntimeFamily,
  BackendSupportTier,
} from './utils/backend-framework-contract.js';

export interface ImportedProjectRegistryEntry {
  name: string;
  path: string;
  relativePath?: string;
  stack: BackendImportStack;
  runtime?: BackendRuntimeFamily;
  framework?: string;
  frameworkDisplayName?: string;
  supportTier?: BackendSupportTier;
  moduleSupport?: boolean;
  confidence: BackendConfidence;
  source?: 'local-folder' | 'git-url';
  importedAt: string;
}

interface ImportedProjectsRegistryFile {
  version: 1;
  updatedAt: string;
  projects: ImportedProjectRegistryEntry[];
}

function registryFilePath(workspacePath: string): string {
  return path.join(workspacePath, '.rapidkit', 'imported-projects.json');
}

export async function readImportedProjectsRegistry(
  workspacePath: string
): Promise<ImportedProjectRegistryEntry[]> {
  const filePath = registryFilePath(workspacePath);
  if (!(await fsExtra.pathExists(filePath))) {
    return [];
  }

  try {
    const raw: unknown = await fsExtra.readJSON(filePath);
    const projects: unknown[] = Array.isArray((raw as { projects?: unknown[] })?.projects)
      ? ((raw as { projects?: unknown[] }).projects as unknown[])
      : [];

    return projects.filter((item: unknown): item is ImportedProjectRegistryEntry => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      const candidate = item as ImportedProjectRegistryEntry;
      return (
        typeof candidate.name === 'string' &&
        typeof candidate.path === 'string' &&
        typeof candidate.stack === 'string' &&
        typeof candidate.confidence === 'string' &&
        typeof candidate.importedAt === 'string'
      );
    });
  } catch {
    return [];
  }
}

export async function upsertImportedProjectsRegistry(
  workspacePath: string,
  entries: ImportedProjectRegistryEntry[]
): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  const existing = await readImportedProjectsRegistry(workspacePath);
  const byPath = new Map<string, ImportedProjectRegistryEntry>();

  for (const item of existing) {
    byPath.set(item.path, item);
  }

  for (const item of entries) {
    byPath.set(item.path, item);
  }

  const projects = Array.from(byPath.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({ ...item }));

  const payload: ImportedProjectsRegistryFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    projects,
  };

  const filePath = registryFilePath(workspacePath);
  await fsExtra.ensureDir(path.dirname(filePath));
  await fsExtra.writeJSON(filePath, payload, { spaces: 2 });
}

export async function removeImportedProjectsRegistryEntries(
  workspacePath: string,
  projectPaths: string[]
): Promise<void> {
  if (projectPaths.length === 0) {
    return;
  }

  const existing = await readImportedProjectsRegistry(workspacePath);
  const blockedPaths = new Set(projectPaths.map((item) => path.resolve(item)));
  const projects = existing.filter((item) => !blockedPaths.has(path.resolve(item.path)));

  const payload: ImportedProjectsRegistryFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    projects,
  };

  const filePath = registryFilePath(workspacePath);
  await fsExtra.ensureDir(path.dirname(filePath));
  await fsExtra.writeJSON(filePath, payload, { spaces: 2 });
}
