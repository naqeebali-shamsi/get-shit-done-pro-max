# Project Research Summary

**Project:** RLM MCP Server (v1.1)
**Domain:** Model Context Protocol server for semantic code search
**Researched:** 2026-01-22
**Confidence:** HIGH

## Executive Summary

Building an MCP server to expose RLM capabilities to Claude Desktop is a thin wrapper problem, not a new system build. The existing RLM infrastructure (quickRetrieve, indexDirectory, getCollectionInfo) provides all necessary functionality - the challenge is in proper MCP integration: stdio protocol compliance, tool design that guides LLM behavior, and error handling that prevents silent failures. The recommended approach is a facade pattern where MCP tools are workflow-oriented (search_code, index_code, get_status) rather than API-mirroring, with all business logic remaining in existing RLM modules.

The technology stack is minimal: one new dependency (@modelcontextprotocol/sdk v1.25.2) with stdio transport for Claude Desktop integration. The critical success factors are not technical complexity but design quality: tool descriptions must guide Claude's selection behavior, error responses must be actionable, and validation must treat LLM-generated inputs as untrusted. Research reveals several critical failure modes from 2025 MCP deployments: stdout contamination breaking JSON-RPC, poor tool descriptions causing excessive tool calls, and security vulnerabilities from treating "local-only" servers as safe from injection attacks.

The highest risk is not in implementation but in design choices made during Phase 1 (MCP Server Setup). Tool surface design, error handling architecture, and validation patterns are difficult to change once established. The recommendation is to invest heavily in Phase 1 design quality, use existing RLM integration as a reference implementation (the CLI already demonstrates the facade pattern), and defer optimization/advanced features to later phases. With the existing RLM system proven and the MCP SDK mature (v1.x stable), technical risk is low - execution risk centers on avoiding well-documented MCP pitfalls.

## Key Findings

### Recommended Stack

The MCP server requires only one new dependency: `@modelcontextprotocol/sdk` v1.25.2, which provides McpServer and StdioServerTransport. All RLM functionality (Qdrant client, Ollama embedding, AST parsing, hybrid search) is already present and requires zero modification. The integration follows the same facade pattern as the existing CLI - tools in `src/rlm/mcp/tools/` import and call functions from `src/rlm/integration/` and `src/rlm/indexing/`.

**Core technologies:**
- **@modelcontextprotocol/sdk v1.25.2**: Official MCP protocol implementation - provides server framework, stdio transport, and JSON-RPC handling. Version 1.x is production-stable with 6+ months support window after v2 release (Q1 2026).
- **Zod (existing v3.23.8)**: Schema validation for tool inputs - SDK peer dependency, already present in package.json. Critical for input validation and preventing Confused Deputy attacks.
- **Existing RLM modules**: All business logic (search, indexing, status) - no changes needed. MCP layer is pure presentation.

**Build changes:**
- Separate tsconfig for MCP (outputs to dist/mcp/, extends main config)
- New bin entry: `rlm-mcp` pointing to dist/mcp/index.js
- Build script: `build:mcp` compiles MCP server separately from CLI

### Expected Features

MCP servers expose two primitives: tools (callable functions) and resources (readable data). For RLM v1.1, focus is on tools only - resources add complexity without clear value for a search-oriented system.

**Must have (table stakes):**
- **Tool definitions with clear descriptions**: Not just what tools do, but when to use them and what problems they solve. LLMs need contextual guidance.
- **JSON-RPC 2.0 compliance**: Handled by SDK, but requires stdout hygiene (only JSON-RPC on stdout, all logs to stderr).
- **Stdio transport**: Required for Claude Desktop local servers. HTTP transport is for remote/production deployments only.
- **Error handling with graceful degradation**: Tools return error messages as text, never throw exceptions. Distinguish "no results" from "service unavailable."
- **Input validation**: Zod schemas for all tool parameters. Treat LLM-generated inputs as untrusted user input.
- **Environment variable configuration**: Claude Desktop passes config via env vars (QDRANT_URL, RLM_COLLECTION, OLLAMA_URL).

