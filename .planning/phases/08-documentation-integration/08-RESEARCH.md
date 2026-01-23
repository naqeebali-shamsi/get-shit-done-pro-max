# Phase 8: Documentation & Integration - Research

**Researched:** 2026-01-24
**Domain:** MCP Server Documentation & Claude Desktop Configuration
**Confidence:** HIGH

## Summary

This phase creates user-facing documentation enabling self-service Claude Desktop setup with the RLM MCP server. Research focused on the official MCP configuration format for Claude Desktop, tool documentation best practices, and troubleshooting patterns for common MCP server issues.

The claude_desktop_config.json format is well-documented by Anthropic with clear specifications for stdio transport configuration. The three MCP tools (search_code, index_code, get_status) already have comprehensive zod schemas and error handling built-in that can inform documentation. Troubleshooting follows established patterns: service connectivity, model availability, and collection existence.

**Primary recommendation:** Follow official MCP documentation patterns with platform-specific configuration templates, compact tool reference tables, and diagnostic-flow troubleshooting.

## Standard Stack

This phase is documentation-only. No new libraries required.

### Existing Dependencies Used
| Library | Version | Purpose | Relevance to Docs |
|---------|---------|---------|-------------------|
| @modelcontextprotocol/sdk | ^1.25.3 | MCP server implementation | Document stdio transport |
| @qdrant/js-client-rest | ^1.16.2 | Vector database client | Document QDRANT_URL env var |
| ollama | ^0.6.0 | Embedding generation | Document OLLAMA_HOST env var |
| zod | ^3.23.8 | Schema validation | Document tool input schemas |

### Configuration File Locations
| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

## Architecture Patterns

### Claude Desktop Configuration Structure

The official MCP configuration follows this pattern:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "executable",
      "args": ["arg1", "arg2"],
      "env": {
        "VAR_NAME": "value"
      }
    }
  }
}
```

**Key fields:**
- `command`: Executable to run (absolute path recommended)
- `args`: Array of command-line arguments
- `env`: Environment variables passed to the server process
- `type`: Optional, defaults to "stdio" for local servers

### RLM MCP Configuration Template

Based on the server implementation at `dist/rlm/mcp/server.js`:

```json
{
  "mcpServers": {
    "rlm": {
      "command": "npx",
      "args": ["-y", "get-shit-done-cc", "rlm-mcp"],
      "env": {
        "QDRANT_URL": "http://localhost:6333",
        "OLLAMA_HOST": "http://localhost:11434",
        "RLM_COLLECTION": "rlm_chunks"
      }
    }
  }
}
```

**Alternative for local development:**
```json
{
  "mcpServers": {
    "rlm": {
      "command": "node",
      "args": ["/absolute/path/to/dist/rlm/mcp/server.js"],
      "env": {
        "QDRANT_URL": "http://localhost:6333",
        "OLLAMA_HOST": "http://localhost:11434"
      }
    }
  }
}
```

### Tool Documentation Format

From official MCP servers repository, tools are documented with:
1. **Tool name** - snake_case identifier
2. **Description** - When to use it
3. **Input schema** - Required and optional parameters with types
4. **Output format** - What the tool returns
5. **Error handling** - What errors can occur

**Compact table format (per CONTEXT.md decision):**

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| search_code | Search indexed codebase | query (string), limit (number, default 5) | TOON-formatted code chunks with file paths |
| index_code | Index a directory | path (string, absolute or relative) | Summary: files indexed, skipped, errors |
| get_status | Check system status | none | Qdrant/Ollama status, collection info, chunk count |

## Don't Hand-Roll

Problems with existing solutions in the MCP ecosystem:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Configuration validation | Custom JSON parser | Claude Desktop's built-in validation | Shows errors in Developer Settings |
| Log viewing | Custom log viewer | `tail -f` (Mac/Linux) or PowerShell `Get-Content -Wait` | Standard tools, no dependencies |
| Server testing | Custom test harness | MCP Inspector (`npx @modelcontextprotocol/inspector`) | Official debugging tool |

## Common Pitfalls

### Pitfall 1: stdout Pollution Breaking Protocol
**What goes wrong:** Server logs to stdout, corrupting JSON-RPC messages
**Why it happens:** Using console.log() instead of console.error()
**How to avoid:** RLM MCP already uses stderr-only logging via logger.ts
**Warning signs:** "MCP error -32000: Connection closed"

### Pitfall 2: Relative Paths in Configuration
**What goes wrong:** Server fails to find files/directories
**Why it happens:** Claude Desktop working directory is undefined (e.g., `/` on macOS)
**How to avoid:** Always use absolute paths in claude_desktop_config.json
**Warning signs:** "ENOENT" errors in MCP logs

### Pitfall 3: Windows npx Requires Shell Wrapper
**What goes wrong:** "spawn npx ENOENT" error on Windows
**Why it happens:** npx.cmd batch script requires shell execution
**How to avoid:** Use `cmd /c npx` wrapper or absolute node path
**Warning signs:** Server doesn't start on Windows only

### Pitfall 4: Missing Environment Variables
**What goes wrong:** Server uses wrong defaults or fails
**Why it happens:** MCP servers inherit limited env vars from Claude Desktop
**How to avoid:** Explicitly set all required env vars in config
**Warning signs:** Connection to wrong URL, "model not found" errors

### Pitfall 5: Qdrant/Ollama Not Running
**What goes wrong:** Tools return errors about connection failures
**Why it happens:** User hasn't started required services
**How to avoid:** Document prerequisites, provide startup commands
**Warning signs:** "ECONNREFUSED" errors, "connection refused"

### Pitfall 6: Collection Not Found
**What goes wrong:** Search returns no results
**Why it happens:** User hasn't indexed codebase yet
**How to avoid:** get_status tool shows "0 chunks indexed", prompt to index
**Warning signs:** Empty search results, collection status shows "not found"

## Code Examples

### Minimal Working Configuration (macOS)

```json
{
  "mcpServers": {
    "rlm": {
      "command": "npx",
      "args": ["-y", "get-shit-done-cc", "rlm-mcp"]
    }
  }
}
```
Source: Based on official MCP documentation patterns

### Full Configuration with All Environment Variables (Windows)

```json
{
  "mcpServers": {
    "rlm": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "get-shit-done-cc", "rlm-mcp"],
      "env": {
        "QDRANT_URL": "http://localhost:6333",
        "OLLAMA_HOST": "http://localhost:11434",
        "RLM_COLLECTION": "rlm_chunks"
      }
    }
  }
}
```
Source: Windows-specific pattern from official debugging docs

### Diagnostic Commands

**Check Qdrant is running:**
```bash
curl http://localhost:6333/collections
```

**Check Ollama is running:**
```bash
curl http://localhost:11434/api/tags
```

**Check embedding model is available:**
```bash
ollama list | grep nomic-embed-text
```

**Pull embedding model if missing:**
```bash
ollama pull nomic-embed-text
```

**View MCP logs (macOS):**
```bash
tail -n 20 -f ~/Library/Logs/Claude/mcp*.log
```

**View MCP logs (Windows PowerShell):**
```powershell
Get-Content "$env:APPDATA\Claude\logs\mcp*.log" -Wait -Tail 20
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual JSON editing only | Desktop Extensions (.mcpb) available | 2025 | Simpler install option exists but JSON still supported |
| HTTP transport | stdio transport preferred for local | Current | Claude Desktop uses stdio by default |

