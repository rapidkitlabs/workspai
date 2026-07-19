import { computeInputsHash } from './freshness-metadata-contract.js';

export const BLOCKER_RESOLUTION_SCHEMA_VERSION = 'rapidkit-blocker-resolution-v1' as const;

export const BLOCKER_RESOLUTION_CLASSES = [
  'artifact-missing',
  'command-failed-repeat',
  'config-fixable',
  'semantic-attention',
  'unresolvable-without-human',
] as const;

export type BlockerResolutionClass = (typeof BLOCKER_RESOLUTION_CLASSES)[number];

export const BLOCKER_FIX_HINT_ACTION_KINDS = [
  'edit-file',
  'run-once',
  'commit-files',
  'refresh-baseline',
] as const;

export type BlockerFixHintActionKind = (typeof BLOCKER_FIX_HINT_ACTION_KINDS)[number];

export type BlockerFixHint = {
  actionKind: BlockerFixHintActionKind;
  targetPath?: string;
  detail: string;
  studioActionId?: 'fix-lens' | 'verify-gates' | 'run-analyze' | 'doctor-fix';
};

export type BlockerResolution = {
  schemaVersion: typeof BLOCKER_RESOLUTION_SCHEMA_VERSION;
  blockerId: string;
  sourceCommand?: string;
  sourceArtifact?: string;
  resolutionClass: BlockerResolutionClass;
  blockerSignature: string;
  commandRetryHint?: string;
  fixHints: BlockerFixHint[];
  verifyCommand?: string;
  verifyArtifact?: string;
};

export function computeBlockerSignature(input: {
  blockers: string[];
  exitCode?: number | null;
  stderrTail?: string | null;
}): string {
  const normalizedBlockers = input.blockers
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 12);
  const stderr = input.stderrTail?.trim().slice(-400) ?? '';
  return computeInputsHash({
    blockers: normalizedBlockers,
    exitCode: input.exitCode ?? null,
    stderrTail: stderr,
  });
}

export function normalizeBlockerResolutionClass(value: unknown): BlockerResolutionClass | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim() as BlockerResolutionClass;
  return BLOCKER_RESOLUTION_CLASSES.includes(normalized) ? normalized : null;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isBlockerFixHint(value: unknown): value is BlockerFixHint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.detail === 'string' &&
    BLOCKER_FIX_HINT_ACTION_KINDS.includes(record.actionKind as BlockerFixHintActionKind) &&
    isOptionalString(record.targetPath) &&
    (record.studioActionId === undefined ||
      ['fix-lens', 'verify-gates', 'run-analyze', 'doctor-fix'].includes(
        record.studioActionId as string
      ))
  );
}

export function isBlockerResolution(value: unknown): value is BlockerResolution {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === BLOCKER_RESOLUTION_SCHEMA_VERSION &&
    typeof record.blockerId === 'string' &&
    typeof record.blockerSignature === 'string' &&
    normalizeBlockerResolutionClass(record.resolutionClass) != null &&
    Array.isArray(record.fixHints) &&
    record.fixHints.every(isBlockerFixHint) &&
    isOptionalString(record.sourceCommand) &&
    isOptionalString(record.sourceArtifact) &&
    isOptionalString(record.commandRetryHint) &&
    isOptionalString(record.verifyCommand) &&
    isOptionalString(record.verifyArtifact)
  );
}
