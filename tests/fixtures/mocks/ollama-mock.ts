/**
 * Deterministic Ollama mock for reproducible embedding tests.
 * Uses SHA-256 hashing to generate consistent 768-dimension vectors.
 */

import { createHash } from 'crypto';

/**
 * Convert text to a deterministic 768-dimensional vector using SHA-256 hash.
 * The same text input always produces the same vector output.
 * Vectors are normalized to unit length for cosine similarity.
 *
 * @param text - Input text to convert
 * @returns 768-dimensional normalized vector
 */
export function textToVector(text: string): number[] {
  // Create multiple hashes to fill 768 dimensions
  // Each SHA-256 produces 32 bytes = 256 bits
  // We need 768 floats, so we'll generate 3 hashes with different salts
  const vectors: number[] = [];

  for (let i = 0; i < 3; i++) {
    const hash = createHash('sha256')
      .update(`${text}:salt${i}`)
      .digest();

    // Convert 32 bytes to 256 floats in range [-1, 1]
    for (let j = 0; j < 256; j++) {
      // Use byte value (0-255) and normalize to [-1, 1]
      const value = (hash[j % 32] / 127.5) - 1;
      vectors.push(value);
    }
  }

  // Normalize to unit length for cosine similarity
  const magnitude = Math.sqrt(vectors.reduce((sum, v) => sum + v * v, 0));
  return vectors.map((v) => v / magnitude);
}

/**
 * Embedding response type matching Ollama API
 */
export interface EmbedResponse {
  embeddings: number[][];
}

/**
 * Mock Ollama client for testing.
 * Produces deterministic embeddings based on input text.
 */
export const mockOllama = {
  /**
   * Generate embeddings for input text(s).
   * Compatible with Ollama's embed() API signature.
   *
   * @param options - Embedding options
   * @param options.model - Model name (ignored in mock)
   * @param options.input - Single text or array of texts
   * @returns Promise resolving to embeddings
   */
  async embed(options: {
    model: string;
    input: string | string[];
  }): Promise<EmbedResponse> {
    const inputs = Array.isArray(options.input) ? options.input : [options.input];
    const embeddings = inputs.map((text) => textToVector(text));
    return { embeddings };
  },

  /**
   * Reset mock state (no-op for stateless mock).
   * Provided for API compatibility with stateful mocks.
   */
  _reset(): void {
    // Stateless mock - nothing to reset
  },
};

// Export types for use in tests
export type MockOllama = typeof mockOllama;
