# Phase 7: Test Coverage - Research

**Researched:** 2026-01-23
**Domain:** TypeScript testing with Vitest, MCP server testing, Docker integration testing
**Confidence:** HIGH

## Summary

This phase establishes comprehensive test coverage for the RLM codebase, targeting 85% overall with tiered coverage (90% critical tier, 80% standard tier). The testing strategy uses Vitest 3.x with V8 coverage provider, which now provides Istanbul-equivalent accuracy via AST-based remapping (since v3.2.0).

The codebase has three MCP tools (`search_code`, `index_code`, `get_status`) that require unit tests for input validation and error handling, integration tests for JSON-RPC protocol compliance, and E2E tests that spawn the actual MCP server. External dependencies (Qdrant, Ollama) require different mocking strategies for unit vs integration tests.

**Primary recommendation:** Use Vitest 3.x with `@vitest/coverage-v8` for fast, accurate coverage. Mock Ollama with fixed vectors for unit tests. Use `@testcontainers/qdrant` for integration tests. Use `child_process.spawn` for E2E MCP server testing.

## Standard Stack

The established libraries/tools for this testing domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^3.0.0 | Test runner and assertions | Already in package.json, fast, excellent TS support |
| @vitest/coverage-v8 | ^3.0.0 | Coverage collection | V8 provider, AST-based accuracy since v3.2.0 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @testcontainers/qdrant | ^10.24.2 | Spawn Qdrant containers | Integration tests requiring real Qdrant |
| testcontainers | ^10.24.2 | Container orchestration | Peer dependency for @testcontainers/qdrant |
| vitest-mock-process | ^1.0.4 | Mock process.stdin/stdout/stderr | Optional: E2E tests if needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @vitest/coverage-v8 | @vitest/coverage-istanbul | Istanbul more accurate pre-v3.2, now equivalent; V8 faster |
| @testcontainers/qdrant | Direct Docker commands | Testcontainers handles lifecycle, port binding automatically |
| spawn for E2E | In-memory client | Spawn tests actual server binary, validates real stdio transport |

**Installation:**
```bash
npm install -D @vitest/coverage-v8 @testcontainers/qdrant testcontainers
```

## Architecture Patterns

### Recommended Project Structure
```
tests/
  unit/
    mcp/
      tools/
        search.test.ts        # search_code tool unit tests
        index-code.test.ts    # index_code tool unit tests
        status.test.ts        # get_status tool unit tests
      formatters/
        toon-formatter.test.ts
    embedding/
      embedder.test.ts
      sparse-vector.test.ts
    chunking/
      ast-chunker.test.ts
      markdown-chunker.test.ts
    storage/
      qdrant-client.test.ts
    retrieval/
      hybrid-search.test.ts
  integration/
    mcp/
      jsonrpc-protocol.test.ts  # JSON-RPC 2.0 compliance
    indexing/
      full-pipeline.test.ts     # Index + search integration
  e2e/
    mcp-server.e2e.test.ts      # Spawned MCP server tests
  fixtures/
    sample-code/                 # Test corpus files
      example.ts
      example.md
    mocks/
      ollama-mock.ts            # Fixed vector embeddings
      qdrant-mock.ts            # In-memory Qdrant mock
  setup/
    global-setup.ts             # Docker container lifecycle
    test-utils.ts               # Shared test utilities
```

### Pattern 1: Unit Test Isolation with Mocked Dependencies

**What:** Mock all external services (Ollama, Qdrant) for unit tests
**When to use:** Testing business logic, input validation, error handling
**Example:**
```typescript
// Source: Vitest mocking guide + MCP testing best practices
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerSearchTool } from '../../src/rlm/mcp/tools/search.js';

// Mock ollama module
vi.mock('ollama', () => ({
  default: {
    embed: vi.fn().mockResolvedValue({
      embeddings: [[0.1, 0.2, 0.3, /* ... 768 dims */]]
    })
  }
}));

// Mock qdrant client
vi.mock('../../src/rlm/storage/index.js', () => ({
  createQdrantClient: vi.fn().mockResolvedValue({
    query: vi.fn().mockResolvedValue({ points: [] }),
    getCollections: vi.fn().mockResolvedValue({ collections: [] })
  })
}));

describe('search_code tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates query is not empty', async () => {
    // Test input validation
  });

  it('returns formatted error on Qdrant failure', async () => {
    // Test error handling branch
  });
});
```

