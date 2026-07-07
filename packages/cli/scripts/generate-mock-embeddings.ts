/**
 * Generate mock embeddings for testing without OpenAI API
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getModuleCatalog } from '../src/ai/module-catalog';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ModuleEmbedding {
  id: string;
  embedding: number[];
}

/**
 * Generate a deterministic mock embedding based on text
 * This creates a 1536-dimensional vector (same as OpenAI's text-embedding-3-small)
 */
function generateMockEmbedding(text: string): number[] {
  const dim = 1536;
  const embedding = new Array(dim);

  // Use text hash as seed for deterministic results
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }

  // Generate pseudo-random values using the hash as seed
  for (let i = 0; i < dim; i++) {
    // Simple LCG (Linear Congruential Generator)
    hash = (hash * 1664525 + 1013904223) & 0xffffffff;
    embedding[i] = (hash / 0xffffffff) * 2 - 1; // Normalize to [-1, 1]
  }

  // Normalize the vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map((val) => val / magnitude);
}

async function generateMockEmbeddings() {
  console.log('🤖 Generating mock embeddings for testing...\n');

  console.log('📡 Fetching modules from RapidKit Python Core...');
  const modules = await getModuleCatalog();
  console.log(`✓ Found ${modules.length} modules\n`);

  const embeddings: ModuleEmbedding[] = [];

  for (const module of modules) {
    const text = `${module.name}\n${module.description}\n${module.longDescription}\n${module.keywords.join(' ')}\n${module.useCases.join(' ')}`;
    const embedding = generateMockEmbedding(text);

    embeddings.push({
      id: module.id,
      embedding,
    });

    console.log(`✓ Generated mock embedding for: ${module.name}`);
  }

  const outputPath = join(__dirname, '..', 'data', 'modules-embeddings.json');

  // Create data directory if it doesn't exist
  mkdirSync(dirname(outputPath), { recursive: true });

  writeFileSync(outputPath, JSON.stringify(embeddings, null, 2));

  console.log(`\n✅ Successfully generated mock embeddings for ${embeddings.length} modules`);
  console.log(`📁 Saved to: data/modules-embeddings.json`);
  console.log('\n⚠️  Note: These are MOCK embeddings for testing only');
  console.log('   For production, generate real embeddings with OpenAI API');
}

generateMockEmbeddings().catch(console.error);
