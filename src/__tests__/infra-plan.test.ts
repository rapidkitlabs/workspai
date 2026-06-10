import fsExtra from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildInfraPlan, writeInfraArtifacts } from '../utils/infra-plan.js';
import { renderInfraComposeYaml } from '../utils/infra-compose.js';
import { discoverWorkspaceInfraNeeds } from '../utils/infra-discovery.js';
import {
  INFRA_PLAN_SCHEMA_VERSION,
  INFRA_STACK_SCHEMA_VERSION,
  loadInfraStackContract,
  resolveInfraStackContractPath,
} from '../utils/infra-stack.js';

const tempDirs: string[] = [];
const fixedNow = new Date('2026-06-09T12:00:00.000Z');

function contractPath(): string {
  return path.resolve(process.cwd(), 'contracts', 'infra-stack.v1.json');
}

async function createWorkspaceWithProject(input: {
  modules?: string[];
  envExample?: string[];
  contractEnv?: string[];
  overrides?: string[];
}): Promise<string> {
  const dir = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'rk-infra-plan-'));
  tempDirs.push(dir);

  await fsExtra.ensureDir(path.join(dir, '.rapidkit'));
  await fsExtra.writeJson(path.join(dir, '.rapidkit', 'workspace.json'), {
    workspace_name: 'saas-starter-pro',
  });

  const projectRoot = path.join(dir, 'saas-api');
  await fsExtra.ensureDir(path.join(projectRoot, '.rapidkit'));
  await fsExtra.writeJson(path.join(projectRoot, '.rapidkit', 'project.json'), {
    slug: 'saas-api',
    kit: 'fastapi.standard',
  });

  if (input.modules?.length) {
    await fsExtra.writeJson(path.join(projectRoot, 'registry.json'), {
      installed_modules: input.modules.map((slug) => ({ slug })),
    });
  }

  if (input.envExample?.length) {
    await fsExtra.writeFile(
      path.join(projectRoot, '.env.example'),
      input.envExample.map((key) => `${key}=`).join('\n'),
      'utf-8'
    );
  }

  if (input.contractEnv?.length) {
    await fsExtra.writeJson(path.join(dir, '.rapidkit', 'workspace.contract.json'), {
      projects: [
        {
          slug: 'saas-api',
          contracts: { env: input.contractEnv },
        },
      ],
    });
  }

  if (input.overrides?.length) {
    await fsExtra.writeJson(path.join(dir, '.rapidkit', 'infra', 'overrides.json'), {
      services: input.overrides,
    });
  }

  return dir;
}

