import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const promptMock = vi.hoisted(() => vi.fn());
const runCoreRapidkitStreamedMock = vi.hoisted(() => vi.fn());
const recommendModulesMock = vi.hoisted(() => vi.fn());
const ensureEmbeddingsMock = vi.hoisted(() => vi.fn());
const isAIEnabledMock = vi.hoisted(() => vi.fn());
const getOpenAIKeyMock = vi.hoisted(() => vi.fn());
const generateModuleEmbeddingsMock = vi.hoisted(() => vi.fn());
const updateEmbeddingsMock = vi.hoisted(() => vi.fn());
const readRapidkitProjectJsonMock = vi.hoisted(() => vi.fn());

vi.mock('inquirer', () => ({
  default: {
    prompt: promptMock,
  },
}));

vi.mock('../../config/user-config.js', () => ({
  isAIEnabled: isAIEnabledMock,
  getOpenAIKey: getOpenAIKeyMock,
}));

vi.mock('../../ai/openai-client.js', () => ({
  initOpenAI: vi.fn(async () => {}),
  enableMockMode: vi.fn(),
}));

vi.mock('../../ai/recommender.js', () => ({
  recommendModules: recommendModulesMock,
}));

vi.mock('../../ai/embeddings-manager.js', () => ({
  ensureEmbeddings: ensureEmbeddingsMock,
  generateModuleEmbeddings: generateModuleEmbeddingsMock,
  updateEmbeddings: updateEmbeddingsMock,
}));

vi.mock('../../core-bridge/pythonRapidkitExec.js', () => ({
  runCoreRapidkitStreamed: runCoreRapidkitStreamedMock,
}));

vi.mock('../../utils/runtime-detection.js', () => ({
  readRapidkitProjectJson: readRapidkitProjectJsonMock,
}));

describe('AI command install flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAIEnabledMock.mockReturnValue(true);
    getOpenAIKeyMock.mockReturnValue('sk-test-key');
    ensureEmbeddingsMock.mockResolvedValue(true);
    recommendModulesMock.mockResolvedValue([
      {
        module: {
          id: 'auth_core',
          name: 'Authentication Core',
          category: 'auth',
          description: 'Auth module',
          longDescription: 'Auth module',
          keywords: ['auth'],
          framework: 'both',
          dependencies: [],
          useCases: [],
        },
        score: 0.92,
        reason: 'auth',
      },
    ]);
    runCoreRapidkitStreamedMock.mockResolvedValue(0);
    generateModuleEmbeddingsMock.mockResolvedValue(true);
    updateEmbeddingsMock.mockResolvedValue(true);
    readRapidkitProjectJsonMock.mockReturnValue({ runtime: 'python', module_support: true });
    promptMock.mockResolvedValue({ shouldInstall: false });
  });

  it('runs module installation when user confirms install', async () => {
    promptMock
      .mockResolvedValueOnce({ shouldInstall: true })
      .mockResolvedValueOnce({ selectedModules: ['auth_core'] });

    const { registerAICommands } = await import('../../commands/ai.js');
    const program = new Command();
    registerAICommands(program);

    await program.parseAsync(['node', 'rapidkit', 'ai', 'recommend', 'need auth']);

    expect(runCoreRapidkitStreamedMock).toHaveBeenCalledWith(['add', 'module', 'auth_core'], {
      cwd: process.cwd(),
    });
  });

  it('does not install when user selects no modules', async () => {
    promptMock
      .mockResolvedValueOnce({ shouldInstall: true })
      .mockResolvedValueOnce({ selectedModules: [] });

    const { registerAICommands } = await import('../../commands/ai.js');
    const program = new Command();
    registerAICommands(program);

    await program.parseAsync(['node', 'rapidkit', 'ai', 'recommend', 'need auth']);

    expect(runCoreRapidkitStreamedMock).not.toHaveBeenCalled();
  });

  it('blocks install for npm-level kits without module support', async () => {
    promptMock
      .mockResolvedValueOnce({ shouldInstall: true })
      .mockResolvedValueOnce({ selectedModules: ['auth_core'] });
    readRapidkitProjectJsonMock.mockReturnValue({ runtime: 'java', module_support: false });

    const { registerAICommands } = await import('../../commands/ai.js');
    const program = new Command();
    registerAICommands(program);

    await program.parseAsync(['node', 'rapidkit', 'ai', 'recommend', 'need auth']);

    expect(runCoreRapidkitStreamedMock).not.toHaveBeenCalled();
  });

  it('returns json output for recommend --json', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { registerAICommands } = await import('../../commands/ai.js');
    const program = new Command();
    registerAICommands(program);

    await program.parseAsync(['node', 'rapidkit', 'ai', 'recommend', 'need auth', '--json']);

    expect(logSpy).toHaveBeenCalled();
    expect(promptMock).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('exits when AI features are disabled', async () => {
    isAIEnabledMock.mockReturnValue(false);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process-exit');
    }) as never);

    const { registerAICommands } = await import('../../commands/ai.js');
    const program = new Command();
    registerAICommands(program);

    await expect(
      program.parseAsync(['node', 'rapidkit', 'ai', 'recommend', 'need auth'])
    ).rejects.toThrow('process-exit');

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('exits when generate-embeddings is invoked without API key', async () => {
    getOpenAIKeyMock.mockReturnValue(undefined);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process-exit');
    }) as never);

    const { registerAICommands } = await import('../../commands/ai.js');
    const program = new Command();
    registerAICommands(program);

    await expect(
      program.parseAsync(['node', 'rapidkit', 'ai', 'generate-embeddings'])
    ).rejects.toThrow('process-exit');

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('update-embeddings exits with 0 on success', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process-exit-0');
    }) as never);

    const { registerAICommands } = await import('../../commands/ai.js');
    const program = new Command();
    registerAICommands(program);

    await expect(
      program.parseAsync(['node', 'rapidkit', 'ai', 'update-embeddings'])
    ).rejects.toThrow('process-exit-0');

    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });
});
