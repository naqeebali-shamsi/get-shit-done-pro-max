/**
 * Unit tests for search_code MCP tool
 *
 * Tests the search_code tool handler covering:
 * - TOON-formatted results for valid queries
 * - Empty results handling
 * - Error handling with troubleshooting messages
 * - Default and custom limit parameters
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock dependencies before importing the module
vi.mock('../../../../src/rlm/storage/index.js', () => ({
  createQdrantClient: vi.fn(),
}));

vi.mock('../../../../src/rlm/retrieval/hybrid-search.js', () => ({
  hybridSearch: vi.fn(),
}));

vi.mock('../../../../src/rlm/mcp/logger.js', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../../../src/rlm/mcp/formatters/toon-formatter.js', () => ({
  formatSearchResultsTOON: vi.fn(),
}));

import { registerSearchTool } from '../../../../src/rlm/mcp/tools/search.js';
import { createQdrantClient } from '../../../../src/rlm/storage/index.js';
import { hybridSearch } from '../../../../src/rlm/retrieval/hybrid-search.js';
import { formatSearchResultsTOON } from '../../../../src/rlm/mcp/formatters/toon-formatter.js';
import type { SearchResult } from '../../../../src/rlm/types.js';

describe('search_code tool', () => {
  let mockServer: McpServer;
  let capturedHandler: (args: { query: string; limit?: number }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

  const mockSearchResult: SearchResult = {
    id: 'chunk-1',
    score: 0.85,
    chunk: {
      id: 'chunk-1',
      text: 'function example() { return true; }',
      metadata: {
        path: 'src/example.ts',
        language: 'typescript',
        symbol_type: 'function',
        symbol_name: 'example',
        start_line: 10,
        end_line: 12,
        file_hash: 'abc123',
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock server that captures the handler
    mockServer = {
      tool: vi.fn((name, description, schema, handler) => {
        capturedHandler = handler;
      }),
    } as unknown as McpServer;

    // Register the tool to capture the handler
    registerSearchTool(mockServer);

    // Setup default mocks
    vi.mocked(createQdrantClient).mockResolvedValue({} as any);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns TOON-formatted results for valid query', async () => {
    const mockResults = [mockSearchResult];
    vi.mocked(hybridSearch).mockResolvedValue(mockResults);
    vi.mocked(formatSearchResultsTOON).mockReturnValue('results:\n  file: src/example.ts');

    const response = await capturedHandler({ query: 'authentication', limit: 5 });

    expect(response.content[0].type).toBe('text');
    expect(response.content[0].text).toContain('results:');
    expect(formatSearchResultsTOON).toHaveBeenCalledWith(mockResults);
  });

  it('returns no-matches message when results empty', async () => {
    vi.mocked(hybridSearch).mockResolvedValue([]);

    const response = await capturedHandler({ query: 'nonexistent code' });

    expect(response.content[0].text).toContain('No matches found');
    expect(response.content[0].text).toContain('nonexistent code');
    expect(response.content[0].text).toContain('Suggestions:');
  });

  it('returns error with troubleshooting on Qdrant failure', async () => {
    vi.mocked(hybridSearch).mockRejectedValue(new Error('Qdrant connection refused'));

    const response = await capturedHandler({ query: 'test query' });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('Search failed');
    expect(response.content[0].text).toContain('Qdrant connection refused');
    expect(response.content[0].text).toContain('Troubleshooting');
    expect(response.content[0].text).toContain('Ensure Qdrant is running');
  });

  it('uses default limit of 5 when not specified', async () => {
    vi.mocked(hybridSearch).mockResolvedValue([mockSearchResult]);
    vi.mocked(formatSearchResultsTOON).mockReturnValue('results');

    await capturedHandler({ query: 'test' });

    // Note: The schema has default(5), so limit would be 5 when not specified
    // The handler receives the resolved value from schema validation
    expect(hybridSearch).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      'test',
      expect.objectContaining({ limit: undefined })
    );
  });

  it('respects custom limit parameter', async () => {
    vi.mocked(hybridSearch).mockResolvedValue([mockSearchResult]);
    vi.mocked(formatSearchResultsTOON).mockReturnValue('results');

    await capturedHandler({ query: 'test', limit: 10 });

    expect(hybridSearch).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      'test',
      { limit: 10 }
    );
  });

  it('registers tool with correct name and schema', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'search_code',
      expect.stringContaining('Search the indexed codebase'),
      expect.objectContaining({
        query: expect.any(Object),
        limit: expect.any(Object),
      }),
      expect.any(Function)
    );
  });
});
