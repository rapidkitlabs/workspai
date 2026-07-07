import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const promptMock = vi.hoisted(() => vi.fn());
const oraStartMock = vi.hoisted(() => vi.fn());
const oraSucceedMock = vi.hoisted(() => vi.fn());
const oraFailMock = vi.hoisted(() => vi.fn());
const getModuleCatalogMock = vi.hoisted(() => vi.fn());
const generateEmbeddingsMock = vi.hoisted(() => vi.fn());
const isInitializedMock = vi.hoisted(() => vi.fn());
const isMockModeMock = vi.hoisted(() => vi.fn());

vi.mock('../../cli-ui/prompts.js', () => ({
  prompt: promptMock,
}));

vi.mock('../../cli-ui/spinner.js', () => ({
  createUiSpinner: () => ({
    start: oraStartMock.mockReturnThis(),
    succeed: oraSucceedMock,
    fail: oraFailMock,
    warn: vi.fn(),
    stop: vi.fn(),
    text: '',
  }),
}));

vi.mock('../../ai/module-catalog.js', () => ({
  getModuleCatalog: getModuleCatalogMock,
}));

vi.mock('../../ai/openai-client.js', () => ({
  generateEmbeddings: generateEmbeddingsMock,
  isInitialized: isInitializedMock,
  isMockMode: isMockModeMock,
}));

let originalCwd: string;
let tempDir: string;

function normalizeFsPath(value: unknown): string {
  return path.resolve(String(value)).replace(/^\/private(?=\/var\/)/, '');
}

describe('embeddings manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rk-emb-test-'));
    process.chdir(tempDir);

    isInitializedMock.mockReturnValue(true);
    isMockModeMock.mockReturnValue(false);
    getModuleCatalogMock.mockResolvedValue([
      {
        id: 'auth_core',
        name: 'Auth Core',
        description: 'Auth',
        longDescription: 'Authentication module',
        keywords: ['auth'],
        useCases: ['login'],
        framework: 'both',
        category: 'auth',
        dependencies: [],
      },
    ]);
    generateEmbeddingsMock.mockResolvedValue([[0.12, 0.34, 0.56]]);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns false when OpenAI is not initialized and mock mode is off', async () => {
    isInitializedMock.mockReturnValue(false);
    isMockModeMock.mockReturnValue(false);

    const { generateModuleEmbeddings } = await import('../../ai/embeddings-manager.js');
    const ok = await generateModuleEmbeddings(false);

    expect(ok).toBe(false);
  });

  it('generates embeddings and writes output file in non-interactive mode', async () => {
    const outPath = path.join(tempDir, 'data', 'modules-embeddings.json');
    const { generateModuleEmbeddings } = await import('../../ai/embeddings-manager.js');

    const ok = await generateModuleEmbeddings(false, outPath);

    expect(ok).toBe(true);
    expect(fs.existsSync(outPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(outPath, 'utf-8')) as {
      modules: Array<{ id: string; embedding: number[] }>;
    };
    expect(content.modules[0].id).toBe('auth_core');
    expect(content.modules[0].embedding.length).toBe(3);
    expect(oraSucceedMock).toHaveBeenCalled();
  });

  it('returns false when embedding API throws quota error', async () => {
    generateEmbeddingsMock.mockRejectedValue(new Error('429 quota exceeded'));
    const { generateModuleEmbeddings } = await import('../../ai/embeddings-manager.js');

    const ok = await generateModuleEmbeddings(false);

    expect(ok).toBe(false);
    expect(oraFailMock).toHaveBeenCalled();
  });

  it('ensureEmbeddings returns false in non-interactive mode when file is missing', async () => {
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const { ensureEmbeddings } = await import('../../ai/embeddings-manager.js');

    const ok = await ensureEmbeddings(false);

    expect(ok).toBe(false);
    existsSpy.mockRestore();
  });

  it('ensureEmbeddings supports manual guidance and generate actions', async () => {
    const realExists = fs.existsSync.bind(fs);
    const expectedPath = normalizeFsPath(path.join(tempDir, 'data', 'modules-embeddings.json'));
    const existsSpy = vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      const normalized = normalizeFsPath(p);
      if (normalized === expectedPath) {
        return realExists(p);
      }
      return false;
    });
    promptMock.mockResolvedValueOnce({ action: 'manual' });

    const { ensureEmbeddings } = await import('../../ai/embeddings-manager.js');
    const manual = await ensureEmbeddings(true);
    expect(manual).toBe(false);

    promptMock
      .mockResolvedValueOnce({ action: 'generate' })
      .mockResolvedValueOnce({ confirm: true });
    const generated = await ensureEmbeddings(true);
    expect(generated).toBe(true);
    existsSpy.mockRestore();
  });

  it('updateEmbeddings returns false when embeddings file does not exist', async () => {
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const { updateEmbeddings } = await import('../../ai/embeddings-manager.js');

    const ok = await updateEmbeddings();

    expect(ok).toBe(false);
    existsSpy.mockRestore();
  });

  it('checkEmbeddings reads a valid generated file', async () => {
    const outputPath = path.join(tempDir, 'data', 'modules-embeddings.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(
      outputPath,
      JSON.stringify({ generated_at: '2026-05-03T00:00:00.000Z', modules: [{ id: 'a' }] }),
      'utf-8'
    );

    const expectedPath = normalizeFsPath(outputPath);
    const existsSpy = vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      return normalizeFsPath(p) === expectedPath;
    });

    const { checkEmbeddings } = await import('../../ai/embeddings-manager.js');
    const info = checkEmbeddings();

    expect(info.exists).toBe(true);
    expect(info.path).toContain('modules-embeddings.json');
    expect(info.moduleCount).toBe(1);
    expect(info.generatedAt).toBe('2026-05-03T00:00:00.000Z');
    existsSpy.mockRestore();
  });
});
