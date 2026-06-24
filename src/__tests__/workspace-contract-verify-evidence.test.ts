import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fsExtra from 'fs-extra';

import {
  verifyWorkspaceContract,
  writeWorkspaceContractVerifyEvidence,
  WORKSPACE_CONTRACT_VERIFY_REPORT_PATH,
} from '../utils/workspace-contract.js';

let workspacePath: string;

beforeEach(async () => {
  workspacePath = await mkdtemp(path.join(tmpdir(), 'rk-contract-verify-'));
});

afterEach(async () => {
  await rm(workspacePath, { recursive: true, force: true });
});

describe('workspace contract verify evidence', () => {
  it('writes workspace-contract-verify-last-run.json with generatedAt and status', async () => {
    const contractPath = path.join(workspacePath, '.rapidkit', 'workspace.contract.json');
    await fsExtra.ensureDir(path.dirname(contractPath));
    await fsExtra.writeJson(contractPath, {
      kind: 'rapidkit.workspace.contract',
      schemaVersion: 1,
      workspace: { name: 'test' },
      projects: [{ slug: 'api', relativePath: 'api', contracts: {} }],
    });

    const result = await verifyWorkspaceContract({ workspacePath, strict: false });
    const outputPath = await writeWorkspaceContractVerifyEvidence({ workspacePath, result });
    expect(outputPath).toBe(path.join(workspacePath, WORKSPACE_CONTRACT_VERIFY_REPORT_PATH));

    const raw = JSON.parse(await readFile(outputPath, 'utf8')) as Record<string, unknown>;
    expect(raw.status).toBe(result.status);
    expect(typeof raw.generatedAt).toBe('string');
    expect(Array.isArray(raw.violations)).toBe(true);
    expect(Array.isArray(raw.checks)).toBe(true);
  });
});
