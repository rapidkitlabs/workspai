export const COMMAND_CAPABILITIES_SCHEMA_VERSION = 'rapidkit-command-capabilities-v1' as const;
export const VERSION_CONTRACT_SCHEMA_VERSION = 'rapidkit-version-v1' as const;

const stringArray = { type: 'array', items: { type: 'string' } } as const;

export function buildCommandCapabilitiesSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://workspai.dev/schemas/command-capabilities.v1.json',
    title: 'Workspai Command Capabilities',
    type: 'object',
    additionalProperties: false,
    required: [
      'schemaVersion',
      'scope',
      'cli',
      'version',
      'cwd',
      'contracts',
      'contractCatalog',
      'commands',
      'workspace',
      'commandMap',
    ],
    properties: {
      schemaVersion: { const: COMMAND_CAPABILITIES_SCHEMA_VERSION },
      scope: { const: 'global' },
      cli: { const: 'workspai' },
      version: { type: 'string', minLength: 1 },
      cwd: { type: 'string', minLength: 1 },
      contracts: { type: 'object', additionalProperties: true },
      contractCatalog: { type: 'object', additionalProperties: true },
      commands: {
        type: 'object',
        additionalProperties: false,
        required: ['npmOwned', 'coreBacked', 'projectScoped'],
        properties: { npmOwned: stringArray, coreBacked: stringArray, projectScoped: stringArray },
      },
      workspace: {
        type: 'object',
        additionalProperties: false,
        required: ['command', 'subcommands', 'intelligenceSubcommands'],
        properties: {
          command: { const: 'workspace' },
          subcommands: stringArray,
          intelligenceSubcommands: stringArray,
        },
      },
      commandMap: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          additionalProperties: false,
          required: ['command', 'owner', 'status', 'scope'],
          properties: {
            command: { type: 'string', minLength: 1 },
            owner: { enum: ['npm-wrapper', 'python-core', 'runtime-adapter'] },
            status: { enum: ['supported', 'delegated', 'runtime-dependent'] },
            scope: { type: 'string', minLength: 1 },
          },
        },
      },
    },
  } as const;
}

export function buildVersionContractSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://workspai.dev/schemas/version.v1.json',
    title: 'Workspai Version Contract',
    type: 'object',
    additionalProperties: false,
    required: [
      'schemaVersion',
      'cli',
      'version',
      'node',
      'platform',
      'capabilitiesSchemaVersion',
      'contracts',
      'contractCatalog',
    ],
    properties: {
      schemaVersion: { const: VERSION_CONTRACT_SCHEMA_VERSION },
      cli: { const: 'workspai' },
      version: { type: 'string', minLength: 1 },
      node: { type: 'string', minLength: 1 },
      platform: { type: 'string', minLength: 1 },
      capabilitiesSchemaVersion: { const: COMMAND_CAPABILITIES_SCHEMA_VERSION },
      contracts: { type: 'object', additionalProperties: true },
      contractCatalog: { type: 'object', additionalProperties: true },
    },
  } as const;
}
