import os from 'os';
import path from 'path';
import fsExtra from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AGENT_REPORTS_INDEX_PATH,
  buildWorkspaceAgentReportsIndex,
  syncWorkspaceAgentGrounding,
} from '../workspace-agent-sync.js';
import {
  extractManagedAgentSection,
  RAPIDKIT_AGENT_GROUNDING_END,
  RAPIDKIT_AGENT_GROUNDING_START,
  upsertManagedAgentSection,
} from '../utils/managed-agent-markers.js';
import { WORKSPACE_CONTEXT_AGENT_REPORT_PATH } from '../workspace-context.js';

describe('managed agent markers', () => {
  it('upserts managed sections without losing surrounding content', () => {
    const original = [
      '# Team notes',
      '',
      'Keep this custom section.',
      '',
      RAPIDKIT_AGENT_GROUNDING_START,
      'old managed body',
      RAPIDKIT_AGENT_GROUNDING_END,
      '',
    ].join('\n');

    const updated = upsertManagedAgentSection(original, 'new managed body');
    expect(updated).toContain('Keep this custom section.');
    expect(extractManagedAgentSection(updated)).toBe('new managed body');
  });
});

describe('workspace agent sync', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await fsExtra.remove(dir);
      }
    }
  });

  async function makeWorkspace(): Promise<string> {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-agent-sync-'));
    tempDirs.push(workspacePath);
    await fsExtra.outputJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'sync-lab',
    });
    await fsExtra.outputJson(
      path.join(workspacePath, '.rapidkit', 'reports', 'workspace-context-agent.json'),
      {
        schemaVersion: 'workspace-context.v1',
        generatedAt: new Date().toISOString(),
        blockers: ['pipeline stage failed'],
      }
    );
    await fsExtra.outputJson(
      path.join(workspacePath, '.rapidkit', 'reports', 'pipeline-last-run.json'),
      {
        generatedAt: new Date().toISOString(),
        blockers: ['pipeline stage failed'],
        commandId: 'workspacePipeline',
        exitCode: 2,
      }
    );
    return workspacePath;
  }

  it('builds an index with read order and merged blockers', async () => {
    const workspacePath = await makeWorkspace();
    const index = await buildWorkspaceAgentReportsIndex({ workspacePath });

    expect(index.schemaVersion).toBe('rapidkit-agent-reports-index.v1');
    expect(index.readOrder[0]).toBe(WORKSPACE_CONTEXT_AGENT_REPORT_PATH);
    expect(index.blockers).toContain('pipeline stage failed');
    expect(
      index.reports.find((report) => report.path === WORKSPACE_CONTEXT_AGENT_REPORT_PATH)?.exists
    ).toBe(true);
  });

  it('writes cross-tool grounding files', async () => {
    const workspacePath = await makeWorkspace();
    const result = await syncWorkspaceAgentGrounding({
      workspacePath,
      write: true,
      refreshContext: true,
    });

    expect(result.writtenFiles).toEqual(
      expect.arrayContaining([
        AGENT_REPORTS_INDEX_PATH,
        'AGENTS.md',
        '.github/copilot-instructions.md',
        '.cursor/rules/rapidkit-grounding.mdc',
        'CLAUDE.md',
        '.github/skills/rapidkit-grounding/SKILL.md',
      ])
    );

    const agents = await fsExtra.readFile(path.join(workspacePath, 'AGENTS.md'), 'utf8');
    expect(agents).toContain(RAPIDKIT_AGENT_GROUNDING_START);
    expect(agents).toContain('Read order (mandatory before workspace diagnosis)');

    const claude = await fsExtra.readFile(path.join(workspacePath, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('@AGENTS.md');

    const cursorRule = await fsExtra.readFile(
      path.join(workspacePath, '.cursor/rules/rapidkit-grounding.mdc'),
      'utf8'
    );
    expect(cursorRule).toContain('alwaysApply: true');
  });

  it('fails strict mode when required context is missing', async () => {
    const workspacePath = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-agent-sync-strict-'));
    tempDirs.push(workspacePath);
    await fsExtra.outputJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      workspace_name: 'empty',
    });

    const result = await syncWorkspaceAgentGrounding({
      workspacePath,
      write: false,
      strict: true,
    });

    expect(result.strictViolations.join('\n')).toContain('Missing required reports');
  });
});
