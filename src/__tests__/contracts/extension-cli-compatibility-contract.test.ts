import { describe, expect, it } from 'vitest';

import {
  buildExtensionCliCompatibilityContract,
  EXTENSION_CLI_COMPATIBILITY_SCHEMA_VERSION,
} from '../../contracts/extension-cli-compatibility-contract.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const npmPackage = require('../../../package.json') as { version: string };

describe('extension-cli-compatibility contract', () => {
  it('publishes the npm package version as the extension verification floor', () => {
    const contract = buildExtensionCliCompatibilityContract();

    expect(contract.schemaVersion).toBe(EXTENSION_CLI_COMPATIBILITY_SCHEMA_VERSION);
    expect(contract.cli).toBe('rapidkit-npm');
    expect(contract.minimumVerifiedCliVersion).toBe(npmPackage.version);
    expect(contract.publishedContractSchemas.runtimeCommandSurface).toContain(
      'runtime-command-surface'
    );
  });
});
