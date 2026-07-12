import { CLI_LOG_EVENT_SCHEMA_VERSION } from './cli-log-event-contract.js';
import { FACT_FRESHNESS_SCHEMA_VERSION } from './fact-freshness-contract.js';
import { FRESHNESS_METADATA_SCHEMA_VERSION } from './freshness-metadata-contract.js';
import { PROJECT_ENTRY_CAPABILITY_SCHEMA_VERSION } from './project-entry-capability-contract.js';
import { RUNTIME_COMMAND_SURFACE_SCHEMA_VERSION } from './runtime-command-surface-contract.js';
import { BLOCKER_RESOLUTION_SCHEMA_VERSION } from './blocker-resolution-contract.js';
import { AGENT_ACTION_OUTCOME_SCHEMA_VERSION } from './agent-action-outcome-contract.js';
import { DOCTOR_FIX_RESULT_SCHEMA_VERSION } from './doctor-fix-result-contract.js';
import { DOCTOR_REMEDIATION_PLAN_SCHEMA_VERSION } from './doctor-remediation-plan-contract.js';
import { ARTIFACT_REMEDIATION_PLAN_SCHEMA_VERSION } from './artifact-remediation-plan-contract.js';
import { WORKSPACE_EXPLAIN_SCHEMA_VERSION } from './workspace-explain-contract.js';
import { WORKSPACE_OPERATIONAL_SKILL_SCHEMA_VERSION } from './workspace-operational-skill-contract.js';
import { WORKSPACE_SKILLS_INDEX_SCHEMA_VERSION } from './workspace-skills-index-contract.js';
import { AGENT_CUSTOMIZATION_PACK_SCHEMA_VERSION } from './agent-customization-pack-contract.js';
import { WORKSPACE_DEPENDENCY_GRAPH_SCHEMA_VERSION } from './workspace-dependency-graph-contract.js';
import { WORKSPACE_INTELLIGENCE_ARCHITECTURE_SCHEMA_VERSION } from './workspace-intelligence-architecture-contract.js';
import { WORKSPACE_INTELLIGENCE_CHAIN_SCHEMA_VERSION } from './workspace-intelligence-chain-contract.js';
import { WORKSPACE_HISTORY_SCHEMA_VERSION } from '../workspace-history.js';
import { WORKSPACE_CONTEXT_SCHEMA_VERSION } from '../workspace-context.js';
import { WORKSPACE_MODEL_SCHEMA_VERSION } from '../workspace-model.js';
import { WORKSPACE_IMPACT_SCHEMA_VERSION } from '../workspace-intelligence.js';
import { WORKSPACE_VERIFY_SCHEMA_VERSION } from '../workspace-verify.js';
import { WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMAS } from './workspace-intelligence-runtime-registry.js';

/** Single source of truth for schema versions advertised to IDE/CI consumers. */
export function getPublishedContractVersions() {
  return {
    runtimeCommandSurface: RUNTIME_COMMAND_SURFACE_SCHEMA_VERSION,
    projectEntryCapability: PROJECT_ENTRY_CAPABILITY_SCHEMA_VERSION,
    workspaceIntelligenceArchitecture: WORKSPACE_INTELLIGENCE_ARCHITECTURE_SCHEMA_VERSION,
    workspaceIntelligenceChain: WORKSPACE_INTELLIGENCE_CHAIN_SCHEMA_VERSION,
    workspaceIntelligenceArtifacts: WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMAS,
    cliLogEvent: CLI_LOG_EVENT_SCHEMA_VERSION,
    freshnessMetadata: FRESHNESS_METADATA_SCHEMA_VERSION,
    factFreshness: FACT_FRESHNESS_SCHEMA_VERSION,
    blockerResolution: BLOCKER_RESOLUTION_SCHEMA_VERSION,
    workspaceModel: WORKSPACE_MODEL_SCHEMA_VERSION,
    workspaceImpact: WORKSPACE_IMPACT_SCHEMA_VERSION,
    workspaceVerify: WORKSPACE_VERIFY_SCHEMA_VERSION,
    workspaceContext: WORKSPACE_CONTEXT_SCHEMA_VERSION,
    workspaceDependencyGraph: WORKSPACE_DEPENDENCY_GRAPH_SCHEMA_VERSION,
    workspaceIntelligenceHistory: WORKSPACE_HISTORY_SCHEMA_VERSION,
    agentCustomizationPackCapabilities: AGENT_CUSTOMIZATION_PACK_SCHEMA_VERSION,
    agentCustomizationPackReport: WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMAS.agentCustomizationPack,
    agentReportsIndex: WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMAS.agentIndex,
    workspaceOperationalSkill: WORKSPACE_OPERATIONAL_SKILL_SCHEMA_VERSION,
    workspaceSkillsIndex: WORKSPACE_SKILLS_INDEX_SCHEMA_VERSION,
    workspaceExplain: WORKSPACE_EXPLAIN_SCHEMA_VERSION,
    agentActionOutcome: AGENT_ACTION_OUTCOME_SCHEMA_VERSION,
    doctorRemediationPlan: DOCTOR_REMEDIATION_PLAN_SCHEMA_VERSION,
    artifactRemediationPlan: ARTIFACT_REMEDIATION_PLAN_SCHEMA_VERSION,
    doctorFixResult: DOCTOR_FIX_RESULT_SCHEMA_VERSION,
  };
}

export type PublishedContractVersions = ReturnType<typeof getPublishedContractVersions>;
