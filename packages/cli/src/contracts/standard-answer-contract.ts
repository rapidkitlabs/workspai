/** Shared answer sections for agents, operational skills, and explain output (1.ACP.7). */
export const STANDARD_ANSWER_CONTRACT_SECTIONS = [
  'Scope',
  'Evidence',
  'Diagnosis',
  'Fix Plan',
  'Run',
  'Verify',
  'Assumptions',
] as const;

export type StandardAnswerContractSection = (typeof STANDARD_ANSWER_CONTRACT_SECTIONS)[number];
