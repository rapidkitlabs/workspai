import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import fsExtra from 'fs-extra';

import { detectFrontendFrameworkFromProject } from '../utils/frontend-framework-contract.js';
import {
  assessFrontendSourceTree,
  buildFrontendDoctorProbes,
  detectNodeEslintConfigured,
  detectNodeTestSurface,
} from '../utils/doctor-frontend-signals.js';

describe('doctor-frontend-signals', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs) {
      await fsExtra.remove(dir);
    }
    tempDirs.length = 0;
  });

  async function makeProject(files: Record<string, string | object>): Promise<string> {
    const root = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rapidkit-doctor-frontend-'));
    tempDirs.push(root);
    for (const [relativePath, content] of Object.entries(files)) {
      const target = path.join(root, relativePath);
      await fsExtra.ensureDir(path.dirname(target));
      if (typeof content === 'string') {
        await fsExtra.writeFile(target, content, 'utf8');
      } else {
        await fsExtra.writeJSON(target, content, { spaces: 2 });
      }
    }
    return root;
  }

  it('detects modern ESLint flat config for frontend projects', async () => {
    const projectPath = await makeProject({
      'eslint.config.mjs': 'export default []',
      'package.json': { name: 'web', version: '1.0.0' },
    });

    expect(await detectNodeEslintConfigured(projectPath)).toBe(true);
  });

  it('detects vitest and co-located test files', async () => {
    const projectPath = await makeProject({
      'package.json': {
        name: 'web',
        version: '1.0.0',
        devDependencies: { vitest: '2.0.0' },
      },
      'src/components/Button.test.tsx': 'export {}',
    });

    expect(await detectNodeTestSurface(projectPath)).toBe(true);
  });

  it('assesses frontend source tree from app/ directories', async () => {
    const projectPath = await makeProject({
      'app/page.tsx': 'export default function Page() { return null; }',
    });

    expect(await assessFrontendSourceTree(projectPath)).toBe(true);
  });

  it('builds enterprise frontend probes for Next.js projects', async () => {
    const projectPath = await makeProject({
      'package.json': {
        name: 'catalog-api',
        version: '1.0.0',
        scripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start',
          lint: 'next lint',
        },
        dependencies: { next: '14.2.0' },
      },
      'package-lock.json': '{}',
      'tsconfig.json': { compilerOptions: { strict: true } },
      'next.config.ts': 'export default {}',
      'app/page.tsx': 'export default function Page() { return null; }',
    });

    const detection = detectFrontendFrameworkFromProject(projectPath, {
      framework: 'nextjs',
      kit_name: 'frontend.nextjs',
    });
    const probes = await buildFrontendDoctorProbes({
      projectPath,
      detection,
      packageJsonData: JSON.parse(
        fs.readFileSync(path.join(projectPath, 'package.json'), 'utf8')
      ) as Record<string, unknown>,
    });

    expect(probes.map((probe) => probe.id)).toEqual(
      expect.arrayContaining([
        'frontend-lockfile-integrity',
        'frontend-typescript-surface',
        'frontend-framework-config',
        'frontend-script-dev',
        'frontend-script-build',
        'frontend-script-test',
        'frontend-script-lint',
        'frontend-source-tree',
      ])
    );
    expect(probes.find((probe) => probe.id === 'frontend-script-dev')?.status).toBe('pass');
    expect(probes.find((probe) => probe.id === 'frontend-source-tree')?.status).toBe('pass');
  });
});