**Should have (differentiators):**
- **Workflow-based tools over API mirroring**: search_code (wraps quickRetrieve + formatChunksAsContext) instead of separate get_embedding, query_vector, format_results tools.
- **AST-aware context in responses**: Leverage existing RLM chunking that preserves function/class boundaries - differentiates from grep-based code search.
- **Confidence scores with results**: Return relevance scores (0-1) to help Claude assess result quality.
- **Status tool for service health**: Check Qdrant/Ollama availability before attempting searches - prevents wasted token usage on failed operations.
- **Formatted markdown output**: Return code blocks ready for Claude to consume, not raw JSON requiring parsing.

**Defer (v2+):**
- **Resources (indexed file list)**: Tools cover 95% of use cases. Resources would just list what's indexed - lower value.
- **Advanced filtering (language, path, symbol)**: Basic search sufficient for v1. Can add as optional params later.
- **Multi-query batching**: Optimization, not core functionality. Claude can make sequential calls.
- **Collection management tools**: Single collection works for MVP. Most users have one active codebase.
- **Progress streaming for indexing**: SDK notifications add complexity. Simple completion summary is sufficient.

### Architecture Approach

The MCP server is a thin presentation layer (facade pattern) living in `src/rlm/mcp/`, separate from existing RLM core modules. Architecture mirrors the existing CLI: tool handlers import and call existing RLM functions without modification. Communication with Claude Desktop uses stdio transport (JSON-RPC over stdin/stdout), with all logs going to stderr to avoid protocol corruption.

**Major components:**

1. **Server entry point (index.ts)**: Initializes McpServer, registers tools, connects StdioServerTransport. Lifecycle management (startup handshake, graceful shutdown). No business logic.

2. **Tool handlers (tools/search-tool.ts, index-tool.ts, status-tool.ts)**: Thin wrappers (5-20 lines each) that validate inputs with Zod, call existing RLM functions, format responses as MCP ToolResult. One tool per file for testability.

3. **Existing RLM modules (integration/, indexing/, storage/)**: Unchanged. Provide all business logic. Tool handlers import and call these functions directly.

**Integration pattern:**
- Tool handler receives LLM-generated parameters
- Validates with Zod schema (throws on invalid input)
- Calls existing RLM function (e.g., quickRetrieve)
- Formats result as MCP ToolResult with text content
- Returns structured response (never throws from handler)

**Data flow:**
Claude Desktop -> JSON-RPC stdin -> McpServer routes to tool -> Tool validates -> Calls RLM function -> Formats result -> JSON-RPC stdout -> Claude Desktop

**Critical patterns:**
- **Stdio hygiene**: Only JSON-RPC on stdout. All logs use console.error() or write to stderr.
- **Graceful degradation**: Tools return error messages as text content with isError flag, never throw.
- **Environment-based config**: Read QDRANT_URL, RLM_COLLECTION from process.env (injected by Claude Desktop).
- **Facade, not reimplementation**: Zero business logic in MCP layer. All logic lives in existing RLM modules.

### Critical Pitfalls

Based on 2025 MCP production post-mortems and security research:

1. **Stdout/stderr confusion (The Protocol Killer)** - Any non-JSON output to stdout corrupts the JSON-RPC stream. Connection closes with error -32000. Prevention: Explicit stderr logging (`console.error()`), configure logging frameworks to use stderr, test with `node server.js | jq .` to verify clean JSON output. Failure mode: Immediate connection close, no obvious cause in logs.

2. **Tool descriptions that don't guide LLMs** - The primary failure mode for new MCP servers. Technical API-style descriptions confuse LLMs on when to use tools. Prevention: Write descriptions explaining the workflow ("use this when..."), include format examples, specify constraints (min/max values). Test with actual Claude Desktop. Failure mode: Claude makes multiple tool calls trying parameter variations, users must explicitly instruct which tool to use.

3. **Security theater (The "Just Local" Fallacy)** - Real-world 2025 incidents: 0.0.0.0 Day exposed MCP Inspector to network, SQL injection via prompt injection in Anthropic's SQLite server. Prevention: Validate ALL inputs with Zod schemas, sanitize file paths (prevent directory traversal), never bind to 0.0.0.0 (localhost only), treat LLM parameters as untrusted. Failure mode: Prompt injection becomes code execution, path traversal accesses unauthorized files.

