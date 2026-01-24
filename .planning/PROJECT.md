# RLM Integration for Get-Shit-Done

## What This Is

A Recursive Language Model (RLM) system embedded inside GSD that enables large-context, recursive, evidence-based reasoning over codebases. The RLM is fully abstracted behind existing /gsd commands — users experience smarter analysis and planning without learning new paradigms. It uses semantic embeddings (Ollama + nomic-embed-text), hybrid retrieval (dense + sparse via Qdrant), and verification-driven recursion to handle repositories with 1M+ tokens reliably.

**Now includes MCP server for Claude Desktop integration** — users can search code, index directories, and check status directly from Claude Desktop with token-optimized TOON responses.

## Core Value

**Existing /gsd commands become dramatically smarter at understanding large codebases without users changing how they work.**

## Current State

**v1.1 MCP Server shipped 2026-01-24**

- 45+ TypeScript files under `src/rlm/`
- MCP server: 402 LOC with 3 tools (search_code, index_code, get_status)
- Test suite: 82 tests with 100% statement coverage
- Dependencies: @modelcontextprotocol/sdk, @toon-format/toon, @qdrant/js-client-rest, ollama, tree-sitter (WASM), vitest
- CLI available: `rlm index`, `rlm query`, `rlm status`, `rlm-mcp`
- Latency: ~133ms retrieval (target <500ms)

## Requirements

### Validated

- [x] AST-aware chunking pipeline for code files (functions, classes, modules) — v1.0
- [x] Markdown chunking by headers and semantic paragraphs — v1.0
- [x] Chunk metadata: path, language, symbol_type, file_hash — v1.0
- [x] 10-20% overlap between chunks — v1.0
- [x] Qdrant embedded mode (default, data in `.rlm/`) — v1.0
- [x] Qdrant server mode (optional, for scale) — v1.0
- [x] Hybrid retrieval: dense vectors + BM25-style sparse — v1.0
- [x] Basic retrieval API with metadata filters — v1.0
- [x] RLMEngine with query() and recurse() methods — v1.0
- [x] Dispatcher: embed state -> retrieve -> query -> verify -> recurse if needed — v1.0
- [x] Evidence tracking (each claim references source chunks) — v1.0
- [x] Confidence scoring on results — v1.0
- [x] Recursion limits (max depth 5, token budget 2x baseline) — v1.0
- [x] Verifier module with checks: typecheck, test execution, impact scan — v1.0
- [x] Evidence coverage check (claims must reference chunks) — v1.0
- [x] Recursive refinement on verification failure — v1.0
- [x] Embedding cache layer — v1.0
- [x] Performance benchmarking suite — v1.0
- [x] Latency target: <500ms retrieval — v1.0 (achieved ~133ms)
- [x] Retrieval precision trackable via benchmarks — v1.0
- [x] Documentation for contributors — v1.0
- [x] MCP server with stdio transport (JSON-RPC over stdin/stdout) — v1.1
- [x] search_code tool wrapping hybridSearch — v1.1
- [x] index_code tool wrapping indexDirectory — v1.1
- [x] get_status tool wrapping getCollectionInfo — v1.1
- [x] JSON schema definitions for all tool inputs/outputs — v1.1
- [x] Structured error responses with actionable guidance — v1.1
- [x] Stderr-only logging (stdout reserved for JSON-RPC) — v1.1
- [x] TOON formatting for search results (30-60% token savings) — v1.1
- [x] Claude Desktop configuration template — v1.1
- [x] npm bin entry for rlm-mcp command — v1.1
- [x] Environment variable support (QDRANT_URL, OLLAMA_HOST, RLM_COLLECTION) — v1.1
- [x] @toon-format/toon dependency for token-optimized responses — v1.1
- [x] 85% test coverage on RLM modules — v1.1 (achieved 100%)
- [x] Unit tests for MCP tool handlers — v1.1
- [x] Integration tests for JSON-RPC protocol compliance — v1.1
- [x] End-to-end test with spawned MCP server — v1.1
- [x] README with Claude Desktop setup instructions — v1.1
- [x] Tool usage examples for each MCP tool — v1.1
- [x] Troubleshooting guide for common issues — v1.1

### Active

