import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

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

    const report = await runAnalyze({ workspacePath: workspaceDir, json: true });
    const payload = JSON.parse(JSON.stringify(report));

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

  it('ignores workspace shell pyproject at root and analyzes registered child projects', async () => {
    const workspaceDir = await createTempDir();
    const projectDir = path.join(workspaceDir, 'admin-api');

    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'test'), { recursive: true });
    await fs.mkdir(path.join(workspaceDir, '.rapidkit'), { recursive: true });
    await fs.mkdir(path.join(projectDir, '.rapidkit'), { recursive: true });

    await fs.writeFile(
      path.join(workspaceDir, '.rapidkit', 'workspace.json'),
      JSON.stringify({ profile: 'polyglot', workspace_name: 'admin-dashboard-wsp' }, null, 2)
    );
    await fs.writeFile(
      path.join(workspaceDir, 'pyproject.toml'),
      [
        '[tool.poetry]',
        'name = "admin-dashboard-wsp"',
        'package-mode = false',
        '',
        '[tool.poetry.dependencies]',
        'python = "^3.10"',
        'rapidkit-core = "*"',
      ].join('\n')
    );
    await fs.writeFile(path.join(workspaceDir, '.rapidkit-workspace'), 'workspace');
    await fs.writeFile(
      path.join(projectDir, '.rapidkit', 'project.json'),
      JSON.stringify({ kit_name: 'nestjs.standard' }, null, 2)
    );
    await fs.writeFile(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ name: 'admin-api', scripts: { test: 'jest' } }, null, 2)
    );
    await fs.writeFile(path.join(projectDir, 'Dockerfile'), 'FROM node:20');
    await fs.writeFile(path.join(projectDir, '.env.example'), 'PORT=3000');
    await fs.writeFile(path.join(projectDir, 'src', 'health.ts'), 'export const ok = true;');

    const report = await runAnalyze({ workspacePath: workspaceDir, json: true });

    expect(report.summary.projectCount).toBe(1);
    expect(report.projects[0]?.name).toBe('admin-api');
    expect(report.projects[0]?.relativePath).toBe('admin-api');
    expect(report.projects[0]?.framework).not.toBe('python');
    expect(report.projects[0]?.hasRapidKitMarker).toBe(true);
    expect(report.findings.some((item) => item.id === 'project.marker.missing')).toBe(false);
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

    const payload = await runAnalyze({ workspacePath: workspaceDir, json: true, strict: true });

    expect(payload.summary.verdict).toBe('blocked');
    expect(payload.findings.some((item: any) => item.severity === 'warn')).toBe(true);
  });

  it('warns instead of failing when workspace has no projects', async () => {
    const workspaceDir = await createTempDir();
    await fs.mkdir(path.join(workspaceDir, '.rapidkit'), { recursive: true });
    await fs.writeFile(
      path.join(workspaceDir, '.rapidkit', 'workspace.json'),
      JSON.stringify({ profile: 'minimal', workspace_name: 'empty-minimal' }, null, 2)
    );
    await fs.writeFile(
      path.join(workspaceDir, '.rapidkit-workspace'),
      JSON.stringify({ signature: 'RAPIDKIT_WORKSPACE', name: 'empty-minimal' }, null, 2)
    );

    const report = await runAnalyze({ workspacePath: workspaceDir });

    const missingProjectsFinding = report.findings.find(
      (item) => item.id === 'workspace.projects.missing'
    );
    expect(missingProjectsFinding?.severity).toBe('warn');
    expect(report.summary.findings.fail).toBe(0);
    expect(report.summary.verdict).not.toBe('blocked');
    expect(report.nextActions[0]).toContain('create project');
  });

  it('warns for polyglot profile with zero projects and prioritizes project scaffolding', async () => {
    const workspaceDir = await createTempDir();
    await fs.mkdir(path.join(workspaceDir, '.rapidkit'), { recursive: true });
    await fs.writeFile(
      path.join(workspaceDir, '.rapidkit', 'workspace.json'),
      JSON.stringify({ profile: 'polyglot', workspace_name: 'empty-polyglot' }, null, 2)
    );
    await fs.writeFile(
      path.join(workspaceDir, '.rapidkit-workspace'),
      JSON.stringify({ signature: 'RAPIDKIT_WORKSPACE', name: 'empty-polyglot' }, null, 2)
    );

    const report = await runAnalyze({ workspacePath: workspaceDir });

    expect(report.profile).toBe('polyglot');
    expect(report.summary.projectCount).toBe(0);
    expect(report.findings.find((item) => item.id === 'workspace.projects.missing')?.severity).toBe(
      'warn'
    );
    expect(report.summary.verdict).toBe('needs-attention');
    expect(report.nextActions[0]).toContain('create project');
    expect(report.nextActions[0]).not.toContain('create workspace');
  });
});
