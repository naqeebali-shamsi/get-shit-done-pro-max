/**
 * RLM Tool Definitions
 *
 * Tools for LLM to inspect context without receiving full text in prompt.
 * Core RLM pattern: context as external environment accessed via tools.
 */

import { z } from 'zod';
import type { Tool } from 'ollama';

// Tool parameter schemas using Zod (for validation)
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

// Tool definitions for Ollama (explicit typing for compatibility)
export const rlmTools: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'peek_context',
      description: 'View lines from the retrieved context by line range',
      parameters: {
        type: 'object',
        required: ['startLine', 'endLine'],
        properties: {
          startLine: {
            type: 'number',
            description: 'Starting line number (0-indexed)',
          },
          endLine: {
            type: 'number',
            description: 'Ending line number (inclusive)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_context',
      description: 'Search the context for a pattern, returns matching lines with chunk IDs',
      parameters: {
        type: 'object',
        required: ['pattern'],
        properties: {
          pattern: {
            type: 'string',
            description: 'Search pattern (regex supported)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_chunk',
      description: 'Get the full content of a specific chunk by ID',
      parameters: {
        type: 'object',
        required: ['chunkId'],
        properties: {
          chunkId: {
            type: 'string',
            description: 'ID of chunk to retrieve',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sub_query',
      description: 'Ask a sub-question about a specific chunk (triggers recursion)',
      parameters: {
        type: 'object',
        required: ['chunkId', 'question'],
        properties: {
          chunkId: {
            type: 'string',
            description: 'ID of chunk to query about',
          },
          question: {
            type: 'string',
            description: 'Specific question about this chunk',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'final_answer',
      description: 'Provide the final answer with evidence citations',
      parameters: {
        type: 'object',
        required: ['answer', 'evidence', 'confidence'],
        properties: {
          answer: {
            type: 'string',
            description: 'The final answer to the query',
          },
          evidence: {
            type: 'array',
            items: { type: 'string' },
            description: 'Chunk IDs that support the answer',
          },
          confidence: {
            type: 'number',
            description: 'Confidence score 0-1',
          },
          reasoning: {
            type: 'string',
            description: 'Brief reasoning explanation',
          },
        },
      },
    },
  },
];

// Type exports for tool arguments
export type PeekContextArgs = z.infer<typeof peekContextSchema>;
export type SearchContextArgs = z.infer<typeof searchContextSchema>;
export type GetChunkArgs = z.infer<typeof getChunkSchema>;
export type SubQueryArgs = z.infer<typeof subQuerySchema>;
export type FinalAnswerArgs = z.infer<typeof finalAnswerSchema>;
