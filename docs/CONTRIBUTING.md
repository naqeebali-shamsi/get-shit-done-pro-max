# Contributing to RLM (Recursive Language Model)

This guide provides everything you need to contribute to the RLM system embedded in Get-Shit-Done.

## Project Overview

### What is RLM?

RLM (Recursive Language Model) is a retrieval-augmented reasoning system that enables intelligent codebase understanding for GSD commands. It uses:

- **Semantic embeddings** (Ollama + nomic-embed-text) for code understanding
- **Hybrid retrieval** (dense + sparse vectors via Qdrant) for accurate search
- **Verification-driven recursion** for reliable, evidence-based answers

### How it Integrates with GSD

RLM is fully abstracted behind existing `/gsd` commands. Users don't interact with RLM directly - they experience smarter analysis and planning through familiar commands like `/gsd:map-codebase`, `/gsd:plan-phase`, and `/gsd:execute-phase`.

The core value: **Existing /gsd commands become dramatically smarter at understanding large codebases without users changing how they work.**

## Architecture

### Module Overview

```
src/rlm/
├── types.ts                 # Core type definitions (Chunk, SearchResult, etc.)
├── index.ts                 # Main entry point, re-exports all modules
│
├── chunking/                # AST-aware code chunking
│   ├── code-chunker.ts      # Function/class/module extraction
│   ├── markdown-chunker.ts  # Header-based markdown splitting
│   └── index.ts
│
├── storage/                 # Qdrant vector storage
│   ├── qdrant-client.ts     # Collection setup, upsert, quantization
│   └── index.ts
│
├── embedding/               # Ollama embeddings
│   ├── embedder.ts          # Text embedding with caching
│   ├── sparse.ts            # BM25-style sparse vectors
│   └── index.ts
│
├── cache/                   # Performance caching
│   ├── embedding-cache.ts   # LRU cache with content-hash keys
│   └── index.ts
│
├── retrieval/               # Hybrid search
│   ├── hybrid-search.ts     # Dense + sparse RRF fusion
│   └── index.ts
│
├── indexing/                # Codebase indexing
│   ├── indexer.ts           # Directory/file indexing
│   └── index.ts
│
├── engine/                  # RLM reasoning engine
│   ├── types.ts             # Engine-specific types
│   ├── state.ts             # REPL-style state management
│   ├── rlm-engine.ts        # Query and recurse methods
│   ├── dispatcher.ts        # Pipeline orchestration
│   └── index.ts
│
├── evidence/                # Evidence tracking
│   ├── tracker.ts           # Claim-to-chunk linking
│   ├── confidence.ts        # Score-based confidence
│   └── index.ts
│
├── verification/            # Answer verification
│   ├── types.ts             # Verification result types
│   ├── verifier.ts          # Main verifier class
│   ├── claims/              # Claim extraction and coverage
│   └── checks/              # Typecheck, test, impact scans
│
├── integration/             # GSD integration
│   ├── quick-retrieve.ts    # Fast semantic search
│   ├── context-formatter.ts # Readable context output
│   └── index.ts
│
├── cli/                     # Standalone CLI
│   ├── rlm-cli.ts           # index, query, status commands
│   └── index.ts
│
└── benchmarks/              # Performance testing
    └── retrieval.bench.ts   # Vitest benchmarks
```

### Data Flow

1. **Indexing**: Code files are chunked (AST-aware) and embedded
2. **Storage**: Embeddings stored in Qdrant with metadata
3. **Retrieval**: Hybrid search (dense + BM25) returns relevant chunks
4. **Reasoning**: RLMEngine processes chunks with tool-based inspection
5. **Verification**: Claims validated against evidence, recursion if needed
6. **Integration**: Results formatted for GSD command consumption

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Ollama + nomic-embed-text | Free, local, offline-capable, good code understanding |
| Qdrant embedded default | Zero setup for users, just works |
| RRF fusion for hybrid search | Combines semantic (dense) and keyword (sparse) matching |
| REPL-style state | Context stored externally, LLM inspects via tools |
| FIRE-style verification | Confidence-based recursion, not arbitrary depth limits |
| Zod for validation | Runtime type safety with TypeScript integration |

## Development Setup

### Prerequisites

- **Node.js 18+**: Required for ES2022 features
- **Ollama**: For embedding generation (optional for basic development)
- **Qdrant**: For vector storage (optional, graceful degradation when unavailable)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd get-shit-done-pro-max

# Install dependencies
npm install

# Build the project
npm run build
```

### Running Ollama (for embedding tests)

```bash
# Install Ollama (https://ollama.ai)
# Pull the embedding model
ollama pull nomic-embed-text

