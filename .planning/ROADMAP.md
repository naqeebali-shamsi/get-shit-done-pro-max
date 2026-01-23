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

- ✅ **v1.0 MVP** (Phases 1-5) — SHIPPED 2026-01-22
- 🚧 **v1.1 MCP Server** (Phases 6-8) — In Progress

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

<details>
<summary>✅ v1.0 MVP (Phases 1-5) — SHIPPED 2026-01-22</summary>

- [x] **Phase 1: Core Infrastructure** — AST-aware indexing pipeline and Qdrant vector storage
- [x] **Phase 2: RLM Engine Core** — REPL environment with query/recurse methods
- [x] **Phase 3: Verification Loop** — Evidence tracking and confidence scoring
- [x] **Phase 4: GSD Integration** — Transparent enhancement of existing commands
- [x] **Phase 5: Optimization & Polish** — Performance tuning and caching

</details>

### 🚧 v1.1 MCP Server (In Progress)

**Milestone Goal:** Expose RLM capabilities via MCP protocol for Claude Desktop integration with production-quality test coverage.

- [x] **Phase 6: MCP Server Foundation** — Protocol implementation with TOON-formatted tools
- [x] **Phase 7: Test Coverage** — 85% coverage with unit, integration, and E2E tests
- [ ] **Phase 8: Documentation & Integration** — Setup guides and Claude Desktop configuration

## Phase Details

### Phase 6: MCP Server Foundation
**Goal**: Claude Desktop can discover and call RLM tools via MCP protocol with token-optimized responses
**Depends on**: Phase 5 (v1.0 complete)
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, MCP-06, MCP-07, MCP-08, INT-02, INT-03, INT-04
**Success Criteria** (what must be TRUE):
  1. MCP server starts via `rlm-mcp` command and communicates over stdio using JSON-RPC
  2. Claude Desktop can call search_code tool and receive TOON-formatted results
  3. Claude Desktop can call index_code tool and receive confirmation of indexed files
  4. Claude Desktop can call get_status tool and receive collection statistics
  5. Server logs errors to stderr without polluting stdout JSON-RPC stream
**Plans**: 2 plans

Plans:
- [x] 06-01-PLAN.md — MCP server core with stdio transport and three tools (search_code, index_code, get_status)
- [x] 06-02-PLAN.md — TOON formatting for search results and end-to-end verification

### Phase 7: Test Coverage
**Goal**: RLM codebase has 85% test coverage with comprehensive test suite
**Depends on**: Phase 6
**Requirements**: TST-01, TST-02, TST-03, TST-04
**Success Criteria** (what must be TRUE):
  1. Overall test coverage reaches 85% on src/rlm/ modules
  2. All MCP tool handlers have unit tests verifying input validation and error handling
  3. Integration tests verify JSON-RPC protocol compliance (request/response format)
  4. End-to-end test spawns MCP server and successfully executes all three tools
**Plans**: 4 plans

Plans:
- [x] 07-01-PLAN.md — Test infrastructure: Vitest coverage config, deterministic mocks, test fixtures
- [x] 07-02-PLAN.md — Unit tests for MCP tool handlers (search, index, status) and TOON formatter
- [x] 07-03-PLAN.md — Integration tests for JSON-RPC protocol compliance with testcontainers
- [x] 07-04-PLAN.md — E2E tests for spawned MCP server and coverage verification

### Phase 8: Documentation & Integration
**Goal**: Users can configure Claude Desktop to use RLM MCP server without external help
**Depends on**: Phase 7
**Requirements**: DOC-01, DOC-02, DOC-03, INT-01
**Success Criteria** (what must be TRUE):
  1. README includes step-by-step Claude Desktop setup instructions with configuration template
  2. Each MCP tool has documented usage examples showing input/output
  3. Troubleshooting guide covers common issues: Qdrant unavailable, Ollama missing, collection not found
  4. Users can copy claude_desktop_config.json template and start using RLM tools immediately
**Plans**: 1 plan

Plans:
- [ ] 08-01-PLAN.md — MCP documentation: Claude Desktop setup, tool reference, troubleshooting guide

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Core Infrastructure | v1.0 | 5/5 | Complete | 2026-01-21 |
| 2. RLM Engine Core | v1.0 | 4/4 | Complete | 2026-01-21 |
| 3. Verification Loop | v1.0 | 3/3 | Complete | 2026-01-21 |
| 4. GSD Integration | v1.0 | 2/2 | Complete | 2026-01-22 |
| 5. Optimization & Polish | v1.0 | 3/3 | Complete | 2026-01-22 |
| 6. MCP Server Foundation | v1.1 | 2/2 | Complete | 2026-01-23 |
| 7. Test Coverage | v1.1 | 4/4 | Complete | 2026-01-23 |
| 8. Documentation & Integration | v1.1 | 0/1 | Not started | - |

---
*Roadmap created: 2026-01-21*
*Last updated: 2026-01-24 — Phase 8 planned (1 plan)*
