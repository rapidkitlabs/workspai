import { createRequire } from 'node:module';

import { CLI_LOG_EVENT_SCHEMA_VERSION } from './cli-log-event-contract.js';
import { FRESHNESS_METADATA_SCHEMA_VERSION } from './freshness-metadata-contract.js';
import { RUNTIME_COMMAND_SURFACE_SCHEMA_VERSION } from './runtime-command-surface-contract.js';

export const EXTENSION_CLI_COMPATIBILITY_SCHEMA_VERSION = 'rapidkit-extension-cli-compatibility.v1';

export type ExtensionCliCompatibilityContract = {
  schemaVersion: typeof EXTENSION_CLI_COMPATIBILITY_SCHEMA_VERSION;
  /** npm CLI package this extension release was verified against. */
  cli: 'rapidkit-npm';
  /** Semver floor for the linked `rapidkit` CLI (mirrors rapidkit-npm/package.json#version). */
  minimumVerifiedCliVersion: string;
  /** Schema versions bundled with this extension release (from npm contract generator). */
  publishedContractSchemas: {
    runtimeCommandSurface: string;
    cliLogEvent: string;
    freshnessMetadata: string;
  };
};

const require = createRequire(import.meta.url);
const npmPackage = require('../../package.json') as { version: string };

export function buildExtensionCliCompatibilityContract(): ExtensionCliCompatibilityContract {
  return {
    schemaVersion: EXTENSION_CLI_COMPATIBILITY_SCHEMA_VERSION,
    cli: 'rapidkit-npm',
    minimumVerifiedCliVersion: npmPackage.version,
    publishedContractSchemas: {
      runtimeCommandSurface: RUNTIME_COMMAND_SURFACE_SCHEMA_VERSION,
      cliLogEvent: CLI_LOG_EVENT_SCHEMA_VERSION,
      freshnessMetadata: FRESHNESS_METADATA_SCHEMA_VERSION,
    },
  };
}
