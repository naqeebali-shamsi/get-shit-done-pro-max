/**
 * Chunking Module
 *
 * AST-based code chunking and markdown parsing.
 * Re-exports all chunking functionality.
 */

export { initParser, createParser, detectLanguage, getLanguage } from './parser.js';
export { chunkCode, type ChunkOptions } from './ast-chunker.js';
export { chunkMarkdown, type MarkdownChunkOptions } from './markdown-chunker.js';
