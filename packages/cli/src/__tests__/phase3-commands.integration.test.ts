import { describe, it, expect, afterEach, vi } from 'vitest';

describe('Phase 3 command handlers - integration (real adapters)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RAPIDKIT_ENABLE_RUNTIME_ADAPTERS;
  });

  it('runs setup node successfully when runtime adapters are enabled', async () => {
    process.env.RAPIDKIT_ENABLE_RUNTIME_ADAPTERS = '1';
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const index = await import('../index.js');
    const code = await index.handleSetupCommand(['setup', 'node']);

    expect(code).toBe(0);
  });

  it('runs setup node successfully when adapters are off', async () => {
    delete process.env.RAPIDKIT_ENABLE_RUNTIME_ADAPTERS;
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const index = await import('../index.js');
    const code = await index.handleSetupCommand(['setup', 'node']);

    expect(code).toBe(0);
  });

  it('keeps phase3 commands npm-local and not forwarded to core', async () => {
    const index = await import('../index.js');

    await expect(index.shouldForwardToCore(['bootstrap'])).resolves.toBe(false);
    await expect(index.shouldForwardToCore(['setup', 'node'])).resolves.toBe(false);
    await expect(index.shouldForwardToCore(['cache', 'status'])).resolves.toBe(false);
  });
});
