import type { CommandResult, RuntimeAdapter } from './types.js';
import fs from 'fs';
import path from 'path';
import { workspaceMetadataCandidates } from '../utils/workspace-paths.js';

export type PythonCoreRunner = (args: string[], cwd: string) => Promise<number>;

export class PythonRuntimeAdapter implements RuntimeAdapter {
  readonly runtime = 'python' as const;

  constructor(private readonly runCore: PythonCoreRunner) {}

  private async run(args: string[], projectPath: string): Promise<CommandResult> {
    const exitCode = await this.withPythonCacheEnv(projectPath, () =>
      this.runCore(args, projectPath)
    );
    return { exitCode };
  }

  private findWorkspaceRoot(startPath: string): string | null {
    let current = startPath;
    while (true) {
      if (
        fs.existsSync(path.join(current, '.workspai-workspace')) ||
        fs.existsSync(path.join(current, '.rapidkit-workspace'))
      )
        return current;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return null;
  }

  private resolveDependencyMode(
    projectPath: string
  ): 'isolated' | 'shared-runtime-caches' | 'shared-node-deps' {
    const raw = process.env.RAPIDKIT_DEP_SHARING_MODE?.toLowerCase();
    if (raw === 'shared-runtime-caches' || raw === 'shared-node-deps' || raw === 'isolated') {
      return raw;
    }

    const workspace = this.findWorkspaceRoot(projectPath);
    if (!workspace) return 'isolated';

    const policyPath = workspaceMetadataCandidates(workspace, 'policies.yml').find((candidate) =>
      fs.existsSync(candidate)
    );
    if (!policyPath) return 'isolated';

    try {
      const policyRaw = fs.readFileSync(policyPath, 'utf-8');
      const match = policyRaw.match(/^\s*dependency_sharing_mode:\s*([a-zA-Z\-]+)\s*(?:#.*)?$/m);
      const value = match?.[1]?.toLowerCase();
      if (
        value === 'shared-runtime-caches' ||
        value === 'shared-node-deps' ||
        value === 'isolated'
      ) {
        return value;
      }
    } catch {
      // Fallback to isolated.
    }

    return 'isolated';
  }

  private withPythonCacheEnv<T>(projectPath: string, fn: () => Promise<T>): Promise<T> {
    const mode = this.resolveDependencyMode(projectPath);
    const workspace = process.env.RAPIDKIT_WORKSPACE_PATH || this.findWorkspaceRoot(projectPath);

    const cacheBase =
      mode === 'shared-runtime-caches'
        ? path.join(workspace || projectPath, '.workspai', 'cache', 'python')
        : path.join(projectPath, '.workspai', 'cache', 'python');

    const originalPipCache = process.env.PIP_CACHE_DIR;
    const originalPoetryCache = process.env.POETRY_CACHE_DIR;

    process.env.PIP_CACHE_DIR = path.join(cacheBase, 'pip');
    process.env.POETRY_CACHE_DIR = path.join(cacheBase, 'poetry');

    return fn().finally(() => {
      if (typeof originalPipCache === 'undefined') delete process.env.PIP_CACHE_DIR;
      else process.env.PIP_CACHE_DIR = originalPipCache;

      if (typeof originalPoetryCache === 'undefined') delete process.env.POETRY_CACHE_DIR;
      else process.env.POETRY_CACHE_DIR = originalPoetryCache;
    });
  }

  async checkPrereqs(): Promise<CommandResult> {
    const cwd = process.cwd();
    const modern = await this.run(['doctor', 'check'], cwd);
    if (modern.exitCode === 0) return modern;
    return this.run(['doctor'], cwd);
  }

  async initProject(projectPath: string): Promise<CommandResult> {
    return this.run(['init'], projectPath);
  }

  async runDev(projectPath: string): Promise<CommandResult> {
    return this.run(['dev'], projectPath);
  }

  async runTest(projectPath: string): Promise<CommandResult> {
    return this.run(['test'], projectPath);
  }

  async runBuild(projectPath: string): Promise<CommandResult> {
    return this.run(['build'], projectPath);
  }

  async runStart(projectPath: string): Promise<CommandResult> {
    return this.run(['start'], projectPath);
  }

  async doctorHints(_projectPath: string): Promise<string[]> {
    return [
      'Run "npx workspai doctor workspace" for a full workspace scan.',
      'Use "npx workspai init" after adding or changing modules.',
      'Use `npx workspai <command>` from the project root to avoid environment drift.',
    ];
  }
}
