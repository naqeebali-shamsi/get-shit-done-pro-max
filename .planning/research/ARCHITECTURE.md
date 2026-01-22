# Architecture: MCP Server Integration with RLM

**Domain:** MCP Server for TypeScript codebase integration
**Focus:** Adding MCP server to existing RLM system
**Researched:** 2026-01-22
**Confidence:** HIGH (Context7 not needed - official docs + SDK verified)

## Executive Summary

MCP (Model Context Protocol) servers expose TypeScript functions as tools accessible to Claude Desktop via stdio transport. For the existing RLM system, the recommended architecture wraps `quickRetrieve`, `indexDirectory`, and status functions as MCP tools without modifying core RLM modules. The MCP server lives as a thin facade in `src/rlm/mcp/`, communicating via JSON-RPC over stdin/stdout, with configuration in Claude Desktop's `claude_desktop_config.json`.

**Key Integration Principle:** MCP server = presentation layer, not business logic. Existing RLM modules remain unchanged.

## Recommended Architecture

### Component Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│ Claude Desktop                                               │
│ (Client)                                                     │
└────────────────────┬────────────────────────────────────────┘
                     │ JSON-RPC over stdio
                     │ (stdin/stdout)
                     v
┌─────────────────────────────────────────────────────────────┐
│ NEW: MCP Server Layer                                        │
│ Location: src/rlm/mcp/                                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ server.ts                                             │  │
│  │ - McpServer initialization                            │  │
│  │ - StdioServerTransport setup                          │  │
│  │ - Tool registration                                   │  │
│  │ - Lifecycle management                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ tools/                                                │  │
│  │ - search-tool.ts    (wraps quickRetrieve)             │  │
│  │ - index-tool.ts     (wraps indexDirectory)            │  │
│  │ - status-tool.ts    (wraps getCollectionInfo)         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ index.ts                                              │  │
│  │ - Main entry point for `rlm-mcp` command              │  │
│  │ - Connects server to transport                        │  │
│  │ - Handles graceful shutdown                           │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │ Import/call existing modules
                     v
┌─────────────────────────────────────────────────────────────┐
│ EXISTING: RLM Core Modules (UNCHANGED)                      │
│ Location: src/rlm/                                           │
│                                                              │
│  integration/quick-retrieve.ts  ← Wrapped by search-tool    │
│  indexing/index-directory.ts    ← Wrapped by index-tool     │
│  storage/get-collection-info.ts ← Wrapped by status-tool    │
│                                                              │
│  All other modules: types, chunking, embedding, retrieval,  │
│  engine, evidence, verification, cache, benchmarks          │
└─────────────────────────────────────────────────────────────┘
```

### Integration Points with Existing RLM Components

| Existing Component | MCP Integration | Modification Required |
|-------------------|-----------------|----------------------|
| `integration/quick-retrieve.ts` | Direct import in `search-tool.ts` | **None** - already designed for external calls |
| `indexing/index-directory.ts` | Direct import in `index-tool.ts` | **None** - public API ready |
| `storage/index.ts` | Direct import in `status-tool.ts` | **None** - `getCollectionInfo()` exported |
| `cli/rlm-cli.ts` | Reference implementation | **None** - provides pattern for tool wrappers |
| All other modules | Indirect via above | **None** |

**Critical Insight:** The existing RLM architecture already separates presentation (CLI) from business logic (core modules). MCP server follows the same pattern as another presentation layer.

## New Components Needed for MCP

### 1. Server Entry Point: `src/rlm/mcp/index.ts`

**Responsibility:** Initialize MCP server, connect stdio transport, handle lifecycle.

**Pattern:**
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerSearchTool } from './tools/search-tool.js';
import { registerIndexTool } from './tools/index-tool.js';
import { registerStatusTool } from './tools/status-tool.js';

async function main() {
  const server = new McpServer({
    name: 'rlm-mcp',
    version: '1.0.0',
  }, {
    capabilities: {
      tools: {},  // Declare tool capability
    }
  });

  // Register tools (facades over RLM functions)
  registerSearchTool(server);
  registerIndexTool(server);
  registerStatusTool(server);

  // Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout reserved for JSON-RPC)
  console.error('RLM MCP server running on stdio');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

**Build Order:** Create last after tools are implemented.

### 2. Search Tool: `src/rlm/mcp/tools/search-tool.ts`

**Responsibility:** Wrap `quickRetrieve()` as an MCP tool.

**Pattern:**
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { quickRetrieve } from '../../integration/quick-retrieve.js';
import { formatChunksAsContext } from '../../integration/format-chunks.js';

const searchSchema = z.object({
  query: z.string().describe('Search query for codebase'),
  limit: z.number().optional().default(5).describe('Max results'),
  collectionName: z.string().optional().default('rlm_chunks'),
});

export function registerSearchTool(server: McpServer) {
  server.tool(
    'rlm_search',
    'Search codebase semantically using RLM hybrid retrieval',
    searchSchema,
    async ({ query, limit, collectionName }) => {
      // Set collection via env (quickRetrieve reads process.env.RLM_COLLECTION)
      process.env.RLM_COLLECTION = collectionName;

      const chunks = await quickRetrieve(query, {
        limit,
        timeout: 5000,  // 5s for MCP (vs 500ms for hooks)
      });

      if (chunks.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No relevant code chunks found for query.'
          }]
        };
      }

      const formatted = formatChunksAsContext(chunks, undefined, {
        maxChunks: limit,
        includeConfidence: true,
      });

      return {
        content: [{ type: 'text', text: formatted }]
      };
    }
  );
}
```

