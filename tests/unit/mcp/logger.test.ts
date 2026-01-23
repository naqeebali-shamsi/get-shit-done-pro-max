/**
 * Unit tests for MCP stderr logger
 *
 * Tests the logger module covering:
 * - JSON format output to stderr
 * - Timestamp, level, and message inclusion
 * - Data object inclusion when provided
 * - All log level functions (info, warn, error)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log, logInfo, logError, logWarn } from '../../../src/rlm/mcp/logger.js';

describe('MCP Logger', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let capturedOutput: string;

  beforeEach(() => {
    capturedOutput = '';
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      capturedOutput += chunk.toString();
      return true;
    });
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  describe('log()', () => {
    it('writes JSON to stderr', () => {
      log('info', 'test message');

      expect(stderrSpy).toHaveBeenCalled();
      expect(() => JSON.parse(capturedOutput.trim())).not.toThrow();
    });

    it('log entry includes timestamp, level, message', () => {
      log('info', 'test message');

      const entry = JSON.parse(capturedOutput.trim());
      expect(entry).toHaveProperty('timestamp');
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('test message');
      // Verify timestamp is ISO format
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('log entry includes data when provided', () => {
      log('info', 'test message', { key: 'value', count: 42 });

      const entry = JSON.parse(capturedOutput.trim());
      expect(entry.data).toEqual({ key: 'value', count: 42 });
    });

    it('log entry excludes data when not provided', () => {
      log('info', 'test message');

      const entry = JSON.parse(capturedOutput.trim());
      expect(entry).not.toHaveProperty('data');
    });

    it('appends newline after JSON', () => {
      log('info', 'test message');

      expect(capturedOutput.endsWith('\n')).toBe(true);
    });
  });

  describe('logInfo()', () => {
    it('uses info level', () => {
      logInfo('info message');

      const entry = JSON.parse(capturedOutput.trim());
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('info message');
    });

    it('passes data to log', () => {
      logInfo('info message', { detail: 'value' });

      const entry = JSON.parse(capturedOutput.trim());
      expect(entry.data).toEqual({ detail: 'value' });
    });
  });

  describe('logError()', () => {
    it('uses error level', () => {
      logError('error message');

      const entry = JSON.parse(capturedOutput.trim());
      expect(entry.level).toBe('error');
      expect(entry.message).toBe('error message');
    });

    it('passes data to log', () => {
      logError('error message', { code: 'E001', details: 'Something failed' });

      const entry = JSON.parse(capturedOutput.trim());
      expect(entry.data).toEqual({ code: 'E001', details: 'Something failed' });
    });
  });

  describe('logWarn()', () => {
    it('uses warn level', () => {
      logWarn('warning message');

      const entry = JSON.parse(capturedOutput.trim());
      expect(entry.level).toBe('warn');
      expect(entry.message).toBe('warning message');
    });

    it('passes data to log', () => {
      logWarn('warning message', { threshold: 100 });

      const entry = JSON.parse(capturedOutput.trim());
      expect(entry.data).toEqual({ threshold: 100 });
    });
  });

  describe('stderr-only verification', () => {
    let stdoutSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      stdoutSpy.mockRestore();
    });

    it('never writes to stdout', () => {
      logInfo('info');
      logWarn('warn');
      logError('error');

      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(stderrSpy).toHaveBeenCalledTimes(3);
    });
  });
});
