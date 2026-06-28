import os from 'os';
import path from 'path';
import fs from 'fs-extra';

export type PlatformKind = 'windows' | 'linux' | 'macos' | 'other';

export type PythonVersionProbe = {
  command: string;
  args: string[];
};

export function detectPlatformKind(platform: NodeJS.Platform = process.platform): PlatformKind {
  if (platform === 'win32') return 'windows';
  if (platform === 'linux') return 'linux';
  if (platform === 'darwin') return 'macos';
  return 'other';
}

export function isWindowsPlatform(platform: NodeJS.Platform = process.platform): boolean {
  return detectPlatformKind(platform) === 'windows';
}

export function shouldUseShellExecution(platform: NodeJS.Platform = process.platform): boolean {
  return isWindowsPlatform(platform);
}

const PACKAGE_RUNNER_COMMANDS = new Set(['npx', 'npm', 'yarn', 'pnpm']);

export type PackageRunnerInvocation = {
  command: string;
  prefixArgs: string[];
};

function packageRunnerCliBasename(command: string): string {
  return command === 'npx' ? 'npx-cli.js' : 'npm-cli.js';
}

function npmExecPathCandidate(command: string, env: NodeJS.ProcessEnv): string | null {
  const execPath = env.npm_execpath;
  if (!execPath) return null;

  const basename = path.basename(execPath).toLowerCase();
  if (command === 'npx' && basename !== 'npx-cli.js') {
    const sibling = path.join(path.dirname(execPath), 'npx-cli.js');
    return fs.existsSync(sibling) ? sibling : null;
  }
  if (command === 'npm' && basename === 'npx-cli.js') {
    const sibling = path.join(path.dirname(execPath), 'npm-cli.js');
    return fs.existsSync(sibling) ? sibling : null;
  }
  return fs.existsSync(execPath) ? execPath : null;
}

function wellKnownPackageRunnerCliCandidates(command: string): string[] {
  if (command !== 'npm' && command !== 'npx') return [];

  const cli = packageRunnerCliBasename(command);
  const nodeBinDir = path.dirname(process.execPath);
  const prefix = path.dirname(nodeBinDir);

  return [
    path.join(prefix, 'lib', 'node_modules', 'npm', 'bin', cli),
    path.join(prefix, 'lib64', 'node_modules', 'npm', 'bin', cli),
    path.join('/usr', 'lib', 'node_modules', 'npm', 'bin', cli),
    path.join('/usr', 'local', 'lib', 'node_modules', 'npm', 'bin', cli),
    path.join('/usr', 'share', 'nodejs', 'npm', 'bin', cli),
  ];
}

/** Resolve npx/npm next to the active Node binary (fixes VS Code extension host PATH gaps). */
export function resolvePackageRunnerExecutable(
  command: string,
  platform: NodeJS.Platform = process.platform
): string {
  return resolvePackageRunnerInvocation(command, platform).command;
}

/**
 * Resolve npm-family package runners for subprocess execution.
 *
 * Enterprise surfaces often invoke RapidKit from VS Code, npm/npx shims, or CI
 * jobs with a reduced PATH. Returning command + prefixArgs lets callers safely
 * execute `node npm-cli.js ...` or `corepack npm ...` without shell-string hacks.
 */
export function resolvePackageRunnerInvocation(
  command: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): PackageRunnerInvocation {
  const normalized = command.trim();
  if (!PACKAGE_RUNNER_COMMANDS.has(normalized)) {
    return { command: normalized, prefixArgs: [] };
  }

  const nodeBinDir = path.dirname(process.execPath);
  const extension = isWindowsPlatform(platform) ? '.cmd' : '';
  const candidates = [
    path.join(nodeBinDir, `${normalized}${extension}`),
    path.join(nodeBinDir, normalized),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { command: candidate, prefixArgs: [] };
    }
  }

  const npmExecPath = npmExecPathCandidate(normalized, env);
  if (npmExecPath) {
    return { command: process.execPath, prefixArgs: [npmExecPath] };
  }

  for (const candidate of wellKnownPackageRunnerCliCandidates(normalized)) {
    if (fs.existsSync(candidate)) {
      return { command: process.execPath, prefixArgs: [candidate] };
    }
  }

  if (normalized === 'npm') {
    return { command: 'corepack', prefixArgs: ['npm'] };
  }

  return { command: normalized, prefixArgs: [] };
}

export function augmentPathWithNodeBin(
  pathEnv?: string,
  platform: NodeJS.Platform = process.platform
): string {
  const delimiter = isWindowsPlatform(platform) ? ';' : ':';
  const nodeBin = path.dirname(process.execPath);
  const parts = (pathEnv ?? process.env.PATH ?? '').split(delimiter).filter(Boolean);
  if (!parts.includes(nodeBin)) {
    parts.unshift(nodeBin);
  }
  return parts.join(delimiter);
}

