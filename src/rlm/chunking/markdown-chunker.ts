/**
 * Markdown Chunker
 *
 * Splits markdown documents by headers and semantic paragraphs.
 * Preserves section structure and provides proper metadata for retrieval.
 */

import { createHash } from 'crypto';
import type { Chunk, ChunkMetadata } from '../types.js';

export interface MarkdownChunkOptions {
  maxChunkSize?: number;      // Max characters per chunk
  minChunkSize?: number;      // Min characters (avoid tiny chunks)
  overlapRatio?: number;      // 0.1-0.2 for context overlap
  splitOnParagraphs?: boolean; // Split within sections if too large
}

const DEFAULT_OPTIONS: MarkdownChunkOptions = {
  maxChunkSize: 1500,
  minChunkSize: 100,
  overlapRatio: 0.15,
  splitOnParagraphs: true,
};

interface Section {
  title: string;
  level: number;
  content: string;
  startLine: number;
  endLine: number;
}

/**
 * Chunk markdown content by headers and semantic paragraphs.
 *
 * @param content - The markdown content to chunk
 * @param filePath - Path to the source file
 * @param options - Chunking options
 * @returns Array of chunks with metadata
 */
export function chunkMarkdown(
  content: string,
  filePath: string,
  options: MarkdownChunkOptions = {}
): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const fileHash = createHash('sha256').update(content).digest('hex').slice(0, 16);
  const lines = content.split('\n');

  // Parse into sections by headers
  const sections = parseMarkdownSections(lines);

  const chunks: Chunk[] = [];

  for (const section of sections) {
    const sectionChunks = createSectionChunks(section, filePath, fileHash, opts);
    chunks.push(...sectionChunks);
  }

  return chunks;
}

function parseMarkdownSections(lines: string[]): Section[] {
  const sections: Section[] = [];
  let currentSection: Section | null = null;
  let contentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headerMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.content = contentLines.join('\n').trim();
        currentSection.endLine = i - 1;
        if (currentSection.content.length > 0) {
          sections.push(currentSection);
        }
      }

      // Start new section
      currentSection = {
        title: headerMatch[2].trim(),
        level: headerMatch[1].length,
        content: '',
        startLine: i,
        endLine: i,
      };
      contentLines = [];
    } else if (currentSection) {
      contentLines.push(line);
    } else {
      // Content before first header - create implicit section
      if (line.trim()) {
        currentSection = {
          title: '(document start)',
          level: 0,
          content: '',
          startLine: 0,
          endLine: 0,
        };
        contentLines.push(line);
      }
    }
  }

  // Save last section
  if (currentSection) {
    currentSection.content = contentLines.join('\n').trim();
    currentSection.endLine = lines.length - 1;
    if (currentSection.content.length > 0) {
      sections.push(currentSection);
    }
  }

  return sections;
}

function createSectionChunks(
  section: Section,
  filePath: string,
  fileHash: string,
  opts: Required<MarkdownChunkOptions>
): Chunk[] {
  const baseMetadata: Omit<ChunkMetadata, 'start_line' | 'end_line'> = {
    path: filePath,
    language: 'markdown',
    symbol_type: 'markdown',
    symbol_name: section.title,
    file_hash: fileHash,
  };

  // Include header in chunk text
  const headerPrefix = section.level > 0
    ? '#'.repeat(section.level) + ' ' + section.title + '\n\n'
    : '';

  const fullText = headerPrefix + section.content;

  // If section fits in one chunk, return it
  if (fullText.length <= opts.maxChunkSize) {
    return [{
      id: `${fileHash}-${section.startLine}-${slugify(section.title)}`,
      text: fullText,
      metadata: {
        ...baseMetadata,
        start_line: section.startLine,
        end_line: section.endLine,
      },
    }];
  }

  // Split large sections by paragraphs
  if (opts.splitOnParagraphs) {
    return splitByParagraphs(
      section,
      headerPrefix,
      filePath,
      fileHash,
      opts
    );
  }

  // Fallback: split by character with overlap
  return splitBySize(fullText, section, filePath, fileHash, opts);
}

function splitByParagraphs(
  section: Section,
  headerPrefix: string,
  filePath: string,
  fileHash: string,
  opts: Required<MarkdownChunkOptions>
): Chunk[] {
  const chunks: Chunk[] = [];
  const paragraphs = section.content.split(/\n\n+/);
  let currentText = headerPrefix;
  let currentStartLine = section.startLine;
  let lineOffset = 0;
  let partIndex = 0;

  for (const para of paragraphs) {
    const paraWithSeparator = para + '\n\n';
    const paraLines = para.split('\n').length;

    // Would adding this paragraph exceed max size?
    if (currentText.length + paraWithSeparator.length > opts.maxChunkSize && currentText.length > opts.minChunkSize) {
      // Save current chunk
      chunks.push({
        id: `${fileHash}-${section.startLine}-${slugify(section.title)}-p${partIndex}`,
        text: currentText.trim(),
        metadata: {
          path: filePath,
          language: 'markdown',
          symbol_type: 'markdown',
          symbol_name: partIndex === 0 ? section.title : `${section.title} (cont.)`,
          file_hash: fileHash,
          start_line: currentStartLine,
          end_line: currentStartLine + lineOffset,
        },
      });

      partIndex++;
      // Start new chunk with header for context (overlap)
      currentText = headerPrefix + para + '\n\n';
      currentStartLine = section.startLine + lineOffset;
      lineOffset = paraLines;
    } else {
      currentText += paraWithSeparator;
      lineOffset += paraLines + 1; // +1 for blank line
    }
  }

  // Save final chunk
  if (currentText.trim().length > opts.minChunkSize) {
    chunks.push({
      id: `${fileHash}-${section.startLine}-${slugify(section.title)}-p${partIndex}`,
      text: currentText.trim(),
      metadata: {
        path: filePath,
        language: 'markdown',
        symbol_type: 'markdown',
        symbol_name: partIndex === 0 ? section.title : `${section.title} (cont.)`,
        file_hash: fileHash,
        start_line: currentStartLine,
        end_line: section.endLine,
      },
    });
  }

  return chunks;
}

function splitBySize(
  text: string,
  section: Section,
  filePath: string,
  fileHash: string,
  opts: Required<MarkdownChunkOptions>
): Chunk[] {
  const chunks: Chunk[] = [];
  const maxSize = opts.maxChunkSize;
  const overlapSize = Math.floor(maxSize * opts.overlapRatio);

  let start = 0;
  let partIndex = 0;

  while (start < text.length) {
    const end = Math.min(start + maxSize, text.length);
    const chunkText = text.slice(start, end);

    chunks.push({
      id: `${fileHash}-${section.startLine}-${slugify(section.title)}-c${partIndex}`,
      text: chunkText,
      metadata: {
        path: filePath,
        language: 'markdown',
        symbol_type: 'markdown',
        symbol_name: `${section.title} (part ${partIndex + 1})`,
        file_hash: fileHash,
        start_line: section.startLine,
        end_line: section.endLine,
      },
    });

    partIndex++;
    start = end - overlapSize;

    // Avoid tiny final chunks
    if (text.length - start < maxSize * 0.3) break;
  }

  return chunks;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}
