import path from 'node:path';

import {
  parseAgentActionOutcomeInput,
  type AgentActionOutcomeRecord,
} from './contracts/agent-action-outcome-contract.js';
import {
  historyEntryFromAgentAction,
  recordWorkspaceHistory,
  WORKSPACE_HISTORY_PATH,
  type WorkspaceHistoryAgentActionEntry,
} from './workspace-history.js';

export type RecordWorkspaceFeedbackInput = {
  workspacePath: string;
  payload: unknown;
  retention?: number;
};

export type RecordWorkspaceFeedbackResult = {
  ok: boolean;
  entry?: WorkspaceHistoryAgentActionEntry;
  error?: string;
  historyPath: string;
};

export async function recordWorkspaceFeedback(
  input: RecordWorkspaceFeedbackInput
): Promise<RecordWorkspaceFeedbackResult> {
  const workspacePath = path.resolve(input.workspacePath);
  const parsed = parseAgentActionOutcomeInput(input.payload);
  if (!parsed) {
    return {
      ok: false,
      error: 'Invalid agent-action-outcome payload',
      historyPath: path.join(workspacePath, WORKSPACE_HISTORY_PATH),
    };
  }
  const entry = historyEntryFromAgentAction(parsed);
  const historyPath = path.join(workspacePath, WORKSPACE_HISTORY_PATH);
  await recordWorkspaceHistory(workspacePath, entry, { retention: input.retention });
  return { ok: true, entry, historyPath };
}

export function parseFeedbackStdinPayload(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

export async function readStdinAll(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export type { AgentActionOutcomeRecord };
