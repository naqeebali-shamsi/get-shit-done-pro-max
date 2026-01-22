# Feature Landscape: MCP Server for RLM

**Domain:** Model Context Protocol server exposing semantic code search capabilities
**Researched:** 2026-01-22
**Confidence:** HIGH (official MCP spec + SDK docs + community patterns)

## Executive Summary

MCP servers expose capabilities to AI clients through a standardized JSON-RPC protocol. For RLM, this means wrapping existing semantic search/indexing functions as MCP tools while following established patterns for tool design, error handling, and Claude Desktop integration. The feature landscape below synthesizes official MCP specification, TypeScript SDK documentation, and production MCP server patterns from 2025.

---

## Table Stakes

Features users expect from any MCP server. Missing = product feels incomplete or non-compliant.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Tool Definitions** | Core MCP primitive - servers expose callable functions | Low | Use `@modelcontextprotocol/sdk` Server.setRequestHandler for `tools/list` and `tools/call` |
| **Resource Definitions** | Core MCP primitive - servers expose readable data | Low | Use `resources/list` and `resources/read` handlers |
| **JSON-RPC 2.0 Protocol** | MCP specification requirement | Low | SDK handles this automatically |
| **STDIO Transport** | Default transport for Claude Desktop local servers | Low | SDK provides StdioServerTransport out of box |
| **Capability Negotiation** | Required handshake during connection | Low | SDK handles via initialize/initialized |
| **Tool Input Schema** | Each tool must declare typed parameters with Zod | Low | Use `zod` for schema validation (peer dependency of SDK) |
| **Error Handling** | Return structured errors, never throw | Medium | Graceful degradation when Qdrant/Ollama unavailable |
| **Tool Descriptions** | Clear descriptions for Claude to understand when to use each tool | Low | Critical for tool selection - be specific about use cases |
| **Environment Variables Config** | Claude Desktop passes config via env vars | Low | QDRANT_URL, OLLAMA_URL, RLM_COLLECTION, etc. |
| **Progress Notifications** | Long operations (indexing) should report progress | Medium | Use `notifications/progress` for operations >2s |
| **Logging** | Inform client of important events via logging protocol | Low | Use `notifications/message` for operational visibility |

## Differentiators

Features that set this MCP server apart. Not expected, but highly valued for code search domain.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Hybrid Search Results** | Semantic + sparse (BM25-style) fusion provides better relevance than pure vector search | Low | Already implemented in RLM - expose via tool |
| **AST-Aware Context** | Code chunks preserve function/class boundaries, not arbitrary splits | Low | Existing RLM feature - differentiates from grep-based tools |
| **Confidence Scores** | Return relevance scores (0-1) with each result | Low | Helps Claude assess quality of retrieved context |
| **File Metadata Filtering** | Filter by language, path patterns, symbol types | Medium | Leverage existing RLM metadata in Qdrant |
| **Semantic Status Check** | Tool to check if services are available before attempting search | Low | Prevents wasted token usage on failed searches |
| **Formatted Output** | Return markdown-formatted code blocks ready for Claude to consume | Low | Use existing `formatChunksAsContext` |
| **Graceful Cache Reporting** | Report cache hit rate for embedding performance visibility | Low | Expose `getCacheStats()` via status tool |
| **Multi-Query Batching** | Accept array of queries, return deduplicated results | Medium | Reduces round trips for related searches |
| **Incremental Indexing** | Index only changed files based on file hashes | Low | Already implemented - expose via tool |
| **Collection Management** | Create/list/switch between project collections | Medium | Support multiple codebases in single Qdrant instance |

## Anti-Features

