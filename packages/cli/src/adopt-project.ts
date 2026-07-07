import path from 'path';

import fsExtra from 'fs-extra';

import {
  upsertImportedProjectsRegistry,
  type ImportedProjectRegistryEntry,
} from './imported-projects-registry.js';
import { buildImportReadinessReport } from './utils/import-readiness.js';
import { resolveImportModuleSupport } from './utils/import-module-support.js';
import { inferWorkspaceProjectKind, type WorkspaceProjectKind } from './utils/project-kind.js';
import { resolveWorkspaceProjectPaths } from './utils/workspace-project-paths.js';
import {
  detectBackendFrameworkFromProject,
  type BackendConfidence,
  type BackendImportStack,
  type BackendRuntimeFamily,
  type BackendSupportTier,
} from './utils/backend-framework-contract.js';
import {
  hasWorkspaceRootMarkers,
  projectMetadataCandidates,
  projectMetadataPath,
} from './utils/workspace-paths.js';
import {
  collectWorkspaceProfileRuntimes,
  readWorkspaceManifestProfile,
  readWorkspaceProfilePolicyMode,
  resolveWorkspaceProfileCompatibility,
  resolveWorkspaceProfileProjectCompatibility,
  type WorkspaceProfileCompatibilityResult,
  type WorkspaceProfilePolicyMode,
} from './workspace-profile-compatibility.js';

export interface AdoptProjectOptions {
  workspacePath: string;
  source: string;
  name?: string;
  dryRun?: boolean;
  enableModules?: boolean;
  profilePolicyMode?: WorkspaceProfilePolicyMode;
  now?: Date;
}

export interface AdoptProjectResult {
  name: string;
  path: string;
  relativePath: string;
  contractRelativePath: string;
  isExternal: boolean;
  relationship: 'adopted';
  stack: BackendImportStack;
  runtime: BackendRuntimeFamily;
  framework: string;
  frameworkDisplayName: string;
  supportTier: BackendSupportTier;
  moduleSupport: boolean;
  confidence: BackendConfidence;
  projectJsonPath: string;
  adoptJsonPath: string;
  adoptReadinessPath: string;
  profileCompatibility: WorkspaceProfileCompatibilityResult;
  wroteFiles: boolean;
}

function normalizeProjectName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 64);
}

function isSameDirectory(left: string, right: string): boolean {
  return path.resolve(left) === path.resolve(right);
}

