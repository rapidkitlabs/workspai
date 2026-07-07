import fs from 'fs';
import path from 'path';

import {
  detectBackendFrameworkFromProject,
  detectBackendFrameworkFromHints,
  type BackendFrameworkDetection,
} from './backend-framework-contract.js';
import { resolveKitDefinition } from './kit-registry.js';
import { readRapidkitProjectJson, type RapidkitProjectJson } from './runtime-detection.js';
import { projectMetadataCandidates } from './workspace-paths.js';

export type RapidkitContextJson = Record<string, unknown> | null;

export interface ProjectMetadata {
  projectRoot: string;
  projectJson: RapidkitProjectJson;
  contextJson: RapidkitContextJson;
  detection: BackendFrameworkDetection;
  moduleSupport: boolean;
  engine: 'npm' | 'pip' | 'python' | 'unknown';
}

export function readRapidkitContextJson(projectRoot: string): RapidkitContextJson {
  for (const contextPath of projectMetadataCandidates(projectRoot, 'context.json')) {
    if (!fs.existsSync(contextPath)) {
      continue;
    }
    try {
      return JSON.parse(fs.readFileSync(contextPath, 'utf8')) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function readContextEngine(contextJson: RapidkitContextJson): ProjectMetadata['engine'] {
  const engine = contextJson?.engine;
  if (engine === 'npm' || engine === 'pip' || engine === 'python') {
    return engine;
  }
  return 'unknown';
}

function resolveModuleSupport(
  projectJson: RapidkitProjectJson,
  contextJson: RapidkitContextJson
): boolean {
  if (projectJson?.module_support === false || contextJson?.module_support === false) {
    return false;
  }

  if (!projectJson && contextJson) {
    return false;
  }

  const kitName =
    typeof projectJson?.kit_name === 'string'
      ? projectJson.kit_name
      : typeof projectJson?.kit === 'string'
        ? projectJson.kit
        : typeof contextJson?.kit === 'string'
          ? contextJson.kit
          : undefined;
  const kit = kitName ? resolveKitDefinition(kitName) : undefined;
  if (kit?.owner === 'core' && kit.moduleSupport === true) {
    return true;
  }

  return false;
}

function resolveDetection(
  projectRoot: string,
  projectJson: RapidkitProjectJson,
  contextJson: RapidkitContextJson
): BackendFrameworkDetection {
  const hinted = detectBackendFrameworkFromHints({
    runtime:
      typeof projectJson?.runtime === 'string'
        ? projectJson.runtime
        : typeof contextJson?.runtime === 'string'
          ? (contextJson.runtime as string)
          : undefined,
    framework:
      typeof projectJson?.framework === 'string'
        ? projectJson.framework
        : typeof contextJson?.framework === 'string'
          ? (contextJson.framework as string)
          : undefined,
    kitName:
      typeof projectJson?.kit_name === 'string'
        ? projectJson.kit_name
        : typeof projectJson?.kit === 'string'
          ? projectJson.kit
          : typeof contextJson?.kit === 'string'
            ? (contextJson.kit as string)
            : undefined,
  });

  if (hinted.key !== 'unknown') {
    return hinted;
  }

  return detectBackendFrameworkFromProject(projectRoot, projectJson);
}

export function readProjectMetadata(projectRoot: string): ProjectMetadata | null {
  const resolvedRoot = path.resolve(projectRoot);
  const hasProjectMetadata = [
    ...projectMetadataCandidates(resolvedRoot, 'project.json'),
    ...projectMetadataCandidates(resolvedRoot, 'context.json'),
  ].some((candidate) => fs.existsSync(candidate));
  if (!hasProjectMetadata) {
    return null;
  }

  const projectJson = readRapidkitProjectJson(resolvedRoot);
  const contextJson = readRapidkitContextJson(resolvedRoot);
  const detection = resolveDetection(resolvedRoot, projectJson, contextJson);

  return {
    projectRoot: resolvedRoot,
    projectJson,
    contextJson,
    detection,
    moduleSupport: resolveModuleSupport(projectJson, contextJson),
    engine: readContextEngine(contextJson),
  };
}
