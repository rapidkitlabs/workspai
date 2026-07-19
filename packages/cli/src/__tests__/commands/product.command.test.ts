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
import { assertJsonSchemaContract } from '../../utils/json-schema-contract.js';

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

async function writeBacklog(payload: unknown): Promise<{ dir: string; backlogPath: string }> {
  const dir = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-product-boundary-'));
  tempDirs.push(dir);
  const backlogPath = path.join(dir, 'backlog.json');
  await fsExtra.writeJson(backlogPath, payload);
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
    expect(() =>
      assertJsonSchemaContract(plan, 'contracts/product-factory-plan.v1.json', 'test plan')
    ).not.toThrow();
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
        outputHint: '../workspai-examples-pro/rapidkit-ai-support-agent',
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
      'npx workspai create workspace rapidkit-ai-support-agent --yes --profile enterprise'
    );
    expect(() =>
      assertJsonSchemaContract(
        manifest,
        'contracts/private-product-manifest.v1.json',
        'test manifest'
      )
    ).not.toThrow();
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

  it('normalizes malformed optional fields and deduplicates module lists', async () => {
    const { backlogPath } = await writeBacklog({
      schemaVersion: 1,
      purpose: '   ',
      products: [
        {
          slug: 'a',
          rank: Number.NaN,
          title: '',
          category: null,
          tier: false,
          modules: [' auth ', 'auth', '', 1],
          moduleGaps: 'not-an-array',
        },
      ],
    });
    const plan = await buildProductFactoryPlan({ backlogPath, kit: '  ', now: fixedNow });

    expect(plan.source).toMatchObject({
      backlogSchemaVersion: null,
      purpose: null,
      publicationRule: null,
    });
    expect(plan.defaults.kit).toBe('fastapi.standard');
    expect(plan.products[0]).toMatchObject({
      rank: 1,
      slug: 'a',
      title: 'a',
      category: 'Uncategorized',
      tier: 'pro',
      modules: ['auth'],
      moduleGaps: [],
      readiness: { status: 'ready-for-private-manifest' },
    });
  });

  it('filters case-insensitively by tier and category and applies a positive limit', async () => {
    const { backlogPath } = await createBacklog();
    const filtered = await buildProductFactoryPlan({
      backlogPath,
      tier: 'PRO',
      category: 'ai agents',
      limit: '1',
      now: fixedNow,
    });
    expect(filtered.products.map((product) => product.slug)).toEqual(['rapidkit-ai-support-agent']);
    expect(filtered.stats).toMatchObject({
      totalProducts: 2,
      plannedProducts: 1,
      readyProducts: 1,
    });

    await expect(buildProductFactoryPlan({ backlogPath, limit: '0' })).rejects.toThrow(
      '--limit must be a positive integer.'
    );
    await expect(buildProductFactoryPlan({ backlogPath, limit: 'abc' })).rejects.toThrow(
      '--limit must be a positive integer.'
    );
  });

  it('rejects malformed backlog envelopes and invalid or missing product slugs', async () => {
    for (const payload of [null, [], 'invalid']) {
      const { backlogPath } = await writeBacklog(payload);
      await expect(buildProductFactoryPlan({ backlogPath })).rejects.toThrow(
        'Backlog must be a JSON object.'
      );
    }
    const missingProducts = await writeBacklog({ purpose: 'missing products' });
    await expect(
      buildProductFactoryPlan({ backlogPath: missingProducts.backlogPath })
    ).rejects.toThrow('Backlog must contain a products array.');
    const missingSlug = await writeBacklog({ products: [{}] });
    await expect(buildProductFactoryPlan({ backlogPath: missingSlug.backlogPath })).rejects.toThrow(
      'Backlog product at index 0 is missing slug.'
    );
    const invalidSlug = await writeBacklog({ products: [{ slug: 'Invalid Slug' }] });
    await expect(buildProductFactoryPlan({ backlogPath: invalidSlug.backlogPath })).rejects.toThrow(
      'Invalid product slug'
    );
  });

  it('rejects unknown manifest products and honors custom kit and workspace output', async () => {
    const { backlogPath } = await createBacklog();
    await expect(buildPrivateProductManifest({ backlogPath, slug: 'missing' })).rejects.toThrow(
      'Product "missing" was not found in backlog.'
    );
    const manifest = await buildPrivateProductManifest({
      backlogPath,
      slug: 'rapidkit-ai-support-agent',
      kit: 'fastapi.clean',
      outputRoot: 'private\\products',
      now: fixedNow,
    });
    expect(manifest.projects[0].kit).toBe('fastapi.clean');
    expect(manifest.workspace.outputHint).toBe('private/products/rapidkit-ai-support-agent');
  });

  it('covers JSON output, default manifest path, file output, overwrite refusal, and force', async () => {
    const { dir, backlogPath } = await createBacklog();
    process.chdir(dir);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    const planProgram = new Command();
    registerProductCommands(planProgram);
    await planProgram.parseAsync(['node', 'rapidkit', 'product', 'plan', backlogPath, '--json']);

    const defaultProgram = new Command();
    registerProductCommands(defaultProgram);
    await defaultProgram.parseAsync([
      'node',
      'rapidkit',
      'product',
      'manifest',
      'create',
      'rapidkit-ai-support-agent',
      '--from-backlog',
      backlogPath,
      '--json',
    ]);
    const defaultManifest = path.join(
      dir,
      '.workspai',
      'product-factory',
      'manifests',
      'rapidkit-ai-support-agent.manifest.json'
    );
    await expect(fsExtra.pathExists(defaultManifest)).resolves.toBe(true);

    const fileProgram = new Command();
    registerProductCommands(fileProgram);
    await fileProgram.parseAsync([
      'node',
      'rapidkit',
      'product',
      'manifest',
      'create',
      'rapidkit-ai-support-agent',
      '--from-backlog',
      backlogPath,
      '--output',
      'single.json',
    ]);
    await expect(fsExtra.pathExists(path.join(dir, 'single.json'))).resolves.toBe(true);

    const duplicateProgram = new Command();
    registerProductCommands(duplicateProgram);
    await duplicateProgram.parseAsync([
      'node',
      'rapidkit',
      'product',
      'manifest',
      'create',
      'rapidkit-ai-support-agent',
      '--from-backlog',
      backlogPath,
      '--output',
      'single.json',
      '--json',
    ]);
    expect(exitSpy).toHaveBeenCalledWith(1);

    const forceProgram = new Command();
    registerProductCommands(forceProgram);
    await forceProgram.parseAsync([
      'node',
      'rapidkit',
      'product',
      'manifest',
      'create',
      'rapidkit-ai-support-agent',
      '--from-backlog',
      backlogPath,
      '--output',
      'single.json',
      '--force',
    ]);
  });

  it('reports plan and manifest command failures in JSON and human modes', async () => {
    const { backlogPath } = await createBacklog();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    const jsonPlan = new Command();
    registerProductCommands(jsonPlan);
    await jsonPlan.parseAsync([
      'node',
      'rapidkit',
      'product',
      'plan',
      backlogPath,
      '--limit',
      '0',
      '--json',
    ]);

    const humanManifest = new Command();
    registerProductCommands(humanManifest);
    await humanManifest.parseAsync([
      'node',
      'rapidkit',
      'product',
      'manifest',
      'create',
      'Invalid',
      '--from-backlog',
      backlogPath,
    ]);
    expect(exitSpy).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Product manifest create failed')
    );
  });
});
