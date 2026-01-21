/**
 * Embedding Module
 *
 * Ollama embedding wrapper for generating vector representations.
 */

export {
  embedText,
  embedBatch,
  embedChunks,
  generateSparseVector,
  clearCache,
  getCacheSize,
  type EmbedderConfig,
} from './embedder.js';
