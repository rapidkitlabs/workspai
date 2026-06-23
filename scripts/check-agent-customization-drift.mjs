#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const GENERATED_AGENT_PATHS = [
  '.rapidkit/reports/INDEX.json',
  '.rapidkit/reports/agent-customization-pack.json',
  '.rapidkit/reports/rapidkit-mcp-design.json',
  '.rapidkit/reports/workspace-context-agent.json',
  '.rapidkit/AGENT-GROUNDING.md',
  'AGENTS.md',
  'CLAUDE.md',
  '.github/copilot-instructions.md',
  '.github/instructions',
  '.github/prompts',
  '.github/skills/rapidkit-grounding',
  '.github/skills/rapidkit-workspace-intelligence',
  '.github/agents',
  '.cursor/rules/rapidkit-grounding.mdc',
  '.claude/rules/rapidkit-evidence.md',
  '.vscode/rapidkit-agent-hooks.json',
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
    `[rapidkit] Agent customization drift check skipped: ${workspacePath} is not a git work tree.`
  );
  process.exit(0);
}

const status = runGit(workspacePath, ['status', '--porcelain', '--', ...GENERATED_AGENT_PATHS]);

if (status.status !== 0) {
  console.error('[rapidkit] Failed to inspect generated agent customization drift.');
  if (status.stderr.trim()) {
    console.error(status.stderr.trim());
  }
  process.exit(status.status ?? 1);
}

const drift = status.stdout.trim();

if (drift.length > 0) {
  console.error('[rapidkit] Agent customization drift detected.');
  console.error(
    'Run `npx rapidkit workspace agent-sync --write --refresh-context --preset enterprise`, review the generated files, and commit the changes.'
  );
  console.error('');
  console.error(drift);
  process.exit(1);
}

console.log('[rapidkit] Agent customization files are in sync.');
