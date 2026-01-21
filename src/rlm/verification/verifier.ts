/**
 * Main Verifier Class
 *
 * Orchestrates all verification checks with FIRE-style confidence scoring.
 * VER-01: Verifier with typecheck, test, impact scan
 * VER-02: Evidence coverage checking
 * VER-03: Recursive refinement suggestions
 */

import type {
  VerificationResult,
  VerifierConfig,
  CheckResult,
  VerificationError,
  AtomicClaim,
} from './types.js';
import { DEFAULT_VERIFIER_CONFIG } from './types.js';
import { typecheckFiles, runTests, scanImpact } from './checks/index.js';
import { ClaimExtractor } from './claims/extractor.js';
import {
  checkEvidenceCoverage,
  generateRefinementQuery,
  type CoverageResult,
} from './claims/coverage.js';
import type { Evidence } from '../engine/types.js';

/**
 * Main Verifier class for FIRE-style verification
 *
 * Combines:
 * - Claim extraction (Claimify pattern)
 * - Evidence coverage analysis
 * - Code quality checks (typecheck, test, impact)
 * - Confidence-based refinement suggestions
 */
export class Verifier {
  private config: VerifierConfig;
  private claimExtractor: ClaimExtractor;

  constructor(config: Partial<VerifierConfig> = {}) {
    this.config = { ...DEFAULT_VERIFIER_CONFIG, ...config };
    this.claimExtractor = new ClaimExtractor();
  }

  /**
   * Verify a response with evidence (FIRE-style)
   *
   * Pipeline:
   * 1. Extract atomic claims from response
   * 2. Check evidence coverage
   * 3. Run enabled code checks (typecheck, test, impact)
   * 4. Calculate overall confidence
   * 5. Generate refinement if not confident
   *
   * @param response - LLM response to verify
   * @param evidence - Evidence gathered during query
   * @param changedFiles - Optional files to run checks against
   * @returns Verification result with confidence and suggestions
   */
  async verify(
    response: string,
    evidence: Evidence[],
    changedFiles?: string[]
  ): Promise<VerificationResult> {
    // 1. Extract atomic claims
    const allClaims = this.claimExtractor.extractAtomicClaims(response);
    const verifiableClaims =
      this.claimExtractor.filterVerifiableClaims(allClaims);

    // 2. Check evidence coverage
    const coverage = checkEvidenceCoverage(verifiableClaims, evidence);

    // 3. Run enabled checks
    const checks: CheckResult[] = [];

    if (changedFiles && changedFiles.length > 0) {
      if (this.config.enableTypecheck) {
        const typecheckResult = await typecheckFiles(changedFiles);
        checks.push(typecheckResult);
      }

      if (this.config.enableTests) {
        const testResult = await runTests(changedFiles, this.config.testTimeout);
        checks.push(testResult);
      }

      if (this.config.enableImpactScan) {
        for (const file of changedFiles.slice(0, 3)) {
          // Limit to 3 files
          const impactResult = await scanImpact(file);
          checks.push(impactResult);
        }
      }
    }

    // 4. Calculate overall confidence
    const overallConfidence = this.calculateConfidence(coverage, checks);

    // 5. Aggregate errors
    const errors = this.aggregateErrors(checks);

    // 6. Determine if confident
    const confident = overallConfidence >= this.config.confidenceThreshold;

    // 7. Generate refinement if not confident
    let suggestedRefinement: string | undefined;
    if (!confident && coverage.gaps.length > 0) {
      suggestedRefinement = generateRefinementQuery(
        coverage.gaps,
        'Provide more evidence'
      );
    }

    return {
      confident,
      overallConfidence,
      checks,
      errors,
      suggestedRefinement,
    };
  }

  /**
   * Verify with a custom confidence threshold
   */
  async verifyWithConfidence(
    response: string,
    evidence: Evidence[],
    threshold?: number
  ): Promise<VerificationResult> {
    const originalThreshold = this.config.confidenceThreshold;

    if (threshold !== undefined) {
      this.config.confidenceThreshold = threshold;
    }

    try {
      return await this.verify(response, evidence);
    } finally {
      this.config.confidenceThreshold = originalThreshold;
    }
  }

  /**
   * Update verifier configuration
   */
  configure(config: Partial<VerifierConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): VerifierConfig {
    return { ...this.config };
  }

  /**
   * Calculate overall confidence from coverage and checks
   *
   * Formula:
   * - Base: evidence coverage ratio (0-1)
   * - Penalty: -0.2 per failed check
   * - Bonus: +0.1 if all checks pass
   */
  private calculateConfidence(
    coverage: CoverageResult,
    checks: CheckResult[]
  ): number {
    // Start with evidence coverage
    let confidence = coverage.coverageRatio;

    // Count failures
    const failedChecks = checks.filter((c) => !c.passed);
    const passedChecks = checks.filter((c) => c.passed);

    // Apply penalty for failures
    confidence -= failedChecks.length * 0.2;

    // Apply bonus if all checks pass (and we have checks)
    if (checks.length > 0 && failedChecks.length === 0) {
      confidence += 0.1;
    }

    // Clamp to 0-1 range
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Aggregate errors from all checks
   */
  private aggregateErrors(checks: CheckResult[]): VerificationError[] {
    const errors: VerificationError[] = [];

    for (const check of checks) {
      for (const error of check.errors) {
        errors.push({
          type: check.type,
          message: error.message,
          file: error.file,
          line: error.line,
          severity: error.severity || 'error',
        });
      }
    }

    return errors;
  }
}
