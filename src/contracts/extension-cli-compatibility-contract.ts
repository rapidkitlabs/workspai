import { createRequire } from 'node:module';

import { getPublishedContractVersions } from './published-contract-versions.js';

export const EXTENSION_CLI_COMPATIBILITY_SCHEMA_VERSION = 'rapidkit-extension-cli-compatibility.v1';

export type ExtensionCliCompatibilityContract = {
  schemaVersion: typeof EXTENSION_CLI_COMPATIBILITY_SCHEMA_VERSION;
  /** npm CLI package this extension release was verified against. */
  cli: 'rapidkit-npm';
  /** Semver floor for the linked `rapidkit` CLI (mirrors rapidkit-npm/package.json#version). */
  minimumVerifiedCliVersion: string;
  /** Schema versions bundled with this extension release (from npm contract generator). */
  publishedContractSchemas: ReturnType<typeof getPublishedContractVersions>;
};

const require = createRequire(import.meta.url);
const npmPackage = require('../../package.json') as { version: string };

export function buildExtensionCliCompatibilityContract(): ExtensionCliCompatibilityContract {
  return {
    schemaVersion: EXTENSION_CLI_COMPATIBILITY_SCHEMA_VERSION,
    cli: 'rapidkit-npm',
    minimumVerifiedCliVersion: npmPackage.version,
    publishedContractSchemas: getPublishedContractVersions(),
  };
}
