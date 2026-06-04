import type { BackendRuntimeFamily } from './backend-framework-contract.js';

export type RuntimeCommand =
  | 'init'
  | 'dev'
  | 'start'
  | 'build'
  | 'test'
  | 'lint'
  | 'format'
  | 'help';

export interface RuntimeAdapter {
  runtime: BackendRuntimeFamily;
  displayName: string;
  supportedCommands: RuntimeCommand[];
  packageManagers: string[];
  primaryFiles: string[];
  notes: string[];
}

const ALL_RUNTIME_COMMANDS: RuntimeCommand[] = [
  'init',
  'dev',
  'start',
  'build',
  'test',
  'lint',
  'format',
  'help',
];

const RUNTIME_ADAPTERS: Record<string, RuntimeAdapter> = {
  python: {
    runtime: 'python',
    displayName: 'Python',
    supportedCommands: ALL_RUNTIME_COMMANDS,
    packageManagers: ['poetry', 'pip', 'uv'],
    primaryFiles: ['pyproject.toml', 'requirements.txt', 'requirements.in'],
    notes: ['Core-backed projects can use RapidKit modules and template operations.'],
  },
  node: {
    runtime: 'node',
    displayName: 'Node.js',
    supportedCommands: ALL_RUNTIME_COMMANDS,
    packageManagers: ['npm', 'pnpm', 'yarn', 'bun'],
    primaryFiles: ['package.json'],
    notes: ['Node projects run through package-manager scripts when available.'],
  },
  go: {
    runtime: 'go',
    displayName: 'Go',
    supportedCommands: ALL_RUNTIME_COMMANDS,
    packageManagers: ['go'],
    primaryFiles: ['go.mod'],
    notes: ['Go projects use local launchers, Makefile targets, and go tooling.'],
  },
  java: {
    runtime: 'java',
    displayName: 'Java',
    supportedCommands: ALL_RUNTIME_COMMANDS,
    packageManagers: ['maven', 'gradle'],
    primaryFiles: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    notes: ['Java projects use Maven/Gradle wrappers when generated or detected.'],
  },
  dotnet: {
    runtime: 'dotnet',
    displayName: '.NET',
    supportedCommands: ALL_RUNTIME_COMMANDS,
    packageManagers: ['dotnet'],
    primaryFiles: ['*.csproj', '*.sln'],
    notes: ['.NET projects use the dotnet CLI and generated RapidKit launchers.'],
  },
  php: {
    runtime: 'php',
    displayName: 'PHP',
    supportedCommands: ALL_RUNTIME_COMMANDS,
    packageManagers: ['composer'],
    primaryFiles: ['composer.json'],
    notes: ['Imported PHP projects are managed as observed runtime projects until a kit exists.'],
  },
  ruby: {
    runtime: 'ruby',
    displayName: 'Ruby',
    supportedCommands: ALL_RUNTIME_COMMANDS,
    packageManagers: ['bundle'],
    primaryFiles: ['Gemfile'],
    notes: ['Imported Ruby projects are managed as observed runtime projects until a kit exists.'],
  },
  rust: {
    runtime: 'rust',
    displayName: 'Rust',
    supportedCommands: ALL_RUNTIME_COMMANDS,
    packageManagers: ['cargo'],
    primaryFiles: ['Cargo.toml'],
    notes: ['Rust projects use cargo commands and generated RapidKit launchers when available.'],
  },
  elixir: {
    runtime: 'elixir',
    displayName: 'Elixir',
    supportedCommands: ALL_RUNTIME_COMMANDS,
    packageManagers: ['mix'],
    primaryFiles: ['mix.exs'],
    notes: ['Elixir projects are detected and governed as observed runtime projects.'],
  },
  kotlin: {
    runtime: 'kotlin',
    displayName: 'Kotlin',
    supportedCommands: ALL_RUNTIME_COMMANDS,
    packageManagers: ['gradle'],
    primaryFiles: ['settings.gradle.kts', '*.kt'],
    notes: ['Kotlin projects are detected and governed as observed runtime projects.'],
  },
};

export function getRuntimeAdapter(runtime: string): RuntimeAdapter | null {
  return RUNTIME_ADAPTERS[runtime] ?? null;
}

export function hasRuntimeAdapter(runtime: string): boolean {
  return getRuntimeAdapter(runtime) !== null;
}

export function listRuntimeAdapters(): RuntimeAdapter[] {
  return Object.values(RUNTIME_ADAPTERS).sort((a, b) => a.runtime.localeCompare(b.runtime));
}
