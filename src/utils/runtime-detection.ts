import fs from 'fs';
import path from 'path';

export type RapidkitProjectJson = Record<string, unknown> | null;

export function readRapidkitProjectJson(start: string): RapidkitProjectJson {
  let currentPath = start;

  while (true) {
    const candidate = path.join(currentPath, '.rapidkit', 'project.json');
    if (fs.existsSync(candidate)) {
      try {
        return JSON.parse(fs.readFileSync(candidate, 'utf8'));
      } catch {
        return null;
      }
    }

    const parent = path.dirname(currentPath);
    if (parent === currentPath) break;
    currentPath = parent;
  }

  return null;
}

export function isGoProject(projectJson: RapidkitProjectJson, projectPath: string): boolean {
  const runtime = (projectJson?.runtime as string | undefined)?.toLowerCase();
  const kitName = (projectJson?.kit_name as string | undefined)?.toLowerCase();
  const hasGoMod = fs.existsSync(path.join(projectPath, 'go.mod'));

  return (
    runtime === 'go' ||
    (kitName?.startsWith('gofiber') ?? false) ||
    (kitName?.startsWith('gogin') ?? false) ||
    hasGoMod
  );
}

export function isNodeProject(projectJson: RapidkitProjectJson, projectPath: string): boolean {
  const runtime = (projectJson?.runtime as string | undefined)?.toLowerCase();
  const kitName = (projectJson?.kit_name as string | undefined)?.toLowerCase();
  const hasPackageJson = fs.existsSync(path.join(projectPath, 'package.json'));

  return (
    runtime === 'node' ||
    runtime === 'typescript' ||
    (kitName?.startsWith('nestjs') ?? false) ||
    hasPackageJson
  );
}

export function isJavaProject(projectJson: RapidkitProjectJson, projectPath: string): boolean {
  const runtime = (projectJson?.runtime as string | undefined)?.toLowerCase();
  const kitName = (projectJson?.kit_name as string | undefined)?.toLowerCase();
  const hasPomXml = fs.existsSync(path.join(projectPath, 'pom.xml'));
  const hasGradle =
    fs.existsSync(path.join(projectPath, 'build.gradle')) ||
    fs.existsSync(path.join(projectPath, 'build.gradle.kts'));

  return (
    runtime === 'java' ||
    runtime === 'spring' ||
    (kitName?.startsWith('springboot') ?? false) ||
    hasPomXml ||
    hasGradle
  );
}

export function isPythonProject(projectJson: RapidkitProjectJson, projectPath: string): boolean {
  const runtime = (projectJson?.runtime as string | undefined)?.toLowerCase();
  const kitName = (projectJson?.kit_name as string | undefined)?.toLowerCase();
  const hasPyproject = fs.existsSync(path.join(projectPath, 'pyproject.toml'));
  const hasRequirements =
    fs.existsSync(path.join(projectPath, 'requirements.txt')) ||
    fs.existsSync(path.join(projectPath, 'requirements.in'));

  return (
    runtime === 'python' ||
    (kitName?.startsWith('fastapi') ?? false) ||
    hasPyproject ||
    hasRequirements
  );
}
