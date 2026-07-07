# Release Notes — v0.25.4 (April 16, 2026)

## ⚡ Update Check Caching

### Summary

Patch release that eliminates the blocking `npm view rapidkit version` network call on every CLI invocation by caching the result to disk for 4 hours.

---

### What's New

#### Disk-cached update check

Previously, every `npx rapidkit <command>` call triggered an `await checkForUpdates()` which ran `npm view rapidkit version` with a 3-second timeout. On slow or offline networks this caused:
- Up to 3 seconds of blocking startup time on every invocation
- Silent failure if network was unavailable (still a 3s wait)

Now:

1. **First invocation** — fetches from npm registry as before, writes result to `~/.rapidkit/cache/update-check.json`
2. **Subsequent invocations (within 4 hours)** — reads from disk cache, zero network overhead
3. **After 4 hours** — cache expires, one network call is made to refresh

#### Cache invalidation

The cache is keyed by the currently installed CLI version (`currentVersion` field). If the user upgrades or downgrades the CLI, the cache is automatically invalidated and a fresh check is performed — so upgrade notifications are never missed after a version change.

#### Test isolation

The cache file path is aware of `VITEST_WORKER_ID`, writing to a per-worker subdirectory during tests. `beforeEach` in the update-checker test suite calls `__testables.clearUpdateCache()` to guarantee a clean state, preventing disk cache from leaking between test runs.

---

### Technical Changes

- `src/update-checker.ts`
  - `UPDATE_CACHE_FILE` constant replaced with `getUpdateCacheFile()` function (VITEST-aware path)
  - `readUpdateCache()` / `writeUpdateCache()` async helpers added
  - `clearUpdateCache()` added and exported via `__testables`
  - `checkForUpdates()` checks disk cache before making any network call

- `src/__tests__/update-checker.test.ts`
  - `beforeEach` is now `async` and calls `await __testables.clearUpdateCache()` for test isolation
