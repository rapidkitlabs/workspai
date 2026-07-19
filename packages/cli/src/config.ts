import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './logger.js';
import { pathToFileURL } from 'url';
import { readWorkspaiEnv } from './utils/env-compat.js';

export interface UserConfig {
  defaultKit?: string;
  defaultInstallMethod?: 'poetry' | 'venv' | 'pipx';
  pythonVersion?: '3.10' | '3.11' | '3.12';
  author?: string;
  license?: string;
  skipGit?: boolean;
  openaiApiKey?: string;
  aiEnabled?: boolean;
  telemetry?: boolean;
  // Test mode configuration (for development only)
  testRapidKitPath?: string;
}

export interface WorkspaiConfig {
  workspace?: {
    defaultAuthor?: string;
    pythonVersion?: '3.10' | '3.11' | '3.12';
    installMethod?: 'poetry' | 'venv' | 'pipx';
  };
  projects?: {
    defaultKit?: string;
    addDefaultModules?: string[];
    skipGit?: boolean;
    skipInstall?: boolean;
  };
}

/** @deprecated Use WorkspaiConfig. */
export type RapidKitConfig = WorkspaiConfig;

const CONFIG_FILE_NAME = '.workspairc.json';
const LEGACY_CONFIG_FILE_NAME = '.rapidkitrc.json';
const JS_CONFIG_FILES = [
  'workspai.config.js',
  'workspai.config.mjs',
  'workspai.config.cjs',
  'rapidkit.config.js',
  'rapidkit.config.mjs',
  'rapidkit.config.cjs',
];
const DATA_CONFIG_FILES = ['workspai.config.json', 'rapidkit.config.json'];

export interface LoadWorkspaiConfigOptions {
  /** Explicit consent to execute JavaScript configuration discovered in the directory tree. */
  trustExecutableConfig?: boolean;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

function configLoadErrorMessage(configPath: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const syntaxHint =
    configPath.endsWith('.js') && /module is not defined in ES module scope/i.test(message)
      ? ' CommonJS syntax in a .js config is not valid when the project package uses "type": "module"; rename the file to .cjs or use export default.'
      : '';
  return `Failed to load Workspai config at ${configPath}.${syntaxHint} Cause: ${message}`;
}

/**
 * Load user configuration from home directory (.workspairc.json; .rapidkitrc.json fallback)
 */
export async function loadUserConfig(): Promise<UserConfig> {
  for (const configPath of [
    path.join(os.homedir(), CONFIG_FILE_NAME),
    path.join(os.homedir(), LEGACY_CONFIG_FILE_NAME),
  ]) {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content) as UserConfig;
      logger.debug(`Loaded config from ${configPath}`);
      return config;
    } catch (_error) {
      // Try the next config candidate.
    }
  }
  logger.debug('No user config found, using defaults');
  return {};
}

/**
 * Save user configuration to home directory
 */
export async function saveUserConfig(config: UserConfig): Promise<void> {
  const configPath = path.join(os.homedir(), CONFIG_FILE_NAME);

  try {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    logger.debug(`Saved config to ${configPath}`);
  } catch (_error) {
    logger.warn('Could not save configuration file');
  }
}

/**
 * Load Workspai config file (workspai.config.js/mjs/cjs) from current directory or parent.
 * Legacy rapidkit.config.* files remain supported during migration.
 */
export async function loadWorkspaiConfig(
  startDir: string = process.cwd(),
  options: LoadWorkspaiConfigOptions = {}
): Promise<WorkspaiConfig> {
  let currentDir = startDir;
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    for (const configFile of DATA_CONFIG_FILES) {
      const configPath = path.join(currentDir, configFile);
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        const config: unknown = JSON.parse(content);
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
          throw new Error('configuration root must be a JSON object');
        }
        logger.debug(`Loaded data-only Workspai config from ${configFile}`);
        return config as WorkspaiConfig;
      } catch (error) {
        if (isMissingFileError(error)) continue;
        throw new Error(configLoadErrorMessage(configPath, error));
      }
    }

    // Try each config file variant
    for (const configFile of JS_CONFIG_FILES) {
      const configPath = path.join(currentDir, configFile);

      try {
        await fs.access(configPath);
      } catch (error) {
        if (isMissingFileError(error)) {
          continue;
        }
        throw new Error(configLoadErrorMessage(configPath, error));
      }

      logger.debug(`Found config file: ${configPath}`);

      if (!options.trustExecutableConfig) {
        throw new Error(
          `Refusing to execute Workspai config at ${configPath} without explicit trust. ` +
            'Use a data-only workspai.config.json file, pass --trust-config, or set WORKSPAI_TRUST_CONFIG=1.'
        );
      }

      try {
        // Import the config file
        const fileUrl = pathToFileURL(configPath).href;
        const configModule = await import(fileUrl);
        const config = configModule.default || configModule;

        logger.debug(`Loaded Workspai config from ${configFile}`);
        return config as WorkspaiConfig;
      } catch (error) {
        throw new Error(configLoadErrorMessage(configPath, error));
      }
    }

    // Move up one directory
    currentDir = path.dirname(currentDir);
  }

  logger.debug('No Workspai config file found, using defaults');
  return {};
}

/** @deprecated Use loadWorkspaiConfig. */
export const loadRapidKitConfig = loadWorkspaiConfig;

/**
 * Merge configs with priority: CLI args > workspai.config.* > .workspairc.json > legacy fallback > defaults
 */
export function mergeConfigs(
  userConfig: UserConfig,
  workspaiConfig: WorkspaiConfig,
  cliOptions: Partial<UserConfig>
): UserConfig {
  return {
    author: cliOptions.author || workspaiConfig.workspace?.defaultAuthor || userConfig.author,
    pythonVersion:
      cliOptions.pythonVersion ||
      workspaiConfig.workspace?.pythonVersion ||
      userConfig.pythonVersion,
    defaultInstallMethod:
      cliOptions.defaultInstallMethod ||
      workspaiConfig.workspace?.installMethod ||
      userConfig.defaultInstallMethod,
    defaultKit:
      cliOptions.defaultKit || workspaiConfig.projects?.defaultKit || userConfig.defaultKit,
    skipGit: cliOptions.skipGit ?? workspaiConfig.projects?.skipGit ?? userConfig.skipGit,
    license: cliOptions.license || userConfig.license,
    testRapidKitPath: cliOptions.testRapidKitPath || userConfig.testRapidKitPath,
  };
}

/**
 * Get test RapidKit path from config or environment
 */
export function getTestRapidKitPath(config: UserConfig): string | undefined {
  // Priority: CLI option > Environment variable > Config file
  return readWorkspaiEnv('DEV_PATH') || config.testRapidKitPath || undefined;
}
