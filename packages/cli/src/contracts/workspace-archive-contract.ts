export const WORKSPACE_ARCHIVE_CAPABILITIES_SCHEMA_VERSION =
  'workspai-workspace-archive-capabilities-v1' as const;
export const WORKSPACE_ARCHIVE_MANIFEST_SCHEMA_VERSION =
  'workspai-workspace-archive-manifest-v1' as const;
export const WORKSPACE_ARCHIVE_OPERATION_RESULT_SCHEMA_VERSION =
  'workspai-workspace-archive-operation-result-v1' as const;

export const WORKSPACE_ARCHIVE_CAPABILITIES_CONTRACT_PATH =
  'contracts/workspace-archive-capabilities.v1.json';
export const WORKSPACE_ARCHIVE_MANIFEST_CONTRACT_PATH =
  'contracts/workspace-archive-manifest.v1.json';
export const WORKSPACE_ARCHIVE_OPERATION_RESULT_CONTRACT_PATH =
  'contracts/workspace-archive-operation-result.v1.json';

export const WORKSPACE_ARCHIVE_CLI_FLAGS = {
  archiveCompression: {
    signature: '--archive-compression <mode>',
    description: 'Archive compression: store (default) or deflate',
    appliesTo: ['export'],
  },
  maxDownloadSize: {
    signature: '--max-download-size <size>',
    description: 'Maximum remote archive download size (secure default: 5gb)',
    appliesTo: ['inspect', 'verify', 'doctor', 'hydrate'],
  },
  maxExpandedSize: {
    signature: '--max-expanded-size <size>',
    description: 'Maximum expanded archive payload size (secure default: 20gb)',
    appliesTo: ['inspect', 'verify', 'doctor', 'hydrate'],
  },
  downloadTimeoutMs: {
    signature: '--download-timeout-ms <ms>',
    description: 'Remote archive download timeout in milliseconds; 0 disables it',
    appliesTo: ['inspect', 'verify', 'doctor', 'hydrate'],
  },
  allowPrivateNetwork: {
    signature: '--allow-private-network',
    description:
      'Allow archive downloads from loopback/private networks (unsafe for untrusted input)',
    appliesTo: ['inspect', 'verify', 'doctor', 'hydrate'],
  },
} as const;

export function buildWorkspaceArchiveCapabilitiesContract() {
  return {
    schemaVersion: WORKSPACE_ARCHIVE_CAPABILITIES_SCHEMA_VERSION,
    commands: ['export', 'inspect', 'verify', 'doctor', 'hydrate'],
    container: {
      writeFormat: 'zip64',
      readFormats: ['zip', 'zip64'],
      compressionModes: ['store', 'deflate'],
      defaultCompression: 'store',
    },
    streaming: {
      export: true,
      remoteDownload: true,
      inspect: true,
      verify: true,
      hydrate: true,
      payloadBufferedInMemory: false,
    },
    sizePolicy: {
      workspacePayloadDefault: '20gb',
      remoteDownloadDefault: '5gb',
      safetyBudgets: 'secure-defaults-with-explicit-overrides',
      manifestMemoryLimitBytes: 64 * 1024 * 1024,
      remoteDownloadTimeoutDefaultMs: 5 * 60 * 1000,
    },
    integrity: {
      algorithm: 'sha256',
      manifestRequired: true,
      strictVerificationRequiresChecksums: true,
    },
    cliFlags: Object.fromEntries(
      Object.entries(WORKSPACE_ARCHIVE_CLI_FLAGS).map(([name, definition]) => [name, definition])
    ),
    contracts: {
      manifest: {
        schemaVersion: WORKSPACE_ARCHIVE_MANIFEST_SCHEMA_VERSION,
        path: WORKSPACE_ARCHIVE_MANIFEST_CONTRACT_PATH,
      },
      operationResult: {
        schemaVersion: WORKSPACE_ARCHIVE_OPERATION_RESULT_SCHEMA_VERSION,
        path: WORKSPACE_ARCHIVE_OPERATION_RESULT_CONTRACT_PATH,
      },
    },
  };
}

function manifestProperties() {
  return {
    schemaVersion: { const: WORKSPACE_ARCHIVE_MANIFEST_SCHEMA_VERSION },
    version: { const: 1 },
    kind: { const: 'workspai.workspace.archive' },
    workspaceName: { type: 'string', minLength: 1 },
    exportedAt: { type: 'string', format: 'date-time' },
    exportedBy: { enum: ['workspai', 'workspai-vscode'] },
    archiveFormat: { enum: ['zip-store', 'zip-deflate'] },
    containerFormat: { enum: ['zip', 'zip64'] },
    compression: { enum: ['store', 'deflate'] },
    streaming: { type: 'boolean' },
    security: {
      type: 'object',
      additionalProperties: false,
      required: ['envFilesIncluded', 'excludedByDefault'],
      properties: {
        envFilesIncluded: { type: 'boolean' },
        excludedByDefault: { type: 'array', items: { type: 'string' }, uniqueItems: true },
      },
    },
    files: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'size', 'sha256'],
        properties: {
          path: { type: 'string', minLength: 1 },
          size: { type: 'integer', minimum: 0 },
          sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        },
      },
    },
  };
}

