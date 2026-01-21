/**
 * Evidence Coverage Checker
 *
 * Implements VER-02: Evidence coverage checking with gap analysis.
 * Enables FIRE-style recursive refinement by identifying uncovered claims.
 */

import type { AtomicClaim } from '../types.js';
import type { Evidence } from '../../engine/types.js';

/**
 * Result from evidence coverage checking
 */
export interface CoverageResult {
  totalClaims: number;
  coveredClaims: number;
  uncoveredClaims: AtomicClaim[];
  coverageRatio: number; // 0-1
  gaps: Array<{ claim: AtomicClaim; reason: string }>;
}

/**
 * Check how well evidence covers the claims (VER-02)
 *
 * For each verifiable claim, checks if there's matching evidence:
 * - Evidence.claim matches claim.text (fuzzy match)
 * - Evidence.sourceChunks.length > 0 (has supporting chunks)
 *
 * @param claims - Atomic claims extracted from response
 * @param evidence - Evidence gathered during query
 * @returns Coverage analysis with gaps identified
 */
export function checkEvidenceCoverage(
  claims: AtomicClaim[],
  evidence: Evidence[]
): CoverageResult {
  const verifiableClaims = claims.filter((c) => c.verifiable);
  const totalClaims = verifiableClaims.length;

  if (totalClaims === 0) {
    return {
      totalClaims: 0,
      coveredClaims: 0,
      uncoveredClaims: [],
      coverageRatio: 1, // No claims = fully covered
      gaps: [],
    };
  }

  const uncoveredClaims: AtomicClaim[] = [];
  const gaps: CoverageResult['gaps'] = [];
  let coveredCount = 0;

  for (const claim of verifiableClaims) {
    const matchingEvidence = findMatchingEvidence(claim, evidence);

    if (!matchingEvidence) {
      uncoveredClaims.push(claim);
      gaps.push({ claim, reason: 'No evidence found' });
    } else if (matchingEvidence.sourceChunks.length === 0) {
      uncoveredClaims.push(claim);
      gaps.push({ claim, reason: 'Evidence has no source chunks' });
    } else if (matchingEvidence.confidence < 0.3) {
      uncoveredClaims.push(claim);
      gaps.push({ claim, reason: 'Low confidence evidence' });
    } else {
      coveredCount++;
    }
  }

  return {
    totalClaims,
    coveredClaims: coveredCount,
    uncoveredClaims,
    coverageRatio: totalClaims > 0 ? coveredCount / totalClaims : 1,
    gaps,
  };
}

/**
 * Find evidence that matches a claim (fuzzy matching)
 */
function findMatchingEvidence(
  claim: AtomicClaim,
  evidence: Evidence[]
): Evidence | undefined {
  const claimText = claim.text.toLowerCase();
  const claimWords = extractKeywords(claimText);

  for (const ev of evidence) {
    const evText = ev.claim.toLowerCase();

    // Direct contains match
    if (evText.includes(claimText) || claimText.includes(evText)) {
      return ev;
    }

    // Keyword overlap match
    const evWords = extractKeywords(evText);
    const overlap = claimWords.filter((w) => evWords.includes(w));

    // Require at least 50% keyword overlap
    if (overlap.length >= Math.ceil(claimWords.length * 0.5)) {
      return ev;
    }
  }

  return undefined;
}

/**
 * Extract significant keywords from text
 */
function extractKeywords(text: string): string[] {
  // Common words to filter out
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'shall',
    'can',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'between',
    'under',
    'again',
    'further',
    'then',
    'once',
    'here',
    'there',
    'when',
    'where',
    'why',
    'how',
    'all',
    'each',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'no',
    'nor',
    'not',
    'only',
    'own',
    'same',
    'so',
    'than',
    'too',
    'very',
    'just',
    'and',
    'but',
    'if',
    'or',
    'because',
    'until',
    'while',
    'this',
    'that',
    'these',
    'those',
    'it',
    'its',
  ]);

  return text
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

/**
 * Generate a refinement query based on coverage gaps (FIRE pattern)
 *
 * Analyzes gap patterns and constructs a focused refinement query
 * that addresses the missing evidence without repeating the original.
 *
 * @param gaps - Coverage gaps with reasons
 * @param originalQuery - The original user query
 * @returns Refined query for recursion
 */
export function generateRefinementQuery(
  gaps: CoverageResult['gaps'],
  originalQuery: string
): string {
  if (gaps.length === 0) {
    return originalQuery;
  }

  // Analyze gap patterns
  const reasons = new Map<string, number>();
  const concepts = new Set<string>();
  const files = new Set<string>();

  for (const { claim, reason } of gaps) {
    // Count reasons
    reasons.set(reason, (reasons.get(reason) || 0) + 1);

    // Extract concepts from claims
    const keywords = extractKeywords(claim.text);
    keywords.forEach((k) => concepts.add(k));

    // Look for file references in claim context
    const fileMatch = claim.context.match(
      /(?:file|in|from)\s+[`"']?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)/i
    );
    if (fileMatch) {
      files.add(fileMatch[1]);
    }
  }

  // Build refinement parts
  const refinements: string[] = [];

  // If gaps involve specific files
  if (files.size > 0) {
    const fileList = Array.from(files).slice(0, 3).join(', ');
    refinements.push(`Need more context from: ${fileList}`);
  }

  // If most gaps are "No evidence found"
  const noEvidenceCount = reasons.get('No evidence found') || 0;
  if (noEvidenceCount > gaps.length / 2) {
    // Pick top concepts to clarify
    const topConcepts = Array.from(concepts).slice(0, 5).join(', ');
    if (topConcepts) {
      refinements.push(`Clarify: ${topConcepts}`);
    }
  }

  // If gaps are due to low confidence
  const lowConfCount = reasons.get('Low confidence evidence') || 0;
  if (lowConfCount > 0) {
    refinements.push('Find more specific code references');
  }

  // If gaps are due to missing source chunks
  const noChunksCount = reasons.get('Evidence has no source chunks') || 0;
  if (noChunksCount > 0) {
    refinements.push('Provide code examples for claims');
  }

  // Construct refined query
  if (refinements.length === 0) {
    // Fallback: just mention the gap count
    return `${originalQuery} [${gaps.length} claims need evidence]`;
  }

  return `${originalQuery} (${refinements.join('; ')})`;
}
