import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import fsExtra from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseWorkspaceExplainTarget } from '../contracts/workspace-explain-contract.js';
import { WORKSPACE_MCP_READ_TOOLS } from '../workspace-mcp-serve.js';
import { WORKSPACE_CONTRACT_VERIFY_REPORT_PATH } from '../utils/workspace-contract.js';
import { WORKSPACE_EXPLAIN_REPORT_PATH } from '../contracts/workspace-explain-contract.js';
import { WORKSPACE_VERIFY_REPORT_PATH } from '../workspace-verify.js';

let workspacePath: string;

beforeEach(async () => {
  workspacePath = await mkdtemp(path.join(tmpdir(), 'rk-mcp-'));
});

afterEach(async () => {
  await rm(workspacePath, { recursive: true, force: true });
});

describe('workspace mcp serve (4.19)', () => {
  it('advertises read-mostly Phase 4 tools including getProjectContext', () => {
    const names = WORKSPACE_MCP_READ_TOOLS.map((tool) => tool.name);
    expect(names).toContain('listOperationalSkills');
    expect(names).toContain('getWorkspaceExplain');
    expect(names).toContain('getProjectContext');
    expect(names).not.toContain('refreshWorkspaceIntelligence');
  });

  it('parses blocker and trace explain targets for MCP consumers', () => {
    expect(parseWorkspaceExplainTarget('blocker:doctor.workspace')).toEqual({
      kind: 'blocker',
      blockerId: 'doctor.workspace',
    });
    expect(
      parseWorkspaceExplainTarget('trace:.workspai/reports/workspace-model-diff-last-run.json')
    ).toEqual({
      kind: 'trace',
      diffRef: '.workspai/reports/workspace-model-diff-last-run.json',
    });
  });
});

describe('workspace mcp blockers aggregation', () => {
  it('merges verify, explain, and contract-verify blockers without duplicates', async () => {
    await fsExtra.ensureDir(path.join(workspacePath, '.workspai', 'reports'));
    await fsExtra.writeJson(path.join(workspacePath, WORKSPACE_VERIFY_REPORT_PATH), {
      blockingReasons: ['verify blocker', 'shared blocker'],
    });
    await fsExtra.writeJson(path.join(workspacePath, WORKSPACE_EXPLAIN_REPORT_PATH), {
      schemaVersion: 'workspace-explain.v1',
      generatedAt: new Date().toISOString(),
      target: { kind: 'release-blocked' },
      summary: 'blocked',
      sections: [],
      blockingReasons: ['explain blocker', 'shared blocker'],
    });
    await fsExtra.writeJson(path.join(workspacePath, WORKSPACE_CONTRACT_VERIFY_REPORT_PATH), {
      schemaVersion: 'workspace-contract-verify.v1',
      generatedAt: new Date().toISOString(),
      status: 'failed',
      contractPath: '.rapidkit/workspace.contract.json',
      projectCount: 1,
      checks: [],
      violations: ['contract violation'],
    });

    const { invokeMcpToolForTest } = await import('../workspace-mcp-serve.js');
    const result = (await invokeMcpToolForTest(workspacePath, 'getBlockers', {})) as {
      blockingReasons: string[];
      sources: Array<{ artifact: string }>;
    };

    expect(result.blockingReasons).toEqual(
      expect.arrayContaining([
        'verify blocker',
        'explain blocker',
        'shared blocker',
        'contract violation',
      ])
    );
    expect(result.blockingReasons).toHaveLength(4);
    expect(result.sources.map((entry) => entry.artifact)).toEqual(
      expect.arrayContaining([
        WORKSPACE_VERIFY_REPORT_PATH,
        WORKSPACE_EXPLAIN_REPORT_PATH,
        WORKSPACE_CONTRACT_VERIFY_REPORT_PATH,
      ])
    );
  });
});
