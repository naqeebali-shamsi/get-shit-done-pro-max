# Phase 6: MCP Server Foundation - Research

**Researched:** 2026-01-22
**Domain:** Model Context Protocol (MCP) Server with stdio transport
**Confidence:** HIGH

## Summary

This research covers the implementation requirements for wrapping the existing RLM system as an MCP server for Claude Desktop integration. The primary technologies are the `@modelcontextprotocol/sdk` for the server framework and `@toon-format/toon` for token-optimized response formatting.

The existing RLM codebase already has well-structured APIs for hybrid search (`hybridSearch`), directory indexing (`indexDirectory`), and collection status (`getCollectionInfo`). The MCP server will be a thin wrapper layer that handles protocol communication while delegating to these existing functions. The critical success factor is stdout/stderr discipline - as documented in PITFALLS_MCP.md, any non-JSON-RPC output to stdout will break the protocol.

**Primary recommendation:** Create a single MCP server entry point at `src/rlm/mcp/server.ts` that imports existing RLM APIs and exposes three tools (search_code, index_code, get_status) with TOON-formatted responses for search results.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | latest | MCP server framework | Official TypeScript SDK from Anthropic |
| @toon-format/toon | ^1.x | Token-optimized formatting | 30-60% token reduction for array data |
| zod | ^3.25+ | Input schema validation | Required peer dependency for MCP SDK |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @qdrant/js-client-rest | ^1.16.2 | Vector database client | Already used by RLM storage layer |
| ollama | ^0.6.0 | Embedding generation | Already used by RLM embedding layer |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @modelcontextprotocol/sdk | mcp-framework | mcp-framework adds magic, SDK is simpler/explicit |
| @toon-format/toon | JSON | JSON uses 30-60% more tokens for uniform arrays |
| zod | JSON Schema manually | zod provides TypeScript types + runtime validation |

**Installation:**
```bash
npm install @modelcontextprotocol/sdk @toon-format/toon
```

Note: zod ^3.23.8 is already installed in the project.

## Architecture Patterns

### Recommended Project Structure
```
src/rlm/
├── mcp/
│   ├── server.ts           # Entry point: McpServer + StdioServerTransport
│   ├── tools/
│   │   ├── search.ts       # search_code tool handler
│   │   ├── index.ts        # index_code tool handler
│   │   └── status.ts       # get_status tool handler
│   ├── formatters/
│   │   └── toon-formatter.ts  # TOON formatting for search results
│   └── index.ts            # Re-exports for programmatic use
├── indexing/               # (existing) - indexDirectory API
├── retrieval/              # (existing) - hybridSearch API
├── storage/                # (existing) - getCollectionInfo API
└── integration/            # (existing) - quickRetrieve, formatters
```

### Pattern 1: MCP Server Initialization (stdio)
**What:** Basic server setup with stdio transport for Claude Desktop
**When to use:** All MCP server implementations using stdio
**Example:**
```typescript
// Source: https://github.com/modelcontextprotocol/typescript-sdk
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "rlm-mcp",
  version: "1.0.0",
});

// Register tools using server.tool()
server.tool(
  "search_code",
  {
    query: z.string().describe("Natural language search query"),
    limit: z.number().int().min(1).max(20).default(5)
  },
  async ({ query, limit }) => {
    // Handler returns { content: [...], isError?: boolean }
    return {
      content: [{ type: "text", text: "results here" }]
    };
  }
);

// Connect to stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Pattern 2: Tool Handler with Error Handling
**What:** Proper error handling that returns structured errors
**When to use:** Every tool handler
**Example:**
```typescript
// Source: https://mcpcat.io/guides/adding-custom-tools-mcp-server-typescript/
server.tool("search_code", schema, async (args) => {
  try {
    const results = await hybridSearch(client, collection, args.query, {
      limit: args.limit
    });

    if (results.length === 0) {
      return {
        content: [{
          type: "text",
          text: `No results found for "${args.query}". Try broader search terms.`
        }]
      };
    }

    return {
      content: [{ type: "text", text: formatResults(results) }]
    };
  } catch (error) {
    // Return error with isError flag
    return {
      content: [{
        type: "text",
        text: `Search failed: ${error.message}\n\nEnsure Qdrant and Ollama are running.`
      }],
      isError: true
    };
  }
});
```

### Pattern 3: TOON Formatting for Search Results
**What:** Token-optimized formatting for arrays of search results
**When to use:** Formatting search_code tool responses
**Example:**
```typescript
// Source: https://toonformat.dev/reference/api
import { encode } from '@toon-format/toon';

