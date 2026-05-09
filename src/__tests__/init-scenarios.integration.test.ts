import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as fsExtra from 'fs-extra';
import * as create from '../create.js';

vi.mock('../workspace-marker.js', () => ({
  readWorkspaceMarker: vi.fn().mockResolvedValue({
    metadata: {
      npm: {
        installMethod: 'pip',
      },
    },
  }),
}));

describe('init scenarios integration (non-regression)', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    originalCwd = process.cwd();
    tempDir = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rapidkit-init-scenarios-'));
    delete process.env.RAPIDKIT_ENABLE_RUNTIME_ADAPTERS;
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    delete process.env.RAPIDKIT_ENABLE_RUNTIME_ADAPTERS;
    await fsExtra.remove(tempDir);
    vi.restoreAllMocks();
  });

  it('scenario 1: in normal folder creates workspace and initializes workspace deps path', async () => {
    process.chdir(tempDir);

    const createSpy = vi
      .spyOn(create, 'createProject')
      .mockResolvedValue(undefined as unknown as void);

    const index = await import('../index.js');
    const code = await index.handleInitCommand(['init']);

    expect(code).toBe(0);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith('my-workspace', expect.objectContaining({ yes: true }));
  });

  it('scenario 2: in workspace root runs mirrored full init for workspace and child projects', async () => {
    process.env.RAPIDKIT_ENABLE_RUNTIME_ADAPTERS = '1';

    const workspaceRoot = path.join(tempDir, 'ws-root');
    const projectDir = path.join(workspaceRoot, 'node-app');

    await fsExtra.ensureDir(path.join(projectDir, '.rapidkit'));
    fs.writeFileSync(path.join(workspaceRoot, '.rapidkit-workspace'), 'marker');
    fs.writeFileSync(
      path.join(projectDir, '.rapidkit', 'project.json'),
      JSON.stringify({ runtime: 'node', kit_name: 'nestjs.standard' }, null, 2)
    );
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify(
        {
          name: 'node-app',
          version: '1.0.0',
          private: true,
          dependencies: {
            lodash: '^4.17.21',
          },
        },
        null,
        2
      )
    );

    process.chdir(workspaceRoot);

    const index = await import('../index.js');
    const code = await index.handleInitCommand(['init']);
    const report = await fsExtra.readJSON(
      path.join(workspaceRoot, '.rapidkit', 'reports', 'workspace-run-last.json')
    );

    expect(code).toBe(0);
    expect(report.stage).toBe('init');
    expect(report.summary.selectedCount).toBe(1);
    expect(report.summary.passed).toBe(1);
    expect(report.projects[0]?.relativePath).toBe('node-app');
  });

  it('scenario 3: in project folder initializes only project deps', async () => {
    process.env.RAPIDKIT_ENABLE_RUNTIME_ADAPTERS = '1';

    const projectDir = path.join(tempDir, 'project-only');
    await fsExtra.ensureDir(path.join(projectDir, '.rapidkit'));
    fs.writeFileSync(
      path.join(projectDir, '.rapidkit', 'project.json'),
      JSON.stringify({ runtime: 'node', kit_name: 'nestjs.standard' }, null, 2)
    );
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ name: 'project-only', version: '1.0.0', private: true }, null, 2)
    );

    process.chdir(projectDir);

    const index = await import('../index.js');
    const code = await index.handleInitCommand(['init']);

    expect(code).toBe(0);
    expect(fs.existsSync(path.join(projectDir, 'package-lock.json'))).toBe(true);
  }, 15000);
});
