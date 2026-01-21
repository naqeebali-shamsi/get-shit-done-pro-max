/**
 * Quick Retrieve Module
 *
 * Fast retrieval path optimized for GSD hooks and CLI tools.
 * Provides graceful degradation - never throws, returns empty array on failure.
 *
 * Phase 4: GSD Integration (VER-04)
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { hybridSearch } from '../retrieval/hybrid-search.js';
import type { Chunk } from '../types.js';

export interface QuickRetrieveOptions {
  /** Maximum number of chunks to return (default: 5) */
  limit?: number;
  /** Timeout in milliseconds (default: 500) */
  timeout?: number;
  /** Minimum score threshold (default: 0.3) */
  scoreThreshold?: number;
}

const DEFAULT_OPTIONS: Required<QuickRetrieveOptions> = {
  limit: 5,
  timeout: 500,
  scoreThreshold: 0.3,
};

// Singleton Qdrant client
let qdrantClient: QdrantClient | null = null;
let qdrantClientError: Error | null = null;

/**
 * Get or create singleton Qdrant client.
 * Returns null if connection fails (graceful degradation).
 */
function getQdrantClient(): QdrantClient | null {
  // If we already have a client, return it
  if (qdrantClient) {
    return qdrantClient;
  }

  // If we previously failed, don't retry (avoid repeated connection attempts)
  if (qdrantClientError) {
    return null;
  }

  try {
    const url = process.env.QDRANT_URL || 'http://localhost:6333';
    qdrantClient = new QdrantClient({ url });
    return qdrantClient;
  } catch (error) {
    qdrantClientError = error instanceof Error ? error : new Error(String(error));
    console.error(`[quickRetrieve] Failed to create Qdrant client: ${qdrantClientError.message}`);
    return null;
  }
}

/**
 * Reset the singleton client (useful for testing or reconnection).
 */
export function resetQdrantClient(): void {
  qdrantClient = null;
  qdrantClientError = null;
}

/**
 * Fast semantic search optimized for hooks and CLI tools.
 *
 * Key properties:
 * - Never throws - returns empty array on any failure
 * - Timeout-protected - returns empty array if search takes too long
 * - Graceful degradation - connection failures don't break calling code
 *
 * @param query - Search query string
 * @param options - Search configuration options
 * @returns Array of relevant chunks (empty on failure/timeout)
 */
export async function quickRetrieve(
  query: string,
  options?: QuickRetrieveOptions
): Promise<Chunk[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Get collection name from env or use default
  const collectionName = process.env.RLM_COLLECTION || 'codebase';

  // Get client (may be null if connection failed)
  const client = getQdrantClient();
  if (!client) {
    return [];
  }

  try {
    // Create timeout promise
    const timeoutPromise = new Promise<Chunk[]>((resolve) => {
      setTimeout(() => resolve([]), opts.timeout);
    });

    // Create search promise
    const searchPromise = (async (): Promise<Chunk[]> => {
      const results = await hybridSearch(client, collectionName, query, {
        limit: opts.limit,
        scoreThreshold: opts.scoreThreshold,
      });
      return results.map(r => r.chunk);
    })();

    // Race between search and timeout
    return await Promise.race([searchPromise, timeoutPromise]);
  } catch (error) {
    // Log error but never throw
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[quickRetrieve] Search failed: ${message}`);
    return [];
  }
}
