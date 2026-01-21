/**
 * RLM Tool Definitions
 *
 * Tools for LLM to inspect context without receiving full text in prompt.
 * Core RLM pattern: context as external environment accessed via tools.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Tool parameter schemas using Zod
export const peekContextSchema = z.object({
  startLine: z.number().describe('Starting line number (0-indexed)'),
  endLine: z.number().describe('Ending line number (inclusive)'),
});

export const searchContextSchema = z.object({
  pattern: z.string().describe('Search pattern (regex supported)'),
});

export const getChunkSchema = z.object({
  chunkId: z.string().describe('ID of chunk to retrieve'),
});

export const subQuerySchema = z.object({
  chunkId: z.string().describe('ID of chunk to query about'),
  question: z.string().describe('Specific question about this chunk'),
});

export const finalAnswerSchema = z.object({
  answer: z.string().describe('The final answer to the query'),
  evidence: z.array(z.string()).describe('Chunk IDs that support the answer'),
  confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
  reasoning: z.string().optional().describe('Brief reasoning explanation'),
});

// Tool definitions for Ollama
export const rlmTools = [
  {
    type: 'function' as const,
    function: {
      name: 'peek_context',
      description: 'View lines from the retrieved context by line range',
      parameters: zodToJsonSchema(peekContextSchema),
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_context',
      description: 'Search the context for a pattern, returns matching lines with chunk IDs',
      parameters: zodToJsonSchema(searchContextSchema),
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_chunk',
      description: 'Get the full content of a specific chunk by ID',
      parameters: zodToJsonSchema(getChunkSchema),
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'sub_query',
      description: 'Ask a sub-question about a specific chunk (triggers recursion)',
      parameters: zodToJsonSchema(subQuerySchema),
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'final_answer',
      description: 'Provide the final answer with evidence citations',
      parameters: zodToJsonSchema(finalAnswerSchema),
    },
  },
];

// Type exports for tool arguments
export type PeekContextArgs = z.infer<typeof peekContextSchema>;
export type SearchContextArgs = z.infer<typeof searchContextSchema>;
export type GetChunkArgs = z.infer<typeof getChunkSchema>;
export type SubQueryArgs = z.infer<typeof subQuerySchema>;
export type FinalAnswerArgs = z.infer<typeof finalAnswerSchema>;
