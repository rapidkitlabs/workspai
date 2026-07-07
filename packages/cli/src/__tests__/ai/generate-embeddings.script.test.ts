import fs from 'fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

type ExitCode = number | undefined;

const initOpenAIMock = vi.hoisted(() => vi.fn());
const generateEmbeddingsMock = vi.hoisted(() => vi.fn());
const getModuleCatalogMock = vi.hoisted(() => vi.fn());

vi.mock('../../ai/openai-client.js', () => ({
  initOpenAI: initOpenAIMock,
  generateEmbeddings: generateEmbeddingsMock,
}));

vi.mock('../../ai/module-catalog.js', () => ({
  getModuleCatalog: getModuleCatalogMock,
}));

vi.mock('ora', () => ({
  default: () => ({
    start: vi.fn().mockReturnValue({
      succeed: vi.fn(),
      fail: vi.fn(),
    }),
  }),
}));

describe('generate-embeddings script', () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    if (typeof originalApiKey === 'undefined') {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  function mockProcessExit(): ReturnType<typeof vi.spyOn> {
    return vi.spyOn(process, 'exit').mockImplementation((code?: ExitCode) => {
      throw new Error(`process-exit:${code ?? 0}`);
    }) as never;
  }

  function mockProcessExitNoThrow(): ReturnType<typeof vi.spyOn> {
    return vi.spyOn(process, 'exit').mockImplementation((_code?: ExitCode) => undefined as never);
  }

  async function importScriptAndFlush(): Promise<void> {
    await import('../../ai/generate-embeddings.ts');
    await Promise.resolve();
    await Promise.resolve();
  }

  it('exits with 1 when OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const exitSpy = mockProcessExit();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(import('../../ai/generate-embeddings.ts')).rejects.toThrow('process-exit:1');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
  });

  it('writes embeddings file and exits with 0 on success', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
    const exitSpy = mockProcessExitNoThrow();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const statSpy = vi.spyOn(fs, 'statSync').mockReturnValue({ size: 2048 } as fs.Stats);

    getModuleCatalogMock.mockResolvedValue([
      {
        id: 'auth_core',
        name: 'Auth Core',
        category: 'auth',
        description: 'Auth module',
        longDescription: 'Authentication module',
        keywords: ['auth'],
        framework: 'both',
        dependencies: [],
        useCases: ['login'],
      },
    ]);
    generateEmbeddingsMock.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await importScriptAndFlush();

    expect(initOpenAIMock).toHaveBeenCalledWith('sk-test-key');
    expect(getModuleCatalogMock).toHaveBeenCalled();
    expect(generateEmbeddingsMock).toHaveBeenCalledTimes(1);
    expect(existsSpy).toHaveBeenCalled();
    expect(mkdirSpy).toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalled();
    expect(statSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logSpy).toHaveBeenCalled();
  });

  it('exits with 1 and prints invalid_api_key hint on failure', async () => {
    process.env.OPENAI_API_KEY = 'sk-invalid';
    const exitSpy = mockProcessExitNoThrow();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 } as fs.Stats);

    getModuleCatalogMock.mockResolvedValue([
      {
        id: 'auth_core',
        name: 'Auth Core',
        category: 'auth',
        description: 'Auth module',
        longDescription: 'Authentication module',
        keywords: ['auth'],
        framework: 'both',
        dependencies: [],
        useCases: ['login'],
      },
    ]);

    const apiError = Object.assign(new Error('invalid key'), { code: 'invalid_api_key' });
    generateEmbeddingsMock.mockRejectedValue(apiError);

    await importScriptAndFlush();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
  });
});
