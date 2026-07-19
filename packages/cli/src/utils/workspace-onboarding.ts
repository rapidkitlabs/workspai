import path from 'path';

import chalk from 'chalk';

export interface FinalizeWorkspaceOnboardingOptions {
  workspaceName?: string;
  silent?: boolean;
}

/**
 * Connect a newly created workspace to the intelligence layer:
 * global discovery registry, workspace contract, and registry summary.
 */
export async function finalizeWorkspaceOnboarding(
  workspacePath: string,
  options: FinalizeWorkspaceOnboardingOptions = {}
): Promise<void> {
  const resolvedPath = path.resolve(workspacePath);
  const workspaceName = options.workspaceName ?? path.basename(resolvedPath);

  const { registerWorkspaceStrict } = await import('../workspace.js');
  await registerWorkspaceStrict(resolvedPath, workspaceName);

  const { syncWorkspaceContract } = await import('./workspace-contract.js');
  const result = await syncWorkspaceContract({ workspacePath: resolvedPath, strict: true });

  if (!options.silent) {
    console.log(
      chalk.gray(
        `ℹ️  Workspace intelligence synced (contract + registry summary, ${result.contract.projects.length} project(s)).`
      )
    );
  }
}