interface SearchResultFormatted {
  path: string;
  lines: string;  // "10-25"
  score: number;
  code: string;
}

function formatSearchResultsTOON(results: SearchResult[]): string {
  const formatted: SearchResultFormatted[] = results.map(r => ({
    path: r.chunk.metadata.path,
    lines: `${r.chunk.metadata.start_line}-${r.chunk.metadata.end_line}`,
    score: Math.round(r.score * 100),
    code: r.chunk.text
  }));

  // TOON format: 30-60% fewer tokens than JSON for uniform arrays
  return encode(formatted, {
    indent: 1,        // Minimal indentation for LLM consumption
    delimiter: '\t'   // Tab delimiter often tokenizes better
  });
}
```

### Pattern 4: Stderr-Only Logging
**What:** Ensuring all logs go to stderr, stdout reserved for JSON-RPC
**When to use:** All logging in MCP server code
**Example:**
```typescript
// CRITICAL: Never use console.log() in MCP server code
// Source: PITFALLS_MCP.md - Pitfall 1

// Good: Direct stderr logging
function log(level: 'info' | 'warn' | 'error', message: string, data?: object): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data
  };
  process.stderr.write(JSON.stringify(entry) + '\n');
}

// Usage
log('info', 'MCP server starting', { version: '1.0.0' });
log('error', 'Search failed', { query, error: err.message });
```

### Anti-Patterns to Avoid
- **console.log() anywhere:** KILLS PROTOCOL - stdout is JSON-RPC only
- **Exposing raw APIs:** Don't create `get_chunk`, `search_vector` - use workflow tools
- **Synchronous long operations:** indexDirectory can take 30-60s, needs progress or async pattern
- **Generic error messages:** "Error occurred" tells nothing - include what failed and how to fix

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON-RPC transport | Custom protocol handler | StdioServerTransport | Protocol compliance, edge cases handled |
| Schema validation | Manual type checking | zod schemas | Runtime validation + TypeScript types |
| Token optimization | Custom compact format | @toon-format/toon | Proven 30-60% reduction, LLM-tested accuracy |
| Tool registration | Manual method routing | McpServer.tool() | Handles schema, types, error format |
| Error formatting | Custom error objects | isError flag pattern | MCP protocol standard, Claude understands it |

**Key insight:** The MCP SDK handles all protocol complexity. Focus on business logic (wrapping RLM APIs), not protocol implementation.

## Common Pitfalls

### Pitfall 1: Stdout Contamination
**What goes wrong:** Any non-JSON-RPC output to stdout breaks the protocol
**Why it happens:** Developers add console.log() for debugging, or dependencies emit to stdout
**How to avoid:**
- Use stderr for ALL logging: `process.stderr.write()`
- Test with: `node server.js | jq . > /dev/null` (fails if non-JSON on stdout)
- Remove all console.log() before commit
**Warning signs:** Connection closes immediately, error -32000

### Pitfall 2: Indexing Timeout
**What goes wrong:** indexDirectory takes 30-60s, exceeds MCP client timeout (default 60s)
**Why it happens:** Large codebases have many files to embed
**How to avoid:**
- Option A: Return immediately with "indexing started" message
- Option B: Implement progress notifications (more complex)
- Option C: Document timeout configuration for users
**Warning signs:** Timeout errors on index_code, partial indexing

### Pitfall 3: Silent Service Failures
**What goes wrong:** Qdrant/Ollama unavailable returns empty results, Claude gives wrong answers
**Why it happens:** quickRetrieve gracefully degrades to empty array
**How to avoid:**
- Check service availability before operation
- Return explicit error with `isError: true` when services down
- Include actionable guidance: "Ensure Ollama is running (ollama serve)"
**Warning signs:** Empty results when services are down, no error indication

### Pitfall 4: Poor Tool Descriptions
**What goes wrong:** Claude doesn't know when to use tools or passes wrong parameters
**Why it happens:** Descriptions written for humans, not LLMs
**How to avoid:**
- Include "Use this when:" guidance in description
- Provide parameter examples in description
- Test with actual Claude Desktop to verify tool selection
**Warning signs:** Claude makes multiple tool calls trying parameter variations

## Code Examples

Verified patterns from official sources:

### Complete MCP Server Entry Point
```typescript
// src/rlm/mcp/server.ts
// Source: @modelcontextprotocol/sdk examples + PITFALLS_MCP.md

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createQdrantClient, getCollectionInfo } from '../storage/index.js';
import { hybridSearch } from '../retrieval/hybrid-search.js';
import { indexDirectory } from '../indexing/index.js';
import { formatSearchResultsTOON } from './formatters/toon-formatter.js';

