/**
 * Shared test utilities for MCP server testing.
 * Provides helpers for JSON-RPC communication and test setup.
 */

import type { ChildProcess } from 'child_process';
import type { MockQdrantClient } from '../fixtures/mocks/qdrant-mock.js';

/**
 * JSON-RPC 2.0 request structure
 */
export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 response structure
 */
export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * MCP tool result structure
 */
export interface MCPToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Send a JSON-RPC request to an MCP server process and wait for response.
 *
 * @param server - Child process running the MCP server
 * @param method - JSON-RPC method name
 * @param params - Method parameters
 * @param timeout - Response timeout in milliseconds (default: 5000)
 * @returns Promise resolving to the JSON-RPC response
 */
export async function sendJSONRPCRequest(
  server: ChildProcess,
  method: string,
  params: Record<string, unknown> = {},
  timeout = 5000
): Promise<JSONRPCResponse> {
  return new Promise((resolve, reject) => {
    const requestId = Date.now();
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    };

    const timeoutId = setTimeout(() => {
      reject(new Error(`Request timed out after ${timeout}ms: ${method}`));
    }, timeout);

    const responseHandler = (data: Buffer) => {
      try {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          const response = JSON.parse(line) as JSONRPCResponse;
          if (response.id === requestId) {
            clearTimeout(timeoutId);
            server.stdout?.off('data', responseHandler);
            resolve(response);
            return;
          }
        }
      } catch {
        // Not a valid JSON response yet, continue listening
      }
    };

    server.stdout?.on('data', responseHandler);

    // Send request
    server.stdin?.write(JSON.stringify(request) + '\n');
  });
}

/**
 * Create a test collection with default configuration.
 *
 * @param client - Mock Qdrant client
 * @param name - Collection name
 * @param vectorSize - Vector dimension size (default: 768)
 */
export async function createTestCollection(
  client: MockQdrantClient,
  name: string,
  vectorSize = 768
): Promise<void> {
  await client.createCollection(name, {
    vectors: {
      size: vectorSize,
      distance: 'Cosine',
    },
  });
}

/**
 * Wait for server to be ready by checking for initial output.
 *
 * @param server - Child process to wait for
 * @param timeout - Maximum wait time in milliseconds (default: 10000)
 * @param readyIndicator - String to watch for indicating readiness (optional)
 */
export async function waitForServer(
  server: ChildProcess,
  timeout = 10000,
  readyIndicator?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Server did not start within ${timeout}ms`));
    }, timeout);

    // Listen to stderr for server ready indication
    const stderrHandler = (data: Buffer) => {
      const output = data.toString();
      if (readyIndicator) {
        if (output.includes(readyIndicator)) {
          clearTimeout(timeoutId);
          server.stderr?.off('data', stderrHandler);
          resolve();
        }
      } else {
        // Any stderr output indicates server started
        clearTimeout(timeoutId);
        server.stderr?.off('data', stderrHandler);
        resolve();
      }
    };

    server.stderr?.on('data', stderrHandler);

    // Also resolve if stdout gets data (server is responding)
    const stdoutHandler = () => {
      clearTimeout(timeoutId);
      server.stdout?.off('data', stdoutHandler);
      server.stderr?.off('data', stderrHandler);
      resolve();
    };

    server.stdout?.once('data', stdoutHandler);
  });
}

/**
 * Generate a unique test collection name.
 * Useful for test isolation.
 *
 * @param prefix - Optional prefix for the collection name
 * @returns Unique collection name
 */
export function generateTestCollectionName(prefix = 'test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Clean up test artifacts.
 * Kills server process and cleans up resources.
 *
 * @param server - Server process to clean up
 */
export async function cleanupServer(server: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (server.killed) {
      resolve();
      return;
    }

    server.once('exit', () => resolve());
    server.kill('SIGTERM');

    // Force kill after timeout
    setTimeout(() => {
      if (!server.killed) {
        server.kill('SIGKILL');
      }
      resolve();
    }, 1000);
  });
}

/**
 * Parse MCP tool result from JSON-RPC response.
 *
 * @param response - JSON-RPC response
 * @returns Parsed tool result or null if error
 */
export function parseToolResult(response: JSONRPCResponse): MCPToolResult | null {
  if (response.error) {
    return null;
  }
  return response.result as MCPToolResult;
}

/**
 * Extract text content from MCP tool result.
 *
 * @param result - MCP tool result
 * @returns Combined text content
 */
export function extractTextContent(result: MCPToolResult): string {
  return result.content
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');
}
