import fs from 'fs';
import path from 'path';

export type BackendConfidence = 'high' | 'medium' | 'low';
export type BackendSupportTier = 'first-class' | 'extended' | 'observed';
export type BackendRuntimeFamily =
  | 'python'
  | 'node'
  | 'go'
  | 'java'
  | 'php'
  | 'ruby'
  | 'dotnet'
  | 'rust'
  | 'elixir'
  | 'clojure'
  | 'scala'
  | 'kotlin'
  | 'deno'
  | 'bun'
  | 'unknown';

export type BackendPlatformKey =
  | 'fastapi'
  | 'django'
  | 'flask'
  | 'python'
  | 'nestjs'
  | 'express'
  | 'fastify'
  | 'koa'
  | 'node'
  | 'gofiber'
  | 'gogin'
  | 'echo'
  | 'go'
  | 'springboot'
  | 'java'
  | 'laravel'
  | 'symfony'
  | 'php'
  | 'rails'
  | 'sinatra'
  | 'ruby'
  | 'dotnet'
  | 'actix'
  | 'axum'
  | 'rocket'
  | 'rust'
  | 'phoenix'
  | 'elixir'
  | 'clojure'
  | 'scala'
  | 'kotlin'
  | 'deno'
  | 'bun'
  | 'unknown';

export type BackendImportStack =
  | 'fastapi'
  | 'django'
  | 'flask'
  | 'nestjs'
  | 'express'
  | 'koa'
  | 'go'
  | 'springboot'
  | 'rails'
  | 'dotnet'
  | 'unknown';

export interface BackendFrameworkContract {
  key: BackendPlatformKey;
  runtime: BackendRuntimeFamily;
  displayName: string;
  supportTier: BackendSupportTier;
  importStack: BackendImportStack;
}

export interface BackendFrameworkDetection extends BackendFrameworkContract {
  confidence: BackendConfidence;
  source: 'kit' | 'framework' | 'runtime' | 'manifest' | 'marker' | 'unknown';
}

type BackendContractDescriptor = BackendFrameworkContract & {
  aliases: string[];
  kitPrefixes?: string[];
};

