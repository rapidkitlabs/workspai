#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const GENERATED_AGENT_PATHS = [
  '.workspai/reports/INDEX.json',
  '.workspai/reports/agent-customization-pack.json',
  '.workspai/reports/workspai-mcp-design.json',
  '.workspai/reports/workspace-context-agent.json',
  '.workspai/reports/workspace-skills-index.json',
  '.workspai/skills',
  '.workspai/AGENT-GROUNDING.md',
  'AGENTS.md',
  'CLAUDE.md',
  '.github/copilot-instructions.md',
  '.github/instructions',
  '.github/prompts',
  '.github/skills/workspai-grounding',
  '.github/skills/workspai-workspace-intelligence',
  '.github/agents',
  '.cursor/rules/workspai-grounding.mdc',
  '.claude/rules/workspai-evidence.md',
  '.claude/rules/rapidkit-evidence.md',
  '.vscode/workspai-agent-hooks.json',
];

function parseWorkspaceArg(argv) {
  const workspaceIndex = argv.indexOf('--workspace');
  if (workspaceIndex >= 0 && argv[workspaceIndex + 1]) {
    return argv[workspaceIndex + 1];
  }
  const inline = argv.find((arg) => arg.startsWith('--workspace='));
  if (inline) {
    return inline.slice('--workspace='.length);
  }
  return process.cwd();
}

function runGit(workspacePath, args) {
  return spawnSync('git', ['-C', workspacePath, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const workspacePath = path.resolve(parseWorkspaceArg(process.argv.slice(2)));
const gitCheck = runGit(workspacePath, ['rev-parse', '--is-inside-work-tree']);

if (gitCheck.status !== 0 || gitCheck.stdout.trim() !== 'true') {
  console.warn(
    `[workspai] Agent customization drift check skipped: ${workspacePath} is not a git work tree.`
  );
  process.exit(0);
}

const status = runGit(workspacePath, ['status', '--porcelain', '--', ...GENERATED_AGENT_PATHS]);

if (status.status !== 0) {
  console.error('[workspai] Failed to inspect generated agent customization drift.');
  if (status.stderr.trim()) {
    console.error(status.stderr.trim());
  }
  process.exit(status.status ?? 1);
}

const drift = status.stdout.trim();

if (drift.length > 0) {
  console.error('[workspai] Agent customization drift detected.');
  console.error(
    'Run `npx workspai workspace agent-sync --write --refresh-context --preset enterprise`, review the generated files, and commit the changes.'
  );
  console.error('');
  console.error(drift);
  process.exit(1);
}

console.log('[workspai] Agent customization files are in sync.');
