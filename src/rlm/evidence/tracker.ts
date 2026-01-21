/**
 * Evidence Tracker
 *
 * Links claims to source chunks and tracks verification status.
 * Core RLM-03 requirement: each claim must reference source chunks.
 */

import type { Evidence, ContextChunk } from '../engine/types.js';

/**
 * Claim extracted from a response
 */
export interface Claim {
  text: string;
  position: number;  // Position in response
}

/**
 * Evidence tracker for an RLM query
 */
export class EvidenceTracker {
  private evidence: Evidence[] = [];
  private chunks: Map<string, ContextChunk> = new Map();

  /**
   * Register available chunks for evidence linking
   */
  registerChunks(chunks: ContextChunk[]): void {
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, chunk);
    }
  }

  /**
   * Add evidence entry
   */
  addEvidence(evidence: Evidence): void {
    this.evidence.push(evidence);
  }

  /**
   * Create evidence from LLM response with cited chunks
   */
  createEvidence(claim: string, chunkIds: string[], retrievalScores: number[]): Evidence {
    // Validate chunk IDs exist
    const validChunks = chunkIds.filter(id => this.chunks.has(id));

    // Calculate confidence based on retrieval scores
    const avgScore = validChunks.length > 0
      ? retrievalScores.reduce((sum, s) => sum + s, 0) / retrievalScores.length
      : 0;

    const evidence: Evidence = {
      claim,
      sourceChunks: validChunks,
      confidence: avgScore,
      verified: false,
    };

    this.evidence.push(evidence);
    return evidence;
  }

  /**
   * Extract claims from a response (simple sentence splitting)
   */
  extractClaims(response: string): Claim[] {
    // Split on sentence boundaries
    const sentences = response
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.trim().length > 10)  // Skip very short fragments
      .map(s => s.trim());

    return sentences.map((text, i) => ({
      text,
      position: i,
    }));
  }

  /**
   * Check if all claims have supporting evidence
   */
  checkCoverage(claims: Claim[]): {
    covered: Claim[];
    uncovered: Claim[];
    coverageRatio: number;
  } {
    const covered: Claim[] = [];
    const uncovered: Claim[] = [];

    for (const claim of claims) {
      const hasEvidence = this.evidence.some(e =>
        e.claim === claim.text && e.sourceChunks.length > 0
      );

      if (hasEvidence) {
        covered.push(claim);
      } else {
        uncovered.push(claim);
      }
    }

    const coverageRatio = claims.length > 0
      ? covered.length / claims.length
      : 1;

    return { covered, uncovered, coverageRatio };
  }

  /**
   * Get evidence for a specific claim
   */
  getEvidenceForClaim(claim: string): Evidence | undefined {
    return this.evidence.find(e => e.claim === claim);
  }

  /**
   * Get all evidence entries
   */
  getAllEvidence(): Evidence[] {
    return [...this.evidence];
  }

  /**
   * Get chunk by ID
   */
  getChunk(chunkId: string): ContextChunk | undefined {
    return this.chunks.get(chunkId);
  }

  /**
   * Mark evidence as verified
   */
  markVerified(claim: string, verified: boolean): void {
    const evidence = this.evidence.find(e => e.claim === claim);
    if (evidence) {
      evidence.verified = verified;
    }
  }

  /**
   * Get verification summary
   */
  getVerificationSummary(): {
    total: number;
    verified: number;
    failed: number;
    pending: number;
  } {
    const verified = this.evidence.filter(e => e.verified).length;
    const pending = this.evidence.filter(e => !e.verified && e.sourceChunks.length > 0).length;
    const failed = this.evidence.filter(e => !e.verified && e.sourceChunks.length === 0).length;

    return {
      total: this.evidence.length,
      verified,
      failed,
      pending,
    };
  }

  /**
   * Clear all evidence
   */
  clear(): void {
    this.evidence = [];
    this.chunks.clear();
  }
}
