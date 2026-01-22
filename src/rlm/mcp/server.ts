#!/usr/bin/env node
/**
 * RLM MCP Server - Model Context Protocol server for Claude Desktop
 *
 * Exposes RLM capabilities via MCP tools:
 * - search_code: Search indexed codebase
 * - index_code: Index a directory
 * - get_status: Check system status
 *
 * Phase 6: MCP Server Foundation
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logInfo, logError } from './logger.js';
import { registerSearchTool } from './tools/search.js';
import { registerIndexTool } from './tools/index-code.js';
import { registerStatusTool } from './tools/status.js';

const VERSION = '1.0.0';

async function main(): Promise<void> {
  logInfo('Starting RLM MCP server', { version: VERSION });

  const server = new McpServer({
    name: 'rlm-mcp',
    version: VERSION,
  });

  // Register all tools
  registerSearchTool(server);
  registerIndexTool(server);
  registerStatusTool(server);

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logInfo('Connected to stdio transport');
}

main().catch((err) => {
  logError('Fatal error', { message: err.message, stack: err.stack });
  process.exit(1);
});

export { main };
