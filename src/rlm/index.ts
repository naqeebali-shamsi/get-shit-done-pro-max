/**
 * RLM Module - Retrieval-augmented Language Model
 *
 * Main entry point for the RLM subsystem.
 * Re-exports all public types and modules.
 */

// Phase 1: Core infrastructure
export * from './types.js';
export * from './chunking/index.js';
export * from './storage/index.js';
export * from './embedding/index.js';
export * from './retrieval/index.js';
export * from './indexing/index.js';

// Phase 2: RLM engine
export * from './engine/index.js';
export * from './evidence/index.js';

// Phase 3: Verification Loop (VER-01, VER-02, VER-03)
export {
  Verifier,
  ClaimExtractor,
  checkEvidenceCoverage,
  typecheckFiles,
  runTests,
  scanImpact,
  type VerificationResult,
  type AtomicClaim,
  type CheckResult,
  type CoverageResult,
} from './verification/index.js';

// Phase 4: GSD Integration (VER-04)
export {
  quickRetrieve,
  resetQdrantClient,
  formatChunksAsContext,
  formatSingleChunk,
  summarizeChunks,
  type QuickRetrieveOptions,
  type ContextFormatOptions,
} from './integration/index.js';

// Phase 5: Optimization & Polish (OPT-01)
export {
  EmbeddingCache,
  createEmbeddingCache,
  contentHash,
  type EmbeddingCacheOptions,
  type CacheStats,
} from './cache/index.js';

// Re-export cache stats utilities from embedder
export {
  getCacheStats,
  getCacheHitRate,
} from './embedding/embedder.js';
