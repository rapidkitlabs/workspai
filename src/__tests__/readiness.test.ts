import fsExtra from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { evaluateReleaseReadiness } from '../readiness.js';

const createdPaths: string[] = [];

async function makeWorkspace(): Promise<string> {
  const root = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rapidkit-readiness-'));
  createdPaths.push(root);

  await fsExtra.ensureDir(path.join(root, '.rapidkit', 'reports'));
  await fsExtra.writeJSON(path.join(root, '.rapidkit-workspace'), {
    signature: 'RAPIDKIT_WORKSPACE',
    name: 'readiness-test',
  });

  return root;
}

async function writeAnalyzeEvidence(
  workspace: string,
  verdict: 'ready' | 'needs-attention' | 'blocked' = 'ready'
) {
  await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'reports', 'analyze-last-run.json'), {
    schemaVersion: 'rapidkit-analyze-v1',
    summary: {
      score: verdict === 'ready' ? 92 : verdict === 'needs-attention' ? 72 : 40,
      verdict,
      findings: {
        fail: verdict === 'blocked' ? 1 : 0,
        warn: verdict === 'needs-attention' ? 1 : 0,
        info: 0,
      },
    },
  });
}

afterEach(async () => {
  while (createdPaths.length > 0) {
    const target = createdPaths.pop();
    if (target) {
      await fsExtra.remove(target);
    }
  }
});

