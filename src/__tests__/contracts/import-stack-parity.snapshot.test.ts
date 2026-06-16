import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  detectBackendFrameworkFromHints,
  getBackendFrameworkContract,
  normalizeBackendPlatformKey,
  type BackendImportStack,
} from '../../utils/backend-framework-contract';
import {
  IMPORT_STACK_PARITY_FRAMEWORK_KEYS,
  IMPORT_STACK_PARITY_RUNTIME_HINT_KEYS,
  IMPORT_STACK_PARITY_SCHEMA_VERSION,
} from '../../contracts/import-stack-parity-snapshot';

const PARITY_SCHEMA_VERSION = IMPORT_STACK_PARITY_SCHEMA_VERSION;

const EXPECTED_FRAMEWORK_KEYS = IMPORT_STACK_PARITY_FRAMEWORK_KEYS;

const EXPECTED_RUNTIME_HINT_KEYS = IMPORT_STACK_PARITY_RUNTIME_HINT_KEYS;

type SharedParitySnapshot = {
  schemaVersion: string;
  frameworkToStack: Record<string, BackendImportStack>;
  runtimeToStack: Record<string, BackendImportStack>;
};

function normalizePath(value: string): string {
  return path.resolve(value);
}

function resolveSharedParitySnapshotPath(): string {
  const explicitPath = process.env.RAPIDKIT_BACKEND_IMPORT_PARITY_SNAPSHOT;
  if (typeof explicitPath === 'string' && explicitPath.trim().length > 0) {
    return normalizePath(explicitPath.trim());
  }

  const candidates = [
    path.resolve(process.cwd(), '..', 'contracts', 'backend-import-stack-parity.snapshot.json'),
    path.resolve(process.cwd(), 'contracts', 'backend-import-stack-parity.snapshot.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

const SHARED_PARITY_SNAPSHOT_PATH = resolveSharedParitySnapshotPath();

function readSharedParitySnapshot(): SharedParitySnapshot {
  if (!fs.existsSync(SHARED_PARITY_SNAPSHOT_PATH)) {
    throw new Error(`Shared parity snapshot not found: ${SHARED_PARITY_SNAPSHOT_PATH}`);
  }

  return JSON.parse(fs.readFileSync(SHARED_PARITY_SNAPSHOT_PATH, 'utf-8')) as SharedParitySnapshot;
}

function sortedKeys(input: Record<string, unknown>): string[] {
  return Object.keys(input).sort();
}

describe('shared import stack parity snapshot (npm)', () => {
  it('pins shared parity snapshot schema version', () => {
    const snapshot = readSharedParitySnapshot();
    expect(snapshot.schemaVersion).toBe(PARITY_SCHEMA_VERSION);
  });

  it('pins framework and runtime key sets for two-way parity coverage', () => {
    const snapshot = readSharedParitySnapshot();

    expect(sortedKeys(snapshot.frameworkToStack)).toEqual([...EXPECTED_FRAMEWORK_KEYS].sort());
    expect(sortedKeys(snapshot.runtimeToStack)).toEqual([...EXPECTED_RUNTIME_HINT_KEYS].sort());
  });

  it('matches framework-to-stack contract snapshot', () => {
    const snapshot = readSharedParitySnapshot();

    const canonicalActual = Object.fromEntries(
      EXPECTED_FRAMEWORK_KEYS.map((rawKey) => {
        const key = normalizeBackendPlatformKey(rawKey);
        return [rawKey, getBackendFrameworkContract(key).importStack];
      })
    );

    const actual = Object.fromEntries(
      Object.keys(canonicalActual).map((rawKey) => {
        const key = normalizeBackendPlatformKey(rawKey);
        return [rawKey, getBackendFrameworkContract(key).importStack];
      })
    );

    expect(sortedKeys(actual)).toEqual(sortedKeys(snapshot.frameworkToStack));

    expect(actual).toEqual(snapshot.frameworkToStack);
  });

  it('matches runtime-hint-to-stack contract snapshot', () => {
    const snapshot = readSharedParitySnapshot();

    const canonicalActual = Object.fromEntries(
      EXPECTED_RUNTIME_HINT_KEYS.map((runtimeHint) => [
        runtimeHint,
        detectBackendFrameworkFromHints({ runtime: runtimeHint }).importStack,
      ])
    );

    const actual = Object.fromEntries(
      Object.keys(canonicalActual).map((runtimeHint) => [
        runtimeHint,
        detectBackendFrameworkFromHints({ runtime: runtimeHint }).importStack,
      ])
    );

    expect(sortedKeys(actual)).toEqual(sortedKeys(snapshot.runtimeToStack));

    expect(actual).toEqual(snapshot.runtimeToStack);
  });
});