function manifestSchemaDefinition() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['version', 'kind', 'workspaceName', 'exportedAt', 'security', 'files'],
    properties: manifestProperties(),
  };
}

export function buildWorkspaceArchiveManifestSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://workspai.dev/contracts/workspace-archive-manifest.v1.json',
    title: 'Workspai Workspace Archive Manifest v1',
    ...manifestSchemaDefinition(),
  };
}

export function buildWorkspaceArchiveOperationResultSchema() {
  const operationRequirements = [
    ['export', ['archivePath', 'manifest', 'bytesWritten']],
    ['inspect', ['archivePath', 'manifest', 'fileCount', 'totalBytes', 'entries']],
    [
      'verify',
      [
        'archivePath',
        'manifest',
        'fileCount',
        'totalBytes',
        'verifiedFiles',
        'missingChecksumFiles',
        'missingArchiveEntries',
        'extraArchiveEntries',
        'mismatches',
      ],
    ],
    [
      'doctor',
      ['archivePath', 'workspaceName', 'fileCount', 'totalBytes', 'checks', 'recommendedActions'],
    ],
    ['hydrate', ['archivePath', 'outputPath', 'dryRun', 'manifest', 'files']],
  ] as const;

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://workspai.dev/contracts/workspace-archive-operation-result.v1.json',
    title: 'Workspai Workspace Archive Operation Result v1',
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'operation', 'status'],
    properties: {
      schemaVersion: { const: WORKSPACE_ARCHIVE_OPERATION_RESULT_SCHEMA_VERSION },
      operation: { enum: ['export', 'inspect', 'verify', 'doctor', 'hydrate'] },
      status: { enum: ['passed', 'warning', 'failed', 'error'] },
      archivePath: { type: 'string', minLength: 1 },
      outputPath: { type: 'string', minLength: 1 },
      dryRun: { type: 'boolean' },
      archivePathOrUrl: { type: 'string', minLength: 1 },
      timestamp: { type: 'string', format: 'date-time' },
      error: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'message'],
        properties: {
          code: { type: 'string', minLength: 1 },
          message: { type: 'string', minLength: 1 },
        },
      },
      manifest: { anyOf: [{ $ref: '#/$defs/manifest' }, { type: 'null' }] },
      bytesWritten: { type: 'integer', minimum: 0 },
      workspaceName: { type: 'string', minLength: 1 },
      fileCount: { type: 'integer', minimum: 0 },
      totalBytes: { type: 'integer', minimum: 0 },
      verifiedFiles: { type: 'integer', minimum: 0 },
      missingChecksumFiles: { $ref: '#/$defs/pathList' },
      missingArchiveEntries: { $ref: '#/$defs/pathList' },
      extraArchiveEntries: { $ref: '#/$defs/pathList' },
      recommendedActions: { type: 'array', items: { type: 'string' } },
      entries: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['path', 'size', 'hasChecksum'],
          properties: {
            path: { type: 'string', minLength: 1 },
            size: { type: 'integer', minimum: 0 },
            hasChecksum: { type: 'boolean' },
          },
        },
      },
      files: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['path', 'size'],
          properties: {
            path: { type: 'string', minLength: 1 },
            size: { type: 'integer', minimum: 0 },
          },
        },
      },
      mismatches: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['path', 'expected', 'actual'],
          properties: {
            path: { type: 'string', minLength: 1 },
            expected: {
              type: 'object',
              additionalProperties: false,
              properties: {
                size: { type: 'integer', minimum: 0 },
                sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
              },
            },
            actual: {
              type: 'object',
              additionalProperties: false,
              required: ['size', 'sha256'],
              properties: {
                size: { type: 'integer', minimum: 0 },
                sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
              },
            },
          },
        },
      },
      checks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'status', 'message'],
          properties: {
            id: { type: 'string', minLength: 1 },
            status: { enum: ['passed', 'warning', 'failed'] },
            message: { type: 'string' },
          },
        },
      },
    },
    allOf: [
      ...operationRequirements.map(([operation, required]) => ({
        if: {
          properties: {
            operation: { const: operation },
            status: { enum: ['passed', 'warning', 'failed'] },
          },
          required: ['operation', 'status'],
        },
        then: {
          properties: Object.fromEntries(required.map((property) => [property, true])),
          required: [...required],
        },
      })),
      {
        if: { properties: { status: { const: 'error' } }, required: ['status'] },
        then: {
          properties: {
            archivePathOrUrl: true,
            timestamp: true,
            error: true,
          },
          required: ['timestamp', 'error'],
        },
      },
    ],
    $defs: {
      manifest: manifestSchemaDefinition(),
      pathList: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true },
    },
  };
}
