import path from 'path';

import fsExtra from 'fs-extra';
import { projectMetadataCandidates } from './workspace-paths.js';

export type WorkspaceProjectKind =
  'service' | 'frontend' | 'worker' | 'library' | 'infra' | 'docs' | 'test-suite' | 'unknown';

const PROJECT_KIND_VALUES = new Set<WorkspaceProjectKind>([
  'service',
  'frontend',
  'worker',
  'library',
  'infra',
  'docs',
  'test-suite',
  'unknown',
]);

async function readJsonIfExists(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    if (!(await fsExtra.pathExists(filePath))) {
      return null;
    }
    const raw = await fsExtra.readJSON(filePath);
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function readFirstProjectMetadata(
  candidates: string[]
): Promise<Record<string, unknown> | null> {
  for (const candidate of candidates) {
    const payload = await readJsonIfExists(candidate);
    if (payload) {
      return payload;
    }
  }
  return null;
}

function normalizeProjectKind(raw: unknown): WorkspaceProjectKind | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const normalized = raw.trim().toLowerCase() as WorkspaceProjectKind;
  return PROJECT_KIND_VALUES.has(normalized) ? normalized : null;
}

export async function inferWorkspaceProjectKind(
  projectPath: string,
  projectJson?: Record<string, unknown> | null
): Promise<WorkspaceProjectKind> {
  const metadata =
    projectJson ??
    (await readFirstProjectMetadata(projectMetadataCandidates(projectPath, 'project.json')));
  const metadataKind = normalizeProjectKind(metadata?.kind) ?? normalizeProjectKind(metadata?.type);
  if (metadataKind) {
    return metadataKind;
  }

  const kit = typeof metadata?.kit_name === 'string' ? metadata.kit_name : metadata?.kit;
  const framework = typeof metadata?.framework === 'string' ? metadata.framework : null;
  const runtime = typeof metadata?.runtime === 'string' ? metadata.runtime : null;
  const serviceSignals = `${typeof kit === 'string' ? kit : ''} ${framework ?? ''} ${runtime ?? ''}`
    .trim()
    .toLowerCase();

  if (
    /\b(frontend|nextjs|next\.js|react|vue|svelte|vite|angular|astro|remix|nuxt)\b/.test(
      serviceSignals
    )
  ) {
    return 'frontend';
  }

  if (
    /\b(fastapi|nestjs|springboot|spring boot|gofiber|gogin|dotnet|webapi|django|flask|express|fastify|python|node|java|go|rust|php|ruby|elixir)\b/.test(
      serviceSignals
    )
  ) {
    return 'service';
  }

  const packageJson = await readJsonIfExists(path.join(projectPath, 'package.json'));
  if (packageJson) {
    const dependencies = {
      ...((packageJson.dependencies as Record<string, unknown> | undefined) ?? {}),
      ...((packageJson.devDependencies as Record<string, unknown> | undefined) ?? {}),
    };
    const scripts = ((packageJson.scripts as Record<string, unknown> | undefined) ?? {}) as Record<
      string,
      unknown
    >;
    const scriptText = Object.values(scripts)
      .filter((item): item is string => typeof item === 'string')
      .join(' ')
      .toLowerCase();

    if (
      dependencies.next ||
      dependencies.react ||
      dependencies.vue ||
      dependencies.svelte ||
      dependencies.vite ||
      dependencies['@angular/core'] ||
      scriptText.includes('next ') ||
      scriptText.includes('vite ')
    ) {
      return 'frontend';
    }
    if (packageJson.private === true && !dependencies.express && !dependencies['@nestjs/core']) {
      return 'library';
    }
  }

  if (
    (await fsExtra.pathExists(path.join(projectPath, 'Dockerfile'))) ||
    (await fsExtra.pathExists(path.join(projectPath, 'docker-compose.yml'))) ||
    (await fsExtra.pathExists(path.join(projectPath, 'terraform.tf')))
  ) {
    return 'infra';
  }

  return 'service';
}
