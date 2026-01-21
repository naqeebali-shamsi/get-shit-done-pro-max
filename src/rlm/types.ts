/**
 * RLM Core Type Definitions
 *
 * Shared types for the Retrieval-augmented Language Model module.
 * These types define the contracts between chunking, embedding, storage, and retrieval subsystems.
 */

export interface Chunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  path: string;
  language: string;
  symbol_type: 'function' | 'class' | 'method' | 'module' | 'markdown' | 'other';
  symbol_name: string;
  start_line: number;
  end_line: number;
  file_hash: string;
}

export interface EmbeddingResult {
  chunk_id: string;
  dense_vector: number[];
  sparse_vector?: SparseVector;
}

export interface SparseVector {
  indices: number[];
  values: number[];
}

export interface SearchResult {
  id: string;
  score: number;
  chunk: Chunk;
}

export interface RLMConfig {
  qdrant_url: string;
  ollama_url: string;
  collection_name: string;
  embedding_model: string;
  data_dir: string;
}

export const DEFAULT_CONFIG: RLMConfig = {
  qdrant_url: 'http://localhost:6333',
  ollama_url: 'http://localhost:11434',
  collection_name: 'codebase',
  embedding_model: 'nomic-embed-text',
  data_dir: '.rlm'
};
