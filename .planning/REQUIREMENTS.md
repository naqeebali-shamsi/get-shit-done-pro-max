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

## v1.1 Requirements

Requirements for MCP Server milestone. Each maps to roadmap phases.

### MCP Server

- [x] **MCP-01**: MCP server with stdio transport (JSON-RPC over stdin/stdout)
- [x] **MCP-02**: search_code tool wrapping hybridSearch with query and limit params
- [x] **MCP-03**: index_code tool wrapping indexDirectory with path param
- [x] **MCP-04**: get_status tool wrapping getCollectionInfo
- [x] **MCP-05**: JSON schema definitions for all tool inputs/outputs
- [x] **MCP-06**: Structured error responses with actionable guidance
- [x] **MCP-07**: Stderr-only logging (stdout reserved for JSON-RPC)
- [x] **MCP-08**: TOON formatting for search results (token-optimized responses)

### Integration

- [ ] **INT-01**: Claude Desktop configuration template (claude_desktop_config.json)
- [x] **INT-02**: npm bin entry for rlm-mcp command
- [x] **INT-03**: Environment variable support (QDRANT_URL, OLLAMA_HOST, RLM_COLLECTION)
- [x] **INT-04**: @toon-format/toon dependency for token-optimized responses

### Testing

- [ ] **TST-01**: 85% test coverage on RLM modules (carries over from QUA-01)
- [ ] **TST-02**: Unit tests for MCP tool handlers
- [ ] **TST-03**: Integration tests for JSON-RPC protocol compliance
- [ ] **TST-04**: End-to-end test with spawned MCP server

### Documentation

- [ ] **DOC-01**: README with Claude Desktop setup instructions
- [ ] **DOC-02**: Tool usage examples for each MCP tool
- [ ] **DOC-03**: Troubleshooting guide for common issues

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
| MCP Resources | Tools sufficient for v1.1, resources add complexity |
| Progress notifications | Defer based on user feedback |
| Async indexing | Simple sync approach first |
| HTTP transport | Claude Desktop uses stdio only |

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
| QUA-01 | Phase 7 | Pending |
| QUA-02 | Phase 5 | Complete |
| QUA-03 | Phase 5 | Complete |
| MCP-01 | Phase 6 | Complete |
| MCP-02 | Phase 6 | Complete |
| MCP-03 | Phase 6 | Complete |
| MCP-04 | Phase 6 | Complete |
| MCP-05 | Phase 6 | Complete |
| MCP-06 | Phase 6 | Complete |
| MCP-07 | Phase 6 | Complete |
| MCP-08 | Phase 6 | Complete |
| INT-01 | Phase 8 | Pending |
| INT-02 | Phase 6 | Complete |
| INT-03 | Phase 6 | Complete |
| INT-04 | Phase 6 | Complete |
| TST-01 | Phase 7 | Pending |
| TST-02 | Phase 7 | Pending |
| TST-03 | Phase 7 | Pending |
| TST-04 | Phase 7 | Pending |
| DOC-01 | Phase 8 | Pending |
| DOC-02 | Phase 8 | Pending |
| DOC-03 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 24 total (23 complete, 1 pending in v1.1)
- v1.1 requirements: 19 total
- Total requirements tracked: 43
- Mapped to phases: 43
- Unmapped: 0 ✓

---
*Requirements defined: 2026-01-21*
*Last updated: 2026-01-23 — Phase 6 requirements complete (MCP-01 through MCP-08, INT-02, INT-03, INT-04)*
