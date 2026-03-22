import chalk from 'chalk';
import { execa } from 'execa';
import fsExtra from 'fs-extra';
import path from 'path';
import { logger } from './logger.js';
import inquirer from 'inquirer';
import {
  getPythonCommandCandidates,
  getRapidkitLocalScriptCandidates,
  getUserLocalBinCandidates,
  getVenvRapidkitPath,
  getVenvPythonPath,
  isWindowsPlatform,
  shouldUseShellExecution,
} from './utils/platform-capabilities.js';

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
  framework?: 'FastAPI' | 'NestJS' | 'Go/Fiber' | 'Go/Gin' | 'Unknown';
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
}

interface DoctorWorkspaceCacheEntry {
  signature: string;
  generatedAt: string;
  projects: ProjectHealth[];
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
    'go.mod',
    'go.sum',
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

  return [...workspaceSignature, ...projectSignatures].join('||');
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
    await fsExtra.writeJSON(
      evidencePath,
      {
        generatedAt: new Date().toISOString(),
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
          hasSystemErrors: [health.python, health.rapidkitCore].some((c) => c.status === 'error'),
        },
      },
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
      return {
        status: 'ok',
        message: `RapidKit Core ${primaryVersion}`,
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

async function performCommonChecks(projectPath: string, health: ProjectHealth): Promise<void> {
  // Docker check
  const dockerfilePath = path.join(projectPath, 'Dockerfile');
  health.hasDocker = await fsExtra.pathExists(dockerfilePath);

  // Tests check
  const testsPath = path.join(projectPath, 'tests');
  const testPath = path.join(projectPath, 'test');
  const hasTestDir = (await fsExtra.pathExists(testsPath)) || (await fsExtra.pathExists(testPath));

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

  // Code Quality checks
  if (health.framework === 'NestJS') {
    // ESLint for NestJS
    const eslintPath = path.join(projectPath, '.eslintrc.js');
    const eslintJsonPath = path.join(projectPath, '.eslintrc.json');
    health.hasCodeQuality =
      (await fsExtra.pathExists(eslintPath)) || (await fsExtra.pathExists(eslintJsonPath));
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
  } else if (health.framework === 'FastAPI') {
    // Ruff for FastAPI
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
  }

  // Security check - try to detect vulnerabilities
  try {
    if (health.framework === 'NestJS') {
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
    } else if (health.framework === 'FastAPI') {
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

async function checkProject(projectPath: string): Promise<ProjectHealth> {
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

  // Check for .rapidkit directory
  const rapidkitDir = path.join(projectPath, '.rapidkit');
  if (!(await fsExtra.pathExists(rapidkitDir))) {
    health.issues.push('Not a valid RapidKit project (missing .rapidkit directory)');
    return health;
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

  // Detect project type (Go/Fiber, Python FastAPI, or Node.js NestJS)
  const packageJsonPath = path.join(projectPath, 'package.json');
  const pyprojectTomlPath = path.join(projectPath, 'pyproject.toml');
  const goModPath = path.join(projectPath, 'go.mod');

  const isGoProject =
    (await fsExtra.pathExists(goModPath)) ||
    projectJsonData?.runtime === 'go' ||
    (typeof projectJsonData?.kit_name === 'string' &&
      ((projectJsonData.kit_name as string).startsWith('gofiber') ||
        (projectJsonData.kit_name as string).startsWith('gogin')));

  // Go project checks (Fiber or Gin)
  if (isGoProject) {
    const kitName = (projectJsonData?.kit_name as string | undefined) ?? '';
    health.framework = kitName.startsWith('gogin') ? 'Go/Gin' : 'Go/Fiber';
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
    return health;
  }

  const isNodeProject = await fsExtra.pathExists(packageJsonPath);
  const isPythonProject = await fsExtra.pathExists(pyprojectTomlPath);

  // Node.js/NestJS project checks
  if (isNodeProject) {
    health.framework = 'NestJS';
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
      health.fixCommands?.push(buildProjectFixCommand(projectPath, 'rapidkit init'));
    }

    // Node.js projects don't need Python venv
    health.coreInstalled = false; // N/A for Node.js

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

    // Check for TypeScript modules (src/)
    const srcPath = path.join(projectPath, 'src');
    health.modulesHealthy = true;
    health.missingModules = [];

    if (await fsExtra.pathExists(srcPath)) {
      try {
        const modules = await fsExtra.readdir(srcPath);
        // Basic check - if src exists and has files, consider it healthy
        health.modulesHealthy = modules.length > 0;
      } catch {
        health.modulesHealthy = false;
      }
    }

    // Common checks for both Node.js and Python
    await performCommonChecks(projectPath, health);

    return health;
  }

  // Python/FastAPI project checks
  if (isPythonProject) {
    health.framework = 'FastAPI';

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

        // Check if dependencies are installed
        // Try to import a common package to verify installation
        try {
          await execa(pythonPath, ['-c', 'import fastapi'], { timeout: 2000 });
          health.depsInstalled = true;
        } catch {
          // Fallback: check if site-packages has content
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

    return health;
  }

  // If neither package.json nor pyproject.toml, return basic health
  health.issues.push('Unknown project type (no package.json or pyproject.toml)');

  await performCommonChecks(projectPath, health);
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
  let currentPath = startPath;
  const root = path.parse(currentPath).root;

  while (currentPath !== root) {
    // Check for workspace marker files (multiple formats)
    const markerFiles = [
      path.join(currentPath, '.rapidkit-workspace'), // npm CLI workspace marker
      path.join(currentPath, '.rapidkit', 'workspace-marker.json'), // alternative format
      path.join(currentPath, '.rapidkit', 'config.json'), // VS Code extension format
    ];

    for (const markerFile of markerFiles) {
      if (await fsExtra.pathExists(markerFile)) {
        return currentPath;
      }
    }

    currentPath = path.dirname(currentPath);
  }

  return null;
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
    // Go projects: venvActive is set true (N/A) — use depsInstalled + no issues
    const isHealthy = project.isGoProject
      ? project.issues.length === 0 && project.depsInstalled
      : project.issues.length === 0 && project.venvActive && project.depsInstalled;
    if (isHealthy) {
      passed++;
    } else if (project.issues.length > 0) {
      warnings++;
    }
  });

  const total = passed + warnings + errors;
  return { total, passed, warnings, errors };
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
    health.projectScanCached = true;
    logger.debug(`Workspace project health cache hit: ${cachePath}`);
  } else {
    try {
      const projectHealthResults = await Promise.all(
        projectPaths.map((projectPath) => checkProject(projectPath))
      );
      health.projects = projectHealthResults;
      health.projectScanCached = false;
      await saveWorkspaceProjectCache(cachePath, {
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

  // Extract version info
  if (health.rapidkitCore.status === 'ok') {
    const versionMatch = health.rapidkitCore.message.match(/([\d.]+(?:rc\d+)?(?:a\d+)?(?:b\d+)?)/);
    if (versionMatch) {
      health.coreVersion = versionMatch[1];
    }
  }

  health.evidencePath = await writeDoctorEvidence(workspacePath, health, cached ? cachePath : null);

  return health;
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
  } else if (check.details) {
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
      project.framework === 'FastAPI'
        ? '🐍'
        : project.framework === 'NestJS'
          ? '🦅'
          : project.framework === 'Go/Fiber'
            ? '🐹'
            : project.framework === 'Go/Gin'
              ? '🐹'
              : '📦';
    console.log(
      `   ${frameworkIcon} Framework: ${chalk.cyan(project.framework)}${project.kit ? chalk.gray(` (${project.kit})`) : ''}`
    );
  }

  console.log(`   ${chalk.gray(`Path: ${project.path}`)}`);

  // Detect project type based on what was checked
  const isGoProject = project.isGoProject === true;
  const isNodeProject = !isGoProject && project.venvActive && !project.coreInstalled;
  const isPythonProject = !isGoProject && !isNodeProject;

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

  // Module health check
  if (project.modulesHealthy !== undefined) {
    if (project.modulesHealthy) {
      console.log(`   ✅ Modules: ${chalk.green('Healthy')}`);
    } else if (project.missingModules && project.missingModules.length > 0) {
      console.log(
        `   ⚠️  Modules: ${chalk.yellow(`Missing ${project.missingModules.length} init file(s)`)}`
      );
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
      project.framework === 'NestJS'
        ? 'ESLint'
        : project.framework === 'Go/Fiber' || project.framework === 'Go/Gin'
          ? 'golangci-lint'
          : 'Ruff';
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
}

async function canRunGoModTidy(): Promise<boolean> {
  try {
    const result = await execa('go', ['version'], {
      timeout: 3000,
      reject: false,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function executeFixCommands(
  projects: ProjectHealth[],
  autoFix: boolean = false
): Promise<void> {
  const fixableProjects = projects.filter((p) => p.fixCommands && p.fixCommands.length > 0);
  let goToolchainAvailable: boolean | null = null;

  if (fixableProjects.length === 0) {
    console.log(chalk.green('\n✅ No fixes needed - all projects are healthy!'));
    return;
  }

  console.log(chalk.bold.cyan('\n🔧 Available Fixes:\n'));

  for (const project of fixableProjects) {
    console.log(chalk.bold(`Project: ${chalk.yellow(project.name)}`));
    project.fixCommands!.forEach((cmd, idx) => {
      console.log(`  ${idx + 1}. ${chalk.cyan(cmd)}`);
    });
    console.log();
  }

  let executableFixCount = 0;
  for (const project of fixableProjects) {
    for (const cmd of project.fixCommands!) {
      if (/^https?:\/\//i.test(cmd.trim())) {
        continue;
      }

      if (
        parseProjectCommandFix(cmd, 'cp\\s+\\.env\\.example\\s+\\.env') ||
        parseProjectCommandFix(cmd, 'copy-item\\s+\\.env\\.example\\s+\\.env') ||
        parseProjectCommandFix(cmd, 'rapidkit\\s+init')
      ) {
        executableFixCount += 1;
        continue;
      }

      const goModTidyFix = parseProjectCommandFix(cmd, 'go\\s+mod\\s+tidy');
      if (goModTidyFix) {
        if (goToolchainAvailable === null) {
          goToolchainAvailable = await canRunGoModTidy();
        }
        if (goToolchainAvailable) {
          executableFixCount += 1;
        }
        continue;
      }

      executableFixCount += 1;
    }
  }

  if (executableFixCount === 0) {
    console.log(chalk.gray('💡 No automatic fixes can be applied right now.'));
    if (goToolchainAvailable === false) {
      console.log(
        chalk.gray(
          '   Install Go to enable go mod tidy fixes, then rerun `rapidkit doctor workspace --fix`.'
        )
      );
    }
    return;
  }

  if (!autoFix) {
    console.log(
      chalk.gray('💡 Run "npx rapidkit doctor workspace --fix" to apply fixes automatically')
    );
    return;
  }

  // Confirm before proceeding
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Apply ${fixableProjects.reduce((sum, p) => sum + p.fixCommands!.length, 0)} fix(es)?`,
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow('\n⚠️  Fixes cancelled by user'));
    return;
  }

  console.log(chalk.bold.cyan('\n🚀 Applying fixes...\n'));

  const isManualUrlFix = (cmd: string): boolean => /^https?:\/\//i.test(cmd.trim());

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

  for (const project of fixableProjects) {
    console.log(chalk.bold(`Fixing ${chalk.cyan(project.name)}...`));

    for (const cmd of project.fixCommands!) {
      try {
        console.log(chalk.gray(`  $ ${cmd}`));

        if (isManualUrlFix(cmd)) {
          console.log(chalk.yellow(`  ℹ Manual action required: open ${cmd}`));
          console.log(chalk.green('  ✅ Recorded as guidance\n'));
          continue;
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

        // Execute the full command through shell for proper command resolution
        await execa(cmd, {
          shell: true,
          stdio: 'inherit',
        });

        console.log(chalk.green(`  ✅ Success\n`));
      } catch (error) {
        console.log(
          chalk.red(`  ❌ Failed: ${error instanceof Error ? error.message : String(error)}\n`)
        );
      }
    }
  }

  console.log(chalk.bold.green('\n✅ Fix process completed!'));
}

export async function runDoctor(
  options: { workspace?: boolean; json?: boolean; fix?: boolean } = {}
): Promise<void> {
  const autoWorkspacePath =
    !options.workspace && options.fix ? await findWorkspace(process.cwd()) : null;
  const workspaceMode = options.workspace || Boolean(autoWorkspacePath);

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

    const health = await getWorkspaceHealth(workspacePath);

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
      const output = {
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
        projects: health.projects.map((p) => ({
          name: p.name,
          path: p.path,
          venvActive: p.venvActive,
          depsInstalled: p.depsInstalled,
          coreInstalled: p.coreInstalled,
          coreVersion: p.coreVersion,
          issues: p.issues,
          fixCommands: p.fixCommands,
        })),
        summary: {
          totalProjects: health.projects.length,
          totalIssues: health.projects.reduce((sum, p) => sum + p.issues.length, 0),
          hasSystemErrors: [health.python, health.rapidkitCore].some((c) => c.status === 'error'),
        },
      };

      console.log(JSON.stringify(output, null, 2));
      return;
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
    const hasSystemIssues = [health.python, health.rapidkitCore].some((c) => c.status === 'error');

    if (hasSystemIssues || totalIssues > 0) {
      console.log(chalk.bold.yellow(`\n⚠️  Found ${totalIssues} project issue(s)`));
      if (hasSystemIssues) {
        console.log(chalk.bold.red('❌ System requirements not met'));
      }

      // Execute fixes if requested
      if (options.fix) {
        await executeFixCommands(health.projects, true);

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
      if (options.fix) {
        console.log(
          chalk.gray(
            '\nTip: Project auto-fix runs in workspace mode. Run from a workspace and use "rapidkit doctor workspace --fix"'
          )
        );
      }
      console.log(chalk.gray('\nTip: Run "rapidkit doctor workspace" for detailed project checks'));
    } else {
      console.log(chalk.bold.green('\n✅ All required tools are installed!'));
      if (options.fix) {
        console.log(
          chalk.gray(
            '\nTip: Project auto-fix runs in workspace mode. Run from a workspace and use "rapidkit doctor workspace --fix"'
          )
        );
      }
      console.log(chalk.gray('\nTip: Run "rapidkit doctor workspace" for detailed project checks'));
    }
  }

  console.log('');
}