**Note:** Desktop Extensions (.mcpb files) provide one-click installation but require packaging. For this phase, JSON configuration is appropriate as it's the standard approach for npm-distributed servers.

## MCP Log Locations

| Platform | Main Log | Server-Specific Log |
|----------|----------|---------------------|
| macOS | `~/Library/Logs/Claude/mcp.log` | `~/Library/Logs/Claude/mcp-server-rlm.log` |
| Windows | `%APPDATA%\Claude\logs\mcp.log` | `%APPDATA%\Claude\logs\mcp-server-rlm.log` |

**Accessing logs via UI:** Claude Desktop > Settings > Developer > (select server) > Open Logs Folder

## Troubleshooting Decision Tree

Per CONTEXT.md, use diagnostic flow format:

### Scenario 1: Qdrant Unavailable

```
Check: curl http://localhost:6333/collections
  Returns JSON? -> Qdrant is running, check other issues
  Connection refused? -> Start Qdrant:
    docker run -p 6333:6333 qdrant/qdrant

Verify: curl http://localhost:6333/collections returns {"collections":[...]}
```

### Scenario 2: Ollama Missing

```
Check: curl http://localhost:11434/api/tags
  Returns JSON? -> Ollama is running, check model
  Connection refused? -> Start Ollama:
    ollama serve

Check: ollama list | grep nomic-embed-text
  Found? -> Model available
  Not found? -> Pull model:
    ollama pull nomic-embed-text

Verify: ollama list shows nomic-embed-text
```

### Scenario 3: Collection Not Found

```
Check: Use get_status tool in Claude Desktop
  Shows "0 chunks indexed"? -> Index codebase:
    Use index_code tool with path to your project

Verify: get_status shows chunk count > 0
```

## Environment Variables Reference

| Variable | Default | Purpose |
|----------|---------|---------|
| QDRANT_URL | http://localhost:6333 | Qdrant server endpoint |
| OLLAMA_HOST | http://localhost:11434 | Ollama server endpoint |
| RLM_COLLECTION | rlm_chunks | Qdrant collection name |

## Open Questions

None identified. The configuration format is well-documented and the RLM MCP server follows standard patterns.

## Sources

### Primary (HIGH confidence)
- [Connect to local MCP servers - Model Context Protocol](https://modelcontextprotocol.io/docs/develop/connect-local-servers) - Official configuration documentation
- [Debugging - Model Context Protocol](https://modelcontextprotocol.io/legacy/tools/debugging) - Official debugging guide
- [Getting Started with Local MCP Servers - Claude Help Center](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) - Official Claude Desktop guide

### Secondary (MEDIUM confidence)
- [MCP Server Troubleshooting Guide 2025](https://mcp.harishgarg.com/learn/mcp-server-troubleshooting-guide-2025) - Community troubleshooting patterns
- [GitHub MCP Server Installation Guide](https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-claude.md) - Real-world configuration example

### Tertiary (LOW confidence)
- [Viewing Claude Desktop MCP Server Logs](https://wjgilmore.com/articles/viewing-claude-desktop-mcp-server-logs) - Log location details

## Metadata

**Confidence breakdown:**
- Configuration format: HIGH - Official MCP documentation verified
- Tool documentation: HIGH - Extracted from actual server implementation
- Troubleshooting: MEDIUM - Patterns from multiple sources, RLM-specific scenarios inferred
- Log locations: HIGH - Official documentation confirmed

**Research date:** 2026-01-24
**Valid until:** 2026-02-24 (MCP configuration format is stable)
