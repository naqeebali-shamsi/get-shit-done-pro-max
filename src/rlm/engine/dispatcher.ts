/**
 * RLM Dispatcher
 *
 * Orchestrates the full RLM pipeline: embed -> retrieve -> query -> verify -> recurse.
 * Main entry point for GSD commands.
 *
 * VER-03: Integrates Verifier for FIRE-style recursive refinement on failure.
 */

import { QdrantClient } from '@qdrant/js-client-rest';

import { RLMEngine } from './rlm-engine.js';
import type { RLMEngineConfig, RLMResult, Evidence } from './types.js';
import { DEFAULT_ENGINE_CONFIG } from './types.js';
import { hybridSearch, type SearchOptions } from '../retrieval/index.js';
import { EvidenceTracker } from '../evidence/tracker.js';
import {
  generateConfidenceReport,
  type ConfidenceReport,
} from '../evidence/confidence.js';
import { Verifier } from '../verification/verifier.js';
import type {
  VerifierConfig,
  VerificationResult,
} from '../verification/types.js';
import type { Chunk } from '../types.js';

/**
 * Dispatcher configuration
 */
export interface DispatcherConfig {
  engine: Partial<RLMEngineConfig>;
  search: SearchOptions;
  collectionName: string;
  minConfidence: number;
  maxRecursions: number;
  verifier?: Partial<VerifierConfig>;
  enableVerification: boolean;
}

export const DEFAULT_DISPATCHER_CONFIG: DispatcherConfig = {
  engine: DEFAULT_ENGINE_CONFIG,
  search: {
    limit: 10,
    useHybrid: true,
  },
  collectionName: 'codebase',
  minConfidence: 0.5,
  maxRecursions: 3,
  enableVerification: true,
};

/**
 * Verified result from dispatcher
 */
export interface VerifiedResult {
  response: string;
  confidence: ConfidenceReport;
  evidence: Evidence[];
  reasoning: string[];
  tokensUsed: number;
  recursionDepth: number;
  iterations: number;
  verification?: VerificationResult;
}

/**
 * RLM Dispatcher - orchestrates the full pipeline
 */
export class RLMDispatcher {
  private client: QdrantClient;
  private config: DispatcherConfig;
  private engine: RLMEngine;
  private tracker: EvidenceTracker;
  private verifier: Verifier | null;

  constructor(client: QdrantClient, config: Partial<DispatcherConfig> = {}) {
    this.client = client;
    this.config = { ...DEFAULT_DISPATCHER_CONFIG, ...config };
    this.engine = new RLMEngine(this.config.engine);
    this.tracker = new EvidenceTracker();
    this.verifier = this.config.enableVerification
      ? new Verifier(this.config.verifier)
      : null;
  }

  /**
   * Main dispatch method (RLM-02, VER-03)
   *
   * Pipeline: embed state -> retrieve -> query -> verify -> recurse if needed
   */
  async dispatch(query: string): Promise<VerifiedResult> {
    let iterations = 0;
    let currentQuery = query;
    let result: RLMResult | null = null;
    let previousVerification: VerificationResult | undefined;
    let verification: VerificationResult | undefined;

    // Reset tracker for new query
    this.tracker.clear();

    while (iterations < this.config.maxRecursions) {
      iterations++;

      // 1. Retrieve relevant chunks (uses Phase 1 hybrid search)
      const searchResults = await hybridSearch(
        this.client,
        this.config.collectionName,
        currentQuery,
        this.config.search
      );

      if (searchResults.length === 0) {
        return this.buildEmptyResult(query, iterations);
      }

      // Extract chunks and scores
      const chunks = searchResults.map((r) => r.chunk);
      const scores = searchResults.map((r) => r.score);

      // Register chunks with tracker
      this.tracker.registerChunks(
        chunks.map((c, i) => ({
          id: c.id,
          text: c.text,
          score: scores[i],
          metadata: {
            path: c.metadata.path,
            symbol_name: c.metadata.symbol_name,
            start_line: c.metadata.start_line,
            end_line: c.metadata.end_line,
          },
        }))
      );

      // 2. Query the RLM engine
      if (iterations === 1) {
        result = await this.engine.query(currentQuery, chunks, scores);
      } else {
        result = await this.engine.recurse(currentQuery);
      }

      // 3. Track evidence
      this.trackEvidence(result);

      // 4. Verify result (VER-03 integration)
      const confidenceReport = this.evaluateResult(result);

      if (this.verifier) {
        previousVerification = verification;
        verification = await this.verifier.verify(
          result.response,
          result.evidence
        );

        // Check if we should recurse based on verification
        if (
          !verification.confident &&
          result.canRecurse &&
          this.shouldRecurseForVerification(verification, previousVerification)
        ) {
          // Use verification's suggested refinement or generate one
          if (verification.suggestedRefinement) {
            currentQuery = verification.suggestedRefinement;
            continue;
          }
        }
      }

      // 5. Check confidence threshold (existing logic)
      if (
        confidenceReport.score >= this.config.minConfidence ||
        !result.canRecurse
      ) {
        return this.buildResult(
          query,
          result,
          confidenceReport,
          iterations,
          verification
        );
      }

      // 6. Prepare for recursion with refined query
      if (result.refinedQuery) {
        currentQuery = result.refinedQuery;
      } else {
        // Generate refined query based on low confidence factors
        currentQuery = this.generateRefinedQuery(query, confidenceReport);
      }
    }

    // Max iterations reached - return best result
    const finalReport = result
      ? this.evaluateResult(result)
      : this.buildEmptyConfidenceReport();

    return this.buildResult(
      query,
      result || this.buildEmptyRLMResult(),
      finalReport,
      iterations,
      verification
    );
  }

