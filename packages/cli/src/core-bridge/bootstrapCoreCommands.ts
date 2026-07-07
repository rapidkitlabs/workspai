// Keep this in sync with RapidKit Core's *public* advertised top-level commands.
// This list is used on cold start (before command discovery cache exists).
// Important: do not include internal/paid surfaces here; those should never be hinted at by the npm wrapper.

export const BOOTSTRAP_CORE_COMMANDS = [
  'version',
  'project',
  'create',
  'add',
  'list',
  'info',
  'upgrade',
  'diff',
  'doctor',
  'license',
  'commands',
  'reconcile',
  'rollback',
  'uninstall',
  'checkpoint',
  'optimize',
  'snapshot',
  'frameworks',
  'modules',
  'merge',
] as const;

export type BootstrapCoreCommand = (typeof BOOTSTRAP_CORE_COMMANDS)[number];

export const BOOTSTRAP_CORE_COMMANDS_SET: ReadonlySet<string> = new Set(BOOTSTRAP_CORE_COMMANDS);