**Integration Points:**
- Imports `quickRetrieve` from existing `integration/` module
- Reuses `formatChunksAsContext` for consistent output
- No modifications to core RLM needed

**Build Order:** Create first (tests existing integration contract).

### 3. Index Tool: `src/rlm/mcp/tools/index-tool.ts`

**Responsibility:** Wrap `indexDirectory()` as an MCP tool.

**Pattern:**
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolve } from 'path';
import { createQdrantClient } from '../../storage/index.js';
import { indexDirectory } from '../../indexing/index.js';

const indexSchema = z.object({
  path: z.string().describe('Absolute path to directory to index'),
  collectionName: z.string().optional().default('rlm_chunks'),
});

export function registerIndexTool(server: McpServer) {
  server.tool(
    'rlm_index',
    'Index a directory into RLM for semantic search',
    indexSchema,
    async ({ path, collectionName }) => {
      const absolutePath = resolve(path);

      try {
        const client = await createQdrantClient();
        const result = await indexDirectory(client, collectionName, absolutePath);

        const summary = [
          `Indexed ${result.indexed} chunks`,
          result.skipped > 0 ? `Skipped ${result.skipped} unchanged files` : '',
          result.errors.length > 0 ? `Errors: ${result.errors.length}` : '',
        ].filter(Boolean).join('\n');

        return {
          content: [{ type: 'text', text: summary }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Indexing failed: ${error.message}`
          }],
          isError: true,
        };
      }
    }
  );
}
```

**Integration Points:**
- Imports `createQdrantClient` and `indexDirectory` from existing modules
- Follows CLI pattern from `src/rlm/cli/rlm-cli.ts`
- Error handling mirrors CLI approach

**Build Order:** Create second (depends on storage + indexing modules).

### 4. Status Tool: `src/rlm/mcp/tools/status-tool.ts`

**Responsibility:** Wrap `getCollectionInfo()` as an MCP tool.

**Pattern:**
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createQdrantClient, getCollectionInfo } from '../../storage/index.js';

const statusSchema = z.object({
  collectionName: z.string().optional().default('rlm_chunks'),
});

export function registerStatusTool(server: McpServer) {
  server.tool(
    'rlm_status',
    'Check RLM connection status and collection info',
    statusSchema,
    async ({ collectionName }) => {
      try {
        const client = await createQdrantClient();

        // Test connection
        await client.getCollections();

        // Get collection info
        const info = await getCollectionInfo(client, collectionName);

        if (!info) {
          return {
            content: [{
              type: 'text',
              text: `Connected to Qdrant, but collection '${collectionName}' not found.`
            }]
          };
        }

        const status = [
          'RLM Status:',
          '- Qdrant: connected',
          `- Collection: ${collectionName} (${info.points_count} chunks)`,
        ].join('\n');

        return {
          content: [{ type: 'text', text: status }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Qdrant unavailable: ${error.message}`
          }]
        };
      }
    }
  );
}
```

**Integration Points:**
- Imports storage module functions directly
- No new logic needed - pure facade

**Build Order:** Create third (simple wrapper, good for testing patterns).

## Data Flow

### Tool Invocation Flow

```
1. User in Claude Desktop: "Search for authentication code"
   │
   v
2. Claude Desktop → MCP Server (via stdio)
   Method: tools/call
   Params: { name: "rlm_search", arguments: { query: "authentication" } }
   │
   v
3. MCP Server routes to search-tool.ts handler
   │
   v
4. search-tool.ts calls quickRetrieve(query, options)
   │
   v
5. quickRetrieve (existing RLM module):
   - Gets singleton Qdrant client
   - Calls hybridSearch() with timeout protection
   - Returns Chunk[] or empty array
   │
   v
6. search-tool.ts calls formatChunksAsContext()
   │
   v
7. MCP Server returns formatted text to Claude Desktop
   │
   v
8. Claude Desktop displays results to user
```

**Key Characteristics:**
- Stdio transport: All communication via stdin/stdout (no HTTP)
- JSON-RPC 2.0: Structured request/response format
- Graceful degradation: Tools never throw, return error messages as text
- Stateless: Each tool call is independent
- Timeout protection: Inherited from `quickRetrieve()` implementation

### Configuration Flow

```
1. User adds to ~/.config/Claude/claude_desktop_config.json:
   {
     "mcpServers": {
       "rlm": {
         "command": "node",
         "args": ["dist/rlm/mcp/index.js"],
         "env": {
           "QDRANT_URL": "http://localhost:6333",
           "RLM_COLLECTION": "rlm_chunks"
         }
       }
     }
   }
   │
   v
2. Claude Desktop starts MCP server as subprocess on launch
   - Spawns: node dist/rlm/mcp/index.js
   - Pipes stdin/stdout for JSON-RPC
   - Injects env vars
   │
   v
3. MCP server calls server.connect(transport)
   - Listens for JSON-RPC on stdin
   - Sends responses to stdout
   - Logs to stderr
   │
   v
4. Claude Desktop discovers tools via tools/list request
   - Gets: rlm_search, rlm_index, rlm_status with schemas
   │
   v
5. Tools available in Claude Desktop UI
   - User can invoke via natural language
   - Claude decides when to call tools
```

## Patterns to Follow

### Pattern 1: Tool Registration

**What:** Register tools using SDK's `server.tool()` method with Zod schemas.

**When:** For every RLM function exposed via MCP.

**Example:**
```typescript
server.tool(
  'tool_name',                    // Tool identifier
  'Human-readable description',   // Shown to Claude/user
  zodSchema,                      // Input validation
  async (args) => {
    // Call existing RLM function
    const result = await existingFunction(args.param);

    // Return MCP response format
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);
```

**Why:** SDK handles JSON-RPC protocol, validation, error serialization automatically.

### Pattern 2: Facade Over Existing Functions

**What:** MCP tool handlers are thin wrappers (5-20 lines) that import and call existing RLM functions.

**When:** Always. Never implement business logic in tool handlers.

**Example:**
```typescript
// GOOD: Thin facade
export function registerSearchTool(server: McpServer) {
  server.tool('rlm_search', 'Search codebase', schema, async (args) => {
    const chunks = await quickRetrieve(args.query, args.options);  // Existing
    return formatResponse(chunks);  // Simple formatting
  });
}

// BAD: Business logic in tool
export function registerSearchTool(server: McpServer) {
  server.tool('rlm_search', 'Search codebase', schema, async (args) => {
    // Don't: Reimplementing embedding, search, ranking here
    const embedding = await generateEmbedding(args.query);
    const results = await qdrant.search(...);
    const ranked = rerank(results);
    return formatResponse(ranked);
  });
}
```

**Why:** Keeps MCP layer disposable. Business logic tested independently.

### Pattern 3: Graceful Degradation

**What:** Tool handlers return error messages as text, never throw exceptions.

**When:** Any operation that might fail (Qdrant unavailable, indexing error, etc.).

**Example:**
```typescript
server.tool('rlm_index', 'Index directory', schema, async (args) => {
  try {
    const result = await indexDirectory(client, collection, args.path);
    return { content: [{ type: 'text', text: `Indexed ${result.indexed} chunks` }] };
  } catch (error) {
    // Return error as content, not exception
    return {
      content: [{ type: 'text', text: `Indexing failed: ${error.message}` }],
      isError: true,  // Optional flag
    };
  }
});
```

**Why:** Claude Desktop expects text responses. Exceptions break conversation flow.

### Pattern 4: Stderr Logging Only

**What:** Use `console.error()` for all logging. Never `console.log()`.

**When:** Always in MCP servers using stdio transport.

**Example:**
```typescript
// GOOD
console.error('RLM MCP server started');
console.error(`Processing search: ${query}`);

// BAD - corrupts JSON-RPC stream
console.log('Server started');
```

**Why:** Stdout is reserved for JSON-RPC messages. Writing to stdout corrupts protocol.

### Pattern 5: Environment-Based Configuration

**What:** Read configuration from environment variables set by Claude Desktop.

**When:** For Qdrant URL, collection names, timeouts, etc.

**Example:**
```typescript
// In tool handler
const collectionName = process.env.RLM_COLLECTION || 'rlm_chunks';
const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';

// In Claude Desktop config
{
  "mcpServers": {
    "rlm": {
      "env": {
        "QDRANT_URL": "http://localhost:6333",
        "RLM_COLLECTION": "my_project"
      }
    }
  }
}
```

**Why:** Allows per-project configuration without changing server code.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Modifying RLM Core for MCP

**What:** Changing existing RLM modules to add MCP-specific code.

**Why bad:** Creates tight coupling. Makes RLM dependent on MCP SDK. Harder to test.

**Instead:** Keep MCP server as separate presentation layer. Use existing public APIs.

### Anti-Pattern 2: HTTP Transport for Local Development

**What:** Using `StreamableHTTPServerTransport` instead of stdio.

**Why bad:**
- Requires port management
- Adds CORS complexity
- Stdio is standard for Claude Desktop
- HTTP intended for remote/production servers

**Instead:** Use `StdioServerTransport` for Claude Desktop integration. HTTP only for web deployments.

### Anti-Pattern 3: Synchronous Tool Handlers

**What:** Tool handlers that block or don't return promises.

**Why bad:**
- Long-running operations freeze Claude Desktop
- No timeout protection
- Poor user experience

**Instead:** Use async handlers with timeout protection (inherited from `quickRetrieve`).

### Anti-Pattern 4: Putting Multiple Tools in One File

**What:** Registering all tools in `index.ts` with inline handlers.

**Why bad:**
- Hard to test individual tools
- Violates single responsibility
- Makes tool code hard to find

**Instead:** One tool per file in `tools/` directory, imported by `index.ts`.

### Anti-Pattern 5: Using `console.log` in Stdio Servers

**What:** Writing debug output to stdout.

**Why bad:** Corrupts JSON-RPC message stream. Server appears broken to Claude Desktop.

**Instead:** Write logs to stderr (`console.error`) or log files.

## Scalability Considerations

### At 100 Users (Current Scope)

| Concern | Approach |
|---------|----------|
| Concurrent requests | Single-user Claude Desktop = single MCP server process (no concurrency) |
| Memory usage | Singleton Qdrant client in `quickRetrieve` prevents connection leaks |
| Connection pooling | Not needed - one client per server process |
| Caching | Embedding cache in RLM already handles repeated queries |

### At 10K Users (Future: Multi-Tenant MCP)

| Concern | Approach |
|---------|----------|
| Concurrent requests | Switch to HTTP transport with connection pooling |
| Memory usage | Per-user resource limits, LRU cache eviction |
| Connection pooling | Qdrant client pool (5-10 connections) |
| Collection isolation | Per-user or per-org collections |

### At 1M Users (Out of Scope)

| Concern | Approach |
|---------|----------|
| Architecture | Distributed MCP gateway, separate Qdrant cluster |
| Transport | HTTP/2 or gRPC for efficiency |
| Caching | Redis for distributed embedding cache |
| Observability | Structured logging, tracing, metrics |

**Current Milestone (v1.1):** Single-user stdio transport only. Scalability not a concern.

## Server Lifecycle

### Startup Sequence

```
1. User launches Claude Desktop
   │
   v
2. Claude Desktop reads claude_desktop_config.json
   │
   v
3. For each configured server, Claude Desktop spawns subprocess:
   $ node dist/rlm/mcp/index.js
   │
   v
4. MCP server index.ts:
   - Creates McpServer instance
   - Registers tools (search, index, status)
   - Creates StdioServerTransport
   - Calls server.connect(transport)
   │
   v
5. server.connect() blocks, listening for JSON-RPC on stdin
   │
   v
6. Claude Desktop sends initialization request
   - Server responds with capabilities: { tools: {} }
   │
   v
7. Claude Desktop sends tools/list request
   - Server responds with tool schemas
   │
   v
8. Server ready, tools available in UI
```

### Shutdown Sequence

```
1. User quits Claude Desktop (Cmd+Q or quit menu)
   │
   v
2. Claude Desktop closes stdin pipe to MCP server
   │
   v
3. MCP server stdio transport detects EOF on stdin
   │
   v
4. Transport emits 'close' event
   │
   v
5. Server cleanup (if registered):
   - Close Qdrant connections
   - Flush any pending operations
   - Exit process
   │
   v
6. Process terminates
```

**Graceful Shutdown Pattern:**
```typescript
process.on('SIGTERM', async () => {
  console.error('Received SIGTERM, shutting down...');
  // Cleanup if needed
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.error('Received SIGINT, shutting down...');
  process.exit(0);
});
```

## Configuration and Environment Handling

### Claude Desktop Configuration

**Location:** `~/.config/Claude/claude_desktop_config.json` (macOS/Linux) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

**Format:**
```json
{
  "mcpServers": {
    "rlm": {
      "command": "node",
      "args": [
        "/absolute/path/to/get-shit-done-pro-max/dist/rlm/mcp/index.js"
      ],
      "env": {
        "QDRANT_URL": "http://localhost:6333",
        "RLM_COLLECTION": "rlm_chunks",
        "OLLAMA_URL": "http://localhost:11434"
      }
    }
  }
}
```

**Critical Details:**
- **Absolute paths required** - No tilde expansion, no relative paths
- **Restart required** - Changes take effect after full Claude Desktop restart (quit + relaunch)
- **env object optional** - Defaults used if not specified
- **command can be npx** - For published packages: `"command": "npx", "args": ["@yourorg/rlm-mcp"]`

### Environment Variables Read by RLM

| Variable | Used By | Default | Purpose |
|----------|---------|---------|---------|
| `QDRANT_URL` | `createQdrantClient()` | `http://localhost:6333` | Qdrant server URL |
| `RLM_COLLECTION` | `quickRetrieve()` | `codebase` | Collection name |
| `OLLAMA_URL` | Embedding module | `http://localhost:11434` | Ollama server URL |

**Configuration Flow:**
```
Claude Desktop config.json env vars
  → process.env in MCP server process
  → Read by RLM modules (storage, integration, embedding)
```

### Per-Project Configuration

**Scenario:** User wants different collections for different projects.

**Solution:** Multiple MCP server entries in config:

```json
{
  "mcpServers": {
    "rlm-project-a": {
      "command": "node",
      "args": ["/path/to/dist/rlm/mcp/index.js"],
      "env": { "RLM_COLLECTION": "project_a" }
    },
    "rlm-project-b": {
      "command": "node",
      "args": ["/path/to/dist/rlm/mcp/index.js"],
      "env": { "RLM_COLLECTION": "project_b" }
    }
  }
}
```

User selects server in Claude Desktop UI when invoking tools.

## Build Order and Dependencies

### Build Order (Recommended Sequence)

```
Phase 1: Foundation
1. Install dependencies: @modelcontextprotocol/sdk, zod
2. Create directory structure: src/rlm/mcp/, src/rlm/mcp/tools/
3. Add build output to package.json bin: "rlm-mcp": "dist/rlm/mcp/index.js"

Phase 2: Tools (Parallel - No Dependencies)
4. Implement tools/search-tool.ts (uses quickRetrieve)
5. Implement tools/status-tool.ts (uses getCollectionInfo)
6. Implement tools/index-tool.ts (uses indexDirectory)

Phase 3: Server
7. Implement index.ts (registers tools, connects transport)
8. Add npm script: "build:mcp": "tsc -p tsconfig.json"
9. Test locally: node dist/rlm/mcp/index.js (should log to stderr)

Phase 4: Integration
10. Document Claude Desktop configuration
11. Test with Claude Desktop
12. Add error handling and logging
```

### Dependency Graph

```
index.ts
├─ tools/search-tool.ts
│  ├─ integration/quick-retrieve.ts (existing)
│  └─ integration/format-chunks.ts (existing)
├─ tools/index-tool.ts
│  ├─ storage/index.ts (existing)
│  └─ indexing/index-directory.ts (existing)
└─ tools/status-tool.ts
   └─ storage/index.ts (existing)
```

**No circular dependencies.** MCP layer imports from RLM, never the reverse.

### Testing Strategy

```
Unit Tests (per tool):
- tools/search-tool.test.ts
  - Mock quickRetrieve to return test chunks
  - Verify tool returns formatted text
  - Verify error handling when quickRetrieve returns empty

- tools/index-tool.test.ts
  - Mock indexDirectory to return result
  - Verify tool formats summary correctly
  - Verify error messages on failure

- tools/status-tool.test.ts
  - Mock getCollectionInfo
  - Verify status message formatting
  - Verify "not connected" handling

Integration Tests:
- test/mcp-server.integration.test.ts
  - Spawn MCP server as subprocess
  - Send JSON-RPC messages via stdin
  - Parse responses from stdout
  - Verify tool discovery, invocation, error responses
```

## File Structure Summary

```
src/rlm/mcp/
├── index.ts                    # Main entry point, server setup
├── tools/
│   ├── search-tool.ts          # rlm_search tool
│   ├── index-tool.ts           # rlm_index tool
│   └── status-tool.ts          # rlm_status tool
└── README.md                   # Setup instructions for Claude Desktop

dist/rlm/mcp/                   # Compiled output (gitignored)
├── index.js
└── tools/
    ├── search-tool.js
    ├── index-tool.js
    └── status-tool.js

package.json                    # Add bin: { "rlm-mcp": "dist/rlm/mcp/index.js" }
tsconfig.json                   # Already configured for ES modules
```

**Total New Files:** 5 TypeScript files (~300 LOC total)

## Key Takeaways

1. **MCP server = thin presentation layer** - Wraps existing RLM functions without modifying them
2. **Stdio transport for Claude Desktop** - JSON-RPC over stdin/stdout, logs to stderr
3. **One tool per file** - Separation of concerns, easier testing
4. **Graceful degradation** - Tools return error messages, never throw
5. **Configuration via env vars** - Claude Desktop injects env, RLM modules read them
6. **No circular dependencies** - MCP imports RLM, never the reverse
7. **Build order:** Tools first (parallel), then server assembly
8. **Absolute paths in config** - Claude Desktop requirement

## Sources

**HIGH Confidence - Official Documentation:**
- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk)
- [Building MCP Servers Guide](https://modelcontextprotocol.io/docs/develop/build-server)
- [@modelcontextprotocol/sdk on npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk)

**MEDIUM Confidence - Community Tutorials (2025-2026):**
- [Let's Build TypeScript MCP Server and Connect to Claude Desktop](https://apidog.com/blog/mcp-server-connect-claude-desktop/)
- [How to Build MCP Servers with TypeScript SDK](https://dev.to/shadid12/how-to-build-mcp-servers-with-typescript-sdk-1c28)
- [Building a TypeScript MCP Server: A Guide for Integrating Existing Services](https://medium.com/@jageenshukla/building-a-typescript-mcp-server-a-guide-for-integrating-existing-services-5bde3fc13b23)
- [MCP Server Configuration Best Practices](https://www.stainless.com/mcp/mcp-server-configuration-best-practices)
- [MCP Server Project Structure Best Practices](https://milvus.io/ai-quick-reference/what-is-the-recommended-filefolder-structure-for-an-model-context-protocol-mcp-server-project)

**Verification:** All patterns cross-verified with official specification and SDK examples. Architecture matches established TypeScript MCP server patterns from 2025-2026.

---

*Research complete: 2026-01-22*
*Ready for roadmap creation*
