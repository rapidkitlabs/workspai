import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getModuleCatalog, type ModuleMetadata } from './module-catalog.js';
import { generateEmbedding, isMockMode } from './openai-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ModuleEmbeddingData {
  model: string;
  dimension: number;
  generated_at: string;
  modules: Array<{
    id: string;
    name: string;
    embedding: number[];
  }>;
}

export interface RecommendationResult {
  module: ModuleMetadata;
  score: number;
  reason: string;
}

let embeddingsData: ModuleEmbeddingData | null = null;
const mockModuleEmbeddings = new Map<string, number[]>();

function moduleEmbeddingText(module: ModuleMetadata): string {
  return [
    module.name,
    module.description,
    module.longDescription,
    ...module.keywords,
    ...module.useCases,
  ]
    .filter(Boolean)
    .join(' ');
}

async function getMockModuleEmbedding(module: ModuleMetadata): Promise<number[]> {
  const cached = mockModuleEmbeddings.get(module.id);
  if (cached) {
    return cached;
  }

  const embedding = await generateEmbedding(moduleEmbeddingText(module));
  mockModuleEmbeddings.set(module.id, embedding);
  return embedding;
}

/**
 * Load pre-generated module embeddings from data file
 */
export function loadEmbeddings(): ModuleEmbeddingData {
  if (embeddingsData) {
    return embeddingsData;
  }

  // Look for embeddings file in multiple locations
  const possiblePaths = [
    path.join(__dirname, '../../data/modules-embeddings.json'),
    path.join(__dirname, '../data/modules-embeddings.json'),
    path.join(process.cwd(), 'data/modules-embeddings.json'),
  ];

  let embeddingsPath: string | null = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      embeddingsPath = p;
      break;
    }
  }

  if (!embeddingsPath) {
    throw new Error('embeddings file not found');
  }

  const data = fs.readFileSync(embeddingsPath, 'utf-8');
  const parsed = JSON.parse(data);

  // Handle both formats: array of embeddings or structured object
  if (Array.isArray(parsed)) {
    embeddingsData = {
      model: 'mock-or-text-embedding-3-small',
      dimension: parsed[0]?.embedding?.length || 1536,
      generated_at: new Date().toISOString(),
      modules: parsed,
    };
  } else {
    embeddingsData = parsed;
  }

  if (!embeddingsData) {
    throw new Error('failed to load embeddings data');
  }

  return embeddingsData;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Generate human-readable reason for recommendation
 */
function generateReason(module: ModuleMetadata, query: string): string {
  const queryLower = query.toLowerCase();
  const matchedKeywords = module.keywords.filter(
    (k) => queryLower.includes(k) || k.includes(queryLower)
  );

  if (matchedKeywords.length > 0) {
    return `Matches: ${matchedKeywords.slice(0, 3).join(', ')}`;
  }

  return `Relevant for: ${module.useCases[0]}`;
}

/**
 * Recommend modules based on natural language query
 * Uses AI embeddings for semantic search
 */
export async function recommendModules(
  query: string,
  topK: number = 5
): Promise<RecommendationResult[]> {
  // Get dynamic module catalog
  const catalog = await getModuleCatalog();

  // Generate embedding for user query
  const queryEmbedding = await generateEmbedding(query);

  if (isMockMode()) {
    const scores = await Promise.all(
      catalog.map(async (module) => {
        const moduleEmbedding = await getMockModuleEmbedding(module);
        return {
          module,
          score: cosineSimilarity(queryEmbedding, moduleEmbedding),
          reason: generateReason(module, query),
        };
      })
    );

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }

  // Load pre-generated embeddings
  const embeddings = loadEmbeddings();

  // Calculate similarity scores for all modules
  const scores: RecommendationResult[] = embeddings.modules
    .map((moduleEmbedding) => {
      const module = catalog.find((m) => m.id === moduleEmbedding.id);
      if (!module) {
        // Module in embeddings but not in catalog (skip it)
        return null;
      }

      const score = cosineSimilarity(queryEmbedding, moduleEmbedding.embedding);

      return {
        module,
        score,
        reason: generateReason(module, query),
      };
    })
    .filter((r): r is RecommendationResult => r !== null);

  // Sort by score (highest first) and return top K
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK);
}

/**
 * Check if module dependencies are satisfied
 */
export async function checkDependencies(
  moduleId: string,
  installedModules: string[]
): Promise<{
  satisfied: boolean;
  missing: string[];
}> {
  const catalog = await getModuleCatalog();
  const module = catalog.find((m) => m.id === moduleId);
  if (!module) {
    return { satisfied: true, missing: [] };
  }

  const missing = module.dependencies.filter((dep) => !installedModules.includes(dep));

  return {
    satisfied: missing.length === 0,
    missing,
  };
}

/**
 * Get installation order for modules (topological sort)
 * Ensures dependencies are installed before dependent modules
 */
export async function getInstallationOrder(moduleIds: string[]): Promise<string[]> {
  const catalog = await getModuleCatalog();
  const visited = new Set<string>();
  const order: string[] = [];

  function visit(moduleId: string) {
    if (visited.has(moduleId)) {
      return;
    }

    visited.add(moduleId);

    const module = catalog.find((m) => m.id === moduleId);
    if (module) {
      // Visit dependencies first (depth-first)
      for (const dep of module.dependencies) {
        visit(dep);
      }
    }

    order.push(moduleId);
  }

  // Visit all requested modules
  for (const moduleId of moduleIds) {
    visit(moduleId);
  }

  return order;
}
