import path from 'path';
import fsExtra from 'fs-extra';

import { discoverProjectJsonFiles } from './workspace-contract.js';
import type { InfraStackContract } from './infra-stack.js';
import { resolveServicesFromEnvVar } from './infra-stack.js';

export function parseEnvExampleLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const eqIndex = trimmed.indexOf('=');
  if (eqIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, eqIndex).trim();
  if (!/^[A-Z0-9_]+$/.test(key)) {
    return null;
  }

  let raw = trimmed.slice(eqIndex + 1).trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1);
  }

  const defaultMatch = raw.match(/^\$\{[A-Z0-9_]+:-([^}]+)\}$/);
  const value = (defaultMatch ? defaultMatch[1] : raw).trim();
  if (!value) {
    return null;
  }

  return { key, value };
}

export async function parseEnvExampleDefaults(
  envExamplePath: string
): Promise<Record<string, string>> {
  if (!(await fsExtra.pathExists(envExamplePath))) {
    return {};
  }

  try {
    const content = await fsExtra.readFile(envExamplePath, 'utf-8');
    const defaults: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const parsed = parseEnvExampleLine(line);
      if (parsed) {
        defaults[parsed.key] = parsed.value;
      }
    }
    return defaults;
  } catch {
    return {};
  }
}

export async function collectWorkspaceInfraConnectionDefaults(input: {
  workspacePath: string;
  contract: InfraStackContract;
}): Promise<Record<string, string>> {
  const merged: Record<string, string> = {};
  const projectJsonFiles = await discoverProjectJsonFiles(input.workspacePath);

  for (const projectJsonPath of projectJsonFiles) {
    const projectRoot = path.dirname(path.dirname(projectJsonPath));
    const defaults = await parseEnvExampleDefaults(path.join(projectRoot, '.env.example'));
    for (const [key, value] of Object.entries(defaults)) {
      if (resolveServicesFromEnvVar(input.contract, key).length > 0) {
        merged[key] = value;
      }
    }
  }

  return merged;
}

export function listInfraMappedEnvVars(envVars: string[], contract: InfraStackContract): string[] {
  return envVars.filter((envVar) => resolveServicesFromEnvVar(contract, envVar).length > 0).sort();
}

export function parsePostgresServiceEnv(
  connectionEnv: Record<string, string>
): Record<string, string> | undefined {
  const url = connectionEnv.RAPIDKIT_DB_POSTGRES_URL || connectionEnv.DATABASE_URL;
  if (!url?.startsWith('postgresql://')) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    const database = parsed.pathname.replace(/^\//, '');
    return {
      POSTGRES_USER: decodeURIComponent(parsed.username || 'postgres'),
      POSTGRES_PASSWORD: decodeURIComponent(parsed.password || 'postgres'),
      POSTGRES_DB: database || 'postgres',
    };
  } catch {
    return undefined;
  }
}

export function postgresHealthcheckCommand(env: Record<string, string>): string[] {
  const user = env.POSTGRES_USER || 'postgres';
  const database = env.POSTGRES_DB || 'postgres';
  return ['CMD-SHELL', `pg_isready -U ${user} -d ${database}`];
}
