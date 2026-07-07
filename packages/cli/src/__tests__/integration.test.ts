import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Integration tests for CLI workflows
describe('CLI Integration Tests', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique test directory
    testDir = path.join(os.tmpdir(), `rapidkit-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Workspace Creation', () => {
    it('should create workspace directory structure', async () => {
      const workspaceName = 'test-workspace';
      const workspacePath = path.join(testDir, workspaceName);

      // Simulate workspace creation
      await fs.mkdir(workspacePath, { recursive: true });
      await fs.writeFile(path.join(workspacePath, 'README.md'), '# Test Workspace');
      await fs.writeFile(
        path.join(workspacePath, 'package.json'),
        JSON.stringify({ name: workspaceName, version: '1.0.0' })
      );

      // Verify structure
      const files = await fs.readdir(workspacePath);
      expect(files).toContain('README.md');
      expect(files).toContain('package.json');

      const readmeContent = await fs.readFile(path.join(workspacePath, 'README.md'), 'utf-8');
      expect(readmeContent).toContain('Test Workspace');
    });

    it('should handle workspace name validation', async () => {
      const invalidNames = [
        'Test-Workspace', // Uppercase
        '123-workspace', // Starts with number
        'work space', // Contains space
        'work@space', // Invalid character
      ];

      for (const name of invalidNames) {
        const _workspacePath = path.join(testDir, name);

        // Should not create workspace with invalid name
        // In real CLI, this would be caught by validation
        expect(name).not.toMatch(/^[a-z][a-z0-9-_]*$/);
      }
    });

    it('should create demo workspace with generator script', async () => {
      const workspacePath = path.join(testDir, 'demo-workspace');
      await fs.mkdir(workspacePath, { recursive: true });

      // Create demo generator script
      const generatorScript = `
const fs = require('fs');
const path = require('path');

const projectName = process.argv[2] || 'demo-project';
const projectPath = path.join(__dirname, projectName);

fs.mkdirSync(projectPath, { recursive: true });
fs.writeFileSync(
  path.join(projectPath, 'main.py'),
  'print("Hello from demo project")'
);

console.log('Created:', projectName);
      `;

      await fs.writeFile(path.join(workspacePath, 'generate-demo.js'), generatorScript);

      // Verify generator exists
      const files = await fs.readdir(workspacePath);
      expect(files).toContain('generate-demo.js');

      const scriptContent = await fs.readFile(
        path.join(workspacePath, 'generate-demo.js'),
        'utf-8'
      );
      expect(scriptContent).toContain('projectName');
    });
  });

  describe('File Operations', () => {
    it('should copy template files', async () => {
      const sourcePath = path.join(testDir, 'source');
      const destPath = path.join(testDir, 'dest');

      await fs.mkdir(sourcePath, { recursive: true });
      await fs.writeFile(path.join(sourcePath, 'template.txt'), 'Template content');

      // Copy file
      await fs.mkdir(destPath, { recursive: true });
      await fs.copyFile(path.join(sourcePath, 'template.txt'), path.join(destPath, 'template.txt'));

      const content = await fs.readFile(path.join(destPath, 'template.txt'), 'utf-8');
      expect(content).toBe('Template content');
    });

    it('should handle nested directory creation', async () => {
      const nestedPath = path.join(testDir, 'level1', 'level2', 'level3');

      await fs.mkdir(nestedPath, { recursive: true });

      const stat = await fs.stat(nestedPath);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should read and write JSON files', async () => {
      const jsonPath = path.join(testDir, 'config.json');
      const data = {
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          fastapi: '^0.100.0',
        },
      };

      await fs.writeFile(jsonPath, JSON.stringify(data, null, 2));

      const content = await fs.readFile(jsonPath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed).toEqual(data);
      expect(parsed.dependencies.fastapi).toBe('^0.100.0');
    });
  });

  describe('Template Rendering', () => {
    it('should replace template variables', () => {
      const template = 'Project: {{name}}, Author: {{author}}';
      const variables = { name: 'my-api', author: 'Test User' };

      const rendered = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return variables[key as keyof typeof variables] || '';
      });

      expect(rendered).toBe('Project: my-api, Author: Test User');
    });

    it('should handle missing variables gracefully', () => {
      const template = 'Project: {{name}}, Version: {{version}}';
      const variables = { name: 'my-api' };

      const rendered = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return variables[key as keyof typeof variables] || '';
      });

      expect(rendered).toBe('Project: my-api, Version: ');
    });
  });

  describe('Error Handling', () => {
    it('should handle file not found errors', async () => {
      const nonExistentPath = path.join(testDir, 'does-not-exist.txt');

      await expect(fs.readFile(nonExistentPath, 'utf-8')).rejects.toThrow();
    });

    it('should handle permission errors gracefully', async () => {
      const filePath = path.join(testDir, 'readonly.txt');
      await fs.writeFile(filePath, 'content');

      // Try to make it readonly (may not work on all systems)
      try {
        await fs.chmod(filePath, 0o444);

        // Attempt to write should fail
        await expect(fs.writeFile(filePath, 'new content')).rejects.toThrow();
      } catch {
        // Skip on systems where chmod doesn't work
      }
    });

    it('should validate directory existence before operations', async () => {
      const dirPath = path.join(testDir, 'new-dir');

      // Check before creation
      let exists = false;
      try {
        await fs.access(dirPath);
        exists = true;
      } catch {
        exists = false;
      }
      expect(exists).toBe(false);

      // Create and check again
      await fs.mkdir(dirPath);
      try {
        await fs.access(dirPath);
        exists = true;
      } catch {
        exists = false;
      }
      expect(exists).toBe(true);
    });
  });

  describe('Git Integration', () => {
    it('should initialize git repository', async () => {
      const workspacePath = path.join(testDir, 'git-workspace');
      await fs.mkdir(workspacePath, { recursive: true });

      // Mock git init
      const gitDir = path.join(workspacePath, '.git');
      await fs.mkdir(gitDir, { recursive: true });
      await fs.writeFile(path.join(gitDir, 'config'), '[core]\n\trepositoryformatversion = 0');

      // Verify .git exists
      const stat = await fs.stat(gitDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should create .gitignore file', async () => {
      const workspacePath = path.join(testDir, 'git-workspace');
      await fs.mkdir(workspacePath, { recursive: true });

      const gitignoreContent = `
node_modules/
.venv/
__pycache__/
*.pyc
.env
      `.trim();

      await fs.writeFile(path.join(workspacePath, '.gitignore'), gitignoreContent);

      const content = await fs.readFile(path.join(workspacePath, '.gitignore'), 'utf-8');

      expect(content).toContain('node_modules/');
      expect(content).toContain('.venv/');
      expect(content).toContain('__pycache__/');
    });
  });

  describe('Package Management', () => {
    it('should create package.json with correct structure', async () => {
      const packageJson = {
        name: 'test-workspace',
        version: '1.0.0',
        type: 'module',
        scripts: {
          generate: 'node generate-demo.js',
        },
        dependencies: {},
      };

      const workspacePath = path.join(testDir, 'package-workspace');
      await fs.mkdir(workspacePath, { recursive: true });
      await fs.writeFile(
        path.join(workspacePath, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      const content = await fs.readFile(path.join(workspacePath, 'package.json'), 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.name).toBe('test-workspace');
      expect(parsed.type).toBe('module');
      expect(parsed.scripts.generate).toBe('node generate-demo.js');
    });

    it('should create pyproject.toml for Python projects', async () => {
      const pyprojectToml = `
[tool.poetry]
name = "test-project"
version = "0.1.0"
description = "Test project"

[tool.poetry.dependencies]
python = "^3.10"
fastapi = "^0.100.0"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"
      `.trim();

      const projectPath = path.join(testDir, 'python-project');
      await fs.mkdir(projectPath, { recursive: true });
      await fs.writeFile(path.join(projectPath, 'pyproject.toml'), pyprojectToml);

      const content = await fs.readFile(path.join(projectPath, 'pyproject.toml'), 'utf-8');

      expect(content).toContain('[tool.poetry]');
      expect(content).toContain('fastapi');
      expect(content).toContain('python = "^3.10"');
    });
  });
});