describe('infra plan', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) await fsExtra.remove(dir);
    }
  });

  it('discovers postgres and redis from approval_engine module slug', async () => {
    const workspacePath = await createWorkspaceWithProject({
      modules: ['free/business/approval_engine'],
    });

    const discovery = await discoverWorkspaceInfraNeeds({
      workspacePath,
      contract: loadInfraStackContract(contractPath()),
    });

    expect(discovery.modules).toEqual(['free/business/approval_engine']);
    expect(discovery.serviceIds).toEqual(['postgres', 'redis']);
  });

  it('discovers services from env vars and contract env', async () => {
    const workspacePath = await createWorkspaceWithProject({
      envExample: ['DATABASE_URL', 'REDIS_URL'],
      contractEnv: ['CELERY_BROKER_URL'],
    });

    const plan = await buildInfraPlan({
      workspacePath,
      now: () => fixedNow,
    });

    expect(plan.schemaVersion).toBe(INFRA_PLAN_SCHEMA_VERSION);
    expect(plan.generatedAt).toBe('2026-06-09T12:00:00.000Z');
    expect(plan.services.map((service) => service.id).sort()).toEqual(['postgres', 'redis']);
    expect(plan.connectionEnv.DATABASE_URL).toContain('postgresql://');
    expect(plan.connectionEnv.REDIS_URL).toContain('redis://');
  });

  it('merges postgres defaults from project .env.example into plan connection env', async () => {
    const workspacePath = await createWorkspaceWithProject({
      modules: ['free/database/db_postgres'],
    });
    await fsExtra.writeFile(
      path.join(workspacePath, 'saas-api', '.env.example'),
      'RAPIDKIT_DB_POSTGRES_URL=${RAPIDKIT_DB_POSTGRES_URL:-postgresql://postgres:postgres@localhost:5432/app_db}\n',
      'utf-8'
    );

    const plan = await buildInfraPlan({ workspacePath, now: () => fixedNow });
    expect(plan.connectionEnv.RAPIDKIT_DB_POSTGRES_URL).toBe(
      'postgresql://postgres:postgres@localhost:5432/app_db'
    );
    expect(plan.serviceEnvOverrides?.postgres).toEqual({
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'postgres',
      POSTGRES_DB: 'app_db',
    });
  });

  it('writes compose, plan report, and env example artifacts', async () => {
    const workspacePath = await createWorkspaceWithProject({
      modules: ['free/business/approval_engine'],
    });

    const plan = await buildInfraPlan({
      workspacePath,
      now: () => fixedNow,
    });
    const artifacts = await writeInfraArtifacts({ workspacePath, plan });

    await expect(fsExtra.pathExists(artifacts.composePath)).resolves.toBe(true);
    await expect(fsExtra.pathExists(artifacts.planPath)).resolves.toBe(true);
    await expect(fsExtra.pathExists(artifacts.envExamplePath)).resolves.toBe(true);

    const compose = await fsExtra.readFile(artifacts.composePath, 'utf-8');
    expect(compose).toContain('name: rapidkit-infra');
    expect(compose).toContain('postgres:');
    expect(compose).toContain('redis:');
    expect(compose).toContain('postgres_data:/var/lib/postgresql/data');
    expect(compose).toContain('container_name: rapidkit-postgres');

    const envExample = await fsExtra.readFile(artifacts.envExamplePath, 'utf-8');
    expect(envExample).toContain('DATABASE_URL=');
    expect(envExample).toContain('REDIS_URL=');
  });

  it('renders a valid empty compose mapping when no services are planned', () => {
    const contract = loadInfraStackContract(contractPath());
    const yaml = renderInfraComposeYaml({
      plan: {
        schemaVersion: INFRA_PLAN_SCHEMA_VERSION,
        generatedAt: fixedNow.toISOString(),
        workspacePath: '/tmp/workspace',
        strategy: 'sidecar',
        composePath: '.rapidkit/infra/docker-compose.yml',
        envExamplePath: '.rapidkit/infra/.env.example',
        services: [],
        connectionEnv: {},
        sources: { modules: [], envVars: [], overrides: [] },
        warnings: ['No infrastructure services detected.'],
      },
      contract,
      workspaceName: 'demo-workspace',
    });

    expect(yaml).toContain('services: {}');
  });

  it('renders healthchecks and named volumes in compose yaml', () => {
    const contract = loadInfraStackContract(contractPath());
    const plan = {
      schemaVersion: INFRA_PLAN_SCHEMA_VERSION,
      generatedAt: fixedNow.toISOString(),
      workspacePath: '/tmp/workspace',
      strategy: 'sidecar' as const,
      composePath: '.rapidkit/infra/docker-compose.yml',
      envExamplePath: '.rapidkit/infra/.env.example',
      services: [
        {
          id: 'mongo',
          displayName: contract.services.mongo.displayName,
          category: contract.services.mongo.category,
          image: contract.services.mongo.image,
          ports: contract.services.mongo.ports,
          sources: [],
        },
      ],
      connectionEnv: contract.services.mongo.connectionEnv,
      sources: { modules: [], envVars: [], overrides: [] },
      warnings: [],
    };

    const yaml = renderInfraComposeYaml({
      plan,
      contract,
      workspaceName: 'demo-workspace',
    });

    expect(yaml).toContain('mongo_data:/data/db');
    expect(yaml).toContain('volumes:');
    expect(yaml).toContain('mongo_data:');
  });
});

describe('infra stack contract parity', () => {
  it('keeps TS schema constants aligned with contracts/infra-stack.v1.json', () => {
    const contract = loadInfraStackContract(resolveInfraStackContractPath());
    expect(contract.schemaVersion).toBe(INFRA_STACK_SCHEMA_VERSION);
    expect(Object.keys(contract.services).sort()).toEqual([
      'mailpit',
      'minio',
      'mongo',
      'mysql',
      'postgres',
      'rabbitmq',
      'redis',
    ]);
  });

  it('loads bundled contract path regardless of process cwd', () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(os.tmpdir());
      const contract = loadInfraStackContract();
      expect(contract.schemaVersion).toBe(INFRA_STACK_SCHEMA_VERSION);
      expect(resolveInfraStackContractPath()).toContain('contracts/infra-stack.v1.json');
    } finally {
      process.chdir(originalCwd);
    }
  });
});
