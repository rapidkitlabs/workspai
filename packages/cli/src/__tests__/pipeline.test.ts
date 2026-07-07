import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { runPipeline } from '../pipeline';

const tempDirs: string[] = [];

async function makeWorkspace(): Promise<string> {
  const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-pipeline-'));
  tempDirs.push(workspacePath);
  await fs.ensureDir(path.join(workspacePath, '.rapidkit', 'reports'));
  await fs.writeJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
    workspace_name: 'pipeline-workspace',
    profile: 'minimal',
  });
  await fs.writeFile(path.join(workspacePath, '.rapidkit-workspace'), '{}');
  return workspacePath;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const target = tempDirs.pop();
    if (target) await fs.remove(target);
  }
});

describe('pipeline governance chain', () => {
  it('resolves workspace root from nested cwd and writes stage names', async () => {
    const workspacePath = await makeWorkspace();
    const nestedPath = path.join(workspacePath, 'apps', 'api');
    await fs.ensureDir(nestedPath);

    const report = await runPipeline({
      workspacePath: nestedPath,
      skipAnalyze: true,
      skipAutopilot: true,
      writeReport: false,
    });

    expect(report.workspacePath).toBe(workspacePath);
    expect(report.stages.map((stage) => stage.name)).toEqual([
      'sync',
      'doctor',
      'analyze',
      'readiness',
      'autopilot',
    ]);
    expect(report.stages.find((stage) => stage.name === 'analyze')?.status).toBe('skipped');
    expect(report.stages.find((stage) => stage.name === 'autopilot')?.status).toBe('skipped');
  });

  it('syncs agent grounding artifacts when pipeline report is written', async () => {
    const workspacePath = await makeWorkspace();
    const report = await runPipeline({
      workspacePath,
      skipAnalyze: true,
      skipAutopilot: true,
      writeReport: true,
    });

    expect(report.agentGrounding?.writtenFiles.length).toBeGreaterThan(0);
    expect(await fs.pathExists(path.join(workspacePath, '.workspai/reports/INDEX.json'))).toBe(
      true
    );
    expect(await fs.pathExists(path.join(workspacePath, 'AGENTS.md'))).toBe(true);
  });

  it('skips agent grounding when noAgentSync is set', async () => {
    const workspacePath = await makeWorkspace();
    const report = await runPipeline({
      workspacePath,
      skipAnalyze: true,
      skipAutopilot: true,
      writeReport: true,
      noAgentSync: true,
    });

    expect(report.agentGrounding).toBeUndefined();
    expect(await fs.pathExists(path.join(workspacePath, 'AGENTS.md'))).toBe(false);
  });
});
