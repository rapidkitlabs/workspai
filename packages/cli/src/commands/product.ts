import { Command } from 'commander';
import chalk from 'chalk';
import crypto from 'crypto';
import path from 'path';
import fsExtra from 'fs-extra';
import { assertJsonSchemaContract } from '../utils/json-schema-contract.js';

export const PRODUCT_PLAN_SCHEMA_VERSION = 'rapidkit.product-factory-plan.v1' as const;
export const PRODUCT_MANIFEST_SCHEMA_VERSION = 'rapidkit.private-product-manifest.v1' as const;

function readRawFlagValue(flag: string): string | undefined {
  const argv = process.argv;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === flag) {
      const value = argv[index + 1];
      return value && !value.startsWith('-') ? value : undefined;
    }
    if (token.startsWith(`${flag}=`)) return token.slice(flag.length + 1);
  }
  return undefined;
}

type BacklogProduct = {
  rank?: unknown;
  slug?: unknown;
  title?: unknown;
  category?: unknown;
  tier?: unknown;
  summary?: unknown;
  modules?: unknown;
  moduleGaps?: unknown;
};

type BacklogPayload = {
  schemaVersion?: unknown;
  purpose?: unknown;
  source?: unknown;
  publicationRule?: unknown;
  products?: unknown;
};

export interface ProductPlanItem {
  rank: number;
  slug: string;
  title: string;
  category: string;
  tier: string;
  summary: string;
  modules: string[];
  moduleGaps: string[];
  recommendedKit: string;
  workspaceProfile: 'enterprise';
  readiness: {
    status: 'ready-for-private-manifest' | 'blocked-by-module-gaps';
    blockingGaps: string[];
  };
}

export interface ProductFactoryPlan {
  schemaVersion: typeof PRODUCT_PLAN_SCHEMA_VERSION;
  generatedAt: string;
  source: {
    backlogPath: string;
    backlogSchemaVersion: string | null;
    purpose: string | null;
    publicationRule: string | null;
  };
  defaults: {
    kit: string;
    workspaceProfile: 'enterprise';
    projectSlug: 'api';
  };
  stats: {
    totalProducts: number;
    plannedProducts: number;
    readyProducts: number;
    blockedProducts: number;
    uniqueModules: number;
    knownModuleGaps: number;
  };
  products: ProductPlanItem[];
}

export interface PrivateProductManifest {
  schemaVersion: typeof PRODUCT_MANIFEST_SCHEMA_VERSION;
  generatedAt: string;
  product: {
    rank: number;
    slug: string;
    title: string;
    category: string;
    tier: string;
    summary: string;
  };
  workspace: {
    name: string;
    profile: 'enterprise';
    outputHint: string;
  };
  projects: [
    {
      slug: 'api';
      kit: string;
      runtime: 'python';
      framework: 'fastapi';
      modules: string[];
      moduleGaps: string[];
    },
  ];
  factory: {
    sourceBacklogPath: string;
    manifestChecksum: string;
    requiredCommands: string[];
    releaseEvidencePath: string;
  };
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ];
}

function assertValidSlug(slug: string): void {
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slug)) {
    throw new Error(`Invalid product slug "${slug}". Use lowercase letters, numbers, and hyphens.`);
  }
}

function normalizeProduct(raw: BacklogProduct, index: number, defaultKit: string): ProductPlanItem {
  const slug = asString(raw.slug);
  if (!slug) {
    throw new Error(`Backlog product at index ${index} is missing slug.`);
  }
  assertValidSlug(slug);

  const modules = asStringArray(raw.modules);
  const moduleGaps = asStringArray(raw.moduleGaps);

  return {
    rank: asNumber(raw.rank, index + 1),
    slug,
    title: asString(raw.title, slug),
    category: asString(raw.category, 'Uncategorized'),
    tier: asString(raw.tier, 'pro'),
    summary: asString(raw.summary),
    modules,
    moduleGaps,
    recommendedKit: defaultKit,
    workspaceProfile: 'enterprise',
    readiness: {
      status: moduleGaps.length > 0 ? 'blocked-by-module-gaps' : 'ready-for-private-manifest',
      blockingGaps: moduleGaps,
    },
  };
}

function parseBacklogPayload(payload: unknown): BacklogPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Backlog must be a JSON object.');
  }
  return payload as BacklogPayload;
}

async function readBacklog(backlogPath: string): Promise<{
  absolutePath: string;
  payload: BacklogPayload;
}> {
  const absolutePath = path.resolve(process.cwd(), backlogPath);
  const payload = parseBacklogPayload(await fsExtra.readJson(absolutePath));
  if (!Array.isArray(payload.products)) {
    throw new Error('Backlog must contain a products array.');
  }
  return { absolutePath, payload };
}

