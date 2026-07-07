import { describe, it, expect } from 'vitest';
import {
  BOOTSTRAP_CORE_COMMANDS,
  BOOTSTRAP_CORE_COMMANDS_SET,
} from '../core-bridge/bootstrapCoreCommands';

describe('bootstrapCoreCommands', () => {
  it('exports a non-empty ordered list of commands', () => {
    expect(Array.isArray(BOOTSTRAP_CORE_COMMANDS)).toBe(true);
    expect(BOOTSTRAP_CORE_COMMANDS.length).toBeGreaterThan(0);
  });

  it('contains only unique commands', () => {
    const unique = new Set(BOOTSTRAP_CORE_COMMANDS);
    expect(unique.size).toBe(BOOTSTRAP_CORE_COMMANDS.length);
  });

  it('BOOTSTRAP_CORE_COMMANDS_SET matches array contents', () => {
    for (const cmd of BOOTSTRAP_CORE_COMMANDS) {
      expect(BOOTSTRAP_CORE_COMMANDS_SET.has(cmd)).toBe(true);
    }
  });

  it('does not expose internal or paid commands', () => {
    const forbidden = ['login', 'auth', 'billing', 'payment', 'enterprise', 'internal'];

    for (const bad of forbidden) {
      expect(BOOTSTRAP_CORE_COMMANDS_SET.has(bad)).toBe(false);
    }
  });

  it('includes critical core top-level commands', () => {
    const mustHave = ['create', 'project', 'version', 'commands', 'list'];

    for (const cmd of mustHave) {
      expect(BOOTSTRAP_CORE_COMMANDS_SET.has(cmd)).toBe(true);
    }
  });
});
