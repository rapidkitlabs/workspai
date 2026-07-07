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

  try {
    const { registerWorkspace } = await import('../workspace.js');
    await registerWorkspace(resolvedPath, workspaceName);
  } catch (error) {
    if (!options.silent) {
      console.warn(
        chalk.gray(
          `Note: Could not register workspace in shared registry: ${(error as Error)?.message ?? error}`
        )
      );
    }
  }

  try {
    const { syncWorkspaceContract } = await import('./workspace-contract.js');
    const result = await syncWorkspaceContract({ workspacePath: resolvedPath });

    if (!options.silent) {
      console.log(
        chalk.gray(
          `ℹ️  Workspace intelligence synced (contract + registry summary, ${result.contract.projects.length} project(s)).`
        )
      );
    }

    if (!options.silent && result.verification.status !== 'passed') {
      console.log(chalk.yellow('⚠️  Workspace contract verification reported issues.'));
      for (const violation of result.verification.violations) {
        console.log(chalk.gray(`   Violation: ${violation}`));
      }
      console.log(chalk.white('   Next: npx workspai workspace contract inspect'));
    }
  } catch (error) {
    if (!options.silent) {
      console.warn(
        chalk.gray(
          `Note: Could not sync workspace intelligence layer: ${(error as Error)?.message ?? error}`
        )
      );
    }
  }
}
