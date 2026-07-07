// Dynamic import for OpenAI to reduce initial bundle load
// Only loaded when AI features are actually used
import type OpenAI from 'openai';

let openaiClient: OpenAI | null = null;
let mockMode = false;
let OpenAIConstructor: typeof OpenAI | null = null;

/**
 * Lazy load OpenAI module
 */
async function loadOpenAI(): Promise<typeof OpenAI> {
  if (!OpenAIConstructor) {
    const module = await import('openai');
    OpenAIConstructor = module.default;
  }
  return OpenAIConstructor;
}

/**
 * Enable mock mode for testing without OpenAI API
 */
export function enableMockMode(): void {
  mockMode = true;
}

/**
 * Generate a deterministic mock embedding based on text
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

/**
 * Initialize OpenAI client with API key
 */
export async function initOpenAI(apiKey: string): Promise<void> {
  if (!apiKey.trim()) {
    openaiClient = null;
    return;
  }

  const OpenAI = await loadOpenAI();
  openaiClient = new OpenAI({
    apiKey: apiKey,
  });
}

/**
 * Get initialized OpenAI client (throws if not initialized)
 */
export function getOpenAI(): OpenAI {
  if (!openaiClient) {
    throw new Error('OpenAI client not initialized. Call initOpenAI() first with your API key.');
  }
  return openaiClient;
}

/**
 * Generate embedding for a single text
 * Uses text-embedding-3-small (cheapest, $0.02 per 1M tokens)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Use mock embeddings if mock mode is enabled
  if (mockMode) {
    return generateMockEmbedding(text);
  }

  const openai = getOpenAI();

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    encoding_format: 'float',
  });

  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts (batch operation)
 * More efficient than calling generateEmbedding multiple times
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  // Use mock embeddings if mock mode is enabled
  if (mockMode) {
    return texts.map(generateMockEmbedding);
  }

  const openai = getOpenAI();

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
    encoding_format: 'float',
  });

  return response.data.map((d) => d.embedding);
}

/**
 * Check if OpenAI client is initialized
 */
export function isInitialized(): boolean {
  return openaiClient !== null;
}

/**
 * Check if mock mode is enabled
 */
export function isMockMode(): boolean {
  return mockMode;
}
