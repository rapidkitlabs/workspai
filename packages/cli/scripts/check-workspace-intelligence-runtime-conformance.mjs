#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const packageRoot = process.cwd();
const cliPath = path.join(packageRoot, 'dist', 'index.js');
const chainPath = path.join(packageRoot, 'contracts', 'workspace-intelligence-chain.v1.json');

function fail(message) {
  throw new Error(`[workspace-intelligence-runtime] ${message}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

if (!fs.existsSync(cliPath)) {
  fail('dist/index.js is missing; run the build before this conformance gate');
}

const contract = readJson(chainPath);
const artifactRegistry = new Map(
  contract.runtimeRegistry.artifacts.map((artifact) => [artifact.path, artifact])
);
const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-runtime-contract-'));

function writeJson(relativePath, payload) {
  const target = path.join(workspacePath, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
}

function validateArtifact(relativePath) {
  const descriptor = artifactRegistry.get(relativePath);
  if (!descriptor) fail(`produced artifact is absent from runtime registry: ${relativePath}`);
  const artifactPath = path.join(workspacePath, relativePath);
  if (!fs.existsSync(artifactPath)) fail(`declared artifact was not written: ${relativePath}`);
  if (!descriptor.schemaContract) return;

  const payload = readJson(artifactPath);
  if (payload.schemaVersion !== descriptor.schemaVersion) {
    fail(
      `${relativePath} schemaVersion is ${String(payload.schemaVersion)}, expected ${descriptor.schemaVersion}`
    );
  }
  const schema = readJson(path.join(packageRoot, descriptor.schemaContract));
  const AjvConstructor = schema.$schema?.includes('2020-12') ? Ajv2020 : Ajv;
  const ajv = new AjvConstructor({ allErrors: true, strict: true, allowUnionTypes: true });
  addFormats(ajv);
  const valid = ajv.validate(schema, payload);
  if (!valid) {
    fail(
      `${relativePath} violates ${descriptor.schemaContract}: ${ajv.errorsText(ajv.errors)}\n${JSON.stringify(ajv.errors, null, 2)}`
    );
  }
}

try {
  fs.writeFileSync(path.join(workspacePath, '.workspai-workspace'), '{}\n');
  writeJson('.workspai/workspace.json', {
    workspace_name: 'runtime-contract-fixture',
    profile: 'minimal',
  });
  writeJson('.workspai/workspace.contract.json', {
    kind: 'rapidkit.workspace.contract',
    schemaVersion: 1,
    workspace: { name: 'runtime-contract-fixture' },
    projects: [{ slug: 'app', relativePath: 'app', contracts: {} }],
  });
  writeJson('app/package.json', {
    name: '@workspai/runtime-contract-fixture',
    version: '1.0.0',
    scripts: { test: 'node --version', build: 'node --version' },
  });
  writeJson('app/.workspai/project.json', {
    name: 'app',
    runtime: 'node',
    kit_name: 'vite-react',
  });

  for (const step of contract.steps) {
    const result = spawnSync(process.execPath, [cliPath, ...step.command], {
      cwd: workspacePath,
      encoding: 'utf8',
      timeout: 120_000,
      env: {
        ...process.env,
        NO_COLOR: '1',
        CI: '1',
        RAPIDKIT_SKIP_LOCK_SYNC: '1',
        WORKSPAI_NO_UPDATE_CHECK: '1',
        WORKSPAI_DEBUG_ARGS: '1',
      },
    });
    if (result.error) fail(`${step.id} could not execute: ${result.error.message}`);
    if (result.status !== 0 && step.exitPolicy !== 'continue-on-structured-verdict') {
      fail(
        `${step.id} exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      );
    }
    for (const artifactPath of step.produces) validateArtifact(artifactPath);
  }

  console.log(
    `[workspace-intelligence-runtime] ${contract.steps.length} steps and ${contract.steps.reduce((sum, step) => sum + step.produces.length, 0)} artifacts conform`
  );
} finally {
  fs.rmSync(workspacePath, { recursive: true, force: true });
}
