/**
 * Unit tests for TOON formatter
 *
 * Tests the TOON formatter module covering:
 * - Valid TOON output that can be decoded
 * - Field mapping (file, lines, relevance, code)
 * - Score to percentage conversion
 * - Line range formatting
 * - Code truncation for long chunks
 * - Empty results handling
 * - Markdown fallback format
 */

import { describe, it, expect } from 'vitest';
import { decode } from '@toon-format/toon';
import {
  formatSearchResultsTOON,
  formatSearchResultsMarkdown,
} from '../../../../src/rlm/mcp/formatters/toon-formatter.js';
import type { SearchResult } from '../../../../src/rlm/types.js';

// Helper to create mock SearchResult
function createMockResult(overrides: Partial<{
  id: string;
  score: number;
  path: string;
  text: string;
  startLine: number;
  endLine: number;
}>): SearchResult {
  return {
    id: overrides.id ?? 'chunk-1',
    score: overrides.score ?? 0.85,
    chunk: {
      id: overrides.id ?? 'chunk-1',
      text: overrides.text ?? 'function example() { return true; }',
      metadata: {
        path: overrides.path ?? 'src/example.ts',
        language: 'typescript',
        symbol_type: 'function',
        symbol_name: 'example',
        start_line: overrides.startLine ?? 10,
        end_line: overrides.endLine ?? 12,
        file_hash: 'abc123',
      },
    },
  };
}

describe('formatSearchResultsTOON', () => {
  it('returns valid TOON that can be decoded', () => {
    const results = [createMockResult({})];

    const toonOutput = formatSearchResultsTOON(results);

    // TOON decode should succeed without throwing
    const decoded = decode(toonOutput);
    expect(decoded).toBeDefined();
    expect(decoded).toHaveProperty('results');
    expect(Array.isArray(decoded.results)).toBe(true);
  });

  it('includes file, lines, relevance, code fields', () => {
    const results = [createMockResult({
      path: 'src/api/auth.ts',
      text: 'export function authenticate() {}',
      startLine: 20,
      endLine: 25,
      score: 0.92,
    })];

    const toonOutput = formatSearchResultsTOON(results);
    const decoded = decode(toonOutput);

    expect(decoded.results[0]).toEqual({
      file: 'src/api/auth.ts',
      lines: '20-25',
      relevance: 92,
      code: 'export function authenticate() {}',
    });
  });

  it('converts score to percentage (0-100)', () => {
    const results = [
      createMockResult({ score: 0.0 }),
      createMockResult({ id: 'chunk-2', score: 0.5 }),
      createMockResult({ id: 'chunk-3', score: 1.0 }),
      createMockResult({ id: 'chunk-4', score: 0.857 }),
    ];

    const toonOutput = formatSearchResultsTOON(results);
    const decoded = decode(toonOutput);

    expect(decoded.results[0].relevance).toBe(0);
    expect(decoded.results[1].relevance).toBe(50);
    expect(decoded.results[2].relevance).toBe(100);
    expect(decoded.results[3].relevance).toBe(86); // Rounded
  });

  it('formats line range as start-end string', () => {
    const results = [createMockResult({ startLine: 100, endLine: 150 })];

    const toonOutput = formatSearchResultsTOON(results);
    const decoded = decode(toonOutput);

    expect(decoded.results[0].lines).toBe('100-150');
  });

  it('truncates code longer than 50 lines', () => {
    // Create code with 60 lines
    const longCode = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n');
    const results = [createMockResult({ text: longCode })];

    const toonOutput = formatSearchResultsTOON(results);
    const decoded = decode(toonOutput);

    const codeLines = decoded.results[0].code.split('\n');
    // Should have 50 lines + truncation message line
    expect(codeLines.length).toBe(51);
    expect(decoded.results[0].code).toContain('... (10 more lines)');
  });

  it('does not truncate code under 50 lines', () => {
    const shortCode = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n');
    const results = [createMockResult({ text: shortCode })];

    const toonOutput = formatSearchResultsTOON(results);
    const decoded = decode(toonOutput);

    expect(decoded.results[0].code).toBe(shortCode);
    expect(decoded.results[0].code).not.toContain('more lines');
  });

  it('handles empty results array', () => {
    const results: SearchResult[] = [];

    const toonOutput = formatSearchResultsTOON(results);
    const decoded = decode(toonOutput);

    expect(decoded.results).toEqual([]);
  });

  it('handles multiple results', () => {
    const results = [
      createMockResult({ id: 'chunk-1', path: 'file1.ts', score: 0.9 }),
      createMockResult({ id: 'chunk-2', path: 'file2.ts', score: 0.8 }),
      createMockResult({ id: 'chunk-3', path: 'file3.ts', score: 0.7 }),
    ];

    const toonOutput = formatSearchResultsTOON(results);
    const decoded = decode(toonOutput);

    expect(decoded.results.length).toBe(3);
    expect(decoded.results[0].file).toBe('file1.ts');
    expect(decoded.results[1].file).toBe('file2.ts');
    expect(decoded.results[2].file).toBe('file3.ts');
  });
});

describe('formatSearchResultsMarkdown', () => {
  it('returns markdown with code blocks', () => {
    const results = [createMockResult({ text: 'const x = 1;' })];

    const markdown = formatSearchResultsMarkdown(results);

    expect(markdown).toContain('```');
    expect(markdown).toContain('const x = 1;');
  });

  it('includes result numbering', () => {
    const results = [
      createMockResult({ id: 'chunk-1' }),
      createMockResult({ id: 'chunk-2' }),
    ];

    const markdown = formatSearchResultsMarkdown(results);

    expect(markdown).toContain('## Result 1');
    expect(markdown).toContain('## Result 2');
  });

  it('includes relevance percentage', () => {
    const results = [createMockResult({ score: 0.87 })];

    const markdown = formatSearchResultsMarkdown(results);

    expect(markdown).toContain('87% relevance');
  });

  it('includes file path and line numbers', () => {
    const results = [createMockResult({
      path: 'src/utils/helper.ts',
      startLine: 42,
      endLine: 58,
    })];

    const markdown = formatSearchResultsMarkdown(results);

    expect(markdown).toContain('File: src/utils/helper.ts');
    expect(markdown).toContain('Lines: 42-58');
  });

  it('separates results with horizontal rule', () => {
    const results = [
      createMockResult({ id: 'chunk-1' }),
      createMockResult({ id: 'chunk-2' }),
    ];

    const markdown = formatSearchResultsMarkdown(results);

    expect(markdown).toContain('---');
  });

  it('truncates long code in markdown format', () => {
    const longCode = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n');
    const results = [createMockResult({ text: longCode })];

    const markdown = formatSearchResultsMarkdown(results);

    expect(markdown).toContain('... (10 more lines)');
  });
});
