import { execa } from 'execa';
import chalk from 'chalk';
import { createRequire } from 'module';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './logger.js';
import { getNetworkTimeoutMs } from './utils/command-timeouts.js';
import { readWorkspaiEnv } from './utils/env-compat.js';

const PACKAGE_NAME = 'workspai';

// Get package version from package.json
const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version?: string };
const CURRENT_VERSION = packageJson?.version ?? '0.0.0';

type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: Array<string | number>;
};

function parseVersion(raw: string): ParsedVersion | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;

  const prerelease = match[4]
    ? match[4].split('.').map((part) => (part.match(/^\d+$/) ? Number(part) : part))
    : [];

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
  };
}

function compareVersions(aRaw: string, bRaw: string): number {
  const a = parseVersion(aRaw);
  const b = parseVersion(bRaw);
  if (!a || !b) return 0;

  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;

  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;

  const len = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < len; i += 1) {
    const left = a.prerelease[i];
    const right = b.prerelease[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left === right) continue;

    const leftNum = typeof left === 'number';
    const rightNum = typeof right === 'number';
    if (leftNum && rightNum) return left > right ? 1 : -1;
    if (leftNum) return -1;
    if (rightNum) return 1;
    return String(left) > String(right) ? 1 : -1;
  }

  return 0;
}

/**
 * Check if a newer version of rapidkit is available on npm
 */

const UPDATE_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

/** Returns the cache file path, isolated per vitest worker to avoid test contamination. */
function getUpdateCacheFile(): string {
  const base =
    readWorkspaiEnv('CACHE_DIR') ||
    (process.env.VITEST_WORKER_ID
      ? path.join(os.homedir(), '.workspai', 'cache', `vitest-${process.env.VITEST_WORKER_ID}`)
      : path.join(os.homedir(), '.workspai', 'cache'));
  return path.join(base, 'update-check.json');
}

interface UpdateCache {
  latestVersion: string;
  checkedAt: number;
  currentVersion: string;
}

async function readUpdateCache(): Promise<UpdateCache | null> {
  try {
    const content = await fs.readFile(getUpdateCacheFile(), 'utf-8');
    const data = JSON.parse(content) as UpdateCache;
    if (
      typeof data.latestVersion === 'string' &&
      typeof data.checkedAt === 'number' &&
      data.currentVersion === CURRENT_VERSION &&
      Date.now() - data.checkedAt < UPDATE_CACHE_TTL
    ) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeUpdateCache(latestVersion: string): Promise<void> {
  try {
    const cacheFile = getUpdateCacheFile();
    await fs.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.writeFile(
      cacheFile,
      JSON.stringify({ latestVersion, checkedAt: Date.now(), currentVersion: CURRENT_VERSION }),
      'utf-8'
    );
  } catch {
    // silent fail — cache write failure must never block the CLI
  }
}

async function clearUpdateCache(): Promise<void> {
  await fs.unlink(getUpdateCacheFile()).catch(() => {});
}

export async function checkForUpdates(): Promise<void> {
  try {
    logger.debug('Checking for updates...');

    // Fast path: serve from disk cache (avoids network call entirely)
    const cached = await readUpdateCache();
    if (cached) {
      const ageMin = Math.round((Date.now() - cached.checkedAt) / 60_000);
      logger.debug(`Update check: cache hit (${ageMin}m old)`);
      if (compareVersions(cached.latestVersion, CURRENT_VERSION) > 0) {
        console.log(
          chalk.yellow(`\n⚠️  Update available: ${CURRENT_VERSION} → ${cached.latestVersion}`)
        );
        console.log(chalk.cyan('Run: npm install -g workspai@latest\n'));
      }
      return;
    }

    // Cache miss — fetch from npm registry
    const { stdout } = await execa('npm', ['view', PACKAGE_NAME, 'version'], {
      timeout: getNetworkTimeoutMs(),
    });

    const latestVersion = stdout.trim();

    // Persist result so the next 4 hours skip the network call
    await writeUpdateCache(latestVersion);

    if (latestVersion && compareVersions(latestVersion, CURRENT_VERSION) > 0) {
      console.log(chalk.yellow(`\n⚠️  Update available: ${CURRENT_VERSION} → ${latestVersion}`));
      console.log(chalk.cyan('Run: npm install -g workspai@latest\n'));
    } else {
      logger.debug('You are using the latest version');
    }
  } catch (_error) {
    // Silent fail - don't interrupt the user experience
    logger.debug('Could not check for updates');
  }
}

/**
 * Get the current package version
 */
export function getVersion(): string {
  return CURRENT_VERSION;
}

export const __testables = {
  parseVersion,
  compareVersions,
  clearUpdateCache,
};