/** npm_config keys inherited from `npx --package …` that break nested npx/npm runs. */
const NPX_PARENT_PACKAGE_ENV_KEYS = ['npm_config_package', 'npm_config__package'] as const;

/**
 * Env for spawning nested npx/npm/yarn/pnpm from RapidKit.
 * Strips parent `npx --package file:…` package pins so inner generators resolve from the registry.
 */
export function buildPackageRunnerSubprocessEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
  const rapidkitCorepackHome = path.join(os.tmpdir(), 'rapidkit-corepack');
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    PATH: augmentPathWithNodeBin(baseEnv.PATH, platform),
    COREPACK_HOME: baseEnv.COREPACK_HOME ?? rapidkitCorepackHome,
  };
  for (const key of NPX_PARENT_PACKAGE_ENV_KEYS) {
    delete env[key];
  }
  return env;
}

export function getDefaultPythonCommand(platform: NodeJS.Platform = process.platform): string {
  return isWindowsPlatform(platform) ? 'python' : 'python3';
}

export function getPythonCommandCandidates(platform: NodeJS.Platform = process.platform): string[] {
  return isWindowsPlatform(platform) ? ['python', 'py', 'python3'] : ['python3', 'python'];
}

export function getPythonVersionProbeCandidates(
  maxMinor = 14,
  minMinor = 10,
  platform: NodeJS.Platform = process.platform
): PythonVersionProbe[] {
  const probes: PythonVersionProbe[] = [];

  if (isWindowsPlatform(platform)) {
    for (let minor = maxMinor; minor >= minMinor; minor -= 1) {
      probes.push({ command: 'py', args: [`-3.${minor}`, '--version'] });
    }
    probes.push({ command: 'py', args: ['-3', '--version'] });
    probes.push({ command: 'python', args: ['--version'] });
    return probes;
  }

  for (let minor = maxMinor; minor >= minMinor; minor -= 1) {
    probes.push({ command: `python3.${minor}`, args: ['--version'] });
  }
  probes.push({ command: 'python3', args: ['--version'] });
  probes.push({ command: 'python', args: ['--version'] });
  return probes;
}

export function getVenvBinDirectory(
  venvPath: string,
  platform: NodeJS.Platform = process.platform
): string {
  return isWindowsPlatform(platform) ? path.join(venvPath, 'Scripts') : path.join(venvPath, 'bin');
}

export function getVenvPythonPath(
  venvPath: string,
  platform: NodeJS.Platform = process.platform
): string {
  return isWindowsPlatform(platform)
    ? path.join(venvPath, 'Scripts', 'python.exe')
    : path.join(venvPath, 'bin', 'python');
}

export function getVenvRapidkitPath(
  venvPath: string,
  platform: NodeJS.Platform = process.platform
): string {
  return isWindowsPlatform(platform)
    ? path.join(venvPath, 'Scripts', 'rapidkit.exe')
    : path.join(venvPath, 'bin', 'rapidkit');
}

export function getVenvActivateScriptPath(
  venvPath: string,
  platform: NodeJS.Platform = process.platform
): string {
  return isWindowsPlatform(platform)
    ? path.join(venvPath, 'Scripts', 'activate')
    : path.join(venvPath, 'bin', 'activate');
}

export function getRapidkitLocalScriptCandidates(
  cwd: string,
  platform: NodeJS.Platform = process.platform
): string[] {
  if (isWindowsPlatform(platform)) {
    return [path.join(cwd, 'rapidkit.cmd'), path.join(cwd, '.rapidkit', 'rapidkit.cmd')];
  }
  return [path.join(cwd, 'rapidkit'), path.join(cwd, '.rapidkit', 'rapidkit')];
}

export function getWorkspaceRegistryDirectory(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string {
  const configHome = env.XDG_CONFIG_HOME || env.APPDATA || path.join(os.homedir(), '.config');
  return isWindowsPlatform(platform)
    ? path.join(configHome, 'rapidkit')
    : path.join(os.homedir(), '.rapidkit');
}

export function getUserLocalBinCandidates(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string[] {
  const candidates: string[] = [];

  if (isWindowsPlatform(platform)) {
    if (env.USERPROFILE) {
      candidates.push(path.join(env.USERPROFILE, '.local', 'bin'));
    }
    if (env.APPDATA) {
      candidates.push(path.join(env.APPDATA, 'Python', 'Scripts'));
    }
    if (env.LOCALAPPDATA) {
      candidates.push(path.join(env.LOCALAPPDATA, 'Programs', 'Python', 'Scripts'));
    }
  } else {
    candidates.push(path.join(os.homedir(), '.local', 'bin'));
  }

  return [...new Set(candidates.filter(Boolean))];
}
