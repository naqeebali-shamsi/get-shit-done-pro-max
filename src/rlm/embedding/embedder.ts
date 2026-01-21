/**
 * Ollama Embedding Wrapper
 *
 * Wraps Ollama embed() with LRU caching for efficient embedding generation.
 * Also includes simple BM25-style sparse vector generation.
 *
 * Phase 5 update: Now uses EmbeddingCache with LRU eviction, TTL, and memory bounds.
 */

import ollama from 'ollama';
import { createHash } from 'crypto';
import type { EmbeddingResult, SparseVector, Chunk } from '../types.js';
import { EmbeddingCache, type CacheStats } from '../cache/index.js';

export interface EmbedderConfig {
  model: string;
  ollamaUrl?: string;
}

export interface EmbedOptions {
  /** Model to use for embedding (default: nomic-embed-text) */
  model?: string;
  /** Whether to use cache (default: true) */
  useCache?: boolean;
}

const DEFAULT_MODEL = 'nomic-embed-text';

// Module-level LRU cache singleton with configurable limits
const embeddingCache = new EmbeddingCache({
  maxEntries: 10000,
  maxMemoryMB: 500,
  ttlMs: 1000 * 60 * 60 * 24, // 24 hours
  updateAgeOnGet: true,
});

function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Generate embedding for text using Ollama.
 * Uses LRU cache by default to avoid redundant API calls.
 *
 * @param text - Text to embed
 * @param options - Embed options (model, useCache)
 * @returns Dense vector embedding
 */
export async function embedText(
  text: string,
  options: EmbedOptions = {}
): Promise<number[]> {
  const { model = DEFAULT_MODEL, useCache = true } = options;

  // Create the actual embed function (called on cache miss)
  const ollamaEmbed = async (): Promise<number[]> => {
    const response = await ollama.embed({
      model,
      input: text,
      truncate: true, // Handle context overflow
    });
    return response.embeddings[0];
  };

  // When useCache=false, bypass cache (for benchmarking)
  if (!useCache) {
    return ollamaEmbed();
  }

  // Use cache with getOrEmbed pattern
  return embeddingCache.getOrEmbed(text, ollamaEmbed);
}

/**
 * Batch embed multiple texts.
 * Uses cache for already-embedded texts.
 *
 * @param texts - Array of texts to embed
 * @param options - Embed options (model, useCache)
 * @returns Array of dense vector embeddings
 */
export async function embedBatch(
  texts: string[],
  options: EmbedOptions = {}
): Promise<number[][]> {
  const { model = DEFAULT_MODEL, useCache = true } = options;
  const results: number[][] = [];
  const uncached: { index: number; text: string; hash: string }[] = [];

  // Check cache for each text (if caching enabled)
  for (let i = 0; i < texts.length; i++) {
    if (useCache) {
      const cached = embeddingCache.get(texts[i]);
      if (cached) {
        results[i] = cached;
        continue;
      }
    }
    const hash = hashContent(texts[i]);
    uncached.push({ index: i, text: texts[i], hash });
  }

  // Batch embed uncached texts
  if (uncached.length > 0) {
    const response = await ollama.embed({
      model,
      input: uncached.map((u) => u.text),
      truncate: true,
    });

    // Store results and update cache
    for (let i = 0; i < uncached.length; i++) {
      const { index, text } = uncached[i];
      const embedding = response.embeddings[i];
      results[index] = embedding;
      if (useCache) {
        embeddingCache.set(text, embedding);
      }
    }
  }

  return results;
}

/**
 * Embed chunks and return results with chunk IDs.
 *
 * @param chunks - Array of chunks to embed
 * @param options - Embed options (model, useCache)
 * @returns Array of embedding results
 */
export async function embedChunks(
  chunks: Chunk[],
  options: EmbedOptions = {}
): Promise<EmbeddingResult[]> {
  const texts = chunks.map((c) => c.text);
  const embeddings = await embedBatch(texts, options);

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
    const index = Math.abs(hashToInt(word)) % 30000; // 30k vocabulary
    indices.push(index);
    values.push(freq);
  }

  // Sort by index for Qdrant
  const sorted = indices
    .map((idx, i) => ({ idx, val: values[i] }))
    .sort((a, b) => a.idx - b.idx);

  return {
    indices: sorted.map((s) => s.idx),
    values: sorted.map((s) => s.val),
  };
}

function hashToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash;
}

/**
 * Clear the embedding cache.
 * Also resets cache statistics.
 */
export function clearCache(): void {
  embeddingCache.clear();
}

/**
 * Get current cache size (number of entries).
 */
export function getCacheSize(): number {
  return embeddingCache.stats().size;
}

/**
 * Get detailed cache statistics for monitoring.
 * Includes hits, misses, size, and calculated memory usage.
 */
export function getCacheStats(): CacheStats {
  return embeddingCache.stats();
}

/**
 * Get cache hit rate as percentage.
 * Useful for monitoring cache effectiveness.
 */
export function getCacheHitRate(): number {
  return embeddingCache.hitRate();
}
