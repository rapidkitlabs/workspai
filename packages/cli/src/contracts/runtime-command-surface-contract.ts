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
import {
  NPM_ONLY_SCOPED_COMMANDS,
  NPM_ONLY_TOP_LEVEL_COMMANDS,
} from '../utils/cli-command-surface.js';
import { RUNTIME_SUPPORT_MATRIX } from '../utils/support-matrix.js';
import {
  WORKSPACE_INTELLIGENCE_SUBCOMMANDS,
  WORKSPACE_SUBCOMMANDS,
} from '../utils/workspace-command-surface.js';
import {
  WORKSPACE_ARCHIVE_CAPABILITIES_CONTRACT_PATH,
  WORKSPACE_ARCHIVE_CAPABILITIES_SCHEMA_VERSION,
  WORKSPACE_ARCHIVE_CLI_FLAGS,
} from './workspace-archive-contract.js';
import {
  WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMA_CONTRACTS,
  WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMAS,
  WORKSPACE_INTELLIGENCE_ARTIFACTS,
  WORKSPACE_INTELLIGENCE_ROOT_COMMANDS,
  WORKSPACE_INTELLIGENCE_RUNTIME_STEPS,
} from './workspace-intelligence-runtime-registry.js';
import {
  CLI_OPERATION_RESULT_CONTRACT_PATH,
  CLI_OPERATION_RESULT_SCHEMA_VERSION,
} from './cli-operation-result-contract.js';
import { WORKSPACE_ARTIFACT_CONTRACTS } from './artifact-contract-registry.js';

export const RUNTIME_COMMAND_SURFACE_SCHEMA_VERSION = 'rapidkit-runtime-command-surface-v1';

