#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const embeddingsPath = path.resolve('data', 'modules-embeddings.json');

function fail(message) {
  console.error(`[prepare-mock-embeddings] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(embeddingsPath)) {
  fail(
    'Missing data/modules-embeddings.json. Generate it before packaging, or commit the deterministic mock artifact.'
  );
}

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(embeddingsPath, 'utf8'));
} catch (error) {
  fail(`Invalid JSON in data/modules-embeddings.json: ${error.message}`);
}

const modules = Array.isArray(parsed) ? parsed : parsed?.modules;
if (!Array.isArray(modules) || modules.length === 0) {
  fail(
    'Embeddings artifact must be a non-empty array or an object with a non-empty modules array.'
  );
}

for (const [index, moduleEmbedding] of modules.entries()) {
  if (!moduleEmbedding || typeof moduleEmbedding !== 'object') {
    fail(`Embedding entry #${index + 1} must be an object.`);
  }
  if (typeof moduleEmbedding.id !== 'string' || moduleEmbedding.id.trim().length === 0) {
    fail(`Embedding entry #${index + 1} is missing a stable string id.`);
  }
  if (!Array.isArray(moduleEmbedding.embedding) || moduleEmbedding.embedding.length === 0) {
    fail(`Embedding entry ${moduleEmbedding.id} is missing a non-empty embedding array.`);
  }
  if (
    !moduleEmbedding.embedding.every((value) => typeof value === 'number' && Number.isFinite(value))
  ) {
    fail(`Embedding entry ${moduleEmbedding.id} contains non-numeric embedding values.`);
  }
}

console.log(`[prepare-mock-embeddings] verified ${modules.length} module embedding artifacts.`);