### Pattern 2: Integration Tests with Testcontainers

**What:** Spin up real Qdrant in Docker for integration tests
**When to use:** Testing real storage operations, JSON-RPC protocol
**Example:**
```typescript
// Source: @testcontainers/qdrant documentation
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { QdrantContainer, StartedQdrantContainer } from '@testcontainers/qdrant';
import { QdrantClient } from '@qdrant/js-client-rest';

describe('Qdrant Integration', () => {
  let container: StartedQdrantContainer;
  let client: QdrantClient;

  beforeAll(async () => {
    container = await new QdrantContainer('qdrant/qdrant:v1.13.1').start();
    client = new QdrantClient({ url: container.getRestHostAddress() });
  }, 60000); // 60s timeout for container startup

  afterAll(async () => {
    await container.stop();
  });

  it('creates collection with hybrid vectors', async () => {
    // Test real Qdrant operations
  });
});
```

### Pattern 3: E2E MCP Server Testing via Spawn

**What:** Spawn actual MCP server binary, communicate via stdio
**When to use:** Validating full MCP protocol flow, TOON output
**Example:**
```typescript
// Source: Node.js child_process docs + MCP stdio testing patterns
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';

describe('MCP Server E2E', () => {
  let server: ChildProcess;
  let requestId = 0;

  const sendRequest = (method: string, params: object): Promise<object> => {
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      const request = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params
      }) + '\n';

      const handler = (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const response = JSON.parse(line);
            if (response.id === id) {
              server.stdout?.off('data', handler);
              resolve(response);
            }
          } catch { /* ignore non-JSON lines */ }
        }
      };

      server.stdout?.on('data', handler);
      server.stdin?.write(request);

      setTimeout(() => {
        server.stdout?.off('data', handler);
        reject(new Error('Request timeout'));
      }, 5000);
    });
  };

  beforeAll(() => {
    server = spawn('node', [join(__dirname, '../../dist/rlm/mcp/server.js')], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, QDRANT_URL: 'http://localhost:6333' }
    });
  });

  afterAll(() => {
    server.kill('SIGTERM');
  });

  it('responds to tools/list with valid JSON-RPC', async () => {
    const response = await sendRequest('tools/list', {});
    expect(response).toHaveProperty('jsonrpc', '2.0');
    expect(response).toHaveProperty('result.tools');
  });
});
```

### Pattern 4: Tiered Coverage Thresholds

**What:** Different coverage requirements for critical vs standard tiers
**When to use:** Vitest configuration for CI enforcement
**Example:**
```typescript
// vitest.config.ts
// Source: Vitest coverage configuration docs
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/rlm/**/*.ts'],
      exclude: ['src/rlm/**/*.test.ts', 'src/rlm/benchmarks/**'],
      thresholds: {
        // Global minimum
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        // Critical tier: MCP tools, CLI, public APIs (90%)
        'src/rlm/mcp/**/*.ts': {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        'src/rlm/cli/**/*.ts': {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
      },
    },
  },
});
```

### Anti-Patterns to Avoid

