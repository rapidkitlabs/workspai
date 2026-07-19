import { describe, expect, it } from 'vitest';

import { normalizeWorkspaceEntry } from '../workspace.js';
import {
  assertSafeRemoteArchiveUrl,
  isPrivateAddress,
  isSafeArchiveEntryName,
  sanitizeWorkspaceArchiveName,
  shouldExcludeWorkspaceArchivePath,
} from '../utils/workspace-archive.js';

describe('archive network and registry trust boundaries', () => {
  it('classifies reserved IPv4, IPv6, mapped, multicast, and public addresses', () => {
    for (const address of [
      '0.0.0.0',
      '10.1.2.3',
      '127.0.0.1',
      '169.254.1.1',
      '172.16.0.1',
      '172.31.0.1',
      '192.168.1.1',
      '100.64.0.1',
      '100.127.0.1',
      '224.0.0.1',
      '::',
      '::1',
      'fc00::1',
      'fd00::1',
      'fe80::1',
      'feb0::1',
      'ff00::1',
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.1',
      '::ffff:192.168.1.1',
      'invalid',
    ]) {
      expect(isPrivateAddress(address)).toBe(true);
    }
    for (const address of [
      '8.8.8.8',
      '172.15.0.1',
      '172.32.0.1',
      '100.63.0.1',
      '100.128.0.1',
      '2001:4860:4860::8888',
    ]) {
      expect(isPrivateAddress(address)).toBe(false);
    }
  });

  it('rejects unsafe remote archive URL forms before network access', async () => {
    await expect(assertSafeRemoteArchiveUrl('file:///tmp/a.zip', false)).rejects.toThrow(
      'protocol'
    );
    await expect(assertSafeRemoteArchiveUrl('http://example.com/a.zip', false)).rejects.toThrow(
      'require HTTPS'
    );
    await expect(
      assertSafeRemoteArchiveUrl('https://u:p@example.com/a.zip', false)
    ).rejects.toThrow('credentials');
    await expect(assertSafeRemoteArchiveUrl('https://localhost/a.zip', false)).rejects.toThrow(
      'private'
    );
    await expect(assertSafeRemoteArchiveUrl('https://127.0.0.1/a.zip', false)).rejects.toThrow(
      'private'
    );
    await expect(
      assertSafeRemoteArchiveUrl('http://127.0.0.1/a.zip', true)
    ).resolves.toBeInstanceOf(URL);
  });

  it('covers archive name, entry, exclusion, and registry normalization boundaries', () => {
    expect(sanitizeWorkspaceArchiveName(' My Team.workspai-archive.zip ')).toBe('my-team');
    expect(sanitizeWorkspaceArchiveName('...')).toBe('imported-workspace');
    for (const unsafe of ['', '/x', '~/x', 'C:/x', '../x', './x', 'a/../b', 'a\0b'])
      expect(isSafeArchiveEntryName(unsafe)).toBe(false);
    expect(isSafeArchiveEntryName('projects/api/file.ts')).toBe(true);
    for (const excluded of [
      '.workspai/cache/x',
      '.rapidkit/reports/x',
      'node_modules/x',
      '.git/config',
      'npm-debug.log',
      'x.workspai-archive.zip',
      '.env',
      'id_rsa',
      'a.pyc',
      'a.log',
    ])
      expect(shouldExcludeWorkspaceArchivePath(excluded)).toBe(true);
    expect(shouldExcludeWorkspaceArchivePath('.env', { includeEnv: true })).toBe(false);
    expect(shouldExcludeWorkspaceArchivePath('.env.example')).toBe(false);
    expect(
      normalizeWorkspaceEntry({
        name: 'w',
        path: '/tmp/../tmp/w',
        projects: [
          { name: 'a', path: '/tmp/w/a' },
          { name: 'duplicate', path: '/tmp/w/a' },
          null as never,
        ],
      })
    ).toMatchObject({ name: 'w', projects: [{ name: 'a' }] });
  });
});
