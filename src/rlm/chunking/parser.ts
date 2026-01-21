/**
 * Tree-sitter Parser Wrapper
 *
 * Provides async initialization and language loading for Tree-sitter WASM.
 * Supports JavaScript and TypeScript parsing with grammar caching.
 */

import Parser from 'web-tree-sitter';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GRAMMARS_DIR = join(__dirname, 'grammars');

let initialized = false;
const languageCache = new Map<string, Parser.Language>();

/**
 * Initialize the Tree-sitter WASM runtime.
 * Must be called before any parsing operations.
 */
export async function initParser(): Promise<void> {
  if (initialized) return;
  await Parser.init();
  initialized = true;
}

/**
 * Load a language grammar, using cache if available.
 */
export async function getLanguage(lang: 'javascript' | 'typescript'): Promise<Parser.Language> {
  if (!initialized) {
    await initParser();
  }

  const cached = languageCache.get(lang);
  if (cached) return cached;

  const wasmFile = lang === 'javascript'
    ? 'tree-sitter-javascript.wasm'
    : 'tree-sitter-typescript.wasm';

  const wasmPath = join(GRAMMARS_DIR, wasmFile);
  const language = await Parser.Language.load(wasmPath);
  languageCache.set(lang, language);

  return language;
}

/**
 * Create a parser configured for the specified language.
 */
export async function createParser(lang: 'javascript' | 'typescript'): Promise<Parser> {
  const parser = new Parser();
  const language = await getLanguage(lang);
  parser.setLanguage(language);
  return parser;
}

/**
 * Detect language from file extension.
 * Returns null for unsupported file types.
 */
export function detectLanguage(filePath: string): 'javascript' | 'typescript' | null {
  const ext = filePath.toLowerCase().split('.').pop();
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') return 'javascript';
  if (ext === 'ts' || ext === 'tsx' || ext === 'mts' || ext === 'cts') return 'typescript';
  return null;
}
