---
phase: 06-mcp-server-foundation
plan: 01
status: complete
subsystem: mcp-server
tags: [mcp, stdio, json-rpc, tools]

dependency_graph:
  requires: [05-optimization-polish]
  provides: [mcp-server, search-tool, index-tool, status-tool]
  affects: [06-02-toon-formatting, 07-test-coverage, 08-documentation]

tech_stack:
  added:
    - "@modelcontextprotocol/sdk@^1.25.3"
    - "@toon-format/toon@^2.1.0"
  patterns:
    - "stdio transport for MCP"
    - "stderr-only logging"
    - "zod schema validation for tool inputs"

file_tracking:
  key_files:
    created:
      - src/rlm/mcp/server.ts
      - src/rlm/mcp/logger.ts
      - src/rlm/mcp/index.ts
      - src/rlm/mcp/tools/search.ts
      - src/rlm/mcp/tools/index-code.ts
      - src/rlm/mcp/tools/status.ts
    modified:
      - package.json

decisions:
  - id: MCP-SDK-VERSION
    decision: "Use @modelcontextprotocol/sdk@^1.25.3"
    rationale: "Latest stable version with full tool support"
  - id: STDERR-LOGGING
    decision: "All logging to stderr, stdout reserved for JSON-RPC"
    rationale: "MCP protocol requirement - stdout is JSON-RPC only"
  - id: ZOD-SCHEMAS
    decision: "Define tool schemas using zod"
    rationale: "Type-safe schema definition with automatic JSON Schema conversion"

metrics:
  duration: "6 min"
  completed: "2026-01-22"
---

# Phase 06 Plan 01: MCP Server Core Summary

**One-liner:** MCP server with stdio transport exposing search_code, index_code, get_status tools via JSON-RPC.

## Execution Results

| Task | Name | Status | Commit | Files |
|------|------|--------|--------|-------|
| 1 | Install dependencies and add bin entry | Done | 7bff22d | package.json |
| 2 | Create MCP server with stdio transport and stderr logging | Done | 5d060ff | server.ts, logger.ts, index.ts |
| 3 | Implement all three MCP tools with zod schemas | Done | 4aeb459 | search.ts, index-code.ts, status.ts |

**Total tasks:** 3/3 complete
**Duration:** ~6 minutes

## What Was Built

### MCP Server Entry Point (server.ts)
- McpServer from @modelcontextprotocol/sdk
- StdioServerTransport for JSON-RPC over stdio
- Tool registration pattern: `registerXTool(server)`
- Fatal error handling with stderr logging

### Stderr-Only Logger (logger.ts)
- JSON-structured log entries to stderr
- LogLevel: info, warn, error, debug
- Timestamp, level, message, optional data fields
- **Critical:** stdout reserved for JSON-RPC protocol

### MCP Tools
1. **search_code** - Wraps hybridSearch for semantic code search
   - Input: query (string), limit (number, default 5)
   - Output: Formatted code chunks with file paths and relevance scores

2. **index_code** - Wraps indexDirectory for codebase indexing
   - Input: path (string)
   - Output: Index summary (files indexed, skipped, errors)

3. **get_status** - Reports system status
   - Input: none
   - Output: Qdrant connection status, collection info, chunk count

### Environment Variables Supported
- `QDRANT_URL` - Qdrant server URL (default: http://localhost:6333)
- `OLLAMA_HOST` - Ollama server URL (default: http://localhost:11434)
- `RLM_COLLECTION` - Collection name (default: rlm_chunks)

## Verification Results

```
$ npm ls @modelcontextprotocol/sdk @toon-format/toon
get-shit-done-cc@1.6.4
├── @modelcontextprotocol/sdk@1.25.3
└── @toon-format/toon@2.1.0
```

```
$ npm run build:rlm
> node ./node_modules/typescript/bin/tsc -p tsconfig.json
(no errors)
```

```
$ echo '{"jsonrpc":"2.0","id":1,"method":"initialize",...}' | node dist/rlm/mcp/server.js
{"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"rlm-mcp","version":"1.0.0"}},"jsonrpc":"2.0","id":1}
```

Tools registered: search_code, index_code, get_status (verified via tools/list)

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

| Decision | Context | Choice | Rationale |
|----------|---------|--------|-----------|
| MCP SDK version | Dependency selection | @1.25.3 | Latest stable with full tool support |
| Log format | Logging structure | JSON to stderr | Machine-parseable, MCP-compliant |
| Tool error format | Error handling | Structured with troubleshooting | Actionable guidance for users |

## What Remains

- **Plan 02:** TOON token-optimized formatting for search results
- Integration testing with Claude Desktop
- Documentation for Claude Desktop configuration

## Next Phase Readiness

Ready for Plan 02 (TOON formatting). All core infrastructure in place:
- Server starts and accepts connections
- Tools registered and callable
- Proper separation of JSON-RPC (stdout) and logs (stderr)
