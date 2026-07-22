import type { Dirent } from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';

import {
  buildCommandRepairCapability,
  buildFileAppendRepairCapability,
  buildFileCreateRepairCapability,
  buildFileCopyRepairCapability,
  buildMakefileTargetRepairCapability,
  buildPackageScriptRepairCapability,
  type DoctorRepairCapability,
} from './doctor-repair-capabilities.js';

export type DoctorSurfaceRuntimeFamily =
  | 'python'
  | 'node'
  | 'go'
  | 'java'
  | 'rust'
  | 'elixir'
  | 'clojure'
  | 'deno'
  | 'bun'
  | 'php'
  | 'ruby'
  | 'dotnet'
  | 'unknown';

export type DoctorSurfaceProjectKind = 'backend' | 'frontend' | 'fullstack' | 'generic';

export interface DoctorSurfaceProbe {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  severity: 'info' | 'warn' | 'error';
  scope: 'project-scoped';
  reason: string;
  recommendation?: string;
  repairCapability?: DoctorRepairCapability;
}

type SurfaceInput = {
  projectPath: string;
  runtimeFamily?: DoctorSurfaceRuntimeFamily | string;
  projectKind?: DoctorSurfaceProjectKind;
  framework?: string;
  packageJsonData?: Record<string, unknown> | null;
  hasTests?: boolean;
  hasDocker?: boolean;
  vulnerabilities?: number;
};

const DEPENDENCY_LOCKFILES: Record<DoctorSurfaceRuntimeFamily, string[]> = {
  node: ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'],
  deno: ['deno.lock'],
  bun: ['bun.lock', 'bun.lockb'],
  python: ['uv.lock', 'poetry.lock', 'requirements.txt', 'requirements.lock'],
  go: ['go.sum'],
  java: ['gradle.lockfile', 'gradle/libs.versions.toml'],
  rust: ['Cargo.lock'],
  elixir: ['mix.lock'],
  clojure: ['deps.edn', 'project.clj'],
  php: ['composer.lock'],
  ruby: ['Gemfile.lock'],
  dotnet: ['packages.lock.json', 'Directory.Packages.props'],
  unknown: [],
};

const DEPENDENCY_MANIFESTS: Record<DoctorSurfaceRuntimeFamily, string[]> = {
  node: ['package.json'],
  deno: ['deno.json', 'deno.jsonc'],
  bun: ['package.json', 'bunfig.toml'],
  python: ['pyproject.toml', 'requirements.txt', 'setup.py'],
  go: ['go.mod'],
  java: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
  rust: ['Cargo.toml'],
  elixir: ['mix.exs'],
  clojure: ['deps.edn', 'project.clj'],
  php: ['composer.json'],
  ruby: ['Gemfile'],
  dotnet: ['*.csproj', '*.sln'],
  unknown: [],
};

const DEFAULT_DOCKERIGNORE = [
  'node_modules',
  '.git',
  '.workspai/reports',
  '.venv',
  'dist',
  'build',
  'coverage',
  '.env',
  '.env.*',
  '!.env.example',
].join('\n');

const DEFAULT_SECRET_GITIGNORE_LINES = ['.env', '.env.*', '!.env.example'];

type DependencyBaselineRepair = {
  command: string;
  title: string;
  files: string[];
  limitations?: string[];
};

type RuntimeCommandContractKind = 'test' | 'quality' | 'security';

type RuntimeCommandContract = {
  command: string;
  title: string;
  targetName: string;
  files: string[];
  limitations?: string[];
};

function normalizeRuntime(runtime: string | undefined): DoctorSurfaceRuntimeFamily {
  if (!runtime) return 'unknown';
  if (runtime === 'bun') return 'node';
  if (
    runtime === 'python' ||
    runtime === 'node' ||
    runtime === 'go' ||
    runtime === 'java' ||
    runtime === 'rust' ||
    runtime === 'elixir' ||
    runtime === 'clojure' ||
    runtime === 'deno' ||
    runtime === 'php' ||
    runtime === 'ruby' ||
    runtime === 'dotnet'
  ) {
    return runtime;
  }
  return 'unknown';
}

async function anyPathExists(projectPath: string, candidates: string[]): Promise<boolean> {
  for (const candidate of candidates) {
    if (candidate.includes('*')) {
      const suffix = candidate.replace('*', '');
      if (await hasFileWithSuffix(projectPath, suffix, 2)) {
        return true;
      }
      continue;
    }
    if (await fsExtra.pathExists(path.join(projectPath, candidate))) {
      return true;
    }
  }
  return false;
}

