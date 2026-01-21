/**
 * AST-Aware Code Chunker
 *
 * Walks Tree-sitter AST and extracts semantic chunks at function,
 * class, and method boundaries with proper metadata.
 */

import Parser from 'web-tree-sitter';
import { createHash } from 'crypto';
import { createParser, detectLanguage } from './parser.js';
import type { Chunk, ChunkMetadata } from '../types.js';

// Node types that represent semantic boundaries
const CHUNK_BOUNDARY_TYPES = new Set([
  'function_declaration',
  'function_expression',
  'arrow_function',
  'method_definition',
  'class_declaration',
  'class_expression',
  'export_statement',
  'lexical_declaration',  // const/let at top level
  'variable_declaration', // var at top level
]);

/**
 * Map AST node types to our symbol types.
 */
function mapNodeType(nodeType: string): ChunkMetadata['symbol_type'] {
  if (nodeType.includes('function') || nodeType === 'arrow_function') return 'function';
  if (nodeType.includes('class')) return 'class';
  if (nodeType === 'method_definition') return 'method';
  if (nodeType.includes('declaration')) return 'module';
  return 'other';
}

/**
 * Extract symbol name from AST node.
 */
function extractSymbolName(node: Parser.SyntaxNode): string {
  // Try common patterns for finding the name
  const nameNode = node.childForFieldName('name')
    || node.children.find(c => c.type === 'identifier')
    || node.children.find(c => c.type === 'property_identifier');

  if (nameNode) return nameNode.text;

  // For arrow functions assigned to variables, look at parent
  if (node.type === 'arrow_function' && node.parent?.type === 'variable_declarator') {
    const varName = node.parent.childForFieldName('name');
    if (varName) return varName.text;
  }

  return '<anonymous>';
}

/**
 * Check if node is at top level (direct child of program).
 */
function isTopLevel(node: Parser.SyntaxNode): boolean {
  return node.parent?.type === 'program' ||
         (node.parent?.type === 'export_statement' && node.parent.parent?.type === 'program');
}

export interface ChunkOptions {
  /** Max characters per chunk (split large functions) */
  maxChunkSize?: number;
  /** 0.1-0.2 for 10-20% overlap */
  overlapRatio?: number;
  /** Include import statements as context prefix */
  includeImports?: boolean;
}

const DEFAULT_OPTIONS: ChunkOptions = {
  maxChunkSize: 2000,
  overlapRatio: 0.15,
  includeImports: true,
};

/**
 * Parse source code and extract semantic chunks.
 *
 * @param sourceCode - The source code to chunk
 * @param filePath - Path to the file (used for metadata and language detection)
 * @param options - Chunking configuration options
 * @returns Array of chunks with metadata
 */
export async function chunkCode(
  sourceCode: string,
  filePath: string,
  options: ChunkOptions = {}
): Promise<Chunk[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lang = detectLanguage(filePath);

  if (!lang) {
    throw new Error(`Unsupported file type: ${filePath}`);
  }

  const parser = await createParser(lang);
  const tree = parser.parse(sourceCode);
  const fileHash = createHash('sha256').update(sourceCode).digest('hex').slice(0, 16);

  const chunks: Chunk[] = [];
  const imports: string[] = [];

  // First pass: collect imports for context
  if (opts.includeImports) {
    collectImports(tree.rootNode, imports);
  }

  // Second pass: extract semantic chunks
  walkTree(tree.rootNode, (node) => {
    if (!CHUNK_BOUNDARY_TYPES.has(node.type)) return;
    if (!isTopLevel(node) && node.type !== 'method_definition') return;

    const text = node.text;
    const symbolName = extractSymbolName(node);
    const symbolType = mapNodeType(node.type);

    // Create chunk with context prefix (imports) for overlap
    const contextPrefix = opts.includeImports && imports.length > 0
      ? imports.join('\n') + '\n\n'
      : '';

    const chunkText = contextPrefix + text;

    const chunk: Chunk = {
      id: `${fileHash}-${node.startPosition.row}-${symbolName}`,
      text: chunkText,
      metadata: {
        path: filePath,
        language: lang,
        symbol_type: symbolType,
        symbol_name: symbolName,
        start_line: node.startPosition.row,
        end_line: node.endPosition.row,
        file_hash: fileHash,
      },
    };

    // Split large chunks if needed
    if (chunkText.length > opts.maxChunkSize!) {
      chunks.push(...splitLargeChunk(chunk, opts.maxChunkSize!, opts.overlapRatio!));
    } else {
      chunks.push(chunk);
    }
  });

  return chunks;
}

/**
 * Collect import statements from AST.
 */
function collectImports(node: Parser.SyntaxNode, imports: string[]): void {
  walkTree(node, (n) => {
    if (n.type === 'import_statement' || n.type === 'import_declaration') {
      imports.push(n.text);
    }
  });
}

/**
 * Walk AST depth-first, calling callback on each node.
 */
function walkTree(node: Parser.SyntaxNode, callback: (node: Parser.SyntaxNode) => void): void {
  callback(node);
  for (const child of node.children) {
    walkTree(child, callback);
  }
}

/**
 * Split a large chunk into smaller overlapping pieces.
 */
function splitLargeChunk(chunk: Chunk, maxSize: number, overlapRatio: number): Chunk[] {
  const result: Chunk[] = [];
  const text = chunk.text;
  const overlapSize = Math.floor(maxSize * overlapRatio);

  let start = 0;
  let partIndex = 0;

  while (start < text.length) {
    const end = Math.min(start + maxSize, text.length);
    const partText = text.slice(start, end);

    result.push({
      id: `${chunk.id}-part${partIndex}`,
      text: partText,
      metadata: {
        ...chunk.metadata,
        symbol_name: `${chunk.metadata.symbol_name} (part ${partIndex + 1})`,
      },
    });

    partIndex++;
    start = end - overlapSize;

    // Avoid tiny final chunks
    if (text.length - start < maxSize * 0.3) {
      break;
    }
  }

  return result;
}
