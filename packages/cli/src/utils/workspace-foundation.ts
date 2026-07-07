import path from 'path';
import fsExtra from 'fs-extra';

import { syncWorkspaceFoundationFiles } from '../create.js';
import { readWorkspaceMarker } from '../workspace-marker.js';

export interface EnsureWorkspaceFoundationResult {
  workspacePath: string;
  created: string[];
  status: 'passed' | 'skipped';
}

export async function ensureWorkspaceFoundation(
  workspacePath: string,
  options?: {
    profile?: string;
    installMethod?: 'poetry' | 'venv' | 'pipx';
    force?: boolean;
  }
): Promise<EnsureWorkspaceFoundationResult> {
  const marker = await readWorkspaceMarker(workspacePath);
  const workspaceName = marker?.name || path.basename(workspacePath);

  let pythonVersion: string | undefined;
  const pythonVersionPath = path.join(workspacePath, '.python-version');
  if (await fsExtra.pathExists(pythonVersionPath)) {
    const raw = (await fsExtra.readFile(pythonVersionPath, 'utf-8')).trim();
    if (raw) {
      pythonVersion = raw;
    }
  }

  const profile = options?.profile || 'polyglot';
  const requiresPythonProfile =
    profile === 'python-only' || profile === 'polyglot' || profile === 'enterprise';
  const installMethod =
    options?.installMethod ||
    marker?.metadata?.npm?.installMethod ||
    (requiresPythonProfile ? 'poetry' : 'venv');

  const created = await syncWorkspaceFoundationFiles(workspacePath, {
    workspaceName,
    installMethod,
    pythonVersion,
    profile,
    writeMarker: true,
    writeGitignore: true,
    onlyIfMissing: !options?.force,
  });

  const { publishWorkspaceRegistrySummary } = await import('./workspace-registry-summary.js');
  await publishWorkspaceRegistrySummary(workspacePath);

  return {
    workspacePath,
    created,
    status: created.length > 0 ? 'passed' : 'skipped',
  };
}
