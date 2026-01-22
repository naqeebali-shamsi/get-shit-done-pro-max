/**
 * search_code MCP Tool
 *
 * Wraps hybridSearch to search indexed codebase.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createQdrantClient } from '../../storage/index.js';
import { hybridSearch } from '../../retrieval/hybrid-search.js';
import { logInfo, logError } from '../logger.js';

const COLLECTION_NAME = process.env.RLM_COLLECTION || 'rlm_chunks';

const searchSchema = {
  query: z.string()
    .min(1)
    .max(500)
    .describe("Natural language query describing what code to find. Example: 'authentication middleware' or 'how does user validation work'"),
  limit: z.number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe("Maximum number of results to return (default: 5, max: 20)")
};

export function registerSearchTool(server: McpServer): void {
  server.tool(
    "search_code",
    "Search the indexed codebase for relevant code, functions, or documentation.\n\nUse this when:\n- User asks about specific code functionality\n- Need to find how a feature is implemented\n- Looking for examples of a pattern in the codebase\n- Want to understand code structure\n\nReturns: Array of code chunks with file paths, line numbers, and relevance scores.",
    searchSchema,
    async ({ query, limit }) => {
      logInfo('search_code called', { query, limit });

      try {
        const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
        const client = await createQdrantClient({ url: qdrantUrl });

        const results = await hybridSearch(client, COLLECTION_NAME, query, { limit });

        if (results.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: `No matches found for "${query}".\n\nSuggestions:\n- Try broader search terms\n- Verify the codebase is indexed (use get_status tool)\n- Check if the code you're looking for exists`
            }]
          };
        }

        // Format results as structured text (TOON formatting added in Plan 02)
        const formatted = results.map((r, i) => {
          const { path, start_line, end_line } = r.chunk.metadata;
          const score = Math.round(r.score * 100);
          return `## Result ${i + 1} (${score}% relevance)\nFile: ${path}\nLines: ${start_line}-${end_line}\n\n\`\`\`\n${r.chunk.text}\n\`\`\``;
        }).join('\n\n---\n\n');

        logInfo('search_code success', { query, results: results.length });

        return {
          content: [{ type: "text" as const, text: formatted }]
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError('search_code failed', { query, error: message });

        return {
          content: [{
            type: "text" as const,
            text: `Search failed: ${message}\n\nTroubleshooting:\n1. Ensure Qdrant is running (docker run -p 6333:6333 qdrant/qdrant)\n2. Ensure Ollama is running (ollama serve)\n3. Verify codebase is indexed (rlm index .)`
          }],
          isError: true
        };
      }
    }
  );
}
