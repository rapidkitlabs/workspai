import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import fsExtra from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKSPACE_SKILLS_INDEX_PATH } from '../contracts/workspace-artifact-paths.js';
import { WORKSPACE_SKILLS_INDEX_SCHEMA_VERSION } from '../contracts/workspace-skills-index-contract.js';
import {
  BUILTIN_OPERATIONAL_SKILL_IDS,
  buildWorkspaceOperationalSkills,
  writeWorkspaceOperationalSkills,
} from '../workspace-operational-skills.js';
import { buildWorkspaceModel } from '../workspace-model.js';

let workspacePath: string;

beforeEach(async () => {
  workspacePath = await mkdtemp(path.join(tmpdir(), 'rk-op-skills-'));
  await fsExtra.outputJson(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
    workspace_name: 'skills-lab',
  });
});

afterEach(async () => {
  await rm(workspacePath, { recursive: true, force: true });
});

describe('workspace operational skills (Phase 4.A)', () => {
  it('builds all builtin skills with rapidkit-* ids and canonical paths', async () => {
    const model = await buildWorkspaceModel({ workspacePath, includeEvidence: false });
    const skills = buildWorkspaceOperationalSkills({ workspacePath, model });

    expect(skills).toHaveLength(BUILTIN_OPERATIONAL_SKILL_IDS.length);
    for (const skill of skills) {
      expect(skill.skillId).toMatch(/^workspai-/);
      expect(skill.canonicalPath).toBe(`.workspai/skills/${skill.skillId}.md`);
      expect(skill.markdown).toContain('## Answer contract');
    }
  });

  it('writes skills and index on agent-sync path', async () => {
    const model = await buildWorkspaceModel({ workspacePath, includeEvidence: false });
    const skills = buildWorkspaceOperationalSkills({ workspacePath, model });
    const result = await writeWorkspaceOperationalSkills({
      workspacePath,
      skills,
      generatedAt: new Date().toISOString(),
      write: true,
    });

    expect(result.writtenPaths).toContain(WORKSPACE_SKILLS_INDEX_PATH);
    for (const skill of skills) {
      expect(result.writtenPaths).toContain(skill.canonicalPath);
      const absolute = path.join(workspacePath, skill.canonicalPath);
      expect(await fsExtra.pathExists(absolute)).toBe(true);
    }

    const index = await fsExtra.readJson(path.join(workspacePath, WORKSPACE_SKILLS_INDEX_PATH));
    expect(index.schemaVersion).toBe(WORKSPACE_SKILLS_INDEX_SCHEMA_VERSION);
    expect(index.skills).toHaveLength(BUILTIN_OPERATIONAL_SKILL_IDS.length);
  });

  it('produces deterministic skill hashes for identical inputs (4.24)', async () => {
    const model = await buildWorkspaceModel({ workspacePath, includeEvidence: false });
    const generatedAt = new Date('2026-06-01T00:00:00.000Z');
    const input = { workspacePath, model, generatedAt };
    const first = buildWorkspaceOperationalSkills(input);
    const second = buildWorkspaceOperationalSkills(input);
    expect(first.map((skill) => skill.markdown)).toEqual(second.map((skill) => skill.markdown));
    expect(first.map((skill) => skill.skillId)).toEqual(second.map((skill) => skill.skillId));
  });
});
