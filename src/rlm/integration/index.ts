/**
 * Integration Module
 *
 * Fast retrieval path and context formatting utilities for GSD integration.
 * Designed for hooks and CLI tools that need quick semantic search.
 *
 * Phase 4: GSD Integration (VER-04)
 */

// Quick retrieve - fast semantic search with graceful degradation
export {
  quickRetrieve,
  resetQdrantClient,
  type QuickRetrieveOptions,
} from './quick-retrieve.js';

// Context formatting - format chunks as readable context
export {
  formatChunksAsContext,
  formatSingleChunk,
  summarizeChunks,
  type ContextFormatOptions,
} from './context-formatter.js';
