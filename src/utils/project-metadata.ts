import fs from 'fs';
import path from 'path';

import {
  detectBackendFrameworkFromProject,
  detectBackendFrameworkFromHints,
  type BackendFrameworkDetection,
} from './backend-framework-contract.js';
import { readRapidkitProjectJson, type RapidkitProjectJson } from './runtime-detection.js';

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
  const contextPath = path.join(projectRoot, '.rapidkit', 'context.json');
  if (!fs.existsSync(contextPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(contextPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
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
  contextJson: RapidkitContextJson,
  detection: BackendFrameworkDetection
): boolean {
  if (projectJson?.module_support === false || contextJson?.module_support === false) {
    return false;
  }

  if (projectJson?.module_support === true || contextJson?.module_support === true) {
    return true;
  }

  if (!projectJson && contextJson) {
    return false;
  }

  return detection.runtime === 'python' || detection.runtime === 'node';
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
  const projectJsonPath = path.join(resolvedRoot, '.rapidkit', 'project.json');
  const contextJsonPath = path.join(resolvedRoot, '.rapidkit', 'context.json');
  if (!fs.existsSync(projectJsonPath) && !fs.existsSync(contextJsonPath)) {
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
    moduleSupport: resolveModuleSupport(projectJson, contextJson, detection),
    engine: readContextEngine(contextJson),
  };
}