const BACKEND_CONTRACTS: Record<BackendPlatformKey, BackendContractDescriptor> = {
  fastapi: {
    key: 'fastapi',
    runtime: 'python',
    displayName: 'FastAPI',
    supportTier: 'first-class',
    importStack: 'fastapi',
    aliases: ['fastapi'],
    kitPrefixes: ['fastapi'],
  },
  django: {
    key: 'django',
    runtime: 'python',
    displayName: 'Django',
    supportTier: 'extended',
    importStack: 'django',
    aliases: ['django'],
  },
  flask: {
    key: 'flask',
    runtime: 'python',
    displayName: 'Flask',
    supportTier: 'extended',
    importStack: 'flask',
    aliases: ['flask'],
  },
  python: {
    key: 'python',
    runtime: 'python',
    displayName: 'Python',
    supportTier: 'observed',
    importStack: 'unknown',
    aliases: ['python'],
  },
  nestjs: {
    key: 'nestjs',
    runtime: 'node',
    displayName: 'NestJS',
    supportTier: 'first-class',
    importStack: 'nestjs',
    aliases: ['nestjs', 'nest'],
    kitPrefixes: ['nestjs'],
  },
  express: {
    key: 'express',
    runtime: 'node',
    displayName: 'Express',
    supportTier: 'extended',
    importStack: 'express',
    aliases: ['express'],
  },
  fastify: {
    key: 'fastify',
    runtime: 'node',
    displayName: 'Fastify',
    supportTier: 'extended',
    importStack: 'unknown',
    aliases: ['fastify'],
  },
  koa: {
    key: 'koa',
    runtime: 'node',
    displayName: 'Koa',
    supportTier: 'extended',
    importStack: 'koa',
    aliases: ['koa'],
  },
  node: {
    key: 'node',
    runtime: 'node',
    displayName: 'Node.js',
    supportTier: 'observed',
    importStack: 'unknown',
    aliases: ['node', 'nodejs', 'typescript', 'javascript'],
  },
  gofiber: {
    key: 'gofiber',
    runtime: 'go',
    displayName: 'Go/Fiber',
    supportTier: 'first-class',
    importStack: 'go',
    aliases: ['gofiber', 'fiber', 'go-fiber', 'go/fiber'],
    kitPrefixes: ['gofiber'],
  },
  gogin: {
    key: 'gogin',
    runtime: 'go',
    displayName: 'Go/Gin',
    supportTier: 'first-class',
    importStack: 'go',
    aliases: ['gogin', 'gin', 'go-gin', 'go/gin'],
    kitPrefixes: ['gogin'],
  },
  echo: {
    key: 'echo',
    runtime: 'go',
    displayName: 'Echo',
    supportTier: 'extended',
    importStack: 'go',
    aliases: ['echo'],
  },
  go: {
    key: 'go',
    runtime: 'go',
    displayName: 'Go',
    supportTier: 'observed',
    importStack: 'go',
    aliases: ['go', 'golang'],
    kitPrefixes: ['go'],
  },
  springboot: {
    key: 'springboot',
    runtime: 'java',
    displayName: 'Spring Boot',
    supportTier: 'first-class',
    importStack: 'springboot',
    aliases: ['springboot', 'spring', 'spring-boot'],
    kitPrefixes: ['springboot'],
  },
  java: {
    key: 'java',
    runtime: 'java',
    displayName: 'Java',
    supportTier: 'observed',
    importStack: 'unknown',
    aliases: ['java'],
  },
  laravel: {
    key: 'laravel',
    runtime: 'php',
    displayName: 'Laravel',
    supportTier: 'extended',
    importStack: 'unknown',
    aliases: ['laravel'],
  },
  symfony: {
    key: 'symfony',
    runtime: 'php',
    displayName: 'Symfony',
    supportTier: 'extended',
    importStack: 'unknown',
    aliases: ['symfony'],
  },
  php: {
    key: 'php',
    runtime: 'php',
    displayName: 'PHP',
    supportTier: 'observed',
    importStack: 'unknown',
    aliases: ['php'],
  },
  rails: {
    key: 'rails',
    runtime: 'ruby',
    displayName: 'Ruby on Rails',
    supportTier: 'extended',
    importStack: 'rails',
    aliases: ['rails', 'ruby-on-rails', 'ruby on rails'],
  },
  sinatra: {
    key: 'sinatra',
    runtime: 'ruby',
    displayName: 'Sinatra',
    supportTier: 'extended',
    importStack: 'unknown',
    aliases: ['sinatra'],
  },
  ruby: {
    key: 'ruby',
    runtime: 'ruby',
    displayName: 'Ruby',
    supportTier: 'observed',
    importStack: 'unknown',
    aliases: ['ruby'],
  },
  dotnet: {
    key: 'dotnet',
    runtime: 'dotnet',
    displayName: 'ASP.NET',
    supportTier: 'extended',
    importStack: 'dotnet',
    aliases: ['dotnet', 'asp.net', 'aspnet', 'asp.net core', 'csharp', 'c#'],
  },
  actix: {
    key: 'actix',
    runtime: 'rust',
    displayName: 'Actix-web',
    supportTier: 'extended',
    importStack: 'unknown',
    aliases: ['actix', 'actix-web'],
  },
  axum: {
    key: 'axum',
    runtime: 'rust',
    displayName: 'Axum',
    supportTier: 'extended',
    importStack: 'unknown',
    aliases: ['axum'],
  },
  rocket: {
    key: 'rocket',
    runtime: 'rust',
    displayName: 'Rocket',
    supportTier: 'extended',
    importStack: 'unknown',
    aliases: ['rocket'],
  },
  rust: {
    key: 'rust',
    runtime: 'rust',
    displayName: 'Rust',
    supportTier: 'first-class',
    importStack: 'unknown',
    aliases: ['rust'],
  },
  phoenix: {
    key: 'phoenix',
    runtime: 'elixir',
    displayName: 'Phoenix',
    supportTier: 'first-class',
    importStack: 'unknown',
    aliases: ['phoenix'],
  },
  elixir: {
    key: 'elixir',
    runtime: 'elixir',
    displayName: 'Elixir',
    supportTier: 'extended',
    importStack: 'unknown',
    aliases: ['elixir'],
  },
  clojure: {
    key: 'clojure',
    runtime: 'clojure',
    displayName: 'Clojure',
    supportTier: 'extended',
    importStack: 'unknown',
    aliases: ['clojure'],
  },
  scala: {
    key: 'scala',
    runtime: 'scala',
    displayName: 'Scala',
    supportTier: 'extended',
    importStack: 'unknown',
    aliases: ['scala'],
  },
  kotlin: {
    key: 'kotlin',
    runtime: 'kotlin',
    displayName: 'Kotlin',
    supportTier: 'extended',
    importStack: 'unknown',
    aliases: ['kotlin'],
  },
  deno: {
    key: 'deno',
    runtime: 'deno',
    displayName: 'Deno',
    supportTier: 'extended',
    importStack: 'unknown',
    aliases: ['deno'],
  },
  bun: {
    key: 'bun',
    runtime: 'bun',
    displayName: 'Bun',
    supportTier: 'extended',
    importStack: 'unknown',
    aliases: ['bun'],
  },
  unknown: {
    key: 'unknown',
    runtime: 'unknown',
    displayName: 'Unknown',
    supportTier: 'observed',
    importStack: 'unknown',
    aliases: ['unknown'],
  },
};

