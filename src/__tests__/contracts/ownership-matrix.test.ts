import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

function extractWrapperOwnedCommands(matrixText: string): string[] {
  const sectionStart = matrixText.indexOf('### 1) Wrapper-owned commands');
  const sectionEnd = matrixText.indexOf('### 2) Wrapper-orchestrated project commands');
  const section = sectionStart >= 0 ? matrixText.slice(sectionStart, sectionEnd) : '';

  const matches = [...section.matchAll(/-\s+`([^`]+)`/g)].map((match) => match[1]);
  return matches.map((command) => (command === 'shell activate' ? 'shell' : command));
}

describe('command ownership matrix drift guard', () => {
  it('documents all npm wrapper-owned top-level commands', async () => {
    const { NPM_ONLY_TOP_LEVEL_COMMANDS } = await import('../../index.js');
    const matrixPath = path.join(process.cwd(), 'docs', 'contracts', 'COMMAND_OWNERSHIP_MATRIX.md');
    const matrixText = fs.readFileSync(matrixPath, 'utf-8');

    const documented = new Set(extractWrapperOwnedCommands(matrixText));
    const expected = new Set<string>(NPM_ONLY_TOP_LEVEL_COMMANDS as readonly string[]);

    expect(documented).toEqual(expected);
  });
});