Features to explicitly NOT build. Common mistakes in MCP server design or unnecessary complexity.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **One tool per API endpoint** | Creates tool explosion, confuses Claude, increases token usage | Consolidate into workflow-based tools: `search_code`, `index_code`, `get_status` (not 10 granular operations) |
| **Synchronous long operations** | Indexing 1000 files blocks for 30s+ without feedback | Use progress notifications for operations >2s, or return immediately with async pattern |
| **Generic "query" tool** | Ambiguous when Claude should use it vs other search methods | Be specific: `search_code_semantically` makes intent clear |
| **Raw JSON responses** | Forces Claude to parse/format, wastes tokens | Return markdown-formatted results ready to use |
| **Exposing internal implementation** | Tools like "generate_embedding" or "query_qdrant" leak abstractions | Expose user goals not implementation details |
| **Configuration tools** | "set_qdrant_url", "change_collection" increase surface area | Use environment variables and initialization config only |
| **Read-write resources** | Resources are read-only by MCP design | Use tools for mutations (indexing), resources for data (indexed files list) |
| **Duplicate search tools** | Multiple similar search tools confuse Claude's tool selection | Single `search_code` tool with optional parameters for filters |
| **Authentication in server** | MCP servers run locally, trust model breaks with auth | Rely on OS-level permissions and env var config |
| **File system browsing** | Not the domain of code search MCP server | Let filesystem MCP server handle file operations |
| **Code execution** | Security risk, out of scope for search server | Return context for Claude to reason about, don't execute |
| **Custom transport protocols** | STDIO is standard for Claude Desktop | Stick with SDK-provided transports |

## Feature Dependencies

```
Core MCP Compliance
  ├── STDIO Transport (SDK)
  ├── Tool Definitions (SDK)
  ├── Resource Definitions (SDK)
  └── Error Handling (custom)

Search Tools
  ├── Core MCP Compliance
  ├── Existing RLM quickRetrieve()
  ├── Existing hybridSearch()
  └── Existing formatChunksAsContext()

Indexing Tools
  ├── Core MCP Compliance
  ├── Existing indexDirectory()
  ├── Existing indexSingleFile()
  └── Progress Notifications (SDK)

Status Tools
  ├── Core MCP Compliance
  └── Existing cache stats functions

Resources (optional)
  ├── Core MCP Compliance
  └── Existing RLM storage queries
```

## MVP Recommendation

**Phase 1: Minimum Viable MCP Server**

Build these first (sorted by dependency order):

1. **Core Setup** (Low complexity)
   - Server initialization with `@modelcontextprotocol/sdk`
   - STDIO transport configuration
   - Environment variable loading (QDRANT_URL, OLLAMA_URL, RLM_COLLECTION)
   - Error handling with graceful degradation

2. **Essential Tools** (Low-Medium complexity)
   - `search_code`: Semantic search with hybrid retrieval
     - Input: `query: string`, `limit?: number`, `scoreThreshold?: number`
     - Output: Markdown-formatted code chunks with confidence scores
   - `index_code`: Index directory or file
     - Input: `path: string`
     - Output: Summary (chunks indexed, time, files skipped)
   - `get_status`: Check service availability and stats
     - Input: none
     - Output: Qdrant status, collection info, chunk count, cache stats

3. **Claude Desktop Integration** (Low complexity)
   - Configuration template for `claude_desktop_config.json`
   - Documentation for setup
   - Example usage patterns

**Defer to Post-MVP:**

- **Resources**: Indexed file list (nice-to-have, tools are sufficient)
  - Reason: Tools provide search+index, which covers 95% of use cases
  - Resources would just list what's indexed (lower value)

- **Advanced filtering**: Language/path/symbol filters
  - Reason: Basic search is sufficient for v1, filters add complexity
  - Can add as optional params to `search_code` later

- **Multi-query batching**: Array of queries in single call
  - Reason: Claude can make sequential calls fast enough
  - Optimization, not core functionality

- **Collection management**: Create/switch collections
  - Reason: Single collection works for MVP
  - Most users have one active codebase

- **Progress streaming**: Real-time indexing progress
  - Reason: SDK notifications work but add complexity
  - Simple "X chunks indexed in Yms" response is sufficient

## Tool Design Patterns

### Pattern 1: Workflow-Based Tools (RECOMMENDED)

**Bad (API mirroring):**
```
- generate_embedding
- query_vector_db
- parse_ast
- chunk_file
- format_results
```

**Good (goal-oriented):**
```
- search_code: "Find code related to authentication" → formatted results
- index_code: "Index ./src directory" → completion summary
- get_status: "Is RLM ready?" → service health
```

