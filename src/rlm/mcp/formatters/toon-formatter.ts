/**
 * TOON Formatter for Search Results
 *
 * Token-Optimized Object Notation (TOON) provides 30-60% token savings
 * for uniform arrays like search results.
 *
 * MCP-08: TOON formatting for search results
 */

import { encode } from '@toon-format/toon';
import type { SearchResult } from '../../types.js';

/**
 * Structured format for TOON-encoded search results.
 */
interface TOONSearchResult {
  file: string;
  lines: string;
  relevance: number;
  code: string;
}

/**
 * Maximum lines per code chunk to prevent overly long results.
 */
const MAX_LINES_PER_RESULT = 50;

/**
 * Format search results as TOON for token-efficient LLM consumption.
 *
 * @param results - Array of search results from hybridSearch
 * @returns TOON-formatted string
 */
export function formatSearchResultsTOON(results: SearchResult[]): string {
  const formatted: TOONSearchResult[] = results.map(r => ({
    file: r.chunk.metadata.path,
    lines: `${r.chunk.metadata.start_line}-${r.chunk.metadata.end_line}`,
    relevance: Math.round(r.score * 100),
    code: truncateCode(r.chunk.text, MAX_LINES_PER_RESULT),
  }));

  // TOON encode with minimal formatting for LLM consumption
  return encode({ results: formatted }, {
    indent: 1,        // Minimal indentation
    delimiter: ',',   // Comma delimiter for readability
  });
}

/**
 * Format search results as markdown (fallback for human readability).
 *
 * @param results - Array of search results from hybridSearch
 * @returns Markdown-formatted string
 */
export function formatSearchResultsMarkdown(results: SearchResult[]): string {
  return results.map((r, i) => {
    const { path, start_line, end_line } = r.chunk.metadata;
    const score = Math.round(r.score * 100);
    const code = truncateCode(r.chunk.text, MAX_LINES_PER_RESULT);
    return `## Result ${i + 1} (${score}% relevance)\nFile: ${path}\nLines: ${start_line}-${end_line}\n\n\`\`\`\n${code}\n\`\`\``;
  }).join('\n\n---\n\n');
}

/**
 * Truncate code to maximum number of lines.
 */
function truncateCode(text: string, maxLines: number): string {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`;
}
