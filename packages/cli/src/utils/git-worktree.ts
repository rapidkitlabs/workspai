import path from 'path';
import { execa } from 'execa';

export async function findContainingGitRoot(targetPath: string): Promise<string | null> {
  try {
    const result = await execa('git', ['rev-parse', '--show-toplevel'], {
      cwd: targetPath,
    });
    return result.stdout.trim() ? path.resolve(targetPath, result.stdout.trim()) : null;
  } catch {
    return null;
  }
}

export async function isInsideExistingGitWorktree(targetPath: string): Promise<boolean> {
  return (await findContainingGitRoot(targetPath)) !== null;
}
