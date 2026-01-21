# Requirements: RLM Integration for GSD

**Defined:** 2026-01-21
**Core Value:** Existing /gsd commands become dramatically smarter at understanding large codebases without users changing how they work.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Indexing Pipeline

- [x] **IDX-01**: AST-aware chunking pipeline for code files (functions, classes, modules)
- [x] **IDX-02**: Markdown chunking by headers and semantic paragraphs
- [x] **IDX-03**: Chunk metadata includes path, language, symbol_type, file_hash
- [x] **IDX-04**: 10-20% overlap between chunks for context continuity

### Vector Storage

- [x] **VEC-01**: Qdrant embedded mode (default, data in `.rlm/`)
- [x] **VEC-02**: Qdrant server mode (optional, for scale)
- [x] **VEC-03**: Hybrid retrieval: dense vectors + BM25-style sparse
- [x] **VEC-04**: Basic retrieval API with metadata filters

### RLM Engine

- [x] **RLM-01**: RLMEngine with query() and recurse() methods
- [x] **RLM-02**: Dispatcher: embed state -> retrieve -> query -> verify -> recurse if needed
- [x] **RLM-03**: Evidence tracking (each claim references source chunks)
- [x] **RLM-04**: Confidence scoring on results
- [x] **RLM-05**: Recursion limits (max depth 5, token budget 2x baseline)

### Verification

- [x] **VER-01**: Verifier module with checks: typecheck, test execution, impact scan
- [x] **VER-02**: Evidence coverage check (claims must reference chunks)
- [x] **VER-03**: Recursive refinement on verification failure
- [x] **VER-04**: Integration with existing /gsd commands

### Optimization

- [x] **OPT-01**: Embedding cache layer
- [x] **OPT-02**: Performance benchmarking suite
- [x] **OPT-03**: Graceful degradation (FAISS skipped — Qdrant quantization sufficient)
- [x] **OPT-04**: Latency target: <500ms retrieval

### Quality

- [ ] **QUA-01**: 85% test coverage on new modules
- [x] **QUA-02**: Retrieval precision >0.8
- [x] **QUA-03**: Documentation for contributors

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Scale

- **SCL-01**: Distributed multi-node RLM execution
- **SCL-02**: Multi-codebase support (federated search)
- **SCL-03**: Cloud-managed vector DB migrations

### UX

- **UX-01**: Visual execution tree (web UI for trajectory)
- **UX-02**: New user-facing /gsd commands

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Training/fine-tuning foundation models | Using existing embedding models only |
| UI/Frontend changes | CLI-only integration |
| Cloud-managed vector DB | Self-hosted/embedded only for v1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| IDX-01 | Phase 1 | Complete |
| IDX-02 | Phase 1 | Complete |
| IDX-03 | Phase 1 | Complete |
| IDX-04 | Phase 1 | Complete |
| VEC-01 | Phase 1 | Complete |
| VEC-02 | Phase 1 | Complete |
| VEC-03 | Phase 1 | Complete |
| VEC-04 | Phase 1 | Complete |
| RLM-01 | Phase 2 | Complete |
| RLM-02 | Phase 2 | Complete |
| RLM-03 | Phase 2 | Complete |
| RLM-04 | Phase 2 | Complete |
| RLM-05 | Phase 2 | Complete |
| VER-01 | Phase 3 | Complete |
| VER-02 | Phase 3 | Complete |
| VER-03 | Phase 3 | Complete |
| VER-04 | Phase 4 | Complete |
| OPT-01 | Phase 5 | Complete |
| OPT-02 | Phase 5 | Complete |
| OPT-03 | Phase 5 | Complete |
| OPT-04 | Phase 5 | Complete |
| QUA-01 | All | Pending |
| QUA-02 | Phase 5 | Complete |
| QUA-03 | Phase 5 | Complete |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-01-21*
*Last updated: 2026-01-22 — Phase 5 requirements complete, v1.0 MVP complete*
