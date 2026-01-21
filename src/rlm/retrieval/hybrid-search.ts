/**
 * Hybrid Search Module
 *
 * Implements hybrid search combining dense vector similarity with sparse BM25 vectors
 * using Reciprocal Rank Fusion (RRF) for optimal results.
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import type { SearchResult, Chunk, ChunkMetadata, SparseVector } from '../types.js';
import { embedText, generateSparseVector } from '../embedding/index.js';

export interface SearchOptions {
  limit?: number;
  scoreThreshold?: number;
  filters?: SearchFilters;
  useHybrid?: boolean;  // Enable hybrid (dense + sparse)
}

export interface SearchFilters {
  language?: string;
  symbol_type?: ChunkMetadata['symbol_type'];
  path_prefix?: string;
  file_hash?: string;
}

const DEFAULT_OPTIONS: SearchOptions = {
  limit: 10,
  scoreThreshold: 0.0,
  useHybrid: true,
};

/**
 * Perform hybrid search using RRF fusion on dense and sparse vectors.
 *
 * @param client - Qdrant client instance
 * @param collectionName - Name of the collection to search
 * @param query - Search query string
 * @param options - Search configuration options
 * @returns Array of search results sorted by relevance
 */
export async function hybridSearch(
  client: QdrantClient,
  collectionName: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Generate dense embedding for query
  const denseVector = await embedText(query);

  // Build Qdrant filter from options
  const filter = buildFilter(opts.filters);

  if (opts.useHybrid) {
    // Generate sparse vector for BM25 matching
    const sparseVector = generateSparseVector(query);

    // Hybrid search with RRF fusion
    const results = await client.query(collectionName, {
      prefetch: [
        {
          query: denseVector,
          using: 'dense',
          limit: opts.limit! * 2,  // Over-fetch for better fusion
          ...(filter && { filter }),
        },
        {
          query: {
            indices: sparseVector.indices,
            values: sparseVector.values,
          },
          using: 'bm25',
          limit: opts.limit! * 2,
          ...(filter && { filter }),
        },
      ],
      query: { fusion: 'rrf' },  // Reciprocal Rank Fusion
      limit: opts.limit!,
      with_payload: true,
    });

    return mapResults(results.points, opts.scoreThreshold!);
  } else {
    // Dense-only search
    const results = await client.search(collectionName, {
      vector: {
        name: 'dense',
        vector: denseVector,
      },
      limit: opts.limit!,
      with_payload: true,
      ...(filter && { filter }),
    });

    return mapResults(results, opts.scoreThreshold!);
  }
}

/**
 * Search by metadata fields only (no vector similarity).
 *
 * @param client - Qdrant client instance
 * @param collectionName - Name of the collection to search
 * @param filters - Metadata filters to apply
 * @param limit - Maximum number of results
 * @returns Array of matching chunks
 */
export async function searchByMetadata(
  client: QdrantClient,
  collectionName: string,
  filters: SearchFilters,
  limit: number = 100
): Promise<SearchResult[]> {
  const filter = buildFilter(filters);

  if (!filter) {
    throw new Error('At least one filter required for metadata search');
  }

  const results = await client.scroll(collectionName, {
    filter,
    limit,
    with_payload: true,
    with_vector: false,
  });

  return results.points.map(point => ({
    id: (point.payload as Record<string, unknown>)?.chunk_id as string || String(point.id),
    score: 1.0,  // No score for scroll
    chunk: payloadToChunk(point.payload as Record<string, unknown>),
  }));
}

/**
 * Build Qdrant filter from search filters.
 */
function buildFilter(filters?: SearchFilters): Record<string, unknown> | undefined {
  if (!filters) return undefined;

  const conditions: Record<string, unknown>[] = [];

  if (filters.language) {
    conditions.push({ key: 'language', match: { value: filters.language } });
  }

  if (filters.symbol_type) {
    conditions.push({ key: 'symbol_type', match: { value: filters.symbol_type } });
  }

  if (filters.path_prefix) {
    conditions.push({ key: 'path', match: { text: filters.path_prefix } });
  }

  if (filters.file_hash) {
    conditions.push({ key: 'file_hash', match: { value: filters.file_hash } });
  }

  if (conditions.length === 0) return undefined;

  return { must: conditions };
}

/**
 * Map Qdrant points to SearchResult array.
 */
function mapResults(points: Array<{ id?: string | number; score?: number; payload?: Record<string, unknown> | null }>, scoreThreshold: number): SearchResult[] {
  return points
    .filter(p => (p.score || 0) >= scoreThreshold)
    .map(point => ({
      id: (point.payload as Record<string, unknown>)?.chunk_id as string || String(point.id),
      score: point.score || 0,
      chunk: payloadToChunk(point.payload as Record<string, unknown>),
    }));
}

/**
 * Convert Qdrant payload to Chunk object.
 */
function payloadToChunk(payload: Record<string, unknown> | null | undefined): Chunk {
  const p = payload || {};
  return {
    id: (p.chunk_id as string) || '',
    text: (p.text as string) || '',
    metadata: {
      path: (p.path as string) || '',
      language: (p.language as string) || '',
      symbol_type: (p.symbol_type as ChunkMetadata['symbol_type']) || 'other',
      symbol_name: (p.symbol_name as string) || '',
      start_line: (p.start_line as number) || 0,
      end_line: (p.end_line as number) || 0,
      file_hash: (p.file_hash as string) || '',
    },
  };
}
