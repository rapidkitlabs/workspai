import type { BackendRuntimeFamily } from './backend-framework-contract.js';
import { resolveRuntimeCatalogEntry } from './runtime-executors.js';

export type RuntimeCommand =
  | 'init'
  | 'dev'
  | 'start'
  | 'build'
  | 'test'
  | 'lint'
  | 'format'
  | 'help';

export interface RuntimeAdapter {
  runtime: BackendRuntimeFamily;
  displayName: string;
  supportedCommands: RuntimeCommand[];
  packageManagers: string[];
  primaryFiles: string[];
  notes: string[];
  hasExecutor: boolean;
}

export function getRuntimeAdapter(runtime: string): RuntimeAdapter | null {
  const catalog = resolveRuntimeCatalogEntry(runtime);
  if (catalog.runtime === 'unknown' && runtime !== 'unknown') {
    return null;
  }

  return {
    runtime: catalog.runtime as BackendRuntimeFamily,
    displayName: catalog.displayName,
    supportedCommands: catalog.lifecycleCommands,
    packageManagers: catalog.packageManagers,
    primaryFiles: catalog.primaryFiles,
    notes: catalog.notes,
    hasExecutor: catalog.hasExecutor,
  };
}

export function hasRuntimeAdapter(runtime: string): boolean {
  return getRuntimeAdapter(runtime) !== null;
}

export function listRuntimeAdapters(): RuntimeAdapter[] {
  const runtimes = [
    'python',
    'node',
    'go',
    'java',
    'dotnet',
    'php',
    'ruby',
    'rust',
    'elixir',
    'clojure',
    'scala',
    'kotlin',
    'deno',
    'bun',
    'unknown',
  ];
  return runtimes
    .map((runtime) => getRuntimeAdapter(runtime))
    .filter((entry): entry is RuntimeAdapter => entry !== null)
    .sort((a, b) => a.runtime.localeCompare(b.runtime));
}
