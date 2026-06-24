import { AGENT_REPORT_CATALOG } from '../workspace-agent-sync.js';
import {
  RAPIDKIT_SKILLS_DIR,
  WORKSPACE_EXPLAIN_REPORT_PATH,
  WORKSPACE_SKILLS_INDEX_PATH,
  operationalSkillPath,
} from './workspace-artifact-paths.js';
import { STANDARD_ANSWER_CONTRACT_SECTIONS } from './standard-answer-contract.js';

export const AGENT_CUSTOMIZATION_PACK_SCHEMA_VERSION = 'rapidkit-agent-customization-pack.v1';

export type AgentCustomizationPackContract = {
  schemaVersion: typeof AGENT_CUSTOMIZATION_PACK_SCHEMA_VERSION;
  presets: Record<
    'minimal' | 'enterprise',
    {
      meaning: string;
      requiredOutputs: string[];
    }
  >;
  targets: Record<
    'all' | 'vscode' | 'agents' | 'copilot' | 'cursor' | 'claude' | 'codex' | 'orca',
    {
      meaning: string;
      outputFamilies: string[];
    }
  >;
  standardAnswerContract: string[];
  requiredReports: Array<{
    path: string;
    label: string;
    required: boolean;
  }>;
  strictRules: string[];
  outputKinds: string[];
  pathLayers: {
    l1CanonicalRoots: string[];
    l2PrefixedMirrorRoots: string[];
    l3SharedIndustryFiles: string[];
  };
};

export function buildAgentCustomizationPackContract(): AgentCustomizationPackContract {
  return {
    schemaVersion: AGENT_CUSTOMIZATION_PACK_SCHEMA_VERSION,
    presets: {
      minimal: {
        meaning:
          'Generate the portable grounding index, AGENTS.md, and provider-specific lightweight instructions.',
        requiredOutputs: [
          '.rapidkit/reports/INDEX.json',
          '.rapidkit/reports/agent-customization-pack.json',
          'AGENTS.md',
        ],
      },
      enterprise: {
        meaning:
          'Generate the full VS Code-native pack: instructions, prompts, skills, custom agents, and validation metadata.',
        requiredOutputs: [
          '.rapidkit/reports/INDEX.json',
          '.rapidkit/reports/agent-customization-pack.json',
          'AGENTS.md',
          '.github/instructions/rapidkit-workspace.instructions.md',
          '.github/prompts/rapidkit-diagnose.prompt.md',
          '.github/skills/rapidkit-workspace-intelligence/SKILL.md',
          '.github/agents/workspai-advisor.agent.md',
          '.rapidkit/reports/rapidkit-mcp-design.json',
          WORKSPACE_SKILLS_INDEX_PATH,
        ],
      },
    },
    targets: {
      all: {
        meaning: 'Generate every supported customization surface.',
        outputFamilies: ['portable', 'vscode', 'copilot', 'cursor', 'claude'],
      },
      vscode: {
        meaning: 'Generate VS Code-native customizations for Copilot Chat and agent workflows.',
        outputFamilies: ['instructions', 'prompts', 'skills', 'agents', 'hooks'],
      },
      agents: {
        meaning: 'Generate portable AGENTS.md grounding for any agent.',
        outputFamilies: ['portable'],
      },
      copilot: {
        meaning: 'Generate GitHub Copilot instructions, prompts, and skills.',
        outputFamilies: ['instructions', 'prompts', 'skills'],
      },
      cursor: {
        meaning: 'Generate Cursor rules.',
        outputFamilies: ['rules'],
      },
      claude: {
        meaning: 'Generate Claude Code grounding files.',
        outputFamilies: ['rules', 'portable'],
      },
      codex: {
        meaning: 'Use AGENTS.md and the report index as the Codex grounding layer.',
        outputFamilies: ['portable'],
      },
      orca: {
        meaning: 'Use AGENTS.md and the report index as the Orca/Grok grounding layer.',
        outputFamilies: ['portable'],
      },
    },
    standardAnswerContract: [...STANDARD_ANSWER_CONTRACT_SECTIONS],
    requiredReports: AGENT_REPORT_CATALOG.map((entry) => ({
      path: entry.relativePath,
      label: entry.label,
      required: entry.required,
    })),
    strictRules: [
      'Required reports must exist.',
      'Generated report paths must stay inside the workspace root.',
      'Generated customization text must be English-only.',
      'Agent answers must not claim pass, ready, or healthy without cited evidence.',
      'Commands must distinguish display guidance from execution requests.',
      'Agent hook files must be advisory and disabled by default unless the user explicitly enables them.',
      'MCP design artifacts must stay read-mostly until write tools have explicit approval boundaries.',
    ],
    outputKinds: [
      'report',
      'grounding',
      'instruction',
      'prompt',
      'skill',
      'skill-resource',
      'operational-skill',
      'skills-index',
      'explain-report',
      'agent',
      'rule',
      'hook',
      'mcp-design',
    ],
    pathLayers: {
      l1CanonicalRoots: [`.rapidkit/reports/`, `${RAPIDKIT_SKILLS_DIR}/`],
      l2PrefixedMirrorRoots: ['.github/', '.cursor/', '.claude/'],
      l3SharedIndustryFiles: ['AGENTS.md', '.github/copilot-instructions.md', 'CLAUDE.md'],
    },
  };
}

export { operationalSkillPath, WORKSPACE_SKILLS_INDEX_PATH, WORKSPACE_EXPLAIN_REPORT_PATH };
