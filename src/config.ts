import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './logger.js';
import { pathToFileURL } from 'url';

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

export interface RapidKitConfig {
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

const CONFIG_FILE_NAME = '.rapidkitrc.json';
const JS_CONFIG_FILES = ['rapidkit.config.js', 'rapidkit.config.mjs', 'rapidkit.config.cjs'];

/**
 * Load user configuration from home directory (.rapidkitrc.json)
 */
export async function loadUserConfig(): Promise<UserConfig> {
  const configPath = path.join(os.homedir(), CONFIG_FILE_NAME);

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as UserConfig;
    logger.debug(`Loaded config from ${configPath}`);
    return config;
  } catch (_error) {
    // Config file doesn't exist or is invalid - return empty config
    logger.debug('No user config found, using defaults');
    return {};
  }
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
 * Load RapidKit config file (rapidkit.config.js/mjs/cjs) from current directory or parent
 */
export async function loadRapidKitConfig(
  startDir: string = process.cwd()
): Promise<RapidKitConfig> {
  let currentDir = startDir;
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    // Try each config file variant
    for (const configFile of JS_CONFIG_FILES) {
      const configPath = path.join(currentDir, configFile);

      try {
        await fs.access(configPath);
        logger.debug(`Found config file: ${configPath}`);

        // Import the config file
        const fileUrl = pathToFileURL(configPath).href;
        const configModule = await import(fileUrl);
        const config = configModule.default || configModule;

        logger.debug(`Loaded RapidKit config from ${configFile}`);
        return config as RapidKitConfig;
      } catch (_err) {
        // File doesn't exist or import failed, try next variant
        continue;
      }
    }

    // Move up one directory
    currentDir = path.dirname(currentDir);
  }

  logger.debug('No RapidKit config file found, using defaults');
  return {};
}

/**
 * Merge configs with priority: CLI args > rapidkit.config.js > .rapidkitrc.json > defaults
 */
export function mergeConfigs(
  userConfig: UserConfig,
  rapidkitConfig: RapidKitConfig,
  cliOptions: Partial<UserConfig>
): UserConfig {
  return {
    author: cliOptions.author || rapidkitConfig.workspace?.defaultAuthor || userConfig.author,
    pythonVersion:
      cliOptions.pythonVersion ||
      rapidkitConfig.workspace?.pythonVersion ||
      userConfig.pythonVersion,
    defaultInstallMethod:
      cliOptions.defaultInstallMethod ||
      rapidkitConfig.workspace?.installMethod ||
      userConfig.defaultInstallMethod,
    defaultKit:
      cliOptions.defaultKit || rapidkitConfig.projects?.defaultKit || userConfig.defaultKit,
    skipGit: cliOptions.skipGit ?? rapidkitConfig.projects?.skipGit ?? userConfig.skipGit,
    license: cliOptions.license || userConfig.license,
    testRapidKitPath: cliOptions.testRapidKitPath || userConfig.testRapidKitPath,
  };
}

/**
 * Get test RapidKit path from config or environment
 */
export function getTestRapidKitPath(config: UserConfig): string | undefined {
  // Priority: CLI option > Environment variable > Config file
  return process.env.RAPIDKIT_DEV_PATH || config.testRapidKitPath || undefined;
}
