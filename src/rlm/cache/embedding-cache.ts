/**
 * Embedding Cache Module
 *
 * LRU cache layer with content-hash keys to eliminate redundant Ollama embedding calls.
 * Uses lru-cache for in-memory caching with TTL, max entries, and memory bounds.
 *
 * Key features:
 * - Content hash using crypto.sha256 truncated to 16 chars (64 bits)
 * - Configurable max entries (default 10000)
 * - Configurable max memory (default 500MB)
 * - TTL with updateAgeOnGet (default 24 hours)
 * - Stats tracking for monitoring
 */

import { LRUCache } from 'lru-cache';
import { createHash } from 'crypto';

export interface EmbeddingCacheOptions {
  /** Maximum number of cached embeddings (default: 10000) */
  maxEntries?: number;
  /** Maximum memory in MB (default: 500) */
  maxMemoryMB?: number;
  /** TTL in milliseconds (default: 24 hours) */
  ttlMs?: number;
  /** Whether to reset TTL on access (default: true) */
  updateAgeOnGet?: boolean;
}

export interface CacheStats {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Current number of entries */
  size: number;
  /** Calculated size in bytes */
  calculatedSize: number;
}

/**
 * Generate a content hash for cache key.
 * Uses SHA-256 truncated to 16 hex characters (64 bits).
 * This is sufficient for cache keys while keeping key size small.
 */
export function contentHash(text: string): string {
  return createHash('sha256')
    .update(text, 'utf8')
    .digest('hex')
    .slice(0, 16);
}

/**
 * Embedding Cache class with LRU eviction and TTL.
 */
export class EmbeddingCache {
  private cache: LRUCache<string, number[]>;
  private hits: number = 0;
  private misses: number = 0;

  constructor(options: EmbeddingCacheOptions = {}) {
    const {
      maxEntries = 10000,
      maxMemoryMB = 500,
      ttlMs = 1000 * 60 * 60 * 24, // 24 hours
      updateAgeOnGet = true,
    } = options;

    this.cache = new LRUCache<string, number[]>({
      max: maxEntries,
      maxSize: maxMemoryMB * 1024 * 1024,
      sizeCalculation: (embedding) => {
        // Float64 = 8 bytes per element
        return embedding.length * 8;
      },
      ttl: ttlMs,
      updateAgeOnGet,
      allowStale: false,
    });
  }

  /**
   * Get an embedding from cache or generate it using the provided function.
   * This is the main method for cache-aware embedding generation.
   *
   * @param text - The text to embed
   * @param embedFn - Function to generate embedding if not cached
   * @returns The embedding (from cache or newly generated)
   */
  async getOrEmbed(
    text: string,
    embedFn: () => Promise<number[]>
  ): Promise<number[]> {
    const hash = contentHash(text);
    const cached = this.cache.get(hash);

    if (cached) {
      this.hits++;
      return cached;
    }

    this.misses++;
    const embedding = await embedFn();
    this.cache.set(hash, embedding);
    return embedding;
  }

  /**
   * Check if a text's embedding is in the cache.
   */
  has(text: string): boolean {
    return this.cache.has(contentHash(text));
  }

  /**
   * Get embedding from cache without generating.
   * Returns undefined if not cached.
   */
  get(text: string): number[] | undefined {
    const hash = contentHash(text);
    const cached = this.cache.get(hash);
    if (cached) {
      this.hits++;
    }
    return cached;
  }

  /**
   * Manually set an embedding in the cache.
   */
  set(text: string, embedding: number[]): void {
    this.cache.set(contentHash(text), embedding);
  }

  /**
   * Clear all cached embeddings.
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics for monitoring.
   */
  stats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      calculatedSize: this.cache.calculatedSize ?? 0,
    };
  }

  /**
   * Get hit rate as a percentage.
   */
  hitRate(): number {
    const total = this.hits + this.misses;
    if (total === 0) return 0;
    return (this.hits / total) * 100;
  }
}

/**
 * Factory function to create an EmbeddingCache instance.
 */
export function createEmbeddingCache(
  options: EmbeddingCacheOptions = {}
): EmbeddingCache {
  return new EmbeddingCache(options);
}