  /**
   * Check if we should recurse based on verification (FIRE pattern)
   *
   * Prevents infinite loops by checking:
   * - Same errors don't repeat
   * - Confidence is improving
   */
  private shouldRecurseForVerification(
    current: VerificationResult,
    previous?: VerificationResult
  ): boolean {
    // First verification - allow recursion if not confident
    if (!previous) {
      return !current.confident;
    }

    // Check if confidence improved meaningfully
    const improvement =
      current.overallConfidence - previous.overallConfidence;
    if (improvement < 0.05) {
      // Diminishing returns - don't recurse
      return false;
    }

    // Check if same errors are repeating
    if (this.hasSameErrors(current, previous)) {
      return false;
    }

    return !current.confident;
  }

  /**
   * Check if the same errors are repeating between verifications
   */
  private hasSameErrors(
    current: VerificationResult,
    previous: VerificationResult
  ): boolean {
    if (current.errors.length === 0 || previous.errors.length === 0) {
      return false;
    }

    // Compare error messages
    const currentMessages = new Set(current.errors.map((e) => e.message));
    const previousMessages = new Set(previous.errors.map((e) => e.message));

    // Count how many errors are the same
    let sameCount = 0;
    for (const msg of currentMessages) {
      if (previousMessages.has(msg)) {
        sameCount++;
      }
    }

    // If more than 50% of errors are the same, consider them repeating
    return sameCount > current.errors.length * 0.5;
  }

  /**
   * Track evidence from RLM result
   */
  private trackEvidence(result: RLMResult): void {
    for (const evidence of result.evidence) {
      this.tracker.addEvidence(evidence);
    }
  }

  /**
   * Evaluate result confidence
   */
  private evaluateResult(result: RLMResult): ConfidenceReport {
    const claims = this.tracker.extractClaims(result.response);
    const chunks = new Map(
      this.tracker
        .getAllEvidence()
        .flatMap((e) =>
          e.sourceChunks.map((id) => [id, this.tracker.getChunk(id)!] as const)
        )
        .filter(([, chunk]) => chunk !== undefined)
    );

    return generateConfidenceReport(result.evidence, claims.length, chunks);
  }

  /**
   * Generate refined query for recursion
   */
  private generateRefinedQuery(
    originalQuery: string,
    report: ConfidenceReport
  ): string {
    const refinements: string[] = [];

    if (report.factors.retrievalScore < 0.5) {
      refinements.push('Find more specific code references');
    }

    if (report.factors.evidenceCoverage < 0.5) {
      refinements.push('Provide evidence for all claims');
    }

    if (report.factors.consistencyScore < 0.3) {
      refinements.push('Focus on most relevant files');
    }

    return refinements.length > 0
      ? `${originalQuery} (Note: ${refinements.join(', ')})`
      : originalQuery;
  }

  /**
   * Build final verified result
   */
  private buildResult(
    _query: string,
    result: RLMResult,
    confidence: ConfidenceReport,
    iterations: number,
    verification?: VerificationResult
  ): VerifiedResult {
    return {
      response: result.response,
      confidence,
      evidence: this.tracker.getAllEvidence(),
      reasoning: result.reasoning,
      tokensUsed: result.tokensUsed,
      recursionDepth: result.depth,
      iterations,
      verification,
    };
  }

  /**
   * Build empty result when no chunks found
   */
  private buildEmptyResult(_query: string, iterations: number): VerifiedResult {
    return {
      response: 'No relevant context found for this query.',
      confidence: this.buildEmptyConfidenceReport(),
      evidence: [],
      reasoning: ['No chunks retrieved from vector search'],
      tokensUsed: 0,
      recursionDepth: 0,
      iterations,
    };
  }

  /**
   * Build empty RLM result
   */
  private buildEmptyRLMResult(): RLMResult {
    return {
      response: '',
      evidence: [],
      reasoning: [],
      tokensUsed: 0,
      depth: 0,
      verified: false,
      canRecurse: false,
    };
  }

  /**
   * Build empty confidence report
   */
  private buildEmptyConfidenceReport(): ConfidenceReport {
    return {
      score: 0,
      level: 'low',
      factors: {
        retrievalScore: 0,
        evidenceCoverage: 0,
        chunkCount: 0,
        consistencyScore: 0,
      },
      warnings: ['No context retrieved'],
    };
  }

  /**
   * Update configuration
   */
  configure(config: Partial<DispatcherConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.engine) {
      this.engine = new RLMEngine(this.config.engine);
    }
    if (config.verifier && this.verifier) {
      this.verifier.configure(config.verifier);
    }
    if (config.enableVerification !== undefined) {
      this.verifier = config.enableVerification
        ? new Verifier(this.config.verifier)
        : null;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): DispatcherConfig {
    return { ...this.config };
  }
}

/**
 * Create dispatcher with default Qdrant client
 */
export async function createDispatcher(
  qdrantUrl: string = 'http://localhost:6333',
  config: Partial<DispatcherConfig> = {}
): Promise<RLMDispatcher> {
  const client = new QdrantClient({ url: qdrantUrl });
  return new RLMDispatcher(client, config);
}