function filterProducts(
  products: ProductPlanItem[],
  filters: { tier?: string; category?: string; limit?: string }
): ProductPlanItem[] {
  let filtered = [...products];

  if (filters.tier) {
    const tier = filters.tier.toLowerCase();
    filtered = filtered.filter((product) => product.tier.toLowerCase() === tier);
  }

  if (filters.category) {
    const category = filters.category.toLowerCase();
    filtered = filtered.filter((product) => product.category.toLowerCase() === category);
  }

  if (filters.limit) {
    const parsed = Number.parseInt(filters.limit, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error('--limit must be a positive integer.');
    }
    filtered = filtered.slice(0, parsed);
  }

  return filtered;
}

export async function buildProductFactoryPlan(params: {
  backlogPath: string;
  kit?: string;
  tier?: string;
  category?: string;
  limit?: string;
  now?: Date;
}): Promise<ProductFactoryPlan> {
  const defaultKit = params.kit?.trim() || 'fastapi.standard';
  const { absolutePath, payload } = await readBacklog(params.backlogPath);
  const rawProducts = payload.products as BacklogProduct[];
  const normalized = rawProducts.map((product, index) =>
    normalizeProduct(product, index, defaultKit)
  );
  const products = filterProducts(normalized, params);
  const uniqueModules = new Set(products.flatMap((product) => product.modules));
  const allModuleGaps = products.flatMap((product) => product.moduleGaps);
  const readyProducts = products.filter(
    (product) => product.readiness.status === 'ready-for-private-manifest'
  ).length;

  return {
    schemaVersion: PRODUCT_PLAN_SCHEMA_VERSION,
    generatedAt: (params.now ?? new Date()).toISOString(),
    source: {
      backlogPath: absolutePath,
      backlogSchemaVersion: asNullableString(payload.schemaVersion),
      purpose: asNullableString(payload.purpose),
      publicationRule: asNullableString(payload.publicationRule),
    },
    defaults: {
      kit: defaultKit,
      workspaceProfile: 'enterprise',
      projectSlug: 'api',
    },
    stats: {
      totalProducts: rawProducts.length,
      plannedProducts: products.length,
      readyProducts,
      blockedProducts: products.length - readyProducts,
      uniqueModules: uniqueModules.size,
      knownModuleGaps: allModuleGaps.length,
    },
    products,
  };
}

