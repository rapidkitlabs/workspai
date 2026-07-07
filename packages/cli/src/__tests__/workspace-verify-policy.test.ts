import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildWorkspaceVerify } from '../workspace-verify.js';

let workspacePath: string;

beforeEach(async () => {
  workspacePath = await mkdtemp(path.join(tmpdir(), 'rk-policy-'));
  await mkdir(path.join(workspacePath, '.rapidkit', 'reports'), { recursive: true });
});

afterEach(async () => {
  await rm(workspacePath, { recursive: true, force: true });
});

describe('workspace verify policy violations (1.20)', () => {
  it('surfaces contract violations from evidence in the JSON output', async () => {
    await writeFile(
      path.join(workspacePath, '.rapidkit', 'reports', 'workspace-contract-verify-last-run.json'),
      JSON.stringify({
        status: 'failed',
        violations: ['Port 3000 is claimed by both web and api.', 'Duplicate project slug: api.'],
      }),
      'utf8'
    );

    const verify = await buildWorkspaceVerify({ workspacePath });

    const contractViolations = verify.policyViolations.filter((v) => v.source === 'contract');
    expect(contractViolations.length).toBe(2);
    expect(contractViolations.every((v) => v.code === 'contract.violation')).toBe(true);
    expect(contractViolations.map((v) => v.message)).toContain('Duplicate project slug: api.');
    // Deterministic ordering.
    expect(verify.policyViolations).toEqual(
      [...verify.policyViolations].sort((a, b) =>
        a.source !== b.source
          ? a.source.localeCompare(b.source)
          : a.code !== b.code
            ? a.code.localeCompare(b.code)
            : a.message.localeCompare(b.message)
      )
    );
  });

  it('reports an empty list and a policy mode when there are no violations', async () => {
    const verify = await buildWorkspaceVerify({ workspacePath });
    expect(Array.isArray(verify.policyViolations)).toBe(true);
    expect(typeof verify.policyMode).toBe('string');
  });
});
