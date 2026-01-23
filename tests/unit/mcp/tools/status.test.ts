/**
 * Unit tests for get_status MCP tool
 *
 * Tests the get_status tool handler covering:
 * - Connected status when Qdrant available
 * - Disconnected status handling
 * - Chunk count display
 * - Action suggestions based on system state
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock dependencies before importing the module
vi.mock('../../../../src/rlm/storage/index.js', () => ({
  createQdrantClient: vi.fn(),
  getCollectionInfo: vi.fn(),
}));

vi.mock('../../../../src/rlm/mcp/logger.js', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

import { registerStatusTool } from '../../../../src/rlm/mcp/tools/status.js';
import { createQdrantClient, getCollectionInfo } from '../../../../src/rlm/storage/index.js';

describe('get_status tool', () => {
  let mockServer: McpServer;
  let capturedHandler: () => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
  let mockClient: { getCollections: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock server that captures the handler
    mockServer = {
      tool: vi.fn((name, description, schema, handler) => {
        capturedHandler = handler;
      }),
    } as unknown as McpServer;

    // Register the tool to capture the handler
    registerStatusTool(mockServer);

    // Setup mock client
    mockClient = {
      getCollections: vi.fn(),
    };
    vi.mocked(createQdrantClient).mockResolvedValue(mockClient as any);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns connected status when Qdrant available', async () => {
    mockClient.getCollections.mockResolvedValue({ collections: [] });
    vi.mocked(getCollectionInfo).mockResolvedValue({ points_count: 100 });

    const response = await capturedHandler();

    expect(response.content[0].text).toContain('**Qdrant:** connected');
    expect(response.isError).toBeUndefined();
  });

  it('returns disconnected status when Qdrant unavailable', async () => {
    mockClient.getCollections.mockRejectedValue(new Error('Connection refused'));
    vi.mocked(getCollectionInfo).mockResolvedValue(null);

    const response = await capturedHandler();

    expect(response.content[0].text).toContain('**Qdrant:** disconnected');
  });

  it('returns chunk count from collection info', async () => {
    mockClient.getCollections.mockResolvedValue({ collections: [] });
    vi.mocked(getCollectionInfo).mockResolvedValue({ points_count: 1500 });

    const response = await capturedHandler();

    expect(response.content[0].text).toContain('**Chunks indexed:** 1500');
  });

  it('suggests starting Qdrant when disconnected', async () => {
    mockClient.getCollections.mockRejectedValue(new Error('Connection refused'));
    vi.mocked(getCollectionInfo).mockResolvedValue(null);

    const response = await capturedHandler();

    expect(response.content[0].text).toContain('**Action needed:**');
    expect(response.content[0].text).toContain('Start Qdrant');
    expect(response.content[0].text).toContain('docker run');
  });

  it('suggests indexing when chunks count is 0', async () => {
    mockClient.getCollections.mockResolvedValue({ collections: [] });
    vi.mocked(getCollectionInfo).mockResolvedValue({ points_count: 0 });

    const response = await capturedHandler();

    expect(response.content[0].text).toContain('**Chunks indexed:** 0');
    expect(response.content[0].text).toContain('**Action needed:**');
    expect(response.content[0].text).toContain('Index your codebase');
    expect(response.content[0].text).toContain('index_code');
  });

  it('returns error on complete failure', async () => {
    vi.mocked(createQdrantClient).mockRejectedValue(new Error('Failed to create client'));

    const response = await capturedHandler();

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('Status check failed');
    expect(response.content[0].text).toContain('Failed to create client');
  });

  it('shows collection status as not found when no collection info', async () => {
    mockClient.getCollections.mockResolvedValue({ collections: [] });
    vi.mocked(getCollectionInfo).mockResolvedValue(null);

    const response = await capturedHandler();

    expect(response.content[0].text).toContain('**Collection:** not found');
    expect(response.content[0].text).toContain('**Chunks indexed:** 0');
  });

  it('shows collection status as exists when info available', async () => {
    mockClient.getCollections.mockResolvedValue({ collections: [] });
    vi.mocked(getCollectionInfo).mockResolvedValue({ points_count: 50 });

    const response = await capturedHandler();

    expect(response.content[0].text).toContain('**Collection:** exists');
  });

  it('registers tool with correct name and empty schema', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'get_status',
      expect.stringContaining('Check the status'),
      {}, // Empty schema for no parameters
      expect.any(Function)
    );
  });
});