const ALIAS_TO_KEY = new Map<string, BackendPlatformKey>();
for (const descriptor of Object.values(BACKEND_CONTRACTS)) {
  for (const alias of descriptor.aliases) {
    ALIAS_TO_KEY.set(alias, descriptor.key);
  }
}

function buildDetection(
  key: BackendPlatformKey,
  confidence: BackendConfidence,
  source: BackendFrameworkDetection['source']
): BackendFrameworkDetection {
  const descriptor = BACKEND_CONTRACTS[key] ?? BACKEND_CONTRACTS.unknown;
  return {
    key: descriptor.key,
    runtime: descriptor.runtime,
    displayName: descriptor.displayName,
    supportTier: descriptor.supportTier,
    importStack: descriptor.importStack,
    confidence,
    source,
  };
}

function normalizeLabel(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

function readTextIfExists(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) {
      return '';
    }
    return fs.readFileSync(filePath, 'utf8').toLowerCase();
  } catch {
    return '';
  }
}

function readJsonIfExists(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function listFilesRecursive(dirPath: string, maxDepth: number): string[] {
  if (maxDepth < 0 || !fs.existsSync(dirPath)) {
    return [];
  }

  const results: string[] = [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    const nextPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(nextPath, maxDepth - 1));
    } else {
      results.push(nextPath);
    }
  }

  return results;
}

function hasFileWithSuffix(projectPath: string, suffix: string, maxDepth = 2): boolean {
  return listFilesRecursive(projectPath, maxDepth).some((candidatePath) =>
    candidatePath.toLowerCase().endsWith(suffix.toLowerCase())
  );
}

function findByKitName(kitName: string | undefined): BackendPlatformKey {
  const normalizedKit = normalizeLabel(kitName ?? '');
  if (!normalizedKit) {
    return 'unknown';
  }

  for (const descriptor of Object.values(BACKEND_CONTRACTS)) {
    if (descriptor.kitPrefixes?.some((prefix) => normalizedKit.startsWith(prefix))) {
      return descriptor.key;
    }
  }

  return 'unknown';
}

export function normalizeBackendPlatformKey(raw: string | undefined | null): BackendPlatformKey {
  if (!raw) {
    return 'unknown';
  }

  return ALIAS_TO_KEY.get(normalizeLabel(raw)) ?? 'unknown';
}

export function normalizeBackendFrameworkLabel(raw: string | undefined | null): BackendPlatformKey {
  return normalizeBackendPlatformKey(raw);
}

export function normalizeBackendRuntimeFamily(
  raw: string | undefined | null
): BackendRuntimeFamily {
  const key = normalizeBackendPlatformKey(raw);
  if (key !== 'unknown') {
    return BACKEND_CONTRACTS[key].runtime;
  }

  return 'unknown';
}

