/**
 * RLM Engine
 *
 * Recursive Language Model engine with tool-based context inspection.
 * Implements REPL pattern: context stored externally, LLM accesses via tools.
 */

import ollama from 'ollama';
import type { Message, ToolCall } from 'ollama';

import { RLMState } from './state.js';
import {
  rlmTools,
  peekContextSchema,
  searchContextSchema,
  getChunkSchema,
  subQuerySchema,
  finalAnswerSchema,
  type FinalAnswerArgs,
} from './tools.js';
import type {
  RLMEngineConfig,
  RLMResult,
  Evidence,
} from './types.js';
import { DEFAULT_ENGINE_CONFIG } from './types.js';
import type { Chunk } from '../types.js';

export class RLMEngine {
  private config: RLMEngineConfig;
  private state: RLMState;
  private pendingSubQueries: Array<{ chunkId: string; question: string }> = [];

  constructor(config: Partial<RLMEngineConfig> = {}) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
    this.state = new RLMState(this.config);
  }

  /**
   * Execute a query against retrieved chunks (RLM-01)
   */
  async query(input: string, chunks: Chunk[], scores: number[]): Promise<RLMResult> {
    this.state.reset();
    this.state.initialize(input, chunks, scores);
    this.pendingSubQueries = [];

    return this.executeLoop();
  }

  /**
   * Continue with a refined query (RLM-01)
   */
  async recurse(refinedQuery: string): Promise<RLMResult> {
    if (!this.state.canRecurse()) {
      return this.buildResult({
        answer: 'Max recursion depth or token budget reached',
        evidence: [],
        confidence: 0,
      });
    }

    this.state.incrementDepth();
    this.state.setQuery(refinedQuery);
    this.state.addReasoning(`Recursion depth ${this.state.depth}: ${refinedQuery}`);

    return this.executeLoop();
  }

  /**
   * Main execution loop with tool calling
   */
  private async executeLoop(): Promise<RLMResult> {
    const messages: Message[] = [
      {
        role: 'system',
        content: this.buildSystemPrompt(),
      },
      {
        role: 'user',
        content: this.buildUserPrompt(),
      },
    ];

    let iterations = 0;
    const maxIterations = 10;  // Safety limit

    while (iterations < maxIterations) {
      iterations++;

      const response = await ollama.chat({
        model: this.config.model,
        messages,
        tools: rlmTools,
      });

      // Track token usage (approximate)
      const tokensUsed = this.estimateTokens(response.message.content || '');
      this.state.addTokens(tokensUsed);

      // Check if model wants to use tools
      if (response.message.tool_calls && response.message.tool_calls.length > 0) {
        // Add assistant message with tool calls
        messages.push(response.message);

        // Process each tool call
        for (const toolCall of response.message.tool_calls) {
          const result = await this.handleToolCall(toolCall);

          // Check if final answer
          if (result.type === 'final') {
            return this.buildResult(result.answer!);
          }

          // Check if sub-query (triggers recursion)
          if (result.type === 'sub_query') {
            // Store for later processing
            this.pendingSubQueries.push(result.subQuery!);
          }

          // Add tool result to conversation
          messages.push({
            role: 'tool',
            content: result.content,
          });
        }

        // Process pending sub-queries if any
        if (this.pendingSubQueries.length > 0 && this.state.canRecurse()) {
          const subQuery = this.pendingSubQueries.shift()!;
          return this.recurse(`[${subQuery.chunkId}] ${subQuery.question}`);
        }
      } else {
        // No tool calls - model gave direct response (fallback)
        this.state.addReasoning('Direct response without tool use');
        return this.buildResult({
          answer: response.message.content || 'No response',
          evidence: [],
          confidence: 0.3,  // Lower confidence for non-tool responses
        });
      }
    }

    // Max iterations reached
    return this.buildResult({
      answer: 'Max iterations reached without final answer',
      evidence: [],
      confidence: 0,
    });
  }

  /**
   * Handle a tool call from the LLM
   */
  private async handleToolCall(toolCall: ToolCall): Promise<{
    type: 'result' | 'final' | 'sub_query';
    content: string;
    answer?: FinalAnswerArgs;
    subQuery?: { chunkId: string; question: string };
  }> {
    const name = toolCall.function.name;
    const args = toolCall.function.arguments as Record<string, unknown>;

    try {
      switch (name) {
        case 'peek_context': {
          const parsed = peekContextSchema.parse(args);
          const content = this.state.getContextLines(parsed.startLine, parsed.endLine);
          this.state.addReasoning(`Peeked lines ${parsed.startLine}-${parsed.endLine}`);
          return { type: 'result', content: content || '(no content in range)' };
        }

        case 'search_context': {
          const parsed = searchContextSchema.parse(args);
          const results = this.state.searchContext(parsed.pattern);
          const content = results.length > 0
            ? results.map(r => `[${r.chunkId}:${r.line}] ${r.text}`).join('\n')
            : '(no matches found)';
          this.state.addReasoning(`Searched for "${parsed.pattern}", found ${results.length} matches`);
          return { type: 'result', content };
        }

        case 'get_chunk': {
          const parsed = getChunkSchema.parse(args);
          const chunk = this.state.getChunk(parsed.chunkId);
          const content = chunk
            ? `${chunk.metadata.path}:${chunk.metadata.start_line}-${chunk.metadata.end_line}\n${chunk.text}`
            : '(chunk not found)';
          this.state.addReasoning(`Retrieved chunk ${parsed.chunkId}`);
          return { type: 'result', content };
        }

        case 'sub_query': {
          const parsed = subQuerySchema.parse(args);
          this.state.addReasoning(`Sub-query on ${parsed.chunkId}: ${parsed.question}`);
          return {
            type: 'sub_query',
            content: 'Sub-query scheduled',
            subQuery: { chunkId: parsed.chunkId, question: parsed.question },
          };
        }

        case 'final_answer': {
          const parsed = finalAnswerSchema.parse(args);
          this.state.addReasoning(`Final answer with ${parsed.evidence.length} evidence chunks`);
          return { type: 'final', content: 'Final answer provided', answer: parsed };
        }

        default:
          return { type: 'result', content: `Unknown tool: ${name}` };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { type: 'result', content: `Tool error: ${message}` };
    }
  }

  /**
   * Build the system prompt
   */
  private buildSystemPrompt(): string {
    return `You are a code analysis assistant with access to a retrieved codebase context.

IMPORTANT: You cannot see the full context directly. Use the provided tools to inspect it:
- peek_context: View specific line ranges
- search_context: Search for patterns
- get_chunk: Get full content of a chunk
- sub_query: Ask a detailed question about a specific chunk (triggers deeper analysis)
- final_answer: Provide your answer with evidence

Always cite evidence by chunk ID. Base confidence on how well the evidence supports your answer.
If you need more information, use tools to inspect the context before answering.

Current recursion depth: ${this.state.depth}/${this.state.maxDepth}
Tokens used: ${this.state.tokensUsed}/${this.state.tokenBudget}`;
  }

  /**
   * Build the user prompt with context summary
   */
  private buildUserPrompt(): string {
    return `Query: ${this.state.query}

${this.state.getContextSummary()}

Use the tools to inspect the context and provide an answer with evidence.`;
  }

  /**
   * Build result from final answer
   */
  private buildResult(answer: FinalAnswerArgs): RLMResult {
    // Create evidence entries
    const evidence: Evidence[] = answer.evidence.map(chunkId => ({
      claim: answer.answer.slice(0, 100),  // First 100 chars as claim
      sourceChunks: [chunkId],
      confidence: answer.confidence,
      verified: false,  // Will be verified in Phase 3
    }));

    // Add evidence to state
    for (const e of evidence) {
      this.state.addEvidence(e);
    }

    return {
      response: answer.answer,
      evidence: this.state.evidence,
      reasoning: this.state.reasoning,
      tokensUsed: this.state.tokensUsed,
      depth: this.state.depth,
      verified: false,  // Verification in Phase 3
      canRecurse: this.state.canRecurse(),
      refinedQuery: undefined,
    };
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 chars per token for English
    return Math.ceil(text.length / 4);
  }

  // Getters for state inspection
  get depth(): number { return this.state.depth; }
  get tokensUsed(): number { return this.state.tokensUsed; }
  get canRecurseMore(): boolean { return this.state.canRecurse(); }
}
