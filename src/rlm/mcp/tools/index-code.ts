/**
 * index_code MCP Tool
 *
 * Wraps indexDirectory to index a codebase directory.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createQdrantClient } from '../../storage/index.js';
import { indexDirectory } from '../../indexing/index.js';
import { logInfo, logError } from '../logger.js';

const COLLECTION_NAME = process.env.RLM_COLLECTION || 'rlm_chunks';

const indexSchema = {
  path: z.string()
    .min(1)
    .describe("Absolute or relative path to directory to index. Example: '/home/user/project' or './src'")
};

export function registerIndexTool(server: McpServer): void {
  server.tool(
    "index_code",
    "Index a directory to enable code search. Creates embeddings for all supported files (.ts, .js, .tsx, .jsx, .md).\n\nUse this when:\n- User wants to index a new codebase or directory\n- Need to refresh the index after code changes\n- First-time setup before searching\n\nNote: May take 30-60 seconds for large codebases. Returns summary of indexed files.",
    indexSchema,
    async ({ path }) => {
      logInfo('index_code called', { path });

      try {
        const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
        const client = await createQdrantClient({ url: qdrantUrl });

        const startTime = Date.now();
        const result = await indexDirectory(client, COLLECTION_NAME, path);
        const elapsed = Date.now() - startTime;

        const summary = [
          `Indexing complete in ${elapsed}ms`,
          `- Files indexed: ${result.indexed}`,
          `- Files skipped (unchanged): ${result.skipped}`,
        ];

        if (result.errors.length > 0) {
          summary.push(`- Errors: ${result.errors.length}`);
          summary.push('');
          summary.push('First 3 errors:');
          result.errors.slice(0, 3).forEach(err => {
            summary.push(`  - ${err}`);
          });
        }

        logInfo('index_code success', {
          path,
          indexed: result.indexed,
          skipped: result.skipped,
          errors: result.errors.length,
          elapsed
        });

        return {
          content: [{ type: "text" as const, text: summary.join('\n') }]
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError('index_code failed', { path, error: message });

        return {
          content: [{
            type: "text" as const,
            text: `Indexing failed: ${message}\n\nTroubleshooting:\n1. Ensure Qdrant is running (docker run -p 6333:6333 qdrant/qdrant)\n2. Ensure Ollama is running with nomic-embed-text (ollama pull nomic-embed-text)\n3. Verify the path exists and contains supported files`
          }],
          isError: true
        };
      }
    }
  );
}
