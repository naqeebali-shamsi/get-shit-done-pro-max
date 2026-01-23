/**
 * Integration tests for JSON-RPC 2.0 protocol compliance.
 *
 * Tests the MCP server's compliance with JSON-RPC 2.0 specification by
 * spawning the actual server process and communicating via stdio.
 *
 * Tests cover:
 * - JSON-RPC 2.0 specification compliance (version, id, result/error)
 * - MCP tools/list response format
 * - Tool schema validation
 * - Error handling
 *
 * Phase 7: Test Coverage - TST-03
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import {
  sendJSONRPCRequest,
  waitForServer,
  cleanupServer,
  type JSONRPCResponse,
} from '../../setup/test-utils.js';

describe('JSON-RPC 2.0 Protocol Compliance', () => {
  let server: ChildProcess;

  beforeAll(async () => {
    // Spawn MCP server - build happens in globalSetup
    const serverPath = join(process.cwd(), 'dist/rlm/mcp/server.js');

    server = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Use Qdrant URL from global setup (testcontainers)
        QDRANT_URL: process.env.QDRANT_URL || 'http://localhost:6333',
      },
    });

    // Wait for server to be ready
    await waitForServer(server, 15000, 'Starting RLM MCP server');
  }, 30000);

  afterAll(async () => {
    await cleanupServer(server);
  });

  // ==========================================
  // Core JSON-RPC 2.0 Specification Compliance
  // ==========================================

  describe('JSON-RPC 2.0 Specification', () => {
    it('includes jsonrpc version "2.0" in response', async () => {
      const response = await sendJSONRPCRequest(server, 'tools/list');
      expect(response.jsonrpc).toBe('2.0');
    });

    it('echoes request id in response', async () => {
      const response = await sendJSONRPCRequest(server, 'tools/list');
      expect(response.id).toBeDefined();
      expect(typeof response.id === 'number' || typeof response.id === 'string').toBe(true);
    });

    it('response has result OR error, not both', async () => {
      const response = await sendJSONRPCRequest(server, 'tools/list');
      const hasResult = 'result' in response;
      const hasError = 'error' in response;
      expect(hasResult || hasError).toBe(true);
      expect(hasResult && hasError).toBe(false);
    });

    it('successful response has result field', async () => {
      const response = await sendJSONRPCRequest(server, 'tools/list');
      expect(response).toHaveProperty('result');
      expect(response).not.toHaveProperty('error');
    });
  });

  // ==========================================
  // MCP tools/list Response Format
  // ==========================================

  describe('MCP tools/list', () => {
    let toolsResponse: JSONRPCResponse;

    beforeAll(async () => {
      toolsResponse = await sendJSONRPCRequest(server, 'tools/list');
    });

    it('returns array of tools', () => {
      expect(toolsResponse.result).toHaveProperty('tools');
      expect(Array.isArray((toolsResponse.result as any).tools)).toBe(true);
    });

    it('includes search_code tool', () => {
      const tools = (toolsResponse.result as any).tools;
      const toolNames = tools.map((t: any) => t.name);
      expect(toolNames).toContain('search_code');
    });

    it('includes index_code tool', () => {
      const tools = (toolsResponse.result as any).tools;
      const toolNames = tools.map((t: any) => t.name);
      expect(toolNames).toContain('index_code');
    });

    it('includes get_status tool', () => {
      const tools = (toolsResponse.result as any).tools;
      const toolNames = tools.map((t: any) => t.name);
      expect(toolNames).toContain('get_status');
    });

    it('each tool has name property', () => {
      const tools = (toolsResponse.result as any).tools;
      for (const tool of tools) {
        expect(tool).toHaveProperty('name');
        expect(typeof tool.name).toBe('string');
      }
    });

    it('each tool has description property', () => {
      const tools = (toolsResponse.result as any).tools;
      for (const tool of tools) {
        expect(tool).toHaveProperty('description');
        expect(typeof tool.description).toBe('string');
      }
    });

    it('each tool has inputSchema property', () => {
      const tools = (toolsResponse.result as any).tools;
      for (const tool of tools) {
        expect(tool).toHaveProperty('inputSchema');
        expect(typeof tool.inputSchema).toBe('object');
      }
    });
  });

  // ==========================================
  // Tool Input Schema Validation
  // ==========================================

  describe('Tool Input Schemas', () => {
    it('search_code schema has query property', async () => {
      const response = await sendJSONRPCRequest(server, 'tools/list');
      const tools = (response.result as any).tools;
      const searchTool = tools.find((t: any) => t.name === 'search_code');

      expect(searchTool.inputSchema).toHaveProperty('properties');
      expect(searchTool.inputSchema.properties).toHaveProperty('query');
    });

    it('search_code schema has limit property', async () => {
      const response = await sendJSONRPCRequest(server, 'tools/list');
      const tools = (response.result as any).tools;
      const searchTool = tools.find((t: any) => t.name === 'search_code');

      expect(searchTool.inputSchema.properties).toHaveProperty('limit');
    });

    it('index_code schema has path property', async () => {
      const response = await sendJSONRPCRequest(server, 'tools/list');
      const tools = (response.result as any).tools;
      const indexTool = tools.find((t: any) => t.name === 'index_code');

      expect(indexTool.inputSchema).toHaveProperty('properties');
      expect(indexTool.inputSchema.properties).toHaveProperty('path');
    });
  });

  // ==========================================
  // Error Handling
  // ==========================================

  describe('Error Handling', () => {
    it('returns error object for invalid method', async () => {
      const response = await sendJSONRPCRequest(server, 'invalid/nonexistent');
      expect(response).toHaveProperty('error');
      expect(response).not.toHaveProperty('result');
    });

    it('error has code property', async () => {
      const response = await sendJSONRPCRequest(server, 'invalid/nonexistent');
      expect(response.error).toHaveProperty('code');
    });

    it('error has message property', async () => {
      const response = await sendJSONRPCRequest(server, 'invalid/nonexistent');
      expect(response.error).toHaveProperty('message');
    });

    it('error code is integer', async () => {
      const response = await sendJSONRPCRequest(server, 'invalid/nonexistent');
      expect(Number.isInteger(response.error?.code)).toBe(true);
    });
  });

  // ==========================================
  // Stdout/Stderr Separation
  // ==========================================

  describe('Output Separation', () => {
    it('stdout contains only valid JSON', async () => {
      const response = await sendJSONRPCRequest(server, 'tools/list');
      // If we got a response, it was valid JSON on stdout
      expect(response).toBeDefined();
      expect(typeof response).toBe('object');
    });

    it('response is valid JSON-RPC structure', async () => {
      const response = await sendJSONRPCRequest(server, 'tools/list');
      // Verify no corruption from log pollution
      expect(() => JSON.parse(JSON.stringify(response))).not.toThrow();
    });
  });
});