- [ ] Integration with existing /gsd commands (/gsd:map-codebase, /gsd:plan-phase, /gsd:execute-phase) (v1.2+)
- [ ] Multi-repo support with cross-repository search (v2.0+)

### Out of Scope

- Training or fine-tuning foundation models — using existing embedding models only
- Distributed multi-node RLM execution — future phase
- UI/Frontend changes — CLI-only integration
- Cloud-managed vector DB migrations — self-hosted/embedded only
- MCP Resources — tools sufficient for v1.1, resources add complexity
- Progress notifications — defer based on user feedback
- Async indexing — simple sync approach first
- HTTP transport — Claude Desktop uses stdio only

## Context

**Shipped Codebase (v1.1):**
- GSD has RLM engine under `src/rlm/` with 45+ TypeScript files
- Module structure: types, chunking, storage, embedding, retrieval, indexing, engine, evidence, verification, integration, cache, cli, benchmarks, mcp
- MCP server exposes search_code, index_code, get_status tools
- CLI tool (`rlm`) for standalone usage, `rlm-mcp` for Claude Desktop
- Test coverage: 100% statements, 95% branches

**Dependencies:**
- @modelcontextprotocol/sdk (MCP server)
- @toon-format/toon (token-optimized responses)
- @qdrant/js-client-rest (vector storage)
- ollama (embedding generation)
- web-tree-sitter (AST parsing)
- compromise (NLP sentence segmentation)
- ts-morph (TypeScript type checking)
- vitest (testing and benchmarking)
- lru-cache (embedding cache)
- zod (schema validation)

**Infrastructure:**
- Ollama + nomic-embed-text (local, free, offline)
- Qdrant embedded or server mode
- Data stored in `.rlm/` directory (gitignored)

## Constraints

- **Zero-friction UX**: RLM must be invisible to users — existing /gsd commands just work better
- **Local-first**: Must work offline with Ollama + Qdrant embedded
- **Performance**: <500ms retrieval latency (achieved ~133ms)
- **Test coverage**: 85% minimum on new RLM modules (achieved 100%)
- **Recursion safety**: Max depth 5, token budget caps to prevent runaway
- **Graceful degradation**: Never throw, return empty results when services unavailable

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Ollama + nomic-embed-text | Free, local, offline-capable, good code understanding | Good |
| Qdrant embedded default | Zero setup for users, just works | Good |
| Enhance existing commands | No new paradigms to learn, transparent improvement | Pending (v1.2) |
| Add npm dependencies | Required for vector store, embeddings, AST parsing | Good |
| Verification-driven recursion | More principled than heuristic depth limits | Good |
| ES2022 target with NodeNext | Modern Node.js compatibility | Good |
| WASM Tree-sitter | Cross-platform, no native compilation needed | Good |
| RRF fusion for hybrid search | Better ranking than simple concatenation | Good |
| FIRE-style verification | Confidence-based recursion with infinite loop prevention | Good |
| lru-cache for embeddings | Reduces redundant Ollama calls by 50%+ on repeated queries | Good |
| Graceful degradation over FAISS | Qdrant with quantization matches FAISS latency | Good |
| zod@3.x | v4 not compatible with zod-to-json-schema | Good |
| @modelcontextprotocol/sdk@1.25.3 | Latest stable with full tool support | Good |
| stderr-only logging | MCP protocol compliance (stdout is JSON-RPC only) | Good |
| TOON encoding for search | 30-60% token savings for Claude consumption | Good |
| Testcontainers for integration | CI-portable container lifecycle | Good |
| All MCP docs in README | Single source of truth, no doc fragmentation | Good |

## Content Workflow

**Parallel to development:** Document the journey of building this novel system.

| Aspect | Decision |
|--------|----------|
| Cadence | One article per milestone (not per phase) |
| Persona | Builder's log evolving into tutorials as system matures |
| Platforms | Medium, LinkedIn, dev.to (cross-post) |
| Purpose | Credibility building, community engagement, documenting novel system |

The content series tells the story of building an RLM system from scratch, positioning the writer as learner + educator. When strung together, these posts demonstrate expertise and make the work visible to the dev community.

**v1.0 Article:** Ready to write about building a local-first RLM system with AST-aware chunking and verification-driven recursion.
**v1.1 Article:** Ready to write about adding MCP server integration for Claude Desktop.

---
*Last updated: 2026-01-24 after v1.1 milestone*