- **Mocking too deep:** Don't mock internal implementation details. Mock at boundaries (Ollama API, Qdrant client).
- **Flaky time-dependent tests:** Use `vi.useFakeTimers()` for timeout/TTL tests.
- **Shared mutable state:** Each test file gets fresh container/mock state. Use `beforeEach` for cleanup.
- **Testing implementation not behavior:** Test what the tool returns, not how it internally processes data.
- **Ignoring stderr in E2E:** MCP servers log to stderr. Capture and verify no errors occur.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Spawn Docker containers | Shell scripts, docker CLI | @testcontainers/qdrant | Handles port allocation, cleanup, startup detection |
| Coverage collection | Custom instrumentation | @vitest/coverage-v8 | AST-based accuracy, integrates with Vitest |
| JSON-RPC request/response | Manual JSON parsing | Structured helper functions | Error handling, timeout management |
| Fixed embedding vectors | Random numbers | Deterministic hash-based mock | Reproducible tests, meaningful similarity |
| Temp directory management | Manual mkdir/rm | Node's `fs.mkdtemp` + cleanup | OS handles path conflicts |

**Key insight:** Testing infrastructure has mature solutions. Hand-rolling leads to flaky tests, poor cleanup, and maintenance burden.

## Common Pitfalls

### Pitfall 1: Stdout Pollution in MCP Tests
**What goes wrong:** Console.log statements corrupt JSON-RPC stream, causing parse failures
**Why it happens:** Developer adds debug logging, forgets MCP uses stdout for protocol
**How to avoid:**
- All RLM logging goes to stderr (already implemented via `logInfo`/`logError`)
- Test setup captures stderr separately from stdout
- CI fails if stdout contains non-JSON data
**Warning signs:** Intermittent parse errors in E2E tests, "Unexpected token" errors

### Pitfall 2: Container Startup Race Conditions
**What goes wrong:** Tests run before Qdrant is ready to accept connections
**Why it happens:** Container reports "started" before service is healthy
**How to avoid:**
- Use Testcontainers built-in health checks (waits for HTTP readiness)
- Add explicit health check: `await client.getCollections()` before tests
- Use generous timeouts in `beforeAll` (60s recommended)
**Warning signs:** "Connection refused" errors that pass on retry

### Pitfall 3: Parallel Test Interference
**What goes wrong:** Tests share Qdrant collection, data from one test affects another
**Why it happens:** Vitest runs test files in parallel by default
**How to avoid:**
- Use unique collection names per test file: `rlm_test_${process.env.VITEST_POOL_ID}`
- Or use `test.concurrent: false` for integration tests
- Clean up collections in `afterEach`
**Warning signs:** Tests pass in isolation, fail when run together

