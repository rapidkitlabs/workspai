import {
  OFFICIAL_CREATE_CANDIDATES,
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
  officialCreate: Array<{
    id: string;
    aliases: string[];
    ecosystem: string;
    status: CreatePlannerStatus;
    canExecuteCreate: boolean;
    officialCommands: string[];
    adoptAfterCreate: true;
  }>;
  existingRuntimeSignals: string[];
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
  const existingRuntimeSignals = ['php', 'ruby', 'rust', 'elixir', 'clojure', 'scala', 'kotlin'];

  return {
    schemaVersion: CREATE_PLANNER_CAPABILITIES_SCHEMA_VERSION,
    lanes: {
      native: {
        status: 'available',
        meaning:
          'Workspai owns the scaffold contract, marker, registry, doctor, bootstrap, and workspace model path.',
      },
      official: {
        status: 'available',
        meaning:
          'A stable ecosystem generator exists. Available entries run the official generator and then register the project; planned entries fall back to adopt/import.',
      },
      existing: {
        status: 'available',
        meaning:
          'The project enters Workspace Intelligence through import/adopt, not native create.',
      },
    },
    nativeCreate: [...backendNative],
    officialCreate: OFFICIAL_CREATE_CANDIDATES.map((candidate) => ({
      ...candidate,
      officialCommands: [...candidate.officialCommands],
      aliases: [...candidate.aliases],
    })),
    existingRuntimeSignals,
    productRules: [
      'Do not translate unsupported stack requests into unrelated native kits.',
      'If native create is unavailable, explain the lane and guide to adopt/import.',
      'The existing lane is open-ended for readable projects; existingRuntimeSignals are examples for planner detection, not an allowlist.',
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
