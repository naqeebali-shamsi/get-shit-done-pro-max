/**
 * RLM Verification Module
 *
 * Evidence validation and recursive refinement (Phase 3).
 * VER-01: Verifier with checks (typecheck, test, impact)
 * VER-02: Evidence coverage checking
 * VER-03: Recursive refinement on failure
 */

// Types
export * from './types.js';

// Claim extraction (VER-02 foundation)
export { ClaimExtractor } from './claims/extractor.js';
export {
  checkEvidenceCoverage,
  generateRefinementQuery,
  type CoverageResult,
} from './claims/coverage.js';

// Verification checks (VER-01)
export * from './checks/index.js';

// Main Verifier class
export { Verifier } from './verifier.js';