export function getBackendFrameworkContract(key: BackendPlatformKey): BackendFrameworkContract {
  const descriptor = BACKEND_CONTRACTS[key] ?? BACKEND_CONTRACTS.unknown;
  return {
    key: descriptor.key,
    runtime: descriptor.runtime,
    displayName: descriptor.displayName,
    supportTier: descriptor.supportTier,
    importStack: descriptor.importStack,
  };
}

export function detectBackendFrameworkFromHints(input: {
  framework?: string;
  runtime?: string;
  kitName?: string;
}): BackendFrameworkDetection {
  const byKit = findByKitName(input.kitName);
  if (byKit !== 'unknown') {
    return buildDetection(byKit, 'high', 'kit');
  }

  const byFramework = normalizeBackendPlatformKey(input.framework);
  if (byFramework !== 'unknown') {
    return buildDetection(byFramework, 'high', 'framework');
  }

  const byRuntime = normalizeBackendPlatformKey(input.runtime);
  if (byRuntime !== 'unknown') {
    return buildDetection(byRuntime, 'medium', 'runtime');
  }

  return buildDetection('unknown', 'low', 'unknown');
}

function detectNodeBackendFromProject(projectPath: string): BackendFrameworkDetection {
  const packageJson = readJsonIfExists(path.join(projectPath, 'package.json'));
  if (!packageJson) {
    return buildDetection('unknown', 'low', 'unknown');
  }

  const dependencies = {
    ...((packageJson.dependencies as Record<string, unknown> | undefined) ?? {}),
    ...((packageJson.devDependencies as Record<string, unknown> | undefined) ?? {}),
  };
  const scripts = ((packageJson.scripts as Record<string, unknown> | undefined) ?? {}) as Record<
    string,
    unknown
  >;
  const scriptText = Object.values(scripts)
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  if (dependencies['@nestjs/core'] || scriptText.includes('nest start')) {
    return buildDetection('nestjs', 'high', 'manifest');
  }
  if (dependencies.express) {
    return buildDetection('express', 'high', 'manifest');
  }
  if (dependencies.fastify) {
    return buildDetection('fastify', 'high', 'manifest');
  }
  if (dependencies.koa) {
    return buildDetection('koa', 'high', 'manifest');
  }

  return buildDetection('node', 'medium', 'marker');
}

function detectPythonBackendFromProject(projectPath: string): BackendFrameworkDetection {
  const merged = [
    readTextIfExists(path.join(projectPath, 'pyproject.toml')),
    readTextIfExists(path.join(projectPath, 'requirements.txt')),
    readTextIfExists(path.join(projectPath, 'requirements.in')),
  ].join('\n');

  if (merged.includes('fastapi')) {
    return buildDetection('fastapi', 'high', 'manifest');
  }
  if (merged.includes('django')) {
    return buildDetection('django', 'high', 'manifest');
  }
  if (merged.includes('flask')) {
    return buildDetection('flask', 'high', 'manifest');
  }
  if (merged.trim()) {
    return buildDetection('python', 'medium', 'marker');
  }

  return buildDetection('unknown', 'low', 'unknown');
}

function detectGoBackendFromProject(projectPath: string): BackendFrameworkDetection {
  const merged = [
    readTextIfExists(path.join(projectPath, 'go.mod')),
    readTextIfExists(path.join(projectPath, 'main.go')),
  ].join('\n');

  if (merged.includes('github.com/gofiber/fiber')) {
    return buildDetection('gofiber', 'high', 'manifest');
  }
  if (merged.includes('github.com/gin-gonic/gin')) {
    return buildDetection('gogin', 'high', 'manifest');
  }
  if (merged.includes('github.com/labstack/echo')) {
    return buildDetection('echo', 'high', 'manifest');
  }
  if (merged.trim()) {
    return buildDetection('go', 'medium', 'marker');
  }

  return buildDetection('unknown', 'low', 'unknown');
}

function detectJavaBackendFromProject(projectPath: string): BackendFrameworkDetection {
  const merged = [
    readTextIfExists(path.join(projectPath, 'pom.xml')),
    readTextIfExists(path.join(projectPath, 'build.gradle')),
    readTextIfExists(path.join(projectPath, 'build.gradle.kts')),
  ].join('\n');

  if (merged.includes('spring-boot') || merged.includes('org.springframework')) {
    return buildDetection('springboot', 'high', 'manifest');
  }
  if (merged.trim()) {
    return buildDetection('java', 'medium', 'marker');
  }

  return buildDetection('unknown', 'low', 'unknown');
}

