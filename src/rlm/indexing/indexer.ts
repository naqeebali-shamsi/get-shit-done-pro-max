/**
 * Indexing Pipeline
 *
 * Full chunk → embed → store pipeline for indexing codebase files.
 * Supports incremental updates by tracking file hashes.
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { readFileSync } from 'fs';
import { resolve, relative } from 'path';
import { createHash } from 'crypto';
import fg from 'fast-glob';

import type { Chunk } from '../types.js';
import { chunkCode, detectLanguage } from '../chunking/index.js';
import { chunkMarkdown } from '../chunking/markdown-chunker.js';
import { embedChunks, generateSparseVector } from '../embedding/index.js';
import { ensureCollection, upsertPoints, deleteByFileHash, type PointData } from '../storage/index.js';

export interface IndexOptions {
  includePatterns?: string[];   // File patterns to include
  excludePatterns?: string[];   // Patterns to exclude
  incrementalUpdate?: boolean;  // Only re-index changed files
}

const DEFAULT_OPTIONS: IndexOptions = {
  includePatterns: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx', '**/*.md'],
  excludePatterns: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/.*'],
  incrementalUpdate: true,
};

// Track indexed file hashes for incremental updates
const indexedFiles = new Map<string, string>();

export interface IndexResult {
  indexed: number;
  skipped: number;
  errors: string[];
}

/**
 * Index all matching files in a directory.
 *
 * @param client - Qdrant client instance
 * @param collectionName - Name of the collection to index into
 * @param directoryPath - Path to the directory to index
 * @param options - Indexing configuration options
 * @returns Summary of indexing results
 */
export async function indexDirectory(
  client: QdrantClient,
  collectionName: string,
  directoryPath: string,
  options: IndexOptions = {}
): Promise<IndexResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Ensure collection exists
  await ensureCollection(client, collectionName);

  const files = await collectFiles(directoryPath, opts);
  let indexed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const filePath of files) {
    try {
      const result = await indexFile(client, collectionName, filePath, directoryPath, opts.incrementalUpdate!);
      if (result === 'indexed') {
        indexed++;
      } else if (result === 'skipped') {
        skipped++;
      }
    } catch (e) {
      errors.push(`${filePath}: ${(e as Error).message}`);
    }
  }

  console.log(`Indexing complete: ${indexed} indexed, ${skipped} skipped, ${errors.length} errors`);

  return { indexed, skipped, errors };
}

/**
 * Index a single file.
 */
async function indexFile(
  client: QdrantClient,
  collectionName: string,
  filePath: string,
  basePath: string,
  incremental: boolean
): Promise<'indexed' | 'skipped'> {
  const content = readFileSync(filePath, 'utf-8');
  const fileHash = createHash('sha256').update(content).digest('hex').slice(0, 16);

  // Skip if unchanged
  if (incremental && indexedFiles.get(filePath) === fileHash) {
    return 'skipped';
  }

  // Delete old chunks for this file
  if (indexedFiles.has(filePath)) {
    await deleteByFileHash(client, collectionName, indexedFiles.get(filePath)!);
  }

  const relativePath = relative(basePath, filePath);

  // Chunk based on file type
  let chunks: Chunk[];
  const lang = detectLanguage(filePath);

  if (lang) {
    chunks = await chunkCode(content, relativePath);
  } else if (filePath.endsWith('.md')) {
    chunks = chunkMarkdown(content, relativePath);
  } else {
    // Skip unsupported files
    return 'skipped';
  }

  if (chunks.length === 0) {
    return 'skipped';
  }

  // Generate embeddings
  const embeddings = await embedChunks(chunks);

  // Prepare points with sparse vectors
  const points: PointData[] = chunks.map((chunk, i) => ({
    id: chunk.id,
    dense_vector: embeddings[i].dense_vector,
    sparse_vector: generateSparseVector(chunk.text),
    payload: {
      chunk_id: chunk.id,
      text: chunk.text,
      ...chunk.metadata,
    },
  }));

  // Upsert to Qdrant
  await upsertPoints(client, collectionName, points);

  // Update tracking
  indexedFiles.set(filePath, fileHash);

  return 'indexed';
}

/**
 * Index a single file from content string.
 *
 * @param client - Qdrant client instance
 * @param collectionName - Name of the collection to index into
 * @param filePath - Path to use for the file (for language detection)
 * @param content - File content to index
 * @returns Number of chunks indexed
 */
export async function indexSingleFile(
  client: QdrantClient,
  collectionName: string,
  filePath: string,
  content: string
): Promise<number> {
  // Ensure collection exists
  await ensureCollection(client, collectionName);

  const fileHash = createHash('sha256').update(content).digest('hex').slice(0, 16);

  // Delete old chunks
  await deleteByFileHash(client, collectionName, fileHash);

  // Chunk based on file type
  let chunks: Chunk[];
  const lang = detectLanguage(filePath);

  if (lang) {
    chunks = await chunkCode(content, filePath);
  } else if (filePath.endsWith('.md')) {
    chunks = chunkMarkdown(content, filePath);
  } else {
    return 0;
  }

  if (chunks.length === 0) return 0;

  // Generate embeddings
  const embeddings = await embedChunks(chunks);

  // Prepare points
  const points: PointData[] = chunks.map((chunk, i) => ({
    id: chunk.id,
    dense_vector: embeddings[i].dense_vector,
    sparse_vector: generateSparseVector(chunk.text),
    payload: {
      chunk_id: chunk.id,
      text: chunk.text,
      ...chunk.metadata,
    },
  }));

  // Upsert
  await upsertPoints(client, collectionName, points);

  return chunks.length;
}

/**
 * Collect all files matching the include/exclude patterns using fast-glob.
 */
async function collectFiles(dir: string, opts: IndexOptions): Promise<string[]> {
  const absoluteDir = resolve(dir);

  const files = await fg(opts.includePatterns || [], {
    cwd: absoluteDir,
    ignore: opts.excludePatterns || [],
    absolute: true,
    onlyFiles: true,
    dot: false,
  });

  return files;
}

/**
 * Clear the file hash tracking cache.
 * Useful for forcing a full re-index.
 */
export function clearIndexCache(): void {
  indexedFiles.clear();
}

/**
 * Get the number of tracked files.
 */
export function getIndexCacheSize(): number {
  return indexedFiles.size;
}
