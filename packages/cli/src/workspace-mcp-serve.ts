import path from 'node:path';
import readline from 'node:readline';

import fsExtra from 'fs-extra';

import {
  WORKSPACE_EXPLAIN_REPORT_PATH,
  WORKSPACE_SKILLS_INDEX_PATH,
} from './contracts/workspace-artifact-paths.js';
import {
  isWorkspaceExplainReport,
  parseWorkspaceExplainTarget,
  type WorkspaceExplainTarget,
} from './contracts/workspace-explain-contract.js';
import { buildWorkspaceExplain } from './workspace-explain.js';
import { WORKSPACE_CONTEXT_AGENT_REPORT_PATH } from './workspace-context.js';
import { WORKSPACE_MODEL_REPORT_PATH } from './workspace-model.js';
import { WORKSPACE_VERIFY_REPORT_PATH } from './workspace-verify.js';
import { WORKSPACE_CONTRACT_VERIFY_REPORT_PATH } from './utils/workspace-contract.js';
import { firstExistingWorkspaceArtifactPath } from './utils/artifact-path-compat.js';

const AGENT_REPORTS_INDEX_PATH = '.workspai/reports/INDEX.json';

function explainTargetsMatch(
  cached: WorkspaceExplainTarget,
  requested: WorkspaceExplainTarget
): boolean {
  if (cached.kind !== requested.kind) {
    return false;
  }
  if (cached.kind === 'project' && requested.kind === 'project') {
    return cached.project.toLowerCase() === requested.project.toLowerCase();
  }
  if (cached.kind === 'blocker' && requested.kind === 'blocker') {
    return cached.blockerId === requested.blockerId;
  }
  if (cached.kind === 'trace' && requested.kind === 'trace') {
    return cached.diffRef === requested.diffRef;
  }
  return true;
}

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
};

type McpTool = {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
};

const READ_TOOLS: McpTool[] = [
  {
    name: 'getWorkspaceModel',
    description: 'Read workspace-model.json',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'getEvidenceIndex',
    description: 'Read agent reports INDEX.json',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'getBlockers',
    description: 'Aggregate blocking reasons from verify, explain, and contract-verify reports',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'getSafeCommands',
    description: 'Read safe commands from workspace-context-agent.json',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'getProjectContext',
    description: 'Read scoped project context from workspace-context-agent.json',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project name; defaults to active scope' },
      },
    },
  },
  {
    name: 'getArtifact',
    description: 'Read one workspace-relative artifact path',
    inputSchema: {
      type: 'object',
      properties: { relativePath: { type: 'string' } },
      required: ['relativePath'],
    },
  },
  {
    name: 'listOperationalSkills',
    description: 'Read workspace-skills-index.json',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'getWorkspaceExplain',
    description: 'Build or read workspace explain report',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description:
            'release-blocked | project:<name> | blocker:<id> | trace:<diffRef> | <project>',
        },
      },
    },
  },
];

function isSafeRelativePath(relativePath: string): boolean {
  const normalized = relativePath.trim().replace(/\\/g, '/');
  return (
    normalized.length > 0 &&
    !path.isAbsolute(normalized) &&
    !normalized.split('/').includes('..') &&
    (normalized.startsWith('.workspai/') || normalized.startsWith('.rapidkit/'))
  );
}

async function readJsonArtifact(
  workspacePath: string,
  relativePath: string
): Promise<unknown | null> {
  if (!isSafeRelativePath(relativePath)) {
    throw new Error(`Unsafe artifact path: ${relativePath}`);
  }
  const absolutePath =
    (await firstExistingWorkspaceArtifactPath(workspacePath, relativePath)) ??
    path.join(workspacePath, relativePath);
  if (!(await fsExtra.pathExists(absolutePath))) {
    return null;
  }
  return fsExtra.readJson(absolutePath);
}

async function collectBlockers(workspacePath: string): Promise<{
  blockingReasons: string[];
  sources: Array<{ artifact: string; reasons: string[] }>;
}> {
  const sources: Array<{ artifact: string; reasons: string[] }> = [];
  const merged = new Set<string>();

  const verify = (await readJsonArtifact(workspacePath, WORKSPACE_VERIFY_REPORT_PATH)) as {
    blockingReasons?: string[];
  } | null;
  const verifyReasons = (verify?.blockingReasons ?? []).filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
  );
  if (verifyReasons.length > 0) {
    sources.push({ artifact: WORKSPACE_VERIFY_REPORT_PATH, reasons: verifyReasons });
    for (const reason of verifyReasons) {
      merged.add(reason);
    }
  }

  const explain = await readJsonArtifact(workspacePath, WORKSPACE_EXPLAIN_REPORT_PATH);
  if (isWorkspaceExplainReport(explain)) {
    const explainReasons = (explain.blockingReasons ?? []).filter(
      (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
    );
    if (explainReasons.length > 0) {
      sources.push({ artifact: WORKSPACE_EXPLAIN_REPORT_PATH, reasons: explainReasons });
      for (const reason of explainReasons) {
        merged.add(reason);
      }
    }
  }

  const contractVerify = (await readJsonArtifact(
    workspacePath,
    WORKSPACE_CONTRACT_VERIFY_REPORT_PATH
  )) as { status?: string; violations?: string[] } | null;
  const contractViolations = (contractVerify?.violations ?? []).filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
  );
  if (
    contractViolations.length > 0 ||
    String(contractVerify?.status ?? '').toLowerCase() === 'failed'
  ) {
    const reasons =
      contractViolations.length > 0
        ? contractViolations
        : ['Workspace contract verification failed'];
    sources.push({ artifact: WORKSPACE_CONTRACT_VERIFY_REPORT_PATH, reasons });
    for (const reason of reasons) {
      merged.add(reason);
    }
  }

  return { blockingReasons: [...merged], sources };
}

