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

- [v1.0 MVP](milestones/v1.0-ROADMAP.md) (Phases 1-5) — SHIPPED 2026-01-22

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

<details>
<summary>v1.0 MVP (Phases 1-5) — SHIPPED 2026-01-22</summary>

- [x] **Phase 1: Core Infrastructure** — AST-aware indexing pipeline and Qdrant vector storage
- [x] **Phase 2: RLM Engine Core** — REPL environment with query/recurse methods
- [x] **Phase 3: Verification Loop** — Evidence tracking and confidence scoring
- [x] **Phase 4: GSD Integration** — Transparent enhancement of existing commands
- [x] **Phase 5: Optimization & Polish** — Performance tuning and caching

</details>

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Core Infrastructure | v1.0 | 5/5 | Complete | 2026-01-21 |
| 2. RLM Engine Core | v1.0 | 4/4 | Complete | 2026-01-21 |
| 3. Verification Loop | v1.0 | 3/3 | Complete | 2026-01-21 |
| 4. GSD Integration | v1.0 | 2/2 | Complete | 2026-01-22 |
| 5. Optimization & Polish | v1.0 | 3/3 | Complete | 2026-01-22 |

---
*Roadmap created: 2026-01-21*
*Last updated: 2026-01-22 — v1.0 MVP milestone archived*