function stableJson(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

function checksumPayload(payload: unknown): string {
  return `sha256:${crypto.createHash('sha256').update(stableJson(payload)).digest('hex')}`;
}

function toManifestPath(value: string): string {
  return value.replace(/\\/g, '/');
}

export async function buildPrivateProductManifest(params: {
  backlogPath: string;
  slug: string;
  kit?: string;
  outputRoot?: string;
  now?: Date;
}): Promise<PrivateProductManifest> {
  const plan = await buildProductFactoryPlan({
    backlogPath: params.backlogPath,
    kit: params.kit,
    now: params.now,
  });
  const product = plan.products.find((item) => item.slug === params.slug);
  if (!product) {
    throw new Error(`Product "${params.slug}" was not found in backlog.`);
  }

  const outputRoot = params.outputRoot || '../workspai-examples-pro';
  const manifestWithoutChecksum: PrivateProductManifest = {
    schemaVersion: PRODUCT_MANIFEST_SCHEMA_VERSION,
    generatedAt: plan.generatedAt,
    product: {
      rank: product.rank,
      slug: product.slug,
      title: product.title,
      category: product.category,
      tier: product.tier,
      summary: product.summary,
    },
    workspace: {
      name: product.slug,
      profile: 'enterprise' as const,
      outputHint: toManifestPath(path.join(outputRoot, product.slug)),
    },
    projects: [
      {
        slug: 'api' as const,
        kit: product.recommendedKit,
        runtime: 'python' as const,
        framework: 'fastapi' as const,
        modules: product.modules,
        moduleGaps: product.moduleGaps,
      },
    ],
    factory: {
      sourceBacklogPath: plan.source.backlogPath,
      manifestChecksum: '',
      requiredCommands: [
        `npx workspai create workspace ${product.slug} --yes --profile enterprise`,
        `npx workspai create project ${product.recommendedKit} api --yes --skip-install`,
        'npx workspai init',
        'npx workspai workspace run test --strict --json',
        'npx workspai readiness --strict --json',
      ],
      releaseEvidencePath: `.workspai/product-factory/${product.slug}/release-evidence.json`,
    },
  };

  return {
    ...manifestWithoutChecksum,
    factory: {
      ...manifestWithoutChecksum.factory,
      manifestChecksum: checksumPayload({
        ...manifestWithoutChecksum,
        factory: { ...manifestWithoutChecksum.factory, manifestChecksum: '' },
      }),
    },
  };
}

async function writeJsonFile(filePath: string, payload: unknown, force = false): Promise<void> {
  const absolutePath = path.resolve(process.cwd(), filePath);
  if (!force && (await fsExtra.pathExists(absolutePath))) {
    throw new Error(`Refusing to overwrite existing file: ${absolutePath}. Use --force.`);
  }
  await fsExtra.ensureDir(path.dirname(absolutePath));
  await fsExtra.writeFile(absolutePath, `${stableJson(payload)}\n`, 'utf-8');
}

function resolveManifestOutputPath(output: string | undefined, slug: string): string {
  const defaultPath = path.join(
    '.workspai',
    'product-factory',
    'manifests',
    `${slug}.manifest.json`
  );
  if (!output) return defaultPath;
  if (output.endsWith('.json')) return output;
  return path.join(output, `${slug}.manifest.json`);
}

function printPlanSummary(plan: ProductFactoryPlan, output?: string): void {
  console.log(chalk.bold('\nWorkspai Product Factory Plan\n'));
  console.log(chalk.cyan('Products:'), chalk.white(String(plan.stats.plannedProducts)));
  console.log(chalk.cyan('Ready:'), chalk.green(String(plan.stats.readyProducts)));
  console.log(chalk.cyan('Blocked:'), chalk.yellow(String(plan.stats.blockedProducts)));
  console.log(chalk.cyan('Unique modules:'), chalk.white(String(plan.stats.uniqueModules)));
  console.log(chalk.cyan('Known gaps:'), chalk.yellow(String(plan.stats.knownModuleGaps)));
  if (output) {
    console.log(chalk.gray(`\nWrote plan: ${path.resolve(process.cwd(), output)}`));
  }
  console.log(
    chalk.gray('\nNext: npx workspai product manifest create <slug> --from-backlog <file>\n')
  );
}

function printManifestSummary(manifest: PrivateProductManifest, output: string): void {
  console.log(chalk.bold('\nWorkspai Private Product Manifest\n'));
  console.log(chalk.cyan('Product:'), chalk.white(manifest.product.slug));
  console.log(chalk.cyan('Kit:'), chalk.white(manifest.projects[0].kit));
  console.log(chalk.cyan('Modules:'), chalk.white(String(manifest.projects[0].modules.length)));
  console.log(
    chalk.cyan('Module gaps:'),
    chalk.yellow(String(manifest.projects[0].moduleGaps.length))
  );
  console.log(chalk.cyan('Checksum:'), chalk.white(manifest.factory.manifestChecksum));
  console.log(chalk.gray(`\nWrote manifest: ${path.resolve(process.cwd(), output)}\n`));
}

export function registerProductCommands(program: Command): void {
  const product = program
    .command('product', { hidden: true })
    .description('Product Factory commands for private workspace product manifests');

  product
    .command('plan <backlog>')
    .description('Build a deterministic Product Factory plan from a workspace backlog JSON')
    .option('--output <file>', 'Write plan JSON to file')
    .option('--kit <kit>', 'Default API kit for generated product manifests', 'fastapi.standard')
    .option('--tier <tier>', 'Filter products by tier')
    .option('--category <category>', 'Filter products by category')
    .option('--limit <count>', 'Limit planned products')
    .option('--json', 'Print JSON to stdout')
    .action(async (backlog: string, options) => {
      try {
        const output = options.output || readRawFlagValue('--output');
        const plan = await buildProductFactoryPlan({
          backlogPath: backlog,
          kit: options.kit,
          tier: options.tier,
          category: options.category,
          limit: options.limit,
        });
        assertJsonSchemaContract(
          plan,
          'contracts/product-factory-plan.v1.json',
          'Product Factory plan'
        );
        if (output) {
          await writeJsonFile(output, plan, true);
        }
        if (options.json) {
          console.log(stableJson(plan));
        } else {
          printPlanSummary(plan, output);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
          console.log(stableJson({ ok: false, error: { message } }));
        } else {
          console.error(chalk.red(`Product plan failed: ${message}`));
        }
        process.exit(1);
      }
    });

  product
    .command('manifest')
    .description('Create or inspect private product manifests')
    .command('create <slug>')
    .description('Create a private product manifest from a backlog product slug')
    .requiredOption('--from-backlog <file>', 'Source workspace backlog JSON')
    .option('--output <fileOrDir>', 'Manifest output file or directory')
    .option('--kit <kit>', 'API kit for the generated workspace product', 'fastapi.standard')
    .option('--workspace-output <dir>', 'Suggested root for generated product workspaces')
    .option('--json', 'Print JSON to stdout')
    .option('--force', 'Overwrite existing manifest file')
    .action(async (slug: string, options) => {
      try {
        const output = options.output || readRawFlagValue('--output');
        assertValidSlug(slug);
        const manifest = await buildPrivateProductManifest({
          backlogPath: options.fromBacklog,
          slug,
          kit: options.kit,
          outputRoot: options.workspaceOutput,
        });
        assertJsonSchemaContract(
          manifest,
          'contracts/private-product-manifest.v1.json',
          'Private product manifest'
        );
        const outputPath = resolveManifestOutputPath(output, slug);
        await writeJsonFile(outputPath, manifest, options.force === true);
        if (options.json) {
          console.log(stableJson(manifest));
        } else {
          printManifestSummary(manifest, outputPath);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
          console.log(stableJson({ ok: false, error: { message } }));
        } else {
          console.error(chalk.red(`Product manifest create failed: ${message}`));
        }
        process.exit(1);
      }
    });
}
