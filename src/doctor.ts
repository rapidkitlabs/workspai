import chalk from 'chalk';
import { execa } from 'execa';
import fsExtra from 'fs-extra';
import path from 'path';
import { logger } from './logger.js';
import { prompt } from './cli-ui/prompts.js';
import { readImportedProjectsRegistry } from './imported-projects-registry.js';
import {
  getPythonCommandCandidates,
  getRapidkitLocalScriptCandidates,
  getUserLocalBinCandidates,
  getVenvRapidkitPath,
  getVenvPythonPath,
  isWindowsPlatform,
  shouldUseShellExecution,
} from './utils/platform-capabilities.js';
import {
  detectBackendFrameworkFromProject,
  type BackendFrameworkDetection,
  type BackendPlatformKey,
  type BackendImportStack,
  type BackendRuntimeFamily,
} from './utils/backend-framework-contract.js';
import { detectFrontendFrameworkFromProject } from './utils/frontend-framework-contract.js';
import {
  assessFrontendSourceTree,
  buildFrontendDoctorProbes,
  detectNodeEslintConfigured,
  detectNodeTestSurface,
} from './utils/doctor-frontend-signals.js';
import {
  resolveProjectCommandCapabilities,
  type ProjectCommandCapabilities,
} from './utils/project-command-capabilities.js';
import { getFrameworkSupportTier } from './utils/support-matrix.js';
import {
  DOCTOR_PROJECT_EVIDENCE_SCHEMA,
  DOCTOR_WORKSPACE_EVIDENCE_SCHEMA,
  isDoctorEvidencePayloadCompatible,
} from './utils/doctor-evidence-contract.js';
import {
  resolveGovernanceRunId,
  withGovernanceRunMetadata,
} from './utils/governance-report-metadata.js';
import { getProbeTimeoutMs } from './utils/command-timeouts.js';
import {
  buildDoctorFixExecutionResult,
  DOCTOR_FIX_VERIFY_RECOMMENDED,
  type DoctorAppliedFix,
  type DoctorFixExecutionResult,
} from './contracts/doctor-fix-result-contract.js';

function uniquePaths(paths: string[]): string[] {
  return [
    ...new Set(paths.filter((candidatePath) => candidatePath && candidatePath.trim().length > 0)),
  ];
}

function getPoetryPathCandidates(): string[] {
  const fromLocalBins = getUserLocalBinCandidates().map((dir) =>
    path.join(dir, isWindowsPlatform() ? 'poetry.exe' : 'poetry')
  );

  const windowsExtras = isWindowsPlatform()
    ? [
        path.join(process.env.APPDATA || '', 'Python', 'Scripts', 'poetry.exe'),
        path.join(
          process.env.USERPROFILE || '',
          'AppData',
          'Roaming',
          'Python',
          'Scripts',
          'poetry.exe'
        ),
      ]
    : [];

  const unixExtras = isWindowsPlatform() ? [] : ['/usr/local/bin/poetry', '/usr/bin/poetry'];
  return uniquePaths([...fromLocalBins, ...windowsExtras, ...unixExtras]);
}

function getRapidkitBinaryCandidates(homeDir: string): Array<{ location: string; path: string }> {
  const localBinCandidates = getUserLocalBinCandidates().map((dir) => ({
    location: 'Global (user-local)',
    path: path.join(dir, isWindowsPlatform() ? 'rapidkit.exe' : 'rapidkit'),
  }));

  const defaults = [
    { location: 'Global (pipx)', path: path.join(homeDir, '.local', 'bin', 'rapidkit') },
    {
      location: 'Global (pipx)',
      path: path.join(homeDir, 'AppData', 'Roaming', 'Python', 'Scripts', 'rapidkit.exe'),
    },
    { location: 'Global (pyenv)', path: path.join(homeDir, '.pyenv', 'shims', 'rapidkit') },
    { location: 'Global (system)', path: '/usr/local/bin/rapidkit' },
    { location: 'Global (system)', path: '/usr/bin/rapidkit' },
  ];

  const workspaceVenvPath = getVenvRapidkitPath(path.join(process.cwd(), '.venv'));
  const workspaceLaunchers = getRapidkitLocalScriptCandidates(process.cwd());

  const workspaceCandidates = [
    { location: 'Workspace (.venv)', path: workspaceVenvPath },
    ...workspaceLaunchers.map((launcherPath) => ({
      location: 'Workspace (launcher)',
      path: launcherPath,
    })),
  ];

  const all = [...localBinCandidates, ...defaults, ...workspaceCandidates];
  const seen = new Set<string>();
  return all.filter((entry) => {
    if (seen.has(entry.path)) return false;
    seen.add(entry.path);
    return true;
  });
}

function sortRapidkitInstalledPaths(
  paths: { location: string; path: string; version: string }[]
): { location: string; path: string; version: string }[] {
  const locationPriority = new Map<string, number>([
    ['Workspace (.venv)', 0],
    ['Global (user-local)', 1],
    ['Global (pipx)', 2],
    ['Global (pyenv)', 3],
    ['Global (system)', 4],
  ]);

  return [...paths].sort((a, b) => {
    const aPriority = locationPriority.get(a.location) ?? Number.MAX_SAFE_INTEGER;
    const bPriority = locationPriority.get(b.location) ?? Number.MAX_SAFE_INTEGER;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.path.localeCompare(b.path);
  });
}

interface HealthCheckResult {
  status: 'ok' | 'warn' | 'error';
  message: string;
  details?: string;
  paths?: { location: string; path: string; version?: string }[]; // Multiple installation paths
}

type DetectedFramework =
  | 'FastAPI'
  | 'Django'
  | 'Flask'
  | 'Python'
  | 'NestJS'
  | 'Next.js'
  | 'Remix'
  | 'Nuxt'
  | 'React'
  | 'Vue'
  | 'Angular'
  | 'SvelteKit'
  | 'Svelte'
  | 'Vite'
  | 'Astro'
  | 'Solid'
  | 'Express'
  | 'Fastify'
  | 'Koa'
  | 'Echo'
  | 'Node.js'
  | 'Go'
  | 'Go/Fiber'
  | 'Go/Gin'
  | 'Java'
  | 'Spring Boot'
  | 'Rust'
  | 'Elixir'
  | 'Phoenix'
  | 'Clojure'
  | 'Scala'
  | 'Kotlin'
  | 'Deno'
  | 'Bun'
  | 'PHP'
  | 'Laravel'
  | 'Ruby'
  | 'Ruby on Rails'
  | 'ASP.NET'
  | 'Unknown';

type FrameworkSupportTier = 'first-class' | 'extended' | 'observed';
type ProjectRuntimeFamily =
  | 'python'
  | 'node'
  | 'go'
  | 'java'
  | 'rust'
  | 'elixir'
  | 'clojure'
  | 'deno'
  | 'php'
  | 'ruby'
  | 'dotnet'
  | 'unknown';
type ProjectKind = 'backend' | 'frontend' | 'fullstack' | 'generic';
type FrameworkConfidence = 'high' | 'medium' | 'low';

interface ProjectHealth {
  name: string;
  path: string;
  venvActive: boolean;
  depsInstalled: boolean;
  coreInstalled: boolean;
  coreVersion?: string;
  issues: string[];
  fixCommands?: string[];
  hasEnvFile?: boolean;
  modulesHealthy?: boolean;
  missingModules?: string[];
  framework?: DetectedFramework;
  frameworkKey?: BackendPlatformKey;
  importStack?: BackendImportStack;
  supportTier?: FrameworkSupportTier;
  runtimeFamily?: ProjectRuntimeFamily;
  projectKind?: ProjectKind;
  frameworkConfidence?: FrameworkConfidence;
  isGoProject?: boolean;
  kit?: string;
  stats?: {
    modules: number;
    files?: number;
    size?: string;
  };
  lastModified?: string;
  hasTests?: boolean;
  hasDocker?: boolean;
  hasCodeQuality?: boolean;
  vulnerabilities?: number;
  probes?: ProjectProbeResult[];
  commandCapabilities?: ProjectCommandCapabilities;
}

type DoctorScopeLabel = 'host-system' | 'workspace-aggregate' | 'project-scoped';

interface ProjectProbeResult {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  severity: 'info' | 'warn' | 'error';
  scope: DoctorScopeLabel;
  reason: string;
  recommendation?: string;
}

interface ScoreBreakdownItem {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'error';
  scope: DoctorScopeLabel;
  policyRuleId: string;
  reason: string;
}

interface DoctorContractMetadata {
  version: 'doctor-evidence-v1';
  scoringPolicyVersion: 'doctor-score-policy-v1';
  generatedBy: 'rapidkit-npm';
  deterministicScoreBreakdown: true;
  scopeModel: 'workspace-aggregate-or-project-scoped';
}

interface HealthScore {
  total: number;
  passed: number;
  warnings: number;
  errors: number;
}

interface WorkspaceHealth {
  workspacePath: string;
  workspaceName: string;
  python: HealthCheckResult;
  poetry: HealthCheckResult;
  pipx: HealthCheckResult;
  go: HealthCheckResult;
  rapidkitCore: HealthCheckResult;
  projects: ProjectHealth[];
  healthScore?: HealthScore;
  coreVersion?: string;
  npmVersion?: string;
  projectScanCached?: boolean;
  projectScanSignature?: string;
  projectScanCachePath?: string;
  evidencePath?: string;
  scoreBreakdown?: ScoreBreakdownItem[];
  driftDelta?: DoctorDriftDelta;
  scopeProvenance?: ScopeProvenanceSummary;
}

interface ProjectHealthEnvelope {
  workspacePath?: string;
  projectPath: string;
  projectName: string;
  python: HealthCheckResult;
  poetry: HealthCheckResult;
  pipx: HealthCheckResult;
  go: HealthCheckResult;
  rapidkitCore: HealthCheckResult;
  project: ProjectHealth;
  healthScore: HealthScore;
  evidencePath?: string;
  scoreBreakdown?: ScoreBreakdownItem[];
  driftDelta?: DoctorDriftDelta;
  scopeProvenance?: ScopeProvenanceSummary;
}

interface ScopeProvenanceSummary {
  scopedCount: number;
  aggregatedCount: number;
  mixedCount: number;
  dominantScope: 'scoped' | 'aggregated' | 'mixed' | 'unknown';
}

interface DoctorDriftDelta {
  baselineAvailable: boolean;
  previousGeneratedAt?: string;
  newIssueCount: number;
  resolvedIssueCount: number;
  netIssueDelta: number;
  scoreDeltaPercent: number | null;
  systemStatusChanges: Array<{
    id: 'python' | 'poetry' | 'pipx' | 'go' | 'rapidkitCore';
    from: HealthCheckResult['status'];
    to: HealthCheckResult['status'];
  }>;
  regressedProjects: string[];
  improvedProjects: string[];
}

function getProjectAdvisoryWarningCount(project: ProjectHealth): number {
  let advisoryWarnings = 0;

  const hasEnvIssue = project.issues.some((issue) =>
    issue.toLowerCase().includes('environment file missing')
  );

  // `.env` absence is shown as a warning row in output; count it even when no fixable issue exists.
  if (project.hasEnvFile === false && !hasEnvIssue) {
    advisoryWarnings += 1;
  }

  if (typeof project.vulnerabilities === 'number' && project.vulnerabilities > 0) {
    advisoryWarnings += 1;
  }

  return advisoryWarnings;
}

function countProjectAdvisoryWarningProjects(projects: ProjectHealth[]): number {
  return projects.filter((project) => getProjectAdvisoryWarningCount(project) > 0).length;
}

function countProjectAdvisoryWarnings(projects: ProjectHealth[]): number {
  return projects.reduce((sum, project) => sum + getProjectAdvisoryWarningCount(project), 0);
}

interface DoctorWorkspaceCacheEntry {
  schemaVersion: 'doctor-workspace-cache-v2';
  signature: string;
  generatedAt: string;
  projects: ProjectHealth[];
}

type DoctorEvidenceLike = {
  schemaVersion?: string;
  evidenceType?: 'workspace' | 'project';
  generatedAt?: string;
  healthScore?: HealthScore;
  summary?: {
    totalIssues?: number;
  };
  projects?: Array<{ name?: string; path?: string; issues?: number | string[] }>;
  project?: { name?: string; path?: string; issues?: number | string[] };
  system?: {
    python?: HealthCheckResult;
    poetry?: HealthCheckResult;
    pipx?: HealthCheckResult;
    go?: HealthCheckResult;
    rapidkitCore?: HealthCheckResult;
  };
};

const DOCTOR_PROJECT_SCAN_SCHEMA = 'doctor-project-scan-v2';
const DOCTOR_WORKSPACE_CACHE_SCHEMA = 'doctor-workspace-cache-v2';
const DOCTOR_CONTRACT_METADATA: DoctorContractMetadata = Object.freeze({
  version: 'doctor-evidence-v1',
  scoringPolicyVersion: 'doctor-score-policy-v1',
  generatedBy: 'rapidkit-npm',
  deterministicScoreBreakdown: true,
  scopeModel: 'workspace-aggregate-or-project-scoped',
});

function getDoctorContractMetadata(): DoctorContractMetadata {
  return { ...DOCTOR_CONTRACT_METADATA };
}

function toHealthPercent(score: HealthScore | undefined): number | null {
  if (!score || score.total <= 0) {
    return null;
  }
  return Math.round((score.passed / score.total) * 100);
}

function getIssueCountFromEvidenceValue(value: number | string[] | undefined): number {
  if (typeof value === 'number') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.length;
  }
  return 0;
}

async function readDoctorEvidenceIfPresent(
  filePath: string,
  expectedType?: 'workspace' | 'project'
): Promise<DoctorEvidenceLike | null> {
  try {
    if (!(await fsExtra.pathExists(filePath))) {
      return null;
    }
    const payload = await fsExtra.readJSON(filePath);
    if (!isDoctorEvidencePayloadCompatible(payload, expectedType)) {
      return null;
    }

    return payload as DoctorEvidenceLike;
  } catch {
    return null;
  }
}

function collectSystemStatusChanges(
  previous: DoctorEvidenceLike | null,
  current: {
    python: HealthCheckResult;
    poetry: HealthCheckResult;
    pipx: HealthCheckResult;
    go: HealthCheckResult;
    rapidkitCore: HealthCheckResult;
  }
): DoctorDriftDelta['systemStatusChanges'] {
  if (!previous?.system) {
    return [];
  }

  const pairs: Array<{
    id: DoctorDriftDelta['systemStatusChanges'][number]['id'];
    current: HealthCheckResult;
  }> = [
    { id: 'python', current: current.python },
    { id: 'poetry', current: current.poetry },
    { id: 'pipx', current: current.pipx },
    { id: 'go', current: current.go },
    { id: 'rapidkitCore', current: current.rapidkitCore },
  ];

  const changes: DoctorDriftDelta['systemStatusChanges'] = [];
  for (const pair of pairs) {
    const previousStatus = previous.system?.[pair.id]?.status;
    if (!previousStatus || previousStatus === pair.current.status) {
      continue;
    }
    changes.push({
      id: pair.id,
      from: previousStatus,
      to: pair.current.status,
    });
  }

  return changes;
}

function buildWorkspaceDriftDelta(
  previous: DoctorEvidenceLike | null,
  health: WorkspaceHealth
): DoctorDriftDelta {
  const currentIssuesByProject = new Map<string, number>();
  for (const project of health.projects) {
    currentIssuesByProject.set(project.path || project.name, project.issues.length);
  }

  if (!previous) {
    return {
      baselineAvailable: false,
      newIssueCount: 0,
      resolvedIssueCount: 0,
      netIssueDelta: 0,
      scoreDeltaPercent: null,
      systemStatusChanges: [],
      regressedProjects: [],
      improvedProjects: [],
    };
  }

  const previousProjects = Array.isArray(previous.projects) ? previous.projects : [];
  const previousIssuesByProject = new Map<string, number>();
  for (const project of previousProjects) {
    const projectKey = project.path || project.name;
    if (!projectKey) {
      continue;
    }
    previousIssuesByProject.set(projectKey, getIssueCountFromEvidenceValue(project.issues));
  }

  let newIssueCount = 0;
  let resolvedIssueCount = 0;
  const regressedProjects = new Set<string>();
  const improvedProjects = new Set<string>();
  const allProjectKeys = new Set<string>([
    ...Array.from(previousIssuesByProject.keys()),
    ...Array.from(currentIssuesByProject.keys()),
  ]);

  for (const projectKey of allProjectKeys) {
    const prevIssues = previousIssuesByProject.get(projectKey) ?? 0;
    const currIssues = currentIssuesByProject.get(projectKey) ?? 0;
    if (currIssues > prevIssues) {
      newIssueCount += currIssues - prevIssues;
      regressedProjects.add(projectKey);
    } else if (currIssues < prevIssues) {
      resolvedIssueCount += prevIssues - currIssues;
      improvedProjects.add(projectKey);
    }
  }

  const previousPercent = toHealthPercent(previous.healthScore);
  const currentPercent = toHealthPercent(health.healthScore);

  return {
    baselineAvailable: true,
    previousGeneratedAt: previous.generatedAt,
    newIssueCount,
    resolvedIssueCount,
    netIssueDelta: newIssueCount - resolvedIssueCount,
    scoreDeltaPercent:
      previousPercent === null || currentPercent === null ? null : currentPercent - previousPercent,
    systemStatusChanges: collectSystemStatusChanges(previous, {
      python: health.python,
      poetry: health.poetry,
      pipx: health.pipx,
      go: health.go,
      rapidkitCore: health.rapidkitCore,
    }),
    regressedProjects: Array.from(regressedProjects).sort(),
    improvedProjects: Array.from(improvedProjects).sort(),
  };
}

function buildProjectDriftDelta(
  previous: DoctorEvidenceLike | null,
  envelope: ProjectHealthEnvelope
): DoctorDriftDelta {
  if (!previous) {
    return {
      baselineAvailable: false,
      newIssueCount: 0,
      resolvedIssueCount: 0,
      netIssueDelta: 0,
      scoreDeltaPercent: null,
      systemStatusChanges: [],
      regressedProjects: [],
      improvedProjects: [],
    };
  }

  const previousProjectIssueCount = getIssueCountFromEvidenceValue(previous.project?.issues);
  const currentProjectIssueCount = envelope.project.issues.length;
  const newIssueCount = Math.max(currentProjectIssueCount - previousProjectIssueCount, 0);
  const resolvedIssueCount = Math.max(previousProjectIssueCount - currentProjectIssueCount, 0);

  const previousPercent = toHealthPercent(previous.healthScore);
  const currentPercent = toHealthPercent(envelope.healthScore);
  const projectKey = envelope.project.path || envelope.project.name;

  return {
    baselineAvailable: true,
    previousGeneratedAt: previous.generatedAt,
    newIssueCount,
    resolvedIssueCount,
    netIssueDelta: newIssueCount - resolvedIssueCount,
    scoreDeltaPercent:
      previousPercent === null || currentPercent === null ? null : currentPercent - previousPercent,
    systemStatusChanges: collectSystemStatusChanges(previous, {
      python: envelope.python,
      poetry: envelope.poetry,
      pipx: envelope.pipx,
      go: envelope.go,
      rapidkitCore: envelope.rapidkitCore,
    }),
    regressedProjects: newIssueCount > 0 ? [projectKey] : [],
    improvedProjects: resolvedIssueCount > 0 ? [projectKey] : [],
  };
}

function buildScopeProvenanceSummary(
  scoreBreakdown: ScoreBreakdownItem[] | undefined
): ScopeProvenanceSummary {
  const breakdown = scoreBreakdown ?? [];
  let scopedCount = 0;
  let aggregatedCount = 0;

  for (const item of breakdown) {
    if (item.scope === 'project-scoped') {
      scopedCount += 1;
      continue;
    }
    if (item.scope === 'workspace-aggregate' || item.scope === 'host-system') {
      aggregatedCount += 1;
    }
  }

  const mixedCount = scopedCount > 0 && aggregatedCount > 0 ? 1 : 0;
  const dominantScope =
    mixedCount > 0
      ? 'mixed'
      : scopedCount > 0
        ? 'scoped'
        : aggregatedCount > 0
          ? 'aggregated'
          : 'unknown';

  return {
    scopedCount,
    aggregatedCount,
    mixedCount,
    dominantScope,
  };
}

function buildProjectFixCommand(projectPath: string, command: string): string {
  if (isWindowsPlatform()) {
    return `cd "${projectPath}"; ${command}`;
  }
  return `cd ${projectPath} && ${command}`;
}

function buildEnvCopyFixCommand(projectPath: string): string {
  if (isWindowsPlatform()) {
    return buildProjectFixCommand(projectPath, 'Copy-Item .env.example .env');
  }
  return buildProjectFixCommand(projectPath, 'cp .env.example .env');
}

