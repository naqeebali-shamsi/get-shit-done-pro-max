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
