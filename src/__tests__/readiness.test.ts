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
});