async function readExistingProjectJson(
  projectPath: string
): Promise<Record<string, unknown> | null> {
  for (const projectJsonPath of projectMetadataCandidates(projectPath, 'project.json')) {
    if (!(await fsExtra.pathExists(projectJsonPath))) {
      continue;
    }
    try {
      return (await fsExtra.readJson(projectJsonPath)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function buildAdoptedProjectJson(input: {
  projectName: string;
  relativePath: string;
  contractRelativePath: string;
  isExternal: boolean;
  discoveredRelativePath: string;
  detection: ReturnType<typeof detectBackendFrameworkFromProject>;
  existingProjectJson: Record<string, unknown> | null;
  projectKind: WorkspaceProjectKind;
  moduleSupport: boolean;
  adoptedAt: string;
}): Record<string, unknown> {
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

  return {
    ...(input.existingProjectJson || {}),
    schema_version:
      typeof input.existingProjectJson?.schema_version === 'string'
        ? input.existingProjectJson.schema_version
        : '1.0',
    name:
      typeof input.existingProjectJson?.name === 'string'
        ? input.existingProjectJson.name
        : input.projectName,
    slug:
      typeof input.existingProjectJson?.slug === 'string'
        ? input.existingProjectJson.slug
        : input.projectName,
    kind: input.projectKind,
    runtime: input.detection.runtime,
    framework: input.detection.key,
    kit:
      typeof input.existingProjectJson?.kit === 'string'
        ? input.existingProjectJson.kit
        : `adopted.${input.detection.key}`,
    kit_name:
      typeof input.existingProjectJson?.kit_name === 'string'
        ? input.existingProjectJson.kit_name
        : `adopted.${input.detection.key}`,
    engine:
      typeof input.existingProjectJson?.engine === 'string'
        ? input.existingProjectJson.engine
        : 'npm',
    module_support: input.moduleSupport,
    modules: existingModules,
    contracts: existingContracts,
    adoption: {
      managed_by: 'workspai',
      mode: 'linked',
      adopted_at: input.adoptedAt,
      relative_path: input.contractRelativePath,
      discovered_relative_path: input.discoveredRelativePath,
      is_external: input.isExternal,
      detection: {
        framework: input.detection.key,
        runtime: input.detection.runtime,
        confidence: input.detection.confidence,
        support_tier: input.detection.supportTier,
        source: input.detection.source,
      },
    },
  };
}

export async function cleanupAdoptedProjectImport(
  workspacePath: string,
  projectPath: string,
  previousProjectJson: Record<string, unknown> | null
): Promise<void> {
  const projectJsonPaths = projectMetadataCandidates(projectPath, 'project.json');
  const canonicalProjectJsonPath = projectMetadataPath(projectPath, 'project.json');
  const adoptJsonPaths = projectMetadataCandidates(projectPath, 'adopt.json');
  const adoptReadinessPaths = projectMetadataCandidates(projectPath, 'adopt-readiness.json');

  if (previousProjectJson) {
    await fsExtra.ensureDir(path.dirname(canonicalProjectJsonPath));
    await fsExtra.writeJson(canonicalProjectJsonPath, previousProjectJson, { spaces: 2 });
  } else {
    for (const projectJsonPath of projectJsonPaths) {
      if (await fsExtra.pathExists(projectJsonPath)) {
        await fsExtra.remove(projectJsonPath);
      }
    }
  }

  for (const adoptJsonPath of adoptJsonPaths) {
    if (await fsExtra.pathExists(adoptJsonPath)) {
      await fsExtra.remove(adoptJsonPath);
    }
  }
  for (const adoptReadinessPath of adoptReadinessPaths) {
    if (await fsExtra.pathExists(adoptReadinessPath)) {
      await fsExtra.remove(adoptReadinessPath);
    }
  }

  const { removeImportedProjectsRegistryEntries } = await import('./imported-projects-registry.js');
  await removeImportedProjectsRegistryEntries(workspacePath, [projectPath]);
}

export async function adoptProjectIntoWorkspace(
  options: AdoptProjectOptions
): Promise<AdoptProjectResult> {
  const workspacePath = path.resolve(options.workspacePath);
  const projectPath = path.resolve(options.source);
  const projectStats = await fsExtra.stat(projectPath).catch(() => null);
  if (!projectStats || !projectStats.isDirectory()) {
    throw new Error('Adopt source is not a directory.');
  }
  if (isSameDirectory(workspacePath, projectPath)) {
    throw new Error('Adopt source cannot be the workspace root itself.');
  }
  if (hasWorkspaceRootMarkers(projectPath)) {
    throw new Error('This is a workspace. Import it as a workspace instead.');
  }

  const existingProjectJson = await readExistingProjectJson(projectPath);
  const detection = detectBackendFrameworkFromProject(projectPath, existingProjectJson);
  const projectKind = await inferWorkspaceProjectKind(projectPath, existingProjectJson);
  const projectName =
    normalizeProjectName(
      options.name ||
        (typeof existingProjectJson?.name === 'string' ? existingProjectJson.name : '') ||
        path.basename(projectPath)
    ) || 'adopted-project';
  const paths = resolveWorkspaceProjectPaths({
    workspacePath,
    projectPath,
    projectName,
  });
  const adoptedAt = (options.now ?? new Date()).toISOString();
  const projectJsonPath = projectMetadataPath(projectPath, 'project.json');
  const adoptJsonPath = projectMetadataPath(projectPath, 'adopt.json');
  const adoptReadinessPath = projectMetadataPath(projectPath, 'adopt-readiness.json');
  const moduleSupport = resolveImportModuleSupport({
    existingProjectJson,
    detection,
    enableModules: options.enableModules,
  });
  const [workspaceProfile, profilePolicyMode] = await Promise.all([
    readWorkspaceManifestProfile(workspacePath),
    options.profilePolicyMode
      ? Promise.resolve(options.profilePolicyMode)
      : readWorkspaceProfilePolicyMode(workspacePath),
  ]);
  const projectProfileCompatibility = resolveWorkspaceProfileProjectCompatibility({
    profile: workspaceProfile,
    runtime: detection.runtime,
    subjectLabel: projectName,
    mode: profilePolicyMode,
  });
  const workspaceProfileCompatibility = resolveWorkspaceProfileCompatibility({
    profile: workspaceProfile,
    runtimes: await collectWorkspaceProfileRuntimes(workspacePath, {
      additionalRuntimes: [detection.runtime],
    }),
    mode: profilePolicyMode,
  });
  const profileCompatibility = projectProfileCompatibility.ok
    ? workspaceProfileCompatibility
    : projectProfileCompatibility;
  if (!profileCompatibility.ok && profilePolicyMode === 'strict') {
    throw new Error(profileCompatibility.message);
  }
  const projectJson = buildAdoptedProjectJson({
    projectName,
    relativePath: paths.relativePath,
    contractRelativePath: paths.contractRelativePath,
    isExternal: paths.isExternal,
    discoveredRelativePath: paths.relativePath,
    detection,
    existingProjectJson,
    projectKind,
    moduleSupport,
    adoptedAt,
  });
  const adoptPayload = {
    schema_version: '1.0',
    kind: 'workspai.adopted_project',
    adopted_at: adoptedAt,
    managed_by: 'workspai',
    mode: 'linked',
    workspace: {
      path: workspacePath,
    },
    project: {
      name: projectName,
      path: projectPath,
      relative_path: paths.contractRelativePath,
      discovered_relative_path: paths.relativePath,
      is_external: paths.isExternal,
      kind: projectKind,
      module_support: moduleSupport,
    },
    detection: {
      framework: detection.key,
      framework_display_name: detection.displayName,
      runtime: detection.runtime,
      kind: projectKind,
      confidence: detection.confidence,
      support_tier: detection.supportTier,
      import_stack: detection.importStack,
      source: detection.source,
    },
    policy: {
      moved_source: false,
      copied_source: false,
      module_mutation_enabled: moduleSupport,
      workspace_contract: 'linked-project',
      profile_compatibility: {
        ok: profileCompatibility.ok,
        profile: profileCompatibility.profile,
        runtimes: profileCompatibility.runtimes,
        message: profileCompatibility.message,
        recommended_profile: profileCompatibility.recommendedProfile,
        recommended_command: profileCompatibility.recommendedCommand,
      },
    },
  };
  const readinessPayload = buildImportReadinessReport({
    projectName,
    relativePath: paths.contractRelativePath,
    projectKind,
    source: 'adopted-local',
    detection,
    moduleSupport,
    projectPath,
    generatedAt: new Date(adoptedAt),
  });

  if (options.dryRun !== true) {
    await fsExtra.ensureDir(path.dirname(projectJsonPath));
    await fsExtra.writeJson(projectJsonPath, projectJson, { spaces: 2 });
    await fsExtra.writeJson(adoptJsonPath, adoptPayload, { spaces: 2 });
    await fsExtra.writeJson(adoptReadinessPath, readinessPayload, { spaces: 2 });

    const entry: ImportedProjectRegistryEntry = {
      name: projectName,
      path: projectPath,
      relativePath: paths.contractRelativePath,
      relationship: 'adopted',
      stack: detection.importStack,
      runtime: detection.runtime,
      framework: detection.key,
      frameworkDisplayName: detection.displayName,
      supportTier: detection.supportTier,
      moduleSupport,
      confidence: detection.confidence,
      source: 'adopted-local',
      importedAt: adoptedAt,
    };
    await upsertImportedProjectsRegistry(workspacePath, [entry]);
  }

  return {
    name: projectName,
    path: projectPath,
    relativePath: paths.relativePath,
    contractRelativePath: paths.contractRelativePath,
    isExternal: paths.isExternal,
    relationship: 'adopted',
    stack: detection.importStack,
    runtime: detection.runtime,
    framework: detection.key,
    frameworkDisplayName: detection.displayName,
    supportTier: detection.supportTier,
    moduleSupport,
    confidence: detection.confidence,
    projectJsonPath,
    adoptJsonPath,
    adoptReadinessPath,
    profileCompatibility,
    wroteFiles: options.dryRun !== true,
  };
}