4. **Wrapping APIs instead of workflows** - Exposing low-level API primitives (get_chunk, search_vector, get_metadata) forces LLM to orchestrate multi-step sequences. Prevention: Design tools from user goals (search_code, understand_function), not API methods. Group related operations into workflow-based tools. Failure mode: Brittle multi-tool sequences, frequent validation errors, poor user experience.

5. **Silent failures and poor error handling** - When services are unavailable (Qdrant down, Ollama crashed), tools return empty results. Claude interprets as "no matches" and gives wrong answers. Prevention: Health checks before execution, structured error responses with actionable guidance, distinguish "no results" from "service unavailable." Failure mode: Users get confident wrong answers, no visibility into what failed.

## Implications for Roadmap

Based on research, suggested 3-phase structure:

### Phase 1: MCP Core Setup & Tool Implementation
**Rationale:** Foundation phase - design decisions made here are hard to change. MCP protocol compliance, tool surface design, error handling architecture must be correct from the start. The existing CLI provides a proven reference implementation for the facade pattern.

**Delivers:**
- Working MCP server with 3 tools (search_code, index_code, get_status)
- Claude Desktop integration documentation
- Input validation and error handling

**Addresses:**
- All table stakes features (tool definitions, stdio transport, error handling, validation)
- Workflow-based tool design (not API mirroring)
- Security from day one (input validation, path sanitization)

**Avoids:**
- Stdout contamination (explicit stderr logging)
- Poor tool descriptions (test with Claude Desktop)
- Security vulnerabilities (Zod validation, localhost binding)
- Wrong abstraction level (workflow tools, not API primitives)

**Research flag:** Unlikely to need deeper research - MCP SDK is well-documented, patterns are established. Reference existing CLI implementation.

### Phase 2: Test Coverage (85% target)
**Rationale:** Testing MCP servers is non-trivial - they're protocol implementations. Two-tiered approach: unit tests for tool logic (mocked RLM), integration tests for JSON-RPC protocol compliance. Cannot validate 85% coverage without complete test infrastructure.

**Delivers:**
- Unit tests for each tool handler (validation, error paths, formatting)
- Integration tests (spawn server, send JSON-RPC, verify responses)
- MCP Inspector-based validation
- Long-running tests to detect resource leaks

**Uses:**
- Existing test infrastructure (Vitest)
- MCP SDK test utilities
- Mock RLM modules for unit tests

**Implements:**
- Test strategy from PITFALLS.md (unit + integration)
- Protocol compliance verification
- Error scenario coverage

**Avoids:**
- Shipping without regression detection
- Manual testing only (missed edge cases)
- Resource leaks (detected by long-running tests)

**Research flag:** May need research on MCP-specific testing patterns (integration test setup, JSON-RPC message crafting).

### Phase 3: Documentation & Polish
**Rationale:** Once core works and tests pass, focus shifts to user experience. Configuration is a major pain point (JSON format, absolute paths, env vars). Observability helps debugging but shouldn't block basic functionality.

**Delivers:**
- Claude Desktop configuration guide (with troubleshooting)
- Config validation script
- Structured logging to file (not stderr for debugging)
- Example usage patterns
- Migration guide for future v2 SDK

**Addresses:**
- Configuration complexity (pre-built snippets, validation script)
- Observability (log locations, metrics)
- User-friendly setup experience

**Avoids:**
- Configuration complexity pitfall (thorough documentation)
- No observability (log rotation, documented log locations)

**Research flag:** Standard documentation patterns - unlikely to need research.

### Phase Ordering Rationale

