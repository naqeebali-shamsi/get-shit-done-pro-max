/**
 * Stderr-only logging for MCP server.
 * CRITICAL: stdout is reserved for JSON-RPC protocol.
 * Any non-JSON-RPC output to stdout will break the protocol.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
}

export function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(data && { data }),
  };
  process.stderr.write(JSON.stringify(entry) + '\n');
}

export function logInfo(message: string, data?: Record<string, unknown>): void {
  log('info', message, data);
}

export function logError(message: string, data?: Record<string, unknown>): void {
  log('error', message, data);
}

export function logWarn(message: string, data?: Record<string, unknown>): void {
  log('warn', message, data);
}
