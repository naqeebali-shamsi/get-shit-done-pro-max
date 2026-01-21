/**
 * RLM Evidence Module
 *
 * Evidence tracking and confidence scoring for RLM results.
 */

export { EvidenceTracker, type Claim } from './tracker.js';
export {
  calculateConfidence,
  calculateRetrievalScore,
  calculateEvidenceCoverage,
  calculateConsistency,
  buildConfidenceFactors,
  getConfidenceLevel,
  generateConfidenceReport,
  DEFAULT_WEIGHTS,
  type ConfidenceFactors,
  type ConfidenceWeights,
  type ConfidenceReport,
} from './confidence.js';
