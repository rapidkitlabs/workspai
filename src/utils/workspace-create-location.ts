import path from 'path';
import { homedir } from 'node:os';
import process from 'node:process';

import { prompt } from '../cli-ui/prompts.js';
import { isCliJsonLogFormat } from '../observability/cli-log-format.js';
import { getCanonicalWorkspacesDirectory, resolveNewWorkspacePath } from './workspace-paths.js';

export function readArgvFlagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index >= 0 && index + 1 < argv.length) {
    return argv[index + 1];
  }
  const equalsForm = argv.find((token) => token.startsWith(`${flag}=`));
  if (equalsForm) {
    return equalsForm.slice(flag.length + 1);
  }
  return undefined;
}

export function hasWorkspaceHereFlag(argv: readonly string[]): boolean {
  return argv.includes('--here');
}

export function resolveWorkspaceParentFromArgs(
  argv: readonly string[],
  workingDirectory: string = process.cwd()
): string | undefined {
  if (hasWorkspaceHereFlag(argv)) {
    return path.resolve(workingDirectory);
  }

  const outputDir = readArgvFlagValue(argv, '--output');
  if (outputDir) {
    return path.resolve(outputDir);
  }

  return undefined;
}

export function formatWorkspaceCdCommand(
  workspacePath: string,
  workingDirectory: string = process.cwd()
): string {
  const resolvedWorkspace = path.resolve(workspacePath);
  const resolvedCwd = path.resolve(workingDirectory);
  const relativePath = path.relative(resolvedCwd, resolvedWorkspace);

  if (relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
    return `cd ${relativePath}`;
  }

  return `cd ${resolvedWorkspace}`;
}

export function resolveWorkspaceTargetPath(
  workspaceName: string,
  options: {
    argv?: readonly string[];
    outputParent?: string;
    homeDir?: string;
  } = {}
): string {
  const argv = options.argv ?? [];
  const outputParent = options.outputParent ?? resolveWorkspaceParentFromArgs(argv, process.cwd());

  return resolveNewWorkspacePath(workspaceName.trim(), {
    homeDir: options.homeDir,
    outputDir: outputParent,
  });
}

export async function resolveWorkspaceOutputParent(
  argv: readonly string[],
  options: {
    hasYes?: boolean;
    cwd?: string;
    homeDir?: string;
    interactive?: boolean;
  } = {}
): Promise<string | undefined> {
  const workingDirectory = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? homedir();
  const fromArgs = resolveWorkspaceParentFromArgs(argv, workingDirectory);
  if (fromArgs !== undefined) {
    return fromArgs;
  }

  const hasYes = options.hasYes ?? (argv.includes('--yes') || argv.includes('-y'));
  const shouldPrompt =
    options.interactive ?? (!hasYes && !!process.stdin.isTTY && !isCliJsonLogFormat());

  if (!shouldPrompt) {
    return undefined;
  }

  const managedRoot = getCanonicalWorkspacesDirectory(homeDir);
  const { location } = (await prompt([
    {
      type: 'rawlist',
      name: 'location',
      message: 'Where should the workspace be created?',
      choices: [
        {
          value: 'managed',
          label: 'Managed home',
          hint: managedRoot,
        },
        {
          value: 'here',
          label: 'Current directory',
          hint: workingDirectory,
        },
      ],
      default: 0,
    },
  ])) as { location: 'managed' | 'here' };

  if (location === 'here') {
    return path.resolve(workingDirectory);
  }

  return undefined;
}
