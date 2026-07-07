#!/usr/bin/env node
/**
 * Workspai Project Generator
 * This script is called by the Workspai CLI to generate projects
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

const TEMPLATES_DIR = path.join(__dirname, 'templates');

async function generateProject(projectPath, template, useDefaults, skipGit, skipInstall) {
  const projectName = path.basename(projectPath);
  const templateDir = template === 'nestjs' ? 'nestjs-standard' : 'fastapi-standard';
  const templatePath = path.join(TEMPLATES_DIR, templateDir);

  // Check template exists
  try {
    await fs.access(templatePath);
  } catch {
    console.error('❌ Template not found:', templateDir);
    process.exit(1);
  }

  // Create project directory
  await fs.mkdir(projectPath, { recursive: true });

  // Build context
  const context = {
    project_name: template === 'nestjs' 
      ? projectName.replace(/_/g, '-').toLowerCase() 
      : projectName.replace(/-/g, '_').toLowerCase(),
    author: process.env.USER || 'Workspai User',
    description: template === 'nestjs' 
      ? 'NestJS application generated with Workspai'
      : 'FastAPI service generated with Workspai',
    app_version: '0.1.0',
    license: 'MIT',
    package_manager: 'npm',
    created_at: new Date().toISOString(),
    rapidkit_version: require('./config.json').rapidkit_version || '0.12.0',
  };

  // Copy and render template files
  await copyTemplateDir(templatePath, projectPath, context);

  console.log('✅ Project files created!');

  // Git initialization
  if (!skipGit) {
    try {
      execSync('git init', { cwd: projectPath, stdio: 'pipe' });
      execSync('git add .', { cwd: projectPath, stdio: 'pipe' });
      const commitMsg = 'Initial commit: ' + (template === 'nestjs' ? 'NestJS' : 'FastAPI') + ' project via Workspai';
      execSync(`git commit -m "${commitMsg}"`, { cwd: projectPath, stdio: 'pipe' });
      console.log('✅ Git repository initialized');
    } catch (e) {
      console.log('⚠️  Could not initialize git');
    }
  }

  // Install dependencies
  if (!skipInstall) {
    if (template === 'nestjs') {
      console.log('📦 Installing dependencies...');
      try {
        execSync('npm install', { cwd: projectPath, stdio: 'inherit' });
        console.log('✅ Dependencies installed');
      } catch {
        console.log('⚠️  Could not install dependencies. Run npm install manually.');
      }
    }
  }

  // Success message
  const templateName = template === 'nestjs' ? 'NestJS' : 'FastAPI';
  console.log('');
  console.log('✨ ' + templateName + ' project created successfully!');
  console.log('');
  console.log('🚀 Get started:');
  console.log('  cd ' + projectName);
  if (template === 'fastapi') {
    console.log('  workspai init    # poetry install');
    console.log('  workspai dev     # Start dev server');
  } else {
    if (skipInstall) {
      console.log('  workspai init    # npm install');
    }
    console.log('  cp .env.example .env');
    console.log('  workspai dev     # Start dev server');
  }
  console.log('');
}

function renderTemplate(content, context) {
  let result = content;
  
  for (const [key, value] of Object.entries(context)) {
    // Simple variable replacement: {{ key }}
    const simpleRegex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    result = result.replace(simpleRegex, String(value));
    
    // With replace filter: {{ key | replace('a', 'b') }}
    const replaceRegex = new RegExp(
      `\\{\\{\\s*${key}\\s*\\|\\s*replace\\s*\\(\\s*['"]([^'"]+)['"]\\s*,\\s*['"]([^'"]*)['"]\\s*\\)\\s*\\}\\}`,
      'g'
    );
    result = result.replace(replaceRegex, (match, from, to) => {
      return String(value).replace(new RegExp(from, 'g'), to);
    });
    
    // With lower filter: {{ key | lower }}
    const lowerRegex = new RegExp(`\\{\\{\\s*${key}\\s*\\|\\s*lower\\s*\\}\\}`, 'g');
    result = result.replace(lowerRegex, String(value).toLowerCase());
    
    // Combined: {{ key | replace('a', 'b') | lower }}
    const combinedRegex = new RegExp(
      `\\{\\{\\s*${key}\\s*\\|\\s*replace\\s*\\(\\s*['"]([^'"]+)['"]\\s*,\\s*['"]([^'"]*)['"]\\s*\\)\\s*\\|\\s*lower\\s*\\}\\}`,
      'g'
    );
    result = result.replace(combinedRegex, (match, from, to) => {
      return String(value).replace(new RegExp(from, 'g'), to).toLowerCase();
    });
  }
  
  return result;
}

async function copyTemplateDir(src, dest, context) {
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destName = entry.name.replace(/\.j2$/, '');
    const destPath = path.join(dest, destName);

    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyTemplateDir(srcPath, destPath, context);
    } else {
      let content = await fs.readFile(srcPath, 'utf-8');

      // Render template if it's a .j2 file
      if (entry.name.endsWith('.j2')) {
        content = renderTemplate(content, context);
      }

      await fs.writeFile(destPath, content);

      // Make scripts executable
      if (
        destName === 'rapidkit' ||
        (destName.endsWith('.py') &&
          (destPath.includes('.workspai') || destPath.includes('.rapidkit')))
      ) {
        await fs.chmod(destPath, 0o755);
      }
    }
  }
}

// Main
const args = process.argv.slice(2);
const projectPath = args[0];
const template = args[1] || 'fastapi';
const useDefaults = args.includes('--yes');
const skipGit = args.includes('--skip-git');
const skipInstall = args.includes('--skip-install');

if (!projectPath) {
  console.error('Usage: node generator.js <project-path> <template> [--yes] [--skip-git] [--skip-install]');
  process.exit(1);
}

generateProject(projectPath, template, useDefaults, skipGit, skipInstall).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
