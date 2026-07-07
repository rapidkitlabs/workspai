import path from 'path';
import { describe, expect, it } from 'vitest';

import { resolveWorkspaceProjectPaths } from '../utils/workspace-project-paths';

describe('resolveWorkspaceProjectPaths', () => {
  it('uses in-workspace relative paths for imported projects', () => {
    const workspacePath = '/tmp/workspace';
    const projectPath = path.join(workspacePath, 'orders-api');

    expect(
      resolveWorkspaceProjectPaths({
        workspacePath,
        projectPath,
        projectName: 'orders-api',
      })
    ).toEqual({
      relativePath: 'orders-api',
      contractRelativePath: 'orders-api',
      isExternal: false,
    });
  });

  it('uses external contract aliases for adopted projects outside the workspace tree', () => {
    const workspacePath = '/tmp/workspace';
    const projectPath = '/tmp/external-next-app';

    expect(
      resolveWorkspaceProjectPaths({
        workspacePath,
        projectPath,
        projectName: 'portal-web',
      })
    ).toEqual({
      relativePath: '../external-next-app',
      contractRelativePath: 'external/portal-web',
      isExternal: true,
    });
  });
});
