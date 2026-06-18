export const RAPIDKIT_AGENT_GROUNDING_START = '<!-- RAPIDKIT:AGENT-GROUNDING:START -->';
export const RAPIDKIT_AGENT_GROUNDING_END = '<!-- RAPIDKIT:AGENT-GROUNDING:END -->';

const MANAGED_BLOCK_PATTERN = new RegExp(
  `${escapeRegExp(RAPIDKIT_AGENT_GROUNDING_START)}[\\s\\S]*?${escapeRegExp(RAPIDKIT_AGENT_GROUNDING_END)}`,
  'm'
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function upsertManagedAgentSection(
  existing: string | null | undefined,
  generated: string
): string {
  const block = `${RAPIDKIT_AGENT_GROUNDING_START}\n${generated.trim()}\n${RAPIDKIT_AGENT_GROUNDING_END}`;
  const trimmedExisting = typeof existing === 'string' ? existing.trimEnd() : '';

  if (!trimmedExisting) {
    return `${block}\n`;
  }

  if (MANAGED_BLOCK_PATTERN.test(trimmedExisting)) {
    return `${trimmedExisting.replace(MANAGED_BLOCK_PATTERN, block).trimEnd()}\n`;
  }

  return `${trimmedExisting}\n\n${block}\n`;
}

export function extractManagedAgentSection(content: string | null | undefined): string | null {
  if (!content) {
    return null;
  }
  const match = content.match(MANAGED_BLOCK_PATTERN);
  if (!match) {
    return null;
  }
  return match[0]
    .replace(RAPIDKIT_AGENT_GROUNDING_START, '')
    .replace(RAPIDKIT_AGENT_GROUNDING_END, '')
    .trim();
}