- **Phase 1 first because:** Design decisions (tool surface, error handling, validation) are architectural. Hard to change after Phase 2 tests are written. The existing CLI provides a working reference implementation.
- **Phase 2 second because:** Cannot write tests until code exists. 85% coverage requirement is explicit milestone goal. Tests verify Phase 1 design choices.
- **Phase 3 last because:** Documentation and polish shouldn't block functional server. Configuration guide is useless if tool surface changes. Observability helps debugging but isn't required for basic operation.
- **Dependencies:** Phase 2 depends on Phase 1 code. Phase 3 depends on stable API from Phase 2 validation.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Test Coverage):** MCP integration testing patterns - how to spawn server, craft JSON-RPC messages, verify protocol compliance. Consider using MCP Inspector programmatically.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Core Setup):** Well-documented by MCP SDK, official examples, 2025 production servers. Existing CLI is a reference implementation.
- **Phase 3 (Documentation):** Standard documentation work - config examples, troubleshooting guides, common issues.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official MCP SDK v1.25.2 verified on npm. Single dependency with clear integration pattern. Zod already present. |
| Features | HIGH | MCP spec 2025-11-25 is authoritative. Community patterns well-established from 2025 deployments. Feature landscape clear. |
| Architecture | HIGH | Facade pattern proven by existing CLI. MCP SDK examples demonstrate stdio transport. Official docs cover lifecycle management. |
| Pitfalls | HIGH | Real-world 2025 incidents documented (0.0.0.0 Day, SQL injection). Production post-mortems from high-quality sources. Security research from multiple independent sources. |

**Overall confidence:** HIGH

This is an additive milestone (wrapping existing functionality) with mature tooling (MCP SDK v1.x stable) and well-documented patterns (2025 production servers). The existing RLM system is proven - risk is in MCP integration layer, which has clear best practices from community experience.

### Gaps to Address

- **MCP SDK v2 migration timeline**: v2 release expected Q1 2026. Research confirms 6+ months support for v1.x, but no concrete EOL date. Plan: Build on v1.25.2, monitor v2 release, budget migration time post-launch.

- **Claude Desktop timeout configuration**: Default 60-second timeout for tool calls. Indexing large codebases may exceed this. Plan: Implement async indexing pattern (start_indexing + get_index_status) or document timeout increase in config.

- **Multi-project collection switching**: Research shows per-project collections require multiple MCP server entries in Claude Desktop config. Plan: Document pattern in Phase 3, defer dynamic switching to v2.

- **Progress notifications for indexing**: SDK supports progress notifications, but adds complexity. Research shows simple completion summary is sufficient for v1. Plan: Defer to v2 based on user feedback.

## Sources

### Primary (HIGH confidence)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) - Official SDK, v2 timeline
- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25) - Authoritative protocol definition
- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) - Version 1.25.2 verification
- [Building MCP Servers Guide](https://modelcontextprotocol.io/docs/develop/build-server) - Tool registration, stdio patterns
- [Claude Desktop MCP Setup](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) - Configuration requirements
- [The MCP Security Survival Guide](https://towardsdatascience.com/the-mcp-security-survival-guide-best-practices-pitfalls-and-real-world-lessons/) - 2025 real-world incidents
- [Top 6 MCP Vulnerabilities](https://www.descope.com/blog/post/mcp-vulnerabilities) - 0.0.0.0 Day, SQL injection post-mortems
- [MCP Server Design Principles](https://www.matt-adams.co.uk/2025/08/30/mcp-design-principles.html) - Tool design patterns
- [How Not to Write an MCP Server](https://towardsdatascience.com/how-not-to-write-an-mcp-server/) - Anti-patterns

### Secondary (MEDIUM confidence)
- [Block's MCP Design Playbook](https://engineering.block.xyz/blog/blocks-playbook-for-designing-mcp-servers) - Enterprise patterns
- [Should you wrap MCP around existing API?](https://www.scalekit.com/blog/wrap-mcp-around-existing-api) - 4 wrapper patterns
- [Unit Testing MCP Servers](https://mcpcat.io/guides/writing-unit-tests-mcp-servers/) - Testing strategies
- [How to Test MCP Servers](https://codely.com/en/blog/how-to-test-mcp-servers) - Integration testing
- [Error Handling MCP Servers](https://www.stainless.com/mcp/error-handling-and-debugging-mcp-servers) - Error patterns
- [Build Timeout-Proof MCP Tools](https://www.arsturn.com/blog/no-more-timeouts-how-to-build-long-running-mcp-tools-that-actually-finish-the-job) - Async patterns

### Tertiary (LOW confidence, verified against primary sources)
- Multiple community tutorials from dev.to, medium.com, hackteam.io - Cross-verified patterns against official docs
- WebSearch findings on v1.25.2 as latest stable (1/22/2026) - Confirmed against npm registry

---
*Research completed: 2026-01-22*
*Ready for roadmap: yes*
