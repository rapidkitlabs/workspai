#!/usr/bin/env node

const userAgent = process.env.npm_config_user_agent || '';
const usingNpm = userAgent.startsWith('npm/');

if (!usingNpm) {
  console.error('❌ Workspai uses npm as the only supported package manager for development.');
  console.error('Please run: npm install');
  process.exit(1);
}
