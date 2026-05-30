import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execa } from 'execa';

import { runAnalyze } from '../analyze.js';

const createTempDir = async (): Promise<string> => {
  const dir = path.join(
    os.tmpdir(),
    `rapidkit-analyze-test-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

describe('analyze command', () => {
  it('generates a workspace analysis report with project health and CI detection', async () => {
    const workspaceDir = await createTempDir();
    const projectDir = path.join(workspaceDir, 'service-a');

    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(projectDir, '.github', 'workflows'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });

    await fs.mkdir(path.join(workspaceDir, '.rapidkit'), { recursive: true });
    await fs.writeFile(
      path.join(workspaceDir, '.rapidkit', 'workspace.json'),
      JSON.stringify({ profile: 'polyglot' }, null, 2)
    );

    await fs.mkdir(path.join(projectDir, '.rapidkit'), { recursive: true });
    await fs.writeFile(
      path.join(projectDir, '.rapidkit', 'project.json'),
      JSON.stringify({ name: 'service-a', runtime: 'node' }, null, 2)
    );

    await fs.writeFile(
      path.join(projectDir, 'package.json'),
      JSON.stringify(
        {
          name: 'service-a',
          scripts: { test: 'echo test' },
          dependencies: { lodash: '^4.17.0' },
        },
        null,
        2
      )
    );
    await fs.writeFile(path.join(projectDir, 'src', 'health.ts'), 'export const health = true;');
    await fs.writeFile(path.join(projectDir, '.github', 'workflows', 'ci.yml'), 'name: CI');

    const report = await runAnalyze({ workspacePath: workspaceDir });

    expect(report.workspaceDetected).toBe(true);
    expect(report.profile).toBe('polyglot');
    expect(report.summary.projectCount).toBe(1);
    expect(report.projects[0].hasCiConfig).toBe(true);
    expect(report.projects[0].hasHealthEndpoint).toBe(true);
    expect(report.findings.some((item) => item.id === 'project.ci.missing')).toBe(false);
    expect(report.findings.some((item) => item.id === 'project.health.missing')).toBe(false);
  });

  it('throws when the provided workspace path does not exist', async () => {
    const missingPath = path.join(os.tmpdir(), 'rapidkit-analyze-nonexistent');
    await expect(runAnalyze({ workspacePath: missingPath })).rejects.toThrow(
      `Workspace path does not exist: ${path.resolve(missingPath)}`
    );
  });

  it('produces JSON output and writes evidence for CI mode', async () => {
    const workspaceDir = await createTempDir();
    const projectDir = path.join(workspaceDir, 'service-a');

    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(workspaceDir, '.rapidkit'), { recursive: true });
    await fs.mkdir(path.join(projectDir, '.rapidkit'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });

    await fs.writeFile(
      path.join(workspaceDir, '.rapidkit', 'workspace.json'),
      JSON.stringify({ profile: 'polyglot' }, null, 2)
    );
    await fs.writeFile(
      path.join(projectDir, '.rapidkit', 'project.json'),
      JSON.stringify({ name: 'service-a', runtime: 'node' }, null, 2)
    );
    await fs.writeFile(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ name: 'service-a', scripts: { test: 'echo test' } }, null, 2)
    );
    await fs.writeFile(path.join(projectDir, 'src', 'health.ts'), 'export const health = true;');

    const { stdout } = await execa(
      'npx',
      ['tsx', 'src/index.ts', 'analyze', '--workspace', workspaceDir, '--json'],
      {
        cwd: process.cwd(),
        reject: false,
      }
    );
    const payload = JSON.parse(stdout);

    expect(payload).toHaveProperty('schemaVersion', 'rapidkit-analyze-v1');
    expect(payload).toHaveProperty('summary');
    expect(payload.summary).toHaveProperty('projectCount', 1);
    expect(payload).toHaveProperty('enterpriseControls');
    expect(payload.enterpriseControls).toHaveProperty(
      'evidencePath',
      '.rapidkit/reports/analyze-last-run.json'
    );

    const evidencePath = path.join(workspaceDir, '.rapidkit', 'reports', 'analyze-last-run.json');
    const evidenceJson = JSON.parse(await fs.readFile(evidencePath, 'utf8'));
    expect(evidenceJson.workspacePath).toBe(path.resolve(workspaceDir));
  });

  it('returns blocked exit code when strict mode is enabled and warnings exist', async () => {
    const workspaceDir = await createTempDir();
    const projectDir = path.join(workspaceDir, 'service-b');

    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(workspaceDir, '.rapidkit'), { recursive: true });
    await fs.mkdir(path.join(projectDir, '.rapidkit'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });

    await fs.writeFile(
      path.join(workspaceDir, '.rapidkit', 'workspace.json'),
      JSON.stringify({ profile: 'polyglot' }, null, 2)
    );
    await fs.writeFile(
      path.join(projectDir, '.rapidkit', 'project.json'),
      JSON.stringify({ name: 'service-b', runtime: 'node' }, null, 2)
    );
    await fs.writeFile(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ name: 'service-b', scripts: {} }, null, 2)
    );
    await fs.writeFile(path.join(projectDir, 'src', 'index.ts'), 'export const app = true;');

    const result = await execa(
      'npx',
      ['tsx', 'src/index.ts', 'analyze', '--workspace', workspaceDir, '--json', '--strict'],
      {
        cwd: process.cwd(),
        reject: false,
      }
    );

    expect(result.exitCode).toBe(2);
    const payload = JSON.parse(result.stdout);
    expect(payload.summary.verdict).toBe('blocked');
    expect(payload.findings.some((item: any) => item.severity === 'warn')).toBe(true);
  });
});
