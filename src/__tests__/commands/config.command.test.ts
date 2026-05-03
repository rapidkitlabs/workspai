import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const promptMock = vi.hoisted(() => vi.fn());
const setUserConfigMock = vi.hoisted(() => vi.fn());
const getUserConfigMock = vi.hoisted(() => vi.fn());

vi.mock('inquirer', () => ({
  default: {
    prompt: promptMock,
  },
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
    promptMock.mockResolvedValue({ apiKey: 'sk-interactive-1234567890' });

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

  it('remove-api-key removes key when user confirms', async () => {
    getUserConfigMock.mockReturnValue({ openaiApiKey: 'sk-old' });
    promptMock.mockResolvedValue({ confirm: true });

    const { registerConfigCommands } = await import('../../commands/config.js');
    const program = new Command();
    registerConfigCommands(program);

    await program.parseAsync(['node', 'rapidkit', 'config', 'remove-api-key']);

    expect(setUserConfigMock).toHaveBeenCalledWith({ openaiApiKey: undefined });
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

  it('ai command toggles enabled flag', async () => {
    const { registerConfigCommands } = await import('../../commands/config.js');
    const program = new Command();
    registerConfigCommands(program);

    await program.parseAsync(['node', 'rapidkit', 'config', 'ai', 'disable']);

    expect(setUserConfigMock).toHaveBeenCalledWith({ aiEnabled: false });
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
