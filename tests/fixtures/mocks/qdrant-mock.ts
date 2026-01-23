/**
 * In-memory Qdrant mock for isolated testing.
 * Provides deterministic behavior without external dependencies.
 */

/**
 * Point structure matching Qdrant's point format
 */
export interface MockPoint {
  id: string | number;
  vector: number[];
  payload?: Record<string, unknown>;
}

/**
 * Collection info structure
 */
export interface MockCollectionInfo {
  name: string;
  vectors_count: number;
  points_count: number;
  config: {
    params: {
      vectors: {
        size: number;
        distance: string;
      };
    };
  };
}

/**
 * Search result structure
 */
export interface MockSearchResult {
  id: string | number;
  score: number;
  payload?: Record<string, unknown>;
  vector?: number[];
}

/**
 * Query response structure
 */
export interface MockQueryResponse {
  points: MockSearchResult[];
}

/**
 * Create an in-memory Qdrant mock client.
 * Supports basic operations: collections, upsert, query, delete.
 *
 * @returns Mock Qdrant client instance
 */
export function createMockQdrantClient() {
  // In-memory storage for collections
  const collections = new Map<string, MockPoint[]>();
  // Store collection configs
  const collectionConfigs = new Map<
    string,
    { size: number; distance: string }
  >();

  return {
    /**
     * Get list of all collections.
     */
    async getCollections(): Promise<{ collections: { name: string }[] }> {
      const collectionList = Array.from(collections.keys()).map((name) => ({
        name,
      }));
      return { collections: collectionList };
    },

    /**
     * Create a new collection.
     *
     * @param collectionName - Name of collection to create
     * @param options - Collection configuration
     */
    async createCollection(
      collectionName: string,
      options?: {
        vectors?: {
          size: number;
          distance: string;
        };
      }
    ): Promise<boolean> {
      if (collections.has(collectionName)) {
        return true; // Already exists
      }
      collections.set(collectionName, []);
      collectionConfigs.set(collectionName, {
        size: options?.vectors?.size ?? 768,
        distance: options?.vectors?.distance ?? 'Cosine',
      });
      return true;
    },

    /**
     * Get collection info.
     *
     * @param collectionName - Name of collection
     */
    async getCollection(
      collectionName: string
    ): Promise<MockCollectionInfo | null> {
      const points = collections.get(collectionName);
      const config = collectionConfigs.get(collectionName);

      if (!points) {
        return null;
      }

      return {
        name: collectionName,
        vectors_count: points.length,
        points_count: points.length,
        config: {
          params: {
            vectors: {
              size: config?.size ?? 768,
              distance: config?.distance ?? 'Cosine',
            },
          },
        },
      };
    },

    /**
     * Check if a collection exists.
     *
     * @param collectionName - Name of collection
     */
    async collectionExists(collectionName: string): Promise<{ exists: boolean }> {
      return { exists: collections.has(collectionName) };
    },

    /**
     * Upsert points into a collection.
     *
     * @param collectionName - Name of collection
     * @param options - Points to upsert
     */
    async upsert(
      collectionName: string,
      options: {
        points: MockPoint[];
        wait?: boolean;
      }
    ): Promise<{ status: string }> {
      let points = collections.get(collectionName);

      if (!points) {
        // Auto-create collection if it doesn't exist
        collections.set(collectionName, []);
        collectionConfigs.set(collectionName, { size: 768, distance: 'Cosine' });
        points = collections.get(collectionName)!;
      }

      for (const newPoint of options.points) {
        // Remove existing point with same ID
        const existingIndex = points.findIndex((p) => p.id === newPoint.id);
        if (existingIndex !== -1) {
          points.splice(existingIndex, 1);
        }
        // Add new point
        points.push(newPoint);
      }

      return { status: 'ok' };
    },

    /**
     * Query collection for similar vectors.
     * Returns points sorted by mock cosine similarity score.
     *
     * @param collectionName - Name of collection
     * @param options - Query options
     */
    async query(
      collectionName: string,
      options: {
        vector: number[];
        limit?: number;
        with_payload?: boolean;
        with_vector?: boolean;
        filter?: Record<string, unknown>;
      }
    ): Promise<MockSearchResult[]> {
      const points = collections.get(collectionName);

      if (!points || points.length === 0) {
        return [];
      }

      // Calculate cosine similarity scores
      const results = points.map((point) => {
        const score = cosineSimilarity(options.vector, point.vector);
        return {
          id: point.id,
          score,
          payload: options.with_payload !== false ? point.payload : undefined,
          vector: options.with_vector ? point.vector : undefined,
        };
      });

      // Sort by score descending
      results.sort((a, b) => b.score - a.score);

      // Apply limit
      const limit = options.limit ?? 10;
      return results.slice(0, limit);
    },

    /**
     * Search collection (alias for query).
     */
    async search(
      collectionName: string,
      options: {
        vector: number[];
        limit?: number;
        with_payload?: boolean;
        with_vector?: boolean;
        filter?: Record<string, unknown>;
      }
    ): Promise<MockSearchResult[]> {
      return this.query(collectionName, options);
    },

    /**
     * Delete points from collection.
     *
     * @param collectionName - Name of collection
     * @param options - Delete options
     */
    async delete(
      collectionName: string,
      options: {
        points?: (string | number)[];
        filter?: Record<string, unknown>;
        wait?: boolean;
      }
    ): Promise<{ status: string }> {
      const points = collections.get(collectionName);

      if (!points) {
        return { status: 'ok' };
      }

      if (options.points) {
        // Delete by IDs
        const idsToDelete = new Set(options.points);
        const remaining = points.filter((p) => !idsToDelete.has(p.id));
        collections.set(collectionName, remaining);
      }

      return { status: 'ok' };
    },

    /**
     * Delete a collection.
     *
     * @param collectionName - Name of collection to delete
     */
    async deleteCollection(collectionName: string): Promise<boolean> {
      collections.delete(collectionName);
      collectionConfigs.delete(collectionName);
      return true;
    },

    /**
     * Reset all collections and state.
     * Use in test cleanup to ensure isolation.
     */
    _reset(): void {
      collections.clear();
      collectionConfigs.clear();
    },

    /**
     * Get raw points from a collection (for testing).
     *
     * @param collectionName - Name of collection
     */
    _getPoints(collectionName: string): MockPoint[] | undefined {
      return collections.get(collectionName);
    },
  };
}

/**
 * Calculate cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

// Export types
export type MockQdrantClient = ReturnType<typeof createMockQdrantClient>;
