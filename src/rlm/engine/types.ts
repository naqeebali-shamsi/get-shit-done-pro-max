/**
 * RLM Engine Types
 *
 * Types specific to the recursive reasoning engine.
 * Extends core types from ../types.ts
 */

import type { Chunk, SearchResult } from '../types.js';

/**
 * Evidence linking a claim to source chunks
 */
export interface Evidence {
  claim: string;           // The statement being made
  sourceChunks: string[];  // Chunk IDs that support it
  confidence: number;      // 0-1 based on retrieval scores
  verified: boolean;       // Post-verification status
}

/**
 * Result from an RLM query
 */
export interface RLMResult {
  response: string;
  evidence: Evidence[];
  reasoning: string[];     // Chain of thought steps
  tokensUsed: number;
  depth: number;
  verified: boolean;
  canRecurse: boolean;
  refinedQuery?: string;   // For recursion
}

/**
 * Engine configuration
 */
export interface RLMEngineConfig {
  model: string;
  maxDepth: number;
  tokenBudget: number;
  confidenceThreshold: number;
}

export const DEFAULT_ENGINE_CONFIG: RLMEngineConfig = {
  model: 'llama3.1:8b',
  maxDepth: 5,
  tokenBudget: 16000,  // 2x typical response budget
  confidenceThreshold: 0.7,
};

/**
 * Tool call from LLM
 */
export interface ToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

/**
 * Final answer from tool call
 */
export interface FinalAnswer {
  answer: string;
  evidence: string[];
  confidence: number;
}

/**
 * Context chunk for state
 */
export interface ContextChunk {
  id: string;
  text: string;
  score: number;  // Retrieval score
  metadata: {
    path: string;
    symbol_name: string;
    start_line: number;
    end_line: number;
  };
}
