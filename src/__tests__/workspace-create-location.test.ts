import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  formatWorkspaceCdCommand,
  resolveWorkspaceOutputParent,
  resolveWorkspaceParentFromArgs,
  resolveWorkspaceTargetPath,
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
    expect(
      resolveWorkspaceTargetPath('my-ws', {
        argv: ['create', 'workspace', 'my-ws'],
        homeDir,
      })
    ).toBe(path.join(getCanonicalWorkspacesDirectory(homeDir), 'my-ws'));

    expect(
      resolveWorkspaceTargetPath('my-ws', {
        outputParent: '/tmp/custom',
      })
    ).toBe(path.join('/tmp/custom', 'my-ws'));
  });

  it('formats cd commands with relative paths when possible', () => {
    expect(formatWorkspaceCdCommand('/tmp/tests/my-workspace', '/tmp/tests')).toBe(
      'cd my-workspace'
    );
    expect(formatWorkspaceCdCommand('/home/rapidx/rapidkit/workspaces/my-ws', '/tmp/tests')).toBe(
      'cd /home/rapidx/rapidkit/workspaces/my-ws'
    );
  });

  it('defaults to managed home when --yes is set without location flags', async () => {
    const parent = await resolveWorkspaceOutputParent(['create', 'workspace', '--yes'], {
      interactive: false,
      homeDir: os.homedir(),
    });
    expect(parent).toBeUndefined();
  });
});
