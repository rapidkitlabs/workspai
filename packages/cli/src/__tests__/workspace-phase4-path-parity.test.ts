import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import { buildAgentCustomizationPackContract } from '../contracts/agent-customization-pack-contract.js';
import {
  WORKSPAI_SKILLS_DIR,
  WORKSPACE_EXPLAIN_REPORT_PATH,
  WORKSPACE_TRACE_REPORT_PATH,
  WORKSPACE_WHY_REPORT_PATH,
  WORKSPACE_SKILLS_INDEX_PATH,
  operationalSkillPath,
} from '../contracts/workspace-artifact-paths.js';
import { AGENT_REPORT_CATALOG } from '../workspace-agent-sync.js';

describe('Phase 4 path registry parity (4.0.3)', () => {
  it('aligns artifact path constants with agent customization pack contract', () => {
    const pack = buildAgentCustomizationPackContract();

    expect(pack.pathLayers.l1CanonicalRoots).toEqual(
      expect.arrayContaining([`.workspai/reports/`, `${WORKSPAI_SKILLS_DIR}/`])
    );
    expect(pack.outputKinds).toEqual(
      expect.arrayContaining(['operational-skill', 'skills-index', 'explain-report'])
    );
    expect(pack.presets.enterprise.requiredOutputs).toContain(WORKSPACE_SKILLS_INDEX_PATH);

    const catalogPaths = AGENT_REPORT_CATALOG.map((entry) => entry.relativePath);
    expect(catalogPaths).toContain(WORKSPACE_SKILLS_INDEX_PATH);
    for (const report of pack.requiredReports) {
      expect(catalogPaths).toContain(report.path);
    }
  });

  it('matches committed agent-customization-pack.v1.json path layers', () => {
    const onDisk = JSON.parse(
      fs.readFileSync(
        path.resolve(process.cwd(), 'contracts/agent-customization-pack.v1.json'),
        'utf8'
      )
    ) as ReturnType<typeof buildAgentCustomizationPackContract>;

    expect(onDisk.pathLayers).toEqual(buildAgentCustomizationPackContract().pathLayers);
    expect(onDisk.outputKinds).toEqual(
      expect.arrayContaining(['operational-skill', 'skills-index'])
    );
  });

  it('derives operational skill paths from skill ids', () => {
    expect(operationalSkillPath('workspai-release-readiness')).toBe(
      `${WORKSPAI_SKILLS_DIR}/workspai-release-readiness.md`
    );
    expect(WORKSPACE_EXPLAIN_REPORT_PATH).toBe('.workspai/reports/workspace-explain-last-run.json');
    expect(WORKSPACE_WHY_REPORT_PATH).toBe('.workspai/reports/workspace-why-last-run.json');
    expect(WORKSPACE_TRACE_REPORT_PATH).toBe('.workspai/reports/workspace-trace-last-run.json');
  });
});
