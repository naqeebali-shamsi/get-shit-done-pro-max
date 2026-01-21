/**
 * Confidence Scoring
 *
 * Calculates confidence based on retrieval scores and evidence coverage.
 * Key insight: Don't trust verbal confidence - use retrieval metrics instead.
 */

import type { Evidence, ContextChunk } from '../engine/types.js';

/**
 * Factors contributing to confidence score
 */
export interface ConfidenceFactors {
  retrievalScore: number;      // Average retrieval score of cited chunks
  evidenceCoverage: number;    // Ratio of claims with evidence
  chunkCount: number;          // Number of supporting chunks
  consistencyScore: number;    // Agreement between evidence pieces
}

/**
 * Weights for confidence factors
 */
export interface ConfidenceWeights {
  retrieval: number;
  evidence: number;
  chunkCount: number;
  consistency: number;
}

export const DEFAULT_WEIGHTS: ConfidenceWeights = {
  retrieval: 0.4,      // Retrieval score most important
  evidence: 0.35,      // Evidence coverage second
  chunkCount: 0.1,     // More chunks = more support
  consistency: 0.15,   // Consistency across evidence
};

/**
 * Calculate overall confidence score
 */
export function calculateConfidence(
  factors: ConfidenceFactors,
  weights: ConfidenceWeights = DEFAULT_WEIGHTS
): number {
  // Normalize chunk count factor (1-5 chunks = 0.2-1.0)
  const chunkFactor = Math.min(1, factors.chunkCount * 0.2);

  const score =
    factors.retrievalScore * weights.retrieval +
    factors.evidenceCoverage * weights.evidence +
    chunkFactor * weights.chunkCount +
    factors.consistencyScore * weights.consistency;

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, score));
}

/**
 * Calculate retrieval score from evidence entries
 */
export function calculateRetrievalScore(evidence: Evidence[]): number {
  if (evidence.length === 0) return 0;

  const scores = evidence
    .filter(e => e.sourceChunks.length > 0)
    .map(e => e.confidence);

  if (scores.length === 0) return 0;

  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

/**
 * Calculate evidence coverage (claims backed by chunks)
 */
export function calculateEvidenceCoverage(
  totalClaims: number,
  coveredClaims: number
): number {
  if (totalClaims === 0) return 1;
  return coveredClaims / totalClaims;
}

/**
 * Calculate consistency score between evidence pieces
 */
export function calculateConsistency(
  evidence: Evidence[],
  chunks: Map<string, ContextChunk>
): number {
  if (evidence.length < 2) return 1;  // Single evidence = consistent

  // Check if cited chunks are from related files/symbols
  const paths = new Set<string>();
  const symbols = new Set<string>();

  for (const e of evidence) {
    for (const chunkId of e.sourceChunks) {
      const chunk = chunks.get(chunkId);
      if (chunk) {
        paths.add(chunk.metadata.path);
        if (chunk.metadata.symbol_name) {
          symbols.add(chunk.metadata.symbol_name);
        }
      }
    }
  }

  // More concentrated evidence (fewer unique files/symbols) = higher consistency
  const pathDiversity = paths.size > 0 ? 1 / paths.size : 0;
  const symbolDiversity = symbols.size > 0 ? 1 / symbols.size : 0;

  // Average of path and symbol concentration
  return (pathDiversity + symbolDiversity) / 2;
}

/**
 * Build confidence factors from evidence and chunks
 */
export function buildConfidenceFactors(
  evidence: Evidence[],
  totalClaims: number,
  chunks: Map<string, ContextChunk>
): ConfidenceFactors {
  const coveredClaims = evidence.filter(e => e.sourceChunks.length > 0).length;
  const allChunkIds = evidence.flatMap(e => e.sourceChunks);
  const uniqueChunks = new Set(allChunkIds);

  return {
    retrievalScore: calculateRetrievalScore(evidence),
    evidenceCoverage: calculateEvidenceCoverage(totalClaims, coveredClaims),
    chunkCount: uniqueChunks.size,
    consistencyScore: calculateConsistency(evidence, chunks),
  };
}

/**
 * Get confidence level label
 */
export function getConfidenceLevel(score: number): 'low' | 'medium' | 'high' {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

/**
 * Confidence report for a query result
 */
export interface ConfidenceReport {
  score: number;
  level: 'low' | 'medium' | 'high';
  factors: ConfidenceFactors;
  warnings: string[];
}

/**
 * Generate confidence report
 */
export function generateConfidenceReport(
  evidence: Evidence[],
  totalClaims: number,
  chunks: Map<string, ContextChunk>,
  weights: ConfidenceWeights = DEFAULT_WEIGHTS
): ConfidenceReport {
  const factors = buildConfidenceFactors(evidence, totalClaims, chunks);
  const score = calculateConfidence(factors, weights);
  const level = getConfidenceLevel(score);

  const warnings: string[] = [];

  if (factors.retrievalScore < 0.5) {
    warnings.push('Low retrieval scores - context may not be relevant');
  }

  if (factors.evidenceCoverage < 0.5) {
    warnings.push('Many claims lack supporting evidence');
  }

  if (factors.chunkCount === 0) {
    warnings.push('No source chunks cited');
  }

  if (factors.consistencyScore < 0.3) {
    warnings.push('Evidence spans many unrelated files - may lack focus');
  }

  return {
    score,
    level,
    factors,
    warnings,
  };
}
