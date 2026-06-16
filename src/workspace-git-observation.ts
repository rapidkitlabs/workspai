import { spawnSync } from 'child_process';

export type GitWorkingTreeObservation = {
  available: boolean;
  branch?: string;
  commit?: string;
  ref?: string;
  dirty: boolean;
  changedFiles: string[];
  untrackedFiles: string[];
  deletedFiles: string[];
};

function runGit(workspacePath: string, args: string[]): { ok: boolean; stdout: string } {
  const result = spawnSync('git', args, {
    cwd: workspacePath,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) {
    return { ok: false, stdout: '' };
  }
  return { ok: true, stdout: (result.stdout ?? '').trim() };
}

function parsePorcelainStatus(raw: string): {
  changedFiles: string[];
  untrackedFiles: string[];
  deletedFiles: string[];
} {
  const changedFiles: string[] = [];
  const untrackedFiles: string[] = [];
  const deletedFiles: string[] = [];

  for (const line of raw.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    const status = line.slice(0, 2);
    const filePath = line.slice(3).trim();
    if (!filePath) {
      continue;
    }
    if (status === '??') {
      untrackedFiles.push(filePath);
      continue;
    }
    if (status.includes('D')) {
      deletedFiles.push(filePath);
    }
    changedFiles.push(filePath);
  }

  return {
    changedFiles: [...new Set(changedFiles)].sort(),
    untrackedFiles: [...new Set(untrackedFiles)].sort(),
    deletedFiles: [...new Set(deletedFiles)].sort(),
  };
}

export function collectGitWorkingTreeObservation(
  workspacePath: string,
  options?: { ref?: string }
): GitWorkingTreeObservation {
  const empty: GitWorkingTreeObservation = {
    available: false,
    dirty: false,
    changedFiles: [],
    untrackedFiles: [],
    deletedFiles: [],
  };

  const inside = runGit(workspacePath, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || inside.stdout !== 'true') {
    return empty;
  }

  const branch = runGit(workspacePath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const commit = runGit(workspacePath, ['rev-parse', 'HEAD']);
  const status = runGit(workspacePath, ['status', '--porcelain=v1', '--untracked-files=all']);
  const parsed = parsePorcelainStatus(status.stdout);
  const dirty =
    parsed.changedFiles.length > 0 ||
    parsed.untrackedFiles.length > 0 ||
    parsed.deletedFiles.length > 0;

  return {
    available: true,
    branch: branch.ok ? branch.stdout : undefined,
    commit: commit.ok ? commit.stdout : undefined,
    ref: options?.ref,
    dirty,
    changedFiles: parsed.changedFiles,
    untrackedFiles: parsed.untrackedFiles,
    deletedFiles: parsed.deletedFiles,
  };
}
