import chalk from 'chalk';
import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import {
  isGoProject,
  isJavaProject,
  isNodeProject,
  isPythonProject,
  readRapidkitProjectJson,
} from './utils/runtime-detection.js';
import { isDoctorEvidencePayloadCompatible } from './utils/doctor-evidence-contract.js';
import { findWorkspaceRootUp, isWorkspaceShellDirectory } from './utils/workspace-root.js';

export type ReadinessGateStatus = 'pass' | 'warn' | 'fail';
export type ReadinessOverallStatus = 'pass' | 'warn' | 'fail';
export type LifecycleAction = 'dev' | 'test' | 'build' | 'start' | 'lint' | 'format';

export interface ReadinessGateResult {
  gate: 'env' | 'doctor' | 'analyze' | 'verify' | 'dependency';
  status: ReadinessGateStatus;
  summary: string;
  details: string[];
  evidencePath?: string;
}

export interface ReleaseReadinessContract {
  schemaVersion: 'v1';
  generatedAt: string;
  workspacePath: string;
  projectPath: string;
  action?: LifecycleAction;
  overallStatus: ReadinessOverallStatus;
  blocking: boolean;
  blockingReasons: string[];
  gates: ReadinessGateResult[];
  evidencePath?: string;
}

interface EvaluateReleaseReadinessOptions {
  startPath?: string;
  action?: LifecycleAction;
  writeReport?: boolean;
  skipVerify?: boolean;
}

interface ReadinessCommandOptions {
  json?: boolean;
  strict?: boolean;
  skipVerify?: boolean;
}

function resolveReadinessProjectPath(startPath: string, workspacePath: string): string {
  const resolvedStart = path.resolve(startPath);
  if (!isWorkspaceShellDirectory(resolvedStart)) {
    return resolvedStart;
  }

  const contractPath = path.join(workspacePath, '.rapidkit', 'workspace.contract.json');
  if (fs.existsSync(contractPath)) {
    try {
      const contract = JSON.parse(fs.readFileSync(contractPath, 'utf-8')) as Record<
        string,
        unknown
      >;
      const projects = Array.isArray(contract.projects) ? contract.projects : [];
      for (const entry of projects) {
        const record = toObjectRecord(entry);
        const relativePath =
          typeof record.relativePath === 'string' ? record.relativePath.trim() : '';
        if (relativePath) {
          return path.join(workspacePath, relativePath);
        }
      }
    } catch {
      // Fall through to doctor evidence.
    }
  }

  const doctor = loadDoctorPayload(workspacePath);
  const doctorProjects = Array.isArray(doctor.payload?.projects) ? doctor.payload.projects : [];
  for (const entry of doctorProjects) {
    const record = toObjectRecord(entry);
    const projectPath = typeof record.path === 'string' ? record.path.trim() : '';
    if (projectPath) {
      return path.resolve(projectPath);
    }
  }

  return resolvedStart;
}

function detectProjectRuntime(projectPath: string): 'python' | 'node' | 'go' | 'java' | 'unknown' {
  const projectJson = readRapidkitProjectJson(projectPath);

  if (isGoProject(projectJson, projectPath)) return 'go';
  if (isJavaProject(projectJson, projectPath)) return 'java';
  if (isNodeProject(projectJson, projectPath)) return 'node';
  if (isPythonProject(projectJson, projectPath)) return 'python';
  return 'unknown';
}

function selectLatestReport(reportsDir: string, patterns: RegExp[]): string | null {
  if (!fs.existsSync(reportsDir)) return null;

  const candidates = fs
    .readdirSync(reportsDir)
    .filter(
      (fileName) => fileName.endsWith('.json') && patterns.some((pattern) => pattern.test(fileName))
    )
    .map((fileName) => path.join(reportsDir, fileName));

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0];
}

function toObjectRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function buildEnvGate(
  workspacePath: string,
  projectRuntime: 'python' | 'node' | 'go' | 'java' | 'unknown'
): ReadinessGateResult {
  const lockPath = path.join(workspacePath, '.rapidkit', 'toolchain.lock');

  if (!fs.existsSync(lockPath)) {
    return {
      gate: 'env',
      status: 'fail',
      summary: 'toolchain.lock is missing',
      details: [
        'Run rapidkit bootstrap to pin runtime versions and generate a reproducible toolchain.',
      ],
      evidencePath: lockPath,
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf-8')) as Record<string, unknown>;
    const runtime = toObjectRecord(parsed.runtime);
    const runtimeKeys = ['python', 'node', 'go', 'java'] as const;
    const pinned = runtimeKeys.filter((key) => {
      const item = toObjectRecord(runtime[key]);
      return typeof item.version === 'string' && item.version.trim().length > 0;
    });

    if (pinned.length === 0) {
      return {
        gate: 'env',
        status: 'fail',
        summary: 'No runtime versions are pinned in toolchain.lock',
        details: [
          'Pin at least one runtime version via rapidkit setup <runtime> and re-run bootstrap.',
        ],
        evidencePath: lockPath,
      };
    }

    if (projectRuntime !== 'unknown') {
      const runtimeEntry = toObjectRecord(runtime[projectRuntime]);
      if (typeof runtimeEntry.version !== 'string' || runtimeEntry.version.trim().length === 0) {
        return {
          gate: 'env',
          status: 'fail',
          summary: `Project runtime (${projectRuntime}) is not pinned in toolchain.lock`,
          details: [
            `Run rapidkit setup ${projectRuntime} and rapidkit bootstrap to lock ${projectRuntime} for this workspace.`,
          ],
          evidencePath: lockPath,
        };
      }
    }

    return {
      gate: 'env',
      status: 'pass',
      summary: `Pinned runtimes: ${pinned.join(', ')}`,
      details: [],
      evidencePath: lockPath,
    };
  } catch {
    return {
      gate: 'env',
      status: 'fail',
      summary: 'toolchain.lock is invalid JSON',
      details: ['Regenerate lockfile with rapidkit bootstrap.'],
      evidencePath: lockPath,
    };
  }
}

function loadDoctorPayload(workspacePath: string): {
  payload: Record<string, unknown> | null;
  path: string;
} {
  const reportPath = path.join(workspacePath, '.rapidkit', 'reports', 'doctor-last-run.json');
  if (!fs.existsSync(reportPath)) {
    return { payload: null, path: reportPath };
  }

  try {
    const payload = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as Record<string, unknown>;

    if (!isDoctorEvidencePayloadCompatible(payload, 'workspace')) {
      return { payload: null, path: reportPath };
    }

    return { payload, path: reportPath };
  } catch {
    return { payload: null, path: reportPath };
  }
}

function buildDoctorGate(workspacePath: string): {
  gate: ReadinessGateResult;
  payload: Record<string, unknown> | null;
} {
  const loaded = loadDoctorPayload(workspacePath);

  if (!loaded.payload) {
    return {
      gate: {
        gate: 'doctor',
        status: 'fail',
        summary: 'Doctor evidence is missing',
        details: ['Run rapidkit doctor workspace --json before release readiness checks.'],
        evidencePath: loaded.path,
      },
      payload: null,
    };
  }

  const summary = toObjectRecord(loaded.payload.summary);
  const totalIssues = Number(summary.totalIssues ?? 0);
  const hasSystemErrors = Boolean(summary.hasSystemErrors);

  if (hasSystemErrors) {
    return {
      gate: {
        gate: 'doctor',
        status: 'fail',
        summary: 'Doctor reported system errors',
        details: ['Resolve system-level doctor errors before proceeding.'],
        evidencePath: loaded.path,
      },
      payload: loaded.payload,
    };
  }

  if (totalIssues > 0) {
    return {
      gate: {
        gate: 'doctor',
        status: 'warn',
        summary: `Doctor found ${totalIssues} issue(s)`,
        details: ['Run rapidkit doctor workspace --fix and re-run readiness checks.'],
        evidencePath: loaded.path,
      },
      payload: loaded.payload,
    };
  }

  return {
    gate: {
      gate: 'doctor',
      status: 'pass',
      summary: 'Doctor checks passed without issues',
      details: [],
      evidencePath: loaded.path,
    },
    payload: loaded.payload,
  };
}

function buildAnalyzeGate(workspacePath: string): ReadinessGateResult {
  const reportPath = path.join(workspacePath, '.rapidkit', 'reports', 'analyze-last-run.json');

  if (!fs.existsSync(reportPath)) {
    return {
      gate: 'analyze',
      status: 'fail',
      summary: 'Analyze evidence is missing',
      details: ['Run rapidkit analyze --json before release readiness checks.'],
      evidencePath: reportPath,
    };
  }

  try {
    const payload = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as Record<string, unknown>;
    const summary = toObjectRecord(payload.summary);
    const verdict = String(summary.verdict ?? '').toLowerCase();
    const score = Number(summary.score ?? 0);
    const findings = toObjectRecord(summary.findings);
    const failCount = Number(findings.fail ?? 0);

    if (verdict === 'blocked' || failCount > 0) {
      return {
        gate: 'analyze',
        status: 'fail',
        summary: `Analyze verdict is blocked (score ${score}/100)`,
        details: ['Resolve analyze findings and regenerate analyze-last-run.json.'],
        evidencePath: reportPath,
      };
    }

    if (verdict === 'needs-attention') {
      return {
        gate: 'analyze',
        status: 'warn',
        summary: `Analyze needs attention (score ${score}/100)`,
        details: ['Review analyze warnings before release.'],
        evidencePath: reportPath,
      };
    }

    return {
      gate: 'analyze',
      status: 'pass',
      summary: `Analyze passed (score ${score}/100)`,
      details: [],
      evidencePath: reportPath,
    };
  } catch {
    return {
      gate: 'analyze',
      status: 'fail',
      summary: 'Analyze evidence is invalid JSON',
      details: ['Re-run rapidkit analyze --json to regenerate evidence.'],
      evidencePath: reportPath,
    };
  }
}

function evaluateExtensionVerifyArtifact(verifyPath: string): ReadinessGateResult {
  try {
    const payload = JSON.parse(fs.readFileSync(verifyPath, 'utf-8')) as Record<string, unknown>;
    const status = String(payload.status ?? '').toLowerCase();
    const summary = toObjectRecord(payload.summary);
    const failedChecks = Number(summary.failedChecks ?? 0);

    if (status === 'fail' || failedChecks > 0) {
      return {
        gate: 'verify',
        status: 'fail',
        summary: 'Verify-pack contract reports failed checks',
        details: ['Fix failed verify checks and regenerate verify-pack contract evidence.'],
        evidencePath: verifyPath,
      };
    }

    if (status === 'pass') {
      return {
        gate: 'verify',
        status: 'pass',
        summary: 'Verify-pack contract passed',
        details: [],
        evidencePath: verifyPath,
      };
    }

    return {
      gate: 'verify',
      status: 'warn',
      summary: 'Verify-pack contract status is not explicit',
      details: ['Ensure contract status is pass/fail and keep schema aligned with v1 contract.'],
      evidencePath: verifyPath,
    };
  } catch {
    return {
      gate: 'verify',
      status: 'fail',
      summary: 'Verify-pack contract is invalid JSON',
      details: ['Regenerate verify-pack contract artifact.'],
      evidencePath: verifyPath,
    };
  }
}

async function buildVerifyGate(
  workspacePath: string,
  options: { skipVerify?: boolean }
): Promise<ReadinessGateResult> {
  if (options.skipVerify) {
    return {
      gate: 'verify',
      status: 'pass',
      summary: 'Verify gate skipped (--skip-verify)',
      details: ['Verification was explicitly skipped for this readiness run.'],
    };
  }

  const reportsDir = path.join(workspacePath, '.rapidkit', 'reports');
  const verifyPath = selectLatestReport(reportsDir, [/verify-pack-contract/i, /^verify.*\.json$/i]);

  if (verifyPath) {
    return evaluateExtensionVerifyArtifact(verifyPath);
  }

  const cliEvidencePath = path.join(reportsDir, 'workspace-contract-verify-last-run.json');
  const cachedCliEvidence = selectLatestReport(reportsDir, [
    /workspace-contract-verify-last-run/i,
    /workspace-contract-verify/i,
  ]);

  if (cachedCliEvidence) {
    try {
      const payload = JSON.parse(fs.readFileSync(cachedCliEvidence, 'utf-8')) as Record<
        string,
        unknown
      >;
      const status = String(payload.status ?? '').toLowerCase();
      if (status === 'passed' || status === 'pass') {
        return {
          gate: 'verify',
          status: 'pass',
          summary: 'Workspace contract verification passed (CLI cache)',
          details: [],
          evidencePath: cachedCliEvidence,
        };
      }
      if (status === 'failed' || status === 'fail') {
        const violations = Array.isArray(payload.violations)
          ? (payload.violations as string[])
          : [];
        return {
          gate: 'verify',
          status: 'fail',
          summary: 'Workspace contract verification failed (CLI cache)',
          details: violations.slice(0, 5),
          evidencePath: cachedCliEvidence,
        };
      }
    } catch {
      // fall through to inline verify
    }
  }

  try {
    const { verifyWorkspaceContract } = await import('./utils/workspace-contract.js');
    const result = await verifyWorkspaceContract({ workspacePath });
    const evidencePayload = {
      schemaVersion: 'v1',
      source: 'cli',
      generatedAt: new Date().toISOString(),
      status: result.status,
      contractPath: result.contractPath,
      projectCount: result.projectCount,
      checks: result.checks,
      violations: result.violations,
    };
    await fsExtra.ensureDir(reportsDir);
    await fsExtra.writeJSON(cliEvidencePath, evidencePayload, { spaces: 2 });

    if (result.status === 'failed') {
      return {
        gate: 'verify',
        status: 'fail',
        summary: 'Workspace contract verification failed (CLI)',
        details: result.violations.slice(0, 5),
        evidencePath: cliEvidencePath,
      };
    }

    return {
      gate: 'verify',
      status: 'pass',
      summary: 'Workspace contract verification passed (CLI)',
      details: [],
      evidencePath: cliEvidencePath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      gate: 'verify',
      status: 'fail',
      summary: 'No verify evidence and workspace contract verification unavailable',
      details: [
        'Run rapidkit workspace contract verify --json or export verify-pack contract from CI.',
        message,
      ],
      evidencePath: path.join(reportsDir, '*verify*.json'),
    };
  }
}

function buildDependencyGate(
  doctorPayload: Record<string, unknown> | null,
  workspacePath: string
): ReadinessGateResult {
  const fallbackEvidence = path.join(workspacePath, '.rapidkit', 'reports', 'doctor-last-run.json');

  if (!doctorPayload) {
    return {
      gate: 'dependency',
      status: 'warn',
      summary: 'Dependency risk check skipped (doctor evidence missing)',
      details: ['Run rapidkit doctor workspace --json to include dependency findings.'],
      evidencePath: fallbackEvidence,
    };
  }

  const projects = Array.isArray(doctorPayload.projects)
    ? (doctorPayload.projects as Array<Record<string, unknown>>)
    : [];

  const vulnerabilities = projects.reduce((sum, project) => {
    const count = Number(project.vulnerabilities ?? 0);
    return Number.isFinite(count) ? sum + Math.max(0, count) : sum;
  }, 0);

  const missingDeps = projects.filter((project) => project.depsInstalled === false).length;

  if (vulnerabilities > 0) {
    return {
      gate: 'dependency',
      status: 'fail',
      summary: `${vulnerabilities} dependency vulnerability(ies) reported`,
      details: ['Resolve vulnerabilities (npm/pip/go audit pipelines) before release.'],
      evidencePath: fallbackEvidence,
    };
  }

  if (missingDeps > 0) {
    return {
      gate: 'dependency',
      status: 'warn',
      summary: `${missingDeps} project(s) report missing dependencies`,
      details: ['Run project init/bootstrap and regenerate doctor evidence.'],
      evidencePath: fallbackEvidence,
    };
  }

  return {
    gate: 'dependency',
    status: 'pass',
    summary: 'No dependency vulnerabilities reported',
    details: [],
    evidencePath: fallbackEvidence,
  };
}

function computeOverallStatus(gates: ReadinessGateResult[]): ReadinessOverallStatus {
  if (gates.some((gate) => gate.status === 'fail')) return 'fail';
  if (gates.some((gate) => gate.status === 'warn')) return 'warn';
  return 'pass';
}

async function writeReadinessEvidence(
  workspacePath: string,
  payload: ReleaseReadinessContract
): Promise<string> {
  const reportPath = path.join(
    workspacePath,
    '.rapidkit',
    'reports',
    'release-readiness-last-run.json'
  );
  await fsExtra.ensureDir(path.dirname(reportPath));
  await fsExtra.writeJSON(reportPath, payload, { spaces: 2 });
  return reportPath;
}

export async function evaluateReleaseReadiness(
  options: EvaluateReleaseReadinessOptions = {}
): Promise<ReleaseReadinessContract> {
  const startPath = path.resolve(options.startPath ?? process.cwd());
  const workspacePath = findWorkspaceRootUp(startPath) ?? startPath;
  const projectPath = resolveReadinessProjectPath(startPath, workspacePath);
  const projectRuntime = detectProjectRuntime(projectPath);

  const envGate = buildEnvGate(workspacePath, projectRuntime);
  const doctor = buildDoctorGate(workspacePath);
  const analyzeGate = buildAnalyzeGate(workspacePath);
  const verifyGate = await buildVerifyGate(workspacePath, { skipVerify: options.skipVerify });
  const dependencyGate = buildDependencyGate(doctor.payload, workspacePath);

  const gates = [envGate, doctor.gate, analyzeGate, verifyGate, dependencyGate];
  const overallStatus = computeOverallStatus(gates);

  const contract: ReleaseReadinessContract = {
    schemaVersion: 'v1',
    generatedAt: new Date().toISOString(),
    workspacePath,
    projectPath,
    action: options.action,
    overallStatus,
    blocking: overallStatus === 'fail',
    blockingReasons: gates
      .filter((gate) => gate.status === 'fail')
      .map((gate) => `${gate.gate}: ${gate.summary}`),
    gates,
  };

  if (options.writeReport !== false) {
    contract.evidencePath = await writeReadinessEvidence(workspacePath, contract);
  }

  return contract;
}

function gateIndicator(status: ReadinessGateStatus): string {
  if (status === 'pass') return chalk.green('PASS');
  if (status === 'warn') return chalk.yellow('WARN');
  return chalk.red('FAIL');
}

function overallIndicator(status: ReadinessOverallStatus): string {
  if (status === 'pass') return chalk.green('PASS');
  if (status === 'warn') return chalk.yellow('WARN');
  return chalk.red('FAIL');
}

export async function runReleaseReadinessCommand(options: ReadinessCommandOptions): Promise<void> {
  const contract = await evaluateReleaseReadiness({
    writeReport: true,
    skipVerify: options.skipVerify === true,
  });

  if (options.json) {
    console.log(JSON.stringify(contract, null, 2));
  } else {
    console.log(chalk.bold.cyan('\n🚦 RapidKit Release Readiness\n'));
    console.log(chalk.bold(`Workspace: ${chalk.cyan(path.basename(contract.workspacePath))}`));
    console.log(chalk.gray(`Path: ${contract.workspacePath}`));
    console.log(`Overall: ${overallIndicator(contract.overallStatus)}`);

    for (const gate of contract.gates) {
      console.log(` - ${gate.gate}: ${gateIndicator(gate.status)} ${gate.summary}`);
      for (const detail of gate.details) {
        console.log(chalk.gray(`   ${detail}`));
      }
      if (gate.evidencePath) {
        console.log(chalk.gray(`   evidence: ${gate.evidencePath}`));
      }
    }

    if (contract.evidencePath) {
      console.log(chalk.gray(`\nEvidence saved: ${contract.evidencePath}`));
    }
  }

  if (options.strict && contract.overallStatus !== 'pass') {
    process.exit(1);
  }
}