function detectPhpBackendFromProject(projectPath: string): BackendFrameworkDetection {
  const composerJson = readTextIfExists(path.join(projectPath, 'composer.json'));
  if (composerJson.includes('laravel/framework')) {
    return buildDetection('laravel', 'high', 'manifest');
  }
  if (composerJson.includes('symfony/')) {
    return buildDetection('symfony', 'high', 'manifest');
  }
  if (composerJson.trim()) {
    return buildDetection('php', 'medium', 'marker');
  }

  return buildDetection('unknown', 'low', 'unknown');
}

function detectRubyBackendFromProject(projectPath: string): BackendFrameworkDetection {
  const gemfile = readTextIfExists(path.join(projectPath, 'Gemfile'));
  if (gemfile.includes("gem 'rails'") || gemfile.includes('gem "rails"')) {
    return buildDetection('rails', 'high', 'manifest');
  }
  if (gemfile.includes("gem 'sinatra'") || gemfile.includes('gem "sinatra"')) {
    return buildDetection('sinatra', 'high', 'manifest');
  }
  if (gemfile.trim()) {
    return buildDetection('ruby', 'medium', 'marker');
  }

  return buildDetection('unknown', 'low', 'unknown');
}

function detectRustBackendFromProject(projectPath: string): BackendFrameworkDetection {
  const cargoToml = readTextIfExists(path.join(projectPath, 'Cargo.toml'));
  if (cargoToml.includes('actix-web')) {
    return buildDetection('actix', 'high', 'manifest');
  }
  if (cargoToml.includes('axum')) {
    return buildDetection('axum', 'high', 'manifest');
  }
  if (cargoToml.includes('rocket')) {
    return buildDetection('rocket', 'high', 'manifest');
  }
  if (cargoToml.trim()) {
    return buildDetection('rust', 'medium', 'marker');
  }

  return buildDetection('unknown', 'low', 'unknown');
}

function detectElixirBackendFromProject(projectPath: string): BackendFrameworkDetection {
  const mixExs = readTextIfExists(path.join(projectPath, 'mix.exs'));
  if (mixExs.includes('phoenix')) {
    return buildDetection('phoenix', 'high', 'manifest');
  }
  if (mixExs.trim()) {
    return buildDetection('elixir', 'medium', 'marker');
  }

  return buildDetection('unknown', 'low', 'unknown');
}

export function detectRuntimeCandidatesFromProject(projectPath: string): BackendRuntimeFamily[] {
  const candidates: BackendRuntimeFamily[] = [];

  const push = (runtime: BackendRuntimeFamily) => {
    if (!candidates.includes(runtime)) {
      candidates.push(runtime);
    }
  };

  if (fs.existsSync(path.join(projectPath, 'go.mod'))) push('go');
  if (fs.existsSync(path.join(projectPath, 'Cargo.toml'))) push('rust');
  if (
    fs.existsSync(path.join(projectPath, 'pom.xml')) ||
    fs.existsSync(path.join(projectPath, 'build.gradle')) ||
    fs.existsSync(path.join(projectPath, 'build.gradle.kts'))
  ) {
    push('java');
  }
  if (fs.existsSync(path.join(projectPath, 'mix.exs'))) push('elixir');
  if (fs.existsSync(path.join(projectPath, 'composer.json'))) push('php');
  if (hasFileWithSuffix(projectPath, '.csproj') || hasFileWithSuffix(projectPath, '.sln')) {
    push('dotnet');
  }
  if (fs.existsSync(path.join(projectPath, 'package.json'))) push('node');
  if (fs.existsSync(path.join(projectPath, 'Gemfile'))) push('ruby');
  if (
    fs.existsSync(path.join(projectPath, 'pyproject.toml')) ||
    fs.existsSync(path.join(projectPath, 'setup.py')) ||
    fs.existsSync(path.join(projectPath, 'requirements.txt')) ||
    fs.existsSync(path.join(projectPath, 'requirements.in'))
  ) {
    push('python');
  }
  if (
    fs.existsSync(path.join(projectPath, 'deps.edn')) ||
    fs.existsSync(path.join(projectPath, 'project.clj'))
  ) {
    push('clojure');
  }
  if (fs.existsSync(path.join(projectPath, 'build.sbt'))) push('scala');
  if (
    fs.existsSync(path.join(projectPath, 'deno.json')) ||
    fs.existsSync(path.join(projectPath, 'deno.jsonc'))
  ) {
    push('deno');
  }
  if (
    fs.existsSync(path.join(projectPath, 'bun.lockb')) ||
    fs.existsSync(path.join(projectPath, 'bun.lock'))
  ) {
    push('bun');
  }
  if (
    fs.existsSync(path.join(projectPath, 'settings.gradle.kts')) ||
    hasFileWithSuffix(path.join(projectPath, 'src'), '.kt', 3)
  ) {
    push('kotlin');
  }

  return candidates;
}

