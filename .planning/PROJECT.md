# RLM Integration for Get-Shit-Done

## What This Is

A Recursive Language Model (RLM) system embedded inside GSD that enables large-context, recursive, evidence-based reasoning over codebases. The RLM is fully abstracted behind existing /gsd commands — users experience smarter analysis and planning without learning new paradigms. It uses semantic embeddings (Ollama + nomic-embed-text), hybrid retrieval (dense + sparse via Qdrant), and verification-driven recursion to handle repositories with 1M+ tokens reliably.

## Core Value

**Existing /gsd commands become dramatically smarter at understanding large codebases without users changing how they work.**

## Current State

**v1.0 MVP shipped 2026-01-22**

- 40 TypeScript files, 5,520 LOC under `src/rlm/`
- Dependencies: @qdrant/js-client-rest, ollama, tree-sitter (WASM), compromise, ts-morph, vitest, lru-cache, zod
- CLI available: `rlm index`, `rlm query`, `rlm status`
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

### Active

- [ ] Integration with existing /gsd commands (/gsd:map-codebase, /gsd:plan-phase, /gsd:execute-phase)
- [ ] 85% test coverage on new modules
- [ ] MCP server for Claude Desktop integration
- [ ] Multi-repo support with cross-repository search

### Out of Scope

- Training or fine-tuning foundation models — using existing embedding models only
- Distributed multi-node RLM execution — future phase
- UI/Frontend changes — CLI-only integration
- Cloud-managed vector DB migrations — self-hosted/embedded only

## Context

**Shipped Codebase (v1.0):**
- GSD has RLM engine under `src/rlm/` with 40 TypeScript files
- Module structure: types, chunking, storage, embedding, retrieval, indexing, engine, evidence, verification, integration, cache, cli, benchmarks
- Commands are still markdown-based prompts, RLM provides context enhancement
- CLI tool (`rlm`) for standalone usage

**Dependencies Added:**
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
- **Test coverage**: 85% minimum on new RLM modules
- **Recursion safety**: Max depth 5, token budget caps to prevent runaway
- **Graceful degradation**: Never throw, return empty results when services unavailable

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Ollama + nomic-embed-text | Free, local, offline-capable, good code understanding | Good |
| Qdrant embedded default | Zero setup for users, just works | Good |
| Enhance existing commands | No new paradigms to learn, transparent improvement | Pending (v1.1) |
| Add npm dependencies | Required for vector store, embeddings, AST parsing | Good |
| Verification-driven recursion | More principled than heuristic depth limits | Good |
| ES2022 target with NodeNext | Modern Node.js compatibility | Good |
| WASM Tree-sitter | Cross-platform, no native compilation needed | Good |
| RRF fusion for hybrid search | Better ranking than simple concatenation | Good |
| FIRE-style verification | Confidence-based recursion with infinite loop prevention | Good |
| lru-cache for embeddings | Reduces redundant Ollama calls by 50%+ on repeated queries | Good |
| Graceful degradation over FAISS | Qdrant with quantization matches FAISS latency | Good |
| zod@3.x | v4 not compatible with zod-to-json-schema | Good |

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

---
*Last updated: 2026-01-22 after v1.0 milestone*
