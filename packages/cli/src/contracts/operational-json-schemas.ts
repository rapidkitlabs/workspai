type JsonSchema = Record<string, unknown>;

function objectSchema(
  schemaVersion: string,
  required: string[],
  properties: JsonSchema
): JsonSchema {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['schemaVersion', ...required],
    properties: { schemaVersion: { const: schemaVersion }, ...properties },
    additionalProperties: true,
  };
}

export function buildOperationalJsonSchemas(): Record<string, JsonSchema> {
  return {
    'autopilot-release.v1.json': objectSchema(
      'autopilot-release-v1',
      [
        'generatedAt',
        'workspacePath',
        'mode',
        'summary',
        'stages',
        'blockingReasons',
        'nextActions',
        'artifacts',
      ],
      {
        generatedAt: { type: 'string', format: 'date-time' },
        workspacePath: { type: 'string', minLength: 1 },
        mode: { enum: ['audit', 'safe-fix', 'enforce'] },
        summary: { type: 'object' },
        stages: { type: 'array', items: { type: 'object' } },
        blockingReasons: { type: 'array', items: { type: 'string' } },
        nextActions: { type: 'array', items: { type: 'string' } },
        artifacts: { type: 'object' },
      }
    ),
    'workspace-list.v1.json': objectSchema('rapidkit-workspace-list-v1', ['status'], {
      status: { type: 'string' },
    }),
    'workspace-sync.v1.json': objectSchema('rapidkit-workspace-sync-v1', ['status'], {
      status: { type: 'string' },
    }),
    'compatibility-matrix.v1.json': objectSchema('rapidkit.compatibility-matrix.v1', [], {}),
    'workspace-intelligence/mcp-design.v1.json': objectSchema(
      'workspai-mcp-design.v1',
      ['generatedAt', 'workspaceRoot', 'status', 'mode', 'safety', 'candidateTools'],
      {
        generatedAt: { type: 'string', format: 'date-time' },
        workspaceRoot: { type: 'string', minLength: 1 },
        status: { const: 'design-only' },
        mode: { const: 'read-mostly' },
        safety: { type: 'object' },
        candidateTools: { type: 'array', items: { type: 'object' } },
      }
    ),
    'workspace-intelligence/agent-hooks.v1.json': objectSchema(
      'workspai-agent-hooks.v1',
      ['generatedAt', 'workspaceRoot', 'enabledByDefault', 'mode', 'hooks'],
      {
        generatedAt: { type: 'string', format: 'date-time' },
        workspaceRoot: { type: 'string', minLength: 1 },
        enabledByDefault: { type: 'boolean' },
        mode: { const: 'advisory' },
        hooks: { type: 'array', items: { type: 'object' } },
      }
    ),
    'project-archive.v1.json': objectSchema('rapidkit-project-archive-v1', [], {}),
    'workspace-snapshot.v1.json': objectSchema('rapidkit-workspace-snapshot-v1', [], {}),
    'infra-plan.v1.json': objectSchema('rapidkit.infra-plan.v1', [], {}),
    'private-product-manifest.v1.json': objectSchema(
      'rapidkit.private-product-manifest.v1',
      [],
      {}
    ),
    'product-factory-plan.v1.json': objectSchema('rapidkit.product-factory-plan.v1', [], {}),
    'workspace-model-cache.v1.json': objectSchema('workspace-model-cache.v1', [], {}),
    'workspace-watch-event.v1.json': objectSchema('workspace-watch-event.v1', [], {}),
    'doctor-project-scan.v2.json': objectSchema('doctor-project-scan-v2', [], {}),
    'doctor-workspace-cache.v2.json': objectSchema('doctor-workspace-cache-v2', [], {}),
  };
}