export function detectBackendFrameworkFromProject(
  projectPath: string,
  projectJsonData?: Record<string, unknown> | null
): BackendFrameworkDetection {
  const hinted = detectBackendFrameworkFromHints({
    framework:
      typeof projectJsonData?.framework === 'string'
        ? (projectJsonData.framework as string)
        : undefined,
    runtime:
      typeof projectJsonData?.runtime === 'string'
        ? (projectJsonData.runtime as string)
        : undefined,
    kitName:
      typeof projectJsonData?.kit_name === 'string'
        ? (projectJsonData.kit_name as string)
        : typeof projectJsonData?.kit === 'string'
          ? (projectJsonData.kit as string)
          : undefined,
  });
  if (hinted.key !== 'unknown') {
    return hinted;
  }

  const runtimeCandidates = detectRuntimeCandidatesFromProject(projectPath);
  if (runtimeCandidates.includes('node')) {
    const detection = detectNodeBackendFromProject(projectPath);
    if (detection.key !== 'unknown') {
      return detection;
    }
  }
  if (runtimeCandidates.includes('python')) {
    const detection = detectPythonBackendFromProject(projectPath);
    if (detection.key !== 'unknown') {
      return detection;
    }
  }
  if (runtimeCandidates.includes('go')) {
    const detection = detectGoBackendFromProject(projectPath);
    if (detection.key !== 'unknown') {
      return detection;
    }
  }
  if (runtimeCandidates.includes('java')) {
    const detection = detectJavaBackendFromProject(projectPath);
    if (detection.key !== 'unknown') {
      return detection;
    }
  }
  if (runtimeCandidates.includes('php')) {
    const detection = detectPhpBackendFromProject(projectPath);
    if (detection.key !== 'unknown') {
      return detection;
    }
  }
  if (runtimeCandidates.includes('ruby')) {
    const detection = detectRubyBackendFromProject(projectPath);
    if (detection.key !== 'unknown') {
      return detection;
    }
  }
  if (runtimeCandidates.includes('rust')) {
    const detection = detectRustBackendFromProject(projectPath);
    if (detection.key !== 'unknown') {
      return detection;
    }
  }
  if (runtimeCandidates.includes('elixir')) {
    const detection = detectElixirBackendFromProject(projectPath);
    if (detection.key !== 'unknown') {
      return detection;
    }
  }
  if (runtimeCandidates.includes('dotnet')) {
    return buildDetection('dotnet', 'medium', 'marker');
  }
  if (runtimeCandidates.includes('clojure')) {
    return buildDetection('clojure', 'medium', 'marker');
  }
  if (runtimeCandidates.includes('scala')) {
    return buildDetection('scala', 'medium', 'marker');
  }
  if (runtimeCandidates.includes('kotlin')) {
    return buildDetection('kotlin', 'medium', 'marker');
  }
  if (runtimeCandidates.includes('deno')) {
    return buildDetection('deno', 'high', 'marker');
  }
  if (runtimeCandidates.includes('bun')) {
    return buildDetection('bun', 'high', 'marker');
  }
  if (runtimeCandidates.length > 0) {
    return buildDetection(normalizeBackendPlatformKey(runtimeCandidates[0]), 'medium', 'runtime');
  }

  return buildDetection('unknown', 'low', 'unknown');
}
