# Plan 02-03 Summary: Evidence Tracking and Confidence Scoring

## Overview

**Objective:** Implement evidence tracking and confidence scoring modules for RLM verification.

**Duration:** ~4 minutes
**Status:** COMPLETE

## Tasks Completed

| Task | Description | Files | Commit |
|------|-------------|-------|--------|
| 1 | Implement evidence tracker | src/rlm/evidence/tracker.ts | e87321b |
| 2 | Implement confidence scoring | src/rlm/evidence/confidence.ts | 3ec003d |
| 3 | Create evidence module index | src/rlm/evidence/index.ts | 3068168 |
| - | Export evidence from main index | src/rlm/index.ts | 7111b5d |

## Deliverables

### Evidence Tracker (`src/rlm/evidence/tracker.ts`)

**EvidenceTracker class** that:
- Links claims to source chunks (RLM-03)
- Tracks verification status per claim
- Extracts claims from LLM responses via sentence splitting
- Checks evidence coverage to identify gaps

Key methods:
- `registerChunks(chunks)` - Register available context chunks
- `createEvidence(claim, chunkIds, scores)` - Create evidence entry
- `extractClaims(response)` - Extract claims from response text
- `checkCoverage(claims)` - Find covered vs uncovered claims
- `markVerified(claim, verified)` - Update verification status
- `getVerificationSummary()` - Get total/verified/failed/pending counts

### Confidence Scoring (`src/rlm/evidence/confidence.ts`)

**Key insight:** Don't trust verbal confidence - use retrieval metrics instead (RLM-04).

Confidence factors:
- `retrievalScore` (40%) - Average retrieval score of cited chunks
- `evidenceCoverage` (35%) - Ratio of claims with evidence
- `chunkCount` (10%) - Number of supporting chunks
- `consistencyScore` (15%) - Agreement between evidence pieces

Key functions:
- `calculateConfidence(factors, weights)` - Compute overall score
- `buildConfidenceFactors(evidence, totalClaims, chunks)` - Gather factors
- `generateConfidenceReport(evidence, totalClaims, chunks)` - Full report with warnings
- `getConfidenceLevel(score)` - Map to 'low'/'medium'/'high'

### Module Exports

All exports available from:
```typescript
import {
  EvidenceTracker,
  calculateConfidence,
  generateConfidenceReport,
  // ...
} from './rlm/index.js';
```

## Requirements Addressed

| Requirement | How Addressed |
|-------------|---------------|
| RLM-03 | Evidence tracker links claims to source chunks |
| RLM-04 | Confidence from retrieval scores, not verbal confidence |

## Design Decisions

1. **Claim extraction via sentence splitting** - Simple but effective for initial implementation
2. **Configurable weights** - Allow tuning confidence factors per use case
3. **Consistency scoring** - Concentrated evidence from related files scores higher
4. **Warning generation** - Low confidence triggers actionable warnings

## Verification

- [x] `npm run build:rlm` compiles all evidence files
- [x] EvidenceTracker links claims to source chunks
- [x] Confidence calculated from retrieval scores, not verbal
- [x] Coverage checking identifies unsupported claims
- [x] ConfidenceReport generated with warnings

## Next Steps

- Plan 02-02: RLMEngine with query/recurse (parallel, also wave 2)
- Plan 02-04: Dispatcher pipeline integration (depends on 02-02 + 02-03)
