/**
 * Claim Extractor
 *
 * NLP-based extraction of atomic claims from LLM responses.
 * Uses compromise.js for sentence segmentation and pattern matching.
 * Implements Claimify pattern for verifiable content filtering.
 */

import nlp from 'compromise';
import type { AtomicClaim } from '../types.js';

/**
 * Patterns that indicate non-verifiable content
 */
const OPINION_PATTERNS = [
  '(think|believe|feel|suggest|recommend)',
  '(might|could|should|probably|perhaps|maybe)',
  '(in my opinion|i would say|it seems)',
];

/**
 * Patterns that indicate meta-commentary (not verifiable claims)
 */
const META_PATTERNS = [
  '^(in summary|to summarize|as mentioned|to clarify|note that)',
  '^(as i said|as noted|as shown|as we can see)',
  '^(let me|i will|i can|i should)',
];

/**
 * Extract atomic claims from LLM responses
 */
export class ClaimExtractor {
  private opinionRegex: RegExp;
  private metaRegex: RegExp;

  constructor() {
    // Compile patterns once
    this.opinionRegex = new RegExp(OPINION_PATTERNS.join('|'), 'i');
    this.metaRegex = new RegExp(META_PATTERNS.join('|'), 'i');
  }

  /**
   * Extract atomic claims from a response
   * Uses compromise for sentence segmentation
   */
  extractAtomicClaims(response: string): AtomicClaim[] {
    const doc = nlp(response);
    const sentences = doc.sentences().json() as Array<{ text: string }>;

    const claims: AtomicClaim[] = [];

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const text = sentence.text.trim();

      // Skip empty or very short sentences
      if (text.length < 10) continue;

      // Get surrounding context
      const prevText = i > 0 ? sentences[i - 1].text : '';
      const nextText = i < sentences.length - 1 ? sentences[i + 1].text : '';
      const context = this.buildContext(prevText, nextText);

      // Determine if verifiable
      const verifiable = this.isVerifiable(text);

      claims.push({
        text,
        verifiable,
        context,
        sourcePosition: i,
        chunkIds: [], // Populated later by addChunkContext
      });
    }

    return claims;
  }

  /**
   * Filter to only verifiable claims
   */
  filterVerifiableClaims(claims: AtomicClaim[]): AtomicClaim[] {
    return claims.filter((claim) => {
      // Must be marked verifiable
      if (!claim.verifiable) return false;

      // Skip questions
      if (this.isQuestion(claim.text)) return false;

      // Skip meta-commentary
      if (this.isMetaCommentary(claim.text)) return false;

      return true;
    });
  }

  /**
   * Add chunk context to claims by matching text
   * Uses simple substring matching (semantic matching is retrieval's job)
   */
  addChunkContext(
    claims: AtomicClaim[],
    chunkTexts: Map<string, string>
  ): AtomicClaim[] {
    return claims.map((claim) => {
      const matchingChunkIds: string[] = [];

      // Find chunks that contain similar text
      for (const [chunkId, chunkText] of chunkTexts) {
        if (this.hasTextOverlap(claim.text, chunkText)) {
          matchingChunkIds.push(chunkId);
        }
      }

      return {
        ...claim,
        chunkIds: matchingChunkIds,
      };
    });
  }

  /**
   * Check if a sentence is verifiable (factual, not opinion)
   */
  private isVerifiable(text: string): boolean {
    // Use compromise to check sentence type
    const sentenceDoc = nlp(text);

    // Questions are not verifiable
    if (sentenceDoc.sentences().isQuestion().length > 0) {
      return false;
    }

    // Check for opinion/hedging patterns
    if (this.opinionRegex.test(text)) {
      return false;
    }

    // Check for meta-commentary
    if (this.metaRegex.test(text)) {
      return false;
    }

    // If it's a statement (not exclamation or question), it's potentially verifiable
    return sentenceDoc.sentences().length > 0;
  }

  /**
   * Check if text is a question
   */
  private isQuestion(text: string): boolean {
    // Simple check: ends with ?
    if (text.trim().endsWith('?')) return true;

    // Use compromise for more sophisticated check
    const doc = nlp(text);
    return doc.sentences().isQuestion().length > 0;
  }

  /**
   * Check if text is meta-commentary
   */
  private isMetaCommentary(text: string): boolean {
    return this.metaRegex.test(text);
  }

  /**
   * Build context from surrounding sentences
   */
  private buildContext(prev: string, next: string): string {
    const parts: string[] = [];
    if (prev) parts.push(prev);
    if (next) parts.push(next);
    return parts.join(' ');
  }

  /**
   * Check if there's meaningful text overlap between claim and chunk
   * Uses keyword extraction for matching
   */
  private hasTextOverlap(claimText: string, chunkText: string): boolean {
    // Extract significant words (nouns, verbs) from claim
    const claimDoc = nlp(claimText);
    const claimNouns = claimDoc.nouns().out('array') as string[];
    const claimVerbs = claimDoc.verbs().out('array') as string[];
    const keywords = [...claimNouns, ...claimVerbs];

    // If we have few keywords, fall back to simple substring
    if (keywords.length < 2) {
      // Extract first few significant words
      const words = claimText
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4);
      return words.some((word) => chunkText.toLowerCase().includes(word));
    }

    // Check if chunk contains any of the keywords
    const chunkLower = chunkText.toLowerCase();
    const matchCount = keywords.filter((kw) =>
      chunkLower.includes(kw.toLowerCase())
    ).length;

    // Require at least 2 keyword matches or 50% of keywords
    return matchCount >= 2 || matchCount >= keywords.length * 0.5;
  }
}
