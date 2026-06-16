import fs from 'fs';
import path from 'path';
import type { CommandResult, RuntimeAdapter } from './types.js';
import { hasMakefileTarget } from '../utils/lifecycle-makefile.js';

export type DotnetCommandRunner = (command: string, args: string[], cwd: string) => Promise<number>;

export class DotnetRuntimeAdapter implements RuntimeAdapter {
  readonly runtime = 'dotnet' as const;

  constructor(private readonly runCommand: DotnetCommandRunner) {}

  private async run(command: string, args: string[], cwd: string): Promise<CommandResult> {
    const exitCode = await this.runCommand(command, args, cwd);
    return { exitCode };
  }

  private async ensureDotnetInstalled(projectPath: string): Promise<CommandResult | null> {
    const probe = await this.run('dotnet', ['--version'], projectPath);
    if (probe.exitCode === 0) {
      return null;
    }

    return {
      exitCode: 1,
      message:
        '.NET SDK is not installed or not available on PATH. Install .NET 8+ from https://dotnet.microsoft.com/download and retry.',
    };
  }

  private findFilesBySuffix(projectPath: string, suffix: string, maxDepth = 3): string[] {
    const results: string[] = [];
    const queue: Array<{ dir: string; depth: number }> = [{ dir: projectPath, depth: 0 }];
    const ignored = new Set(['bin', 'obj', '.git', 'node_modules', '.rapidkit']);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || current.depth > maxDepth) continue;

      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(current.dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const nextPath = path.join(current.dir, entry.name);
        if (entry.isDirectory()) {
          if (!ignored.has(entry.name)) {
            queue.push({ dir: nextPath, depth: current.depth + 1 });
          }
          continue;
        }

        if (entry.name.toLowerCase().endsWith(suffix.toLowerCase())) {
          results.push(nextPath);
        }
      }
    }

    return results.sort();
  }

  private findProjectFile(projectPath: string): string | null {
    const candidates = this.findFilesBySuffix(projectPath, '.csproj');
    return (
      candidates.find((candidate) => !candidate.toLowerCase().includes('.tests.csproj')) ||
      candidates[0] ||
      null
    );
  }

  private findTestProjectFile(projectPath: string): string | null {
    const candidates = this.findFilesBySuffix(projectPath, '.csproj');
    return (
      candidates.find((candidate) => candidate.toLowerCase().includes('.tests.csproj')) || null
    );
  }

  async checkPrereqs(): Promise<CommandResult> {
    return this.run('dotnet', ['--version'], process.cwd());
  }

  async warmSetupCache(projectPath: string): Promise<CommandResult> {
    const prereq = await this.ensureDotnetInstalled(projectPath);
    if (prereq) return prereq;
    return this.run('dotnet', ['nuget', 'locals', 'all', '--list'], projectPath);
  }

  async initProject(projectPath: string): Promise<CommandResult> {
    const prereq = await this.ensureDotnetInstalled(projectPath);
    if (prereq) return prereq;
    const projectFile = this.findProjectFile(projectPath);
    const result = await this.run(
      'dotnet',
      projectFile ? ['restore', projectFile] : ['restore'],
      projectPath
    );
    if (result.exitCode === 0) {
      return result;
    }

    return {
      exitCode: result.exitCode,
      message:
        'dotnet restore failed. Check NuGet connectivity, package references, and .NET SDK workload availability, then retry.',
    };
  }

  async runDev(projectPath: string): Promise<CommandResult> {
    const prereq = await this.ensureDotnetInstalled(projectPath);
    if (prereq) return prereq;
    const projectFile = this.findProjectFile(projectPath);
    const args = projectFile ? ['watch', '--project', projectFile, 'run'] : ['watch', 'run'];
    return this.run('dotnet', args, projectPath);
  }

  async runTest(projectPath: string): Promise<CommandResult> {
    const prereq = await this.ensureDotnetInstalled(projectPath);
    if (prereq) return prereq;
    const target = this.findTestProjectFile(projectPath) || this.findProjectFile(projectPath);
    return this.run('dotnet', target ? ['test', target] : ['test'], projectPath);
  }

  async runBuild(projectPath: string): Promise<CommandResult> {
    const prereq = await this.ensureDotnetInstalled(projectPath);
    if (prereq) return prereq;
    const target = this.findProjectFile(projectPath);
    return this.run(
      'dotnet',
      target ? ['build', target, '-c', 'Release'] : ['build', '-c', 'Release'],
      projectPath
    );
  }

  async runStart(projectPath: string): Promise<CommandResult> {
    const prereq = await this.ensureDotnetInstalled(projectPath);
    if (prereq) return prereq;
    const projectFile = this.findProjectFile(projectPath);
    return this.run(
      'dotnet',
      projectFile ? ['run', '--project', projectFile] : ['run'],
      projectPath
    );
  }

  async runLint(projectPath: string): Promise<CommandResult> {
    if (hasMakefileTarget(projectPath, 'lint')) {
      return this.run('make', ['lint'], projectPath);
    }

    const propsPath = path.join(projectPath, 'Directory.Build.props');
    if (
      fs.existsSync(propsPath) &&
      fs.readFileSync(propsPath, 'utf-8').includes('EnforceCodeStyleInBuild')
    ) {
      const prereq = await this.ensureDotnetInstalled(projectPath);
      if (prereq) return prereq;
      const projectFile = this.findProjectFile(projectPath);
      return this.run(
        'dotnet',
        projectFile ? ['build', projectFile, '-warnaserror'] : ['build', '-warnaserror'],
        projectPath
      );
    }

    return {
      exitCode: 1,
      message:
        'No .NET lint tooling detected. Add a Makefile lint target or enable EnforceCodeStyleInBuild in Directory.Build.props.',
    };
  }

  async runFormat(projectPath: string): Promise<CommandResult> {
    if (hasMakefileTarget(projectPath, 'format')) {
      return this.run('make', ['format'], projectPath);
    }

    const prereq = await this.ensureDotnetInstalled(projectPath);
    if (prereq) return prereq;

    if (fs.existsSync(path.join(projectPath, '.editorconfig'))) {
      return this.run('dotnet', ['format', '--verify-no-changes'], projectPath);
    }

    return {
      exitCode: 1,
      message:
        'No .NET format tooling detected. Add a Makefile format target or an .editorconfig file for dotnet format.',
    };
  }

  async doctorHints(_projectPath: string): Promise<string[]> {
    return [
      'Install .NET 8+ SDK and ensure dotnet is on PATH.',
      'Run dotnet restore after changing package references.',
      'Use dotnet format --verify-no-changes in CI for deterministic code style.',
    ];
  }
}
