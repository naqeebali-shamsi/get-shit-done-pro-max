/**
 * Indexing Module
 *
 * Full codebase indexing pipeline with incremental update support.
 */

export {
  indexDirectory,
  indexSingleFile,
  clearIndexCache,
  getIndexCacheSize,
  type IndexOptions,
  type IndexResult,
} from './indexer.js';
