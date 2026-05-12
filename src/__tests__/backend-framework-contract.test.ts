import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  detectBackendFrameworkFromHints,
  detectBackendFrameworkFromProject,
  detectRuntimeCandidatesFromProject,
  normalizeBackendFrameworkLabel,
  normalizeBackendRuntimeFamily,
} from '../utils/backend-framework-contract';

const tempDirs: string[] = [];

async function createTempProject(name: string): Promise<string> {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), `rk-backend-contract-${name}-`));
  tempDirs.push(projectPath);
  return projectPath;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const target = tempDirs.pop();
    if (target) {
      await fs.remove(target);
    }
  }
});

describe('backend-framework-contract', () => {
  it('normalizes canonical hints from kit, framework, and runtime aliases', () => {
    expect(normalizeBackendFrameworkLabel('gin')).toBe('gogin');
    expect(normalizeBackendFrameworkLabel('Spring Boot')).toBe('springboot');
    expect(normalizeBackendRuntimeFamily('nodejs')).toBe('node');
    expect(normalizeBackendRuntimeFamily('csharp')).toBe('dotnet');

    expect(detectBackendFrameworkFromHints({ kitName: 'gogin.standard' })).toMatchObject({
      key: 'gogin',
      runtime: 'go',
      importStack: 'go',
      confidence: 'high',
      source: 'kit',
    });

    expect(detectBackendFrameworkFromHints({ framework: 'Spring Boot' })).toMatchObject({
      key: 'springboot',
      runtime: 'java',
      importStack: 'springboot',
      confidence: 'high',
      source: 'framework',
    });

    expect(detectBackendFrameworkFromHints({ runtime: 'csharp' })).toMatchObject({
      key: 'dotnet',
      runtime: 'dotnet',
      importStack: 'dotnet',
      confidence: 'medium',
      source: 'runtime',
    });

    expect(detectBackendFrameworkFromHints({ runtime: 'java' })).toMatchObject({
      key: 'java',
      runtime: 'java',
      importStack: 'unknown',
      confidence: 'medium',
      source: 'runtime',
    });

    expect(detectBackendFrameworkFromHints({ runtime: 'ruby' })).toMatchObject({
      key: 'ruby',
      runtime: 'ruby',
      importStack: 'unknown',
      confidence: 'medium',
      source: 'runtime',
    });
  });

  it('detects backend frameworks from project manifests and markers', async () => {
    const gofiberProject = await createTempProject('gofiber');
    await fs.writeFile(
      path.join(gofiberProject, 'go.mod'),
      'module example\n\nrequire github.com/gofiber/fiber/v2 v2.52.4\n'
    );

    const springProject = await createTempProject('springboot');
    await fs.writeFile(
      path.join(springProject, 'pom.xml'),
      '<dependency><groupId>org.springframework.boot</groupId></dependency>'
    );

    const railsProject = await createTempProject('rails');
    await fs.writeFile(path.join(railsProject, 'Gemfile'), 'gem "rails", "~> 7.1.0"\n');

    expect(detectBackendFrameworkFromProject(gofiberProject)).toMatchObject({
      key: 'gofiber',
      runtime: 'go',
      importStack: 'go',
      confidence: 'high',
    });
    expect(detectBackendFrameworkFromProject(springProject)).toMatchObject({
      key: 'springboot',
      runtime: 'java',
      importStack: 'springboot',
      confidence: 'high',
    });
    expect(detectBackendFrameworkFromProject(railsProject)).toMatchObject({
      key: 'rails',
      runtime: 'ruby',
      importStack: 'rails',
      confidence: 'high',
    });
  });

  it('keeps runtime candidate detection broad for polyglot backends', async () => {
    const polyglotProject = await createTempProject('polyglot');
    await fs.writeFile(
      path.join(polyglotProject, 'package.json'),
      '{"dependencies":{"express":"^4.0.0"}}'
    );
    await fs.writeFile(path.join(polyglotProject, 'go.mod'), 'module example\n');
    await fs.writeFile(path.join(polyglotProject, 'pom.xml'), '<project></project>');

    expect(detectRuntimeCandidatesFromProject(polyglotProject)).toEqual(['go', 'java', 'node']);
  });
});