async function hasFileWithSuffix(root: string, suffix: string, maxDepth: number): Promise<boolean> {
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  const ignored = new Set([
    'node_modules',
    '.git',
    '.workspai',
    '.rapidkit',
    'dist',
    'build',
    'coverage',
  ]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    let entries: Dirent[] = [];
    try {
      entries = await fsExtra.readdir(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (ignored.has(entry.name)) continue;
      const fullPath = path.join(current.dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(suffix)) {
        return true;
      }
      if (entry.isDirectory() && current.depth < maxDepth && !entry.name.startsWith('.')) {
        queue.push({ dir: fullPath, depth: current.depth + 1 });
      }
    }
  }

  return false;
}

async function readTextIfExists(filePath: string): Promise<string> {
  try {
    if (!(await fsExtra.pathExists(filePath))) return '';
    return await fsExtra.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function collectTextFromExisting(projectPath: string, candidates: string[]): Promise<string> {
  const chunks: string[] = [];
  for (const candidate of candidates) {
    const text = await readTextIfExists(path.join(projectPath, candidate));
    if (text) chunks.push(text);
  }
  return chunks.join('\n');
}

async function inferDependencyBaselineRepair(input: {
  projectPath: string;
  runtime: DoctorSurfaceRuntimeFamily;
  packageJsonData?: Record<string, unknown> | null;
}): Promise<DependencyBaselineRepair | null> {
  if (input.runtime === 'node') {
    const packageManager =
      typeof input.packageJsonData?.packageManager === 'string'
        ? input.packageJsonData.packageManager.split('@')[0]
        : null;
    const command =
      packageManager === 'pnpm'
        ? 'pnpm install'
        : packageManager === 'yarn'
          ? 'yarn install'
          : packageManager === 'bun'
            ? 'bun install'
            : 'npm install';
    return {
      command,
      title: 'Generate Node dependency lockfile',
      files: ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock'],
      limitations: ['Review dependency and lockfile changes before committing.'],
    };
  }

  if (
    input.runtime === 'go' &&
    (await fsExtra.pathExists(path.join(input.projectPath, 'go.mod')))
  ) {
    return {
      command: 'go mod tidy',
      title: 'Reconcile Go module graph',
      files: ['go.mod', 'go.sum'],
      limitations: ['Review go.mod/go.sum changes before committing.'],
    };
  }

  if (input.runtime === 'java') {
    const hasPom = await fsExtra.pathExists(path.join(input.projectPath, 'pom.xml'));
    const hasMavenWrapper =
      (await fsExtra.pathExists(path.join(input.projectPath, 'mvnw'))) ||
      (await fsExtra.pathExists(path.join(input.projectPath, 'mvnw.cmd')));
    const hasGradleWrapper =
      (await fsExtra.pathExists(path.join(input.projectPath, 'gradlew'))) ||
      (await fsExtra.pathExists(path.join(input.projectPath, 'gradlew.bat')));
    const command = hasPom
      ? hasMavenWrapper
        ? process.platform === 'win32'
          ? '.\\mvnw.cmd -B -DskipTests dependency:go-offline'
          : './mvnw -B -DskipTests dependency:go-offline'
        : 'mvn -B -DskipTests dependency:go-offline'
      : hasGradleWrapper
        ? process.platform === 'win32'
          ? '.\\gradlew.bat dependencies'
          : './gradlew dependencies'
        : 'gradle dependencies';
    return {
      command,
      title: 'Prepare Java dependency baseline',
      files: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'gradle.lockfile'],
      limitations: ['Review resolved dependency and lockfile changes before committing.'],
    };
  }

  if (input.runtime === 'rust') {
    return {
      command: 'cargo fetch',
      title: 'Generate Rust dependency baseline',
      files: ['Cargo.toml', 'Cargo.lock'],
      limitations: ['Review Cargo.lock changes before committing.'],
    };
  }

  if (input.runtime === 'php') {
    return {
      command: 'composer install',
      title: 'Generate Composer lockfile',
      files: ['composer.json', 'composer.lock'],
      limitations: ['Review composer.lock changes before committing.'],
    };
  }

  if (input.runtime === 'ruby') {
    return {
      command: 'bundle install',
      title: 'Generate Bundler lockfile',
      files: ['Gemfile', 'Gemfile.lock'],
      limitations: ['Review Gemfile.lock changes before committing.'],
    };
  }

  if (input.runtime === 'dotnet') {
    return {
      command: 'dotnet restore',
      title: '.NET dependency restore',
      files: ['*.sln', '*.csproj', 'packages.lock.json', 'Directory.Packages.props'],
      limitations: [
        'Enable NuGet lock files in the project when release policy requires deterministic restore.',
      ],
    };
  }

  if (input.runtime === 'elixir') {
    return {
      command: 'mix deps.get',
      title: 'Generate Elixir dependency lockfile',
      files: ['mix.exs', 'mix.lock'],
      limitations: ['Review mix.lock changes before committing.'],
    };
  }

  if (input.runtime === 'clojure') {
    return {
      command: 'clojure -P',
      title: 'Prepare Clojure dependency baseline',
      files: ['deps.edn', 'project.clj'],
      limitations: ['Review dependency cache and CI restore policy before release.'],
    };
  }

  if (input.runtime === 'python') {
    const pyprojectText = await readTextIfExists(path.join(input.projectPath, 'pyproject.toml'));
    if (/\[tool\.poetry\]/.test(pyprojectText)) {
      return {
        command: 'poetry install --no-root',
        title: 'Install Poetry dependency baseline',
        files: ['pyproject.toml', 'poetry.lock'],
        limitations: [
          'Review poetry.lock changes before committing when Poetry resolves or updates the lockfile.',
        ],
      };
    }
    if (/\[tool\.uv\]|\[project\]/.test(pyprojectText)) {
      return {
        command: 'uv lock',
        title: 'Generate uv lockfile',
        files: ['pyproject.toml', 'uv.lock'],
        limitations: ['Review uv.lock changes before committing.'],
      };
    }
  }

  return null;
}

function scriptsFromPackageJson(
  packageJsonData: Record<string, unknown> | null | undefined
): Record<string, string> {
  const scripts = packageJsonData?.scripts;
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) {
    return {};
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(scripts)) {
    if (typeof value === 'string' && value.trim().length > 0) {
      normalized[key] = value;
    }
  }
  return normalized;
}

function runtimeCommandContract(input: {
  runtime: DoctorSurfaceRuntimeFamily;
  kind: RuntimeCommandContractKind;
  projectPath: string;
  packageJsonData?: Record<string, unknown> | null;
}): RuntimeCommandContract | null {
  if (input.runtime === 'node') {
    const scripts = scriptsFromPackageJson(input.packageJsonData);
    if (!input.packageJsonData) return null;
    if (input.kind === 'test') {
      const fallback = scripts.lint ? 'npm run lint' : scripts.build ? 'npm run build' : null;
      return fallback
        ? {
            command: fallback,
            title: 'Define Node test script',
            targetName: 'test',
            files: ['package.json'],
            limitations: [
              'Replace this fallback with real tests when product coverage is required.',
            ],
          }
        : null;
    }
    if (input.kind === 'security') {
      return {
        command: 'npm audit --audit-level=moderate',
        title: 'Define Node security audit script',
        targetName: 'audit',
        files: ['package.json'],
      };
    }
    return null;
  }

  const makefileByRuntime: Partial<
    Record<DoctorSurfaceRuntimeFamily, Record<RuntimeCommandContractKind, RuntimeCommandContract>>
  > = {
    python: {
      test: {
        command: 'python -m pytest',
        title: 'Define Python test command',
        targetName: 'test',
        files: ['Makefile', 'pyproject.toml'],
      },
      quality: {
        command: 'python -m ruff check .',
        title: 'Define Python quality command',
        targetName: 'quality',
        files: ['Makefile', 'pyproject.toml'],
        limitations: [
          'Ensure ruff is declared in project dev dependencies before enforcing in CI.',
        ],
      },
      security: {
        command: 'python -m pip_audit',
        title: 'Define Python security audit command',
        targetName: 'security',
        files: ['Makefile', 'pyproject.toml'],
        limitations: [
          'Ensure pip-audit is available in the project toolchain before enforcing in CI.',
        ],
      },
    },
    go: {
      test: {
        command: 'go test ./...',
        title: 'Define Go test command',
        targetName: 'test',
        files: ['Makefile', 'go.mod'],
      },
      quality: {
        command: 'gofmt -w .',
        title: 'Define Go formatting command',
        targetName: 'quality',
        files: ['Makefile', 'go.mod'],
        limitations: [
          'Use CI-specific check mode if formatting should not mutate files in pipelines.',
        ],
      },
      security: {
        command: 'govulncheck ./...',
        title: 'Define Go vulnerability scan command',
        targetName: 'security',
        files: ['Makefile', 'go.mod'],
        limitations: ['Ensure govulncheck is installed or provisioned by CI before enforcing.'],
      },
    },
    rust: {
      test: {
        command: 'cargo test',
        title: 'Define Rust test command',
        targetName: 'test',
        files: ['Makefile', 'Cargo.toml'],
      },
      quality: {
        command: 'cargo fmt -- --check && cargo clippy --all-targets -- -D warnings',
        title: 'Define Rust quality command',
        targetName: 'quality',
        files: ['Makefile', 'Cargo.toml'],
      },
      security: {
        command: 'cargo audit',
        title: 'Define Rust security audit command',
        targetName: 'security',
        files: ['Makefile', 'Cargo.toml'],
        limitations: ['Ensure cargo-audit is installed or provisioned by CI before enforcing.'],
      },
    },
    php: {
      test: {
        command: 'vendor/bin/phpunit',
        title: 'Define PHP test command',
        targetName: 'test',
        files: ['Makefile', 'composer.json'],
      },
      quality: {
        command: 'vendor/bin/phpstan analyse',
        title: 'Define PHP static analysis command',
        targetName: 'quality',
        files: ['Makefile', 'composer.json'],
        limitations: ['Ensure phpstan is declared in require-dev before enforcing in CI.'],
      },
      security: {
        command: 'composer audit',
        title: 'Define Composer security audit command',
        targetName: 'security',
        files: ['Makefile', 'composer.json'],
      },
    },
    ruby: {
      test: {
        command: 'bundle exec rspec',
        title: 'Define Ruby test command',
        targetName: 'test',
        files: ['Makefile', 'Gemfile'],
        limitations: [
          'Use bundle exec ruby -Itest when the project uses minitest instead of RSpec.',
        ],
      },
      quality: {
        command: 'bundle exec rubocop',
        title: 'Define Ruby quality command',
        targetName: 'quality',
        files: ['Makefile', 'Gemfile'],
      },
      security: {
        command: 'bundle exec bundler-audit check',
        title: 'Define Ruby security audit command',
        targetName: 'security',
        files: ['Makefile', 'Gemfile'],
        limitations: ['Ensure bundler-audit is installed or provisioned by CI before enforcing.'],
      },
    },
    dotnet: {
      test: {
        command: 'dotnet test',
        title: 'Define .NET test command',
        targetName: 'test',
        files: ['Makefile', '*.sln', '*.csproj'],
      },
      quality: {
        command: 'dotnet format --verify-no-changes',
        title: 'Define .NET formatting gate',
        targetName: 'quality',
        files: ['Makefile', '*.sln', '*.csproj'],
      },
      security: {
        command: 'dotnet list package --vulnerable',
        title: 'Define .NET package vulnerability check',
        targetName: 'security',
        files: ['Makefile', '*.sln', '*.csproj'],
      },
    },
    java: {
      test: {
        command: 'mvn test',
        title: 'Define Java test command',
        targetName: 'test',
        files: ['Makefile', 'pom.xml', 'build.gradle', 'build.gradle.kts'],
        limitations: ['Use ./gradlew test when the project is Gradle-first.'],
      },
      quality: {
        command: 'mvn verify',
        title: 'Define Java verification command',
        targetName: 'quality',
        files: ['Makefile', 'pom.xml', 'build.gradle', 'build.gradle.kts'],
        limitations: ['Use ./gradlew check when the project is Gradle-first.'],
      },
      security: {
        command: 'mvn org.owasp:dependency-check-maven:check',
        title: 'Define Java dependency vulnerability check',
        targetName: 'security',
        files: ['Makefile', 'pom.xml'],
        limitations: [
          'Review OWASP dependency-check policy and cache behavior before enforcing in CI.',
        ],
      },
    },
  };

  return makefileByRuntime[input.runtime]?.[input.kind] ?? null;
}

async function buildMakefileCommandRepairCapability(input: {
  issueId: string;
  projectPath: string;
  contract: RuntimeCommandContract;
  reason: string;
}): Promise<DoctorRepairCapability> {
  return buildMakefileTargetRepairCapability({
    issueId: input.issueId,
    title: input.contract.title,
    projectPath: input.projectPath,
    targetName: input.contract.targetName,
    command: input.contract.command,
    reason: input.reason,
    risk: 'guarded' as const,
    requiresReview: true,
    limitations: input.contract.limitations,
  });
}

async function buildRuntimeCommandRepairCapability(input: {
  issueId: string;
  projectPath: string;
  runtime: DoctorSurfaceRuntimeFamily;
  kind: RuntimeCommandContractKind;
  packageJsonData?: Record<string, unknown> | null;
  reason: string;
}): Promise<DoctorRepairCapability | undefined> {
  const contract = runtimeCommandContract({
    runtime: input.runtime,
    kind: input.kind,
    projectPath: input.projectPath,
    packageJsonData: input.packageJsonData,
  });
  if (!contract) return undefined;

  if (input.runtime === 'node' && input.packageJsonData) {
    return buildPackageScriptRepairCapability({
      issueId: input.issueId,
      title: contract.title,
      projectPath: input.projectPath,
      scriptName: contract.targetName,
      scriptValue: contract.command,
      reason: input.reason,
      risk: 'guarded',
      limitations: contract.limitations,
    });
  }

  return buildMakefileCommandRepairCapability({
    issueId: input.issueId,
    projectPath: input.projectPath,
    contract,
    reason: input.reason,
  });
}

function buildManualRepair(input: {
  issueId: string;
  title: string;
  projectPath: string;
  files: string[];
  reason: string;
  limitations?: string[];
}): DoctorRepairCapability {
  return {
    id: `${input.issueId}.manual`,
    issueId: input.issueId,
    title: input.title,
    status: 'manual',
    fixKind: 'manual',
    risk: 'guarded',
    canAutoFix: false,
    canEditFiles: false,
    requiresApproval: true,
    requiresReview: true,
    files: input.files.map((file) => path.join(input.projectPath, file)),
    refreshCommands: ['npx workspai doctor project --json', 'npx workspai workspace verify --json'],
    reason: input.reason,
    limitations: input.limitations,
  };
}

function buildDockerignoreRepair(projectPath: string): DoctorRepairCapability {
  return buildFileCreateRepairCapability({
    issueId: 'surface-dockerignore',
    title: 'Create .dockerignore',
    projectPath,
    relativePath: '.dockerignore',
    content: `${DEFAULT_DOCKERIGNORE}\n`,
    reason:
      'Create a Docker build ignore baseline to keep secrets, dependencies, and reports out of container contexts.',
  });
}

async function buildGitignoreRepair(projectPath: string): Promise<DoctorRepairCapability> {
  if (!(await fsExtra.pathExists(path.join(projectPath, '.gitignore')))) {
    return buildFileCreateRepairCapability({
      issueId: 'surface-security-hygiene',
      title: 'Create .gitignore secret baseline',
      projectPath,
      relativePath: '.gitignore',
      content: `${DEFAULT_SECRET_GITIGNORE_LINES.join('\n')}\n`,
      reason: 'Create a minimal ignore baseline so local env files are not committed accidentally.',
    });
  }

  const existing = await readTextIfExists(path.join(projectPath, '.gitignore'));
  const missingLines = DEFAULT_SECRET_GITIGNORE_LINES.filter(
    (line) => !existing.split(/\r?\n/).includes(line)
  );

  return buildFileAppendRepairCapability({
    issueId: 'surface-security-hygiene',
    title: 'Append .gitignore secret baseline',
    projectPath,
    relativePath: '.gitignore',
    lines: missingLines,
    reason: 'Append missing env-file ignore rules so local secrets stay out of source control.',
  });
}

async function buildDependencyContractProbe(input: {
  projectPath: string;
  runtime: DoctorSurfaceRuntimeFamily;
  packageJsonData?: Record<string, unknown> | null;
}): Promise<DoctorSurfaceProbe | null> {
  const manifests = DEPENDENCY_MANIFESTS[input.runtime] ?? [];
  const lockfiles = DEPENDENCY_LOCKFILES[input.runtime] ?? [];
  if (manifests.length === 0 && lockfiles.length === 0) {
    return null;
  }

  const hasManifest = await anyPathExists(input.projectPath, manifests);
  const hasLockfile = await anyPathExists(input.projectPath, lockfiles);
  const dependencyRepair =
    hasManifest && !hasLockfile
      ? await inferDependencyBaselineRepair({
          projectPath: input.projectPath,
          runtime: input.runtime,
          packageJsonData: input.packageJsonData,
        })
      : null;

  return {
    id: 'surface-dependency-contract',
    label: 'Dependency contract',
    status: !hasManifest || hasLockfile ? 'pass' : 'warn',
    severity: 'warn',
    scope: 'project-scoped',
    reason: !hasManifest
      ? 'No dependency manifest markers detected for this runtime.'
      : hasLockfile
        ? 'Dependency manifest and deterministic lock/baseline markers detected.'
        : `Dependency manifest detected, but no deterministic baseline found (${lockfiles.join(', ')}).`,
    recommendation:
      hasManifest && !hasLockfile
        ? 'Generate and commit the runtime-native lockfile or package baseline before release.'
        : undefined,
    repairCapability:
      hasManifest && !hasLockfile && dependencyRepair
        ? buildCommandRepairCapability({
            issueId: 'surface-dependency-contract',
            title: dependencyRepair.title,
            projectPath: input.projectPath,
            command: dependencyRepair.command,
            files: dependencyRepair.files,
            fixKind: 'dependency-sync',
            reason:
              'Generate the runtime-native dependency baseline so CI, Doctor, and Studio share deterministic dependency evidence.',
            limitations: dependencyRepair.limitations,
          })
        : undefined,
  };
}

async function buildEnvContractProbe(input: SurfaceInput): Promise<DoctorSurfaceProbe> {
  const envExampleExists = await fsExtra.pathExists(path.join(input.projectPath, '.env.example'));
  const envExists = await fsExtra.pathExists(path.join(input.projectPath, '.env'));
  const envDocsExist =
    (await fsExtra.pathExists(path.join(input.projectPath, 'docs', 'env.md'))) ||
    (await fsExtra.pathExists(path.join(input.projectPath, 'ENVIRONMENT.md')));
  const configDirExists = await fsExtra.pathExists(path.join(input.projectPath, 'config'));
  const hasContract = envExampleExists || envDocsExist || configDirExists;
  const frontend = input.projectKind === 'frontend';

  return {
    id: 'surface-env-contract',
    label: 'Environment/config contract',
    status: hasContract ? 'pass' : frontend ? 'warn' : 'warn',
    severity: 'warn',
    scope: 'project-scoped',
    reason: hasContract
      ? 'Environment/config contract marker detected.'
      : frontend
        ? 'No frontend environment contract marker detected.'
        : 'No environment/config contract marker detected.',
    recommendation: hasContract
      ? undefined
      : 'Add .env.example, config schema, or environment documentation for deterministic setup.',
    repairCapability: hasContract
      ? envExampleExists && !envExists
        ? buildFileCopyRepairCapability({
            issueId: 'surface-env-contract',
            title: 'Create local .env from .env.example',
            projectPath: input.projectPath,
            sourceRelativePath: '.env.example',
            targetRelativePath: '.env',
            reason:
              'Seed the local environment file from the reviewed example without overwriting an existing .env.',
          })
        : undefined
      : buildManualRepair({
          issueId: 'surface-env-contract',
          title: 'Define environment contract',
          projectPath: input.projectPath,
          files: ['.env.example'],
          reason:
            'Environment contracts are product-specific; Doctor can identify the missing baseline, but values must be reviewed by the project owner.',
        }),
  };
}

async function buildContainerProbe(input: SurfaceInput): Promise<DoctorSurfaceProbe> {
  const dockerfileExists = await fsExtra.pathExists(path.join(input.projectPath, 'Dockerfile'));
  const dockerignoreExists = await fsExtra.pathExists(
    path.join(input.projectPath, '.dockerignore')
  );
  const composeExists =
    (await fsExtra.pathExists(path.join(input.projectPath, 'docker-compose.yml'))) ||
    (await fsExtra.pathExists(path.join(input.projectPath, 'compose.yml')));

  if (dockerfileExists) {
    return {
      id: 'surface-dockerignore',
      label: 'Container build context hygiene',
      status: dockerignoreExists ? 'pass' : 'warn',
      severity: 'warn',
      scope: 'project-scoped',
      reason: dockerignoreExists
        ? 'Dockerfile and .dockerignore detected.'
        : 'Dockerfile detected without .dockerignore.',
      recommendation: dockerignoreExists
        ? undefined
        : 'Add .dockerignore to exclude dependencies, reports, git metadata, and local env files from image builds.',
      repairCapability: dockerignoreExists ? undefined : buildDockerignoreRepair(input.projectPath),
    };
  }

  return {
    id: 'surface-container-contract',
    label: 'Container contract',
    status: composeExists ? 'pass' : 'warn',
    severity: 'warn',
    scope: 'project-scoped',
    reason: composeExists
      ? 'Compose surface detected; project has a local container orchestration baseline.'
      : 'No Dockerfile or compose surface detected.',
    recommendation:
      input.projectKind === 'backend' || input.projectKind === 'fullstack'
        ? 'Add Dockerfile or compose baseline when this service is expected to run in containerized environments.'
        : 'Add container baseline only if this app is shipped through containerized environments.',
  };
}

async function buildKubernetesProbe(input: SurfaceInput): Promise<DoctorSurfaceProbe> {
  const manifestCandidates = [
    'k8s',
    'kubernetes',
    'deploy',
    'deployments',
    'charts',
    'helm',
    'kustomization.yaml',
    'kustomization.yml',
  ];
  const hasSurface = await anyPathExists(input.projectPath, manifestCandidates);
  if (!hasSurface) {
    return {
      id: 'surface-deploy-contract',
      label: 'Deployment contract',
      status: 'warn',
      severity: 'warn',
      scope: 'project-scoped',
      reason: 'No Kubernetes/Helm/Kustomize deployment surface detected.',
      recommendation:
        input.projectKind === 'backend' || input.projectKind === 'fullstack'
          ? 'Add deployment manifests or document the non-Kubernetes deployment path.'
          : 'Document the deployment path when this frontend is production-hosted.',
    };
  }

  const manifestText = await collectTextFromExisting(input.projectPath, [
    'k8s/deployment.yaml',
    'k8s/deployment.yml',
    'kubernetes/deployment.yaml',
    'deploy/deployment.yaml',
    'deployment.yaml',
    'deployment.yml',
    'values.yaml',
    'charts/values.yaml',
  ]);
  const hasProbe = /readinessProbe|livenessProbe|startupProbe/.test(manifestText);
  const hasResources = /resources:\s*[\s\S]*(limits:|requests:)/.test(manifestText);
  const healthy = hasProbe && hasResources;

  return {
    id: 'surface-kubernetes-readiness',
    label: 'Deployment readiness controls',
    status: healthy ? 'pass' : 'warn',
    severity: 'warn',
    scope: 'project-scoped',
    reason: healthy
      ? 'Deployment surface includes probe and resource-control markers.'
      : 'Deployment surface detected, but readiness/liveness probes or resource controls are incomplete.',
    recommendation: healthy
      ? undefined
      : 'Add readiness/liveness/startup probes and resource requests/limits to production deployment manifests.',
    repairCapability: healthy
      ? undefined
      : buildManualRepair({
          issueId: 'surface-kubernetes-readiness',
          title: 'Harden deployment readiness controls',
          projectPath: input.projectPath,
          files: ['k8s/', 'helm/', 'deploy/'],
          reason:
            'Deployment manifests are environment-specific and should be reviewed before mutation.',
        }),
  };
}

async function buildSecurityHygieneProbe(input: SurfaceInput): Promise<DoctorSurfaceProbe> {
  const gitignoreExists = await fsExtra.pathExists(path.join(input.projectPath, '.gitignore'));
  const gitignoreText = await readTextIfExists(path.join(input.projectPath, '.gitignore'));
  const gitignoreLines = gitignoreText.split(/\r?\n/);
  const gitignoreCoversSecrets =
    gitignoreExists &&
    DEFAULT_SECRET_GITIGNORE_LINES.every((line) => gitignoreLines.includes(line));
  const packageScripts = scriptsFromPackageJson(input.packageJsonData);
  const hasAuditScript = Boolean(
    packageScripts.audit ||
    packageScripts['security:audit'] ||
    packageScripts['audit:security'] ||
    packageScripts['npm:audit']
  );
  const vulnerabilityCount = Number(input.vulnerabilities ?? 0);
  const hasVulnerabilities = vulnerabilityCount > 0;
  const runtime = normalizeRuntime(input.runtimeFamily);
  const vulnerabilityRepair =
    hasVulnerabilities && runtime === 'node'
      ? buildCommandRepairCapability({
          issueId: 'surface-security-hygiene',
          title: 'Apply non-breaking npm vulnerability fixes',
          projectPath: input.projectPath,
          command: 'npm audit fix --audit-level=moderate',
          files: ['package.json', 'package-lock.json', 'npm-shrinkwrap.json'],
          reason:
            'Apply npm-authored vulnerability remediations without --force, then regenerate Doctor and release-readiness evidence.',
          risk: 'guarded',
          requiresReview: true,
          limitations: [
            'Never add --force automatically; unresolved advisories require an evidence-backed dependency upgrade plan.',
            'Review lockfile changes and rerun the complete Workspace Intelligence verification loop.',
          ],
        })
      : undefined;

  const pass = gitignoreCoversSecrets && !hasVulnerabilities;
  return {
    id: 'surface-security-hygiene',
    label: 'Security hygiene surface',
    status: pass ? 'pass' : hasVulnerabilities ? 'fail' : 'warn',
    severity: hasVulnerabilities ? 'error' : 'warn',
    scope: 'project-scoped',
    reason: hasVulnerabilities
      ? `${vulnerabilityCount} moderate/high/critical dependency vulnerability(ies) reported.`
      : gitignoreCoversSecrets
        ? 'Repository ignore baseline covers env-file secrets and no dependency vulnerabilities were reported by Doctor.'
        : gitignoreExists
          ? 'Repository ignore baseline exists, but env-file secret rules are incomplete.'
          : 'No .gitignore baseline detected for local secrets/build artifacts.',
    recommendation: hasVulnerabilities
      ? 'Run the runtime-native audit fix path without force, review lockfile changes, then rerun Doctor.'
      : gitignoreCoversSecrets
        ? hasAuditScript
          ? undefined
          : 'Consider adding a security audit script for CI parity.'
        : 'Add .gitignore entries for env files, build output, dependency directories, and local reports.',
    repairCapability: hasVulnerabilities
      ? (vulnerabilityRepair ??
        buildManualRepair({
          issueId: 'surface-security-hygiene',
          title: 'Review dependency vulnerability fix',
          projectPath: input.projectPath,
          files: ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'],
          reason:
            'Dependency vulnerability remediation can change transitive dependency graphs and must be reviewed.',
          limitations: [
            'Avoid npm audit fix --force unless a maintainer explicitly accepts breaking changes.',
          ],
        }))
      : gitignoreCoversSecrets
        ? undefined
        : await buildGitignoreRepair(input.projectPath),
  };
}

async function buildTestSurfaceProbe(input: SurfaceInput): Promise<DoctorSurfaceProbe> {
  const runtime = normalizeRuntime(input.runtimeFamily);
  const hasTests = input.hasTests === true;
  const repairCapability = hasTests
    ? undefined
    : await buildRuntimeCommandRepairCapability({
        issueId: 'surface-test-contract',
        projectPath: input.projectPath,
        runtime,
        kind: 'test',
        packageJsonData: input.packageJsonData,
        reason:
          'Create a deterministic runtime-native test command contract so Doctor, CI, and Studio can verify changes consistently.',
      });
  return {
    id: 'surface-test-contract',
    label: 'Test contract',
    status: hasTests ? 'pass' : 'warn',
    severity: 'warn',
    scope: 'project-scoped',
    reason: hasTests
      ? 'Test surface detected through scripts, config, directories, or test files.'
      : 'No test surface detected by Doctor.',
    recommendation: hasTests
      ? undefined
      : 'Add at least one deterministic test command or test baseline before release.',
    repairCapability:
      repairCapability ??
      (hasTests
        ? undefined
        : buildManualRepair({
            issueId: 'surface-test-contract',
            title: 'Define test contract',
            projectPath: input.projectPath,
            files: ['package.json', 'pyproject.toml', 'go.mod', 'pom.xml'],
            reason:
              'Doctor can identify missing test surfaces, but the correct test runner depends on product intent.',
          })),
  };
}

function buildFormatSurfaceProbe(input: SurfaceInput): DoctorSurfaceProbe {
  const scripts = scriptsFromPackageJson(input.packageJsonData);
  const hasFormatScript = Boolean(scripts.format || scripts['format:check'] || scripts.prettier);
  return {
    id: 'surface-format-contract',
    label: 'Format contract',
    status: hasFormatScript ? 'pass' : 'warn',
    severity: 'warn',
    scope: 'project-scoped',
    reason: hasFormatScript
      ? 'Format script detected in package.json.'
      : 'No explicit format script detected by Doctor.',
    recommendation: hasFormatScript
      ? undefined
      : 'Add a formatter command or document the formatting tool used by CI.',
  };
}

async function buildRuntimeTestDepthProbe(input: SurfaceInput): Promise<DoctorSurfaceProbe | null> {
  const runtime = normalizeRuntime(input.runtimeFamily);
  const markersByRuntime: Record<DoctorSurfaceRuntimeFamily, string[]> = {
    node: ['vitest.config.ts', 'jest.config.js', 'playwright.config.ts', 'cypress.config.ts'],
    deno: ['deno.json', 'deno.jsonc'],
    bun: ['bunfig.toml'],
    python: ['pytest.ini', 'tox.ini', 'noxfile.py', 'tests', 'pyproject.toml'],
    go: ['*_test.go'],
    java: ['src/test', 'pom.xml', 'build.gradle', 'build.gradle.kts'],
    rust: ['tests', 'Cargo.toml'],
    elixir: ['test', 'mix.exs'],
    clojure: ['test', 'deps.edn', 'project.clj'],
    php: ['phpunit.xml', 'phpunit.xml.dist', 'tests'],
    ruby: ['spec', 'test', '.rspec'],
    dotnet: ['*.Tests.csproj', '*.Test.csproj', '*.sln'],
    unknown: [],
  };
  const markers = markersByRuntime[runtime] ?? [];
  if (markers.length === 0) return null;

  const hasRuntimeMarker = await anyPathExists(input.projectPath, markers);
  const pass = input.hasTests === true && hasRuntimeMarker;
  return {
    id: 'runtime-test-depth',
    label: 'Runtime-native test depth',
    status: pass ? 'pass' : input.hasTests ? 'warn' : 'warn',
    severity: 'warn',
    scope: 'project-scoped',
    reason: pass
      ? 'Runtime-native test markers detected.'
      : input.hasTests
        ? 'Generic test surface detected, but runtime-native test markers are incomplete.'
        : 'No runtime-native test markers detected.',
    recommendation: pass
      ? undefined
      : 'Add runtime-native tests/config so Doctor, CI, and Studio can verify changes deterministically.',
  };
}

async function buildRuntimeQualityProbe(input: SurfaceInput): Promise<DoctorSurfaceProbe | null> {
  const runtime = normalizeRuntime(input.runtimeFamily);
  const markersByRuntime: Record<DoctorSurfaceRuntimeFamily, string[]> = {
    node: ['eslint.config.js', 'eslint.config.mjs', '.eslintrc.json', 'prettier.config.js'],
    deno: ['deno.json', 'deno.jsonc'],
    bun: ['eslint.config.js', 'biome.json', 'bunfig.toml'],
    python: ['ruff.toml', 'pyproject.toml', '.flake8', 'mypy.ini', 'Makefile'],
    go: ['.golangci.yml', '.golangci.yaml', 'Makefile'],
    java: ['checkstyle.xml', 'pom.xml', 'build.gradle', 'build.gradle.kts'],
    rust: ['rustfmt.toml', 'clippy.toml', 'Cargo.toml'],
    elixir: ['.formatter.exs', 'credo.exs', 'mix.exs'],
    clojure: ['cljfmt.edn', '.clj-kondo', 'deps.edn'],
    php: ['phpcs.xml', 'phpstan.neon', 'pint.json', 'composer.json'],
    ruby: ['.rubocop.yml', 'Gemfile'],
    dotnet: ['.editorconfig', 'Directory.Build.props', 'global.json'],
    unknown: [],
  };
  const markers = markersByRuntime[runtime] ?? [];
  if (markers.length === 0) return null;

  const text = await collectTextFromExisting(input.projectPath, markers);
  const hasToolSignal =
    /eslint|prettier|biome|ruff|black|mypy|golangci|checkstyle|spotless|pmd|clippy|rustfmt|credo|clj-kondo|phpstan|phpcs|pint|rubocop|editorconfig|dotnet format/i.test(
      text
    );
  const repairCapability = hasToolSignal
    ? undefined
    : await buildRuntimeCommandRepairCapability({
        issueId: 'runtime-quality-tooling',
        projectPath: input.projectPath,
        runtime,
        kind: 'quality',
        packageJsonData: input.packageJsonData,
        reason:
          'Create a deterministic runtime-native quality command contract so CI and Studio can verify formatting/static-analysis consistently.',
      });

  return {
    id: 'runtime-quality-tooling',
    label: 'Runtime-native quality tooling',
    status: hasToolSignal ? 'pass' : 'warn',
    severity: 'warn',
    scope: 'project-scoped',
    reason: hasToolSignal
      ? 'Runtime-native lint/format/static-analysis markers detected.'
      : 'No runtime-native lint/format/static-analysis markers detected.',
    recommendation: hasToolSignal
      ? undefined
      : 'Add runtime-native lint/format/static-analysis tooling and expose it to CI.',
    repairCapability,
  };
}

async function buildRuntimeSecurityProbe(input: SurfaceInput): Promise<DoctorSurfaceProbe | null> {
  const runtime = normalizeRuntime(input.runtimeFamily);
  const markersByRuntime: Record<DoctorSurfaceRuntimeFamily, string[]> = {
    node: ['package.json'],
    deno: ['deno.json', 'deno.jsonc'],
    bun: ['package.json', 'bunfig.toml'],
    python: ['pyproject.toml', 'requirements.txt', 'Makefile'],
    go: ['Makefile', 'go.mod'],
    java: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    rust: ['Cargo.toml'],
    elixir: ['mix.exs'],
    clojure: ['deps.edn', 'project.clj'],
    php: ['composer.json'],
    ruby: ['Gemfile', '.bundler-audit.yml'],
    dotnet: ['Directory.Build.props', '*.csproj'],
    unknown: [],
  };
  const markers = markersByRuntime[runtime] ?? [];
  if (markers.length === 0) return null;

  const text = await collectTextFromExisting(input.projectPath, markers);
  const hasSecurityTool =
    /npm audit|pnpm audit|yarn audit|bun audit|pip[-_]audit|safety|bandit|govulncheck|gosec|dependency-check|owasp|cargo audit|mix hex.audit|composer audit|bundler-audit|brakeman|NuGetAudit|dotnet list package --vulnerable/i.test(
      text
    );
  const repairCapability = hasSecurityTool
    ? undefined
    : await buildRuntimeCommandRepairCapability({
        issueId: 'runtime-security-tooling',
        projectPath: input.projectPath,
        runtime,
        kind: 'security',
        packageJsonData: input.packageJsonData,
        reason:
          'Create a deterministic runtime-native security audit command contract so CI and Studio can verify dependency risk consistently.',
      });

  return {
    id: 'runtime-security-tooling',
    label: 'Runtime-native security tooling',
    status: hasSecurityTool ? 'pass' : 'warn',
    severity: 'warn',
    scope: 'project-scoped',
    reason: hasSecurityTool
      ? 'Runtime-native security audit tooling marker detected.'
      : 'No runtime-native security audit tooling marker detected.',
    recommendation: hasSecurityTool
      ? undefined
      : 'Expose a runtime-native dependency/security audit command for CI and Studio verification.',
    repairCapability: hasSecurityTool
      ? undefined
      : repairCapability
        ? repairCapability
        : buildManualRepair({
            issueId: 'runtime-security-tooling',
            title: 'Define runtime security audit command',
            projectPath: input.projectPath,
            files: ['package.json', 'pyproject.toml', 'Makefile', 'pom.xml', 'Cargo.toml'],
            reason:
              'Security tooling differs by runtime and organization policy; Doctor records the missing contract for review.',
          }),
  };
}

export async function buildEnterpriseSurfaceProbes(
  input: SurfaceInput
): Promise<DoctorSurfaceProbe[]> {
  const runtime = normalizeRuntime(input.runtimeFamily);
  const probes: DoctorSurfaceProbe[] = [];
  const dependencyProbe = await buildDependencyContractProbe({
    projectPath: input.projectPath,
    runtime,
    packageJsonData: input.packageJsonData,
  });
  if (dependencyProbe) probes.push(dependencyProbe);

  probes.push(await buildEnvContractProbe(input));
  probes.push(await buildContainerProbe(input));
  probes.push(await buildKubernetesProbe(input));
  probes.push(await buildSecurityHygieneProbe(input));
  probes.push(await buildTestSurfaceProbe(input));

  if (runtime === 'node') {
    probes.push(buildFormatSurfaceProbe(input));
  }

  const runtimeProbes = await Promise.all([
    buildRuntimeTestDepthProbe(input),
    buildRuntimeQualityProbe(input),
    buildRuntimeSecurityProbe(input),
  ]);
  for (const probe of runtimeProbes) {
    if (probe) probes.push(probe);
  }

  return probes;
}