### Pattern 2: Progressive Disclosure

**Bad (expose everything upfront):**
```json
{
  "tools": [
    "search_code_semantic",
    "search_code_sparse",
    "search_code_hybrid",
    "search_with_ast_filter",
    "search_by_language",
    ...15 more tools
  ]
}
```

**Good (consolidate with optional params):**
```json
{
  "tools": [
    {
      "name": "search_code",
      "description": "Search codebase using hybrid semantic+sparse retrieval",
      "inputSchema": {
        "query": "string (required)",
        "limit": "number (optional, default 10)",
        "scoreThreshold": "number (optional, default 0.3)",
        "language": "string (optional filter)",
        "pathPattern": "string (optional filter)"
      }
    }
  ]
}
```

### Pattern 3: Semantic Naming

**Bad (ambiguous):**
```
- query
- search
- find
```

**Good (clear intent):**
```
- search_code: Unambiguous - searching code, not issues/docs/web
- index_code: Clear action - indexing for search
- get_status: Obvious - checking RLM service health
```

## Integration with Existing RLM Features

| Existing RLM Feature | MCP Exposure | Why |
|---------------------|--------------|-----|
| `quickRetrieve()` | `search_code` tool | Primary search interface, <500ms latency |
| `hybridSearch()` | `search_code` tool (internal) | Better relevance via RRF fusion |
| `formatChunksAsContext()` | `search_code` tool output | Returns markdown ready for Claude |
| `indexDirectory()` | `index_code` tool | Bulk indexing for project setup |
| `indexSingleFile()` | `index_code` tool | Incremental updates |
| `getCacheStats()` | `get_status` tool | Performance visibility |
| `createQdrantClient()` | Internal initialization | Connection management |

## Expected MCP Server Behavior

Based on MCP specification and Claude Desktop integration requirements:

### Startup Sequence

1. Claude Desktop launches server via STDIO
2. Server initializes SDK with tool/resource handlers
3. Client sends `initialize` request with capabilities
4. Server responds with supported capabilities
5. Client sends `initialized` notification
6. Server is ready to handle `tools/list`, `tools/call` requests

### Tool Execution Flow

1. Claude decides to search code based on conversation
2. Client sends `tools/list` → Server returns available tools
3. Claude selects `search_code` based on description
4. Client sends `tools/call` with `{"query": "authentication middleware", "limit": 5}`
5. Server executes quickRetrieve(), formats results
6. Server returns markdown-formatted code chunks with confidence scores
7. Claude uses results in conversation with user

### Error Scenarios

| Scenario | Expected Behavior |
|----------|-------------------|
| Qdrant unavailable | Return empty results + log warning, don't crash |
| Ollama unavailable | Return empty results + log warning, don't crash |
| Invalid tool params | Return error with schema guidance |
| Collection doesn't exist | Auto-create collection or return helpful error |
| Search timeout | Return partial results or empty with timeout note |
| Indexing fails | Return error with specific file/reason |

### Performance Expectations

| Operation | Target | How to Achieve |
|-----------|--------|----------------|
| Tool listing | <10ms | Cached in memory |
| Search queries | <500ms | Use quickRetrieve with timeout |
| Index 100 files | <5s | Batch processing, progress notifications |
| Status check | <50ms | Ping Qdrant, check collection metadata |

## Resources vs Tools: When to Use Each

Based on MCP specification and community patterns:

### Use Tools When:
- **Model-controlled invocation**: Claude decides when to call based on conversation
- **Actions or mutations**: Indexing, updating, deleting
- **Dynamic results**: Search results vary based on query
- **Computation required**: Embedding generation, ranking, filtering

**For RLM:** `search_code`, `index_code`, `get_status` are all tools because Claude decides when to invoke them based on user conversation.

### Use Resources When:
- **Application-controlled loading**: User explicitly selects resources before conversation
- **Static or semi-static data**: Content doesn't change mid-conversation
- **Pre-loading context**: Data loaded once, used throughout conversation
- **Browsable catalogs**: List of items user can select

