import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  WORKSPACE_ARCHIVE_CAPABILITIES_CONTRACT_PATH,
  WORKSPACE_ARCHIVE_CLI_FLAGS,
  WORKSPACE_ARCHIVE_MANIFEST_SCHEMA_VERSION,
  WORKSPACE_ARCHIVE_OPERATION_RESULT_SCHEMA_VERSION,
  buildWorkspaceArchiveCapabilitiesContract,
} from '../../contracts/workspace-archive-contract';
import { getPublishedContractVersions } from '../../contracts/published-contract-versions';

describe('workspace archive contract', () => {
  it('uses the same flag definitions in the runtime parser and published capability contract', () => {
    const indexSource = fs.readFileSync(path.resolve(process.cwd(), 'src/index.ts'), 'utf8');
    const capability = buildWorkspaceArchiveCapabilitiesContract();

    for (const [name, definition] of Object.entries(WORKSPACE_ARCHIVE_CLI_FLAGS)) {
      expect(indexSource).toContain(`WORKSPACE_ARCHIVE_CLI_FLAGS.${name}.signature`);
      expect(indexSource).toContain(`WORKSPACE_ARCHIVE_CLI_FLAGS.${name}.description`);
      expect(capability.cliFlags[name as keyof typeof capability.cliFlags]).toEqual(definition);
    }
    expect(
      new Set(Object.values(WORKSPACE_ARCHIVE_CLI_FLAGS).map((flag) => flag.signature)).size
    ).toBe(Object.keys(WORKSPACE_ARCHIVE_CLI_FLAGS).length);
  });

  it('publishes all archive schemas for IDE, CI, and AI discovery', () => {
    const versions = getPublishedContractVersions();
    const capability = buildWorkspaceArchiveCapabilitiesContract();

    expect(versions.workspaceArchiveCapabilities).toBe(capability.schemaVersion);
    expect(versions.workspaceArchiveManifest).toBe(WORKSPACE_ARCHIVE_MANIFEST_SCHEMA_VERSION);
    expect(versions.workspaceArchiveOperationResult).toBe(
      WORKSPACE_ARCHIVE_OPERATION_RESULT_SCHEMA_VERSION
    );
    expect(capability.contracts.manifest.path).toBe('contracts/workspace-archive-manifest.v1.json');
    expect(WORKSPACE_ARCHIVE_CAPABILITIES_CONTRACT_PATH).toBe(
      'contracts/workspace-archive-capabilities.v1.json'
    );
  });
});
