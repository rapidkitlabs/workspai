import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import type { ProjectCommandCapabilities } from '../utils/project-command-capabilities.js';
import {
  isWorkspaceStageSupported,
  resolveWorkspaceStageCapabilityCommand,
} from '../utils/workspace-stage-capabilities.js';

const temporaryDirectories: string[] = [];

function capabilities(
  status: 'supported' | 'unsupported',
  supportTier: 'certified' | 'observed' = 'certified'
): ProjectCommandCapabilities {
  return {
    schemaVersion: 'workspai-project-command-capabilities-v1',
    projectRoot: '/fixture',
    runtime: 'node',
    framework: 'nestjs',
    runtimeSupportTier: supportTier,
    frameworkSupportTier: supportTier,
    commands: [],
    commandMap: {
      test: {
        command: 'test',
        status,
        reason: status === 'unsupported' ? 'fixture reason' : undefined,
      },
    },
  } as unknown as ProjectCommandCapabilities;
}

describe('workspace stage capability contract', () => {
  afterAll(async () => {
    await Promise.all(
      temporaryDirectories.map((directory) =>
        fsPromises.rm(directory, { recursive: true, force: true })
      )
    );
  });

  it('maps every canonical fleet stage and rejects unknown stages', () => {
    expect(resolveWorkspaceStageCapabilityCommand('init')).toBe('init');
    expect(resolveWorkspaceStageCapabilityCommand('test')).toBe('test');
    expect(resolveWorkspaceStageCapabilityCommand('build')).toBe('build');
    expect(resolveWorkspaceStageCapabilityCommand('start')).toBe('start');
    expect(resolveWorkspaceStageCapabilityCommand('deploy')).toBeNull();
  });

  it('distinguishes certified and observed unsupported commands', () => {
    expect(isWorkspaceStageSupported('/fixture', 'test', capabilities('supported'))).toEqual({
      supported: true,
    });
    expect(isWorkspaceStageSupported('/fixture', 'test', capabilities('unsupported'))).toEqual({
      supported: false,
      reason: 'fixture reason',
      shouldFail: true,
    });
    expect(
      isWorkspaceStageSupported('/fixture', 'test', capabilities('unsupported', 'observed'))
    ).toEqual({ supported: false, reason: 'fixture reason', shouldFail: false });
  });

  it('reports missing metadata and supports string and object custom overrides', async () => {
    const projectRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'workspai-stage-'));
    temporaryDirectories.push(projectRoot);
    const noProject = capabilities('supported');
    noProject.projectRoot = null;
    expect(isWorkspaceStageSupported(projectRoot, 'test', noProject).reason).toContain(
      'No Workspai project metadata'
    );

    await fsPromises.mkdir(path.join(projectRoot, '.workspai'), { recursive: true });
    const metadataPath = path.join(projectRoot, '.workspai', 'context.json');
    const writeMetadata = (commands: unknown) =>
      fsPromises.writeFile(
        metadataPath,
        `${JSON.stringify({ schema_version: '1.0', runtime: 'node', commands })}\n`
      );

    await writeMetadata({ deploy: ' npm run deploy ' });
    expect(isWorkspaceStageSupported(projectRoot, 'deploy', capabilities('supported'))).toEqual({
      supported: true,
    });
    await writeMetadata({ deploy: { default: 'npm run deploy' } });
    expect(isWorkspaceStageSupported(projectRoot, 'deploy', capabilities('supported'))).toEqual({
      supported: true,
    });
    await writeMetadata({ deploy: { dev: 'npm run deploy:dev' } });
    expect(isWorkspaceStageSupported(projectRoot, 'deploy', capabilities('supported'))).toEqual({
      supported: true,
    });
    await writeMetadata({ deploy: [] });
    expect(isWorkspaceStageSupported(projectRoot, 'deploy', capabilities('supported'))).toEqual({
      supported: false,
      reason: 'Workspace stage "deploy" is not part of the Workspai fleet contract.',
    });
    expect(fs.existsSync(metadataPath)).toBe(true);
  });
});
