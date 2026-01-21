/**
 * Storage Module
 *
 * Qdrant client wrapper for vector storage and retrieval.
 */

export {
  createQdrantClient,
  ensureCollection,
  enableQuantization,
  upsertPoints,
  deleteByFileHash,
  getCollectionInfo,
  type QdrantConfig,
  type QuantizationConfig,
  type CollectionConfig,
  type PointData,
} from './qdrant-client.js';