# Start Ollama server (if not running as service)
ollama serve
```

### Running Qdrant (for vector search tests)

```bash
# Using Docker
docker run -p 6333:6333 qdrant/qdrant

# Or using Qdrant embedded (no separate process needed)
# The RLM system handles this automatically
```

### Environment Variables

```bash
# Optional - customize defaults
QDRANT_URL=http://localhost:6333      # Qdrant server URL
RLM_COLLECTION=codebase               # Default collection name
OLLAMA_URL=http://localhost:11434     # Ollama server URL
EMBEDDING_MODEL=nomic-embed-text      # Embedding model name
```

## Code Style

### TypeScript Strict Mode

All code must pass TypeScript strict mode checks:

```bash
npm run build  # Includes type checking
# Or check types only:
npx tsc --noEmit
```

### Zod for Runtime Validation

Use Zod schemas for external data and API boundaries:

```typescript
import { z } from 'zod';

const ChunkSchema = z.object({
  id: z.string(),
  text: z.string(),
  metadata: ChunkMetadataSchema,
});

type Chunk = z.infer<typeof ChunkSchema>;
```

### Programmatic APIs Preferred

Avoid shell parsing. Use programmatic APIs instead:

```typescript
// Good: Programmatic API
import { createProject } from 'ts-morph';
const project = createProject();
const diagnostics = project.getPreEmitDiagnostics();

// Bad: Shell parsing
const output = execSync('tsc --noEmit 2>&1');
const errors = parseOutput(output);
```

### Import Conventions

- Use `.js` extensions in imports (ESM requirement)
- Group imports: external, internal, types

```typescript
// External
import { QdrantClient } from '@qdrant/js-client-rest';

// Internal
import { hybridSearch } from '../retrieval/index.js';
import { embedText } from '../embedding/index.js';

// Types
import type { Chunk, SearchResult } from '../types.js';
```

## Testing

### Unit Tests with Vitest

Run tests:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- src/rlm/chunking/code-chunker.test.ts

# Run with coverage
npm test -- --coverage
```

Write tests following this pattern:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { chunkCode } from './code-chunker.js';

describe('chunkCode', () => {
  it('should split code into functions', () => {
    const code = `function hello() { return 'world'; }`;
    const chunks = chunkCode(code, 'example.ts');

    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.symbol_type).toBe('function');
  });
});
```

### Benchmarks

Run performance benchmarks:

```bash
# Interactive benchmark execution
npm run bench

# JSON output for CI
npm run bench:ci
```

Benchmark results are saved to `.planning/benchmarks/results.json`.

### Adding New Tests

1. Create a `.test.ts` file next to the source file
2. Use `describe` for grouping, `it` for individual tests
3. Mock external dependencies (Ollama, Qdrant) for unit tests
4. Keep tests focused and fast

## Pull Request Guidelines

### Branch Naming

Use descriptive branch names with prefixes:

```
feat/embedding-cache        # New feature
fix/hybrid-search-timeout   # Bug fix
docs/contributing-guide     # Documentation
refactor/engine-state       # Code refactoring
test/verification-coverage  # Test improvements
```

### Commit Message Format

Follow conventional commits:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:

```
feat(cache): add LRU embedding cache with TTL support

- Content-hash keys for efficient lookup
- Configurable max entries and memory limits
- Cache stats tracking for monitoring

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

### PR Description Template

Include in your PR:

```markdown
## Summary

Brief description of what this PR does.

## Changes

- List of specific changes
- Include file paths for significant modifications

## Testing

- How was this tested?
- Any new tests added?

## Related Issues

Closes #123 (if applicable)
```

### Before Submitting

1. **Build passes**: `npm run build`
2. **Tests pass**: `npm test`
3. **Types check**: `npx tsc --noEmit`
4. **No lint errors**: Code follows style guidelines
5. **Documentation updated**: If adding new features

## Common Tasks

### Adding a New Module

1. Create directory under `src/rlm/`
2. Add `index.ts` with exports
3. Update `src/rlm/index.ts` to re-export
4. Add tests in `.test.ts` files
5. Update this documentation if significant

### Modifying Existing Behavior

1. Write failing test first (TDD)
2. Make minimal changes to pass test
3. Ensure backward compatibility
4. Update any affected documentation

### Performance Optimization

1. Add benchmark in `src/rlm/benchmarks/`
2. Measure baseline before changes
3. Implement optimization
4. Verify improvement with benchmarks
5. Document baseline numbers in code comments

## Getting Help

- **Architecture questions**: Check `.planning/PROJECT.md`
- **Research decisions**: Check `.planning/phases/*/RESEARCH.md`
- **Implementation details**: Read phase summaries in `.planning/phases/*/SUMMARY.md`

---

*Last updated: 2026-01-22*
*Phase: 05-optimization-polish (QUA-03)*