export type RuntimeCommandSurfaceContract = {
  schemaVersion: string;
  lifecycleCommands: string[];
  moduleMutationCommands: string[];
  globalCommands: string[];
  universalCommands: string[];
  coreProjectCommands: string[];
  npmOwnedTopLevelCommands: string[];
  npmOwnedScopedCommands: string[][];
  commandDocumentation: Array<{
    invocation: string;
    summary: string;
  }>;
  artifactContracts: Array<{
    artifactPath: string;
    schemaVersion: string;
    contractPath: string;
    producerCommands: string[][];
  }>;
  workspaceSubcommands: string[];
  workspaceIntelligenceSubcommands: string[];
  workspaceIntelligenceRootCommands: string[];
  workspaceIntelligenceExecution: Array<{
    id: string;
    argv: string[];
    produces: Array<{
      path: string;
      schemaVersion: string | null;
      contractPath: string | null;
    }>;
  }>;
  jsonOperationResult: { schemaVersion: string; contractPath: string };
  workspaceArchive: {
    schemaVersion: string;
    contractPath: string;
    commands: string[];
    flags: string[];
  };
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

const COMMAND_SUMMARIES: Readonly<Record<string, string>> = {
  'workspace list':
    'List registered workspaces through the canonical workspace discovery boundary.',
  'workspace sync':
    'Reconcile registered projects and workspace identity with the current filesystem state.',
  'workspace registry': 'Inspect and maintain the canonical workspace registry boundary.',
  'workspace foundation':
    'Inspect or establish the foundational metadata required by workspace operations.',
  'workspace snapshot':
    'Capture a versioned workspace or model baseline for comparison and recovery.',
  'workspace graph': 'Render the current workspace dependency graph in a supported representation.',
  'workspace watch': 'Observe relevant workspace changes and publish versioned watch events.',
  'workspace remediation-plan':
    'Generate a structured remediation plan from current workspace evidence.',
  'workspace why': 'Explain why a relationship, verdict, or workspace fact exists.',
  'workspace trace': 'Trace a change or finding through its evidence and dependency relationships.',
  'workspace feedback': 'Record structured feedback about Workspace Intelligence output.',
  'workspace mcp': 'Expose Workspace Intelligence through the MCP integration boundary.',
  'workspace policy': 'Inspect or update workspace governance policy.',
  'workspace contract': 'Inspect and verify explicit workspace contracts.',
  'workspace share': 'Prepare a governed workspace sharing surface.',
  'workspace export': 'Export workspace intelligence into a portable consumer representation.',
  'workspace archive': 'Create or inspect a governed workspace archive.',
  'workspace hydrate': 'Restore or materialize workspace state from a portable representation.',
  'workspace import': 'Attach an existing project or repository to the workspace inventory.',
  'workspace run': 'Run a supported lifecycle command across registered workspace projects.',
  'workspace init': 'Initialize workspace and project dependencies through the shared init flow.',
  'ai info': 'Report the active AI provider, model, and embedding configuration.',
  'snapshot list': 'List governed workspace snapshots available for inspection or recovery.',
  'doctor project': 'Diagnose the current project and emit structured project evidence.',
  project: 'Expose project-scoped command discovery, archive, restore, and deletion operations.',
  'infra plan': 'Generate a versioned infrastructure plan without applying infrastructure changes.',
  'product plan': 'Generate a product factory plan from the current product definition.',
  'product manifest create': 'Create a governed product manifest for product planning operations.',
  'snapshot create': 'Create a governed workspace snapshot for comparison or recovery.',
};

function commandSummary(invocation: string): string {
  const curated = COMMAND_SUMMARIES[invocation];
  if (curated) return curated;
  return `Expose the supported ${invocation} capability through the canonical Workspai CLI boundary.`;
}

function buildCommandDocumentation(
  invocations: readonly string[]
): RuntimeCommandSurfaceContract['commandDocumentation'] {
  return [...new Set(invocations)]
    .sort((left, right) => left.localeCompare(right))
    .map((invocation) => ({ invocation, summary: commandSummary(invocation) }));
}

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
  const intelligenceExecutions = Object.entries(WORKSPACE_INTELLIGENCE_RUNTIME_STEPS).map(
    ([id, step]) => ({ id, step })
  );
  const commandInvocations = [
    ...RUNTIME_SURFACE_LIFECYCLE_COMMANDS,
    ...RUNTIME_SURFACE_MODULE_MUTATION_COMMANDS,
    ...RUNTIME_SURFACE_GLOBAL_COMMANDS,
    ...RUNTIME_SURFACE_UNIVERSAL_COMMANDS,
    ...RUNTIME_SURFACE_CORE_PROJECT_COMMANDS,
    ...NPM_ONLY_TOP_LEVEL_COMMANDS,
    ...NPM_ONLY_SCOPED_COMMANDS.map((command) => command.join(' ')),
    'workspace',
    ...WORKSPACE_SUBCOMMANDS.map((command) => `workspace ${command}`),
    ...WORKSPACE_INTELLIGENCE_ROOT_COMMANDS,
    ...intelligenceExecutions.map(({ step }) => step.command.join(' ')),
    ...Object.values(WORKSPACE_ARTIFACT_CONTRACTS).flatMap((descriptor) =>
      descriptor.producerCommands.map((command) => command.join(' '))
    ),
  ];
  return {
    schemaVersion: RUNTIME_COMMAND_SURFACE_SCHEMA_VERSION,
    lifecycleCommands: [...RUNTIME_SURFACE_LIFECYCLE_COMMANDS],
    moduleMutationCommands: [...RUNTIME_SURFACE_MODULE_MUTATION_COMMANDS],
    globalCommands: [...RUNTIME_SURFACE_GLOBAL_COMMANDS],
    universalCommands: [...RUNTIME_SURFACE_UNIVERSAL_COMMANDS],
    coreProjectCommands: [...RUNTIME_SURFACE_CORE_PROJECT_COMMANDS],
    npmOwnedTopLevelCommands: [...NPM_ONLY_TOP_LEVEL_COMMANDS],
    npmOwnedScopedCommands: NPM_ONLY_SCOPED_COMMANDS.map((command) => [...command]),
    commandDocumentation: buildCommandDocumentation(commandInvocations),
    artifactContracts: Object.values(WORKSPACE_ARTIFACT_CONTRACTS).map((descriptor) => ({
      artifactPath: descriptor.artifactPath,
      schemaVersion: descriptor.schemaVersion,
      contractPath: descriptor.contractPath,
      producerCommands: descriptor.producerCommands.map((command) => [...command]),
    })),
    workspaceSubcommands: [...WORKSPACE_SUBCOMMANDS],
    workspaceIntelligenceSubcommands: [...WORKSPACE_INTELLIGENCE_SUBCOMMANDS],
    workspaceIntelligenceRootCommands: [...WORKSPACE_INTELLIGENCE_ROOT_COMMANDS],
    workspaceIntelligenceExecution: intelligenceExecutions.map(({ id, step }) => ({
      id,
      argv: [...step.command],
      produces: step.produces.map((artifactPath) => {
        const matchedId = Object.entries(WORKSPACE_INTELLIGENCE_ARTIFACTS).find(
          ([, candidatePath]) => candidatePath === artifactPath
        )?.[0] as keyof typeof WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMAS | undefined;
        return {
          path: artifactPath,
          schemaVersion: matchedId ? WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMAS[matchedId] : null,
          contractPath: matchedId
            ? WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMA_CONTRACTS[matchedId]
            : null,
        };
      }),
    })),
    jsonOperationResult: {
      schemaVersion: CLI_OPERATION_RESULT_SCHEMA_VERSION,
      contractPath: CLI_OPERATION_RESULT_CONTRACT_PATH,
    },
    workspaceArchive: {
      schemaVersion: WORKSPACE_ARCHIVE_CAPABILITIES_SCHEMA_VERSION,
      contractPath: WORKSPACE_ARCHIVE_CAPABILITIES_CONTRACT_PATH,
      commands: ['export', 'inspect', 'verify', 'doctor', 'hydrate'],
      flags: Object.values(WORKSPACE_ARCHIVE_CLI_FLAGS).map((flag) => flag.signature),
    },
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
