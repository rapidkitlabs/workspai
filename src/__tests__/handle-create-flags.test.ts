import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as index from '../index.js';
import * as create from '../create.js';
import * as coreExec from '../core-bridge/pythonRapidkitExec.js';
import * as fsExtra from 'fs-extra';
import os from 'os';
import path from 'path';
import inquirer from 'inquirer';

describe('handleCreateOrFallback - wrapper flags handling', () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-test-'));
    process.chdir(tmpDir);
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    try {
      process.chdir('/');
      await fsExtra.remove(tmpDir);
    } catch (_e) {
      // ignore
    }
  });

  it('creates workspace when --create-workspace flag provided and filters flags forwarded to core', async () => {
    const registerSpy = vi.spyOn(create, 'registerWorkspaceAtPath').mockResolvedValue();
    const resolveSpy = vi.spyOn(coreExec, 'resolveRapidkitPython').mockResolvedValue();
    const runSpy = vi.spyOn(coreExec, 'runCoreRapidkit').mockResolvedValue(0 as any);

    const args = ['create', 'project', 'fastapi.standard', 'demo', '--create-workspace', '--yes'];
    const code = await index.handleCreateOrFallback(args);
    expect(registerSpy).toHaveBeenCalledWith(process.cwd(), expect.objectContaining({ yes: true }));
    expect(resolveSpy).toHaveBeenCalled();
    expect(runSpy).toHaveBeenCalled();

    const forwarded = runSpy.mock.calls[0][0] as string[];
    expect(forwarded).toContain('create');
    expect(forwarded).toContain('project');
    expect(forwarded).toContain('fastapi.standard');
    expect(forwarded).toContain('demo');
    expect(forwarded).not.toContain('--create-workspace');
    expect(forwarded).not.toContain('--yes');
    expect(code).toBe(0);
  });

  it('prompts interactively when no flags provided and respects user answer', async () => {
    const promptSpy = vi.spyOn(inquirer, 'prompt').mockResolvedValue({ createWs: false });
    const registerSpy = vi.spyOn(create, 'registerWorkspaceAtPath').mockResolvedValue();
    const resolveSpy = vi.spyOn(coreExec, 'resolveRapidkitPython').mockResolvedValue();
    const runSpy = vi.spyOn(coreExec, 'runCoreRapidkit').mockResolvedValue(0 as any);

    const args = ['create', 'project', 'fastapi.standard', 'demo'];
    const code = await index.handleCreateOrFallback(args);

    expect(promptSpy).toHaveBeenCalled();
    // create should NOT be called since user declined
    expect(registerSpy).not.toHaveBeenCalled();
    expect(resolveSpy).toHaveBeenCalled();
    expect(runSpy).toHaveBeenCalled();

    const forwarded = runSpy.mock.calls[0][0] as string[];
    expect(forwarded).toContain('create');
    expect(forwarded).toContain('project');
    expect(forwarded).toContain('fastapi.standard');
    expect(forwarded).toContain('demo');
    expect(code).toBe(0);
  });

  it('routes `create` without subcommand to workspace flow in non-interactive mode', async () => {
    const createWsSpy = vi.spyOn(create, 'createProject').mockResolvedValue(undefined as never);
    const runSpy = vi.spyOn(coreExec, 'runCoreRapidkit').mockResolvedValue(0 as any);

    const stdinIsTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      get: () => false,
    });

    try {
      const code = await index.handleCreateOrFallback(['create', '--yes']);
      expect(code).toBe(0);
      expect(createWsSpy).toHaveBeenCalled();
      expect(runSpy).not.toHaveBeenCalled();
    } finally {
      if (stdinIsTty) {
        Object.defineProperty(process.stdin, 'isTTY', stdinIsTty);
      }
    }
  });

  it('prompts for target on `create` and supports choosing project', async () => {
    vi.spyOn(inquirer, 'prompt')
      .mockResolvedValueOnce({ createTarget: 'project' })
      .mockResolvedValueOnce({ kitChoice: 'fastapi.standard' })
      .mockResolvedValueOnce({ projectName: 'demo' });

    const resolveSpy = vi.spyOn(coreExec, 'resolveRapidkitPython').mockResolvedValue();
    const runSpy = vi.spyOn(coreExec, 'runCoreRapidkit').mockResolvedValue(0 as any);

    const stdinIsTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      get: () => true,
    });

    try {
      const code = await index.handleCreateOrFallback(['create', '--no-workspace']);
      expect(code).toBe(0);
      expect(resolveSpy).toHaveBeenCalled();
      expect(runSpy).toHaveBeenCalled();

      const forwarded = runSpy.mock.calls[0][0] as string[];
      expect(forwarded).toEqual(['create', 'project', 'fastapi.standard', 'demo']);
    } finally {
      if (stdinIsTty) {
        Object.defineProperty(process.stdin, 'isTTY', stdinIsTty);
      }
    }
  });

  it('rejects invalid project names for npm-level generators before filesystem writes', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const runSpy = vi.spyOn(coreExec, 'runCoreRapidkit').mockResolvedValue(0 as any);

    const springCode = await index.handleCreateOrFallback([
      'create',
      'project',
      'springboot.standard',
      'bad/name',
    ]);
    const goCode = await index.handleCreateOrFallback([
      'create',
      'project',
      'gofiber.standard',
      'bad/name',
    ]);

    expect(springCode).toBe(1);
    expect(goCode).toBe(1);
    expect(runSpy).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalled();
  });
});
