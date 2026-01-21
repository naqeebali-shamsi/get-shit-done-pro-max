/**
 * RLM State Management
 *
 * REPL-style state container for the RLM engine.
 * Stores context as named variables - LLM inspects via tools, not direct prompt.
 */

import type { Evidence, ContextChunk, RLMEngineConfig } from './types.js';
import { DEFAULT_ENGINE_CONFIG } from './types.js';
import type { Chunk } from '../types.js';

/**
 * State container for RLM execution
 */
export interface RLMStateData {
  variables: Map<string, unknown>;
  chunks: ContextChunk[];     // Retrieved chunks (stored, not in prompt)
  query: string;              // Current query
  originalQuery: string;      // Initial query for tracking
  depth: number;              // Recursion depth
  tokenBudget: number;        // Remaining tokens
  tokensUsed: number;         // Tokens consumed so far
  evidence: Evidence[];       // Accumulated evidence
  reasoning: string[];        // Chain of thought steps
}

export class RLMState {
  private data: RLMStateData;
  private config: RLMEngineConfig;

  constructor(config: RLMEngineConfig = DEFAULT_ENGINE_CONFIG) {
    this.config = config;
    this.data = this.initState();
  }

  private initState(): RLMStateData {
    return {
      variables: new Map(),
      chunks: [],
      query: '',
      originalQuery: '',
      depth: 0,
      tokenBudget: this.config.tokenBudget,
      tokensUsed: 0,
      evidence: [],
      reasoning: [],
    };
  }

  /**
   * Initialize state with query and retrieved chunks
   */
  initialize(query: string, chunks: Chunk[], scores: number[]): void {
    this.data.query = query;
    this.data.originalQuery = query;
    this.data.chunks = chunks.map((chunk, i) => ({
      id: chunk.id,
      text: chunk.text,
      score: scores[i] || 0,
      metadata: {
        path: chunk.metadata.path,
        symbol_name: chunk.metadata.symbol_name,
        start_line: chunk.metadata.start_line,
        end_line: chunk.metadata.end_line,
      },
    }));
  }

  /**
   * Get context summary (not full text) for prompt
   */
  getContextSummary(): string {
    const lines = [
      `Context: ${this.data.chunks.length} chunks retrieved`,
      `Total lines: ${this.getTotalLines()}`,
      '',
      'Available chunks:',
    ];

    for (const chunk of this.data.chunks) {
      lines.push(
        `  [${chunk.id}] ${chunk.metadata.path}:${chunk.metadata.start_line}-${chunk.metadata.end_line} ` +
        `(${chunk.metadata.symbol_name}, score: ${chunk.score.toFixed(2)})`
      );
    }

    return lines.join('\n');
  }

  /**
   * Get full context text (for tool inspection, not prompt)
   */
  getFullContext(): string {
    return this.data.chunks
      .map(c => `--- ${c.id} (${c.metadata.path}) ---\n${c.text}`)
      .join('\n\n');
  }

  /**
   * Get context lines by range (for peek_context tool)
   */
  getContextLines(startLine: number, endLine: number): string {
    const fullText = this.getFullContext();
    const lines = fullText.split('\n');
    return lines.slice(startLine, endLine + 1).join('\n');
  }

  /**
   * Search context for pattern (for search_context tool)
   */
  searchContext(pattern: string): Array<{ line: number; text: string; chunkId: string }> {
    const regex = new RegExp(pattern, 'gi');
    const results: Array<{ line: number; text: string; chunkId: string }> = [];

    for (const chunk of this.data.chunks) {
      const lines = chunk.text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          results.push({
            line: i,
            text: lines[i],
            chunkId: chunk.id,
          });
        }
      }
    }

    return results.slice(0, 20);  // Limit results
  }

  /**
   * Get specific chunk by ID (for sub_query tool)
   */
  getChunk(chunkId: string): ContextChunk | undefined {
    return this.data.chunks.find(c => c.id === chunkId);
  }

  /**
   * Update query for recursion
   */
  setQuery(query: string): void {
    this.data.query = query;
  }

  /**
   * Increment depth for recursion
   */
  incrementDepth(): void {
    this.data.depth++;
  }

  /**
   * Check if can recurse (RLM-05)
   */
  canRecurse(): boolean {
    return this.data.depth < this.config.maxDepth &&
           this.data.tokensUsed < this.data.tokenBudget;
  }

  /**
   * Add evidence
   */
  addEvidence(evidence: Evidence): void {
    this.data.evidence.push(evidence);
  }

  /**
   * Add reasoning step
   */
  addReasoning(step: string): void {
    this.data.reasoning.push(step);
  }

  /**
   * Track token usage
   */
  addTokens(count: number): void {
    this.data.tokensUsed += count;
  }

  /**
   * Set/get variables (REPL pattern)
   */
  setVariable(name: string, value: unknown): void {
    this.data.variables.set(name, value);
  }

  getVariable(name: string): unknown {
    return this.data.variables.get(name);
  }

  // Getters
  get query(): string { return this.data.query; }
  get originalQuery(): string { return this.data.originalQuery; }
  get depth(): number { return this.data.depth; }
  get tokensUsed(): number { return this.data.tokensUsed; }
  get tokenBudget(): number { return this.data.tokenBudget; }
  get evidence(): Evidence[] { return [...this.data.evidence]; }
  get reasoning(): string[] { return [...this.data.reasoning]; }
  get chunks(): ContextChunk[] { return [...this.data.chunks]; }
  get maxDepth(): number { return this.config.maxDepth; }

  private getTotalLines(): number {
    return this.data.chunks.reduce((sum, c) => sum + c.text.split('\n').length, 0);
  }

  /**
   * Reset state for new query
   */
  reset(): void {
    this.data = this.initState();
  }
}