### Pitfall 4: Mocking ESM Modules Incorrectly
**What goes wrong:** `vi.mock()` doesn't intercept imports, original code runs
**Why it happens:** ESM hoisting, path resolution issues with TypeScript aliases
**How to avoid:**
- Use relative paths in `vi.mock()`, not aliases (`../../src/...` not `@/...`)
- Place `vi.mock()` at top of file (it's hoisted automatically)
- Use `vi.doMock()` for dynamic mocking within tests
**Warning signs:** Mock functions never called, real API calls made

### Pitfall 5: Coverage Gaps in Error Branches
**What goes wrong:** Coverage looks high but error handling untested
**Why it happens:** Happy path tests inflate coverage numbers
**How to avoid:**
- Require branch coverage, not just line coverage
- Write explicit tests for each `catch` block and error condition
- Test both `isError: true` and `isError: false` MCP responses
**Warning signs:** High line coverage (90%+) but low branch coverage (60%)

### Pitfall 6: Embedding Mock Instability
**What goes wrong:** Tests fail because embedding similarities change unpredictably
**Why it happens:** Random or timestamp-based mock vectors
**How to avoid:**
- Use deterministic mock: hash input text to generate consistent vector
- Fixed test corpus with pre-computed expected similarities
**Warning signs:** Flaky search ranking tests

## Code Examples

Verified patterns from official sources and best practices:

### Deterministic Embedding Mock
```typescript
// tests/fixtures/mocks/ollama-mock.ts
// Deterministic mock that produces consistent vectors from input text
import { vi } from 'vitest';
import { createHash } from 'crypto';

const VECTOR_SIZE = 768;

function textToVector(text: string): number[] {
  // Hash text to get seed
  const hash = createHash('sha256').update(text).digest();
  const vector: number[] = [];

  for (let i = 0; i < VECTOR_SIZE; i++) {
    // Use hash bytes to generate deterministic floats
    const byte = hash[i % hash.length];
    vector.push((byte / 255) * 2 - 1); // Normalize to [-1, 1]
  }

  // Normalize to unit vector
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return vector.map(v => v / magnitude);
}

export const mockOllama = {
  embed: vi.fn().mockImplementation(async ({ input }: { input: string | string[] }) => {
    const inputs = Array.isArray(input) ? input : [input];
    return {
      embeddings: inputs.map(textToVector)
    };
  })
};
```

### In-Memory Qdrant Mock
```typescript
// tests/fixtures/mocks/qdrant-mock.ts
// Simple in-memory mock for unit tests
import { vi } from 'vitest';

interface MockPoint {
  id: number;
  vector: { dense: number[] };
  payload: Record<string, unknown>;
}

export function createMockQdrantClient() {
  const collections = new Map<string, MockPoint[]>();

  return {
    getCollections: vi.fn().mockResolvedValue({
      collections: Array.from(collections.keys()).map(name => ({ name }))
    }),

    createCollection: vi.fn().mockImplementation(async (name: string) => {
      collections.set(name, []);
    }),

    getCollection: vi.fn().mockImplementation(async (name: string) => {
      const points = collections.get(name) || [];
      return { points_count: points.length, indexed_vectors_count: points.length };
    }),

    upsert: vi.fn().mockImplementation(async (name: string, { points }: { points: MockPoint[] }) => {
      const existing = collections.get(name) || [];
      collections.set(name, [...existing, ...points]);
    }),

    query: vi.fn().mockImplementation(async (name: string, { limit }: { limit: number }) => {
      const points = collections.get(name) || [];
      return { points: points.slice(0, limit).map(p => ({ ...p, score: 0.9 })) };
    }),

    delete: vi.fn().mockResolvedValue({}),

    // Test helper to reset state
    _reset: () => collections.clear(),
  };
}
```

### JSON-RPC Protocol Compliance Test
```typescript
// tests/integration/mcp/jsonrpc-protocol.test.ts
// Source: JSON-RPC 2.0 Specification + MCP Protocol
import { describe, it, expect } from 'vitest';

describe('JSON-RPC 2.0 Compliance', () => {
  // Helper to validate response structure
  const validateResponse = (response: unknown) => {
    expect(response).toHaveProperty('jsonrpc', '2.0');
    expect(response).toHaveProperty('id');
    // Must have result OR error, not both
    const hasResult = 'result' in (response as object);
    const hasError = 'error' in (response as object);
    expect(hasResult || hasError).toBe(true);
    expect(hasResult && hasError).toBe(false);
  };

  it('includes jsonrpc version 2.0 in response', async () => {
    const response = await sendRequest('tools/list', {});
    expect(response.jsonrpc).toBe('2.0');
  });

  it('echoes request id in response', async () => {
    const response = await sendRequest('tools/list', {}, { id: 42 });
    expect(response.id).toBe(42);
  });

  it('returns error object for invalid method', async () => {
    const response = await sendRequest('invalid/method', {});
    expect(response).toHaveProperty('error');
    expect(response.error).toHaveProperty('code');
    expect(response.error).toHaveProperty('message');
  });

  it('error code is integer', async () => {
    const response = await sendRequest('invalid/method', {});
    expect(Number.isInteger(response.error.code)).toBe(true);
  });
});
```

### TOON Output Verification
```typescript
// tests/e2e/toon-output.test.ts
import { describe, it, expect } from 'vitest';
import { decode } from '@toon-format/toon';

describe('TOON Output Format', () => {
  it('search results are valid TOON', async () => {
    const response = await callSearchTool({ query: 'test function', limit: 3 });
    const content = response.result.content[0].text;

    // Should be parseable TOON
    const parsed = decode(content);
    expect(parsed).toHaveProperty('results');
    expect(Array.isArray(parsed.results)).toBe(true);
  });

  it('TOON results have required fields', async () => {
    const response = await callSearchTool({ query: 'test', limit: 1 });
    const { results } = decode(response.result.content[0].text);

    for (const result of results) {
      expect(result).toHaveProperty('file');
      expect(result).toHaveProperty('lines');
      expect(result).toHaveProperty('relevance');
      expect(result).toHaveProperty('code');
      expect(typeof result.file).toBe('string');
      expect(typeof result.relevance).toBe('number');
    }
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| c8 coverage provider | @vitest/coverage-v8 | Vitest 1.0 | c8 deprecated, v8 is drop-in replacement |
| v8-to-istanbul remapping | AST-based remapping | Vitest 3.2.0 | V8 now equals Istanbul accuracy |
| Jest for TS testing | Vitest | 2023+ | Native ESM, faster, better TS support |
| Manual Docker setup | Testcontainers | Mature | Automatic lifecycle, health checks |

**Deprecated/outdated:**
- **c8 coverage provider:** Replaced by @vitest/coverage-v8, same API
- **ts-jest:** Vitest handles TypeScript natively, no transformer needed
- **jest.mock:** Use `vi.mock` with same patterns

## Open Questions

Things that couldn't be fully resolved:

1. **Ollama CI availability**
   - What we know: Unit tests mock Ollama. E2E needs real embeddings.
   - What's unclear: How to run Ollama in CI (Docker? Self-hosted runner?)
   - Recommendation: E2E tests require `OLLAMA_HOST` env var. Skip gracefully if not set in CI.

2. **MCP SDK test helpers**
   - What we know: SDK v2 plans include `/test/helper` with mock server/client
   - What's unclear: When v2 releases, current SDK version is 1.25.3
   - Recommendation: Build our own test helpers now; migrate to SDK helpers when available.

3. **TOON library test utilities**
   - What we know: `@toon-format/toon` has encode/decode
   - What's unclear: Are there validation utilities for schema conformance?
   - Recommendation: Use decode() and manual property checks for now.

## Sources

### Primary (HIGH confidence)
- [Vitest Coverage Guide](https://vitest.dev/guide/coverage.html) - Coverage provider options, V8 vs Istanbul
- [Vitest Coverage Config](https://vitest.dev/config/coverage) - Threshold configuration, glob patterns
- [Vitest Mocking Guide](https://vitest.dev/guide/mocking) - vi.mock, vi.spyOn patterns
- [Vitest globalSetup](https://vitest.dev/config/globalsetup) - provide/inject for container setup
- [Testcontainers Qdrant Module](https://node.testcontainers.org/modules/qdrant/) - Container lifecycle
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification) - Protocol compliance requirements

### Secondary (MEDIUM confidence)
- [MCPcat Unit Testing Guide](https://mcpcat.io/guides/writing-unit-tests-mcp-servers/) - MCP-specific testing patterns
- [Node.js child_process docs](https://nodejs.org/api/child_process.html) - spawn stdio options
- [Vitest Database Containers](https://github.com/ivandotv/vitest-database-containers) - Parallel test isolation patterns

### Tertiary (LOW confidence)
- MCP SDK v2 testing plans (GitHub issue, not released)
- Ollama mocking issue (feature request, no official solution)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Vitest 3.x well-documented, @testcontainers/qdrant published
- Architecture: HIGH - Patterns from official docs and established community practices
- Pitfalls: MEDIUM - Based on common issues documented in GitHub issues and guides
- E2E spawn pattern: MEDIUM - Standard Node.js approach, MCP-specific aspects less documented

**Research date:** 2026-01-23
**Valid until:** 2026-02-23 (30 days - testing infrastructure is stable)
