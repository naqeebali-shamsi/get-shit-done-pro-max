/**
 * RLM Retrieval Benchmarks
 *
 * Performance benchmarking suite for measuring embedding generation,
 * vector search, and end-to-end retrieval latency.
 *
 * Run with: npx vitest bench
 *
 * Phase 5: Optimization & Polish (OPT-02)
 */

import { bench, describe, beforeAll, afterAll } from 'vitest';
import { QdrantClient } from '@qdrant/js-client-rest';
import { embedText, clearCache } from '../embedding/embedder.js';
import { hybridSearch } from '../retrieval/hybrid-search.js';
import { quickRetrieve, resetQdrantClient } from '../integration/quick-retrieve.js';

// Test queries of varying complexity
const TEST_QUERIES = {
  simple: 'function declaration',
  medium: 'async function that handles errors with try catch',
  complex: 'TypeScript class implementing interface with generic type parameters and constructor',
};

// Qdrant connection state
let qdrantClient: QdrantClient | null = null;
let qdrantAvailable = false;
const collectionName = process.env.RLM_COLLECTION || 'codebase';

/**
 * Check if Qdrant is available before running vector search benchmarks.
 */
async function checkQdrantConnection(): Promise<boolean> {
  try {
    const url = process.env.QDRANT_URL || 'http://localhost:6333';
    const client = new QdrantClient({ url, timeout: 2000 });
    await client.getCollections();
    qdrantClient = client;
    return true;
  } catch {
    console.warn('[bench] Qdrant not available - skipping vector search benchmarks');
    return false;
  }
}

/**
 * Check if collection exists and has data.
 */
async function checkCollectionExists(): Promise<boolean> {
  if (!qdrantClient) return false;
  try {
    const info = await qdrantClient.getCollection(collectionName);
    return (info.points_count ?? 0) > 0;
  } catch {
    console.warn(`[bench] Collection '${collectionName}' not found - skipping search benchmarks`);
    return false;
  }
}

// ============================================================================
// Embedding Generation Benchmarks
// ============================================================================

describe('Embedding Generation', () => {
  beforeAll(() => {
    // Clear cache before embedding benchmarks to ensure cold start
    clearCache();
  });

  bench('embedding generation (cold)', async () => {
    clearCache();
    await embedText(TEST_QUERIES.medium);
  }, { time: 1000, iterations: 5 });

  bench('embedding generation (cached)', async () => {
    // First call populates cache, subsequent calls hit cache
    await embedText(TEST_QUERIES.medium);
  }, { time: 1000, iterations: 100 });

  bench('embedding generation (simple query)', async () => {
    clearCache();
    await embedText(TEST_QUERIES.simple);
  }, { time: 1000, iterations: 5 });

  bench('embedding generation (complex query)', async () => {
    clearCache();
    await embedText(TEST_QUERIES.complex);
  }, { time: 1000, iterations: 5 });
});

// ============================================================================
// Vector Search Benchmarks (require Qdrant)
// ============================================================================

describe('Hybrid Search', () => {
  let collectionReady = false;

  beforeAll(async () => {
    qdrantAvailable = await checkQdrantConnection();
    if (qdrantAvailable) {
      collectionReady = await checkCollectionExists();
    }
  });

  afterAll(() => {
    qdrantClient = null;
  });

  bench('hybrid search (5 results)', async () => {
    if (!qdrantAvailable || !collectionReady || !qdrantClient) {
      // Skip by returning immediately if Qdrant not available
      return;
    }
    await hybridSearch(qdrantClient, collectionName, TEST_QUERIES.medium, {
      limit: 5,
    });
  }, { time: 1000, iterations: 10 });

  bench('hybrid search (10 results)', async () => {
    if (!qdrantAvailable || !collectionReady || !qdrantClient) {
      return;
    }
    await hybridSearch(qdrantClient, collectionName, TEST_QUERIES.medium, {
      limit: 10,
    });
  }, { time: 1000, iterations: 10 });

  bench('hybrid search (dense only)', async () => {
    if (!qdrantAvailable || !collectionReady || !qdrantClient) {
      return;
    }
    await hybridSearch(qdrantClient, collectionName, TEST_QUERIES.medium, {
      limit: 5,
      useHybrid: false,
    });
  }, { time: 1000, iterations: 10 });
});

// ============================================================================
// End-to-End quickRetrieve Benchmarks
// ============================================================================

describe('Quick Retrieve (end-to-end)', () => {
  beforeAll(async () => {
    resetQdrantClient();
    qdrantAvailable = await checkQdrantConnection();
  });

  afterAll(() => {
    resetQdrantClient();
  });

  bench('quickRetrieve (5 results)', async () => {
    await quickRetrieve(TEST_QUERIES.medium, { limit: 5 });
  }, { time: 1000, iterations: 10 });

  bench('quickRetrieve (10 results)', async () => {
    await quickRetrieve(TEST_QUERIES.medium, { limit: 10 });
  }, { time: 1000, iterations: 10 });

  bench('quickRetrieve (with timeout)', async () => {
    await quickRetrieve(TEST_QUERIES.medium, { limit: 5, timeout: 100 });
  }, { time: 1000, iterations: 10 });

  bench('quickRetrieve (simple query)', async () => {
    await quickRetrieve(TEST_QUERIES.simple, { limit: 5 });
  }, { time: 1000, iterations: 10 });

  bench('quickRetrieve (complex query)', async () => {
    await quickRetrieve(TEST_QUERIES.complex, { limit: 5 });
  }, { time: 1000, iterations: 10 });
});