describe('release readiness', () => {
  it('resolves workspace shell cwd to registered child project for env gate', async () => {
    const workspace = await makeWorkspace();
    const projectDir = path.join(workspace, 'admin-api');
    await fsExtra.ensureDir(projectDir);
    await fsExtra.ensureDir(path.join(projectDir, '.rapidkit'));

    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'workspace.json'), {
      profile: 'polyglot',
      workspace_name: 'admin-dashboard-wsp',
    });
    await fsExtra.writeFile(
      path.join(workspace, 'pyproject.toml'),
      '[tool.poetry]\nname = "admin-dashboard-wsp"\npackage-mode = false\n',
      'utf-8'
    );
    await fsExtra.writeJSON(path.join(projectDir, '.rapidkit', 'project.json'), {
      kit_name: 'nestjs.standard',
    });
    await fsExtra.writeJSON(path.join(projectDir, 'package.json'), {
      name: 'admin-api',
      scripts: { test: 'jest' },
    });
    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'workspace.contract.json'), {
      schemaVersion: 1,
      kind: 'rapidkit.workspace.contract',
      projects: [{ slug: 'admin-api', relativePath: 'admin-api', framework: 'nestjs' }],
    });
    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'toolchain.lock'), {
      runtime: {
        node: { version: '20.12.0' },
      },
    });
    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'reports', 'doctor-last-run.json'), {
      schemaVersion: 'doctor-workspace-evidence-v1',
      evidenceType: 'workspace',
      summary: { totalIssues: 0, hasSystemErrors: false },
      projects: [
        {
          name: 'admin-api',
          path: projectDir,
          depsInstalled: true,
          vulnerabilities: 0,
        },
      ],
    });
    await fsExtra.writeJSON(
      path.join(workspace, '.rapidkit', 'reports', 'workspace-verify-pack-contract.json'),
      {
        schemaVersion: 'v1',
        status: 'pass',
        summary: { failedChecks: 0 },
      }
    );
    await writeAnalyzeEvidence(workspace);

    const readiness = await evaluateReleaseReadiness({ startPath: workspace, writeReport: false });

    expect(readiness.projectPath).toBe(projectDir);
    expect(readiness.gates.find((gate) => gate.gate === 'env')?.status).toBe('pass');
  });

  it('prefers workspace-registry.v1.json for registered project count', async () => {
    const workspace = await makeWorkspace();
    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'workspace.json'), {
      schema_version: '1.0',
      profile: 'polyglot',
    });
    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'workspace.contract.json'), {
      projects: [{ slug: 'api', relativePath: 'api' }],
    });
    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'workspace-registry.v1.json'), {
      schemaVersion: 'workspace-registry.v1',
      kind: 'rapidkit.workspace.registry',
      generatedAt: '2026-06-16T00:00:00.000Z',
      workspacePath: workspace,
      workspaceName: 'readiness-test',
      profile: 'polyglot',
      projectCount: 2,
      authority: 'workspace.contract.json',
      contractPath: '.rapidkit/workspace.contract.json',
      registrySummaryPath: '.rapidkit/workspace-registry.v1.json',
      projects: [
        { slug: 'api', relativePath: 'api' },
        { slug: 'nest', relativePath: 'nest' },
      ],
      sources: {
        contract: { exists: true, projectCount: 1 },
        globalRegistry: { exists: false, projectCount: 0 },
        legacyWorkspaceJson: { exists: true, projectCount: 0 },
      },
    });
    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'toolchain.lock'), {
      runtime: { node: { version: '20.12.0' } },
    });
    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'reports', 'doctor-last-run.json'), {
      schemaVersion: 'doctor-workspace-evidence-v1',
      evidenceType: 'workspace',
      summary: { totalIssues: 0, hasSystemErrors: false },
      projects: [],
    });
    await fsExtra.writeJSON(
      path.join(workspace, '.rapidkit', 'reports', 'workspace-verify-pack-contract.json'),
      {
        schemaVersion: 'v1',
        status: 'pass',
        summary: { failedChecks: 0 },
      }
    );
    await writeAnalyzeEvidence(workspace);

    const readiness = await evaluateReleaseReadiness({ startPath: workspace, writeReport: true });
    expect(readiness.schemaVersion).toBe('release-readiness-v1');
    expect(readiness.overallStatus).not.toBe('fail');
    const written = await fsExtra.readJSON(
      path.join(workspace, '.rapidkit', 'reports', 'release-readiness-last-run.json')
    );
    expect(written.schemaVersion).toBe('release-readiness-v1');
  });

  it('returns pass when env/doctor/verify/dependency checks are healthy', async () => {
    const workspace = await makeWorkspace();

    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'toolchain.lock'), {
      runtime: {
        node: { version: '20.12.0' },
      },
    });

    await fsExtra.writeJSON(path.join(workspace, 'package.json'), {
      name: 'api-service',
      version: '1.0.0',
    });

    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'reports', 'doctor-last-run.json'), {
      summary: {
        totalIssues: 0,
        hasSystemErrors: false,
      },
      projects: [
        {
          name: 'api-service',
          depsInstalled: true,
          vulnerabilities: 0,
        },
      ],
    });

    await fsExtra.writeJSON(
      path.join(workspace, '.rapidkit', 'reports', 'workspace-verify-pack-contract.json'),
      {
        schemaVersion: 'v1',
        status: 'pass',
        summary: {
          failedChecks: 0,
        },
      }
    );

    await writeAnalyzeEvidence(workspace);

    const readiness = await evaluateReleaseReadiness({ startPath: workspace, writeReport: false });
    expect(readiness.overallStatus).toBe('pass');
    expect(readiness.blocking).toBe(false);
    expect(readiness.gates.every((gate) => gate.status === 'pass')).toBe(true);
  });

  it('blocks when verify contract is missing', async () => {
    const workspace = await makeWorkspace();

    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'toolchain.lock'), {
      runtime: {
        python: { version: '3.12.0' },
      },
    });

    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'reports', 'doctor-last-run.json'), {
      summary: {
        totalIssues: 0,
        hasSystemErrors: false,
      },
      projects: [
        {
          name: 'orders-api',
          depsInstalled: true,
          vulnerabilities: 0,
        },
      ],
    });

    await fsExtra.writeFile(
      path.join(workspace, 'pyproject.toml'),
      '[tool.poetry]\nname = "orders-api"\nversion = "0.1.0"\n',
      'utf-8'
    );

    await writeAnalyzeEvidence(workspace);

    const readiness = await evaluateReleaseReadiness({ startPath: workspace, writeReport: false });

    expect(readiness.overallStatus).toBe('fail');
    expect(readiness.blocking).toBe(true);
    expect(readiness.blockingReasons.some((reason) => reason.includes('verify'))).toBe(true);
  });

  it('fails dependency gate when vulnerabilities are reported in doctor evidence', async () => {
    const workspace = await makeWorkspace();

    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'toolchain.lock'), {
      runtime: {
        go: { version: '1.23.0' },
      },
    });

    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'reports', 'doctor-last-run.json'), {
      summary: {
        totalIssues: 1,
        hasSystemErrors: false,
      },
      projects: [
        {
          name: 'billing-service',
          depsInstalled: true,
          vulnerabilities: 2,
        },
      ],
    });

    await fsExtra.writeJSON(
      path.join(workspace, '.rapidkit', 'reports', 'verify-pack-contract.json'),
      {
        schemaVersion: 'v1',
        status: 'pass',
        summary: {
          failedChecks: 0,
        },
      }
    );

    await writeAnalyzeEvidence(workspace);

    const readiness = await evaluateReleaseReadiness({ startPath: workspace, writeReport: false });
    const dependencyGate = readiness.gates.find((gate) => gate.gate === 'dependency');

    expect(readiness.overallStatus).toBe('fail');
    expect(dependencyGate?.status).toBe('fail');
    expect(dependencyGate?.summary).toContain('vulnerability');
  });

  it('treats unknown doctor evidence schema as missing evidence', async () => {
    const workspace = await makeWorkspace();

    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'toolchain.lock'), {
      runtime: {
        node: { version: '20.12.0' },
      },
    });

    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'reports', 'doctor-last-run.json'), {
      schemaVersion: 'doctor-workspace-evidence-v999',
      evidenceType: 'workspace',
      summary: {
        totalIssues: 0,
        hasSystemErrors: false,
      },
      projects: [
        {
          name: 'api-service',
          depsInstalled: true,
          vulnerabilities: 0,
        },
      ],
    });

    await fsExtra.writeJSON(
      path.join(workspace, '.rapidkit', 'reports', 'workspace-verify-pack-contract.json'),
      {
        schemaVersion: 'v1',
        status: 'pass',
        summary: {
          failedChecks: 0,
        },
      }
    );

    await writeAnalyzeEvidence(workspace);

    const readiness = await evaluateReleaseReadiness({ startPath: workspace, writeReport: false });
    const doctorGate = readiness.gates.find((gate) => gate.gate === 'doctor');

    expect(readiness.overallStatus).toBe('fail');
    expect(doctorGate?.status).toBe('fail');
    expect(doctorGate?.summary).toContain('missing');
  });

  it('passes verify gate with --skip-verify even when verify artifacts are missing', async () => {
    const workspace = await makeWorkspace();

    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'toolchain.lock'), {
      runtime: { node: { version: '20.12.0' } },
    });
    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'reports', 'doctor-last-run.json'), {
      summary: { totalIssues: 0, hasSystemErrors: false },
      projects: [{ name: 'api-service', depsInstalled: true, vulnerabilities: 0 }],
    });
    await writeAnalyzeEvidence(workspace);

    const readiness = await evaluateReleaseReadiness({
      startPath: workspace,
      writeReport: false,
      skipVerify: true,
    });
    const verifyGate = readiness.gates.find((gate) => gate.gate === 'verify');

    expect(readiness.overallStatus).toBe('pass');
    expect(verifyGate?.status).toBe('pass');
    expect(verifyGate?.summary).toContain('skipped');
  });

  it('fails analyze gate when analyze evidence is missing', async () => {
    const workspace = await makeWorkspace();

    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'toolchain.lock'), {
      runtime: { node: { version: '20.12.0' } },
    });
    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'reports', 'doctor-last-run.json'), {
      summary: { totalIssues: 0, hasSystemErrors: false },
      projects: [{ name: 'api-service', depsInstalled: true, vulnerabilities: 0 }],
    });

    const readiness = await evaluateReleaseReadiness({
      startPath: workspace,
      writeReport: false,
      skipVerify: true,
    });
    const analyzeGate = readiness.gates.find((gate) => gate.gate === 'analyze');

    expect(readiness.overallStatus).toBe('fail');
    expect(analyzeGate?.status).toBe('fail');
  });

  it('uses workspace-scoped env gate wording when no projects are registered', async () => {
    const workspace = await makeWorkspace();

    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'workspace.json'), {
      profile: 'minimal',
      workspace_name: 'minimal-shell',
    });
    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'workspace.contract.json'), {
      schemaVersion: 1,
      projects: [],
    });
    await fsExtra.writeFile(
      path.join(workspace, 'pyproject.toml'),
      '[tool.poetry]\nname = "minimal-shell"\npackage-mode = false\n',
      'utf-8'
    );
    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'toolchain.lock'), {
      runtime: {
        node: { version: '20.12.0' },
        python: { version: null },
      },
    });
    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'reports', 'doctor-last-run.json'), {
      healthScore: { passed: 5, warnings: 0, errors: 0, total: 5 },
      projects: [],
    });
    await writeAnalyzeEvidence(workspace, 'needs-attention');

    const readiness = await evaluateReleaseReadiness({ startPath: workspace, writeReport: false });
    const envGate = readiness.gates.find((gate) => gate.gate === 'env');
    expect(envGate?.summary).toContain('Workspace (python)');
    expect(envGate?.summary).not.toContain('Project runtime');
  });

  it('warns on analyze gate for polyglot workspace with zero projects instead of failing', async () => {
    const workspace = await makeWorkspace();

    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'workspace.json'), {
      profile: 'polyglot',
      workspace_name: 'empty-polyglot',
    });
    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'workspace.contract.json'), {
      schemaVersion: 1,
      projects: [],
    });
    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'toolchain.lock'), {
      runtime: {
        node: { version: '20.12.0' },
        python: { version: null },
      },
    });
    await fsExtra.writeJSON(path.join(workspace, '.rapidkit', 'reports', 'doctor-last-run.json'), {
      schemaVersion: 'doctor-workspace-evidence-v1',
      evidenceType: 'workspace',
      summary: { totalIssues: 0, hasSystemErrors: false },
      healthScore: { passed: 5, warnings: 0, errors: 0, total: 5 },
      projects: [],
    });
    await writeAnalyzeEvidence(workspace, 'needs-attention');

    const readiness = await evaluateReleaseReadiness({
      startPath: workspace,
      writeReport: false,
      skipVerify: true,
    });
    const analyzeGate = readiness.gates.find((gate) => gate.gate === 'analyze');

    expect(analyzeGate?.status).toBe('warn');
    expect(readiness.overallStatus).toBe('warn');
  });
});
