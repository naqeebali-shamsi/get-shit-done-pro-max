/**
 * Context Formatter Module
 *
 * Utilities to format retrieved chunks as readable context for Claude.
 * Produces clean, readable markdown suitable for inclusion in prompts.
 *
 * Phase 4: GSD Integration (VER-04)
 */

import type { Chunk } from '../types.js';

export interface ContextFormatOptions {
  /** Maximum number of chunks to include (default: 5) */
  maxChunks?: number;
  /** Maximum lines per chunk before truncation (default: 50) */
  maxLinesPerChunk?: number;
  /** Include relevance score (default: true) */
  includeConfidence?: boolean;
  /** Output format (default: 'markdown') */
  format?: 'markdown' | 'plain';
}

const DEFAULT_OPTIONS: Required<ContextFormatOptions> = {
  maxChunks: 5,
  maxLinesPerChunk: 50,
  includeConfidence: true,
  format: 'markdown',
};

/**
 * Truncate text to a maximum number of lines.
 *
 * @param text - Text to truncate
 * @param maxLines - Maximum number of lines to keep
 * @returns Truncated text with indicator if truncated
 */
function truncateLines(text: string, maxLines: number): string {
  const lines = text.split('\n');

  if (lines.length <= maxLines) {
    return text;
  }

  const kept = lines.slice(0, maxLines);
  const remaining = lines.length - maxLines;

  return kept.join('\n') + `\n... (truncated, ${remaining} more lines)`;
}

/**
 * Format a single chunk with metadata header.
 *
 * @param chunk - The chunk to format
 * @param score - Optional relevance score (0-1)
 * @param options - Formatting options
 * @returns Formatted chunk string
 */
export function formatSingleChunk(
  chunk: Chunk,
  score?: number,
  options?: ContextFormatOptions
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { path, start_line, end_line, language } = chunk.metadata;

  // Truncate text if needed
  const text = truncateLines(chunk.text, opts.maxLinesPerChunk);

  if (opts.format === 'plain') {
    // Plain text format
    const header = `--- ${path}:${start_line}-${end_line} ---`;
    const confidence = opts.includeConfidence && score !== undefined
      ? `[Relevance: ${Math.round(score * 100)}%]`
      : '';

    return [header, text, confidence].filter(Boolean).join('\n');
  }

  // Markdown format (default)
  const header = `### ${path}:${start_line}-${end_line}`;
  const codeBlock = `\`\`\`${language}\n${text}\n\`\`\``;
  const confidence = opts.includeConfidence && score !== undefined
    ? `*Relevance: ${Math.round(score * 100)}%*`
    : '';

  return [header, codeBlock, confidence].filter(Boolean).join('\n');
}

/**
 * Format multiple chunks as readable context.
 *
 * @param chunks - Array of chunks to format
 * @param scores - Optional array of relevance scores (parallel to chunks)
 * @param options - Formatting options
 * @returns Formatted context string
 */
export function formatChunksAsContext(
  chunks: Chunk[],
  scores?: number[],
  options?: ContextFormatOptions
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (chunks.length === 0) {
    return '';
  }

  // Take top N chunks
  const topChunks = chunks.slice(0, opts.maxChunks);
  const topScores = scores?.slice(0, opts.maxChunks);

  // Format each chunk
  const formattedChunks = topChunks.map((chunk, index) => {
    const score = topScores?.[index];
    return formatSingleChunk(chunk, score, opts);
  });

  // Join with separator
  const separator = opts.format === 'markdown' ? '\n\n---\n\n' : '\n\n';

  return formattedChunks.join(separator);
}

/**
 * Create a brief summary of chunks (for logging/debugging).
 *
 * @param chunks - Array of chunks to summarize
 * @param scores - Optional array of relevance scores
 * @returns Brief summary string
 */
export function summarizeChunks(chunks: Chunk[], scores?: number[]): string {
  if (chunks.length === 0) {
    return 'No chunks';
  }

  const summaries = chunks.slice(0, 5).map((chunk, i) => {
    const { path, start_line, end_line, symbol_name } = chunk.metadata;
    const score = scores?.[i];
    const scoreStr = score !== undefined ? ` (${Math.round(score * 100)}%)` : '';
    const symbol = symbol_name ? ` - ${symbol_name}` : '';
    return `  ${i + 1}. ${path}:${start_line}-${end_line}${symbol}${scoreStr}`;
  });

  const header = `${chunks.length} chunk(s):`;
  const more = chunks.length > 5 ? `  ... and ${chunks.length - 5} more` : '';

  return [header, ...summaries, more].filter(Boolean).join('\n');
}
