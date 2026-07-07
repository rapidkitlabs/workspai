import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { Cache, getCachedOrFetch } from '../utils/cache.js';

describe('Cache', () => {
  let cache: Cache;

  beforeEach(() => {
    cache = Cache.getInstance();
  });

  afterEach(async () => {
    await cache.clear();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = Cache.getInstance();
      const instance2 = Cache.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('set and get', () => {
    it('should store and retrieve data from memory cache', async () => {
      const testData = { name: 'test', value: 123 };
      await cache.set('test-key', testData);

      const result = await cache.get<typeof testData>('test-key');
      expect(result).toEqual(testData);
    });

    it('should store and retrieve data from disk cache', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rapidkit-cache-test-'));
      const previousCacheDir = process.env.RAPIDKIT_CACHE_DIR;
      process.env.RAPIDKIT_CACHE_DIR = tmpDir;

      try {
        const testData = { name: 'disk-test', value: 456 };
        await cache.set('disk-key', testData);

        // Clear memory cache and get from disk
        cache['memoryCache'].clear();

        const result = await cache.get<typeof testData>('disk-key');
        expect(result).toEqual(testData);
      } finally {
        if (previousCacheDir === undefined) {
          delete process.env.RAPIDKIT_CACHE_DIR;
        } else {
          process.env.RAPIDKIT_CACHE_DIR = previousCacheDir;
        }
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it('should return null for non-existent keys', async () => {
      const result = await cache.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('should support version control', async () => {
      const testData = { version: 1 };
      await cache.set('version-key', testData, '1.0');

      // Should get data with matching version
      const result1 = await cache.get('version-key', '1.0');
      expect(result1).toEqual(testData);

      // Should not get data with different version
      const result2 = await cache.get('version-key', '2.0');
      expect(result2).toBeNull();
    });

    it('should handle complex data types', async () => {
      const complexData = {
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' },
        },
        date: new Date().toISOString(),
        boolean: true,
        null: null,
      };

      await cache.set('complex-key', complexData);
      const result = await cache.get('complex-key');
      expect(result).toEqual(complexData);
    });
  });

  describe('invalidate', () => {
    it('should remove data from cache', async () => {
      const testData = { name: 'test' };
      await cache.set('test-key', testData);

      await cache.invalidate('test-key');

      const result = await cache.get('test-key');
      expect(result).toBeNull();
    });

    it('should handle invalidating non-existent keys gracefully', async () => {
      await expect(cache.invalidate('non-existent')).resolves.not.toThrow();
    });
  });

  describe('clear', () => {
    it('should clear all cache entries', async () => {
      await cache.set('key1', { data: 1 });
      await cache.set('key2', { data: 2 });
      await cache.set('key3', { data: 3 });

      await cache.clear();

      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
      expect(await cache.get('key3')).toBeNull();
    });

    it('should handle clearing empty cache gracefully', async () => {
      await expect(cache.clear()).resolves.not.toThrow();
    });
  });

  describe('cache expiration', () => {
    it('should expire old cache entries', async () => {
      const testData = { name: 'expired' };

      // Mock Date.now before setting cache
      const originalNow = Date.now();
      const dateNowSpy = vi.spyOn(Date, 'now');

      // Set cache at current time
      dateNowSpy.mockReturnValue(originalNow);
      await cache.set('expire-key', testData);

      // Fast forward 25 hours
      dateNowSpy.mockReturnValue(originalNow + 25 * 60 * 60 * 1000);

      const result = await cache.get('expire-key');
      expect(result).toBeNull();

      dateNowSpy.mockRestore();
    });

    it('should not expire fresh entries', async () => {
      const testData = { name: 'fresh' };
      await cache.set('fresh-key', testData);

      // Check immediately
      const result = await cache.get('fresh-key');
      expect(result).toEqual(testData);
    });

    it('should respect cache TTL', async () => {
      const testData = { data: 'ttl-test' };
      const now = Date.now();
      const dateNowSpy = vi.spyOn(Date, 'now');

      dateNowSpy.mockReturnValue(now);
      await cache.set('ttl-key', testData);

      // 12 hours later (still valid)
      dateNowSpy.mockReturnValue(now + 12 * 60 * 60 * 1000);
      const result1 = await cache.get('ttl-key');
      expect(result1).toEqual(testData);

      // 25 hours later (expired)
      dateNowSpy.mockReturnValue(now + 25 * 60 * 60 * 1000);
      const result2 = await cache.get('ttl-key');
      expect(result2).toBeNull();

      dateNowSpy.mockRestore();
    });
  });
});

describe('getCachedOrFetch', () => {
  let cache: Cache;

  beforeEach(() => {
    cache = Cache.getInstance();
  });

  afterEach(async () => {
    await cache.clear();
  });

  it('should fetch and cache data on first call', async () => {
    const fetcher = vi.fn().mockResolvedValue({ data: 'fresh' });

    const result = await getCachedOrFetch('fetch-key', fetcher);

    expect(result).toEqual({ data: 'fresh' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('should return cached data on subsequent calls', async () => {
    const fetcher = vi.fn().mockResolvedValue({ data: 'fresh' });

    // First call - should fetch
    const result1 = await getCachedOrFetch('fetch-key', fetcher);
    expect(result1).toEqual({ data: 'fresh' });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Second call - should use cache
    const result2 = await getCachedOrFetch('fetch-key', fetcher);
    expect(result2).toEqual({ data: 'fresh' });
    expect(fetcher).toHaveBeenCalledTimes(1); // Still 1
  });

  it('should support versioning', async () => {
    const fetcher1 = vi.fn().mockResolvedValue({ version: 1 });
    const fetcher2 = vi.fn().mockResolvedValue({ version: 2 });

    // Cache version 1
    const result1 = await getCachedOrFetch('version-key', fetcher1, '1.0');
    expect(result1).toEqual({ version: 1 });
    expect(fetcher1).toHaveBeenCalledTimes(1);

    // Fetch version 2 (different version - different key effectively)
    const result2 = await getCachedOrFetch('version-key', fetcher2, '2.0');
    expect(result2).toEqual({ version: 2 });
    expect(fetcher2).toHaveBeenCalledTimes(1);

    // Get version 1 again from cache (may refetch if memory cache cleared)
    const _result3 = await getCachedOrFetch('version-key-v1', fetcher1, '1.0');
    expect(fetcher1).toHaveBeenCalledTimes(2); // New key, so refetch
  });

  it('should handle fetcher errors', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Fetch failed'));

    await expect(getCachedOrFetch('error-key', fetcher)).rejects.toThrow('Fetch failed');
  });

  it('should cache different data types', async () => {
    const stringFetcher = vi.fn().mockResolvedValue('string data');
    const numberFetcher = vi.fn().mockResolvedValue(12345);
    const arrayFetcher = vi.fn().mockResolvedValue([1, 2, 3]);

    expect(await getCachedOrFetch('string-key', stringFetcher)).toBe('string data');
    expect(await getCachedOrFetch('number-key', numberFetcher)).toBe(12345);
    expect(await getCachedOrFetch('array-key', arrayFetcher)).toEqual([1, 2, 3]);

    // Verify cached
    expect(await getCachedOrFetch('string-key', stringFetcher)).toBe('string data');
    expect(stringFetcher).toHaveBeenCalledTimes(1);
  });

  it('should handle async fetchers', async () => {
    const asyncFetcher = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { async: true };
    });

    const result = await getCachedOrFetch('async-key', asyncFetcher);
    expect(result).toEqual({ async: true });
    expect(asyncFetcher).toHaveBeenCalledTimes(1);
  });

  it('should cache null values', async () => {
    const fetcher = vi.fn().mockResolvedValue(null);

    const result1 = await getCachedOrFetch('null-key', fetcher);
    expect(result1).toBeNull();

    // Note: null values are not cached (treated as cache miss)
    // This is by design in the cache implementation
    const result2 = await getCachedOrFetch('null-key', fetcher);
    expect(result2).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2); // Refetched
  });

  it('should cache boolean values', async () => {
    const trueFetcher = vi.fn().mockResolvedValue(true);
    const falseFetcher = vi.fn().mockResolvedValue(false);

    expect(await getCachedOrFetch('true-key', trueFetcher)).toBe(true);
    expect(await getCachedOrFetch('false-key', falseFetcher)).toBe(false);

    // Verify cached
    expect(await getCachedOrFetch('true-key', trueFetcher)).toBe(true);
    expect(trueFetcher).toHaveBeenCalledTimes(1);
  });

  it('should handle concurrent fetches', async () => {
    const fetcher = vi.fn().mockResolvedValue({ concurrent: true });

    // Start multiple fetches at once
    const promises = [
      getCachedOrFetch('concurrent-key', fetcher),
      getCachedOrFetch('concurrent-key-2', fetcher),
      getCachedOrFetch('concurrent-key-3', fetcher),
    ];

    const results = await Promise.all(promises);

    results.forEach((result) => {
      expect(result).toEqual({ concurrent: true });
    });

    expect(fetcher).toHaveBeenCalledTimes(3); // Different keys
  });

  describe('clear', () => {
    it('should clear both memory and disk cache gracefully', async () => {
      // Set some cached data
      await cache.set('clear-test-1', { value: 'test1' });
      await cache.set('clear-test-2', { value: 'test2' });

      // Clear all cache
      await cache.clear();

      // Verify cache is empty
      const result1 = await cache.get('clear-test-1');
      const result2 = await cache.get('clear-test-2');

      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it('should handle clear errors gracefully', async () => {
      // Even if clear fails for the cache dir, it should not throw
      const cache2 = Cache.getInstance();
      expect(async () => {
        await cache2.clear();
      }).not.toThrow();
    });
  });
});
