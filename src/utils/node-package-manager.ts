import fs from 'fs';
import path from 'path';

export type NodePackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export function detectNodePackageManager(projectPath: string): NodePackageManager {
  if (
    fs.existsSync(path.join(projectPath, 'bun.lock')) ||
    fs.existsSync(path.join(projectPath, 'bunfig.toml'))
  ) {
    return 'bun';
  }
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) {
    return 'yarn';
  }
  if (fs.existsSync(path.join(projectPath, 'package-lock.json'))) {
    return 'npm';
  }

  return 'npm';
}

export function formatNodeScriptCommand(
  projectPath: string,
  scriptName: string,
  packageManager: NodePackageManager = detectNodePackageManager(projectPath)
): string {
  if (packageManager === 'npm') {
    return `npm run ${scriptName}`;
  }
  return `${packageManager} run ${scriptName}`;
}

export function formatNodeInstallCommand(
  projectPath: string,
  packageManager: NodePackageManager = detectNodePackageManager(projectPath)
): string {
  return `${packageManager} install`;
}
