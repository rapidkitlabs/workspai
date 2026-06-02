import { Command } from 'commander';
import fsExtra from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildPrivateProductManifest,
  buildProductFactoryPlan,
  registerProductCommands,
} from '../../commands/product.js';

const tempDirs: string[] = [];
const fixedNow = new Date('2026-06-02T12:00:00.000Z');

async function createBacklog(): Promise<{ dir: string; backlogPath: string }> {
  const dir = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-product-command-'));
  tempDirs.push(dir);
  const backlogPath = path.join(dir, 'backlog.json');
  await fsExtra.writeJson(
    backlogPath,
    {
      schemaVersion: 'rapidkit.workspace-backlog.v1',
      purpose: 'Suggestion library only.',
      publicationRule: 'Import one workspace at a time.',
      products: [
        {
          rank: 1,
          slug: 'rapidkit-ai-support-agent',
          title: 'AI Support Agent Workspace',
          category: 'AI Agents',
          tier: 'pro',
          summary: 'AI customer support automation platform.',
          modules: ['settings', 'logging', 'auth_core', 'support_center'],
          moduleGaps: [],
        },
        {
          rank: 2,
          slug: 'rapidkit-ai-sdr-agent',
          title: 'AI SDR Agent Workspace',
          category: 'AI Agents',
          tier: 'pro',
          summary: 'AI sales outreach and CRM orchestration.',
          modules: ['settings', 'logging', 'auth_core'],
          moduleGaps: ['crm_core', 'sales_outreach'],
        },
      ],
    },
    { spaces: 2 }
  );
  return { dir, backlogPath };
}

describe('product command', () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) await fsExtra.remove(dir);
    }
  });

  it('builds a deterministic Product Factory plan from backlog products', async () => {
    const { backlogPath } = await createBacklog();

    const plan = await buildProductFactoryPlan({
      backlogPath,
      kit: 'fastapi.standard',
      now: fixedNow,
    });

    expect(plan).toMatchObject({
      schemaVersion: 'rapidkit.product-factory-plan.v1',
      generatedAt: '2026-06-02T12:00:00.000Z',
      stats: {
        totalProducts: 2,
        plannedProducts: 2,
        readyProducts: 1,
        blockedProducts: 1,
        uniqueModules: 4,
        knownModuleGaps: 2,
      },
    });
    expect(plan.products[0]).toMatchObject({
      slug: 'rapidkit-ai-support-agent',
      recommendedKit: 'fastapi.standard',
      readiness: { status: 'ready-for-private-manifest' },
    });
    expect(plan.products[1].readiness.blockingGaps).toEqual(['crm_core', 'sales_outreach']);
  });

  it('creates a private manifest with workspace, module, command, and checksum metadata', async () => {
    const { backlogPath } = await createBacklog();

    const manifest = await buildPrivateProductManifest({
      backlogPath,
      slug: 'rapidkit-ai-support-agent',
      now: fixedNow,
    });

    expect(manifest).toMatchObject({
      schemaVersion: 'rapidkit.private-product-manifest.v1',
      generatedAt: '2026-06-02T12:00:00.000Z',
      product: {
        slug: 'rapidkit-ai-support-agent',
        title: 'AI Support Agent Workspace',
      },
      workspace: {
        name: 'rapidkit-ai-support-agent',
        profile: 'enterprise',
      },
      projects: [
        {
          slug: 'api',
          kit: 'fastapi.standard',
          runtime: 'python',
          framework: 'fastapi',
          modules: ['settings', 'logging', 'auth_core', 'support_center'],
          moduleGaps: [],
        },
      ],
    });
    expect(manifest.factory.manifestChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(manifest.factory.requiredCommands).toContain(
      'npx rapidkit create workspace rapidkit-ai-support-agent --yes --profile enterprise'
    );
  });

  it('writes plan and manifest files through commander actions', async () => {
    const { dir, backlogPath } = await createBacklog();
    process.chdir(dir);
    const program = new Command();
    registerProductCommands(program);

    await program.parseAsync([
      'node',
      'rapidkit',
      'product',
      'plan',
      backlogPath,
      '--output',
      'factory-plan.json',
    ]);
    await program.parseAsync([
      'node',
      'rapidkit',
      'product',
      'manifest',
      'create',
      'rapidkit-ai-support-agent',
      '--from-backlog',
      backlogPath,
      '--output',
      'manifests',
    ]);

    await expect(fsExtra.pathExists(path.join(dir, 'factory-plan.json'))).resolves.toBe(true);
    await expect(
      fsExtra.pathExists(path.join(dir, 'manifests', 'rapidkit-ai-support-agent.manifest.json'))
    ).resolves.toBe(true);
  });
});