function supportTierForFramework(framework: DetectedFramework): FrameworkSupportTier {
  if (framework === 'FastAPI' || framework === 'NestJS') {
    return 'first-class';
  }

  if (
    framework === 'Django' ||
    framework === 'Flask' ||
    framework === 'Express' ||
    framework === 'Fastify' ||
    framework === 'Koa' ||
    framework === 'Go/Fiber' ||
    framework === 'Go/Gin' ||
    framework === 'Spring Boot' ||
    framework === 'Rust' ||
    framework === 'Phoenix' ||
    framework === 'Elixir' ||
    framework === 'Clojure' ||
    framework === 'Scala' ||
    framework === 'Kotlin' ||
    framework === 'Deno' ||
    framework === 'Bun' ||
    framework === 'PHP' ||
    framework === 'Laravel' ||
    framework === 'Ruby' ||
    framework === 'Ruby on Rails' ||
    framework === 'ASP.NET'
  ) {
    return 'extended';
  }

  return 'observed';
}

function kindForFramework(framework: DetectedFramework): ProjectKind {
  if (
    framework === 'Next.js' ||
    framework === 'Remix' ||
    framework === 'Nuxt' ||
    framework === 'React' ||
    framework === 'Vue' ||
    framework === 'Angular' ||
    framework === 'SvelteKit' ||
    framework === 'Svelte' ||
    framework === 'Vite' ||
    framework === 'Astro' ||
    framework === 'Solid'
  ) {
    return 'frontend';
  }

  if (framework === 'Unknown' || framework === 'Node.js' || framework === 'Python') {
    return 'generic';
  }

  return 'backend';
}

function runtimeForFramework(framework: DetectedFramework): ProjectRuntimeFamily {
  if (
    framework === 'NestJS' ||
    framework === 'Next.js' ||
    framework === 'Remix' ||
    framework === 'Nuxt' ||
    framework === 'React' ||
    framework === 'Vue' ||
    framework === 'Angular' ||
    framework === 'SvelteKit' ||
    framework === 'Svelte' ||
    framework === 'Vite' ||
    framework === 'Astro' ||
    framework === 'Solid' ||
    framework === 'Bun' ||
    framework === 'Express' ||
    framework === 'Fastify' ||
    framework === 'Koa' ||
    framework === 'Node.js'
  ) {
    return 'node';
  }

  if (
    framework === 'FastAPI' ||
    framework === 'Django' ||
    framework === 'Flask' ||
    framework === 'Python'
  ) {
    return 'python';
  }

  if (framework === 'Go/Fiber' || framework === 'Go/Gin') {
    return 'go';
  }

  if (framework === 'Spring Boot') {
    return 'java';
  }

  if (framework === 'Rust') {
    return 'rust';
  }

  if (framework === 'Elixir' || framework === 'Phoenix') {
    return 'elixir';
  }

  if (framework === 'Clojure') {
    return 'clojure';
  }

  if (framework === 'Deno') {
    return 'deno';
  }

  if (framework === 'Laravel' || framework === 'PHP') {
    return 'php';
  }

  if (framework === 'Ruby on Rails' || framework === 'Ruby') {
    return 'ruby';
  }

  if (framework === 'ASP.NET') {
    return 'dotnet';
  }

  return 'unknown';
}

function applyCommandCapabilities(projectHealth: ProjectHealth, projectPath: string): void {
  const capabilities = resolveProjectCommandCapabilities(projectPath);
  projectHealth.commandCapabilities = capabilities;
  projectHealth.supportTier = capabilities.frameworkSupportTier;
}

function applyFrameworkMetadata(
  health: ProjectHealth,
  framework: DetectedFramework,
  confidence: FrameworkConfidence,
  frameworkKey?: BackendPlatformKey
): void {
  health.framework = framework;
  health.frameworkConfidence = confidence;
  health.supportTier = frameworkKey
    ? getFrameworkSupportTier(frameworkKey)
    : supportTierForFramework(framework);
  health.projectKind = kindForFramework(framework);
  health.runtimeFamily = runtimeForFramework(framework);
}

function toDoctorRuntimeFamily(runtime: BackendRuntimeFamily): ProjectRuntimeFamily {
  if (runtime === 'python') return 'python';
  if (runtime === 'node' || runtime === 'bun') return 'node';
  if (runtime === 'go') return 'go';
  if (runtime === 'java') return 'java';
  if (runtime === 'rust') return 'rust';
  if (runtime === 'elixir') return 'elixir';
  if (runtime === 'clojure') return 'clojure';
  if (runtime === 'deno') return 'deno';
  if (runtime === 'php') return 'php';
  if (runtime === 'ruby') return 'ruby';
  if (runtime === 'dotnet') return 'dotnet';
  return 'unknown';
}

function toDoctorFramework(detection: BackendFrameworkDetection): DetectedFramework {
  switch (detection.key) {
    case 'fastapi':
      return 'FastAPI';
    case 'django':
      return 'Django';
    case 'flask':
      return 'Flask';
    case 'python':
      return 'Python';
    case 'nestjs':
      return 'NestJS';
    case 'nextjs':
      return 'Next.js';
    case 'remix':
      return 'Remix';
    case 'nuxt':
      return 'Nuxt';
    case 'react':
      return 'React';
    case 'vite':
      return 'Vite';
    case 'vue':
      return 'Vue';
    case 'sveltekit':
      return 'SvelteKit';
    case 'svelte':
      return 'Svelte';
    case 'angular':
      return 'Angular';
    case 'astro':
      return 'Astro';
    case 'solid':
      return 'Solid';
    case 'express':
      return 'Express';
    case 'fastify':
      return 'Fastify';
    case 'koa':
      return 'Koa';
    case 'node':
      return 'Node.js';
    case 'gofiber':
      return 'Go/Fiber';
    case 'gogin':
      return 'Go/Gin';
    case 'echo':
      return 'Echo';
    case 'go':
      return 'Go';
    case 'springboot':
      return 'Spring Boot';
    case 'java':
      return 'Java';
    case 'laravel':
      return 'Laravel';
    case 'php':
      return 'PHP';
    case 'rails':
      return 'Ruby on Rails';
    case 'ruby':
      return 'Ruby';
    case 'dotnet':
      return 'ASP.NET';
    case 'phoenix':
      return 'Phoenix';
    case 'elixir':
      return 'Elixir';
    case 'clojure':
      return 'Clojure';
    case 'scala':
      return 'Scala';
    case 'kotlin':
      return 'Kotlin';
    case 'deno':
      return 'Deno';
    case 'bun':
      return 'Bun';
    case 'actix':
    case 'axum':
    case 'rocket':
    case 'rust':
      return 'Rust';
    case 'sinatra':
    case 'symfony':
    case 'unknown':
      return 'Unknown';
    default:
      return 'Unknown';
  }
}

function isGenericBackendDetection(detection: BackendFrameworkDetection): boolean {
  return (
    detection.key === 'python' ||
    detection.key === 'node' ||
    detection.key === 'go' ||
    detection.key === 'java' ||
    detection.key === 'php' ||
    detection.key === 'ruby' ||
    detection.key === 'dotnet' ||
    detection.key === 'rust' ||
    detection.key === 'elixir' ||
    detection.key === 'clojure' ||
    detection.key === 'scala' ||
    detection.key === 'kotlin' ||
    detection.key === 'deno' ||
    detection.key === 'bun' ||
    detection.key === 'unknown'
  );
}

function applyFrontendFrameworkDetection(
  health: ProjectHealth,
  detection: BackendFrameworkDetection
): void {
  health.framework = toDoctorFramework(detection);
  health.frameworkKey = detection.key;
  health.importStack = detection.importStack;
  health.frameworkConfidence = detection.confidence;
  health.supportTier = detection.supportTier;
  health.projectKind = 'frontend';
  health.runtimeFamily = toDoctorRuntimeFamily(detection.runtime);
}

function applyBackendFrameworkDetection(
  health: ProjectHealth,
  detection: BackendFrameworkDetection
): void {
  health.framework = toDoctorFramework(detection);
  health.frameworkKey = detection.key;
  health.importStack = detection.importStack;
  health.frameworkConfidence = detection.confidence;
  health.supportTier = detection.supportTier;
  health.projectKind = isGenericBackendDetection(detection) ? 'generic' : 'backend';
  health.runtimeFamily = toDoctorRuntimeFamily(detection.runtime);
}

function detectNodeFrameworkFromManifest(input: {
  dependencies: Record<string, unknown>;
  scripts?: Record<string, unknown>;
  kitName?: string;
}): { framework: DetectedFramework; confidence: FrameworkConfidence } {
  const deps = input.dependencies;
  const scripts = input.scripts ?? {};
  const kitName = (input.kitName ?? '').toLowerCase();

  const hasDep = (name: string) => Boolean(deps[name]);
  const scriptText = Object.values(scripts)
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  if (hasDep('next') || scriptText.includes('next ')) {
    return { framework: 'Next.js', confidence: 'high' };
  }
  if (hasDep('nuxt') || scriptText.includes('nuxt ')) {
    return { framework: 'Nuxt', confidence: 'high' };
  }
  if (hasDep('@nestjs/core') || kitName.startsWith('nestjs.')) {
    return { framework: 'NestJS', confidence: 'high' };
  }
  if (hasDep('express')) {
    return { framework: 'Express', confidence: 'high' };
  }
  if (hasDep('fastify')) {
    return { framework: 'Fastify', confidence: 'high' };
  }
  if (hasDep('koa')) {
    return { framework: 'Koa', confidence: 'high' };
  }
  if (hasDep('@angular/core')) {
    return { framework: 'Angular', confidence: 'high' };
  }
  if (hasDep('@sveltejs/kit') || scriptText.includes('svelte-kit')) {
    return { framework: 'SvelteKit', confidence: 'high' };
  }
  if (hasDep('vue')) {
    return { framework: 'Vue', confidence: 'medium' };
  }
  if (hasDep('react') && hasDep('react-dom')) {
    return { framework: 'React', confidence: 'medium' };
  }

  return { framework: 'Node.js', confidence: 'low' };
}

async function detectPythonFramework(projectPath: string): Promise<{
  framework: DetectedFramework;
  confidence: FrameworkConfidence;
}> {
  const detection = detectBackendFrameworkFromProject(projectPath);
  if (detection.runtime !== 'python') {
    return { framework: 'Python', confidence: 'low' };
  }

  return {
    framework: toDoctorFramework(detection),
    confidence: detection.confidence,
  };
}

async function statSignature(candidatePath: string): Promise<string> {
  try {
    const stat = await fsExtra.stat(candidatePath);
    return `${path.basename(candidatePath)}:${stat.isDirectory() ? 'd' : 'f'}:${stat.size}:${stat.mtimeMs}`;
  } catch {
    return `${path.basename(candidatePath)}:missing`;
  }
}

