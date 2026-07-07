import fs from 'fs';
import path from 'path';
import os from 'os';
import { type UserConfig } from '../config.js';

const CONFIG_FILE = path.join(os.homedir(), '.workspairc.json');
const LEGACY_RC_CONFIG_FILE = path.join(os.homedir(), '.rapidkitrc.json');
const LEGACY_CONFIG_FILE = path.join(os.homedir(), '.rapidkit', 'config.json');

function readConfigFile(filePath: string): UserConfig {
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(data) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as UserConfig;
  } catch {
    return {};
  }
}

function ensureConfigFilePermissions(filePath: string): void {
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // Permission hardening is best-effort and must not block CLI.
    }
  }
}

/**
 * Get user configuration from ~/.workspairc.json.
 * Legacy fallbacks: ~/.rapidkitrc.json and ~/.rapidkit/config.json.
 */
export function getUserConfig(): UserConfig {
  const primary = readConfigFile(CONFIG_FILE);
  const legacyRc = readConfigFile(LEGACY_RC_CONFIG_FILE);
  const legacy = readConfigFile(LEGACY_CONFIG_FILE);

  if (fs.existsSync(CONFIG_FILE)) {
    ensureConfigFilePermissions(CONFIG_FILE);
  }

  // Preserve non-AI keys from primary config while safely inheriting missing legacy AI keys.
  return {
    ...legacyRc,
    ...primary,
    openaiApiKey: primary.openaiApiKey ?? legacyRc.openaiApiKey ?? legacy.openaiApiKey,
    aiEnabled: primary.aiEnabled ?? legacyRc.aiEnabled ?? legacy.aiEnabled,
    telemetry: primary.telemetry ?? legacyRc.telemetry ?? legacy.telemetry,
  };
}

/**
 * Update user configuration (merges with existing)
 */
export function setUserConfig(config: Partial<UserConfig>): void {
  const current = getUserConfig();
  const updated = { ...current, ...config };

  // Write updated config
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
  ensureConfigFilePermissions(CONFIG_FILE);
}

/**
 * Get OpenAI API key from environment or config
 * Priority: 1. Environment variable, 2. User config file
 */
export function getOpenAIKey(): string | null {
  return process.env.OPENAI_API_KEY || getUserConfig().openaiApiKey || null;
}

/**
 * Check if AI features are enabled
 */
export function isAIEnabled(): boolean {
  const config = getUserConfig();
  return config.aiEnabled !== false; // Enabled by default
}

/**
 * Get config file path for display
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}
