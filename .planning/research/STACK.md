# Technology Stack: MCP Server Addition

**Project:** RLM MCP Server
**Researched:** 2026-01-22
**Confidence:** HIGH (official SDK, current versions verified)

## Executive Summary

Adding MCP server capability to the existing RLM system requires minimal new dependencies. The stack centers on the official `@modelcontextprotocol/sdk` package (v1.x stable) with stdio transport for Claude Desktop integration. All RLM functionality already exists in TypeScript under `src/rlm/` - the MCP server acts as a thin wrapper exposing three tools: search, index, and status.

**Key principle:** This is a wrapping layer, not a rewrite. Reuse existing RLM modules entirely.

---

## New Dependencies Required

### Core MCP Package

| Package | Version | Purpose | Why |
|---------|---------|---------|-----|
| **@modelcontextprotocol/sdk** | ^1.25.2 | MCP protocol implementation | Official TypeScript SDK. v1.x is production-stable (v2 coming Q1 2026). Provides `McpServer` class and `StdioServerTransport` for Claude Desktop. [HIGH confidence - npm registry, 1/22/2026] |

**Note:** SDK v1.25.2 is the latest stable as of January 22, 2026. A v2 release is anticipated in Q1 2026, but v1.x will receive 6+ months of support post-v2 for migration time.

### Already Available (No Changes)

The existing `package.json` already includes everything needed for RLM functionality:

```json
{
  "dependencies": {
    "@qdrant/js-client-rest": "^1.16.2",  // Vector storage
    "ollama": "^0.6.0",                    // Embeddings
    "web-tree-sitter": "^0.26.3",          // AST parsing
    "tree-sitter-javascript": "^0.23.0",
    "tree-sitter-typescript": "^0.23.0",
    "zod": "^3.23.8"                       // Schema validation (peer dep for MCP SDK)
  }
}
```

**Critical:** `zod` is already present at `^3.23.8`. The MCP SDK requires zod as a peer dependency and is compatible with v3.25+. Our existing version is compatible.

---

## Installation Command

```bash
npm install @modelcontextprotocol/sdk@^1.25.2
```

That's it. One package.

---

## Integration Points with Existing RLM

The MCP server will import and wrap existing RLM modules without modification.

### Module Imports (All Existing)

```typescript
// From src/rlm/integration/
import { quickRetrieve } from '../integration/quick-retrieve.js';
import { formatChunksAsContext } from '../integration/context-formatter.js';

// From src/rlm/indexing/
import { indexDirectory } from '../indexing/indexer.js';

// From src/rlm/storage/
import { createQdrantClient, getCollectionInfo } from '../storage/qdrant-client.js';
```

**Zero modifications needed.** These modules export exactly what MCP tools need.

### RLM Capabilities Already Built

| RLM Module | What It Does | MCP Tool Mapping |
|------------|--------------|------------------|
| `quickRetrieve()` | Semantic search with 500ms timeout, graceful degradation | → `rlm_search` tool |
| `indexDirectory()` | AST-aware chunking + Qdrant indexing | → `rlm_index` tool |
| `getCollectionInfo()` | Qdrant connection check, collection status | → `rlm_status` tool |
| `formatChunksAsContext()` | Format search results as markdown context | Used by `rlm_search` |

---

## MCP Server Architecture Pattern

### File Structure

```
src/rlm/mcp/
├── server.ts          # Main MCP server (imports McpServer, StdioServerTransport)
├── tools/
│   ├── search.ts      # rlm_search tool (wraps quickRetrieve)
│   ├── index.ts       # rlm_index tool (wraps indexDirectory)
│   └── status.ts      # rlm_status tool (wraps getCollectionInfo)
└── types.ts           # MCP-specific types (tool schemas)
```

### Minimal Server Template

Based on official MCP documentation:

```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "rlm-server",
  version: "1.0.0",
});

// Register tool with zod schema
server.registerTool(
  "rlm_search",
  {
    description: "Search codebase semantically",
    inputSchema: {
      query: z.string().describe("Search query"),
      limit: z.number().optional().describe("Max results (default: 5)"),
    },
  },
  async ({ query, limit }) => {
    // Call existing RLM function
    const chunks = await quickRetrieve(query, { limit });
    const context = formatChunksAsContext(chunks);

    return {
      content: [{ type: "text", text: context }],
    };
  }
);

// Start server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("RLM MCP Server running"); // stderr for logging
}

main();
```

