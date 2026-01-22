# MCP Server Pitfalls

**Domain:** Model Context Protocol (MCP) Server Development
**Project Context:** Adding MCP server to expose existing RLM capabilities to Claude Desktop
**Researched:** 2026-01-22
**Confidence:** HIGH (2025 MCP specification, production post-mortems, security research)

## Executive Summary

This research focuses on pitfalls specific to building MCP servers, particularly when wrapping existing systems like RLM. The existing RLM system is solid; the risk is in the MCP integration layer. Common failure modes include stdio transport corruption, tool schema misdesign, security vulnerabilities from treating MCP as "just local," and silent failures that degrade user experience.

**Key insight:** MCP servers in 2025 are still relatively new, and the ecosystem has already identified critical security issues (0.0.0.0 Day, SQL injection via prompt injection, Confused Deputy) and design anti-patterns (tools that are "too smart," poor descriptions, exposing raw APIs). Learning from these production failures is cheaper than experiencing them.

---

## Critical Pitfalls

### Pitfall 1: Stdout/Stderr Confusion (The Protocol Killer)

**What goes wrong:**
MCP servers that write anything except JSON-RPC messages to stdout cause immediate protocol failures. Logging statements, debug prints, console warnings, or even library output to stdout corrupt the message stream. Claude Desktop receives malformed JSON, the connection closes with error -32000, and the server appears "broken" with no obvious cause.

**Why it happens:**
MCP's stdio transport uses stdout exclusively for protocol messages. Developers instinctively add `console.log()` for debugging, or dependencies emit warnings to stdout. The failure is immediate but the cause is non-obvious - logs show connection closed but don't reveal that stdout was contaminated.

**How to avoid:**
- **Rule zero:** Only JSON-RPC messages go to stdout. Period.
- Redirect ALL logs, debug output, and application messages to stderr
- Configure logging frameworks explicitly: `winston.transports.Console({ stream: process.stderr })`
- Set environment variables for verbose dependencies: `PYTHONUNBUFFERED=1` (but verify it writes to stderr)
- Use `DEBUG=*` environment variables that write to stderr by default
- Wrap the server entry point with stdout validation in tests

**Prevention strategy:**
```typescript
// Good: Explicit stderr logging
import { createLogger, transports } from 'winston';

const logger = createLogger({
  transports: [
    new transports.Console({
      stream: process.stderr,  // CRITICAL: stderr, not stdout
      format: combine(timestamp(), json())
    })
  ]
});

// Bad: Default console logging
console.log('Starting MCP server');  // KILLS PROTOCOL
```

**Warning signs:**
- Connection immediately closes after server starts
- MCP error -32000 (connection closed)
- Works in MCP Inspector but fails in Claude Desktop
- No handshake messages in server logs
- Server process exits immediately with no error

**Detection:**
```bash
# Test that server only outputs JSON to stdout
node server.js | jq . > /dev/null
# Should succeed with clean JSON, fail if any non-JSON on stdout
```

**Phase to address:** Phase 1 (MCP Server Setup) - Must be correct from the first line of code