async function collectWorkspaceProjectPaths(workspacePath: string): Promise<string[]> {
  try {
    const ignoredDirs = new Set([
      '.git',
      '.venv',
      'node_modules',
      '.rapidkit',
      'dist',
      'build',
      'coverage',
      '__pycache__',
    ]);
    const projectPaths = new Set<string>();

    if (await hasRapidkitProjectMarkers(workspacePath)) {
      projectPaths.add(workspacePath);
    }

    const importedProjects = await readImportedProjectsRegistry(workspacePath);
    for (const importedProject of importedProjects) {
      const projectPath = path.isAbsolute(importedProject.path)
        ? importedProject.path
        : path.join(workspacePath, importedProject.path);
      if (await hasRapidkitProjectMarkers(projectPath)) {
        projectPaths.add(projectPath);
      }
    }

    const scanDirs = async (basePath: string, depth: number) => {
      if (depth < 0) return;
      const dirNames = await listDirectories(basePath);
      for (const dirName of dirNames) {
        if (shouldIgnoreWorkspaceDir(dirName, ignoredDirs)) continue;
        const dirPath = path.join(basePath, dirName);
        if (await hasRapidkitProjectMarkers(dirPath)) {
          projectPaths.add(dirPath);
          continue;
        }

        if (depth > 0) {
          await scanDirs(dirPath, depth - 1);
        }
      }
    };

    await scanDirs(workspacePath, 1);

    if (projectPaths.size === 0) {
      const fallbackProjects = await findRapidkitProjectsDeep(workspacePath, 3, ignoredDirs);
      fallbackProjects.forEach((projectPath) => projectPaths.add(projectPath));
    }

    return Array.from(projectPaths).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

async function buildWorkspaceProjectSignature(
  workspacePath: string,
  projectPaths: string[]
): Promise<string> {
  const workspacePaths = [
    path.join(workspacePath, '.rapidkit-workspace'),
    path.join(workspacePath, '.rapidkit', 'workspace.json'),
    path.join(workspacePath, '.rapidkit', 'imported-projects.json'),
    path.join(workspacePath, '.rapidkit', 'policies.yml'),
    path.join(workspacePath, '.rapidkit', 'toolchain.lock'),
    path.join(workspacePath, '.rapidkit', 'cache-config.yml'),
  ];

  const projectKeyPaths = [
    '.rapidkit/project.json',
    '.rapidkit/context.json',
    '.rapidkit/file-hashes.json',
    'package.json',
    'pyproject.toml',
    'composer.json',
    'Gemfile',
    'Gemfile.lock',
    'go.mod',
    'go.sum',
    'pom.xml',
    'requirements.txt',
    'Dockerfile',
    'Makefile',
    '.env',
    '.env.example',
    'src',
    'modules',
    'tests',
    'test',
    '.venv',
    'node_modules',
  ];

  const workspaceSignature = await Promise.all(workspacePaths.map(statSignature));
  const projectSignatures = await Promise.all(
    projectPaths.map(async (projectPath) => {
      const details = await Promise.all(
        projectKeyPaths.map((relativePath) => statSignature(path.join(projectPath, relativePath)))
      );
      return `${projectPath}::${details.join('|')}`;
    })
  );

  return [DOCTOR_PROJECT_SCAN_SCHEMA, ...workspaceSignature, ...projectSignatures].join('||');
}

async function loadWorkspaceProjectCache(
  cachePath: string,
  signature: string
): Promise<DoctorWorkspaceCacheEntry | null> {
  try {
    if (!(await fsExtra.pathExists(cachePath))) return null;
    const cached = (await fsExtra.readJSON(cachePath)) as DoctorWorkspaceCacheEntry;
    if (!cached || cached.signature !== signature || !Array.isArray(cached.projects)) {
      return null;
    }
    if (
      typeof (cached as { schemaVersion?: unknown }).schemaVersion === 'string' &&
      cached.schemaVersion !== DOCTOR_WORKSPACE_CACHE_SCHEMA
    ) {
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

async function saveWorkspaceProjectCache(
  cachePath: string,
  entry: DoctorWorkspaceCacheEntry
): Promise<void> {
  try {
    await fsExtra.ensureDir(path.dirname(cachePath));
    await fsExtra.writeJSON(cachePath, entry, { spaces: 2 });
  } catch {
    // Non-fatal cache write failure.
  }
}

async function writeDoctorEvidence(
  workspacePath: string,
  health: WorkspaceHealth,
  cachePath: string | null
): Promise<string | undefined> {
  const evidencePath = path.join(workspacePath, '.rapidkit', 'reports', 'doctor-last-run.json');
  try {
    await fsExtra.ensureDir(path.dirname(evidencePath));
    const blockers: string[] = [];
    for (const project of health.projects) {
      for (const issue of project.issues ?? []) {
        if (typeof issue === 'string' && issue.trim()) {
          blockers.push(`${project.name}: ${issue.trim()}`);
        }
      }
    }
    for (const [label, check] of [
      ['python', health.python],
      ['rapidkitCore', health.rapidkitCore],
    ] as const) {
      if (check?.status === 'error') {
        const message = typeof check.message === 'string' ? check.message : `${label} check failed`;
        blockers.push(`${label}: ${message}`);
      }
    }
    await fsExtra.writeJSON(
      evidencePath,
      withGovernanceRunMetadata(
        {
          schemaVersion: DOCTOR_WORKSPACE_EVIDENCE_SCHEMA,
          evidenceType: 'workspace',
          contract: getDoctorContractMetadata(),
          workspacePath,
          workspaceName: health.workspaceName,
          projectScanCached: health.projectScanCached ?? false,
          projectScanSignature: health.projectScanSignature,
          cachePath,
          healthScore: health.healthScore,
          system: {
            python: health.python,
            poetry: health.poetry,
            pipx: health.pipx,
            go: health.go,
            rapidkitCore: health.rapidkitCore,
            versions: {
              core: health.coreVersion,
              npm: health.npmVersion,
            },
          },
          projects: health.projects,
          summary: {
            totalProjects: health.projects.length,
            totalIssues: health.projects.reduce((sum, p) => sum + p.issues.length, 0),
            projectAdvisoryWarningProjects: countProjectAdvisoryWarningProjects(health.projects),
            projectAdvisoryWarnings: countProjectAdvisoryWarnings(health.projects),
            hasSystemErrors: [health.python, health.rapidkitCore].some((c) => c.status === 'error'),
            scopeProvenance: health.scopeProvenance,
          },
          driftDelta: health.driftDelta,
          scoreBreakdown: health.scoreBreakdown ?? [],
        },
        {
          commandId: 'checkWorkspaceHealth',
          exitCode: computeDoctorGateExitCode(health.healthScore, {}),
          generatedAt: new Date().toISOString(),
          blockers: blockers.slice(0, 12),
          runId: resolveGovernanceRunId(),
        }
      ),
      { spaces: 2 }
    );
    return evidencePath;
  } catch {
    return undefined;
  }
}

async function collectSystemChecks(): Promise<{
  python: HealthCheckResult;
  poetry: HealthCheckResult;
  pipx: HealthCheckResult;
  go: HealthCheckResult;
  rapidkitCore: HealthCheckResult;
}> {
  const [python, poetry, pipx, go, rapidkitCore] = await Promise.all([
    checkPython(),
    checkPoetry(),
    checkPipx(),
    checkGo(),
    checkRapidKitCore(),
  ]);

  return { python, poetry, pipx, go, rapidkitCore };
}

async function checkPython(): Promise<HealthCheckResult> {
  const pythonCommands = getPythonCommandCandidates();

  for (const cmd of pythonCommands) {
    try {
      const { stdout } = await execa(cmd, ['--version'], { timeout: 3000 });
      const match = stdout.match(/Python (\d+\.\d+\.\d+)/);
      if (match) {
        const version = match[1];
        const [major, minor] = version.split('.').map(Number);

        if (major < 3 || (major === 3 && minor < 10)) {
          return {
            status: 'warn',
            message: `Python ${version} (requires 3.10+)`,
            details: `${cmd} found but version is below minimum requirement`,
          };
        }

        return {
          status: 'ok',
          message: `Python ${version}`,
          details: `Using ${cmd}`,
        };
      }
    } catch {
      continue;
    }
  }

  return {
    status: 'error',
    message: 'Python not found',
    details: "Install Python 3.10+ and ensure it's in PATH",
  };
}

async function checkPoetry(): Promise<HealthCheckResult> {
  try {
    const { stdout } = await execa('poetry', ['--version'], { timeout: 3000 });
    const match = stdout.match(/Poetry .*version ([\d.]+)/);
    if (match) {
      return {
        status: 'ok',
        message: `Poetry ${match[1]}`,
        details: 'Available for dependency management',
      };
    }
    return { status: 'warn', message: 'Poetry version unknown' };
  } catch {
    const candidates = getPythonCommandCandidates().map((cmd) => ({
      cmd,
      args: cmd === 'py' ? ['-3', '-m', 'poetry', '--version'] : ['-m', 'poetry', '--version'],
    }));

    for (const candidate of candidates) {
      try {
        const { stdout } = await execa(candidate.cmd, candidate.args, {
          timeout: 3000,
          shell: shouldUseShellExecution(),
        });
        const match = stdout.match(/Poetry .*version ([\d.]+)/) || stdout.match(/([\d.]+)/);
        return {
          status: 'ok',
          message: match?.[1] ? `Poetry ${match[1]}` : 'Poetry detected',
          details: `Available via ${candidate.cmd} ${candidate.args.join(' ')}`,
        };
      } catch {
        continue;
      }
    }

    for (const poetryPath of getPoetryPathCandidates()) {
      try {
        if (!(await fsExtra.pathExists(poetryPath))) {
          continue;
        }
        const { stdout } = await execa(poetryPath, ['--version'], {
          timeout: 3000,
          shell: shouldUseShellExecution(),
        });
        const match = stdout.match(/Poetry .*version ([\d.]+)/) || stdout.match(/([\d.]+)/);
        return {
          status: 'ok',
          message: match?.[1] ? `Poetry ${match[1]}` : 'Poetry detected',
          details: `Available at ${poetryPath}`,
        };
      } catch {
        continue;
      }
    }

    return {
      status: 'warn',
      message: 'Poetry not installed',
      details: 'Optional: Install for better dependency management',
    };
  }
}

async function checkPipx(): Promise<HealthCheckResult> {
  try {
    const { stdout } = await execa('pipx', ['--version'], { timeout: 3000 });
    const version = stdout.trim();
    return {
      status: 'ok',
      message: `pipx ${version}`,
      details: 'Available for global tool installation',
    };
  } catch {
    const pythonCandidates = getPythonCommandCandidates();
    for (const cmd of pythonCandidates) {
      try {
        const args = cmd === 'py' ? ['-3', '-m', 'pipx', '--version'] : ['-m', 'pipx', '--version'];
        const { stdout } = await execa(cmd, args, {
          timeout: 3000,
          shell: shouldUseShellExecution(),
        });
        const version = stdout.trim();
        return {
          status: 'ok',
          message: `pipx ${version}`,
          details: `Available via ${cmd} ${args.join(' ')}`,
        };
      } catch {
        continue;
      }
    }

    return {
      status: 'warn',
      message: 'pipx not installed',
      details: 'Optional: Install for isolated Python tools',
    };
  }
}

async function checkGo(): Promise<HealthCheckResult> {
  try {
    const { stdout } = await execa('go', ['version'], { timeout: 3000 });
    // e.g. "go version go1.24.0 linux/amd64"
    const match = stdout.match(/go version go(\d+\.\d+(?:\.\d+)?)/);
    if (match) {
      return {
        status: 'ok',
        message: `Go ${match[1]}`,
        details: 'Available for Go/Fiber and Go/Gin projects',
      };
    }
    return { status: 'ok', message: 'Go (version unknown)', details: 'go found in PATH' };
  } catch {
    return {
      status: 'warn',
      message: 'Go not installed',
      details:
        'Optional: Required only for gofiber.standard / gogin.standard projects — https://go.dev/dl/',
    };
  }
}

async function checkRapidKitCore(): Promise<HealthCheckResult> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const foundPaths: { location: string; path: string; version: string }[] = [];

  const candidates = getRapidkitBinaryCandidates(homeDir);

  // Check all paths
  for (const { location, path: rapidkitPath } of candidates) {
    try {
      if (await fsExtra.pathExists(rapidkitPath)) {
        const { stdout, exitCode } = await execa(rapidkitPath, ['--version'], {
          timeout: 3000,
          reject: false,
        });

        if (
          exitCode === 0 &&
          (stdout.includes('RapidKit Version') || stdout.includes('RapidKit'))
        ) {
          const versionMatch = stdout.match(/v?([\d.]+(?:rc\d+)?(?:a\d+)?(?:b\d+)?)/);
          if (versionMatch) {
            foundPaths.push({ location, path: rapidkitPath, version: versionMatch[1] });
          }
        }
      }
    } catch {
      continue;
    }
  }

  // If found installations, return them
  if (foundPaths.length > 0) {
    const installedPackagePaths = foundPaths.filter((f) => f.location !== 'Workspace (launcher)');

    if (installedPackagePaths.length > 0) {
      const sortedInstalledPaths = sortRapidkitInstalledPaths(installedPackagePaths);
      const primaryVersion = sortedInstalledPaths[0].version;
      const hasWorkspaceVenvInstall = sortedInstalledPaths.some(
        (entry) => entry.location === 'Workspace (.venv)'
      );
      const hasGlobalInstall = sortedInstalledPaths.some((entry) =>
        entry.location.startsWith('Global (')
      );

      const workspaceVenvAdvisory =
        !hasWorkspaceVenvInstall && hasGlobalInstall
          ? 'Workspace (.venv): not installed (optional). For best project-level performance and isolation, run npx rapidkit workspace run init inside this workspace.'
          : undefined;

      return {
        status: 'ok',
        message: `RapidKit Core ${primaryVersion}`,
        details: workspaceVenvAdvisory,
        paths: sortedInstalledPaths.map((f) => ({
          location: f.location,
          path: f.path,
          version: f.version,
        })),
      };
    }

    const launcherVersion = foundPaths[0].version;
    return {
      status: 'ok',
      message: `RapidKit Core ${launcherVersion}`,
      details: 'Detected via workspace launcher',
    };
  }

  // Try checking via PATH
  try {
    const { stdout, exitCode } = await execa('rapidkit', ['--version'], {
      timeout: 3000,
      reject: false,
    });

    if (exitCode === 0 && (stdout.includes('RapidKit Version') || stdout.includes('RapidKit'))) {
      const versionMatch = stdout.match(/v?([\d.]+(?:rc\d+)?(?:a\d+)?(?:b\d+)?)/);
      if (versionMatch) {
        return {
          status: 'ok',
          message: `RapidKit Core ${versionMatch[1]}`,
          details: 'Available via PATH',
        };
      }
    }
  } catch {
    // Not in PATH
  }

  // Try Poetry environment
  try {
    const { stdout, exitCode } = await execa('poetry', ['run', 'rapidkit', '--version'], {
      timeout: 3000,
      reject: false,
    });

    if (exitCode === 0 && (stdout.includes('RapidKit Version') || stdout.includes('RapidKit'))) {
      const versionMatch = stdout.match(/v?([\d.]+(?:rc\d+)?(?:a\d+)?(?:b\d+)?)/);
      if (versionMatch) {
        return {
          status: 'ok',
          message: `RapidKit Core ${versionMatch[1]}`,
          details: 'Available via Poetry',
        };
      }
    }
  } catch {
    // Poetry not available
  }

  // Try Python module import (last resort)
  const pythonCommands = getPythonCommandCandidates();
  for (const cmd of pythonCommands) {
    try {
      const { stdout, exitCode } = await execa(
        cmd,
        ['-c', 'import rapidkit_core; print(rapidkit_core.__version__)'],
        { timeout: 3000, reject: false }
      );

      if (
        exitCode === 0 &&
        stdout &&
        !stdout.includes('Traceback') &&
        !stdout.includes('ModuleNotFoundError')
      ) {
        const version = stdout.trim();
        if (version) {
          return {
            status: 'ok',
            message: `RapidKit Core ${version}`,
            details: `Available in ${cmd} environment`,
          };
        }
      }
    } catch {
      continue;
    }
  }

  return {
    status: 'error',
    message: 'RapidKit Core not installed',
    details: 'Install with: pipx install rapidkit-core',
  };
}

async function performCommonChecks(
  projectPath: string,
  health: ProjectHealth,
  packageJsonData?: Record<string, unknown> | null
): Promise<void> {
  // Docker check
  const dockerfilePath = path.join(projectPath, 'Dockerfile');
  health.hasDocker = await fsExtra.pathExists(dockerfilePath);

  // Tests check
  const testsPath = path.join(projectPath, 'tests');
  const testPath = path.join(projectPath, 'test');
  const srcTestPath = path.join(projectPath, 'src', 'test');
  const hasTestDir =
    (await fsExtra.pathExists(testsPath)) ||
    (await fsExtra.pathExists(testPath)) ||
    (await fsExtra.pathExists(srcTestPath));

  // Go: tests are *_test.go files anywhere in the project tree
  let hasGoTests = false;
  if (health.framework === 'Go/Fiber' || health.framework === 'Go/Gin') {
    try {
      const queue: Array<{ dir: string; depth: number }> = [{ dir: projectPath, depth: 0 }];
      const maxDepth = 4;
      const ignoredDirs = new Set(['.git', '.venv', 'node_modules', 'dist', 'build', 'vendor']);

      while (queue.length > 0 && !hasGoTests) {
        const current = queue.shift();
        if (!current) break;

        let entries: string[] = [];
        try {
          entries = await fsExtra.readdir(current.dir);
        } catch {
          continue;
        }

        for (const entry of entries) {
          const fullPath = path.join(current.dir, entry);
          let stat;
          try {
            stat = await fsExtra.stat(fullPath);
          } catch {
            continue;
          }

          if (stat.isFile() && entry.endsWith('_test.go')) {
            hasGoTests = true;
            break;
          }

          if (
            stat.isDirectory() &&
            current.depth < maxDepth &&
            !ignoredDirs.has(entry) &&
            !entry.startsWith('.')
          ) {
            queue.push({ dir: fullPath, depth: current.depth + 1 });
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  health.hasTests = hasTestDir || hasGoTests;
  if (health.runtimeFamily === 'node' && !health.hasTests) {
    health.hasTests = await detectNodeTestSurface(projectPath, packageJsonData);
  }

  // Code Quality checks
  if (health.runtimeFamily === 'node') {
    health.hasCodeQuality = await detectNodeEslintConfigured(projectPath, packageJsonData);
  } else if (health.framework === 'Go/Fiber' || health.framework === 'Go/Gin') {
    // golangci-lint config or Makefile with lint target
    const golangciPath = path.join(projectPath, '.golangci.yml');
    const golangciYaml = path.join(projectPath, '.golangci.yaml');
    const makefilePath = path.join(projectPath, 'Makefile');
    const hasMakefileLint =
      (await fsExtra.pathExists(makefilePath)) &&
      (await fsExtra.readFile(makefilePath, 'utf8')).includes('golangci-lint');
    health.hasCodeQuality =
      (await fsExtra.pathExists(golangciPath)) ||
      (await fsExtra.pathExists(golangciYaml)) ||
      hasMakefileLint;
  } else if (health.runtimeFamily === 'python') {
    // Ruff for Python runtimes
    const ruffPath = path.join(projectPath, 'ruff.toml');
    const pyprojectPath = path.join(projectPath, 'pyproject.toml');

    if (await fsExtra.pathExists(pyprojectPath)) {
      try {
        const content = await fsExtra.readFile(pyprojectPath, 'utf8');
        health.hasCodeQuality =
          content.includes('[tool.ruff]') || (await fsExtra.pathExists(ruffPath));
      } catch {
        health.hasCodeQuality = await fsExtra.pathExists(ruffPath);
      }
    }
  } else if (health.framework === 'Spring Boot') {
    const pomXmlPath = path.join(projectPath, 'pom.xml');
    if (await fsExtra.pathExists(pomXmlPath)) {
      try {
        const content = await fsExtra.readFile(pomXmlPath, 'utf8');
        health.hasCodeQuality =
          content.includes('spotless') ||
          content.includes('checkstyle') ||
          content.includes('pmd') ||
          content.includes('maven-enforcer-plugin');
      } catch {
        health.hasCodeQuality = false;
      }
    }
  }

  // Security check - try to detect vulnerabilities
  try {
    if (health.runtimeFamily === 'node') {
      const { stdout } = await execa('npm', ['audit', '--json'], {
        cwd: projectPath,
        reject: false,
      });

      if (stdout) {
        try {
          const audit = JSON.parse(stdout);
          const vulns = audit.metadata?.vulnerabilities;
          if (vulns) {
            health.vulnerabilities =
              (vulns.high || 0) + (vulns.critical || 0) + (vulns.moderate || 0);
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
    } else if (health.runtimeFamily === 'python') {
      // Check for safety or pip-audit
      const venvPath = path.join(projectPath, '.venv');
      const pythonPath = getVenvPythonPath(venvPath);

      if (await fsExtra.pathExists(pythonPath)) {
        try {
          const { stdout } = await execa(pythonPath, ['-m', 'pip', 'list', '--format=json'], {
            timeout: 5000,
            reject: false,
          });

          if (stdout) {
            const packages = JSON.parse(stdout);
            void packages; // Placeholder for future pip-audit integration
            // Simple heuristic: flag if there are very old core packages
            // In reality, you'd use safety or pip-audit here
            health.vulnerabilities = 0; // Placeholder
          }
        } catch {
          // Ignore if can't check
        }
      }
    }
  } catch {
    // Ignore security check errors
  }
}

function pushProjectProbe(health: ProjectHealth, probe: ProjectProbeResult): void {
  if (!health.probes) {
    health.probes = [];
  }
  health.probes.push(probe);
}

async function appendRuntimeAdapterProbes(
  projectPath: string,
  health: ProjectHealth
): Promise<void> {
  const runtime = health.runtimeFamily || 'unknown';
  const isBackend = health.projectKind === 'backend' || health.projectKind === 'generic';
  if (!isBackend) {
    return;
  }

  if (runtime === 'node') {
    const lockExists =
      (await fsExtra.pathExists(path.join(projectPath, 'package-lock.json'))) ||
      (await fsExtra.pathExists(path.join(projectPath, 'pnpm-lock.yaml'))) ||
      (await fsExtra.pathExists(path.join(projectPath, 'yarn.lock')));
    pushProjectProbe(health, {
      id: 'adapter-node-lockfile-integrity',
      label: 'Node adapter lockfile integrity',
      status: lockExists ? 'pass' : 'warn',
      severity: 'warn',
      scope: 'project-scoped',
      reason: lockExists
        ? 'Node lockfile detected for deterministic dependency restore.'
        : 'No Node lockfile detected (package-lock/yarn.lock/pnpm-lock.yaml).',
      recommendation: lockExists
        ? undefined
        : 'Commit a lockfile for deterministic installs and CI parity.',
    });

    const bootEntryExists =
      (await fsExtra.pathExists(path.join(projectPath, 'src/main.ts'))) ||
      (await fsExtra.pathExists(path.join(projectPath, 'src/main.js'))) ||
      (await fsExtra.pathExists(path.join(projectPath, 'src/server.ts'))) ||
      (await fsExtra.pathExists(path.join(projectPath, 'src/server.js')));
    pushProjectProbe(health, {
      id: 'adapter-node-boot-entrypoint',
      label: 'Node adapter boot entrypoint',
      status: bootEntryExists ? 'pass' : 'warn',
      severity: 'warn',
      scope: 'project-scoped',
      reason: bootEntryExists
        ? 'Boot entrypoint markers detected for service startup path.'
        : 'No canonical Node boot entrypoint markers detected.',
      recommendation: bootEntryExists
        ? undefined
        : 'Define and document service bootstrap entrypoint (main/server).',
    });
    return;
  }

  if (runtime === 'python') {
    const lockExists =
      (await fsExtra.pathExists(path.join(projectPath, 'poetry.lock'))) ||
      (await fsExtra.pathExists(path.join(projectPath, 'requirements.txt'))) ||
      (await fsExtra.pathExists(path.join(projectPath, 'uv.lock')));
    pushProjectProbe(health, {
      id: 'adapter-python-lockfile-integrity',
      label: 'Python adapter dependency integrity',
      status: lockExists ? 'pass' : 'warn',
      severity: 'warn',
      scope: 'project-scoped',
      reason: lockExists
        ? 'Python dependency contract file detected.'
        : 'No Python dependency contract file detected (poetry.lock/requirements/uv.lock).',
      recommendation: lockExists
        ? undefined
        : 'Pin dependency contract for deterministic setup and reproducible CI.',
    });

    const bootEntryExists =
      (await fsExtra.pathExists(path.join(projectPath, 'app/main.py'))) ||
      (await fsExtra.pathExists(path.join(projectPath, 'main.py'))) ||
      (await fsExtra.pathExists(path.join(projectPath, 'manage.py')));
    pushProjectProbe(health, {
      id: 'adapter-python-boot-entrypoint',
      label: 'Python adapter boot entrypoint',
      status: bootEntryExists ? 'pass' : 'warn',
      severity: 'warn',
      scope: 'project-scoped',
      reason: bootEntryExists
        ? 'Python application entrypoint markers detected.'
        : 'No Python application entrypoint markers detected.',
      recommendation: bootEntryExists
        ? undefined
        : 'Expose explicit app/main entrypoint for deterministic boot probes.',
    });
    return;
  }

  if (runtime === 'java') {
    const buildWrapperExists =
      (await fsExtra.pathExists(path.join(projectPath, 'mvnw'))) ||
      (await fsExtra.pathExists(path.join(projectPath, 'gradlew')));
    pushProjectProbe(health, {
      id: 'adapter-java-build-wrapper',
      label: 'Java adapter build wrapper',
      status: buildWrapperExists ? 'pass' : 'warn',
      severity: 'warn',
      scope: 'project-scoped',
      reason: buildWrapperExists
        ? 'Build wrapper detected (mvnw/gradlew).'
        : 'No Java build wrapper detected.',
      recommendation: buildWrapperExists
        ? undefined
        : 'Commit mvnw or gradlew for reproducible enterprise pipelines.',
    });
    return;
  }

  if (runtime === 'go') {
    const goSumExists = await fsExtra.pathExists(path.join(projectPath, 'go.sum'));
    pushProjectProbe(health, {
      id: 'adapter-go-module-integrity',
      label: 'Go adapter module integrity',
      status: goSumExists ? 'pass' : 'warn',
      severity: 'warn',
      scope: 'project-scoped',
      reason: goSumExists
        ? 'go.sum detected for deterministic module verification.'
        : 'go.sum missing; module integrity baseline is incomplete.',
      recommendation: goSumExists
        ? undefined
        : 'Generate and commit go.sum in the repository baseline.',
    });
  }
}

type CustomDoctorAdapterCheck = {
  id?: string;
  label?: string;
  severity?: 'info' | 'warn' | 'error';
  runtimes?: ProjectRuntimeFamily[];
  anyOfPaths?: string[];
  allOfPaths?: string[];
  recommendation?: string;
  passReason?: string;
  failReason?: string;
};

async function appendCustomAdapterChecks(
  projectPath: string,
  health: ProjectHealth
): Promise<void> {
  const candidates = [
    path.join(projectPath, '.rapidkit', 'doctor.adapters.json'),
    path.join(projectPath, 'doctor.adapters.json'),
  ];

  for (const candidatePath of candidates) {
    if (!(await fsExtra.pathExists(candidatePath))) {
      continue;
    }

    try {
      const raw = (await fsExtra.readJSON(candidatePath)) as {
        checks?: CustomDoctorAdapterCheck[];
      };
      const checks = Array.isArray(raw?.checks) ? raw.checks : [];

      for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index] || {};
        const configuredRuntimes = Array.isArray(check.runtimes) ? check.runtimes : [];
        if (
          configuredRuntimes.length > 0 &&
          !configuredRuntimes.includes(health.runtimeFamily || 'unknown')
        ) {
          continue;
        }

        const id =
          typeof check.id === 'string' && check.id.trim().length > 0
            ? check.id.trim()
            : `adapter-check-${index + 1}`;
        const label =
          typeof check.label === 'string' && check.label.trim().length > 0
            ? check.label.trim()
            : id;
        const severity = check.severity || 'warn';
        const anyOfPaths = Array.isArray(check.anyOfPaths) ? check.anyOfPaths.filter(Boolean) : [];
        const allOfPaths = Array.isArray(check.allOfPaths) ? check.allOfPaths.filter(Boolean) : [];

        let passAny = anyOfPaths.length === 0;
        for (const p of anyOfPaths) {
          if (await fsExtra.pathExists(path.join(projectPath, p))) {
            passAny = true;
            break;
          }
        }

        let passAll = true;
        for (const p of allOfPaths) {
          if (!(await fsExtra.pathExists(path.join(projectPath, p)))) {
            passAll = false;
            break;
          }
        }

        const passed = passAny && passAll;
        pushProjectProbe(health, {
          id,
          label,
          status: passed ? 'pass' : severity === 'error' ? 'fail' : 'warn',
          severity,
          scope: 'project-scoped',
          reason: passed
            ? check.passReason || 'Custom adapter contract satisfied.'
            : check.failReason ||
              `Custom adapter check failed from ${path.basename(candidatePath)}.`,
          recommendation: check.recommendation,
        });
      }
    } catch {
      pushProjectProbe(health, {
        id: 'custom-adapter-config',
        label: 'Custom doctor adapter configuration',
        status: 'warn',
        severity: 'warn',
        scope: 'project-scoped',
        reason: `Failed to parse ${path.basename(candidatePath)}.`,
        recommendation: 'Fix JSON syntax in doctor.adapters.json to re-enable adapter checks.',
      });
    }
  }
}

async function appendBuiltInBackendProbes(
  projectPath: string,
  health: ProjectHealth
): Promise<void> {
  const isBackend = health.projectKind === 'backend' || health.projectKind === 'generic';
  if (!isBackend) {
    return;
  }

  const envPath = path.join(projectPath, '.env');
  const envExamplePath = path.join(projectPath, '.env.example');
  const hasConfigSurface =
    (await fsExtra.pathExists(envPath)) ||
    (await fsExtra.pathExists(envExamplePath)) ||
    (await fsExtra.pathExists(path.join(projectPath, 'config')));
  pushProjectProbe(health, {
    id: 'config-surface',
    label: 'Configuration contract surface',
    status: hasConfigSurface ? 'pass' : 'warn',
    severity: 'warn',
    scope: 'project-scoped',
    reason: hasConfigSurface
      ? 'Configuration artifacts detected (.env/.env.example/config).'
      : 'No explicit configuration contract artifacts detected.',
    recommendation: hasConfigSurface
      ? undefined
      : 'Add .env.example or explicit config contract documentation for deterministic setup.',
  });

  const migrationMarkersByRuntime: Record<ProjectRuntimeFamily, string[]> = {
    python: ['alembic.ini', 'migrations', 'versions'],
    node: ['prisma/schema.prisma', 'migrations', 'typeorm.config.ts', 'typeorm.config.js'],
    go: ['migrations', 'db/migrations'],
    java: ['src/main/resources/db/migration', 'src/main/resources/liquibase'],
    rust: ['migrations', 'sqlx-data.json'],
    elixir: ['priv/repo/migrations'],
    clojure: ['resources/migrations', 'migrations'],
    deno: ['migrations'],
    php: ['database/migrations', 'migrations'],
    ruby: ['db/migrate'],
    dotnet: ['Migrations', 'Data/Migrations'],
    unknown: ['migrations'],
  };

  const runtime = health.runtimeFamily || 'unknown';
  const migrationMarkers = migrationMarkersByRuntime[runtime] || migrationMarkersByRuntime.unknown;
  let hasMigrationSurface = false;
  for (const marker of migrationMarkers) {
    if (await fsExtra.pathExists(path.join(projectPath, marker))) {
      hasMigrationSurface = true;
      break;
    }
  }

  pushProjectProbe(health, {
    id: 'migration-surface',
    label: 'Migration/readiness surface',
    status: hasMigrationSurface ? 'pass' : 'warn',
    severity: 'warn',
    scope: 'project-scoped',
    reason: hasMigrationSurface
      ? 'Migration or schema evolution markers detected.'
      : 'No migration markers detected for this backend runtime.',
    recommendation: hasMigrationSurface
      ? undefined
      : 'Add migration tooling baseline (migrations dir or runtime-native migration config).',
  });

  const healthMarkers = [
    'src/health',
    'src/healthcheck',
    'src/main/resources/application.yml',
    'src/main/resources/application.properties',
    'app/health.py',
    'routes/health.ts',
    'routes/health.js',
  ];
  let hasHealthSurface = false;
  for (const marker of healthMarkers) {
    if (await fsExtra.pathExists(path.join(projectPath, marker))) {
      hasHealthSurface = true;
      break;
    }
  }

  pushProjectProbe(health, {
    id: 'runtime-health-surface',
    label: 'Runtime health probe surface',
    status: hasHealthSurface ? 'pass' : 'warn',
    severity: 'warn',
    scope: 'project-scoped',
    reason: hasHealthSurface
      ? 'Health endpoint/config markers detected.'
      : 'No explicit runtime health endpoint markers detected.',
    recommendation: hasHealthSurface
      ? undefined
      : 'Expose a deterministic health endpoint and keep it covered in verify pack.',
  });

  await appendRuntimeAdapterProbes(projectPath, health);
}

async function appendBuiltInFrontendProbes(
  projectPath: string,
  health: ProjectHealth,
  packageJsonData: Record<string, unknown> | null,
  detection: BackendFrameworkDetection
): Promise<void> {
  const probes = await buildFrontendDoctorProbes({
    projectPath,
    detection,
    packageJsonData,
  });

  for (const probe of probes) {
    pushProjectProbe(health, probe);
  }
}

type CustomDoctorProbeConfig = {
  id?: string;
  label?: string;
  severity?: 'info' | 'warn' | 'error';
  anyOfPaths?: string[];
  allOfPaths?: string[];
  recommendation?: string;
};

async function appendCustomConfiguredProbes(
  projectPath: string,
  health: ProjectHealth
): Promise<void> {
  const candidates = [
    path.join(projectPath, '.rapidkit', 'doctor.probes.json'),
    path.join(projectPath, 'doctor.probes.json'),
  ];

  for (const candidatePath of candidates) {
    if (!(await fsExtra.pathExists(candidatePath))) {
      continue;
    }

    try {
      const raw = (await fsExtra.readJSON(candidatePath)) as {
        probes?: CustomDoctorProbeConfig[];
      };
      const probes = Array.isArray(raw?.probes) ? raw.probes : [];

      for (let index = 0; index < probes.length; index += 1) {
        const probe = probes[index] || {};
        const id =
          typeof probe.id === 'string' && probe.id.trim().length > 0
            ? probe.id.trim()
            : `custom-probe-${index + 1}`;
        const label =
          typeof probe.label === 'string' && probe.label.trim().length > 0
            ? probe.label.trim()
            : id;
        const severity = probe.severity || 'warn';

        const anyOfPaths = Array.isArray(probe.anyOfPaths) ? probe.anyOfPaths.filter(Boolean) : [];
        const allOfPaths = Array.isArray(probe.allOfPaths) ? probe.allOfPaths.filter(Boolean) : [];

        let passAny = anyOfPaths.length === 0;
        for (const p of anyOfPaths) {
          if (await fsExtra.pathExists(path.join(projectPath, p))) {
            passAny = true;
            break;
          }
        }

        let passAll = true;
        for (const p of allOfPaths) {
          if (!(await fsExtra.pathExists(path.join(projectPath, p)))) {
            passAll = false;
            break;
          }
        }

        const passed = passAny && passAll;
        pushProjectProbe(health, {
          id,
          label,
          status: passed ? 'pass' : severity === 'error' ? 'fail' : 'warn',
          severity,
          scope: 'project-scoped',
          reason: passed
            ? 'Custom probe contract satisfied.'
            : `Custom probe failed from ${path.basename(candidatePath)}.`,
          recommendation: probe.recommendation,
        });
      }
    } catch {
      pushProjectProbe(health, {
        id: 'custom-probe-config',
        label: 'Custom doctor probe configuration',
        status: 'warn',
        severity: 'warn',
        scope: 'project-scoped',
        reason: `Failed to parse ${path.basename(candidatePath)}.`,
        recommendation: 'Fix JSON syntax in doctor.probes.json to re-enable custom probes.',
      });
    }
  }

  await appendCustomAdapterChecks(projectPath, health);
}

async function checkProject(
  projectPath: string,
  options: { allowNonRapidkit?: boolean } = {}
): Promise<ProjectHealth> {
  const projectName = path.basename(projectPath);
  const health: ProjectHealth = {
    name: projectName,
    path: projectPath,
    venvActive: false,
    depsInstalled: false,
    coreInstalled: false,
    issues: [],
    fixCommands: [],
  };

  const allowNonRapidkit = options.allowNonRapidkit === true;
  // Check for .rapidkit directory
  const rapidkitDir = path.join(projectPath, '.rapidkit');
  if (!(await fsExtra.pathExists(rapidkitDir))) {
    if (!allowNonRapidkit) {
      health.issues.push('Not a valid RapidKit project (missing .rapidkit directory)');
      return health;
    }
    health.issues.push('Not a RapidKit-managed project (running generic backend diagnostics)');
  }

  // Try to read kit info and stats from registry.json
  try {
    const registryPath = path.join(projectPath, 'registry.json');
    if (await fsExtra.pathExists(registryPath)) {
      const registry = await fsExtra.readJson(registryPath);
      if (registry.installed_modules) {
        health.stats = {
          modules: registry.installed_modules.length,
        };
      }
    }
  } catch {
    // Ignore if can't read registry
  }

  try {
    const { auditProjectModulePaths } = await import('./utils/module-layout.js');
    const moduleAudit = await auditProjectModulePaths(projectPath);
    if (moduleAudit.issues.length > 0) {
      for (const issue of moduleAudit.issues) {
        health.issues.push(`${issue.message} (${issue.slug})`);
      }
      health.fixCommands = health.fixCommands ?? [];
      health.fixCommands.push('npx rapidkit workspace contract verify --strict --json');
      health.fixCommands.push(
        'npx rapidkit add module <slug>  # reinstall via Core-backed module install'
      );
    }
  } catch {
    // Non-fatal module layout audit
  }

  // Try to read kit info from .rapidkit/project.json
  let projectJsonData: Record<string, unknown> | null = null;
  try {
    const projectJsonPath = path.join(rapidkitDir, 'project.json');
    if (await fsExtra.pathExists(projectJsonPath)) {
      projectJsonData = await fsExtra.readJson(projectJsonPath);
      // Support both 'kit' (legacy) and 'kit_name' (new generator) fields
      const kitValue = (projectJsonData?.kit_name || projectJsonData?.kit) as string | undefined;
      if (kitValue) {
        health.kit = kitValue;
      }
    }
  } catch {
    // Ignore if can't read kit info
  }

  // Last Modified check
  try {
    const gitPath = path.join(projectPath, '.git');
    if (await fsExtra.pathExists(gitPath)) {
      const { stdout } = await execa('git', ['log', '-1', '--format=%cr'], {
        cwd: projectPath,
        reject: false,
      });
      if (stdout) {
        health.lastModified = stdout.trim();
      }
    } else {
      // Fallback to directory modification time
      const stat = await fsExtra.stat(projectPath);
      const now = Date.now();
      const diff = now - stat.mtime.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      health.lastModified = days === 0 ? 'today' : `${days} day${days > 1 ? 's' : ''} ago`;
    }
  } catch {
    // Ignore if can't determine last modified
  }

  // Detect project type using runtime/framework signals
  const packageJsonPath = path.join(projectPath, 'package.json');
  const pyprojectTomlPath = path.join(projectPath, 'pyproject.toml');
  const requirementsTxtPath = path.join(projectPath, 'requirements.txt');
  const goModPath = path.join(projectPath, 'go.mod');
  const pomXmlPath = path.join(projectPath, 'pom.xml');
  const buildSbtPath = path.join(projectPath, 'build.sbt');
  const cargoTomlPath = path.join(projectPath, 'Cargo.toml');
  const mixExsPath = path.join(projectPath, 'mix.exs');
  const depsEdnPath = path.join(projectPath, 'deps.edn');
  const projectCljPath = path.join(projectPath, 'project.clj');
  const denoJsonPath = path.join(projectPath, 'deno.json');
  const denoJsoncPath = path.join(projectPath, 'deno.jsonc');
  const bunLockbPath = path.join(projectPath, 'bun.lockb');
  const bunLockPath = path.join(projectPath, 'bun.lock');
  const composerJsonPath = path.join(projectPath, 'composer.json');
  const gemfilePath = path.join(projectPath, 'Gemfile');

  const isNodeProject = await fsExtra.pathExists(packageJsonPath);
  const isPythonProject =
    (await fsExtra.pathExists(pyprojectTomlPath)) ||
    (await fsExtra.pathExists(requirementsTxtPath));
  const isPhpProject = await fsExtra.pathExists(composerJsonPath);
  const isRubyProject = await fsExtra.pathExists(gemfilePath);
  const isRustProject = await fsExtra.pathExists(cargoTomlPath);
  const isElixirProject = await fsExtra.pathExists(mixExsPath);
  const isClojureProject =
    (await fsExtra.pathExists(depsEdnPath)) || (await fsExtra.pathExists(projectCljPath));
  const isScalaProject = await fsExtra.pathExists(buildSbtPath);
  const isDenoProject =
    (await fsExtra.pathExists(denoJsonPath)) || (await fsExtra.pathExists(denoJsoncPath));
  let isDotnetProject = projectJsonData?.runtime === 'dotnet';
  try {
    isDotnetProject =
      isDotnetProject ||
      (await hasFileWithSuffixWithinDepth(projectPath, '.csproj', 3)) ||
      (await hasFileWithSuffixWithinDepth(projectPath, '.sln', 2));
  } catch {
    isDotnetProject = projectJsonData?.runtime === 'dotnet';
  }

  const isGoProject =
    (await fsExtra.pathExists(goModPath)) ||
    projectJsonData?.runtime === 'go' ||
    (typeof projectJsonData?.kit_name === 'string' &&
      ((projectJsonData.kit_name as string).startsWith('gofiber') ||
        (projectJsonData.kit_name as string).startsWith('gogin')));

  const isBunProject =
    isNodeProject &&
    ((await fsExtra.pathExists(bunLockbPath)) ||
      (await fsExtra.pathExists(bunLockPath)) ||
      (typeof (projectJsonData?.packageManager as string | undefined) === 'string' &&
        (projectJsonData?.packageManager as string).toLowerCase().startsWith('bun@')));

  // Go project checks (Fiber or Gin)
  if (isGoProject) {
    applyBackendFrameworkDetection(
      health,
      detectBackendFrameworkFromProject(projectPath, projectJsonData ?? null)
    );
    health.isGoProject = true;
    health.venvActive = true; // N/A for Go
    health.coreInstalled = false; // N/A for Go

    // Check if Go is installed
    try {
      await execa('go', ['version'], { timeout: 3000 });
    } catch {
      health.issues.push('Go toolchain not found — install from https://go.dev/dl/');
      health.fixCommands?.push('https://go.dev/dl/');
    }

    // Check deps via go.sum
    const goSumPath = path.join(projectPath, 'go.sum');
    if (await fsExtra.pathExists(goSumPath)) {
      health.depsInstalled = true;
    } else {
      health.depsInstalled = false;
      health.issues.push('Go dependencies not downloaded (go.sum missing)');
      health.fixCommands?.push(buildProjectFixCommand(projectPath, 'go mod tidy'));
    }

    // .env check — Go reads env vars from OS directly; .env is optional (no dotenv loaded by default)
    // Leave hasEnvFile undefined so the Environment row is hidden in the output.

    await performCommonChecks(projectPath, health);
    await appendBuiltInBackendProbes(projectPath, health);
    await appendCustomConfiguredProbes(projectPath, health);
    return health;
  }

  const isJavaProject =
    (await fsExtra.pathExists(pomXmlPath)) ||
    projectJsonData?.runtime === 'java' ||
    (typeof projectJsonData?.kit_name === 'string' &&
      (projectJsonData.kit_name as string).startsWith('springboot'));

  if (isJavaProject) {
    applyBackendFrameworkDetection(
      health,
      detectBackendFrameworkFromProject(projectPath, projectJsonData ?? null)
    );
    health.venvActive = true;
    health.coreInstalled = false;

    const hasPomXml = await fsExtra.pathExists(pomXmlPath);
    const hasGradleBuild =
      (await fsExtra.pathExists(path.join(projectPath, 'build.gradle'))) ||
      (await fsExtra.pathExists(path.join(projectPath, 'build.gradle.kts')));
    const hasMavenWrapper =
      (await fsExtra.pathExists(path.join(projectPath, 'mvnw'))) ||
      (await fsExtra.pathExists(path.join(projectPath, 'mvnw.cmd')));
    const hasGradleWrapper =
      (await fsExtra.pathExists(path.join(projectPath, 'gradlew'))) ||
      (await fsExtra.pathExists(path.join(projectPath, 'gradlew.bat')));

    try {
      await execa('java', ['-version'], { timeout: 3000, reject: false });
    } catch {
      health.issues.push('Java runtime not found — install JDK 21+ and ensure java is on PATH');
      health.fixCommands?.push('https://adoptium.net/');
    }

    if (hasPomXml) {
      if (!hasMavenWrapper) {
        try {
          await execa('mvn', ['-version'], { timeout: 3000, reject: false });
        } catch {
          health.issues.push('Maven not found — install Maven 3.9+ or add Maven Wrapper');
          health.fixCommands?.push('https://maven.apache.org/install.html');
        }
      }
    } else if (hasGradleBuild) {
      if (!hasGradleWrapper) {
        try {
          await execa('gradle', ['--version'], { timeout: 3000, reject: false });
        } catch {
          health.issues.push('Gradle not found — install Gradle 8+ or add Gradle Wrapper');
          health.fixCommands?.push('https://gradle.org/install/');
        }
      }
    }

    const targetPath = path.join(projectPath, 'target');
    const gradleLibsPath = path.join(projectPath, 'build', 'libs');
    const localMavenCachePath = path.join(projectPath, '.rapidkit', 'cache', 'java', 'm2');
    const localGradleCachePath = path.join(projectPath, '.rapidkit', 'cache', 'java', 'gradle');
    health.depsInstalled =
      (await fsExtra.pathExists(targetPath)) ||
      (await fsExtra.pathExists(gradleLibsPath)) ||
      (await fsExtra.pathExists(localMavenCachePath)) ||
      (await fsExtra.pathExists(localGradleCachePath));

    if (!health.depsInstalled) {
      health.issues.push('Java dependencies are not warmed or built yet');
      health.fixCommands?.push(buildProjectFixCommand(projectPath, 'rapidkit init'));
    }

    const envPath = path.join(projectPath, '.env');
    health.hasEnvFile = await fsExtra.pathExists(envPath);
    if (!health.hasEnvFile) {
      const envExamplePath = path.join(projectPath, '.env.example');
      if (await fsExtra.pathExists(envExamplePath)) {
        health.issues.push('Environment file missing (found .env.example)');
        health.fixCommands?.push(buildEnvCopyFixCommand(projectPath));
      }
    }

    const applicationYamlPath = path.join(
      projectPath,
      'src',
      'main',
      'resources',
      'application.yml'
    );
    if (await fsExtra.pathExists(applicationYamlPath)) {
      try {
        const applicationYamlRaw = await fsExtra.readFile(applicationYamlPath, 'utf-8');
        const hasHealthExposure =
          /include:\s*[^\n]*health/i.test(applicationYamlRaw) ||
          /management:\s*[\s\S]*endpoint:\s*[\s\S]*health:/i.test(applicationYamlRaw);

        if (!hasHealthExposure) {
          health.issues.push(
            'Actuator health endpoint exposure is not clearly configured in application.yml'
          );
          health.fixCommands?.push(
            buildProjectFixCommand(
              projectPath,
              'Ensure management.endpoints.web.exposure.include contains health in src/main/resources/application.yml'
            )
          );
        }
      } catch {
        health.issues.push('Unable to read application.yml for Spring Actuator health checks');
      }
    }

    await performCommonChecks(projectPath, health);
    await appendBuiltInBackendProbes(projectPath, health);
    await appendCustomConfiguredProbes(projectPath, health);
    return health;
  }

  if (isRustProject) {
    applyBackendFrameworkDetection(
      health,
      detectBackendFrameworkFromProject(projectPath, projectJsonData ?? null)
    );
    health.venvActive = true;
    health.coreInstalled = false;

    const cargoLockPath = path.join(projectPath, 'Cargo.lock');
    const rustTargetPath = path.join(projectPath, 'target');
    health.depsInstalled =
      (await fsExtra.pathExists(cargoLockPath)) || (await fsExtra.pathExists(rustTargetPath));

    if (!health.depsInstalled) {
      health.issues.push('Rust dependencies are not resolved yet (Cargo.lock/target missing)');
      health.fixCommands?.push(buildProjectFixCommand(projectPath, 'cargo fetch'));
    }

    const envPath = path.join(projectPath, '.env');
    health.hasEnvFile = await fsExtra.pathExists(envPath);
    if (!health.hasEnvFile) {
      const envExamplePath = path.join(projectPath, '.env.example');
      if (await fsExtra.pathExists(envExamplePath)) {
        health.issues.push('Environment file missing (found .env.example)');
        health.fixCommands?.push(buildEnvCopyFixCommand(projectPath));
      }
    }

    await performCommonChecks(projectPath, health);
    await appendBuiltInBackendProbes(projectPath, health);
    await appendCustomConfiguredProbes(projectPath, health);
    return health;
  }

  if (isElixirProject) {
    applyBackendFrameworkDetection(
      health,
      detectBackendFrameworkFromProject(projectPath, projectJsonData ?? null)
    );
    health.venvActive = true;
    health.coreInstalled = false;

    const mixLockPath = path.join(projectPath, 'mix.lock');
    const depsPath = path.join(projectPath, 'deps');
    health.depsInstalled =
      (await fsExtra.pathExists(mixLockPath)) || (await fsExtra.pathExists(depsPath));

    if (!health.depsInstalled) {
      health.issues.push('Elixir dependencies not installed (mix.lock/deps missing)');
      health.fixCommands?.push(buildProjectFixCommand(projectPath, 'mix deps.get'));
    }

    const envPath = path.join(projectPath, '.env');
    health.hasEnvFile = await fsExtra.pathExists(envPath);
    if (!health.hasEnvFile) {
      const envExamplePath = path.join(projectPath, '.env.example');
      if (await fsExtra.pathExists(envExamplePath)) {
        health.issues.push('Environment file missing (found .env.example)');
        health.fixCommands?.push(buildEnvCopyFixCommand(projectPath));
      }
    }

    await performCommonChecks(projectPath, health);
    await appendBuiltInBackendProbes(projectPath, health);
    await appendCustomConfiguredProbes(projectPath, health);
    return health;
  }

  if (isClojureProject) {
    applyBackendFrameworkDetection(
      health,
      detectBackendFrameworkFromProject(projectPath, projectJsonData ?? null)
    );
    health.venvActive = true;
    health.coreInstalled = false;

    const cpcachePath = path.join(projectPath, '.cpcache');
    const targetPath = path.join(projectPath, 'target');
    const hasDepsManifest =
      (await fsExtra.pathExists(depsEdnPath)) || (await fsExtra.pathExists(projectCljPath));
    health.depsInstalled =
      (await fsExtra.pathExists(cpcachePath)) ||
      (await fsExtra.pathExists(targetPath)) ||
      hasDepsManifest;

    if (!health.depsInstalled) {
      health.issues.push('Clojure dependency cache not initialized');
      health.fixCommands?.push(buildProjectFixCommand(projectPath, 'clojure -P'));
    }

    await performCommonChecks(projectPath, health);
    await appendBuiltInBackendProbes(projectPath, health);
    await appendCustomConfiguredProbes(projectPath, health);
    return health;
  }

  if (isScalaProject) {
    applyBackendFrameworkDetection(
      health,
      detectBackendFrameworkFromProject(projectPath, projectJsonData ?? null)
    );
    health.venvActive = true;
    health.coreInstalled = false;

    const targetPath = path.join(projectPath, 'target');
    health.depsInstalled = await fsExtra.pathExists(targetPath);

    if (!health.depsInstalled) {
      health.issues.push('Scala build artifacts missing (run dependency/build warmup)');
      health.fixCommands?.push(buildProjectFixCommand(projectPath, 'sbt compile'));
    }

    const envPath = path.join(projectPath, '.env');
    health.hasEnvFile = await fsExtra.pathExists(envPath);
    if (!health.hasEnvFile) {
      const envExamplePath = path.join(projectPath, '.env.example');
      if (await fsExtra.pathExists(envExamplePath)) {
        health.issues.push('Environment file missing (found .env.example)');
        health.fixCommands?.push(buildEnvCopyFixCommand(projectPath));
      }
    }

    await performCommonChecks(projectPath, health);
    await appendBuiltInBackendProbes(projectPath, health);
    await appendCustomConfiguredProbes(projectPath, health);
    return health;
  }

  if (isDenoProject) {
    applyBackendFrameworkDetection(
      health,
      detectBackendFrameworkFromProject(projectPath, projectJsonData ?? null)
    );
    health.venvActive = true;
    health.coreInstalled = false;
    health.depsInstalled = true;

    const envPath = path.join(projectPath, '.env');
    health.hasEnvFile = await fsExtra.pathExists(envPath);
    if (!health.hasEnvFile) {
      const envExamplePath = path.join(projectPath, '.env.example');
      if (await fsExtra.pathExists(envExamplePath)) {
        health.issues.push('Environment file missing (found .env.example)');
        health.fixCommands?.push(buildEnvCopyFixCommand(projectPath));
      }
    }

    await performCommonChecks(projectPath, health);
    await appendBuiltInBackendProbes(projectPath, health);
    await appendCustomConfiguredProbes(projectPath, health);
    return health;
  }

  // Node.js project checks
  if (isNodeProject) {
    let packageJsonData: Record<string, unknown> | null = null;
    try {
      packageJsonData = await fsExtra.readJson(packageJsonPath);
    } catch {
      packageJsonData = null;
    }

    const dependencies = {
      ...((packageJsonData?.dependencies as Record<string, unknown> | undefined) ?? {}),
      ...((packageJsonData?.devDependencies as Record<string, unknown> | undefined) ?? {}),
    };

    const scripts =
      (packageJsonData?.scripts as Record<string, unknown> | undefined) ??
      ({} as Record<string, unknown>);

    const kitName =
      typeof projectJsonData?.kit_name === 'string'
        ? (projectJsonData.kit_name as string).toLowerCase()
        : typeof projectJsonData?.kit === 'string'
          ? (projectJsonData.kit as string).toLowerCase()
          : '';

    const frontendDetection = detectFrontendFrameworkFromProject(projectPath, projectJsonData);
    const nodeDetection = detectNodeFrameworkFromManifest({
      dependencies,
      scripts,
      kitName,
    });
    if (isBunProject) {
      applyFrameworkMetadata(health, 'Bun', 'high');
    } else {
      const backendDetection = detectBackendFrameworkFromProject(
        projectPath,
        projectJsonData ?? null
      );
      const explicitBackendNodeFramework =
        backendDetection.key === 'nestjs' ||
        backendDetection.key === 'express' ||
        backendDetection.key === 'fastify' ||
        backendDetection.key === 'koa';

      if (explicitBackendNodeFramework) {
        applyBackendFrameworkDetection(health, backendDetection);
      } else if (frontendDetection.key !== 'unknown') {
        applyFrontendFrameworkDetection(health, frontendDetection);
      } else if (backendDetection.key !== 'unknown' && backendDetection.key !== 'node') {
        applyBackendFrameworkDetection(health, backendDetection);
      } else {
        applyFrameworkMetadata(health, nodeDetection.framework, nodeDetection.confidence);
      }
    }
    health.venvActive = true; // N/A for Node.js projects

    // Check for node_modules
    const nodeModulesPath = path.join(projectPath, 'node_modules');
    if (await fsExtra.pathExists(nodeModulesPath)) {
      try {
        const modules = await fsExtra.readdir(nodeModulesPath);
        // Check if there are actual packages (more than just .bin, .cache, etc.)
        const realPackages = modules.filter((m) => !m.startsWith('.') && !m.startsWith('_'));
        health.depsInstalled = realPackages.length > 0;
      } catch {
        health.depsInstalled = false;
      }
    }

    if (!health.depsInstalled) {
      health.issues.push('Dependencies not installed (node_modules empty or missing)');
      health.fixCommands?.push(
        buildProjectFixCommand(projectPath, isBunProject ? 'bun install' : 'rapidkit init')
      );
    }

    // Node.js projects don't need Python venv
    health.coreInstalled = false; // N/A for Node.js

    // Check environment files.
    // For frontend frameworks, .env.* files are optional; show warning only when .env.example exists.
    if (health.projectKind === 'frontend') {
      const envCandidates = [
        '.env',
        '.env.local',
        '.env.development',
        '.env.development.local',
        '.env.production',
        '.env.production.local',
      ];
      const hasAnyEnvFile = (
        await Promise.all(
          envCandidates.map((name) => fsExtra.pathExists(path.join(projectPath, name)))
        )
      ).some(Boolean);

      if (hasAnyEnvFile) {
        health.hasEnvFile = true;
      } else {
        const envExamplePath = path.join(projectPath, '.env.example');
        if (await fsExtra.pathExists(envExamplePath)) {
          health.hasEnvFile = false;
          health.issues.push('Environment file missing (found .env.example)');
          health.fixCommands?.push(buildEnvCopyFixCommand(projectPath));
        }
      }
    } else {
      const envPath = path.join(projectPath, '.env');
      health.hasEnvFile = await fsExtra.pathExists(envPath);
      if (!health.hasEnvFile) {
        const envExamplePath = path.join(projectPath, '.env.example');
        if (await fsExtra.pathExists(envExamplePath)) {
          health.issues.push('Environment file missing (found .env.example)');
          health.fixCommands?.push(buildEnvCopyFixCommand(projectPath));
        }
      }
    }

    if (health.projectKind === 'frontend') {
      health.modulesHealthy = await assessFrontendSourceTree(projectPath);
      health.missingModules = [];
    } else {
      const srcPath = path.join(projectPath, 'src');
      health.modulesHealthy = true;
      health.missingModules = [];

      if (await fsExtra.pathExists(srcPath)) {
        try {
          const modules = await fsExtra.readdir(srcPath);
          health.modulesHealthy = modules.length > 0;
        } catch {
          health.modulesHealthy = false;
        }
      }
    }

    // Common checks for both Node.js and Python
    await performCommonChecks(projectPath, health, packageJsonData);
    if (health.projectKind === 'frontend') {
      await appendBuiltInFrontendProbes(
        projectPath,
        health,
        packageJsonData,
        frontendDetection.key !== 'unknown'
          ? frontendDetection
          : detectFrontendFrameworkFromProject(projectPath, projectJsonData)
      );
    } else {
      await appendBuiltInBackendProbes(projectPath, health);
    }
    await appendCustomConfiguredProbes(projectPath, health);

    return health;
  }

  // Python/FastAPI project checks
  if (isPythonProject) {
    const pythonDetection = await detectPythonFramework(projectPath);
    applyFrameworkMetadata(health, pythonDetection.framework, pythonDetection.confidence);

    // Check for virtual environment
    const venvPath = path.join(projectPath, '.venv');
    if (await fsExtra.pathExists(venvPath)) {
      health.venvActive = true;

      // Check if dependencies are installed
      const pythonPath = getVenvPythonPath(venvPath);

      if (await fsExtra.pathExists(pythonPath)) {
        // Check for rapidkit-core in venv (optional - Core is usually global)
        try {
          const { stdout } = await execa(
            pythonPath,
            ['-c', 'import rapidkit_core; print(rapidkit_core.__version__)'],
            { timeout: 2000 }
          );
          health.coreInstalled = true;
          health.coreVersion = stdout.trim();
        } catch {
          // Not an issue - Core is typically installed globally via pipx
          health.coreInstalled = false;
        }

        // Check if dependencies are installed using framework signal first.
        let frameworkImport = 'fastapi';
        if (health.framework === 'Django') {
          frameworkImport = 'django';
        } else if (health.framework === 'Flask') {
          frameworkImport = 'flask';
        } else if (health.framework === 'Python') {
          frameworkImport = '';
        }

        let shouldRunFallback = true;
        if (frameworkImport) {
          try {
            await execa(pythonPath, ['-c', `import ${frameworkImport}`], { timeout: 2000 });
            health.depsInstalled = true;
            shouldRunFallback = false;
          } catch {
            shouldRunFallback = true;
          }
        }

        if (shouldRunFallback) {
          try {
            const libPath = path.join(venvPath, 'lib');
            if (await fsExtra.pathExists(libPath)) {
              const pythonDirs = await fsExtra.readdir(libPath);
              const pythonDir = pythonDirs.find((d) => d.startsWith('python'));

              if (pythonDir) {
                const sitePackagesPath = path.join(libPath, pythonDir, 'site-packages');
                if (await fsExtra.pathExists(sitePackagesPath)) {
                  const packages = await fsExtra.readdir(sitePackagesPath);
                  // Check if there are actual packages (more than just pip/setuptools/wheel)
                  const realPackages = packages.filter(
                    (p) =>
                      !p.startsWith('_') &&
                      !p.includes('dist-info') &&
                      !['pip', 'setuptools', 'wheel', 'pkg_resources'].includes(p)
                  );
                  health.depsInstalled = realPackages.length > 0;
                }
              }
            }

            if (!health.depsInstalled) {
              health.issues.push('Dependencies not installed');
              health.fixCommands?.push(buildProjectFixCommand(projectPath, 'rapidkit init'));
            }
          } catch {
            health.issues.push('Could not verify dependency installation');
          }
        }
      } else {
        health.issues.push('Virtual environment exists but Python executable not found');
      }
    } else {
      health.issues.push('Virtual environment not created');
      health.fixCommands?.push(buildProjectFixCommand(projectPath, 'rapidkit init'));
    }

    // Check for .env file
    const envPath = path.join(projectPath, '.env');
    health.hasEnvFile = await fsExtra.pathExists(envPath);
    if (!health.hasEnvFile) {
      const envExamplePath = path.join(projectPath, '.env.example');
      if (await fsExtra.pathExists(envExamplePath)) {
        health.issues.push('Environment file missing (found .env.example)');
        health.fixCommands?.push(buildEnvCopyFixCommand(projectPath));
      }
    }

    // Check for critical modules (src/__init__.py or modules/)
    const srcPath = path.join(projectPath, 'src');
    const modulesPath = path.join(projectPath, 'modules');

    health.modulesHealthy = true;
    health.missingModules = [];

    if (await fsExtra.pathExists(srcPath)) {
      const srcInit = path.join(srcPath, '__init__.py');
      if (!(await fsExtra.pathExists(srcInit))) {
        health.modulesHealthy = false;
        health.missingModules.push('src/__init__.py');
      }
    }

    if (await fsExtra.pathExists(modulesPath)) {
      try {
        const modules = await listDirectories(modulesPath);
        for (const module of modules) {
          const moduleInit = path.join(modulesPath, module, '__init__.py');
          if (!(await fsExtra.pathExists(moduleInit))) {
            health.modulesHealthy = false;
            health.missingModules.push(`modules/${module}/__init__.py`);
          }
        }
      } catch {
        // Ignore directory read errors
      }
    }

    if (!health.modulesHealthy && health.missingModules.length > 0) {
      health.issues.push(`Missing module init files: ${health.missingModules.join(', ')}`);
    }

    // Common checks for both Node.js and Python
    await performCommonChecks(projectPath, health);
    await appendBuiltInBackendProbes(projectPath, health);
    await appendCustomConfiguredProbes(projectPath, health);

    return health;
  }

  if (isPhpProject) {
    applyBackendFrameworkDetection(
      health,
      detectBackendFrameworkFromProject(projectPath, projectJsonData ?? null)
    );
    health.venvActive = true;
    health.coreInstalled = false;

    const vendorPath = path.join(projectPath, 'vendor');
    health.depsInstalled = await fsExtra.pathExists(vendorPath);
    if (!health.depsInstalled) {
      health.issues.push('PHP dependencies not installed (vendor missing)');
      health.fixCommands?.push(buildProjectFixCommand(projectPath, 'composer install'));
    }

    const envPath = path.join(projectPath, '.env');
    health.hasEnvFile = await fsExtra.pathExists(envPath);
    if (!health.hasEnvFile) {
      const envExamplePath = path.join(projectPath, '.env.example');
      if (await fsExtra.pathExists(envExamplePath)) {
        health.issues.push('Environment file missing (found .env.example)');
        health.fixCommands?.push(buildEnvCopyFixCommand(projectPath));
      }
    }

    await performCommonChecks(projectPath, health);
    await appendBuiltInBackendProbes(projectPath, health);
    await appendCustomConfiguredProbes(projectPath, health);
    return health;
  }

  if (isRubyProject) {
    applyBackendFrameworkDetection(
      health,
      detectBackendFrameworkFromProject(projectPath, projectJsonData ?? null)
    );
    health.venvActive = true;
    health.coreInstalled = false;

    const hasLockFile = await fsExtra.pathExists(path.join(projectPath, 'Gemfile.lock'));
    const hasVendorBundle = await fsExtra.pathExists(path.join(projectPath, 'vendor', 'bundle'));
    health.depsInstalled = hasLockFile || hasVendorBundle;
    if (!health.depsInstalled) {
      health.issues.push('Ruby dependencies not installed (Gemfile.lock/vendor missing)');
      health.fixCommands?.push(buildProjectFixCommand(projectPath, 'bundle install'));
    }

    const envPath = path.join(projectPath, '.env');
    health.hasEnvFile = await fsExtra.pathExists(envPath);

    await performCommonChecks(projectPath, health);
    await appendBuiltInBackendProbes(projectPath, health);
    await appendCustomConfiguredProbes(projectPath, health);
    return health;
  }

  if (isDotnetProject) {
    applyBackendFrameworkDetection(
      health,
      detectBackendFrameworkFromProject(projectPath, projectJsonData ?? null)
    );
    health.venvActive = true;
    health.coreInstalled = false;

    const objPath = path.join(projectPath, 'obj');
    const srcObjPath = path.join(projectPath, 'src', 'obj');
    const packagesLockPath = path.join(projectPath, 'packages.lock.json');
    health.depsInstalled =
      (await fsExtra.pathExists(objPath)) ||
      (await fsExtra.pathExists(srcObjPath)) ||
      (await fsExtra.pathExists(packagesLockPath));
    if (!health.depsInstalled) {
      health.issues.push('.NET restore/build artifacts not found');
      health.fixCommands?.push(buildProjectFixCommand(projectPath, 'dotnet restore'));
    }

    const envPath = path.join(projectPath, '.env');
    health.hasEnvFile = await fsExtra.pathExists(envPath);

    await performCommonChecks(projectPath, health);
    await appendBuiltInBackendProbes(projectPath, health);
    await appendCustomConfiguredProbes(projectPath, health);
    return health;
  }

  // If runtime markers are absent, return basic health
  applyFrameworkMetadata(health, 'Unknown', 'low');
  health.issues.push('Unknown project type (no recognized runtime marker files)');

  await performCommonChecks(projectPath, health);
  await appendBuiltInBackendProbes(projectPath, health);
  await appendCustomConfiguredProbes(projectPath, health);
  return health;
}

async function listDirectories(basePath: string): Promise<string[]> {
  try {
    const entries = await fsExtra.readdir(basePath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    try {
      const entries = await fsExtra.readdir(basePath);
      const dirs: string[] = [];
      for (const name of entries) {
        try {
          const stat = await fsExtra.stat(path.join(basePath, name));
          if (stat.isDirectory()) {
            dirs.push(name);
          }
        } catch {
          continue;
        }
      }
      return dirs;
    } catch {
      return [];
    }
  }
}

async function hasFileWithSuffixWithinDepth(
  basePath: string,
  suffix: string,
  maxDepth: number
): Promise<boolean> {
  const queue: Array<{ dir: string; depth: number }> = [{ dir: basePath, depth: 0 }];
  const ignoredDirs = new Set(['.git', '.rapidkit', 'node_modules', 'bin', 'obj', 'target']);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth > maxDepth) {
      continue;
    }

    let entries;
    try {
      entries = await fsExtra.readdir(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith(suffix.toLowerCase())) {
        return true;
      }

      if (entry.isDirectory() && !ignoredDirs.has(entry.name)) {
        queue.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 });
      }
    }
  }

  return false;
}

async function hasRapidkitProjectMarkers(projectPath: string): Promise<boolean> {
  const rapidkitDir = path.join(projectPath, '.rapidkit');
  if (!(await fsExtra.pathExists(rapidkitDir))) {
    return false;
  }

  const markerFiles = ['project.json', 'context.json', 'file-hashes.json'];
  for (const markerFile of markerFiles) {
    if (await fsExtra.pathExists(path.join(rapidkitDir, markerFile))) {
      return true;
    }
  }

  return false;
}

function shouldIgnoreWorkspaceDir(dirName: string, ignoredDirs: Set<string>): boolean {
  if (ignoredDirs.has(dirName)) {
    return true;
  }

  const lowerName = dirName.toLowerCase();
  if (lowerName === 'dist' || lowerName.startsWith('dist-') || lowerName.startsWith('dist_')) {
    return true;
  }

  if (lowerName === 'build' || lowerName.startsWith('build-') || lowerName.startsWith('build_')) {
    return true;
  }

  return false;
}

async function findRapidkitProjectsDeep(
  workspacePath: string,
  maxDepth: number,
  ignoredDirs: Set<string>
): Promise<string[]> {
  const results = new Set<string>();
  const queue: Array<{ dir: string; depth: number }> = [{ dir: workspacePath, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    try {
      const entries = await fsExtra.readdir(current.dir);
      for (const name of entries) {
        if (shouldIgnoreWorkspaceDir(name, ignoredDirs)) continue;

        const fullPath = path.join(current.dir, name);
        let stat;
        try {
          stat = await fsExtra.stat(fullPath);
        } catch {
          continue;
        }

        if (!stat.isDirectory()) continue;

        if (await hasRapidkitProjectMarkers(fullPath)) {
          results.add(fullPath);
          continue;
        }

        if (current.depth < maxDepth) {
          queue.push({ dir: fullPath, depth: current.depth + 1 });
        }
      }
    } catch {
      continue;
    }
  }

  return Array.from(results);
}

async function findWorkspace(startPath: string): Promise<string | null> {
  let currentPath = path.resolve(startPath);
  const root = path.parse(currentPath).root;

  while (true) {
    if (await hasWorkspaceRootMarkers(currentPath)) {
      return currentPath;
    }

    if (currentPath === root) {
      break;
    }

    currentPath = path.dirname(currentPath);
  }

  return null;
}

async function findProjectRoot(startPath: string): Promise<string | null> {
  let currentPath = path.resolve(startPath);
  const workspaceRoot = await findWorkspace(currentPath);
  const root = workspaceRoot ?? path.parse(currentPath).root;

  while (true) {
    if (await hasRapidkitProjectMarkers(currentPath)) {
      return currentPath;
    }

    if (await hasBackendProjectMarkers(currentPath)) {
      // Inside a workspace, backend markers at workspace root are usually
      // toolchain/workspace metadata and should not be treated as project scope.
      if (!workspaceRoot || currentPath !== workspaceRoot) {
        return currentPath;
      }
    }

    if (currentPath === root) {
      break;
    }

    currentPath = path.dirname(currentPath);
  }

  return null;
}

function normalizeReportedPath(targetPath: string): string {
  const resolvedPath = path.resolve(targetPath);
  if (process.platform === 'darwin') {
    return resolvedPath.replace(/^\/private(?=\/var\/)/, '');
  }
  return resolvedPath;
}

async function hasBackendProjectMarkers(projectPath: string): Promise<boolean> {
  const markerPaths = [
    'package.json',
    'pyproject.toml',
    'requirements.txt',
    'go.mod',
    'pom.xml',
    'build.sbt',
    'Cargo.toml',
    'mix.exs',
    'deps.edn',
    'project.clj',
    'deno.json',
    'deno.jsonc',
    'composer.json',
    'Gemfile',
  ];

  for (const marker of markerPaths) {
    if (await fsExtra.pathExists(path.join(projectPath, marker))) {
      return true;
    }
  }

  return false;
}

async function hasWorkspaceRootMarkers(candidatePath: string): Promise<boolean> {
  const markerFiles = [
    path.join(candidatePath, '.rapidkit-workspace'),
    path.join(candidatePath, '.rapidkit', 'workspace-marker.json'),
    path.join(candidatePath, '.rapidkit', 'config.json'),
  ];

  return Promise.all(markerFiles.map((marker) => fsExtra.pathExists(marker))).then((results) =>
    results.some(Boolean)
  );
}

function calculateHealthScore(
  systemChecks: HealthCheckResult[],
  projects: ProjectHealth[]
): HealthScore {
  let passed = 0;
  let warnings = 0;
  let errors = 0;

  // Count system checks
  systemChecks.forEach((check) => {
    if (check.status === 'ok') passed++;
    else if (check.status === 'warn') warnings++;
    else if (check.status === 'error') errors++;
  });

  // Count project issues
  projects.forEach((project) => {
    const advisoryWarnings = getProjectAdvisoryWarningCount(project);
    // Go projects: venvActive is set true (N/A) — use depsInstalled + no issues
    const isHealthy = project.isGoProject
      ? project.issues.length === 0 && project.depsInstalled
      : project.issues.length === 0 && project.venvActive && project.depsInstalled;

    if (project.issues.length > 0 || advisoryWarnings > 0 || !isHealthy) {
      warnings++;
      return;
    }

    passed++;
  });

  const total = passed + warnings + errors;
  return { total, passed, warnings, errors };
}

function buildScoreBreakdown(
  systemChecks: Array<{ id: string; label: string; result: HealthCheckResult }>,
  projects: ProjectHealth[],
  options: { includeWorkspaceAggregateRules?: boolean } = {}
): ScoreBreakdownItem[] {
  const breakdown: ScoreBreakdownItem[] = [];

  for (const check of systemChecks) {
    breakdown.push({
      id: check.id,
      label: check.label,
      status: check.result.status,
      scope: 'host-system',
      policyRuleId: 'system-status-derived',
      reason: check.result.details || check.result.message,
    });
  }

  const sortedProjects = [...projects].sort((a, b) => {
    const left = `${a.path || ''}|${a.name || ''}`.toLowerCase();
    const right = `${b.path || ''}|${b.name || ''}`.toLowerCase();
    return left.localeCompare(right);
  });

  for (const project of sortedProjects) {
    const hasBlockingIssue = project.issues.length > 0;
    const advisoryWarnings = getProjectAdvisoryWarningCount(project);
    const status: 'ok' | 'warn' | 'error' = hasBlockingIssue
      ? 'warn'
      : advisoryWarnings > 0
        ? 'warn'
        : 'ok';
    const reason = hasBlockingIssue
      ? `${project.issues.length} blocking issue(s)`
      : advisoryWarnings > 0
        ? `${advisoryWarnings} advisory warning(s)`
        : 'Project checks passed';

    breakdown.push({
      id: `project:${project.name}`,
      label: `Project ${project.name}`,
      status,
      scope: 'project-scoped',
      policyRuleId: hasBlockingIssue
        ? 'project-blocking-issues'
        : advisoryWarnings > 0
          ? 'project-advisory-warnings'
          : 'project-checks-passed',
      reason,
    });
  }

  if (options.includeWorkspaceAggregateRules) {
    const totalProjectIssues = projects.reduce((sum, project) => sum + project.issues.length, 0);
    const advisoryWarnings = countProjectAdvisoryWarnings(projects);
    const systemErrors = systemChecks.filter((check) => check.result.status === 'error').length;

    breakdown.push({
      id: 'workspace:projects-discovered',
      label: 'Workspace projects discovered',
      status: projects.length > 0 ? 'ok' : 'warn',
      scope: 'workspace-aggregate',
      policyRuleId: 'workspace-project-discovery',
      reason:
        projects.length > 0
          ? `${projects.length} project(s) discovered for workspace analysis.`
          : 'No projects discovered for workspace analysis.',
    });

    breakdown.push({
      id: 'workspace:system-error-gate',
      label: 'Workspace system error gate',
      status: systemErrors > 0 ? 'error' : 'ok',
      scope: 'workspace-aggregate',
      policyRuleId: 'workspace-system-error-gate',
      reason:
        systemErrors > 0
          ? `${systemErrors} system requirement gate(s) failed.`
          : 'All system requirement gates passed.',
    });

    breakdown.push({
      id: 'workspace:blocking-issues-gate',
      label: 'Workspace blocking issues gate',
      status: totalProjectIssues > 0 ? 'warn' : 'ok',
      scope: 'workspace-aggregate',
      policyRuleId: 'workspace-blocking-issues-gate',
      reason:
        totalProjectIssues > 0
          ? `${totalProjectIssues} blocking project issue(s) detected.`
          : 'No blocking project issues detected.',
    });

    breakdown.push({
      id: 'workspace:advisory-warnings-gate',
      label: 'Workspace advisory warnings gate',
      status: advisoryWarnings > 0 ? 'warn' : 'ok',
      scope: 'workspace-aggregate',
      policyRuleId: 'workspace-advisory-warning-gate',
      reason:
        advisoryWarnings > 0
          ? `${advisoryWarnings} advisory warning(s) detected.`
          : 'No advisory warnings detected.',
    });
  }

  return breakdown;
}

async function getWorkspaceHealth(
  workspacePath: string,
  allowProjectCache: boolean = true
): Promise<WorkspaceHealth> {
  let workspaceName = path.basename(workspacePath);

  // Try to read workspace name from marker file
  try {
    const markerPath = path.join(workspacePath, '.rapidkit-workspace');
    if (await fsExtra.pathExists(markerPath)) {
      const marker = await fsExtra.readJSON(markerPath);
      workspaceName = marker.name || workspaceName;
    }
  } catch {
    // Try alternative format
    try {
      const configPath = path.join(workspacePath, '.rapidkit', 'config.json');
      const config = await fsExtra.readJSON(configPath);
      workspaceName = config.workspace_name || workspaceName;
    } catch {
      // Use directory name as fallback
    }
  }

  const [systemHealth, projectPaths] = await Promise.all([
    collectSystemChecks(),
    collectWorkspaceProjectPaths(workspacePath),
  ]);

  const health: WorkspaceHealth = {
    workspacePath,
    workspaceName,
    python: systemHealth.python,
    poetry: systemHealth.poetry,
    pipx: systemHealth.pipx,
    go: systemHealth.go,
    rapidkitCore: systemHealth.rapidkitCore,
    projects: [],
  };

  logger.debug(`Workspace scan found ${projectPaths.length} project(s)`);

  const projectSignature = await buildWorkspaceProjectSignature(workspacePath, projectPaths);
  const cachePath = path.join(workspacePath, '.rapidkit', 'reports', 'doctor-workspace-cache.json');
  const cached = allowProjectCache
    ? await loadWorkspaceProjectCache(cachePath, projectSignature)
    : null;

  if (cached) {
    health.projects = cached.projects;
    for (const projectHealth of health.projects) {
      applyCommandCapabilities(projectHealth, projectHealth.path);
    }
    health.projectScanCached = true;
    logger.debug(`Workspace project health cache hit: ${cachePath}`);
  } else {
    try {
      const projectHealthResults = await Promise.all(
        projectPaths.map((projectPath) => checkProject(projectPath))
      );
      for (const projectHealth of projectHealthResults) {
        applyCommandCapabilities(projectHealth, projectHealth.path);
      }
      health.projects = projectHealthResults;
      health.projectScanCached = false;
      await saveWorkspaceProjectCache(cachePath, {
        schemaVersion: DOCTOR_WORKSPACE_CACHE_SCHEMA,
        signature: projectSignature,
        generatedAt: new Date().toISOString(),
        projects: projectHealthResults,
      });
      logger.debug(`Workspace project health cache refreshed: ${cachePath}`);
    } catch (err) {
      logger.debug(`Failed to scan workspace projects: ${err}`);
    }
  }

  health.projectScanSignature = projectSignature;
  health.projectScanCachePath = cachePath;

  // Calculate health score
  const healthChecks = [health.python, health.poetry, health.pipx, health.go, health.rapidkitCore];
  health.healthScore = calculateHealthScore(healthChecks, health.projects);
  health.scoreBreakdown = buildScoreBreakdown(
    [
      { id: 'system-python', label: 'Python', result: health.python },
      { id: 'system-poetry', label: 'Poetry', result: health.poetry },
      { id: 'system-pipx', label: 'pipx', result: health.pipx },
      { id: 'system-go', label: 'Go', result: health.go },
      { id: 'system-rapidkit-core', label: 'RapidKit Core', result: health.rapidkitCore },
    ],
    health.projects,
    { includeWorkspaceAggregateRules: true }
  );
  health.scopeProvenance = buildScopeProvenanceSummary(health.scoreBreakdown);

  // Extract version info
  if (health.rapidkitCore.status === 'ok') {
    const versionMatch = health.rapidkitCore.message.match(/([\d.]+(?:rc\d+)?(?:a\d+)?(?:b\d+)?)/);
    if (versionMatch) {
      health.coreVersion = versionMatch[1];
    }
  }

  const previousEvidencePath = path.join(
    workspacePath,
    '.rapidkit',
    'reports',
    'doctor-last-run.json'
  );
  const previousEvidence = await readDoctorEvidenceIfPresent(previousEvidencePath, 'workspace');
  health.driftDelta = buildWorkspaceDriftDelta(previousEvidence, health);

  health.evidencePath = await writeDoctorEvidence(workspacePath, health, cached ? cachePath : null);

  return health;
}

function serializeDoctorProjectForOutput(project: ProjectHealth): Record<string, unknown> {
  return {
    name: project.name,
    path: project.path,
    framework: project.framework,
    frameworkKey: project.frameworkKey,
    importStack: project.importStack,
    runtimeFamily: project.runtimeFamily,
    projectKind: project.projectKind,
    supportTier: project.supportTier,
    frameworkConfidence: project.frameworkConfidence,
    kit: project.kit,
    venvActive: project.venvActive,
    depsInstalled: project.depsInstalled,
    hasEnvFile: project.hasEnvFile,
    modulesHealthy: project.modulesHealthy,
    missingModules: project.missingModules,
    hasTests: project.hasTests,
    hasDocker: project.hasDocker,
    hasCodeQuality: project.hasCodeQuality,
    vulnerabilities: project.vulnerabilities,
    coreInstalled: project.coreInstalled,
    coreVersion: project.coreVersion,
    lastModified: project.lastModified,
    stats: project.stats,
    issues: project.issues,
    fixCommands: project.fixCommands,
    probes: project.probes,
    commandCapabilities: project.commandCapabilities,
  };
}

async function writeProjectDoctorEvidence(
  workspacePath: string | undefined,
  envelope: ProjectHealthEnvelope
): Promise<string | undefined> {
  const evidenceRoot = workspacePath || envelope.projectPath;
  const evidencePath = path.join(
    evidenceRoot,
    '.rapidkit',
    'reports',
    'doctor-project-last-run.json'
  );

  try {
    await fsExtra.ensureDir(path.dirname(evidencePath));
    const blockers = envelope.project.issues
      .filter((issue): issue is string => typeof issue === 'string' && issue.trim().length > 0)
      .slice(0, 12);
    await fsExtra.writeJSON(
      evidencePath,
      withGovernanceRunMetadata(
        {
          schemaVersion: DOCTOR_PROJECT_EVIDENCE_SCHEMA,
          evidenceType: 'project',
          contract: getDoctorContractMetadata(),
          workspacePath: workspacePath || null,
          projectPath: envelope.projectPath,
          projectName: envelope.projectName,
          healthScore: envelope.healthScore,
          system: {
            python: envelope.python,
            poetry: envelope.poetry,
            pipx: envelope.pipx,
            go: envelope.go,
            rapidkitCore: envelope.rapidkitCore,
          },
          project: envelope.project,
          driftDelta: envelope.driftDelta,
          summary: {
            scopeProvenance: envelope.scopeProvenance,
          },
          scoreBreakdown: envelope.scoreBreakdown ?? [],
        },
        {
          commandId: 'projectDoctor',
          exitCode: computeDoctorGateExitCode(envelope.healthScore, {}),
          generatedAt: new Date().toISOString(),
          blockers,
          runId: resolveGovernanceRunId(),
        }
      ),
      { spaces: 2 }
    );
    return evidencePath;
  } catch {
    return undefined;
  }
}

async function getProjectHealthEnvelope(projectPath: string): Promise<ProjectHealthEnvelope> {
  const workspacePath = await findWorkspace(projectPath);
  const systemHealth = await collectSystemChecks();
  const projectHealth = await checkProject(projectPath, { allowNonRapidkit: true });
  applyCommandCapabilities(projectHealth, projectPath);
  const healthScore = calculateHealthScore(
    [
      systemHealth.python,
      systemHealth.poetry,
      systemHealth.pipx,
      systemHealth.go,
      systemHealth.rapidkitCore,
    ],
    [projectHealth]
  );

  const envelope: ProjectHealthEnvelope = {
    workspacePath: workspacePath || undefined,
    projectPath,
    projectName: path.basename(projectPath),
    python: systemHealth.python,
    poetry: systemHealth.poetry,
    pipx: systemHealth.pipx,
    go: systemHealth.go,
    rapidkitCore: systemHealth.rapidkitCore,
    project: projectHealth,
    healthScore,
  };

  envelope.scoreBreakdown = buildScoreBreakdown(
    [
      { id: 'system-python', label: 'Python', result: envelope.python },
      { id: 'system-poetry', label: 'Poetry', result: envelope.poetry },
      { id: 'system-pipx', label: 'pipx', result: envelope.pipx },
      { id: 'system-go', label: 'Go', result: envelope.go },
      { id: 'system-rapidkit-core', label: 'RapidKit Core', result: envelope.rapidkitCore },
    ],
    [envelope.project]
  );
  envelope.scopeProvenance = buildScopeProvenanceSummary(envelope.scoreBreakdown);

  const evidenceRoot = workspacePath || projectPath;
  const previousEvidencePath = path.join(
    evidenceRoot,
    '.rapidkit',
    'reports',
    'doctor-project-last-run.json'
  );
  const previousEvidence = await readDoctorEvidenceIfPresent(previousEvidencePath, 'project');
  envelope.driftDelta = buildProjectDriftDelta(previousEvidence, envelope);

  envelope.evidencePath = await writeProjectDoctorEvidence(workspacePath || undefined, envelope);
  return envelope;
}

function renderHealthCheck(check: HealthCheckResult, label: string): void {
  const icon = check.status === 'ok' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
  const color =
    check.status === 'ok' ? chalk.green : check.status === 'warn' ? chalk.yellow : chalk.red;

  console.log(`${icon} ${chalk.bold(label)}: ${color(check.message)}`);

  // Show multiple paths if available
  if (check.paths && check.paths.length > 0) {
    check.paths.forEach((p) => {
      const versionSuffix = p.version ? chalk.cyan(` -> ${p.version}`) : '';
      console.log(
        `   ${chalk.cyan('•')} ${chalk.gray(p.location)}: ${chalk.dim(p.path)}${versionSuffix}`
      );
    });
  }

  if (check.details) {
    console.log(`   ${chalk.gray(check.details)}`);
  }
}

function renderProjectHealth(project: ProjectHealth): void {
  const hasIssues = project.issues.length > 0;
  const icon = hasIssues ? '⚠️' : '✅';
  const nameColor = hasIssues ? chalk.yellow : chalk.green;

  console.log(`\n${icon} ${chalk.bold('Project')}: ${nameColor(project.name)}`);

  // Show framework
  if (project.framework) {
    const frameworkIcon =
      project.framework === 'FastAPI' ||
      project.framework === 'Django' ||
      project.framework === 'Flask'
        ? '🐍'
        : project.framework === 'NestJS'
          ? '🦅'
          : project.framework === 'Next.js' ||
              project.framework === 'Nuxt' ||
              project.framework === 'Remix'
            ? '▲'
            : project.framework === 'React' || project.framework === 'Vite'
              ? '⚛️'
              : project.framework === 'Vue'
                ? '🟢'
                : project.framework === 'Angular'
                  ? '🅰️'
                  : project.framework === 'SvelteKit'
                    ? '🧡'
                    : project.framework === 'Spring Boot'
                      ? '☕'
                      : project.framework === 'Rust'
                        ? '🦀'
                        : project.framework === 'Elixir' || project.framework === 'Phoenix'
                          ? '🧪'
                          : project.framework === 'Clojure'
                            ? '⚙️'
                            : project.framework === 'Scala'
                              ? '🔺'
                              : project.framework === 'Kotlin'
                                ? '🟣'
                                : project.framework === 'Deno'
                                  ? '🦕'
                                  : project.framework === 'Bun'
                                    ? '🥖'
                                    : project.framework === 'Go/Fiber'
                                      ? '🐹'
                                      : project.framework === 'Go/Gin'
                                        ? '🐹'
                                        : project.framework === 'Laravel' ||
                                            project.framework === 'PHP'
                                          ? '🐘'
                                          : project.framework === 'Ruby on Rails' ||
                                              project.framework === 'Ruby'
                                            ? '💎'
                                            : project.framework === 'ASP.NET'
                                              ? '🔷'
                                              : '📦';
    console.log(
      `   ${frameworkIcon} Framework: ${chalk.cyan(project.framework)}${project.kit ? chalk.gray(` (${project.kit})`) : ''}`
    );

    const profileParts: string[] = [];
    if (project.runtimeFamily) {
      profileParts.push(`runtime: ${project.runtimeFamily}`);
    }
    if (project.projectKind) {
      profileParts.push(`kind: ${project.projectKind}`);
    }
    if (project.supportTier) {
      profileParts.push(`support: ${project.supportTier}`);
    }
    if (project.frameworkConfidence) {
      profileParts.push(`confidence: ${project.frameworkConfidence}`);
    }
    if (profileParts.length > 0) {
      console.log(`   ${chalk.dim('↳')} ${chalk.gray(profileParts.join(' • '))}`);
    }
  }

  console.log(`   ${chalk.gray(`Path: ${project.path}`)}`);

  const isPythonProject = project.runtimeFamily === 'python';

  if (isPythonProject) {
    // Python project display
    if (project.venvActive) {
      console.log(`   ✅ Virtual environment: ${chalk.green('Active')}`);
    } else {
      console.log(`   ❌ Virtual environment: ${chalk.red('Not found')}`);
    }

    if (project.coreInstalled) {
      console.log(
        `   ${chalk.dim('ℹ')}  RapidKit Core: ${chalk.gray(project.coreVersion || 'In venv')} ${chalk.dim('(optional)')}`
      );
    } else {
      console.log(
        `   ${chalk.dim('ℹ')}  RapidKit Core: ${chalk.gray('Using global installation')} ${chalk.dim('(recommended)')}`
      );
    }
  }

  // Dependencies (both Python and Node.js)
  if (project.depsInstalled) {
    console.log(`   ✅ Dependencies: ${chalk.green('Installed')}`);
  } else {
    console.log(`   ⚠️  Dependencies: ${chalk.yellow('Not installed')}`);
  }

  // Environment file check
  if (project.hasEnvFile !== undefined) {
    if (project.hasEnvFile) {
      console.log(`   ✅ Environment: ${chalk.green('.env configured')}`);
    } else {
      console.log(`   ⚠️  Environment: ${chalk.yellow('.env missing')}`);
    }
  }

  // Module / source tree health check
  if (project.modulesHealthy !== undefined) {
    const healthLabel = project.projectKind === 'frontend' ? 'Source tree' : 'Modules';
    if (project.modulesHealthy) {
      console.log(`   ✅ ${healthLabel}: ${chalk.green('Healthy')}`);
    } else if (project.missingModules && project.missingModules.length > 0) {
      console.log(
        `   ⚠️  ${healthLabel}: ${chalk.yellow(`Missing ${project.missingModules.length} init file(s)`)}`
      );
    } else if (project.projectKind === 'frontend') {
      console.log(`   ⚠️  ${healthLabel}: ${chalk.yellow('No application directories detected')}`);
    }
  }

  // Project Stats
  if (project.stats) {
    const statsLine = [];
    if (project.stats.modules !== undefined) {
      statsLine.push(`${project.stats.modules} module${project.stats.modules !== 1 ? 's' : ''}`);
    }
    if (statsLine.length > 0) {
      console.log(`   📊 Stats: ${chalk.cyan(statsLine.join(' • '))}`);
    }
  }

  // Last Modified
  if (project.lastModified) {
    console.log(`   🕒 Last Modified: ${chalk.gray(project.lastModified)}`);
  }

  // Additional checks
  const additionalChecks = [];
  if (project.hasTests !== undefined) {
    additionalChecks.push(project.hasTests ? '✅ Tests' : chalk.dim('⊘ No tests'));
  }
  if (project.hasDocker !== undefined) {
    additionalChecks.push(project.hasDocker ? '✅ Docker' : chalk.dim('⊘ No Docker'));
  }
  if (project.hasCodeQuality !== undefined) {
    const qualityTool =
      project.runtimeFamily === 'node'
        ? 'ESLint'
        : project.runtimeFamily === 'rust'
          ? 'clippy'
          : project.runtimeFamily === 'elixir'
            ? 'Credo'
            : project.runtimeFamily === 'clojure'
              ? 'clj-kondo'
              : project.runtimeFamily === 'deno'
                ? 'deno lint'
                : project.framework === 'Spring Boot'
                  ? 'Static analysis'
                  : project.framework === 'Go/Fiber' || project.framework === 'Go/Gin'
                    ? 'golangci-lint'
                    : project.runtimeFamily === 'python'
                      ? 'Ruff'
                      : 'Lint';
    additionalChecks.push(
      project.hasCodeQuality ? `✅ ${qualityTool}` : chalk.dim(`⊘ No ${qualityTool}`)
    );
  }

  if (additionalChecks.length > 0) {
    console.log(`   ${additionalChecks.join(' • ')}`);
  }

  // Security vulnerabilities
  if (project.vulnerabilities !== undefined && project.vulnerabilities > 0) {
    console.log(
      `   ⚠️  Security: ${chalk.yellow(`${project.vulnerabilities} vulnerability(ies) found`)}`
    );
  }

  if (project.issues.length > 0) {
    console.log(`   ${chalk.bold('Issues:')}`);
    project.issues.forEach((issue) => {
      console.log(`     • ${chalk.yellow(issue)}`);
    });

    // Show fix commands
    if (project.fixCommands && project.fixCommands.length > 0) {
      console.log(`\n   ${chalk.bold.cyan('🔧 Quick Fix:')}`);
      project.fixCommands.forEach((cmd) => {
        console.log(`   ${chalk.cyan('$')} ${chalk.white(cmd)}`);
      });
    }
  }

  if (project.probes && project.probes.length > 0) {
    console.log(`   ${chalk.bold('Probe checks:')}`);
    for (const probe of project.probes) {
      const icon = probe.status === 'pass' ? '✅' : probe.status === 'warn' ? '⚠️' : '❌';
      console.log(`     ${icon} ${probe.label}: ${chalk.gray(probe.reason)}`);
      if (probe.recommendation) {
        console.log(`       ${chalk.dim('↳')} ${chalk.gray(probe.recommendation)}`);
      }
    }
  }

  if (project.commandCapabilities) {
    const caps = project.commandCapabilities;
    console.log(`   ${chalk.bold('Command support:')}`);
    console.log(
      `     ${chalk.green('supported')} ${caps.supportedCommands.length} • ${chalk.yellow('unsupported')} ${caps.unsupportedCommands.length} • ${chalk.gray('global')} ${caps.globalCommands.length}`
    );
    if (caps.unsupportedCommands.length > 0) {
      const preview = caps.unsupportedCommands.slice(0, 8).join(', ');
      const suffix = caps.unsupportedCommands.length > 8 ? ', ...' : '';
      console.log(`     ${chalk.dim('↳')} ${chalk.gray(`Unsupported here: ${preview}${suffix}`)}`);
    }
  }
}

async function canRunGoModTidy(): Promise<boolean> {
  try {
    const result = await execa('go', ['version'], {
      timeout: getProbeTimeoutMs(),
      reject: false,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

type FixRiskLevel = 'safe' | 'guarded' | 'invasive';

type FixStepKind =
  | 'manual-url'
  | 'env-copy'
  | 'rapidkit-init'
  | 'go-mod-tidy'
  | 'dependency-sync'
  | 'shell';

interface FixPlanStep {
  projectName: string;
  projectPath: string;
  originalCommand: string;
  kind: FixStepKind;
  risk: FixRiskLevel;
  executable: boolean;
  reason?: string;
}

interface ProjectSnapshotEntry {
  snapshotRoot: string;
  files: Map<string, string>;
}

interface PlannedFixStep extends FixPlanStep {
  executableInCurrentEnvironment: boolean;
  blockedReason?: string;
}

interface RemediationPlan {
  generatedAt: string;
  fixableProjects: number;
  totalSteps: number;
  executableSteps: number;
  risk: {
    safe: number;
    guarded: number;
    invasive: number;
  };
  steps: PlannedFixStep[];
}

function parseProjectCommandFix(
  cmd: string,
  expectedTailPattern: string
): { projectPath: string } | null {
  const patterns = [
    new RegExp(`^cd\\s+"([^"]+)"\\s*(?:&&|;)\\s*${expectedTailPattern}\\s*$`, 'i'),
    new RegExp(`^cd\\s+'([^']+)'\\s*(?:&&|;)\\s*${expectedTailPattern}\\s*$`, 'i'),
    new RegExp(`^cd\\s+(.+?)\\s*(?:&&|;)\\s*${expectedTailPattern}\\s*$`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = cmd.match(pattern);
    if (match?.[1]) {
      return { projectPath: match[1].trim() };
    }
  }

  return null;
}

function parseEnvCopyFix(cmd: string): { projectPath: string } | null {
  return (
    parseProjectCommandFix(cmd, 'cp\\s+\\.env\\.example\\s+\\.env') ||
    parseProjectCommandFix(cmd, 'copy-item\\s+\\.env\\.example\\s+\\.env')
  );
}

function parseDependencySyncFix(
  cmd: string
): { projectPath: string; command: string; args: string[] } | null {
  const knownPatterns: Array<{ pattern: string; command: string; args: string[] }> = [
    { pattern: 'npm\\s+install', command: 'npm', args: ['install'] },
    { pattern: 'npm\\s+ci', command: 'npm', args: ['ci'] },
    { pattern: 'pnpm\\s+install', command: 'pnpm', args: ['install'] },
    { pattern: 'yarn\\s+install', command: 'yarn', args: ['install'] },
    { pattern: 'poetry\\s+install', command: 'poetry', args: ['install'] },
    {
      pattern: 'pip\\s+install\\s+-r\\s+requirements\\.txt',
      command: 'pip',
      args: ['install', '-r', 'requirements.txt'],
    },
    { pattern: 'composer\\s+install', command: 'composer', args: ['install'] },
    { pattern: 'bundle\\s+install', command: 'bundle', args: ['install'] },
    { pattern: 'dotnet\\s+restore', command: 'dotnet', args: ['restore'] },
    { pattern: 'cargo\\s+fetch', command: 'cargo', args: ['fetch'] },
    { pattern: 'mix\\s+deps\\.get', command: 'mix', args: ['deps.get'] },
    { pattern: 'clojure\\s+-P', command: 'clojure', args: ['-P'] },
    { pattern: 'sbt\\s+compile', command: 'sbt', args: ['compile'] },
  ];

  for (const candidate of knownPatterns) {
    const parsed = parseProjectCommandFix(cmd, candidate.pattern);
    if (parsed) {
      return {
        projectPath: parsed.projectPath,
        command: candidate.command,
        args: candidate.args,
      };
    }
  }

  return null;
}

function classifyFixStep(project: ProjectHealth, cmd: string): FixPlanStep {
  if (/^https?:\/\//i.test(cmd.trim())) {
    return {
      projectName: project.name,
      projectPath: project.path,
      originalCommand: cmd,
      kind: 'manual-url',
      risk: 'safe',
      executable: false,
      reason: 'Manual guidance URL',
    };
  }

  if (parseEnvCopyFix(cmd)) {
    return {
      projectName: project.name,
      projectPath: project.path,
      originalCommand: cmd,
      kind: 'env-copy',
      risk: 'safe',
      executable: true,
      reason: 'Environment seed copy',
    };
  }

  if (parseProjectCommandFix(cmd, 'rapidkit\\s+init')) {
    return {
      projectName: project.name,
      projectPath: project.path,
      originalCommand: cmd,
      kind: 'rapidkit-init',
      risk: 'guarded',
      executable: true,
      reason: 'RapidKit initializer may mutate dependencies and configs',
    };
  }

  if (parseProjectCommandFix(cmd, 'go\\s+mod\\s+tidy')) {
    return {
      projectName: project.name,
      projectPath: project.path,
      originalCommand: cmd,
      kind: 'go-mod-tidy',
      risk: 'guarded',
      executable: true,
      reason: 'Go module graph reconciliation',
    };
  }

  if (parseDependencySyncFix(cmd)) {
    return {
      projectName: project.name,
      projectPath: project.path,
      originalCommand: cmd,
      kind: 'dependency-sync',
      risk: 'guarded',
      executable: true,
      reason: 'Dependency synchronization command',
    };
  }

  return {
    projectName: project.name,
    projectPath: project.path,
    originalCommand: cmd,
    kind: 'shell',
    risk: 'invasive',
    executable: true,
    reason: 'Generic shell command',
  };
}

async function buildRemediationPlan(projects: ProjectHealth[]): Promise<RemediationPlan> {
  const fixableProjects = projects.filter((p) => p.fixCommands && p.fixCommands.length > 0);
  const baseSteps = fixableProjects.flatMap((project) =>
    (project.fixCommands ?? []).map((cmd) => classifyFixStep(project, cmd))
  );

  let goToolchainAvailable: boolean | null = null;
  const steps: PlannedFixStep[] = [];
  let executableSteps = 0;
  let safe = 0;
  let guarded = 0;
  let invasive = 0;

  for (const step of baseSteps) {
    let executableInCurrentEnvironment = step.executable;
    let blockedReason: string | undefined;

    if (step.kind === 'go-mod-tidy') {
      if (goToolchainAvailable === null) {
        goToolchainAvailable = await canRunGoModTidy();
      }
      if (!goToolchainAvailable) {
        executableInCurrentEnvironment = false;
        blockedReason = 'Go toolchain not available';
      }
    }

    if (executableInCurrentEnvironment) {
      executableSteps += 1;
      if (step.risk === 'safe') safe += 1;
      if (step.risk === 'guarded') guarded += 1;
      if (step.risk === 'invasive') invasive += 1;
    }

    steps.push({
      ...step,
      executableInCurrentEnvironment,
      blockedReason,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    fixableProjects: fixableProjects.length,
    totalSteps: steps.length,
    executableSteps,
    risk: {
      safe,
      guarded,
      invasive,
    },
    steps,
  };
}

function looksRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const retryableTokens = [
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'EAI_AGAIN',
    'ENOTFOUND',
    'network',
    '503',
    '504',
  ];
  const lower = message.toLowerCase();
  return retryableTokens.some((token) => lower.includes(token.toLowerCase()));
}

async function ensureProjectSnapshot(
  snapshotCache: Map<string, ProjectSnapshotEntry>,
  projectPath: string
): Promise<ProjectSnapshotEntry> {
  const existing = snapshotCache.get(projectPath);
  if (existing) {
    return existing;
  }

  const snapshotId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const safeProjectName = path.basename(projectPath).replace(/[^a-zA-Z0-9._-]/g, '_');
  const snapshotRoot = path.join(
    projectPath,
    '.rapidkit',
    'reports',
    'fix-snapshots',
    `${safeProjectName}-${snapshotId}`
  );
  await fsExtra.ensureDir(snapshotRoot);

  const candidateFiles = [
    '.env',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'poetry.lock',
    'requirements.txt',
    'go.mod',
    'go.sum',
    'Cargo.lock',
    'composer.lock',
    'Gemfile.lock',
    'pom.xml',
    'build.gradle',
    'build.gradle.kts',
    'gradle.lockfile',
  ];

  const files = new Map<string, string>();
  for (const relativeFile of candidateFiles) {
    const sourcePath = path.join(projectPath, relativeFile);
    if (!(await fsExtra.pathExists(sourcePath))) {
      continue;
    }
    const destinationPath = path.join(snapshotRoot, relativeFile);
    await fsExtra.ensureDir(path.dirname(destinationPath));
    await fsExtra.copy(sourcePath, destinationPath, { overwrite: true });
    files.set(sourcePath, destinationPath);
  }

  const entry: ProjectSnapshotEntry = { snapshotRoot, files };
  snapshotCache.set(projectPath, entry);
  return entry;
}

async function rollbackProjectFromSnapshot(snapshot: ProjectSnapshotEntry): Promise<void> {
  for (const [targetPath, snapshotPath] of snapshot.files.entries()) {
    if (!(await fsExtra.pathExists(snapshotPath))) {
      continue;
    }
    await fsExtra.ensureDir(path.dirname(targetPath));
    await fsExtra.copy(snapshotPath, targetPath, { overwrite: true });
  }
}

async function verifyProjectPostFix(
  projectPath: string
): Promise<{ issues: number; healthy: boolean }> {
  const recheck = await checkProject(projectPath, { allowNonRapidkit: true });
  return {
    issues: recheck.issues.length,
    healthy: recheck.issues.length === 0,
  };
}

async function collectDoctorRemainingBlockers(projects: ProjectHealth[]): Promise<string[]> {
  const blockers: string[] = [];
  for (const project of projects) {
    const recheck = await checkProject(project.path, { allowNonRapidkit: true });
    for (const issue of recheck.issues) {
      if (typeof issue === 'string' && issue.trim()) {
        blockers.push(`${project.name}: ${issue.trim()}`);
      }
    }
  }
  return blockers.slice(0, 24);
}

async function executeFixCommands(
  projects: ProjectHealth[],
  autoFix: boolean = false,
  options: { planOnly?: boolean; skipConfirmation?: boolean; json?: boolean } = {}
): Promise<DoctorFixExecutionResult | void> {
  const remediationPlan = await buildRemediationPlan(projects);
  const fixableProjects = projects.filter((p) => p.fixCommands && p.fixCommands.length > 0);
  const appliedFixes: DoctorAppliedFix[] = [];
  const quiet = options.json === true;
  let goToolchainAvailable: boolean | null = null;
  const goFixBlocked = remediationPlan.steps.some(
    (step) => step.kind === 'go-mod-tidy' && !step.executableInCurrentEnvironment
  );
  const snapshotCache = new Map<string, ProjectSnapshotEntry>();

  if (fixableProjects.length === 0) {
    if (!quiet) {
      console.log(chalk.green('\n✅ No fixes needed - all projects are healthy!'));
    }
    if (autoFix) {
      return buildDoctorFixExecutionResult({
        appliedFixes: [],
        remainingBlockers: [],
        verifyRecommended: DOCTOR_FIX_VERIFY_RECOMMENDED,
      });
    }
    return;
  }

  if (!quiet) {
    console.log(chalk.bold.cyan('\n🔧 Available Fixes:\n'));

    for (const project of fixableProjects) {
      const fixCommands = project.fixCommands ?? [];
      console.log(chalk.bold(`Project: ${chalk.yellow(project.name)}`));
      fixCommands.forEach((cmd, idx) => {
        console.log(`  ${idx + 1}. ${chalk.cyan(cmd)}`);
      });
      console.log();
    }
  }

  if (options.planOnly) {
    if (options.json) {
      console.log(JSON.stringify(remediationPlan, null, 2));
      return;
    }

    console.log(chalk.bold('\n🧭 Remediation Plan\n'));
    console.log(
      chalk.gray(
        `Executable steps: ${remediationPlan.executableSteps}/${remediationPlan.totalSteps} | risk: safe=${remediationPlan.risk.safe}, guarded=${remediationPlan.risk.guarded}, invasive=${remediationPlan.risk.invasive}`
      )
    );

    for (const step of remediationPlan.steps) {
      const state = step.executableInCurrentEnvironment
        ? chalk.green('ready')
        : chalk.yellow(`blocked${step.blockedReason ? ` (${step.blockedReason})` : ''}`);
      console.log(
        `  - ${chalk.cyan(step.projectName)} [${step.risk}] ${step.originalCommand} ${chalk.gray(`=> ${state}`)}`
      );
    }

    console.log(
      chalk.gray(
        '\nUse --apply to execute this plan non-interactively, or --fix for interactive confirmation.'
      )
    );
    return;
  }

  const executableFixCount = remediationPlan.executableSteps;
  const safeSteps = remediationPlan.risk.safe;
  const guardedSteps = remediationPlan.risk.guarded;
  const invasiveSteps = remediationPlan.risk.invasive;

  if (executableFixCount === 0) {
    if (!quiet) {
      console.log(chalk.gray('💡 No automatic fixes can be applied right now.'));
      if (goFixBlocked) {
        console.log(
          chalk.gray(
            '   Install Go to enable go mod tidy fixes, then rerun `rapidkit doctor workspace --fix`.'
          )
        );
      }
    }
    if (autoFix) {
      return buildDoctorFixExecutionResult({
        appliedFixes: [],
        remainingBlockers: await collectDoctorRemainingBlockers(fixableProjects),
        verifyRecommended: DOCTOR_FIX_VERIFY_RECOMMENDED,
      });
    }
    return;
  }

  if (!autoFix) {
    if (!quiet) {
      console.log(
        chalk.gray('💡 Run "npx rapidkit doctor workspace --fix" to apply fixes automatically')
      );
    }
    return;
  }

  if (!quiet) {
    console.log(
      chalk.gray(
        `Risk policy: safe=${safeSteps}, guarded=${guardedSteps}, invasive=${invasiveSteps}. Guarded/invasive fixes use snapshot + rollback.`
      )
    );
  }

  if (!options.skipConfirmation) {
    // Confirm before proceeding
    const { confirm } = await prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Apply ${fixableProjects.reduce((sum, p) => sum + (p.fixCommands?.length ?? 0), 0)} fix(es)?`,
        default: false,
      },
    ]);

    if (!confirm) {
      if (!quiet) {
        console.log(chalk.yellow('\n⚠️  Fixes cancelled by user'));
      }
      return buildDoctorFixExecutionResult({
        appliedFixes: [],
        remainingBlockers: await collectDoctorRemainingBlockers(fixableProjects),
        verifyRecommended: DOCTOR_FIX_VERIFY_RECOMMENDED,
      });
    }
  }

  if (!quiet) {
    console.log(chalk.bold.cyan('\n🚀 Applying fixes...\n'));
  }

  const executedSteps = new Set<string>();

  for (const project of fixableProjects) {
    const fixCommands = project.fixCommands ?? [];
    if (!quiet) {
      console.log(chalk.bold(`Fixing ${chalk.cyan(project.name)}...`));
    }

    for (const cmd of fixCommands) {
      const planStep = classifyFixStep(project, cmd);
      const stepKey = `${project.path}::${cmd}`;
      if (executedSteps.has(stepKey)) {
        continue;
      }
      executedSteps.add(stepKey);

      try {
        console.log(chalk.gray(`  $ ${cmd}`));

        if (planStep.kind === 'manual-url') {
          console.log(chalk.yellow(`  ℹ Manual action required: open ${cmd}`));
          console.log(chalk.green('  ✅ Recorded as guidance\n'));
          continue;
        }

        if (!planStep.executable) {
          console.log(chalk.yellow('  ⚠ Step is non-executable by policy')); // defensive
          console.log(chalk.green('  ✅ Recorded as guidance\n'));
          continue;
        }

        if (planStep.risk !== 'safe') {
          await ensureProjectSnapshot(snapshotCache, planStep.projectPath);
        }

        const envCopyFix = parseEnvCopyFix(cmd);
        if (envCopyFix) {
          const sourcePath = path.join(envCopyFix.projectPath, '.env.example');
          const targetPath = path.join(envCopyFix.projectPath, '.env');

          if (!(await fsExtra.pathExists(sourcePath))) {
            throw new Error(`.env.example not found at ${sourcePath}`);
          }

          if (await fsExtra.pathExists(targetPath)) {
            console.log(chalk.green('  ✅ .env already exists\n'));
            continue;
          }

          await fsExtra.copy(sourcePath, targetPath, { overwrite: false, errorOnExist: false });
          console.log(chalk.green('  ✅ Success\n'));
          continue;
        }

        const rapidkitInitFix = parseProjectCommandFix(cmd, 'rapidkit\\s+init');
        if (rapidkitInitFix) {
          await execa('rapidkit', ['init'], {
            cwd: rapidkitInitFix.projectPath,
            shell: shouldUseShellExecution(),
            stdio: 'inherit',
          });
          console.log(chalk.green('  ✅ Success\n'));
          continue;
        }

        const goModTidyFix = parseProjectCommandFix(cmd, 'go\\s+mod\\s+tidy');
        if (goModTidyFix) {
          if (goToolchainAvailable === null) {
            goToolchainAvailable = await canRunGoModTidy();
          }

          if (!goToolchainAvailable) {
            console.log(
              chalk.yellow(
                '  ⚠ Go toolchain is not installed — skipping go mod tidy; install Go to apply this fix.'
              )
            );
            console.log(chalk.green('  ✅ Recorded as guidance\n'));
            continue;
          }

          await execa('go', ['mod', 'tidy'], {
            cwd: goModTidyFix.projectPath,
            shell: shouldUseShellExecution(),
            stdio: 'inherit',
          });
          console.log(chalk.green('  ✅ Success\n'));
          continue;
        }

        const dependencySync = parseDependencySyncFix(cmd);
        if (dependencySync) {
          const maxAttempts = 2;
          let lastError: unknown;
          for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
              await execa(dependencySync.command, dependencySync.args, {
                cwd: dependencySync.projectPath,
                shell: shouldUseShellExecution(),
                stdio: 'inherit',
              });
              lastError = null;
              break;
            } catch (error) {
              lastError = error;
              if (attempt < maxAttempts && looksRetryableError(error)) {
                console.log(
                  chalk.yellow(`  ⚠ Retrying dependency sync (${attempt}/${maxAttempts - 1})...`)
                );
                continue;
              }
              throw error;
            }
          }

          if (lastError) {
            throw lastError;
          }

          console.log(chalk.green('  ✅ Success\n'));
          continue;
        }

        // Execute the full command through shell for proper command resolution
        const maxAttempts = planStep.kind === 'shell' ? 2 : 1;
        let shellError: unknown;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            await execa(cmd, {
              shell: true,
              stdio: 'inherit',
            });
            shellError = null;
            break;
          } catch (error) {
            shellError = error;
            if (attempt < maxAttempts && looksRetryableError(error)) {
              console.log(chalk.yellow(`  ⚠ Retrying command (${attempt}/${maxAttempts - 1})...`));
              continue;
            }
            throw error;
          }
        }

        if (shellError) {
          throw shellError;
        }

        if (!quiet) {
          console.log(chalk.green(`  ✅ Success\n`));
        }
        appliedFixes.push({
          path: planStep.projectPath,
          action: planStep.kind,
          outcome: 'applied',
          projectName: project.name,
          command: cmd,
        });
      } catch (error) {
        const step = classifyFixStep(project, cmd);
        if (step.risk !== 'safe') {
          const snapshot = snapshotCache.get(step.projectPath);
          if (snapshot) {
            try {
              await rollbackProjectFromSnapshot(snapshot);
              if (!quiet) {
                console.log(chalk.yellow('  ↩ Rolled back snapshot after failed fix'));
              }
            } catch (rollbackError) {
              if (!quiet) {
                console.log(
                  chalk.red(
                    `  ❌ Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
                  )
                );
              }
            }
          }
        }
        if (!quiet) {
          console.log(
            chalk.red(`  ❌ Failed: ${error instanceof Error ? error.message : String(error)}\n`)
          );
        }
        appliedFixes.push({
          path: step.projectPath,
          action: step.kind,
          outcome: 'failed',
          projectName: project.name,
          command: cmd,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }

    try {
      const verification = await verifyProjectPostFix(project.path);
      console.log(
        verification.healthy
          ? chalk.green(`  ✅ Post-fix verification passed for ${project.name}`)
          : chalk.yellow(
              `  ⚠ Post-fix verification: ${verification.issues} issue(s) remain for ${project.name}`
            )
      );
    } catch (verificationError) {
      console.log(
        chalk.yellow(
          `  ⚠ Post-fix verification skipped: ${verificationError instanceof Error ? verificationError.message : String(verificationError)}`
        )
      );
    }
  }

  if (!quiet) {
    console.log(chalk.bold.green('\n✅ Fix process completed!'));
  }

  if (autoFix) {
    return buildDoctorFixExecutionResult({
      appliedFixes,
      remainingBlockers: await collectDoctorRemainingBlockers(fixableProjects),
      verifyRecommended: DOCTOR_FIX_VERIFY_RECOMMENDED,
    });
  }
}

export function computeDoctorGateExitCode(
  healthScore: { errors?: number; warnings?: number } | null | undefined,
  options: { strict?: boolean; ci?: boolean }
): number {
  if (!options.strict && !options.ci) return 0;
  const errors = Number(healthScore?.errors ?? 0);
  const warnings = Number(healthScore?.warnings ?? 0);
  if (errors > 0) return 1;
  if (options.ci && warnings > 0) return 2;
  if (options.strict && warnings > 0) return 1;
  return 0;
}

export async function runDoctor(
  options: {
    workspace?: boolean;
    project?: boolean;
    json?: boolean;
    quiet?: boolean;
    fix?: boolean;
    plan?: boolean;
    apply?: boolean;
    strict?: boolean;
    ci?: boolean;
  } = {}
): Promise<number> {
  const wantsWorkspaceScope = Boolean(options.fix || options.plan || options.apply);
  const autoWorkspacePath =
    !options.workspace && !options.project && wantsWorkspaceScope
      ? await findWorkspace(process.cwd())
      : null;
  const workspaceMode = options.workspace || Boolean(autoWorkspacePath);
  const projectMode = Boolean(options.project) && !workspaceMode;

  if (!options.json) {
    console.log(chalk.bold.cyan('\n🩺 RapidKit Health Check\n'));
  }

  if (workspaceMode) {
    // Workspace mode: check entire workspace
    const workspacePath = autoWorkspacePath ?? (await findWorkspace(process.cwd()));

    if (!workspacePath) {
      logger.error('No RapidKit workspace found in current directory or parents');
      logger.info(
        'Run this command from within a workspace, or use "rapidkit doctor" for system check'
      );
      process.exit(1);
    }

    if (!options.json) {
      if (autoWorkspacePath) {
        console.log(
          chalk.gray('ℹ️  Detected workspace context; enabling workspace checks for --fix')
        );
      }
      console.log(chalk.bold(`Workspace: ${chalk.cyan(path.basename(workspacePath))}`));
      console.log(chalk.gray(`Path: ${workspacePath}`));
    }

    let health = await getWorkspaceHealth(workspacePath);

    if (!options.json) {
      if (health.projectScanCached) {
        console.log(
          chalk.gray(
            `ℹ️  Reused cached project scan${health.projectScanCachePath ? ` (${path.basename(health.projectScanCachePath)})` : ''}`
          )
        );
      }
      if (health.evidencePath) {
        console.log(chalk.gray(`ℹ️  Evidence saved: ${health.evidencePath}`));
      }
    }

    // JSON output mode
    if (options.json) {
      let fixResult: DoctorFixExecutionResult | undefined;
      const remediationPlan = options.plan
        ? await buildRemediationPlan(health.projects)
        : undefined;

      if ((options.fix || options.apply) && !options.plan) {
        fixResult =
          (await executeFixCommands(health.projects, true, {
            skipConfirmation: options.apply === true || options.fix === true,
            json: true,
          })) ??
          buildDoctorFixExecutionResult({
            appliedFixes: [],
            remainingBlockers: [],
            verifyRecommended: DOCTOR_FIX_VERIFY_RECOMMENDED,
          });
        health = await getWorkspaceHealth(workspacePath, false);
      }

      const output = {
        contract: getDoctorContractMetadata(),
        workspace: {
          name: path.basename(workspacePath),
          path: workspacePath,
        },
        cache: {
          projectScan: health.projectScanCached ?? false,
          projectScanPath: health.projectScanCachePath,
          evidencePath: health.evidencePath,
        },
        healthScore: health.healthScore,
        system: {
          python: health.python,
          poetry: health.poetry,
          pipx: health.pipx,
          rapidkitCore: health.rapidkitCore,
          versions: {
            core: health.coreVersion,
            npm: health.npmVersion,
          },
        },
        projects: health.projects.map((project) => serializeDoctorProjectForOutput(project)),
        summary: {
          totalProjects: health.projects.length,
          totalIssues: health.projects.reduce((sum, p) => sum + p.issues.length, 0),
          projectAdvisoryWarningProjects: countProjectAdvisoryWarningProjects(health.projects),
          projectAdvisoryWarnings: countProjectAdvisoryWarnings(health.projects),
          hasSystemErrors: [health.python, health.rapidkitCore].some((c) => c.status === 'error'),
          scopeProvenance: health.scopeProvenance,
        },
        driftDelta: health.driftDelta,
        scoreBreakdown: health.scoreBreakdown ?? [],
        ...(remediationPlan ? { remediationPlan } : {}),
        ...(fixResult
          ? {
              appliedFixes: fixResult.appliedFixes,
              remainingBlockers: fixResult.remainingBlockers,
              verifyRecommended: fixResult.verifyRecommended,
              fixResult,
            }
          : {}),
      };

      if (!options.quiet) {
        console.log(JSON.stringify(output, null, 2));
      }
      return computeDoctorGateExitCode(health.healthScore, options);
    }

    // Render health score
    if (health.healthScore) {
      const score = health.healthScore;
      const percentage = Math.round((score.passed / score.total) * 100);
      const scoreColor =
        percentage >= 80 ? chalk.green : percentage >= 50 ? chalk.yellow : chalk.red;
      const bar =
        '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));

      console.log(chalk.bold('\n📊 Health Score:'));
      console.log(`   ${scoreColor(`${percentage}%`)} ${chalk.gray(bar)}`);
      console.log(
        `   ${chalk.green(`✅ ${score.passed} passed`)} ${chalk.gray('|')} ${chalk.yellow(`⚠️ ${score.warnings} warnings`)} ${chalk.gray('|')} ${chalk.red(`❌ ${score.errors} errors`)}`
      );
    }

    console.log(chalk.bold('\n\nSystem Tools:\n'));
    renderHealthCheck(health.python, 'Python');
    renderHealthCheck(health.poetry, 'Poetry');
    renderHealthCheck(health.pipx, 'pipx');
    renderHealthCheck(health.go, 'Go');
    renderHealthCheck(health.rapidkitCore, 'RapidKit Core');

    // Version compatibility warning
    if (health.coreVersion && health.npmVersion) {
      const coreMinor = health.coreVersion.split('.')[1];
      const npmMinor = health.npmVersion.split('.')[1];

      if (coreMinor !== npmMinor) {
        console.log(
          chalk.yellow(
            `\n⚠️  Version mismatch: Core ${health.coreVersion} / CLI ${health.npmVersion}`
          )
        );
        console.log(chalk.gray('   Consider updating to matching versions for best compatibility'));
      }
    }

    if (health.projects.length > 0) {
      console.log(chalk.bold(`\n📦 Projects (${health.projects.length}):`));
      health.projects.forEach((project) => renderProjectHealth(project));
    } else {
      console.log(chalk.bold('\n📦 Projects:'));
      console.log(chalk.gray('   No RapidKit projects found in workspace'));
    }

    // Summary
    const totalIssues = health.projects.reduce((sum, p) => sum + p.issues.length, 0);
    const advisoryWarningProjects = countProjectAdvisoryWarningProjects(health.projects);
    const hasSystemIssues = [health.python, health.rapidkitCore].some((c) => c.status === 'error');

    if (hasSystemIssues || totalIssues > 0 || advisoryWarningProjects > 0) {
      const advisorySummary =
        advisoryWarningProjects > 0
          ? ` and ${advisoryWarningProjects} advisory warning project(s)`
          : '';
      console.log(
        chalk.bold.yellow(`\n⚠️  Found ${totalIssues} project issue(s)${advisorySummary}`)
      );
      if (hasSystemIssues) {
        console.log(chalk.bold.red('❌ System requirements not met'));
      }

      // Plan or execute fixes when requested
      if (options.plan) {
        await executeFixCommands(health.projects, false, {
          planOnly: true,
          json: options.json,
        });
      } else if (options.fix || options.apply) {
        await executeFixCommands(health.projects, true, {
          skipConfirmation: options.apply === true,
        });

        if (!options.json) {
          const refreshedHealth = await getWorkspaceHealth(workspacePath, false);
          const refreshedTotalIssues = refreshedHealth.projects.reduce(
            (sum, p) => sum + p.issues.length,
            0
          );
          const refreshedHasSystemIssues = [
            refreshedHealth.python,
            refreshedHealth.rapidkitCore,
          ].some((c) => c.status === 'error');

          if (refreshedHasSystemIssues || refreshedTotalIssues > 0) {
            console.log(
              chalk.bold.yellow(
                `\n⚠️  Post-fix verification found ${refreshedTotalIssues} remaining issue(s)`
              )
            );
            if (refreshedHasSystemIssues) {
              console.log(chalk.bold.red('❌ System requirements still not met'));
            }
          } else {
            console.log(
              chalk.bold.green('\n✅ Post-fix verification passed. Workspace is healthy.')
            );
          }

          if (refreshedHealth.projectScanCached) {
            console.log(
              chalk.gray(
                `ℹ️  Reused cached project scan${refreshedHealth.projectScanCachePath ? ` (${path.basename(refreshedHealth.projectScanCachePath)})` : ''}`
              )
            );
          }

          if (refreshedHealth.evidencePath) {
            console.log(chalk.gray(`ℹ️  Evidence refreshed: ${refreshedHealth.evidencePath}`));
          }
        }
      } else if (totalIssues > 0) {
        await executeFixCommands(health.projects, false);
      }
    } else {
      console.log(chalk.bold.green('\n✅ All checks passed! Workspace is healthy.'));
    }

    return computeDoctorGateExitCode(health.healthScore, options);
  } else if (projectMode) {
    const projectPath = await findProjectRoot(process.cwd());

    if (!projectPath) {
      const workspacePath = await findWorkspace(process.cwd());
      if (workspacePath) {
        logger.error('No backend project found in current directory within this workspace');
        logger.info('Run this command from inside a project directory in the workspace');
      } else {
        logger.error('No RapidKit project found in current directory or parents');
      }
      logger.info(
        'Run this command from within a project, or use "rapidkit doctor workspace" for workspace checks'
      );
      process.exit(1);
    }

    const envelope = await getProjectHealthEnvelope(projectPath);
    const reportedWorkspacePath = envelope.workspacePath
      ? normalizeReportedPath(envelope.workspacePath)
      : null;
    const reportedProjectPath = normalizeReportedPath(envelope.project.path);

    if (options.json) {
      const remediationPlan = options.plan
        ? await buildRemediationPlan([envelope.project])
        : undefined;
      const output = {
        contract: getDoctorContractMetadata(),
        scope: 'project',
        workspace: reportedWorkspacePath
          ? {
              name: path.basename(reportedWorkspacePath),
              path: reportedWorkspacePath,
            }
          : null,
        project: {
          ...serializeDoctorProjectForOutput(envelope.project),
          path: reportedProjectPath,
        },
        evidencePath: envelope.evidencePath,
        healthScore: envelope.healthScore,
        system: {
          python: envelope.python,
          poetry: envelope.poetry,
          pipx: envelope.pipx,
          go: envelope.go,
          rapidkitCore: envelope.rapidkitCore,
        },
        summary: {
          totalProjects: 1,
          totalIssues: envelope.project.issues.length,
          projectAdvisoryWarningProjects:
            getProjectAdvisoryWarningCount(envelope.project) > 0 ? 1 : 0,
          projectAdvisoryWarnings: getProjectAdvisoryWarningCount(envelope.project),
          hasSystemErrors: [envelope.python, envelope.rapidkitCore].some(
            (c) => c.status === 'error'
          ),
          scopeProvenance: envelope.scopeProvenance,
        },
        driftDelta: envelope.driftDelta,
        scoreBreakdown: envelope.scoreBreakdown ?? [],
        ...(remediationPlan ? { remediationPlan } : {}),
      };

      if (!options.quiet) {
        console.log(JSON.stringify(output, null, 2));
      }
      return computeDoctorGateExitCode(envelope.healthScore, options);
    }

    console.log(chalk.bold(`Project: ${chalk.cyan(path.basename(projectPath))}`));
    console.log(chalk.gray(`Path: ${projectPath}`));
    if (envelope.workspacePath) {
      console.log(chalk.gray(`Workspace: ${path.basename(envelope.workspacePath)}`));
    }
    if (envelope.evidencePath) {
      console.log(chalk.gray(`ℹ️  Evidence saved: ${envelope.evidencePath}`));
    }

    const score = envelope.healthScore;
    const percentage = score.total > 0 ? Math.round((score.passed / score.total) * 100) : 0;
    const scoreColor = percentage >= 80 ? chalk.green : percentage >= 50 ? chalk.yellow : chalk.red;
    const bar =
      '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));

    console.log(chalk.bold('\n📊 Health Score:'));
    console.log(`   ${scoreColor(`${percentage}%`)} ${chalk.gray(bar)}`);
    console.log(
      `   ${chalk.green(`✅ ${score.passed} passed`)} ${chalk.gray('|')} ${chalk.yellow(`⚠️ ${score.warnings} warnings`)} ${chalk.gray('|')} ${chalk.red(`❌ ${score.errors} errors`)}`
    );

    console.log(chalk.bold('\n\nSystem Tools:\n'));
    renderHealthCheck(envelope.python, 'Python');
    renderHealthCheck(envelope.poetry, 'Poetry');
    renderHealthCheck(envelope.pipx, 'pipx');
    renderHealthCheck(envelope.go, 'Go');
    renderHealthCheck(envelope.rapidkitCore, 'RapidKit Core');

    console.log(chalk.bold('\n📦 Project (1):'));
    renderProjectHealth(envelope.project);

    const hasSystemIssues = [envelope.python, envelope.rapidkitCore].some(
      (c) => c.status === 'error'
    );
    const issueCount = envelope.project.issues.length;
    const advisoryWarningCount = getProjectAdvisoryWarningCount(envelope.project);

    if (hasSystemIssues || issueCount > 0 || advisoryWarningCount > 0) {
      const advisorySummary =
        advisoryWarningCount > 0 ? ` and ${advisoryWarningCount} advisory warning(s)` : '';
      console.log(
        chalk.bold.yellow(`\n⚠️  Found ${issueCount} project issue(s)${advisorySummary}`)
      );
      if (hasSystemIssues) {
        console.log(chalk.bold.red('❌ System requirements not met'));
      }

      if (options.plan) {
        await executeFixCommands([envelope.project], false, {
          planOnly: true,
          json: options.json,
        });
      } else if (options.fix || options.apply) {
        await executeFixCommands([envelope.project], true, {
          skipConfirmation: options.apply === true,
        });
      } else if (issueCount > 0) {
        await executeFixCommands([envelope.project], false);
      }
    } else {
      console.log(chalk.bold.green('\n✅ All checks passed! Project is healthy.'));
    }

    return computeDoctorGateExitCode(envelope.healthScore, options);
  } else {
    // System mode: check system tools only
    console.log(chalk.bold('System Tools:\n'));

    const systemChecks = await collectSystemChecks();
    const python = systemChecks.python;
    const poetry = systemChecks.poetry;
    const pipx = systemChecks.pipx;
    const go = systemChecks.go;
    const core = systemChecks.rapidkitCore;

    renderHealthCheck(python, 'Python');
    renderHealthCheck(poetry, 'Poetry');
    renderHealthCheck(pipx, 'pipx');
    renderHealthCheck(go, 'Go');
    renderHealthCheck(core, 'RapidKit Core');

    const hasErrors = [python, core].some((c) => c.status === 'error');

    if (hasErrors) {
      console.log(chalk.bold.red('\n❌ Some required tools are missing'));
      if (options.fix || options.apply) {
        console.log(
          chalk.gray(
            '\nTip: Project auto-fix runs in workspace mode. Run from a workspace and use "rapidkit doctor workspace --fix"'
          )
        );
      }
      console.log(
        chalk.gray(
          '\nTip: Run "rapidkit doctor workspace" for workspace-wide checks, or "rapidkit doctor project" for the current project'
        )
      );
    } else {
      console.log(chalk.bold.green('\n✅ All required tools are installed!'));
      if (options.fix || options.apply) {
        console.log(
          chalk.gray(
            '\nTip: Project auto-fix runs in workspace mode. Run from a workspace and use "rapidkit doctor workspace --fix"'
          )
        );
      }
      console.log(
        chalk.gray(
          '\nTip: Run "rapidkit doctor workspace" for workspace-wide checks, or "rapidkit doctor project" for the current project'
        )
      );
    }

    console.log('');

    const systemErrors = [python, core].filter((c) => c.status === 'error').length;
    if (options.strict || options.ci) {
      if (systemErrors > 0) return 1;
    }
    return 0;
  }
}
