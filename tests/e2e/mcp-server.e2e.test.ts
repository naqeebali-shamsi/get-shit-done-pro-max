/**
 * End-to-End tests for MCP Server full workflow.
 *
 * Spawns an actual MCP server process and tests the complete
 * index -> search -> verify workflow via stdio communication.
 *
 * These tests require:
 * - Docker running (for Qdrant via testcontainers)
 * - Built dist/ directory (handled by globalSetup)
 *
 * Phase 7: Test Coverage - TST-04
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { decode } from '@toon-format/toon';
import {
  sendJSONRPCRequest,
  waitForServer,
  cleanupServer,
  parseToolResult,
  extractTextContent,
} from '../setup/test-utils.js';

describe('MCP Server E2E', () => {
  let server: ChildProcess;
  let tempDir: string;
  const testCollectionName = `rlm_e2e_${Date.now()}`;

  beforeAll(async () => {
    // Create temp directory with test source files
    tempDir = mkdtempSync(join(tmpdir(), 'rlm-e2e-'));

    // Create a subdirectory to simulate a real project structure
    const srcDir = join(tempDir, 'src');
    mkdirSync(srcDir, { recursive: true });

    // Write test fixtures - realistic code files for indexing
    writeFileSync(
      join(srcDir, 'calculator.ts'),
      `/**
 * Calculator module with basic arithmetic operations.
 */

/**
 * Adds two numbers together.
 * @param a - First operand
 * @param b - Second operand
 * @returns The sum of a and b
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Subtracts the second number from the first.
 * @param a - First operand
 * @param b - Second operand
 * @returns The difference (a - b)
 */
export function subtract(a: number, b: number): number {
  return a - b;
}

/**
 * Multiplies two numbers.
 * @param a - First operand
 * @param b - Second operand
 * @returns The product of a and b
 */
export function multiply(a: number, b: number): number {
  return a * b;
}

/**
 * Divides the first number by the second.
 * @param a - Dividend
 * @param b - Divisor
 * @returns The quotient (a / b)
 * @throws Error if b is zero
 */
export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Division by zero');
  }
  return a / b;
}
`
    );

    writeFileSync(
      join(srcDir, 'utils.ts'),
      `/**
 * Utility functions for data processing.
 */