**Sources:**
- [Error Handling And Debugging MCP Servers - Stainless](https://www.stainless.com/mcp/error-handling-and-debugging-mcp-servers) - HIGH confidence
- [Debugging Model Context Protocol Servers](https://www.mcpevals.io/blog/debugging-mcp-servers-tips-and-best-practices) - HIGH confidence
- [STDIO Transport | MCP Framework](https://mcp-framework.com/docs/Transports/stdio-transport/) - HIGH confidence

---

### Pitfall 2: Tool Descriptions That Don't Guide LLMs

**What goes wrong:**
Tool descriptions that seem clear to humans confuse LLMs. The AI doesn't know when to use the tool, passes parameters in the wrong format, or makes excessive tool calls trying different parameter combinations. Users get frustrated as Claude "doesn't understand" the tools.

**Why it happens:**
This is the **primary failure mode** for new MCP servers. Developers write descriptions like API documentation (technical, accurate, terse). LLMs need contextual guidance: when to use it, what problems it solves, input format examples, and edge case handling.

**How to avoid:**
- **Start with the workflow:** What task is the user trying to accomplish?
- **Describe the "why":** Not just what the tool does, but when to use it
- **Be explicit about format:** Don't assume LLMs will infer `YYYY-MM-DD` from "date string"
- **Include constraints:** Max values, required combinations, mutually exclusive options
- **Test with actual LLM:** Use MCP Inspector + Claude to verify tool descriptions work

**Prevention strategy:**
```typescript
// Bad: Technical but unclear
{
  name: "rlm_search",
  description: "Search the RLM index",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "number" }
    }
  }
}

// Good: Contextual guidance for LLM
{
  name: "rlm_search",
  description: `Search the codebase index to find relevant code, functions, or documentation.

Use this when:
- User asks about specific code functionality
- Need to understand how a feature is implemented
- Looking for examples of a pattern in the codebase

The query should be natural language describing what you're looking for.
Limit controls max results returned (default 5, max 20).

Returns: Array of code chunks with file paths, line numbers, and relevance scores.`,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Natural language query describing what code to find. Example: 'authentication middleware functions'"
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return. Default: 5, Range: 1-20",
        minimum: 1,
        maximum: 20
      }
    },
    required: ["query"]
  }
}
```

**Warning signs:**
- Claude makes multiple tool calls trying to "figure out" the right parameters
- Users need to explicitly instruct which tool to use
- Parameter validation errors despite correct schema
- Tools never get called even for obvious use cases
- Excessive tool calls as LLM "hedges its bets"

**Phase to address:** Phase 1 (MCP Server Setup) - Tool design is foundational

**Sources:**
- [MCP Server Design Principles](https://www.matt-adams.co.uk/2025/08/30/mcp-design-principles.html) - HIGH confidence
- [How Not to Write an MCP Server | Towards Data Science](https://towardsdatascience.com/how-not-to-write-an-mcp-server/) - HIGH confidence
- [Common Challenges in MCP Server Development](https://dev.to/nishantbijani/common-challenges-in-mcp-server-development-and-how-to-solve-them-35ne) - MEDIUM confidence

---

### Pitfall 3: Security Theater (The "Just Local" Fallacy)

**What goes wrong:**
Developers skip security controls because the MCP server is "just running locally" or "just for development." Then 0.0.0.0 binding exposes the server to the network, or the server becomes an attack vector for prompt injection exploits. Real-world examples: MCP Inspector exposed command execution on 0.0.0.0, Anthropic's SQLite server had SQL injection.

**Why it happens:**
MCP feels like a local development tool, not a production API. Security seems like overkill for "just wrapping local functionality." The attack surface is non-obvious - prompt injection can turn into stored attacks via the tool execution layer.

**How to avoid:**
- **Never bind to 0.0.0.0:** Always bind servers to 127.0.0.1 (localhost only)
- **Validate ALL inputs:** Treat LLM-generated parameters as untrusted user input
- **Use allowlisting over blocklisting:** Define what's permitted, not what's blocked
- **Implement the principle of least privilege:** Don't run with elevated permissions
- **Audit file system access:** Ensure tools can't escape their intended directories
- **Log security-relevant events:** Tool calls with parameters, file access, errors

**Prevention strategy:**
```typescript
// Input validation for RLM search
function validateSearchInput(params: unknown): SearchParams {
  const schema = z.object({
    query: z.string()
      .min(1, "Query cannot be empty")
      .max(500, "Query too long")
      .refine(
        q => !q.includes('\0') && !q.includes('\x00'),
        "Query contains invalid characters"
      ),
    limit: z.number()
      .int()
      .min(1)
      .max(20)
      .default(5)
  });

  return schema.parse(params);  // Throws on validation failure
}

// File path validation
function validateFilePath(path: string, allowedRoot: string): string {
  const resolved = resolve(allowedRoot, path);

  // Prevent directory traversal
  if (!resolved.startsWith(allowedRoot)) {
    throw new Error('Path traversal attempt detected');
  }

  return resolved;
}
```

**Warning signs:**
- No input validation beyond type checking
- File paths accepted without sanitization
- Server binds to non-localhost addresses
- No rate limiting on tool calls
- Secrets or credentials in tool responses

**Real-world incidents:**
- **0.0.0.0 Day (June 2025):** MCP Inspector bound to all interfaces with no auth, exposed command execution
- **SQL Injection → Prompt Injection (June 2025):** Anthropic's SQLite server allowed SQL injection that became stored prompt injection
- **Asana Multi-Tenant Failure (2025):** One customer accessed another customer's data due to shared infrastructure

**Phase to address:** Phase 1 (MCP Server Setup) - Security by design, not retrofitted

**Sources:**
- [The MCP Security Survival Guide | Towards Data Science](https://towardsdatascience.com/the-mcp-security-survival-guide-best-practices-pitfalls-and-real-world-lessons/) - HIGH confidence
- [Top 6 MCP Vulnerabilities (and How to Fix Them)](https://www.descope.com/blog/post/mcp-vulnerabilities) - HIGH confidence
- [Model Context Protocol Security Best Practices](https://www.legitsecurity.com/aspm-knowledge-base/model-context-protocol-security) - HIGH confidence
- [MCP Spec: Security Best Practices](https://modelcontextprotocol.io/specification/2025-11-25) - HIGH confidence

---

### Pitfall 4: Wrapping APIs Instead of Workflows

**What goes wrong:**
Developers expose RLM's raw API as MCP tools: `get_chunk`, `search_by_vector`, `get_metadata`. The LLM has to orchestrate low-level operations to accomplish user goals. This creates brittle, verbose multi-tool sequences that break when the LLM guesses wrong about the API contract.

**Why it happens:**
It's natural to map existing API methods to MCP tools. This works for simple wrappers but fails for complex systems. MCP tools should represent **user intentions** (search codebase, understand function, trace dependencies), not API primitives.

**How to avoid:**
- **Design top-down from workflows:** What does the user want to accomplish?
- **Group related operations:** Multi-step API calls become one tool
- **Embed domain knowledge:** The tool knows how to use the API correctly
- **Provide smart defaults:** Users shouldn't need to know internal parameters

**Prevention strategy:**
```typescript
// Bad: Low-level API exposure
{
  name: "rlm_get_chunks",
  description: "Get chunks by IDs"
}
{
  name: "rlm_search_vector",
  description: "Vector similarity search"
}
{
  name: "rlm_get_metadata",
  description: "Get chunk metadata"
}

// Good: Workflow-oriented tools
{
  name: "search_codebase",
  description: `Search the codebase for relevant code and documentation.
  Automatically handles hybrid search (vector + BM25), reranking, and metadata enrichment.
  Returns ready-to-use code snippets with context.`,
  // Internally: search_vector + get_metadata + format_results
}

{
  name: "understand_function",
  description: `Analyze a specific function: get its implementation, find where it's called,
  understand its dependencies. Automatically retrieves cross-file context.`,
  // Internally: search by symbol + get_references + get_imports
}
```

**Warning signs:**
- MCP tools mirror internal API 1:1
- Users need to call 3-5 tools to accomplish one task
- Tool descriptions reference internal concepts (vector search, chunks, metadata)
- Frequent parameter validation errors as LLM guesses API contracts

**Phase to address:** Phase 1 (MCP Server Setup) - Tool design determines usability

**Sources:**
- [Should you wrap MCP around your existing API?](https://www.scalekit.com/blog/wrap-mcp-around-existing-api) - HIGH confidence
- [From REST API to MCP Server - Stainless](https://www.stainless.com/mcp/from-rest-api-to-mcp-server) - HIGH confidence
- [Wrapping an Existing API with MCP](https://gun.io/ai/2025/05/wrap-existing-api-with-mcp/) - HIGH confidence
- [Block's Playbook for Designing MCP Servers](https://engineering.block.xyz/blog/blocks-playbook-for-designing-mcp-servers) - HIGH confidence

---

### Pitfall 5: Silent Failures and Poor Error Handling

**What goes wrong:**
When RLM services are unavailable (Ollama crashed, Qdrant not running), the MCP server returns empty results or generic errors. Claude interprets empty results as "no matches found" and gives wrong answers. Users have no visibility into what actually failed.

**Why it happens:**
Error handling is added as an afterthought. Developers focus on the happy path. MCP servers run in the background, so errors aren't immediately visible. The protocol doesn't enforce rich error reporting.

**How to avoid:**
- **Return structured error responses:** Not empty results, actual errors
- **Distinguish error types:** Service unavailable vs. query failed vs. no matches found
- **Provide actionable guidance:** Tell users how to fix the problem
- **Log errors with context:** Include request ID, parameters, stack traces
- **Implement health checks:** Verify dependencies are available at startup

**Prevention strategy:**
```typescript
// Good error handling
async function handleSearch(params: SearchParams): Promise<ToolResult> {
  try {
    // Validate inputs first
    const validated = validateSearchInput(params);

    // Check dependencies
    if (!await rlm.isHealthy()) {
      return {
        content: [{
          type: "text",
          text: "RLM service unavailable. Please ensure:\n" +
                "1. Ollama is running (ollama serve)\n" +
                "2. Qdrant is running\n" +
                "3. Index exists (run: rlm index)"
        }],
        isError: true
      };
    }

    // Execute search
    const results = await rlm.search(validated.query, validated.limit);

    if (results.length === 0) {
      return {
        content: [{
          type: "text",
          text: `No matches found for "${validated.query}".\n` +
                `Try: Broader query terms, check if codebase is indexed, verify search scope.`
        }],
        isError: false  // Not an error, just no results
      };
    }

    return {
      content: [{ type: "text", text: formatResults(results) }],
      isError: false
    };

  } catch (error) {
    // Log with context
    logger.error('Search failed', {
      params,
      error: error.message,
      stack: error.stack
    });

    // Return user-friendly error
    return {
      content: [{
        type: "text",
        text: `Search failed: ${error.message}\n\n` +
              `If this persists, check logs: ${LOG_PATH}`
      }],
      isError: true
    };
  }
}
```

**Warning signs:**
- Empty responses when services are down
- Generic "Error occurred" messages with no details
- No distinction between "no results" and "search failed"
- Errors only visible in server logs, not returned to client
- Claude confidently gives wrong answers based on empty results

**Phase to address:** Phase 1 (MCP Server Setup) - Core error handling

**Sources:**
- [Error Handling in MCP Servers - Best Practices](https://mcpcat.io/guides/error-handling-custom-mcp-servers/) - HIGH confidence
- [Error Handling And Debugging MCP Servers - Stainless](https://www.stainless.com/mcp/error-handling-and-debugging-mcp-servers) - HIGH confidence
- [MCP Known Issues: Common Problems & Troubleshooting](https://www.byteplus.com/en/topic/541583) - MEDIUM confidence

---

### Pitfall 6: Timeout Disasters for Long-Running Operations

**What goes wrong:**
RLM indexing takes 30-60 seconds for large codebases. MCP client timeout is 60 seconds by default. The tool call times out, but the index operation continues in the background. Users get timeout errors and don't know if indexing succeeded or failed.

**Why it happens:**
Most MCP tools are designed for <5 second operations. Indexing, analysis, or recursive search can take minutes. The MCP protocol supports progress notifications, but developers don't implement them. Client timeout configuration is buried in JSON config files.

**How to avoid:**
- **Never run long operations synchronously:** Use async hand-off pattern
- **Implement progress notifications:** Keep connection alive, show progress
- **Break monolithic tasks into chunks:** Index by directory, report progress per chunk
- **Provide status query tools:** Separate "start index" from "check status"
- **Document timeout configuration:** Tell users how to increase timeouts if needed

**Prevention strategy:**
```typescript
// Bad: Synchronous long operation
{
  name: "index_codebase",
  description: "Index the entire codebase",
  handler: async (params) => {
    await rlm.indexAll();  // Takes 60+ seconds, will timeout
    return { success: true };
  }
}

// Good: Async with progress
{
  name: "start_indexing",
  description: "Start indexing the codebase. Use get_index_status to check progress.",
  handler: async (params, { progressToken }) => {
    // Start background task
    const taskId = await rlm.startIndexing({
      onProgress: (progress) => {
        // Send progress notification (keeps connection alive)
        sendProgress(progressToken, {
          stage: progress.stage,
          current: progress.current,
          total: progress.total,
          message: `Indexing ${progress.current}/${progress.total} files`
        });
      }
    });

    return {
      content: [{
        type: "text",
        text: `Indexing started (task: ${taskId})\n` +
              `Use get_index_status to check progress.`
      }]
    };
  }
}

{
  name: "get_index_status",
  description: "Check indexing progress",
  handler: async (params) => {
    const status = await rlm.getIndexStatus();
    return {
      content: [{
        type: "text",
        text: `Status: ${status.state}\n` +
              `Progress: ${status.filesIndexed}/${status.totalFiles} files\n` +
              `Estimated time remaining: ${status.estimatedSeconds}s`
      }]
    };
  }
}
```

**Warning signs:**
- Timeout errors for indexing or analysis operations
- No visibility into operation progress
- Operations continue after timeout (zombie tasks)
- Default 60-second timeout causes frequent failures
- Users don't know if operation succeeded or failed

**Phase to address:** Phase 1 (MCP Server Setup) - Architecture decision for long operations

**Sources:**
- [Build Timeout-Proof MCP Tools for Long-Running Tasks](https://www.arsturn.com/blog/no-more-timeouts-how-to-build-long-running-mcp-tools-that-actually-finish-the-job) - HIGH confidence
- [Fix MCP Error -32001: Request Timeout](https://mcpcat.io/guides/fixing-mcp-error-32001-request-timeout/) - HIGH confidence
- [MCP Timeout Issues - Can this be extended?](https://github.com/cline/cline/issues/1306) - MEDIUM confidence

---

### Pitfall 7: Missing Schema Validation (Confused Deputy)

**What goes wrong:**
The LLM generates a tool call with invalid parameters. The server blindly passes them to RLM. RLM crashes, returns cryptic errors, or does something unintended. This is the **Confused Deputy Problem** - the MCP server acts on behalf of the LLM without verifying the request is valid and safe.

**Why it happens:**
Developers trust the LLM to generate correct parameters. The MCP protocol's JSON Schema is for documentation, not enforcement. Runtime validation is manual and often skipped. The server assumes "if the LLM sent it, it must be valid."

**How to avoid:**
- **Server-side validation is mandatory:** Never trust LLM-generated inputs
- **Use schema validation libraries:** zod, joi, ajv for runtime checks
- **Validate before execution:** Fail fast with clear error messages
- **Test with malicious inputs:** Parameter injection, oversized values, type confusion
- **Log validation failures:** Track what the LLM is attempting

**Prevention strategy:**
```typescript
import { z } from 'zod';

// Define strict schema
const SearchParamsSchema = z.object({
  query: z.string()
    .min(1, "Query cannot be empty")
    .max(500, "Query exceeds 500 character limit"),
  limit: z.number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(20, "Limit cannot exceed 20")
    .optional()
    .default(5),
  filters: z.object({
    fileTypes: z.array(z.string()).optional(),
    paths: z.array(z.string()).optional()
  }).optional()
});

// Validate in handler
async function handleSearch(params: unknown) {
  try {
    // Parse and validate - throws on invalid input
    const validated = SearchParamsSchema.parse(params);

    // Now safe to use validated params
    return await rlm.search(validated);

  } catch (error) {
    if (error instanceof z.ZodError) {
      // Return validation errors to LLM
      return {
        content: [{
          type: "text",
          text: `Invalid parameters:\n${error.errors.map(e =>
            `- ${e.path.join('.')}: ${e.message}`
          ).join('\n')}`
        }],
        isError: true
      };
    }
    throw error;
  }
}
```

**Warning signs:**
- Runtime errors from invalid parameters
- Cryptic error messages from RLM layer
- Type errors in production logs
- LLM repeatedly trying parameter variations
- No validation beyond TypeScript types

**Phase to address:** Phase 1 (MCP Server Setup) - Security and reliability requirement

**Sources:**
- [MCP Input Validation: Techniques & Best Practices](https://www.byteplus.com/en/topic/541210) - HIGH confidence
- [MCP Tool Input Validation Testing](https://mcpcat.io/guides/validation-tests-tool-inputs/) - HIGH confidence
- [Tools - FastMCP (validation documentation)](https://gofastmcp.com/servers/tools) - HIGH confidence

---

### Pitfall 8: No Testing Strategy (The Integration Nightmare)

**What goes wrong:**
MCP server appears to work in manual testing with Inspector, but fails in Claude Desktop with cryptic errors. Tool calls work individually but fail in multi-tool workflows. Changes break existing tools. No regression detection until users complain.

**Why it happens:**
Testing MCP servers is non-trivial - they're protocol implementations, not simple functions. Developers test manually with Inspector, ship it, and hope. There's no established testing framework or best practices. Integration testing requires spinning up the full stack.

**How to avoid:**
- **Two-tiered testing:** Unit tests for logic, integration tests for protocol
- **Test in-memory where possible:** Don't require actual Ollama/Qdrant for unit tests
- **Use MCP Inspector for integration tests:** Automate inspector-based validation
- **Test multi-tool workflows:** Not just individual tools
- **Mock external dependencies:** RLM, file system, network
- **Test error paths:** Not just happy path

**Prevention strategy:**
```typescript
// Unit test: Tool logic without protocol
describe('Search tool', () => {
  it('validates parameters correctly', () => {
    expect(() => validateSearchParams({
      query: '',  // Invalid: empty
      limit: 5
    })).toThrow('Query cannot be empty');
  });

  it('handles RLM service unavailable', async () => {
    const mockRLM = createMockRLM({ isHealthy: false });
    const result = await handleSearch({ query: 'test' }, mockRLM);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('service unavailable');
  });
});

// Integration test: Full MCP protocol
describe('MCP Server Integration', () => {
  let server: MCPServer;
  let client: MCPTestClient;

  beforeEach(async () => {
    server = await startTestServer({
      rlm: createMockRLM({ hasData: true })
    });
    client = await MCPTestClient.connect(server);
  });

  it('completes handshake and lists tools', async () => {
    const init = await client.initialize();
    expect(init.serverInfo.name).toBe('rlm-mcp-server');

    const tools = await client.listTools();
    expect(tools).toContainEqual(
      expect.objectContaining({ name: 'search_codebase' })
    );
  });

  it('executes search tool end-to-end', async () => {
    const result = await client.callTool('search_codebase', {
      query: 'authentication',
      limit: 5
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('results');
  });
});
```

**Warning signs:**
- Only manual testing with Inspector
- No automated tests for MCP protocol compliance
- Changes break existing tools unexpectedly
- No tests for error conditions
- Can't reproduce user-reported issues in development

**Phase to address:** Phase 2 (Test Coverage) - Critical for 85% coverage goal

**Sources:**
- [Unit Testing MCP Servers - Complete Testing Guide](https://mcpcat.io/guides/writing-unit-tests-mcp-servers/) - HIGH confidence
- [How to Test MCP Servers - Blog Codely](https://codely.com/en/blog/how-to-test-mcp-servers) - HIGH confidence
- [MCP Integration Testing - E2E Testing Guide](https://mcpcat.io/guides/integration-tests-mcp-flows/) - HIGH confidence
- [What's the best way to test an MCP server locally?](https://milvus.io/ai-quick-reference/whats-the-best-way-to-test-an-model-context-protocol-mcp-server-locally) - MEDIUM confidence

---

## Moderate Pitfalls

### Pitfall 9: Configuration Complexity

**What goes wrong:**
Users struggle to configure Claude Desktop to use the MCP server. The JSON config format is unforgiving, paths must be absolute, environment variables are finnicky. One typo breaks everything with cryptic errors.

**Prevention:**
- Provide pre-built config snippets with placeholders
- Document exact paths for common OS configurations
- Include validation script to test config before deployment
- Use environment variables for user-specific paths
- Provide troubleshooting guide for common config mistakes

**Phase to address:** Phase 3 (Documentation & Polish)

---

### Pitfall 10: No Observability

**What goes wrong:**
MCP server runs in background. When things break, there's no visibility into what happened. No metrics, no traces, no dashboards. Debugging requires adding logs and restarting.

**Prevention:**
- Structured logging to file (not stderr for debugging)
- Log rotation to prevent disk fill
- Metrics for tool call counts, latency, errors
- Health check endpoint (for debugging, not exposed)
- Document log locations in user guide

**Phase to address:** Phase 3 (Documentation & Polish)

---

### Pitfall 11: Resource Leaks

**What goes wrong:**
MCP server doesn't clean up RLM connections, file handles, or memory. Over time, performance degrades or server crashes. Especially problematic if RLM keeps embedding cache in memory.

**Prevention:**
- Implement proper connection lifecycle management
- Close resources in error paths (use try/finally)
- Monitor memory usage in long-running tests
- Implement graceful shutdown handlers
- Periodic cleanup of stale cache entries

**Phase to address:** Phase 2 (Test Coverage) - Verify in long-running tests

---

## Integration Gotchas (RLM-Specific)

| RLM Concern | MCP Impact | Prevention |
|-------------|------------|------------|
| RLM initialization slow | MCP handshake timeout | Lazy-initialize RLM on first tool call, not at server start |
| Ollama unavailable | Silent failures | Health check before tool execution, return actionable errors |
| Qdrant port conflict | Connection failures | Document port requirements, provide port configuration |
| Embedding cache grows | Memory leak | Implement cache eviction, expose cache clear tool |
| Index file locked | Concurrent access errors | Use read locks for search, write locks only for indexing |
| Recursion depth limits | Tool calls fail | Expose recursion config as tool parameter with validation |

---

## Configuration Pitfalls

### Claude Desktop Config Format

**Common mistakes:**
```json
{
  "mcpServers": {
    "rlm": {
      // BAD: Relative path
      "command": "node",
      "args": ["./dist/mcp-server.js"],  // FAILS

      // GOOD: Absolute path
      "args": ["N:/get-shit-done-pro-max/dist/mcp-server.js"],

      // BAD: Missing env vars
      "env": {}  // RLM won't find Ollama

      // GOOD: Required env vars
      "env": {
        "OLLAMA_HOST": "http://localhost:11434",
        "QDRANT_URL": "http://localhost:6333",
        "RLM_DATA_DIR": "N:/get-shit-done-pro-max/.rlm"
      }
    }
  }
}
```

**Validation checklist:**
- [ ] All paths are absolute
- [ ] Command executable is in PATH or absolute path
- [ ] Environment variables include all RLM dependencies
- [ ] No syntax errors in JSON (trailing commas, unescaped quotes)
- [ ] Server name is unique across all MCP servers

---

## Testing Blind Spots

| Test Gap | Why It Matters | How to Test |
|----------|----------------|-------------|
| Multi-tool sequences | LLM orchestrates complex workflows | Record real Claude sessions, replay as tests |
| Tool call with invalid JSON | Protocol robustness | Fuzz testing with malformed requests |
| Concurrent tool calls | Race conditions, resource conflicts | Parallel test execution |
| Large result sets | Serialization limits, timeout | Test with queries returning >100 results |
| Startup without RLM services | Graceful degradation | Kill Ollama/Qdrant before starting server |

---

## Protocol Compliance Checklist

- [ ] **Handshake:** Server responds to initialize with correct capabilities
- [ ] **Tools list:** All tools have name, description, inputSchema
- [ ] **Tool execution:** Returns valid ToolResult format
- [ ] **Error format:** Uses isError flag, not exceptions
- [ ] **Progress notifications:** Implemented for long operations
- [ ] **Cancellation:** Respects cancellation requests (if applicable)
- [ ] **JSON-RPC 2.0:** All responses include id, jsonrpc: "2.0"
- [ ] **Stdout hygiene:** Only protocol messages on stdout

---

## Security Checklist

- [ ] **Input validation:** All parameters validated with schema
- [ ] **Path sanitization:** File paths checked for traversal attempts
- [ ] **Localhost only:** Server binds to 127.0.0.1, not 0.0.0.0
- [ ] **No secrets in responses:** Don't return API keys, tokens, credentials
- [ ] **Rate limiting:** Prevent tool call spam (if needed)
- [ ] **Error messages:** Don't leak internal paths or stack traces to client
- [ ] **Audit logging:** Security-relevant events logged with context

---

## Recovery Strategies

| Pitfall | If You Hit It | Recovery Cost |
|---------|---------------|---------------|
| Stdout contamination | Add explicit stderr logging everywhere | LOW - Code change, no data loss |
| Poor tool descriptions | Rewrite descriptions, test with Claude | LOW - Documentation only |
| Security holes | Audit all inputs, add validation | MEDIUM - Code changes, security review |
| Wrong API abstraction | Redesign tool surface | HIGH - API breaking change |
| No error handling | Add try/catch, structured errors | MEDIUM - Refactor handlers |
| Timeout issues | Implement async pattern | HIGH - Architecture change |
| Missing validation | Add zod schemas | MEDIUM - Per-tool validation code |
| No tests | Write test suite | HIGH - Test infrastructure + coverage |

---

## Pitfall-to-Phase Mapping

| Pitfall | Phase | Why This Phase |
|---------|-------|----------------|
| Stdout/stderr confusion | 1 (Setup) | Foundation - breaks protocol immediately |
| Tool descriptions | 1 (Setup) | Foundation - determines usability |
| Security theater | 1 (Setup) | Security by design, not retrofitted |
| Wrong API abstraction | 1 (Setup) | Tool design is hard to change later |
| Silent failures | 1 (Setup) | Core error handling architecture |
| Timeout disasters | 1 (Setup) | Architecture decision (sync vs async) |
| Missing validation | 1 (Setup) | Security and reliability requirement |
| No testing strategy | 2 (Coverage) | Need code before tests |
| Configuration complexity | 3 (Documentation) | Once tool surface is stable |
| No observability | 3 (Documentation) | After core functionality works |
| Resource leaks | 2 (Coverage) | Detected by integration tests |

---

## Warning Signs Dashboard

**If you see any of these, stop and investigate:**

| Symptom | Likely Pitfall | Fix Priority |
|---------|----------------|--------------|
| Connection closes immediately | Stdout contamination | CRITICAL |
| Claude doesn't use tools | Poor descriptions | HIGH |
| Timeout errors | Long-running ops not async | HIGH |
| Empty results when services down | Silent failures | HIGH |
| Parameter validation errors | Missing validation | MEDIUM |
| Works in Inspector, fails in Claude | Config issues | MEDIUM |
| Memory usage grows over time | Resource leaks | MEDIUM |
| Can't reproduce user issues | No tests | MEDIUM |

---

## Success Criteria Checklist

**Before shipping MCP server:**

- [ ] **Protocol correctness:** Passes MCP Inspector validation
- [ ] **Claude Desktop works:** Full integration test in real Claude Desktop
- [ ] **Error handling:** All failure modes return structured errors
- [ ] **Security:** Input validation, localhost binding, no secrets leaked
- [ ] **Testing:** 85% coverage with unit + integration tests
- [ ] **Documentation:** Config guide, troubleshooting, common issues
- [ ] **Observability:** Structured logs, documented log locations
- [ ] **Performance:** Tool calls complete in <5s for searches, async for indexing

---

## Sources

### Security Research
- [The MCP Security Survival Guide | Towards Data Science](https://towardsdatascience.com/the-mcp-security-survival-guide-best-practices-pitfalls-and-real-world-lessons/) - HIGH confidence (real-world 2025 incidents)
- [Top 6 MCP Vulnerabilities (and How to Fix Them)](https://www.descope.com/blog/post/mcp-vulnerabilities) - HIGH confidence (0.0.0.0 Day, SQL injection)
- [Model Context Protocol Security Best Practices](https://www.legitsecurity.com/aspm-knowledge-base/model-context-protocol-security) - HIGH confidence

### Design Patterns
- [MCP Server Design Principles](https://www.matt-adams.co.uk/2025/08/30/mcp-design-principles.html) - HIGH confidence
- [How Not to Write an MCP Server | Towards Data Science](https://towardsdatascience.com/how-not-to-write-an-mcp-server/) - HIGH confidence
- [Block's Playbook for Designing MCP Servers](https://engineering.block.xyz/blog/blocks-playbook-for-designing-mcp-servers) - HIGH confidence

### API Wrapping Strategies
- [Should you wrap MCP around your existing API?](https://www.scalekit.com/blog/wrap-mcp-around-existing-api) - HIGH confidence (4 wrapper patterns)
- [From REST API to MCP Server - Stainless](https://www.stainless.com/mcp/from-rest-api-to-mcp-server) - HIGH confidence
- [Wrapping an Existing API with MCP](https://gun.io/ai/2025/05/wrap-existing-api-with-mcp/) - HIGH confidence

### Debugging & Error Handling
- [Error Handling And Debugging MCP Servers - Stainless](https://www.stainless.com/mcp/error-handling-and-debugging-mcp-servers) - HIGH confidence
- [Debugging Model Context Protocol Servers](https://www.mcpevals.io/blog/debugging-mcp-servers-tips-and-best-practices) - HIGH confidence
- [Error Handling in MCP Servers - Best Practices](https://mcpcat.io/guides/error-handling-custom-mcp-servers/) - HIGH confidence

### Testing Strategies
- [Unit Testing MCP Servers - Complete Testing Guide](https://mcpcat.io/guides/writing-unit-tests-mcp-servers/) - HIGH confidence
- [How to Test MCP Servers - Blog Codely](https://codely.com/en/blog/how-to-test-mcp-servers) - HIGH confidence
- [MCP Integration Testing - E2E Testing Guide](https://mcpcat.io/guides/integration-tests-mcp-flows/) - HIGH confidence

### Production Operations
- [MCP Observability - Your Complete Guide](https://mcpmanager.ai/blog/mcp-observability/) - HIGH confidence
- [Build Timeout-Proof MCP Tools for Long-Running Tasks](https://www.arsturn.com/blog/no-more-timeouts-how-to-build-long-running-mcp-tools-that-actually-finish-the-job) - HIGH confidence
- [Real-Time MCP Monitoring and Logging - Stainless](https://www.stainless.com/mcp/real-time-mcp-monitoring-and-logging) - MEDIUM confidence

### Official Specification
- [Model Context Protocol Specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25) - HIGH confidence (authoritative)
- [MCP Best Practices: Architecture & Implementation Guide](https://modelcontextprotocol.info/docs/best-practices/) - HIGH confidence

### Community Experience
- [Common Challenges in MCP Server Development](https://dev.to/nishantbijani/common-challenges-in-mcp-server-development-and-how-to-solve-them-35ne) - MEDIUM confidence
- [MCP Known Issues: Common Problems & Troubleshooting](https://www.byteplus.com/en/topic/541583) - MEDIUM confidence
- [15 Best Practices for Building MCP Servers in Production](https://thenewstack.io/15-best-practices-for-building-mcp-servers-in-production/) - MEDIUM confidence

---

*MCP Server Pitfalls Research for RLM v1.1 Milestone*
*Researched: 2026-01-22*
*Context: Wrapping existing RLM system (search, index, status) for Claude Desktop integration*
*Risk focus: Integration layer pitfalls, not RLM core (already validated)*
