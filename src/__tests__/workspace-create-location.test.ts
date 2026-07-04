import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  formatWorkspaceCdCommand,
  resolveWorkspaceOutputParent,
  resolveWorkspaceParentFromArgs,
  resolveWorkspaceTargetPath,
  shouldBlockExistingWorkspaceName,
} from '../utils/workspace-create-location.js';
import { getCanonicalWorkspacesDirectory } from '../utils/workspace-paths.js';

describe('workspace-create-location', () => {
  it('resolves --here to the current working directory', () => {
    expect(resolveWorkspaceParentFromArgs(['create', 'workspace', '--here'], '/tmp/tests')).toBe(
      path.resolve('/tmp/tests')
    );
  });

  it('resolves --output to an explicit parent directory', () => {
    expect(
      resolveWorkspaceParentFromArgs(
        ['create', 'workspace', 'my-ws', '--output', '/tmp/custom'],
        '/tmp/tests'
      )
    ).toBe(path.resolve('/tmp/custom'));
  });

  it('builds managed and custom workspace target paths', () => {
    const homeDir = '/home/test-user';
    const expectedManaged = path.join(getCanonicalWorkspacesDirectory(homeDir), 'my-ws');
    expect(
      resolveWorkspaceTargetPath('my-ws', {
        argv: ['create', 'workspace', 'my-ws'],
        homeDir,
      })
    ).toBe(expectedManaged);

    const expectedCustom = path.resolve('/tmp/custom', 'my-ws');
    expect(
      resolveWorkspaceTargetPath('my-ws', {
        outputParent: '/tmp/custom',
      })
    ).toBe(expectedCustom);
  });

  it('formats cd commands with relative paths when possible', () => {
    const relativeCmd = formatWorkspaceCdCommand(
      path.join('/tmp/tests', 'my-workspace'),
      '/tmp/tests'
    );
    expect(relativeCmd).toBe('cd my-workspace');

    const absoluteCmd = formatWorkspaceCdCommand(
      path.join('/home/rapidx/rapidkit/workspaces', 'my-ws'),
      '/tmp/tests'
    );
    // On different platforms, paths are formatted differently, so just verify structure
    expect(absoluteCmd).toMatch(/^cd /);
    expect(absoluteCmd).toContain('my-ws');
  });

  it('defaults to managed home when --yes is set without location flags', async () => {
    const parent = await resolveWorkspaceOutputParent(['create', 'workspace', '--yes'], {
      interactive: false,
      homeDir: os.homedir(),
    });
    expect(parent).toBeUndefined();
  });

  it('does not block same-name workspaces in another parent when output parent is explicit', () => {
    expect(
      shouldBlockExistingWorkspaceName(
        '/home/test-user/rapidkit/workspaces/my-workspace',
        '/tmp/tests/my-workspace',
        { outputParent: '/tmp/tests' }
      )
    ).toBe(false);
  });

  it('keeps managed-home duplicate protection when output parent is implicit', () => {
    expect(
      shouldBlockExistingWorkspaceName(
        '/home/test-user/rapidkit/workspaces/my-workspace',
        '/home/test-user/rapidkit/workspaces/my-workspace-2'
      )
    ).toBe(true);
  });

  it('always blocks when the existing workspace path is the target path', () => {
    expect(
      shouldBlockExistingWorkspaceName('/tmp/tests/my-workspace', '/tmp/tests/my-workspace', {
        outputParent: '/tmp/tests',
      })
    ).toBe(true);
  });
});