**For RLM:** Resources are optional. Could expose:
- `rlm://indexed-files` - List of all indexed files
- `rlm://collection-stats` - Static collection metadata

But tools are sufficient for v1 - resources add complexity without clear value.

## Sources

### Official MCP Specification (HIGH Confidence)
- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP Tools Documentation](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [MCP Resources Documentation](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)
- [MCP Best Practices](https://modelcontextprotocol.info/docs/best-practices/)

### Tool Design Patterns (MEDIUM-HIGH Confidence)
- [Less is More: MCP Design Patterns](https://www.klavis.ai/blog/less-is-more-mcp-design-patterns-for-ai-agents)
- [Understanding MCP Features Guide](https://workos.com/blog/mcp-features-guide)
- [MCP Patterns & Anti-Patterns](https://medium.com/@thirugnanamk/mcp-patterns-anti-patterns-for-implementing-enterprise-ai-d9c91c8afbb3)
- [MCP Resources vs Tools Explained](https://medium.com/@laurentkubaski/mcp-resources-explained-and-how-they-differ-from-mcp-tools-096f9d15f767)

### Implementation Resources (HIGH Confidence)
- [TypeScript MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [Official MCP Servers Repository](https://github.com/modelcontextprotocol/servers)
- [MCP SDK Documentation](https://modelcontextprotocol.io/docs/sdk)

### Claude Desktop Integration (HIGH Confidence)
- [Getting Started with Local MCP Servers on Claude Desktop](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)
- [Claude Desktop MCP Setup Guide](https://www.getclockwise.com/blog/claude-desktop-mcp-setup-guide)
- [One-click MCP Server Installation](https://www.anthropic.com/engineering/desktop-extensions)

### Code Search MCP Examples (MEDIUM Confidence)
- [Code Context (Semantic Code Search) MCP Server](https://www.pulsemcp.com/servers/code-context)
- [GitHub Official MCP Server](https://github.com/github/github-mcp-server)
- [Context7 MCP Server](https://github.com/upstash/context7)
- [Local Code Search MCP Server](https://www.pulsemcp.com/servers/luotocompany-local-code-search)

### Security & Architecture (MEDIUM Confidence)
- [State of MCP Server Security 2025](https://astrix.security/learn/blog/state-of-mcp-server-security-2025/)
- [7 MCP Server Best Practices](https://www.marktechpost.com/2025/07/23/7-mcp-server-best-practices-for-scalable-ai-integrations-in-2025/)
- [Tackling MCP Security Challenges](https://www.thoughtworks.com/insights/blog/generative-ai/Tackling-MCP-security-challenges-with-the-MCP-API-delegation-pattern)

---

## Key Insights for Roadmap

### Phase Structure Recommendations

1. **Phase 1: Core MCP Server** - SDK setup, basic tool exposure
   - Focus: Get `search_code`, `index_code`, `get_status` working
   - Rationale: Proves MCP integration works, tests with Claude Desktop
   - Risk: Low - SDK handles protocol complexity

2. **Phase 2: Claude Desktop Integration** - Configuration, documentation, UX
   - Focus: User-friendly setup, clear documentation
   - Rationale: Makes server usable by end users, not just developers
   - Risk: Low - straightforward configuration

3. **Phase 3: Advanced Features** - Filtering, batching, resources
   - Focus: Add optional parameters, optimize performance
   - Rationale: Enhance after core works, based on user feedback
   - Risk: Medium - adds complexity without changing core value

### Research Flags for Phases

- **Phase 1**: Unlikely to need deeper research - SDK is well-documented
- **Phase 2**: May need research on Claude Desktop config edge cases
- **Phase 3**: Likely needs research on performance optimization patterns

### Dependencies on Existing RLM

This MCP server is a **thin wrapper** over existing RLM functionality:
- No new chunking/embedding/retrieval logic needed
- Expose existing `quickRetrieve()`, `indexDirectory()`, `getCacheStats()`
- Main work: SDK integration, error handling, format conversion

**Implication:** Fast to implement if existing RLM is stable.

---

*Feature research for: MCP Server for RLM*
*Researched: 2026-01-22*
*Primary focus: MCP protocol compliance and tool design patterns*
