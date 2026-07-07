import { listFrontendGenerators } from '../frontend-project.js';
import {
  EXTERNAL_CREATE_ADOPT_CANDIDATES,
  resolveCreatePlannerCapability,
  type CreatePlannerLane,
  type CreatePlannerStatus,
} from '../utils/create-planner-capabilities.js';
import { listInteractiveKits } from '../utils/kit-registry.js';

export const CREATE_PLANNER_CAPABILITIES_SCHEMA_VERSION = 'rapidkit-create-planner-capabilities-v1';

export type CreatePlannerCapabilitiesContract = {
  schemaVersion: typeof CREATE_PLANNER_CAPABILITIES_SCHEMA_VERSION;
  lanes: Record<
    CreatePlannerLane,
    {
      status: CreatePlannerStatus;
      meaning: string;
    }
  >;
  nativeCreate: Array<{
    id: string;
    runtime: string;
    framework: string;
    owner: string;
    stability: string;
    moduleSupport: boolean;
  }>;
  externalCreateAdopt: Array<{
    id: string;
    aliases: string[];
    ecosystem: string;
    status: 'planned';
    officialCommands: string[];
    adoptAfterCreate: true;
  }>;
  adoptOnlyRuntimes: string[];
  productRules: string[];
};

export function buildCreatePlannerCapabilitiesContract(): CreatePlannerCapabilitiesContract {
  const backendNative = listInteractiveKits().map((kit) => ({
    id: kit.id,
    runtime: kit.runtime,
    framework: kit.framework,
    owner: kit.owner,
    stability: kit.stability,
    moduleSupport: kit.moduleSupport,
  }));
  const frontendNative = listFrontendGenerators().map((definition) => ({
    id: definition.kitId,
    runtime: 'node',
    framework: definition.framework,
    owner: 'npm',
    stability: 'stable',
    moduleSupport: false,
  }));
  const adoptOnlyRuntimes = ['php', 'ruby', 'rust', 'elixir', 'clojure', 'scala', 'kotlin'];

  return {
    schemaVersion: CREATE_PLANNER_CAPABILITIES_SCHEMA_VERSION,
    lanes: {
      'native-create': {
        status: 'available',
        meaning:
          'Workspai owns the scaffold contract, marker, registry, doctor, bootstrap, and workspace model path.',
      },
      'external-create-adopt': {
        status: 'planned',
        meaning:
          'A stable ecosystem generator exists, but Workspai does not yet own the post-create contract.',
      },
      'adopt-only': {
        status: 'available',
        meaning:
          'The project enters Workspace Intelligence through import/adopt, not native create.',
      },
    },
    nativeCreate: [...backendNative, ...frontendNative],
    externalCreateAdopt: EXTERNAL_CREATE_ADOPT_CANDIDATES.map((candidate) => ({
      ...candidate,
      officialCommands: [...candidate.officialCommands],
      aliases: [...candidate.aliases],
    })),
    adoptOnlyRuntimes,
    productRules: [
      'Do not translate unsupported stack requests into unrelated native kits.',
      'If native create is unavailable, explain the lane and guide to adopt/import.',
      'Use the same capability contract in CLI, CI, VS Code, and AI planning surfaces.',
    ],
  };
}

export function resolveContractedCreateCapability(input: {
  kitId?: string;
  framework?: string;
  runtime?: string;
  projectExists?: boolean;
}) {
  return resolveCreatePlannerCapability(input);
}
