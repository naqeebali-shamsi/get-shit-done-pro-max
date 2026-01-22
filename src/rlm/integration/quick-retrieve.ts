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

/**
 * Error callback for monitoring Qdrant failures.
 */
export type OnErrorCallback = (error: Error, context: string) => void;

export interface QuickRetrieveOptions {
  /** Maximum number of chunks to return (default: 5) */
  limit?: number;
  /** Timeout in milliseconds (default: 500) */
  timeout?: number;
  /** Minimum score threshold (default: 0.3) */
  scoreThreshold?: number;
  /** Optional callback for monitoring errors (e.g., for metrics/alerting) */
  onError?: OnErrorCallback;
}

const DEFAULT_OPTIONS: Required<Omit<QuickRetrieveOptions, 'onError'>> = {
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
function getQdrantClient(onError?: OnErrorCallback): QdrantClient | null {
  // If we already have a client, return it
  if (qdrantClient) {
    return qdrantClient;
  }

  // If we previously failed, don't retry (avoid repeated connection attempts)
  if (qdrantClientError) {
    // Notify via callback if provided
    if (onError) {
      onError(qdrantClientError, 'client_creation');
    }
    return null;
  }

  try {
    const url = process.env.QDRANT_URL || 'http://localhost:6333';
    qdrantClient = new QdrantClient({ url });
    return qdrantClient;
  } catch (error) {
    qdrantClientError = error instanceof Error ? error : new Error(String(error));
    console.warn(`[quickRetrieve] Qdrant unavailable: ${qdrantClientError.message}`);
    // Notify via callback for monitoring
    if (onError) {
      onError(qdrantClientError, 'client_creation');
    }
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
  const client = getQdrantClient(opts.onError);
  if (!client) {
    // Log that we're returning empty due to unavailable Qdrant
    console.warn('[quickRetrieve] Returning empty results - Qdrant unavailable');
    return [];
  }

  try {
    // Track timeout for cleanup
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;

    // Create timeout promise
    const timeoutPromise = new Promise<Chunk[]>((resolve) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        console.warn(`[quickRetrieve] Search timeout (${opts.timeout}ms) - returning empty results`);
        resolve([]);
      }, opts.timeout);
    });

    // Create search promise that clears timeout on success
    const searchPromise = (async (): Promise<Chunk[]> => {
      const results = await hybridSearch(client, collectionName, query, {
        limit: opts.limit,
        scoreThreshold: opts.scoreThreshold,
      });
      // Clear timeout if search succeeded first
      if (timeoutId && !timedOut) {
        clearTimeout(timeoutId);
      }
      return results.map(r => r.chunk);
    })();

    // Race between search and timeout
    return await Promise.race([searchPromise, timeoutPromise]);
  } catch (error) {
    // Graceful degradation: log error and notify callback, but never throw
    const err = error instanceof Error ? error : new Error(String(error));
    const isConnectionError = err.message.includes('ECONNREFUSED') ||
                               err.message.includes('timeout') ||
                               err.message.includes('connect');

    if (isConnectionError) {
      console.warn(`[quickRetrieve] Qdrant unavailable: ${err.message}`);
    } else {
      console.error(`[quickRetrieve] Search failed: ${err.message}`);
    }

    // Notify via callback for monitoring
    if (opts.onError) {
      opts.onError(err, 'search');
    }

    return [];
  }
}