/**
 * Formats a number as currency.
 * @param amount - The amount to format
 * @param currency - Currency code (default: USD)
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Validates an email address.
 * @param email - The email to validate
 * @returns True if valid, false otherwise
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generates a unique identifier.
 * @returns A UUID-like string
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
`
    );

    // Spawn MCP server
    const serverPath = join(process.cwd(), 'dist/rlm/mcp/server.js');

    server = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Use testcontainers Qdrant URL
        QDRANT_URL: process.env.QDRANT_URL || 'http://localhost:6333',
        // Use unique collection to avoid test pollution
        RLM_COLLECTION: testCollectionName,
      },
    });

    // Wait for server to be ready
    await waitForServer(server, 15000, 'Starting RLM MCP server');
  }, 60000); // 60s timeout for setup

  afterAll(async () => {
    // Cleanup server
    await cleanupServer(server);

    // Cleanup temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }, 10000);

  // ==========================================
  // get_status tool
  // ==========================================

  describe('get_status tool', () => {
    it('returns system status information', async () => {
      const response = await sendJSONRPCRequest(server, 'tools/call', {
        name: 'get_status',
        arguments: {},
      });

      expect(response).toHaveProperty('result');
      expect(response).not.toHaveProperty('error');

      const result = parseToolResult(response);
      expect(result).not.toBeNull();
      expect(result!.content).toHaveLength(1);

      const text = extractTextContent(result!);
      expect(text).toContain('RLM System Status');
    });

    it('includes connection status', async () => {
      const response = await sendJSONRPCRequest(server, 'tools/call', {
        name: 'get_status',
        arguments: {},
      });

      const result = parseToolResult(response);
      const text = extractTextContent(result!);

      // Should show either connected or disconnected
      expect(text.toLowerCase()).toMatch(/connected|disconnected/);
    });
  });

  // ==========================================
  // index_code tool
  // ==========================================

  describe('index_code tool', () => {
    it('indexes a directory and reports results', async () => {
      const response = await sendJSONRPCRequest(
        server,
        'tools/call',
        {
          name: 'index_code',
          arguments: { path: tempDir },
        },
        60000 // 60s timeout for indexing
      );

      expect(response).toHaveProperty('result');
      expect(response).not.toHaveProperty('error');

      const result = parseToolResult(response);
      expect(result).not.toBeNull();

      const text = extractTextContent(result!);
      expect(text).toContain('Indexing complete');
    }, 90000);

    it('reports number of files indexed', async () => {
      const response = await sendJSONRPCRequest(
        server,
        'tools/call',
        {
          name: 'index_code',
          arguments: { path: tempDir },
        },
        60000
      );

      const result = parseToolResult(response);
      const text = extractTextContent(result!);

      // Should mention files indexed
      expect(text).toMatch(/files?\s*(indexed|processed)/i);
    }, 90000);

    it('handles non-existent directory gracefully', async () => {
      const response = await sendJSONRPCRequest(
        server,
        'tools/call',
        {
          name: 'index_code',
          arguments: { path: '/nonexistent/path/12345' },
        },
        10000
      );

      // Should not crash - either returns error or reports 0 files indexed
      expect(response).toHaveProperty('result');
      const result = parseToolResult(response);
      expect(result).not.toBeNull();

      const text = extractTextContent(result!);
      // Either an error message OR indexing complete with 0 files
      expect(text.toLowerCase()).toMatch(/error|failed|files indexed: 0|indexing complete/);
    });
  });

  // ==========================================
  // search_code tool
  // ==========================================

  describe('search_code tool', () => {
    beforeAll(async () => {
      // Ensure directory is indexed before search tests
      await sendJSONRPCRequest(
        server,
        'tools/call',
        {
          name: 'index_code',
          arguments: { path: tempDir },
        },
        60000
      );
    }, 90000);

    it('returns TOON-formatted results', async () => {
      const response = await sendJSONRPCRequest(
        server,
        'tools/call',
        {
          name: 'search_code',
          arguments: { query: 'add numbers', limit: 5 },
        },
        30000
      );

      expect(response).toHaveProperty('result');
      expect(response).not.toHaveProperty('error');

      const result = parseToolResult(response);
      expect(result).not.toBeNull();

      const text = extractTextContent(result!);

      // Should be valid TOON that can be decoded
      const decoded = decode(text);
      expect(decoded).toBeDefined();
      expect(decoded).toHaveProperty('results');
    }, 60000);

    it('TOON results have required fields', async () => {
      const response = await sendJSONRPCRequest(
        server,
        'tools/call',
        {
          name: 'search_code',
          arguments: { query: 'function', limit: 5 },
        },
        30000
      );

      const result = parseToolResult(response);
      const text = extractTextContent(result!);
      const decoded = decode(text) as {
        results: Array<{
          file: string;
          lines: string;
          relevance: number;
          code: string;
        }>;
      };

      expect(Array.isArray(decoded.results)).toBe(true);

      // Each result should have required TOON fields
      for (const item of decoded.results) {
        expect(item).toHaveProperty('file');
        expect(item).toHaveProperty('lines');
        expect(item).toHaveProperty('relevance');
        expect(item).toHaveProperty('code');
        expect(typeof item.relevance).toBe('number');
        expect(typeof item.file).toBe('string');
        expect(typeof item.code).toBe('string');
      }
    }, 60000);

    it('respects limit parameter', async () => {
      const response = await sendJSONRPCRequest(
        server,
        'tools/call',
        {
          name: 'search_code',
          arguments: { query: 'function', limit: 2 },
        },
        30000
      );

      const result = parseToolResult(response);
      const text = extractTextContent(result!);
      const decoded = decode(text) as { results: Array<unknown> };

      expect(decoded.results.length).toBeLessThanOrEqual(2);
    }, 60000);

    it('handles empty results gracefully', async () => {
      const response = await sendJSONRPCRequest(
        server,
        'tools/call',
        {
          name: 'search_code',
          arguments: { query: 'zzzznonexistentqueryzzzz12345', limit: 5 },
        },
        30000
      );

      // Should not error, just return empty or low results
      expect(response).toHaveProperty('result');
      expect(response).not.toHaveProperty('error');
    }, 60000);
  });

  // ==========================================
  // Full Workflow: Index -> Search -> Verify
  // ==========================================

  describe('full workflow', () => {
    it('completes index -> search -> verify cycle', async () => {
      // Step 1: Index the temp directory
      const indexResponse = await sendJSONRPCRequest(
        server,
        'tools/call',
        {
          name: 'index_code',
          arguments: { path: tempDir },
        },
        60000
      );

      expect(indexResponse).toHaveProperty('result');
      const indexResult = parseToolResult(indexResponse);
      expect(extractTextContent(indexResult!)).toContain('Indexing complete');

      // Step 2: Search for arithmetic operations (more semantic query)
      const searchResponse = await sendJSONRPCRequest(
        server,
        'tools/call',
        {
          name: 'search_code',
          arguments: { query: 'arithmetic calculation function', limit: 5 },
        },
        30000
      );

      expect(searchResponse).toHaveProperty('result');
      const searchResult = parseToolResult(searchResponse);
      const decoded = decode(extractTextContent(searchResult!)) as {
        results: Array<{ file: string; code: string }>;
      };

      // Step 3: Verify results contain expected code
      // Should return at least some results from our test files
      expect(decoded.results.length).toBeGreaterThan(0);

      // Verify at least one result is from the calculator file
      const hasCalculatorCode = decoded.results.some(
        (r) =>
          r.file.includes('calculator') ||
          r.code.includes('add') ||
          r.code.includes('subtract') ||
          r.code.includes('multiply') ||
          r.code.includes('divide') ||
          r.code.includes('return a')
      );
      expect(hasCalculatorCode).toBe(true);
    }, 120000);

    it('finds utilities by semantic search', async () => {
      const response = await sendJSONRPCRequest(
        server,
        'tools/call',
        {
          name: 'search_code',
          arguments: { query: 'validate email address format', limit: 5 },
        },
        30000
      );

      const result = parseToolResult(response);
      const decoded = decode(extractTextContent(result!)) as {
        results: Array<{ file: string; code: string }>;
      };

      // Should find the validateEmail function
      const hasEmailValidation = decoded.results.some(
        (r) => r.code.includes('validateEmail') || r.code.includes('emailRegex')
      );
      expect(hasEmailValidation).toBe(true);
    }, 60000);

    it('search results include file paths', async () => {
      const response = await sendJSONRPCRequest(
        server,
        'tools/call',
        {
          name: 'search_code',
          arguments: { query: 'currency format', limit: 5 },
        },
        30000
      );

      const result = parseToolResult(response);
      const decoded = decode(extractTextContent(result!)) as {
        results: Array<{ file: string }>;
      };

      // All results should have file paths
      for (const item of decoded.results) {
        expect(item.file).toBeDefined();
        expect(item.file.length).toBeGreaterThan(0);
        // Path should be absolute or relative
        expect(item.file).toMatch(/\.(ts|js)$/);
      }
    }, 60000);
  });

  // ==========================================
  // Protocol Compliance in E2E Context
  // ==========================================

  describe('protocol compliance', () => {
    it('all responses are valid JSON-RPC 2.0', async () => {
      const responses = await Promise.all([
        sendJSONRPCRequest(server, 'tools/call', {
          name: 'get_status',
          arguments: {},
        }),
        sendJSONRPCRequest(server, 'tools/list'),
      ]);

      for (const response of responses) {
        expect(response.jsonrpc).toBe('2.0');
        expect(response.id).toBeDefined();
      }
    });

    it('tool results follow MCP content structure', async () => {
      const response = await sendJSONRPCRequest(server, 'tools/call', {
        name: 'get_status',
        arguments: {},
      });

      const result = parseToolResult(response);
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result!.content)).toBe(true);

      for (const item of result!.content) {
        expect(item).toHaveProperty('type');
        expect(item).toHaveProperty('text');
      }
    });
  });
});
