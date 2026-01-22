/**
 * MCP Server Module
 *
 * Exposes RLM capabilities via Model Context Protocol.
 */

export { main } from './server.js';
export { log, logInfo, logError, logWarn } from './logger.js';
export { formatSearchResultsTOON, formatSearchResultsMarkdown } from './formatters/toon-formatter.js';
