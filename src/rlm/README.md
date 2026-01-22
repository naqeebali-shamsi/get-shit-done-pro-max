# RLM v1.0 — User Guide

## What It Is

RLM (Recursive Language Model) is a **semantic code search and understanding system** that makes it dramatically easier to find and understand code in large repositories.

**Core capability:** Ask questions in natural language, get relevant code chunks with context.

```bash
rlm query "how does authentication work"
```

Returns formatted code snippets ranked by relevance, with file paths and confidence scores.

---

## Prerequisites

### Required

| Dependency | Purpose | Install |
|------------|---------|---------|
| **Node.js 18+** | Runtime | [nodejs.org](https://nodejs.org) |
| **Ollama** | Generates embeddings locally | [ollama.ai](https://ollama.ai) |
| **Qdrant** | Stores vectors | Docker or [qdrant.tech](https://qdrant.tech) |

### Setup Commands

```bash
# 1. Install Ollama and pull the embedding model
ollama pull nomic-embed-text
ollama serve  # Start if not running as service

# 2. Start Qdrant (choose one)
docker run -p 6333:6333 qdrant/qdrant       # Docker
# OR download binary from qdrant.tech
```

---

## Installation

```bash
# Install GSD (includes RLM)
npm install -g get-shit-done-cc

# Build the RLM module
cd ~/.claude/get-shit-done  # or wherever GSD is installed
npm run build:rlm
```

---

## CLI Usage

### Check Status

```bash
rlm status
```

Output:
```
Qdrant: connected
Collection: exists (rlm_chunks)
Chunks indexed: 1,247
```

### Index Your Codebase

```bash
# Index current directory
rlm index .

# Index specific path
rlm index ./src
```

Output:
```
Indexing /path/to/project/src...
Indexed 847 chunks in 12543ms
Skipped 23 unchanged files
```

**What gets indexed:**
- TypeScript/JavaScript functions, classes, methods
- Python, Go, Rust, Ruby code (AST-aware chunking)
- Markdown files (chunked by headers)

### Search Your Code

```bash
rlm query "how does the payment flow work"
rlm query "where is user authentication handled"
rlm query "database connection setup"
```

Output:
```markdown
## Relevant Code (5 chunks)

### 1. src/services/payment.ts (0.89)

export async function processPayment(order: Order): Promise<PaymentResult> {
  // Validate order
  if (!order.items.length) throw new Error('Empty order');

  // Create Stripe payment intent
  const intent = await stripe.paymentIntents.create({
    amount: calculateTotal(order),
    currency: 'usd',
    ...
  });
}

### 2. src/api/checkout.ts (0.82)
...
```

---

## Programmatic API

For integrating RLM into your own tools:

```typescript
import {
  quickRetrieve,
  formatChunksAsContext,
  indexDirectory,
  createQdrantClient
} from 'get-shit-done-cc/dist/rlm/index.js';

// Fast semantic search (< 500ms)
const chunks = await quickRetrieve("authentication middleware", {
  limit: 10,
  timeout: 500,
  scoreThreshold: 0.3,
});

// Format for display
const context = formatChunksAsContext(chunks, "Auth-related code", {
  maxChunks: 5,
  includeConfidence: true,
});

console.log(context);
```

### Key Functions

| Function | Purpose | Typical Latency |
|----------|---------|-----------------|
| `quickRetrieve(query)` | Fast semantic search | ~100-200ms |
| `formatChunksAsContext(chunks)` | Markdown formatting | <1ms |
| `indexDirectory(client, collection, path)` | Index codebase | Varies by size |
| `hybridSearch(client, collection, query)` | Full hybrid search | ~50-100ms |

---

## Configuration

### Environment Variables

```bash
# Qdrant server URL (default: http://localhost:6333)
export QDRANT_URL=http://localhost:6333

# Collection name (default: codebase)
export RLM_COLLECTION=my_project

# Ollama server URL (default: http://localhost:11434)
export OLLAMA_URL=http://localhost:11434

# Embedding model (default: nomic-embed-text)
export EMBEDDING_MODEL=nomic-embed-text
```

---

## Graceful Degradation

RLM never crashes your workflow. If services are unavailable:

| Scenario | Behavior |
|----------|----------|
| Qdrant down | Returns empty results, logs warning |
| Ollama down | Returns empty results, logs warning |
| Search timeout | Returns empty results after 500ms |

```typescript
// Always safe to call - never throws
const chunks = await quickRetrieve("query");
// chunks = [] if anything fails
```

---

## Performance

| Operation | Target | Actual |
|-----------|--------|--------|
| Semantic search | <500ms | ~133ms |
| Cached embedding | <10ms | ~1ms |
| Cold embedding | 200-500ms | ~300ms |
| Index 1000 files | ~30s | Varies |

### Embedding Cache

Repeated queries use cached embeddings (LRU cache, 10k entries, 500MB limit):

```typescript
import { getCacheStats, getCacheHitRate } from 'get-shit-done-cc/dist/rlm/index.js';

console.log(getCacheStats());  // { hits: 47, misses: 12, size: 59 }
console.log(getCacheHitRate()); // 0.797 (79.7% cache hit rate)
```

---

## Current Limitations (v1.0)

| Limitation | Status |
|------------|--------|
| Requires Ollama + Qdrant running | Required for v1.0 |
| No automatic GSD command integration | Coming in v1.1 |
| Test coverage below 85% | Coming in v1.1 |
| Single repository only | Multi-repo in future |

---

## Troubleshooting

### "Qdrant unavailable"

```bash
# Check if Qdrant is running
curl http://localhost:6333/collections

# Start Qdrant
docker run -p 6333:6333 qdrant/qdrant
```

### "No chunks indexed"

```bash
# Index your codebase first
rlm index ./src
rlm status  # Should show chunks > 0
```

### Slow queries

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Ensure embedding model is loaded
ollama pull nomic-embed-text
```

---

## What's Next (v1.1+)

- Automatic integration with `/gsd:map-codebase`, `/gsd:plan-phase`
- MCP server for Claude Desktop
- Multi-repository support
- 85% test coverage

---

*v1.0 shipped 2026-01-22*
