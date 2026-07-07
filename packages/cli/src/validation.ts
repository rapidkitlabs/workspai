import validateNpmPackageName from 'validate-npm-package-name';
import { InvalidProjectNameError } from './errors.js';

/**
 * Validate project name for both npm and Python conventions
 */
export function validateProjectName(name: string): boolean {
  // Check npm package name rules
  const npmCheck = validateNpmPackageName(name);

  if (!npmCheck.validForNewPackages) {
    const errors = npmCheck.errors || [];
    const warnings = npmCheck.warnings || [];
    const issues = [...errors, ...warnings];
    throw new InvalidProjectNameError(name, `NPM validation failed: ${issues.join(', ')}`);
  }

  // Check Python package naming conventions
  // Must start with letter, can contain lowercase letters, numbers, hyphens, and underscores
  if (!/^[a-z][a-z0-9_-]*$/.test(name)) {
    throw new InvalidProjectNameError(
      name,
      'Must start with a lowercase letter and contain only lowercase letters, numbers, hyphens, and underscores'
    );
  }

  // Check for reserved names
  const reservedNames = [
    'test',
    'tests',
    'src',
    'dist',
    'build',
    'lib',
    'python',
    'pip',
    'poetry',
    'node',
    'npm',
    'rapidkit',
    'rapidkit',
  ];

  if (reservedNames.includes(name.toLowerCase())) {
    throw new InvalidProjectNameError(
      name,
      `"${name}" is a reserved name. Please choose a different name.`
    );
  }

  // Check length
  if (name.length < 2) {
    throw new InvalidProjectNameError(name, 'Name must be at least 2 characters long');
  }

  if (name.length > 214) {
    throw new InvalidProjectNameError(name, 'Name must be less than 214 characters');
  }

  return true;
}

/**
 * Convert project name to snake_case for Python
 */
export function toSnakeCase(name: string): string {
  return name.replace(/-/g, '_');
}

/**
 * Convert project name to kebab-case for directories
 */
export function toKebabCase(name: string): string {
  return name.replace(/_/g, '-');
}
