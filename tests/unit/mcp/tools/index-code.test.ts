/**
 * Unit tests for index_code MCP tool
 *
 * Tests the index_code tool handler covering:
 * - Success summary with indexed count
 * - Skipped files count
 * - Error reporting (first 3)
 * - Failure handling with troubleshooting
 * - Elapsed time measurement
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock dependencies before importing the module
vi.mock('../../../../src/rlm/storage/index.js', () => ({
  createQdrantClient: vi.fn(),
}));

vi.mock('../../../../src/rlm/indexing/index.js', () => ({
  indexDirectory: vi.fn(),
}));

vi.mock('../../../../src/rlm/mcp/logger.js', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

import { registerIndexTool } from '../../../../src/rlm/mcp/tools/index-code.js';
import { createQdrantClient } from '../../../../src/rlm/storage/index.js';
import { indexDirectory } from '../../../../src/rlm/indexing/index.js';

describe('index_code tool', () => {
  let mockServer: McpServer;
  let capturedHandler: (args: { path: string }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock server that captures the handler
    mockServer = {
      tool: vi.fn((name, description, schema, handler) => {
        capturedHandler = handler;
      }),
    } as unknown as McpServer;

    // Register the tool to capture the handler
    registerIndexTool(mockServer);

    // Setup default mocks
    vi.mocked(createQdrantClient).mockResolvedValue({} as any);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns success summary with indexed count', async () => {
    vi.mocked(indexDirectory).mockResolvedValue({
      indexed: 42,
      skipped: 0,
      errors: [],
    });

    const response = await capturedHandler({ path: '/project/src' });

    expect(response.content[0].text).toContain('Indexing complete');
    expect(response.content[0].text).toContain('Files indexed: 42');
    expect(response.isError).toBeUndefined();
  });

  it('includes skipped count in summary', async () => {
    vi.mocked(indexDirectory).mockResolvedValue({
      indexed: 30,
      skipped: 12,
      errors: [],
    });

    const response = await capturedHandler({ path: '/project/src' });

    expect(response.content[0].text).toContain('Files indexed: 30');
    expect(response.content[0].text).toContain('Files skipped (unchanged): 12');
  });

  it('reports first 3 errors when indexing has errors', async () => {
    vi.mocked(indexDirectory).mockResolvedValue({
      indexed: 10,
      skipped: 0,
      errors: [
        'Error in file1.ts: parse error',
        'Error in file2.ts: syntax error',
        'Error in file3.ts: invalid encoding',
        'Error in file4.ts: too large',
        'Error in file5.ts: binary file',
      ],
    });

    const response = await capturedHandler({ path: '/project/src' });

    expect(response.content[0].text).toContain('Errors: 5');
    expect(response.content[0].text).toContain('First 3 errors:');
    expect(response.content[0].text).toContain('Error in file1.ts');
    expect(response.content[0].text).toContain('Error in file2.ts');
    expect(response.content[0].text).toContain('Error in file3.ts');
    // Should not include the 4th and 5th errors
    expect(response.content[0].text).not.toContain('Error in file4.ts');
    expect(response.content[0].text).not.toContain('Error in file5.ts');
  });

  it('returns error with troubleshooting on failure', async () => {
    vi.mocked(indexDirectory).mockRejectedValue(new Error('Connection refused'));

    const response = await capturedHandler({ path: '/project/src' });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('Indexing failed');
    expect(response.content[0].text).toContain('Connection refused');
    expect(response.content[0].text).toContain('Troubleshooting');
    expect(response.content[0].text).toContain('Ensure Qdrant is running');
    expect(response.content[0].text).toContain('Ensure Ollama is running');
  });

  it('measures elapsed time in response', async () => {
    vi.mocked(indexDirectory).mockImplementation(async () => {
      // Simulate a small delay
      await new Promise(resolve => setTimeout(resolve, 10));
      return { indexed: 5, skipped: 0, errors: [] };
    });

    const response = await capturedHandler({ path: '/project/src' });

    // Should contain elapsed time in milliseconds
    expect(response.content[0].text).toMatch(/Indexing complete in \d+ms/);
  });

  it('registers tool with correct name and schema', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'index_code',
      expect.stringContaining('Index a directory'),
      expect.objectContaining({
        path: expect.any(Object),
      }),
      expect.any(Function)
    );
  });

  it('handles non-Error exceptions', async () => {
    vi.mocked(indexDirectory).mockRejectedValue('String error message');

    const response = await capturedHandler({ path: '/project/src' });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('Indexing failed');
    expect(response.content[0].text).toContain('String error message');
  });
});
