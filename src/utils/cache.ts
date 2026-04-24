// src/utils/cache.ts
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createHash } from 'crypto';
import { logger } from '../logger.js';

const BASE_CACHE_DIR = path.join(os.homedir(), '.rapidkit', 'cache');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCacheDir(): string {
  const configured = process.env.RAPIDKIT_CACHE_DIR?.trim();
  if (configured) {
    return configured;
  }

  const vitestWorkerId = process.env.VITEST_WORKER_ID?.trim();
  if (vitestWorkerId) {
    return path.join(BASE_CACHE_DIR, `vitest-${vitestWorkerId}`);
  }

  return BASE_CACHE_DIR;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: string;
}

export class Cache {
  private static instance: Cache;
  private memoryCache = new Map<string, CacheEntry<unknown>>();

  private constructor() {}

  static getInstance(): Cache {
    if (!Cache.instance) {
      Cache.instance = new Cache();
    }
    return Cache.instance;
  }

  private getCacheKey(key: string): string {
    return createHash('md5').update(key).digest('hex');
  }

  private getCachePath(key: string): string {
    return path.join(getCacheDir(), `${this.getCacheKey(key)}.json`);
  }

  private getTempCachePath(cachePath: string): string {
    const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${cachePath}.${suffix}.tmp`;
  }

  async get<T>(key: string, version: string = '1.0'): Promise<T | null> {
    // Check memory cache first
    const memEntry = this.memoryCache.get(key);
    if (memEntry && memEntry.version === version) {
      if (Date.now() - memEntry.timestamp < CACHE_TTL) {
        logger.debug(`Cache hit (memory): ${key}`);
        return memEntry.data as T | null;
      }
    }

    // Check disk cache
    try {
      const cachePath = this.getCachePath(key);
      const content = await fs.readFile(cachePath, 'utf-8');
      const entry: CacheEntry<T> = JSON.parse(content);

      if (entry.version === version && Date.now() - entry.timestamp < CACHE_TTL) {
        logger.debug(`Cache hit (disk): ${key}`);
        // Restore to memory cache
        this.memoryCache.set(key, entry);
        return entry.data;
      }

      // Expired or version mismatch
      await fs.unlink(cachePath).catch(() => {});
    } catch (_error) {
      logger.debug(`Cache miss: ${key}`);
    }

    return null;
  }

  async set<T>(key: string, data: T, version: string = '1.0'): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      version,
    };

    // Set in memory
    this.memoryCache.set(key, entry);

    // Set on disk
    try {
      await fs.mkdir(getCacheDir(), { recursive: true });
      const cachePath = this.getCachePath(key);
      const tempPath = this.getTempCachePath(cachePath);
      await fs.writeFile(tempPath, JSON.stringify(entry), 'utf-8');
      await fs.rename(tempPath, cachePath);
      logger.debug(`Cache set: ${key}`);
    } catch (_error) {
      logger.debug(`Cache write failed: ${key}`, _error);
    }
  }

  async invalidate(key: string): Promise<void> {
    this.memoryCache.delete(key);
    try {
      const cachePath = this.getCachePath(key);
      await fs.unlink(cachePath);
      logger.debug(`Cache invalidated: ${key}`);
    } catch {
      // Ignore errors
    }
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();
    try {
      const cacheDir = getCacheDir();
      const files = await fs.readdir(cacheDir);
      await Promise.all(files.map((file) => fs.unlink(path.join(cacheDir, file))));
      logger.debug('Cache cleared');
    } catch {
      // Ignore errors
    }
  }
}

/**
 * Get cached value or fetch and cache it
 */
export async function getCachedOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  version: string = '1.0'
): Promise<T> {
  const cache = Cache.getInstance();

  const cached = await cache.get<T>(key, version);
  if (cached !== null) {
    return cached;
  }

  const data = await fetcher();
  await cache.set(key, data, version);
  return data;
}