async function invokeTool(
  workspacePath: string,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'getWorkspaceModel':
      return readJsonArtifact(workspacePath, WORKSPACE_MODEL_REPORT_PATH);
    case 'getEvidenceIndex':
      return readJsonArtifact(workspacePath, AGENT_REPORTS_INDEX_PATH);
    case 'getBlockers':
      return collectBlockers(workspacePath);
    case 'getSafeCommands': {
      const context = (await readJsonArtifact(
        workspacePath,
        WORKSPACE_CONTEXT_AGENT_REPORT_PATH
      )) as { safeCommands?: unknown[] } | null;
      return { safeCommands: context?.safeCommands ?? [] };
    }
    case 'getProjectContext': {
      const context = (await readJsonArtifact(
        workspacePath,
        WORKSPACE_CONTEXT_AGENT_REPORT_PATH
      )) as {
        scope?: { activeProject?: string | null; requested?: string };
        projects?: Array<Record<string, unknown>>;
        workspace?: Record<string, unknown>;
        safeCommands?: unknown[];
        validation?: Record<string, unknown>;
      } | null;
      if (!context) {
        return null;
      }
      const projectFilter = String(args.project ?? '').trim();
      const activeProject = context.scope?.activeProject ?? undefined;
      const targetName = projectFilter || activeProject;
      const projects = Array.isArray(context.projects) ? context.projects : [];
      const project =
        targetName &&
        projects.find(
          (entry) =>
            typeof entry.name === 'string' && entry.name.toLowerCase() === targetName.toLowerCase()
        );
      return {
        workspace: context.workspace ?? null,
        scope: context.scope ?? null,
        validation: context.validation ?? null,
        project: project ?? null,
        safeCommands: context.safeCommands ?? [],
      };
    }
    case 'getArtifact': {
      const relativePath = String(args.relativePath ?? '').trim();
      return readJsonArtifact(workspacePath, relativePath);
    }
    case 'listOperationalSkills':
      return readJsonArtifact(workspacePath, WORKSPACE_SKILLS_INDEX_PATH);
    case 'getWorkspaceExplain': {
      const targetRaw = String(args.target ?? 'release-blocked').trim();
      const target = parseWorkspaceExplainTarget(targetRaw);
      if (!target) {
        throw new Error(`Invalid explain target: ${targetRaw}`);
      }
      const lastRun = await readJsonArtifact(workspacePath, WORKSPACE_EXPLAIN_REPORT_PATH);
      if (isWorkspaceExplainReport(lastRun) && explainTargetsMatch(lastRun.target, target)) {
        return lastRun;
      }
      return buildWorkspaceExplain({ workspacePath, target });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function writeResponse(id: number | string | null | undefined, result: unknown): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: id ?? null, result })}\n`);
}

function writeError(id: number | string | null | undefined, message: string): void {
  process.stdout.write(
    `${JSON.stringify({
      jsonrpc: '2.0',
      id: id ?? null,
      error: { code: -32000, message },
    })}\n`
  );
}

export async function runWorkspaceMcpServe(input: { workspacePath: string }): Promise<void> {
  const workspacePath = path.resolve(input.workspacePath);
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      writeError(null, 'Invalid JSON-RPC request');
      continue;
    }
    const { id, method, params } = request;
    try {
      if (method === 'initialize') {
        writeResponse(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'workspai-workspace-mcp', version: '0.1.0' },
        });
        continue;
      }
      if (method === 'notifications/initialized') {
        continue;
      }
      if (method === 'tools/list') {
        writeResponse(id, {
          tools: READ_TOOLS.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        });
        continue;
      }
      if (method === 'tools/call') {
        const toolName = String(params?.name ?? '');
        const toolArgs =
          params?.arguments && typeof params.arguments === 'object'
            ? (params.arguments as Record<string, unknown>)
            : {};
        const content = await invokeTool(workspacePath, toolName, toolArgs);
        writeResponse(id, {
          content: [{ type: 'text', text: JSON.stringify(content, null, 2) }],
          isError: content == null,
        });
        continue;
      }
      writeError(id, `Unsupported method: ${method ?? 'unknown'}`);
    } catch (error) {
      writeError(id, error instanceof Error ? error.message : String(error));
    }
  }
}

export { READ_TOOLS as WORKSPACE_MCP_READ_TOOLS };

/** @internal Test helper — invokes one MCP read tool without JSON-RPC framing. */
export async function invokeMcpToolForTest(
  workspacePath: string,
  name: string,
  args: Record<string, unknown> = {}
): Promise<unknown> {
  return invokeTool(path.resolve(workspacePath), name, args);
}
