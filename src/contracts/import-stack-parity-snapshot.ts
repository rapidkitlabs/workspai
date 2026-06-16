import {
  detectBackendFrameworkFromHints,
  getBackendFrameworkContract,
  normalizeBackendPlatformKey,
  type BackendImportStack,
} from '../utils/backend-framework-contract.js';

export const IMPORT_STACK_PARITY_SCHEMA_VERSION = 'backend-import-stack-parity-v1';

export const IMPORT_STACK_PARITY_FRAMEWORK_KEYS = [
  'fastapi',
  'django',
  'flask',
  'python',
  'nestjs',
  'express',
  'fastify',
  'koa',
  'node',
  'gofiber',
  'gogin',
  'echo',
  'go',
  'springboot',
  'java',
  'rails',
  'ruby',
  'dotnet',
  'unknown',
] as const;

export const IMPORT_STACK_PARITY_RUNTIME_HINT_KEYS = [
  'python',
  'node',
  'nodejs',
  'typescript',
  'go',
  'golang',
  'java',
  'ruby',
  'dotnet',
  'csharp',
  'unknown',
] as const;

export type ImportStackParitySnapshot = {
  schemaVersion: string;
  frameworkToStack: Record<string, BackendImportStack>;
  runtimeToStack: Record<string, BackendImportStack>;
};

export function buildImportStackParitySnapshot(): ImportStackParitySnapshot {
  const frameworkToStack = Object.fromEntries(
    IMPORT_STACK_PARITY_FRAMEWORK_KEYS.map((rawKey) => {
      const key = normalizeBackendPlatformKey(rawKey);
      return [rawKey, getBackendFrameworkContract(key).importStack];
    })
  ) as Record<string, BackendImportStack>;

  const runtimeToStack = Object.fromEntries(
    IMPORT_STACK_PARITY_RUNTIME_HINT_KEYS.map((runtimeHint) => [
      runtimeHint,
      detectBackendFrameworkFromHints({ runtime: runtimeHint }).importStack,
    ])
  ) as Record<string, BackendImportStack>;

  return {
    schemaVersion: IMPORT_STACK_PARITY_SCHEMA_VERSION,
    frameworkToStack,
    runtimeToStack,
  };
}
