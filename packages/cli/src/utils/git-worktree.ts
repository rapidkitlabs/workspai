import path from 'path';
import { execa } from 'execa';

const GIT_LOCAL_ENV_VARS = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_CONFIG',
  'GIT_CONFIG_COUNT',
  'GIT_DIR',
  'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE',
  'GIT_NAMESPACE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PREFIX',
  'GIT_QUARANTINE_PATH',
  'GIT_REPLACE_REF_BASE',
  'GIT_SHALLOW_FILE',
  'GIT_WORK_TREE',
];

export function buildCleanGitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const cleanEnv = { ...env };
  for (const key of GIT_LOCAL_ENV_VARS) {
    delete cleanEnv[key];
  }
  for (const key of Object.keys(cleanEnv)) {
    if (key.startsWith('GIT_CONFIG_KEY_') || key.startsWith('GIT_CONFIG_VALUE_')) {
      delete cleanEnv[key];
    }
  }
  return cleanEnv;
}

export async function findContainingGitRoot(targetPath: string): Promise<string | null> {
  try {
    const result = await execa('git', ['rev-parse', '--show-toplevel'], {
      cwd: targetPath,
      env: buildCleanGitEnv(),
    });
    return result.stdout.trim() ? path.resolve(targetPath, result.stdout.trim()) : null;
  } catch {
    return null;
  }
}

export async function isInsideExistingGitWorktree(targetPath: string): Promise<boolean> {
  return (await findContainingGitRoot(targetPath)) !== null;
}
