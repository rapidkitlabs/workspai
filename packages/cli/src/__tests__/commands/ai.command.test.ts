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
const resolveProjectCommandCapabilitiesMock = vi.hoisted(() => vi.fn());
const initOpenAIMock = vi.hoisted(() => vi.fn());
const enableMockModeMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../cli-ui/prompts.js', () => ({
  prompt: promptMock,
}));

vi.mock('../../config/user-config.js', () => ({
  isAIEnabled: isAIEnabledMock,
  getOpenAIKey: getOpenAIKeyMock,
}));

vi.mock('../../ai/openai-client.js', () => ({
  initOpenAI: initOpenAIMock,
  enableMockMode: enableMockModeMock,
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

vi.mock('../../utils/project-command-capabilities.js', () => ({
  resolveProjectCommandCapabilities: resolveProjectCommandCapabilitiesMock,
}));

vi.mock('../../logger.js', () => ({ logger: { error: loggerErrorMock } }));

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
    resolveProjectCommandCapabilitiesMock.mockReturnValue({
      commandMap: {
        add: {
          command: 'add',
          owner: 'core',
          status: 'supported',
        },
      },
    });
    initOpenAIMock.mockResolvedValue(undefined);
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
    resolveProjectCommandCapabilitiesMock.mockReturnValue({
      commandMap: {
        add: {
          command: 'add',
          owner: 'none',
          status: 'unsupported',
          reason: 'Core module/template commands are not available for Spring Boot projects.',
        },
      },
    });

    const { registerAICommands } = await import('../../commands/ai.js');
    const program = new Command();
    registerAICommands(program);

    await program.parseAsync(['node', 'rapidkit', 'ai', 'recommend', 'need auth']);

    expect(runCoreRapidkitStreamedMock).not.toHaveBeenCalled();
  });

  it('blocks install for custom projects without RapidKit module-enabled metadata', async () => {
    promptMock
      .mockResolvedValueOnce({ shouldInstall: true })
      .mockResolvedValueOnce({ selectedModules: ['auth_core'] });
    resolveProjectCommandCapabilitiesMock.mockReturnValue({
      commandMap: {
        add: {
          command: 'add',
          owner: 'none',
          status: 'unsupported',
          reason:
            'Core module/template commands are not available for FastAPI projects without RapidKit kit metadata.',
        },
      },
    });

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

  it('uses mock mode without an API key and prompts for a missing query', async () => {
    getOpenAIKeyMock.mockReturnValue(undefined);
    promptMock
      .mockImplementationOnce(
        async (questions: Array<{ validate?: (value: string) => unknown }>) => {
          expect(questions[0]?.validate?.('')).toBe('Please enter a description');
          expect(questions[0]?.validate?.('ab')).toBe(
            'Please be more specific (at least 3 characters)'
          );
          expect(questions[0]?.validate?.('valid')).toBe(true);
          return { query: 'need authentication' };
        }
      )
      .mockResolvedValueOnce({ shouldInstall: false });

    const { registerAICommands } = await import('../../commands/ai.js');
    const program = new Command();
    registerAICommands(program);
    await program.parseAsync(['node', 'rapidkit', 'ai', 'recommend']);

    expect(enableMockModeMock).toHaveBeenCalledOnce();
    expect(initOpenAIMock).not.toHaveBeenCalled();
    expect(ensureEmbeddingsMock).not.toHaveBeenCalled();
  });

  it('handles empty and low-confidence recommendation sets', async () => {
    const { registerAICommands } = await import('../../commands/ai.js');
    recommendModulesMock.mockResolvedValueOnce([]);
    const emptyProgram = new Command();
    registerAICommands(emptyProgram);
    await emptyProgram.parseAsync(['node', 'rapidkit', 'ai', 'recommend', 'unknown']);
    expect(promptMock).not.toHaveBeenCalled();

    recommendModulesMock.mockResolvedValueOnce([
      {
        module: {
          id: 'weak',
          name: 'Weak',
          category: 'other',
          description: 'Weak match',
          longDescription: '',
          keywords: [],
          framework: 'both',
          dependencies: ['base'],
          useCases: [],
        },
        score: 0.2,
        reason: 'weak',
      },
    ]);
    promptMock.mockResolvedValueOnce({ shouldInstall: false });
    const weakProgram = new Command();
    registerAICommands(weakProgram);
    await weakProgram.parseAsync(['node', 'rapidkit', 'ai', 'recommend', 'weak']);
    expect(promptMock).toHaveBeenCalled();
  });

  it('reports failed module installation and missing add capability', async () => {
    promptMock
      .mockResolvedValueOnce({ shouldInstall: true })
      .mockResolvedValueOnce({ selectedModules: ['auth_core'] });
    runCoreRapidkitStreamedMock.mockResolvedValueOnce(7);
    const { registerAICommands } = await import('../../commands/ai.js');
    const failedProgram = new Command();
    registerAICommands(failedProgram);
    await failedProgram.parseAsync(['node', 'rapidkit', 'ai', 'recommend', 'auth']);
    expect(runCoreRapidkitStreamedMock).toHaveBeenCalled();

    promptMock
      .mockResolvedValueOnce({ shouldInstall: true })
      .mockResolvedValueOnce({ selectedModules: ['auth_core'] });
    resolveProjectCommandCapabilitiesMock.mockReturnValueOnce({ commandMap: {} });
    const unsupportedProgram = new Command();
    registerAICommands(unsupportedProgram);
    await unsupportedProgram.parseAsync(['node', 'rapidkit', 'ai', 'recommend', 'auth']);
    expect(runCoreRapidkitStreamedMock).toHaveBeenCalledTimes(1);
  });

  it('returns structured JSON failures for disabled AI and missing embeddings', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const { registerAICommands } = await import('../../commands/ai.js');
    isAIEnabledMock.mockReturnValueOnce(false);
    const disabledProgram = new Command();
    registerAICommands(disabledProgram);
    await disabledProgram.parseAsync(['node', 'rapidkit', 'ai', 'recommend', 'auth', '--json']);

    ensureEmbeddingsMock.mockResolvedValueOnce(false);
    const missingProgram = new Command();
    registerAICommands(missingProgram);
    await missingProgram.parseAsync(['node', 'rapidkit', 'ai', 'recommend', 'auth', '--json']);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('prints info for enabled/configured and disabled/unconfigured states', async () => {
    const { registerAICommands } = await import('../../commands/ai.js');
    const configured = new Command();
    registerAICommands(configured);
    await configured.parseAsync(['node', 'rapidkit', 'ai', 'info']);

    getOpenAIKeyMock.mockReturnValueOnce(undefined);
    isAIEnabledMock.mockReturnValueOnce(false);
    const unconfigured = new Command();
    registerAICommands(unconfigured);
    await unconfigured.parseAsync(['node', 'rapidkit', 'ai', 'info']);
  });

  it('covers generate and update failure outcomes and normalized errors', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const { registerAICommands } = await import('../../commands/ai.js');

    generateModuleEmbeddingsMock.mockResolvedValueOnce(false);
    const generateFalse = new Command();
    registerAICommands(generateFalse);
    await generateFalse.parseAsync(['node', 'rapidkit', 'ai', 'generate-embeddings']);

    generateModuleEmbeddingsMock.mockRejectedValueOnce({ message: 42, code: 9 });
    const generateError = new Command();
    registerAICommands(generateError);
    await generateError.parseAsync(['node', 'rapidkit', 'ai', 'generate-embeddings']);

    getOpenAIKeyMock.mockReturnValueOnce(undefined);
    const updateMissingKey = new Command();
    registerAICommands(updateMissingKey);
    await updateMissingKey.parseAsync(['node', 'rapidkit', 'ai', 'update-embeddings']);

    updateEmbeddingsMock.mockResolvedValueOnce(false);
    const updateFalse = new Command();
    registerAICommands(updateFalse);
    await updateFalse.parseAsync(['node', 'rapidkit', 'ai', 'update-embeddings']);

    updateEmbeddingsMock.mockRejectedValueOnce('update failed');
    const updateError = new Command();
    registerAICommands(updateError);
    await updateError.parseAsync(['node', 'rapidkit', 'ai', 'update-embeddings']);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(loggerErrorMock).toHaveBeenCalled();
  });

  it('provides remediation for invalid keys and missing embedding files', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const { registerAICommands } = await import('../../commands/ai.js');
    recommendModulesMock.mockRejectedValueOnce({ message: 'bad key', code: 'invalid_api_key' });
    const invalidKey = new Command();
    registerAICommands(invalidKey);
    await invalidKey.parseAsync(['node', 'rapidkit', 'ai', 'recommend', 'auth']);

    recommendModulesMock.mockRejectedValueOnce(new Error('embeddings file not found'));
    const missingFile = new Command();
    registerAICommands(missingFile);
    await missingFile.parseAsync(['node', 'rapidkit', 'ai', 'recommend', 'auth']);
    expect(exitSpy).toHaveBeenCalledTimes(2);
  });
});