// Stderr-only logging
const log = (msg: string) => process.stderr.write(`[rlm-mcp] ${msg}\n`);

const server = new McpServer({
  name: "rlm-mcp",
  version: "1.0.0",
});

// Tool: search_code
server.tool(
  "search_code",
  {
    query: z.string()
      .min(1)
      .max(500)
      .describe("Natural language query describing what code to find. Example: 'authentication middleware'"),
    limit: z.number()
      .int()
      .min(1)
      .max(20)
      .default(5)
      .describe("Maximum results to return (default: 5)")
  },
  async ({ query, limit }) => {
    try {
      const client = await createQdrantClient();
      const collection = process.env.RLM_COLLECTION || 'rlm_chunks';

      const results = await hybridSearch(client, collection, query, { limit });

      if (results.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No matches for "${query}". Try broader terms or verify codebase is indexed.`
          }]
        };
      }

      return {
        content: [{ type: "text", text: formatSearchResultsTOON(results) }]
      };
    } catch (error) {
      log(`Search error: ${error.message}`);
      return {
        content: [{
          type: "text",
          text: `Search failed: ${error.message}\n\nEnsure:\n1. Qdrant is running\n2. Ollama is running (ollama serve)\n3. Codebase is indexed (rlm index)`
        }],
        isError: true
      };
    }
  }
);

// Main entry
async function main() {
  log('Starting MCP server...');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('Connected to stdio transport');
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
```

### TOON Formatter for Search Results
```typescript
// src/rlm/mcp/formatters/toon-formatter.ts
// Source: https://toonformat.dev/reference/api

import { encode } from '@toon-format/toon';
import type { SearchResult } from '../../retrieval/hybrid-search.js';

interface TOONSearchResult {
  file: string;
  lines: string;
  relevance: number;
  code: string;
}

export function formatSearchResultsTOON(results: SearchResult[]): string {
  const formatted: TOONSearchResult[] = results.map(r => ({
    file: r.chunk.metadata.path,
    lines: `${r.chunk.metadata.start_line}-${r.chunk.metadata.end_line}`,
    relevance: Math.round(r.score * 100),
    code: truncateCode(r.chunk.text, 50)  // Max 50 lines per result
  }));

  // TOON options optimized for LLM consumption
  return encode({ results: formatted }, {
    indent: 1,
    delimiter: ','
  });
}

function truncateCode(text: string, maxLines: number): string {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`;
}
```

### Tool Descriptions for LLMs
```typescript
// Good descriptions that guide LLM tool selection
// Source: PITFALLS_MCP.md - Pitfall 2

const TOOL_DESCRIPTIONS = {
  search_code: `Search the indexed codebase for relevant code, functions, or documentation.

Use this when:
- User asks about specific code functionality
- Need to find how a feature is implemented
- Looking for examples of a pattern in the codebase
- Want to understand code structure

Returns: Array of code chunks with file paths, line numbers, and relevance scores in TOON format.`,

  index_code: `Index a directory to enable code search. Creates embeddings for all supported files.

Use this when:
- User wants to index a new codebase or directory
- Need to refresh the index after code changes
- First-time setup before searching

Note: May take 30-60 seconds for large codebases. Supports: .ts, .js, .tsx, .jsx, .md files.`,

  get_status: `Check the status of the RLM indexing system.

Use this when:
- Need to verify services are running
- Want to see how many chunks are indexed
- Troubleshooting search or index failures

Returns: Connection status for Qdrant, collection name, and chunk count.`
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| HTTP+SSE transport | Streamable HTTP or stdio | 2025 | stdio for local, HTTP for remote |
| Manual JSON-RPC | @modelcontextprotocol/sdk | 2024-2025 | SDK handles protocol compliance |
| JSON for LLM data | TOON format | 2025 | 30-60% token savings on arrays |
| Raw API exposure | Workflow-oriented tools | Best practice | Better LLM comprehension |

**Deprecated/outdated:**
- HTTP+SSE transport: Replaced by Streamable HTTP, still supported for backward compatibility
- Manual tool registration: McpServer.tool() is now the standard pattern

## Open Questions

Things that couldn't be fully resolved:

1. **Index timeout handling**
   - What we know: indexDirectory can take 30-60s, MCP default timeout is 60s
   - What's unclear: Best UX for long-running indexing in Claude Desktop
   - Recommendation: Start with simple "indexing started" immediate return, add progress later if needed

2. **TOON adoption by Claude**
   - What we know: TOON claims 30-60% token savings, Claude can parse it
   - What's unclear: Whether Claude's parsing accuracy matches JSON for complex nested data
   - Recommendation: Use TOON for uniform arrays (search results), JSON for nested configs

3. **Collection name configuration**
   - What we know: CLI uses 'rlm_chunks', env var is RLM_COLLECTION
   - What's unclear: Should MCP server use same default or separate collection?
   - Recommendation: Use same default ('rlm_chunks') for consistency with CLI

## Sources

### Primary (HIGH confidence)
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) - Official TypeScript SDK, server patterns, stdio transport
- [TOON API Reference](https://toonformat.dev/reference/api) - Complete encode/decode API documentation
- [PITFALLS_MCP.md](file://.planning/research/PITFALLS_MCP.md) - Project-specific MCP pitfalls research
- [MCPcat Tool Guide](https://mcpcat.io/guides/adding-custom-tools-mcp-server-typescript/) - Tool registration patterns with zod

### Secondary (MEDIUM confidence)
- [MCP TypeScript Template](https://github.com/cyanheads/mcp-ts-template) - Production-grade patterns, project structure
- [MCP Build Server Guide](https://modelcontextprotocol.io/docs/develop/build-server) - Official MCP documentation

### Tertiary (LOW confidence)
- [TOON Medium Article](https://medium.com/@lipton.bjit/toon-the-optimized-lightweight-format-boosting-llm-token-performance-3341631b0c0d) - Token savings claims (verify with testing)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official SDK, well-documented
- Architecture: HIGH - Based on existing RLM patterns + SDK examples
- TOON integration: MEDIUM - Library documented but untested in this context
- Timeout handling: MEDIUM - Multiple options, best approach unclear

**Research date:** 2026-01-22
**Valid until:** 2026-02-22 (30 days - MCP ecosystem evolving quickly)
