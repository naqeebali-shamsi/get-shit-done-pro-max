/**
 * get_status MCP Tool
 *
 * Wraps getCollectionInfo to check system status.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createQdrantClient, getCollectionInfo } from '../../storage/index.js';
import { logInfo, logError } from '../logger.js';

const COLLECTION_NAME = process.env.RLM_COLLECTION || 'rlm_chunks';

// Empty schema - no parameters needed
const statusSchema = {};

export function registerStatusTool(server: McpServer): void {
  server.tool(
    "get_status",
    "Check the status of the RLM indexing system.\n\nUse this when:\n- Need to verify services are running\n- Want to see how many chunks are indexed\n- Troubleshooting search or index failures\n\nReturns: Connection status for Qdrant, collection name, and chunk count.",
    statusSchema,
    async () => {
      logInfo('get_status called');

      const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
      const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';

      let qdrantStatus = 'disconnected';
      let collectionStatus = 'not found';
      let chunksIndexed = 0;

      try {
        const client = await createQdrantClient({ url: qdrantUrl });

        // Check Qdrant connection
        try {
          await client.getCollections();
          qdrantStatus = 'connected';
        } catch {
          qdrantStatus = 'disconnected';
        }

        // Check collection
        if (qdrantStatus === 'connected') {
          const info = await getCollectionInfo(client, COLLECTION_NAME);
          if (info) {
            collectionStatus = 'exists';
            chunksIndexed = info.points_count;
          }
        }

        const status = [
          '## RLM System Status',
          '',
          `**Qdrant:** ${qdrantStatus} (${qdrantUrl})`,
          `**Ollama:** configured (${ollamaHost})`,
          `**Collection:** ${collectionStatus} (${COLLECTION_NAME})`,
          `**Chunks indexed:** ${chunksIndexed}`,
        ];

        if (qdrantStatus === 'disconnected') {
          status.push('');
          status.push('**Action needed:** Start Qdrant with `docker run -p 6333:6333 qdrant/qdrant`');
        } else if (chunksIndexed === 0) {
          status.push('');
          status.push('**Action needed:** Index your codebase with the index_code tool');
        }

        logInfo('get_status success', { qdrantStatus, collectionStatus, chunksIndexed });

        return {
          content: [{ type: "text" as const, text: status.join('\n') }]
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError('get_status failed', { error: message });

        return {
          content: [{
            type: "text" as const,
            text: `Status check failed: ${message}\n\nEnsure Qdrant is running and accessible at ${qdrantUrl}`
          }],
          isError: true
        };
      }
    }
  );
}
