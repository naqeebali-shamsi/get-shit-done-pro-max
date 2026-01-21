/**
 * RLM Verification Types
 *
 * Types for the verification system implementing FIRE-style iterative verification
 * and Claimify atomic claim decomposition.
 */

/**
 * Types of verification checks
 */
export type CheckType = 'typecheck' | 'test' | 'impact';

/**
 * Result from a single verification check
 */
export interface CheckResult {
  type: CheckType;
  passed: boolean;
  errors: Array<{
    message: string;
    file?: string;
    line?: number;
    severity?: 'error' | 'warning';
  }>;
  duration: number; // milliseconds
}

/**
 * Error from verification
 */
export interface VerificationError {
  type: CheckType;
  message: string;
  file?: string;
  line?: number;
  severity: 'error' | 'warning';
}

/**
 * Overall verification result (FIRE pattern)
 */
export interface VerificationResult {
  confident: boolean;
  overallConfidence: number; // 0-1
  checks: CheckResult[];
  errors: VerificationError[];
  suggestedRefinement?: string; // For recursion
}

/**
 * Atomic claim extracted from LLM response (Claimify pattern)
 */
export interface AtomicClaim {
  text: string;
  verifiable: boolean;
  context: string;
  sourcePosition: number;
  chunkIds: string[]; // Linked evidence chunks
}

/**
 * Configuration for the verifier
 */
export interface VerifierConfig {
  enableTypecheck: boolean;
  enableTests: boolean;
  enableImpactScan: boolean;
  confidenceThreshold: number;
  testTimeout: number; // milliseconds
}

/**
 * Default verifier configuration
 */
export const DEFAULT_VERIFIER_CONFIG: VerifierConfig = {
  enableTypecheck: true,
  enableTests: true,
  enableImpactScan: true,
  confidenceThreshold: 0.7,
  testTimeout: 30000,
};
