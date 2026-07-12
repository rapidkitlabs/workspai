import { listFrontendGenerators } from '../frontend-project.js';
import {
  buildCreatePlannerCapabilitiesContract,
  type CreatePlannerCapabilitiesContract,
} from './create-planner-capabilities-contract.js';
import { KIT_REGISTRY } from '../utils/kit-registry.js';
import {
  RUNTIME_SURFACE_CORE_PROJECT_COMMANDS,
  RUNTIME_SURFACE_GLOBAL_COMMANDS,
  RUNTIME_SURFACE_LIFECYCLE_COMMANDS,
  RUNTIME_SURFACE_MODULE_MUTATION_COMMANDS,
  RUNTIME_SURFACE_UNIVERSAL_COMMANDS,
} from '../utils/project-command-capabilities.js';
import { RUNTIME_SUPPORT_MATRIX } from '../utils/support-matrix.js';
import {
  WORKSPACE_INTELLIGENCE_SUBCOMMANDS,
  WORKSPACE_SUBCOMMANDS,
} from '../utils/workspace-command-surface.js';

export const RUNTIME_COMMAND_SURFACE_SCHEMA_VERSION = 'rapidkit-runtime-command-surface-v1';

export type RuntimeCommandSurfaceContract = {
  schemaVersion: string;
  lifecycleCommands: string[];
  moduleMutationCommands: string[];
  globalCommands: string[];
  universalCommands: string[];
  coreProjectCommands: string[];
  workspaceSubcommands: string[];
  workspaceIntelligenceSubcommands: string[];
  moduleSuggestionFrameworks: string[];
  moduleUnsupportedFrameworks: string[];
  scaffoldKits: string[];
  createPlanner: {
    lanes: CreatePlannerCapabilitiesContract['lanes'];
    nativeCreateKits: string[];
    officialCreate: string[];
    existingRuntimeSignals: string[];
  };
  runtimeMatrix: Record<
    string,
    {
      tier: string;
      scaffold: boolean;
      import: boolean;
      moduleCommands: boolean;
      doctor: string;
      lifecycleCommands: string[];
    }
  >;
};

const MODULE_UNSUPPORTED_BACKEND_FRAMEWORKS = ['go', 'springboot', 'dotnet'] as const;

/** Stable scaffold kit ordering shared with rapidkit-vscode package.json enum */
const CANONICAL_BACKEND_KIT_ORDER = [
  'fastapi.standard',
  'fastapi.ddd',
  'nestjs.standard',
  'gofiber.standard',
  'gogin.standard',
  'springboot.standard',
  'dotnet.webapi.clean',
] as const;

function buildScaffoldKits(): string[] {
  const registryScaffoldKits = KIT_REGISTRY.filter(
    (kit) => kit.owner === 'core' || kit.generator
  ).map((kit) => kit.id);
  const registrySet = new Set(registryScaffoldKits);
  const backendKits = [
    ...CANONICAL_BACKEND_KIT_ORDER.filter((kitId) => registrySet.has(kitId)),
    ...registryScaffoldKits.filter(
      (kitId) =>
        !CANONICAL_BACKEND_KIT_ORDER.includes(kitId as (typeof CANONICAL_BACKEND_KIT_ORDER)[number])
    ),
  ];
  const frontendKits = listFrontendGenerators().map((definition) => definition.kitId);
  return [...backendKits, ...frontendKits];
}

function buildModuleSuggestionFrameworks(): string[] {
  const seen = new Set<string>();
  const frameworks: string[] = [];
  for (const kit of KIT_REGISTRY) {
    if (!kit.moduleSupport) {
      continue;
    }
    const scaffoldFramework =
      kit.framework === 'gofiber' || kit.framework === 'gogin' || kit.framework === 'echo'
        ? 'go'
        : kit.framework === 'springboot'
          ? 'springboot'
          : kit.framework === 'dotnet'
            ? 'dotnet'
            : kit.framework === 'fastapi'
              ? 'fastapi'
              : kit.framework === 'nestjs'
                ? 'nestjs'
                : String(kit.framework);
    if (!seen.has(scaffoldFramework)) {
      seen.add(scaffoldFramework);
      frameworks.push(scaffoldFramework);
    }
  }
  return frameworks;
}

function buildModuleUnsupportedFrameworks(): string[] {
  const frontendScaffoldIds = listFrontendGenerators().map((definition) => definition.id);
  return [...MODULE_UNSUPPORTED_BACKEND_FRAMEWORKS, ...frontendScaffoldIds];
}

function buildRuntimeMatrix(): RuntimeCommandSurfaceContract['runtimeMatrix'] {
  const matrix: RuntimeCommandSurfaceContract['runtimeMatrix'] = {};

  for (const [runtime, entry] of Object.entries(RUNTIME_SUPPORT_MATRIX)) {
    matrix[runtime] = {
      tier: entry.tier,
      scaffold: entry.scaffoldSupport,
      import: entry.importSupport,
      moduleCommands: entry.moduleCommands,
      doctor: entry.doctorSupport,
      lifecycleCommands: [...entry.lifecycleCommands],
    };
  }

  return matrix;
}

export function buildRuntimeCommandSurfaceContract(): RuntimeCommandSurfaceContract {
  const createPlanner = buildCreatePlannerCapabilitiesContract();
  return {
    schemaVersion: RUNTIME_COMMAND_SURFACE_SCHEMA_VERSION,
    lifecycleCommands: [...RUNTIME_SURFACE_LIFECYCLE_COMMANDS],
    moduleMutationCommands: [...RUNTIME_SURFACE_MODULE_MUTATION_COMMANDS],
    globalCommands: [...RUNTIME_SURFACE_GLOBAL_COMMANDS],
    universalCommands: [...RUNTIME_SURFACE_UNIVERSAL_COMMANDS],
    coreProjectCommands: [...RUNTIME_SURFACE_CORE_PROJECT_COMMANDS],
    workspaceSubcommands: [...WORKSPACE_SUBCOMMANDS],
    workspaceIntelligenceSubcommands: [...WORKSPACE_INTELLIGENCE_SUBCOMMANDS],
    moduleSuggestionFrameworks: buildModuleSuggestionFrameworks(),
    moduleUnsupportedFrameworks: buildModuleUnsupportedFrameworks(),
    scaffoldKits: buildScaffoldKits(),
    createPlanner: {
      lanes: createPlanner.lanes,
      nativeCreateKits: createPlanner.nativeCreate.map((entry) => entry.id),
      officialCreate: createPlanner.officialCreate.map((entry) => entry.id),
      existingRuntimeSignals: [...createPlanner.existingRuntimeSignals],
    },
    runtimeMatrix: buildRuntimeMatrix(),
  };
}