**Key patterns:**
- **Shebang (`#!/usr/bin/env node`)** - Makes compiled output executable
- **StdioServerTransport** - Required for Claude Desktop (only transport supported)
- **console.error()** - CRITICAL: Never use `console.log()` (corrupts stdio JSON-RPC)
- **Zod schemas** - Define tool input validation (existing dep)
- **Async tool handlers** - Return `{ content: [{ type: "text", text: "..." }] }`

---

## Build Configuration Updates

### TypeScript Config Extension

Create `tsconfig.mcp.json` extending existing config:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist/mcp",
    "rootDir": "src/rlm/mcp"
  },
  "include": ["src/rlm/mcp/**/*"]
}
```

**Why separate?** Existing `tsconfig.json` outputs to `dist/rlm` with rootDir `src/rlm`. MCP server needs its own build to avoid conflicts.

### Package.json Updates

```json
{
  "bin": {
    "rlm": "dist/rlm/cli/rlm-cli.js",
    "rlm-mcp": "dist/mcp/server.js"  // Add MCP server executable
  },
  "scripts": {
    "build:rlm": "tsc -p tsconfig.json",
    "build:mcp": "tsc -p tsconfig.mcp.json",
    "build": "npm run build:rlm && npm run build:mcp"
  }
}
```

### Post-Build: Make Executable

```bash
chmod +x dist/mcp/server.js
```

**Windows note:** Not needed on Windows, but harmless. Claude Desktop on Windows handles Node.js scripts via `node` command.

---

## Claude Desktop Configuration

MCP servers are configured in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rlm": {
      "command": "node",
      "args": [
        "/absolute/path/to/get-shit-done-pro-max/dist/mcp/server.js"
      ],
      "env": {
        "RLM_COLLECTION": "rlm_chunks",
        "QDRANT_URL": "http://localhost:6333"
      }
    }
  }
}
```

**Critical details:**
- **Absolute paths required** - Claude Desktop doesn't resolve relative paths
- **stdio transport implicit** - Claude Desktop only supports stdio (no HTTP config needed)
- **Environment variables** - Pass RLM config (collection name, Qdrant URL)
- **Restart required** - Claude Desktop must restart to load new server config

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **@modelcontextprotocol/server** | Deprecated separate package | `@modelcontextprotocol/sdk` (unified package) |
| **HTTP transport packages** | Claude Desktop only supports stdio | `StdioServerTransport` from SDK |
| **Express/Hono middleware** | Not needed for local stdio servers | Direct stdio transport |
| **Additional schema libraries** | Zod already present | Existing `zod@^3.23.8` |
| **New embedding/storage packages** | RLM already has Ollama + Qdrant | Reuse existing infrastructure |
| **Error tracking SDKs** | Adds bloat to local tool | `console.error()` + MCP tool error responses |

---

## Runtime Dependencies (Already Satisfied)

The MCP server requires these external services, already running for RLM:

| Service | Purpose | Setup |
|---------|---------|-------|
| **Qdrant** | Vector storage (collections, search) | `docker run -p 6333:6333 qdrant/qdrant:v1.16.2` |
| **Ollama** | Embedding generation | Already installed, with `nomic-embed-text` model |

**No additional services needed.** MCP server piggybacks on existing RLM infrastructure.

---

## Version Compatibility Matrix

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| @modelcontextprotocol/sdk | 1.25.2 | Zod 3.23+ | Our `zod@^3.23.8` is compatible |
| @modelcontextprotocol/sdk | 1.25.2 | Node.js 18+ | Our `engines.node: ">=16.7.0"` supports it |
| MCP SDK v1.x | 1.25.2 | Claude Desktop (current) | Stable production version |
| Existing RLM modules | Current | MCP server | Zero changes needed |

**Upgrade path:** When MCP SDK v2 releases (Q1 2026), v1.x will have 6+ months support window for migration.

---

## Development Workflow

### Build and Test Locally

```bash
# Build MCP server
npm run build:mcp

# Test manually (simulates Claude Desktop stdio)
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/mcp/server.js

# Configure in Claude Desktop
# Edit claude_desktop_config.json with absolute path to dist/mcp/server.js

# Restart Claude Desktop
# Tools appear in Claude's tool picker
```

### Debugging

