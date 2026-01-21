/**
 * Storage Module
 *
 * Qdrant client wrapper for vector storage and retrieval.
 */

export {
  createQdrantClient,
  ensureCollection,
  upsertPoints,
  deleteByFileHash,
  getCollectionInfo,
  type QdrantConfig,
  type PointData,
} from './qdrant-client.js';
