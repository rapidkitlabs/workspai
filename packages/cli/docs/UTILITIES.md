# Utilities Documentation

Internal cache and performance helpers for the npm CLI codebase.

**End-user commands:** [doctor-command.md](./doctor-command.md) · [OPEN_SOURCE_USER_SCENARIOS.md](./OPEN_SOURCE_USER_SCENARIOS.md) · [../README.md](../README.md)

## Cache System

### Using Cache

```typescript
import { Cache, getCachedOrFetch } from './utils/cache.js';

// Simple usage
const data = await getCachedOrFetch('my-key', async () => {
  // Heavy operation
  return await fetchDataFromAPI();
});

// Advanced usage
const cache = Cache.getInstance();

// Save
await cache.set('user-data', userData, '1.0');

// Read
const cached = await cache.get('user-data', '1.0');

// Invalidate
await cache.invalidate('user-data');

// Clear all
await cache.clear();
```

### Cache Features
- **Memory cache** for fast access
- **Disk cache** for persistence
- **TTL**: fixed at 24 hours
- **Versioning**: Version support
- **Lazy cleanup**: Expired disk entries are removed when read

## Performance Monitoring

### Using Performance Monitor

```typescript
import { PerformanceMonitor, measure, measurePerformance } from './utils/performance.js';

// Method 1: Manual timing
const monitor = PerformanceMonitor.getInstance();
monitor.start('my-operation');
// ... operation
monitor.end('my-operation');

// Method 2: Helper function
await measure('my-async-operation', async () => {
  await doSomethingHeavy();
});

// Method 3: Decorator (for methods)
class MyService {
  @measurePerformance
  async heavyOperation() {
    // This method is automatically measured
  }
}

// Show summary
monitor.summary();

// Get metrics
const metrics = monitor.getMetrics();
console.log(metrics);
```

### Use Cases
- Measure operation timing
- Identify bottlenecks
- Optimize performance
- Debug performance issues

## Best Practices

### Cache
```typescript
// ✅ Good: Use version for invalidation
await cache.set('data', myData, '2.0');

// ✅ Good: Use getCachedOrFetch
const result = await getCachedOrFetch('expensive-op', fetchData);

// ❌ Bad: Forgetting version
await cache.set('data', myData); // default version '1.0'
```

### Performance
```typescript
// ✅ Good: Measure heavy operations
await measure('database-query', () => db.query());

// ✅ Good: Show summary in development
if (process.env.NODE_ENV === 'development') {
  monitor.summary();
}

// ❌ Bad: Measuring trivial operations
monitor.start('simple-addition');
const result = 1 + 1;
monitor.end('simple-addition'); // overhead exceeds benefit
```

## Integration Example

```typescript
import { getCachedOrFetch } from './utils/cache.js';
import { measure } from './utils/performance.js';
import { logger } from './logger.js';

async function fetchUserData(userId: string) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'https://api.example.com';
  return await getCachedOrFetch(
    `user-${userId}`,
    async () => {
      return await measure('fetch-user-from-api', async () => {
        logger.debug(`Fetching user ${userId} from API`);
        const response = await fetch(`${apiBaseUrl}/users/${userId}`);
        return await response.json();
      });
    },
    '1.0'
  );
}

// Usage
const user = await fetchUserData('123');
// First time: Fetches from API and caches
// Second time: Reads from cache (fast)
```

## Debugging

These utilities do not implement `DEBUG=rapidkit:*` namespace handling. Use the
CLI's supported `--debug` flag where available, or enable `logger.setDebug(true)`
in a focused maintainer harness.

## Testing

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Cache } from './utils/cache.js';

describe('Cache', () => {
  beforeEach(async () => {
    await Cache.getInstance().clear();
  });

  it('should cache and retrieve data', async () => {
    const cache = Cache.getInstance();
    await cache.set('test', { value: 42 });
    const result = await cache.get('test');
    expect(result).toEqual({ value: 42 });
  });

  it('should invalidate expired cache', async () => {
    // Test with mock Date.now()
  });
});
```

## Migration Guide

If you have existing code that you want to add caching to:

```typescript
// Before
async function loadTemplates() {
  const files = await fs.readdir(templateDir);
  return files.map(parseTemplate);
}

// After
async function loadTemplates() {
  return await getCachedOrFetch('templates', async () => {
    const files = await fs.readdir(templateDir);
    return files.map(parseTemplate);
  }, '1.0');
}
```

## Troubleshooting

### Cache not working
```bash
# Check cache location
ls -la "$HOME/.workspai/cache/"

# Clear cache manually
rm -rf "$HOME/.workspai/cache/"

# Check safe permissions (least privilege)
chmod 700 "$HOME/.workspai"
chmod 700 "$HOME/.workspai/cache"
```

### Incorrect performance metrics

Verify that each timer is started and ended exactly once. For focused memory
diagnostics, run `node --expose-gc --max-old-space-size=4096 dist/index.js`.
