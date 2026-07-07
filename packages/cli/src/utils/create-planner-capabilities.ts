import { listFrontendGenerators } from '../frontend-project.js';
import { listInteractiveKits, normalizeKitId } from './kit-registry.js';

export type CreatePlannerLane = 'native-create' | 'external-create-adopt' | 'adopt-only';
export type CreatePlannerStatus = 'available' | 'planned';

export interface ExternalCreateAdoptCandidate {
  id: string;
  aliases: string[];
  ecosystem: string;
  status: 'planned';
  officialCommands: string[];
  adoptAfterCreate: true;
}

export interface CreatePlannerCapability {
  lane: CreatePlannerLane;
  status: CreatePlannerStatus;
  canExecuteCreate: boolean;
  requested: string;
  resolved?: string;
  officialCommands?: string[];
  fallbackLane?: 'adopt-only';
  reason: string;
}

const NATIVE_CREATE_KITS = new Set([
  ...listInteractiveKits().map((kit) => kit.id),
  ...listFrontendGenerators().map((definition) => definition.kitId),
]);

export const EXTERNAL_CREATE_ADOPT_CANDIDATES: ExternalCreateAdoptCandidate[] = [
  {
    id: 'wordpress-site',
    aliases: ['wordpress', 'wordpress-site', 'wp', 'wp-site'],
    ecosystem: 'wordpress',
    status: 'planned',
    officialCommands: ['wp core download', 'wp config create', 'wp db create', 'wp core install'],
    adoptAfterCreate: true,
  },
  {
    id: 'wordpress-block',
    aliases: ['wordpress-block', 'wp-block', 'gutenberg-block'],
    ecosystem: 'wordpress',
    status: 'planned',
    officialCommands: ['npx @wordpress/create-block@latest <slug>'],
    adoptAfterCreate: true,
  },
  {
    id: 'laravel',
    aliases: ['laravel', 'php-laravel'],
    ecosystem: 'php',
    status: 'planned',
    officialCommands: ['composer create-project laravel/laravel <name>'],
    adoptAfterCreate: true,
  },
  {
    id: 'symfony',
    aliases: ['symfony', 'php-symfony'],
    ecosystem: 'php',
    status: 'planned',
    officialCommands: ['composer create-project symfony/skeleton <name>'],
    adoptAfterCreate: true,
  },
  {
    id: 'rails',
    aliases: ['rails', 'ruby-on-rails', 'ruby-rails'],
    ecosystem: 'ruby',
    status: 'planned',
    officialCommands: ['rails new <name>'],
    adoptAfterCreate: true,
  },
];

const EXTERNAL_BY_ALIAS = new Map<string, ExternalCreateAdoptCandidate>();
for (const candidate of EXTERNAL_CREATE_ADOPT_CANDIDATES) {
  EXTERNAL_BY_ALIAS.set(candidate.id, candidate);
  for (const alias of candidate.aliases) {
    EXTERNAL_BY_ALIAS.set(alias, candidate);
  }
}

const ADOPT_ONLY_RUNTIME_ALIASES = new Set([
  'php',
  'ruby',
  'rust',
  'elixir',
  'clojure',
  'scala',
  'kotlin',
  'unknown',
]);

function normalizeCapabilitySignal(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

export function resolveCreatePlannerCapability(input: {
  kitId?: string;
  framework?: string;
  runtime?: string;
  projectExists?: boolean;
}): CreatePlannerCapability {
  const requested =
    normalizeCapabilitySignal(input.kitId) ??
    normalizeCapabilitySignal(input.framework) ??
    normalizeCapabilitySignal(input.runtime) ??
    'unknown';

  if (input.projectExists) {
    return {
      lane: 'adopt-only',
      status: 'available',
      canExecuteCreate: false,
      requested,
      reason: 'Existing projects enter Workspace Intelligence through adopt/import.',
    };
  }

  const normalizedKit = input.kitId ? normalizeKitId(input.kitId) : undefined;
  if (normalizedKit && NATIVE_CREATE_KITS.has(normalizedKit)) {
    return {
      lane: 'native-create',
      status: 'available',
      canExecuteCreate: true,
      requested,
      resolved: normalizedKit,
      reason:
        'Workspai owns the create contract, project marker, registry, doctor, and workspace model path.',
    };
  }

  const external =
    EXTERNAL_BY_ALIAS.get(requested) ??
    EXTERNAL_BY_ALIAS.get(normalizeCapabilitySignal(input.framework) ?? '') ??
    EXTERNAL_BY_ALIAS.get(normalizeCapabilitySignal(input.runtime) ?? '');
  if (external) {
    return {
      lane: 'external-create-adopt',
      status: external.status,
      canExecuteCreate: false,
      requested,
      resolved: external.id,
      officialCommands: external.officialCommands,
      fallbackLane: 'adopt-only',
      reason:
        'External generator support is planned but not enabled; use adopt/import until Workspai owns the post-create contract.',
    };
  }

  const runtime = normalizeCapabilitySignal(input.runtime);
  if (runtime && ADOPT_ONLY_RUNTIME_ALIASES.has(runtime)) {
    return {
      lane: 'adopt-only',
      status: 'available',
      canExecuteCreate: false,
      requested,
      resolved: runtime,
      reason:
        'Runtime can be governed through Workspace Intelligence, but native create is not supported.',
    };
  }

  return {
    lane: 'adopt-only',
    status: 'available',
    canExecuteCreate: false,
    requested,
    reason:
      'No native create contract is available; use adopt/import to enter Workspace Intelligence.',
  };
}

export function shouldBlockUnsupportedNativeCreate(capability: CreatePlannerCapability): boolean {
  return (
    !capability.canExecuteCreate &&
    (capability.lane === 'external-create-adopt' ||
      (capability.lane === 'adopt-only' && capability.resolved !== undefined))
  );
}
