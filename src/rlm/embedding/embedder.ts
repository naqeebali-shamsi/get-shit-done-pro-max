/**
 * Ollama Embedding Wrapper
 *
 * Wraps Ollama embed() with content-hash caching for efficient embedding generation.
 * Also includes simple BM25-style sparse vector generation.
 */

import ollama from 'ollama';
import { createHash } from 'crypto';
import type { EmbeddingResult, SparseVector, Chunk } from '../types.js';

export interface EmbedderConfig {
  model: string;
  ollamaUrl?: string;
}

const DEFAULT_MODEL = 'nomic-embed-text';

// In-memory cache (could be upgraded to disk/redis later)
const embeddingCache = new Map<string, number[]>();

function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export async function embedText(
  text: string,
  config: Partial<EmbedderConfig> = {}
): Promise<number[]> {
  const model = config.model || DEFAULT_MODEL;
  const hash = hashContent(text);

  // Check cache
  const cached = embeddingCache.get(hash);
  if (cached) {
    return cached;
  }

  // Generate embedding
  const response = await ollama.embed({
    model,
    input: text,
    truncate: true,  // Handle context overflow
  });

  const embedding = response.embeddings[0];

  // Cache result
  embeddingCache.set(hash, embedding);

  return embedding;
}

export async function embedBatch(
  texts: string[],
  config: Partial<EmbedderConfig> = {}
): Promise<number[][]> {
  const model = config.model || DEFAULT_MODEL;
  const results: number[][] = [];
  const uncached: { index: number; text: string; hash: string }[] = [];

  // Check cache for each text
  for (let i = 0; i < texts.length; i++) {
    const hash = hashContent(texts[i]);
    const cached = embeddingCache.get(hash);
    if (cached) {
      results[i] = cached;
    } else {
      uncached.push({ index: i, text: texts[i], hash });
    }
  }

  // Batch embed uncached texts
  if (uncached.length > 0) {
    const response = await ollama.embed({
      model,
      input: uncached.map(u => u.text),
      truncate: true,
    });

    // Store results and update cache
    for (let i = 0; i < uncached.length; i++) {
      const { index, hash } = uncached[i];
      const embedding = response.embeddings[i];
      results[index] = embedding;
      embeddingCache.set(hash, embedding);
    }
  }

  return results;
}

export async function embedChunks(
  chunks: Chunk[],
  config: Partial<EmbedderConfig> = {}
): Promise<EmbeddingResult[]> {
  const texts = chunks.map(c => c.text);
  const embeddings = await embedBatch(texts, config);

  return chunks.map((chunk, i) => ({
    chunk_id: chunk.id,
    dense_vector: embeddings[i],
    // Sparse vector generation is separate (BM25 tokenization)
  }));
}

/**
 * Simple BM25-style sparse vector generation.
 * Uses word frequencies with position indices.
 */
export function generateSparseVector(text: string): SparseVector {
  // Tokenize: split on non-alphanumeric, lowercase
  const words = text.toLowerCase().match(/\b[a-z0-9_]+\b/g) || [];

  // Count frequencies
  const freqMap = new Map<string, number>();
  for (const word of words) {
    freqMap.set(word, (freqMap.get(word) || 0) + 1);
  }

  // Convert to sparse vector (word hash -> frequency)
  const indices: number[] = [];
  const values: number[] = [];

  for (const [word, freq] of freqMap) {
    // Simple hash to index
    const index = Math.abs(hashToInt(word)) % 30000;  // 30k vocabulary
    indices.push(index);
    values.push(freq);
  }

  // Sort by index for Qdrant
  const sorted = indices.map((idx, i) => ({ idx, val: values[i] }))
    .sort((a, b) => a.idx - b.idx);

  return {
    indices: sorted.map(s => s.idx),
    values: sorted.map(s => s.val),
  };
}

function hashToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

export function clearCache(): void {
  embeddingCache.clear();
}

export function getCacheSize(): number {
  return embeddingCache.size;
}
