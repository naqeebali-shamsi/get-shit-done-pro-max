/**
 * Qdrant Client Wrapper
 *
 * Provides collection setup and operations for hybrid search (dense + sparse vectors).
 * Satisfies requirements VEC-01, VEC-02, VEC-03 from research.
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import type { RLMConfig, Chunk, EmbeddingResult, SparseVector } from '../types.js';

export interface QdrantConfig {
  url: string;
  collectionName: string;
  vectorSize: number;  // 768 for nomic-embed-text
}

/**
 * Quantization configuration for memory/speed optimization.
 * Scalar int8 gives ~4x memory reduction with <10% latency increase.
 */
export interface QuantizationConfig {
  /** Enable quantization (default: false for backward compatibility) */
  enabled: boolean;
  /** Quantization type - currently only int8 is supported */
  type: 'int8';
  /** Keep quantized vectors in RAM for fastest access (critical for sub-500ms latency) */
  always_ram: boolean;
  /** Quantile for quantization (default: 0.99) */
  quantile?: number;
}

/**
 * Extended collection configuration options.
 */
export interface CollectionConfig {
  vectorSize?: number;
  quantization?: QuantizationConfig;
}

const DEFAULT_VECTOR_SIZE = 768;

export async function createQdrantClient(config: Partial<QdrantConfig> = {}): Promise<QdrantClient> {
  const url = config.url || 'http://localhost:6333';
  return new QdrantClient({ url });
}

export async function ensureCollection(
  client: QdrantClient,
  collectionName: string,
  config: CollectionConfig = {}
): Promise<void> {
  const vectorSize = config.vectorSize ?? DEFAULT_VECTOR_SIZE;
  const collections = await client.getCollections();
  const exists = collections.collections.some(c => c.name === collectionName);

  if (exists) {
    console.log(`Collection ${collectionName} already exists`);
    return;
  }

  // Build quantization config if enabled
  const quantizationConfig = config.quantization?.enabled
    ? {
        scalar: {
          type: config.quantization.type as 'int8',
          quantile: config.quantization.quantile ?? 0.99,
          always_ram: config.quantization.always_ram,
        },
      }
    : undefined;

  // Create collection with both dense and sparse vectors
  await client.createCollection(collectionName, {
    vectors: {
      dense: {
        size: vectorSize,
        distance: 'Cosine',
        on_disk: false,  // Keep in memory for speed
      },
    },
    sparse_vectors: {
      bm25: {
        modifier: 'idf',  // Enable IDF for BM25-style ranking
      },
    },
    // HNSW config for retrieval quality
    hnsw_config: {
      m: 16,
      ef_construct: 100,
    },
    // Scalar quantization for memory/speed optimization (if enabled)
    ...(quantizationConfig && { quantization_config: quantizationConfig }),
  });

  console.log(`Created collection ${collectionName} with hybrid vectors${quantizationConfig ? ' (quantized)' : ''}`);
}

/**
 * Enable scalar quantization on an existing collection.
 * This is useful for optimizing collections that were created without quantization.
 *
 * @param client - Qdrant client instance
 * @param collectionName - Name of the collection to update
 * @param config - Quantization configuration (defaults to optimal settings)
 */
export async function enableQuantization(
  client: QdrantClient,
  collectionName: string,
  config: Partial<Omit<QuantizationConfig, 'enabled'>> = {}
): Promise<void> {
  const quantizationConfig = {
    scalar: {
      type: (config.type ?? 'int8') as 'int8',
      quantile: config.quantile ?? 0.99,
      always_ram: config.always_ram ?? true,
    },
  };

  await client.updateCollection(collectionName, {
    quantization_config: quantizationConfig,
  });

  console.log(`Enabled scalar quantization on collection ${collectionName}`);
}

export interface PointData {
  id: string;
  dense_vector: number[];
  sparse_vector?: SparseVector;
  payload: {
    text: string;
    path: string;
    language: string;
    symbol_type: string;
    symbol_name: string;
    start_line: number;
    end_line: number;
    file_hash: string;
  };
}

export async function upsertPoints(
  client: QdrantClient,
  collectionName: string,
  points: PointData[]
): Promise<void> {
  if (points.length === 0) return;

  const qdrantPoints = points.map((p, idx) => ({
    id: idx,  // Qdrant needs numeric or UUID, we'll use index + store string id in payload
    vector: {
      dense: p.dense_vector,
      ...(p.sparse_vector && {
        bm25: {
          indices: p.sparse_vector.indices,
          values: p.sparse_vector.values,
        },
      }),
    },
    payload: {
      ...p.payload,
      chunk_id: p.id,  // Store our string ID in payload
    },
  }));

  // Batch upsert in chunks of 100
  const batchSize = 100;
  for (let i = 0; i < qdrantPoints.length; i += batchSize) {
    const batch = qdrantPoints.slice(i, i + batchSize);
    await client.upsert(collectionName, {
      points: batch,
      wait: true,
    });
  }

  console.log(`Upserted ${points.length} points to ${collectionName}`);
}

export async function deleteByFileHash(
  client: QdrantClient,
  collectionName: string,
  fileHash: string
): Promise<void> {
  await client.delete(collectionName, {
    filter: {
      must: [
        { key: 'file_hash', match: { value: fileHash } },
      ],
    },
    wait: true,
  });
}

export async function getCollectionInfo(
  client: QdrantClient,
  collectionName: string
): Promise<{ points_count: number; indexed_vectors_count: number } | null> {
  try {
    const info = await client.getCollection(collectionName);
    return {
      points_count: info.points_count || 0,
      indexed_vectors_count: info.indexed_vectors_count || 0,
    };
  } catch (e) {
    return null;
  }
}