```bash
# MCP server logs go to stderr (visible in Claude Desktop logs)
# On macOS: ~/Library/Logs/Claude/mcp-server-rlm.log
# On Windows: %APPDATA%\Claude\logs\mcp-server-rlm.log

# Check Qdrant connection from MCP context
rlm-mcp status  # Should work via npx after npm install -g
```

---

## Performance Considerations

| Operation | Latency | Notes |
|-----------|---------|-------|
| MCP tool call overhead | <5ms | JSON-RPC parsing minimal |
| `rlm_search` total time | ~133ms | 80ms embed + 53ms search (from benchmarks) |
| `rlm_index` per file | ~50-200ms | Depends on file size, AST parsing |
| `rlm_status` | <20ms | Simple Qdrant API call |
| stdio transport | <1ms | Local process IPC |

**MCP adds negligible overhead.** Existing RLM latency targets remain valid (~500ms timeout for quickRetrieve).

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| **MCP SDK** | @modelcontextprotocol/sdk | Custom JSON-RPC implementation | Official SDK handles protocol details, version updates |
| **Transport** | StdioServerTransport | HTTP transport | Claude Desktop only supports stdio for local servers |
| **Schema validation** | Zod (existing) | JSON Schema directly | MCP SDK uses Zod internally, better TypeScript DX |
| **Tool structure** | Separate tool files | Monolithic server.ts | Better maintainability, mirrors existing CLI structure |

---

## Implementation Checklist

- [ ] Install `@modelcontextprotocol/sdk@^1.25.2`
- [ ] Create `src/rlm/mcp/` directory structure
- [ ] Create `tsconfig.mcp.json` extending main config
- [ ] Implement `rlm_search` tool (wraps `quickRetrieve`)
- [ ] Implement `rlm_index` tool (wraps `indexDirectory`)
- [ ] Implement `rlm_status` tool (wraps `getCollectionInfo`)
- [ ] Create main `server.ts` with McpServer setup
- [ ] Add shebang (`#!/usr/bin/env node`) to compiled output
- [ ] Update `package.json` scripts and bin entries
- [ ] Build with `npm run build:mcp`
- [ ] Configure in `claude_desktop_config.json`
- [ ] Test tools from Claude Desktop

---

## Sources

### Official Documentation (HIGH Confidence)
- [MCP TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk) - Package structure, v2 timeline [1/22/2026]
- [Build an MCP Server - MCP Docs](https://modelcontextprotocol.io/docs/develop/build-server) - Tool registration, stdio transport patterns
- [Connect to Local Servers - MCP Docs](https://modelcontextprotocol.io/docs/develop/connect-local-servers) - Claude Desktop config format
- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) - Version 1.25.2 verification
- [Claude Desktop MCP Setup Guide](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) - Configuration requirements

### Community Resources (MEDIUM Confidence)
- [DEV: Build MCP Servers with TypeScript SDK](https://dev.to/shadid12/how-to-build-mcp-servers-with-typescript-sdk-1c28) - Tool implementation patterns
- [FreeCodeCamp: Custom MCP Server Handbook](https://www.freecodecamp.org/news/how-to-build-a-custom-mcp-server-with-typescript-a-handbook-for-developers/) - Complete examples
- [Hackteam: Build MCP Server Tutorial](https://hackteam.io/blog/build-your-first-mcp-server-with-typescript-in-under-10-minutes/) - Quick start patterns
- [Generect: Ultimate Guide to Claude MCP](https://generect.com/blog/claude-mcp/) - 2026 configuration updates

### WebSearch Findings (LOW-MEDIUM Confidence, Verified)
- Multiple sources confirm v1.25.2 as latest stable (1/22/2026)
- v2 release consistently mentioned for Q1 2026 across sources
- stdio-only transport for Claude Desktop confirmed across docs
- Zod peer dependency requirement consistent in all tutorials

---

## Summary for Roadmap

**New dependencies:** 1 package (`@modelcontextprotocol/sdk`)
**Code reuse:** 100% of RLM functionality (zero changes to existing modules)
**Integration complexity:** Low (thin wrapper pattern)
**Build changes:** Minimal (separate tsconfig, new bin entry)
**Testing surface:** 3 tools × existing RLM functionality (already validated)

This is an **additive milestone** - extends existing capability without modifying core RLM architecture.

---

*Stack research for: RLM MCP Server Addition*
*Researched: 2026-01-22*
*Confidence: HIGH (official sources, current versions verified)*
