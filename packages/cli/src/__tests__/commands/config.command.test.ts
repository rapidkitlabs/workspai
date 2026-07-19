import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const promptMock = vi.hoisted(() => vi.fn());
const setUserConfigMock = vi.hoisted(() => vi.fn());
const getUserConfigMock = vi.hoisted(() => vi.fn());

vi.mock('../../cli-ui/prompts.js', () => ({
  prompt: promptMock,
}));

vi.mock('../../config/user-config.js', () => ({
  setUserConfig: setUserConfigMock,
  getUserConfig: getUserConfigMock,
  getConfigPath: vi.fn(() => '/tmp/config.json'),
}));

describe('config command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserConfigMock.mockReturnValue({ aiEnabled: true });
  });

  it('set-api-key saves valid key from option', async () => {
    const { registerConfigCommands } = await import('../../commands/config.js');
    const program = new Command();
    registerConfigCommands(program);

    await program.parseAsync([
      'node',
      'rapidkit',
      'config',
      'set-api-key',
      '--key',
      'sk-valid-key-123',
    ]);

    expect(setUserConfigMock).toHaveBeenCalledWith({ openaiApiKey: 'sk-valid-key-123' });
  });

  it('set-api-key prompts and saves key when option is missing', async () => {
    promptMock.mockImplementation(
      async (questions: Array<{ validate?: (value: string) => unknown }>) => {
        expect(questions[0]?.validate?.('')).toBe('API key is required');
        expect(questions[0]?.validate?.('invalid')).toBe(
          'Invalid API key format (should start with sk-)'
        );
        expect(questions[0]?.validate?.('sk-short')).toBe('API key seems too short');
        expect(questions[0]?.validate?.('sk-interactive-1234567890')).toBe(true);
        return { apiKey: 'sk-interactive-1234567890' };
      }
    );

    const { registerConfigCommands } = await import('../../commands/config.js');
    const program = new Command();
    registerConfigCommands(program);

    await program.parseAsync(['node', 'rapidkit', 'config', 'set-api-key']);

    expect(promptMock).toHaveBeenCalled();
    expect(setUserConfigMock).toHaveBeenCalledWith({ openaiApiKey: 'sk-interactive-1234567890' });
  });

  it('set-api-key exits on invalid option key', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process-exit');
    }) as never);

    const { registerConfigCommands } = await import('../../commands/config.js');
    const program = new Command();
    registerConfigCommands(program);

    await expect(
      program.parseAsync(['node', 'rapidkit', 'config', 'set-api-key', '--key', 'invalid'])
    ).rejects.toThrow('process-exit');

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('show renders configured key and AI enabled state', async () => {
    getUserConfigMock.mockReturnValue({
      openaiApiKey: 'sk-abcdefghijklmnopqrstuvwxyz',
      aiEnabled: true,
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { registerConfigCommands } = await import('../../commands/config.js');
    const program = new Command();
    registerConfigCommands(program);

    await program.parseAsync(['node', 'rapidkit', 'config', 'show']);

    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('show renders missing key and disabled AI state', async () => {
    getUserConfigMock.mockReturnValue({ aiEnabled: false });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { registerConfigCommands } = await import('../../commands/config.js');
    const program = new Command();
    registerConfigCommands(program);
    await program.parseAsync(['node', 'rapidkit', 'config', 'show']);
    expect(logSpy.mock.calls.flat().join(' ')).toContain('Not set');
  });

  it('remove-api-key removes key non-interactively with --yes', async () => {
    getUserConfigMock.mockReturnValue({ openaiApiKey: 'sk-old' });

    const { registerConfigCommands } = await import('../../commands/config.js');
    const program = new Command();
    registerConfigCommands(program);

    await program.parseAsync(['node', 'rapidkit', 'config', 'remove-api-key', '--yes']);

    expect(setUserConfigMock).toHaveBeenCalledWith({ openaiApiKey: undefined });
    expect(promptMock).not.toHaveBeenCalled();
  });

  it('remove-api-key does nothing when key is missing', async () => {
    getUserConfigMock.mockReturnValue({});

    const { registerConfigCommands } = await import('../../commands/config.js');
    const program = new Command();
    registerConfigCommands(program);

    await program.parseAsync(['node', 'rapidkit', 'config', 'remove-api-key']);

    expect(promptMock).not.toHaveBeenCalled();
    expect(setUserConfigMock).not.toHaveBeenCalled();
  });

  it('supports interactive removal confirmation and cancellation', async () => {
    getUserConfigMock.mockReturnValue({ openaiApiKey: 'sk-old' });
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    const { registerConfigCommands } = await import('../../commands/config.js');

    promptMock.mockResolvedValueOnce({ confirm: false });
    const cancelProgram = new Command();
    registerConfigCommands(cancelProgram);
    await cancelProgram.parseAsync(['node', 'rapidkit', 'config', 'remove-api-key']);
    expect(setUserConfigMock).not.toHaveBeenCalled();

    promptMock.mockResolvedValueOnce({ confirm: true });
    const confirmProgram = new Command();
    registerConfigCommands(confirmProgram);
    await confirmProgram.parseAsync(['node', 'rapidkit', 'config', 'remove-api-key']);
    expect(setUserConfigMock).toHaveBeenCalledWith({ openaiApiKey: undefined });
    delete (process.stdin as { isTTY?: boolean }).isTTY;
    delete (process.stdout as { isTTY?: boolean }).isTTY;
  });

  it('blocks unconfirmed removal in a non-interactive session', async () => {
    getUserConfigMock.mockReturnValue({ openaiApiKey: 'sk-old' });
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process-exit');
    }) as never);
    const { registerConfigCommands } = await import('../../commands/config.js');
    const program = new Command();
    registerConfigCommands(program);
    await expect(
      program.parseAsync(['node', 'rapidkit', 'config', 'remove-api-key'])
    ).rejects.toThrow('process-exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    delete (process.stdin as { isTTY?: boolean }).isTTY;
  });

  it('ai command toggles enabled flag', async () => {
    const { registerConfigCommands } = await import('../../commands/config.js');
    const program = new Command();
    registerConfigCommands(program);

    await program.parseAsync(['node', 'rapidkit', 'config', 'ai', 'disable']);

    expect(setUserConfigMock).toHaveBeenCalledWith({ aiEnabled: false });

    const enableProgram = new Command();
    registerConfigCommands(enableProgram);
    await enableProgram.parseAsync(['node', 'rapidkit', 'config', 'ai', 'enable']);
    expect(setUserConfigMock).toHaveBeenCalledWith({ aiEnabled: true });
  });

  it('ai command exits on invalid action', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process-exit');
    }) as never);

    const { registerConfigCommands } = await import('../../commands/config.js');
    const program = new Command();
    registerConfigCommands(program);

    await expect(program.parseAsync(['node', 'rapidkit', 'config', 'ai', 'bad'])).rejects.toThrow(
      'process-exit'
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});
