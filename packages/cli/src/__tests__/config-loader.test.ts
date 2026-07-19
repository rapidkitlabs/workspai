import { afterEach, describe, expect, it } from 'vitest';
import fsExtra from 'fs-extra';
import os from 'os';
import path from 'path';

import { loadRapidKitConfig, loadWorkspaiConfig } from '../config.js';

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fsExtra.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe('loadWorkspaiConfig', () => {
  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await fsExtra.remove(dir);
      }
    }
  });

  it('loads explicit CommonJS .cjs config files', async () => {
    const dir = await makeTempDir('workspai-config-cjs-');
    await fsExtra.writeFile(
      path.join(dir, 'workspai.config.cjs'),
      "module.exports = { workspace: { defaultAuthor: 'CJS Team' } };\n"
    );

    await expect(loadWorkspaiConfig(dir, { trustExecutableConfig: true })).resolves.toMatchObject({
      workspace: { defaultAuthor: 'CJS Team' },
    });
  });

  it('loads explicit ESM .mjs config files', async () => {
    const dir = await makeTempDir('workspai-config-mjs-');
    await fsExtra.writeFile(
      path.join(dir, 'workspai.config.mjs'),
      "export default { projects: { defaultKit: 'nestjs.standard' } };\n"
    );

    await expect(loadWorkspaiConfig(dir, { trustExecutableConfig: true })).resolves.toMatchObject({
      projects: { defaultKit: 'nestjs.standard' },
    });
  });

  it('keeps legacy rapidkit config as a fallback alias', async () => {
    const dir = await makeTempDir('workspai-config-legacy-');
    await fsExtra.writeFile(
      path.join(dir, 'rapidkit.config.cjs'),
      "module.exports = { workspace: { installMethod: 'venv' } };\n"
    );

    await expect(loadRapidKitConfig(dir, { trustExecutableConfig: true })).resolves.toMatchObject({
      workspace: { installMethod: 'venv' },
    });
  });

  it('fails loudly when an existing config file cannot be loaded', async () => {
    const dir = await makeTempDir('workspai-config-invalid-');
    await fsExtra.writeFile(path.join(dir, 'workspai.config.mjs'), 'export default {\n');

    await expect(loadWorkspaiConfig(dir, { trustExecutableConfig: true })).rejects.toThrow(
      /Failed to load Workspai config.*workspai\.config\.mjs/
    );
  });

  it('refuses executable config without explicit trust', async () => {
    const dir = await makeTempDir('workspai-config-untrusted-');
    await fsExtra.writeFile(path.join(dir, 'workspai.config.mjs'), 'export default {};\n');

    await expect(loadWorkspaiConfig(dir)).rejects.toThrow(/without explicit trust/);
  });

  it('loads data-only JSON config without executable trust', async () => {
    const dir = await makeTempDir('workspai-config-json-');
    await fsExtra.writeJson(path.join(dir, 'workspai.config.json'), {
      workspace: { defaultAuthor: 'JSON Team' },
    });

    await expect(loadWorkspaiConfig(dir)).resolves.toMatchObject({
      workspace: { defaultAuthor: 'JSON Team' },
    });
  });
});
