# Roadmap: RLM Integration for GSD

## Overview

Build a Recursive Language Model (RLM) system that makes existing /gsd commands dramatically smarter at understanding large codebases. The system uses AST-aware chunking, hybrid retrieval (dense + sparse), and verification-driven recursion — all invisible to users who simply experience better analysis and planning.

## Domain Expertise

None (custom system, patterns from research)

## Content Workflow

**Parallel to development:** After each milestone, write and publish an article documenting the journey.

- **Cadence:** One article per milestone (not per phase)
- **Persona:** Builder's log evolving into tutorials as system matures
- **Platforms:** Medium, LinkedIn, dev.to (cross-post)
- **Purpose:** Credibility building, community engagement, documenting a novel system

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (complete)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Core Infrastructure** — AST-aware indexing pipeline and Qdrant vector storage ✓
- [x] **Phase 2: RLM Engine Core** — REPL environment with query/recurse methods ✓
- [x] **Phase 3: Verification Loop** — Evidence tracking and confidence scoring ✓
- [x] **Phase 4: GSD Integration** — Transparent enhancement of existing commands ✓
- [x] **Phase 5: Optimization & Polish** — Performance tuning and caching ✓

## Phase Details

### Phase 1: Core Infrastructure
**Goal**: Build the foundation — AST-aware chunking and hybrid retrieval via Qdrant
**Depends on**: Nothing (first phase)
**Requirements**: IDX-01, IDX-02, IDX-03, IDX-04, VEC-01, VEC-02, VEC-03, VEC-04
**Research**: Likely (hybrid search configuration, RRF parameters)
**Research topics**: Qdrant sparse vector indexing, RRF fusion parameters, Tree-sitter WASM setup
**Plans**: 5 (complete)

### Phase 2: RLM Engine Core
**Goal**: Build the recursive reasoning engine with REPL environment
**Depends on**: Phase 1
**Requirements**: RLM-01, RLM-02, RLM-03, RLM-04, RLM-05
**Research**: Likely (REPL state management patterns)
**Research topics**: Persistent vs ephemeral state, sub-LM delegation patterns
**Plans**: 4 (02-01 to 02-04)

### Phase 3: Verification Loop
**Goal**: Add evidence validation and recursive refinement on failure
**Depends on**: Phase 2
**Requirements**: VER-01, VER-02, VER-03
**Research**: Likely (evidence extraction algorithms)
**Research topics**: Claim segmentation, confidence scoring algorithms
**Plans**: 3 (03-01 to 03-03)

### Phase 4: GSD Integration
**Goal**: Wire RLM into existing /gsd commands transparently
**Depends on**: Phase 3
**Requirements**: VER-04
**Research**: Completed (Claude Code hooks, MCP tools)
**Plans**: 2 (04-01 to 04-02)

### Phase 5: Optimization & Polish
**Goal**: Hit <500ms latency target, add caching, finalize quality
**Depends on**: Phase 4
**Requirements**: OPT-01, OPT-02, OPT-03, OPT-04, QUA-02, QUA-03
**Research**: Completed (embedding caching, Qdrant quantization, benchmarking)
**Plans**: 3 (05-01 to 05-03)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Infrastructure | 5/5 | ✓ Complete | 2026-01-21 |
| 2. RLM Engine Core | 4/4 | ✓ Complete | 2026-01-21 |
| 3. Verification Loop | 3/3 | ✓ Complete | 2026-01-21 |
| 4. GSD Integration | 2/2 | ✓ Complete | 2026-01-22 |
| 5. Optimization & Polish | 3/3 | ✓ Complete | 2026-01-22 |

---
*Roadmap created: 2026-01-21*
*Last updated: 2026-01-22 — Phase 5 complete, v1.0 MVP milestone complete*
