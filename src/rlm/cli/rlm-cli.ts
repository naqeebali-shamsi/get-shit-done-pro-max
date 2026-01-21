#!/usr/bin/env node
/**
 * RLM CLI - Standalone tool for indexing and querying codebases
 *
 * Commands:
 * - index [path]  : Index a directory (default: current directory)
 * - query <text>  : Search for relevant code chunks
 * - status        : Check Qdrant connection and collection status
 *
 * Phase 4: GSD Integration (04-02)
 */

import { resolve } from 'path';
import { createQdrantClient, getCollectionInfo } from '../storage/index.js';
import { indexDirectory } from '../indexing/index.js';
import { quickRetrieve } from '../integration/index.js';
import { formatChunksAsContext } from '../integration/index.js';

const COLLECTION_NAME = 'rlm_chunks';

function printUsage(): void {
  console.log(`
RLM CLI - Retrieval-augmented Language Model tools

Usage: rlm <command> [options]

Commands:
  index [path]    Index a directory (default: current directory)
  query <text>    Search for relevant code chunks
  status          Check Qdrant connection and collection status

Examples:
  rlm index .
  rlm index ./src
  rlm query "how does authentication work"
  rlm status
`);
}

async function runIndex(targetPath: string): Promise<void> {
  const absolutePath = resolve(targetPath);
  console.log(`Indexing ${absolutePath}...`);

  const startTime = Date.now();

  try {
    const client = await createQdrantClient();
    const result = await indexDirectory(client, COLLECTION_NAME, absolutePath);
    const elapsed = Date.now() - startTime;

    console.log(`Indexed ${result.indexed} chunks in ${elapsed}ms`);

    if (result.skipped > 0) {
      console.log(`Skipped ${result.skipped} unchanged files`);
    }

    if (result.errors.length > 0) {
      console.error(`\nErrors (${result.errors.length}):`);
      for (const error of result.errors.slice(0, 5)) {
        console.error(`  - ${error}`);
      }
      if (result.errors.length > 5) {
        console.error(`  ... and ${result.errors.length - 5} more`);
      }
    }
  } catch (e) {
    const error = e as Error;
    console.error(`Failed to index: ${error.message}`);
    process.exit(1);
  }
}

async function runQuery(queryText: string): Promise<void> {
  // Set collection name via env for quickRetrieve
  process.env.RLM_COLLECTION = COLLECTION_NAME;

  try {
    const chunks = await quickRetrieve(queryText, {
      limit: 10,
    });

    if (chunks.length === 0) {
      console.log('No relevant chunks found');
      return;
    }

    const context = formatChunksAsContext(chunks, undefined, {
      maxChunks: 10,
      includeConfidence: true,
    });

    console.log(context);
  } catch (e) {
    const error = e as Error;
    console.error(`Query failed: ${error.message}`);
    process.exit(1);
  }
}

async function runStatus(): Promise<void> {
  try {
    const client = await createQdrantClient();

    // Check if Qdrant is reachable
    let connected = false;
    try {
      await client.getCollections();
      connected = true;
    } catch {
      connected = false;
    }

    console.log(`Qdrant: ${connected ? 'connected' : 'disconnected'}`);

    if (!connected) {
      console.log('Collection: unknown (not connected)');
      console.log('Chunks indexed: unknown');
      return;
    }

    // Check collection
    const info = await getCollectionInfo(client, COLLECTION_NAME);

    if (info) {
      console.log(`Collection: exists (${COLLECTION_NAME})`);
      console.log(`Chunks indexed: ${info.points_count}`);
    } else {
      console.log(`Collection: not found (${COLLECTION_NAME})`);
      console.log('Chunks indexed: 0');
    }
  } catch (e) {
    const error = e as Error;
    console.error(`Status check failed: ${error.message}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  const command = args[0];

  try {
    switch (command) {
      case 'index': {
        const targetPath = args[1] || '.';
        await runIndex(targetPath);
        break;
      }

      case 'query': {
        if (!args[1]) {
          console.error('Error: query requires a search text');
          console.error('Usage: rlm query <text>');
          process.exit(1);
        }
        const queryText = args.slice(1).join(' ');
        await runQuery(queryText);
        break;
      }

      case 'status': {
        await runStatus();
        break;
      }

      default: {
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
      }
    }
  } catch (e) {
    const error = e as Error;
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run main
main();

// Export for programmatic use
export { main };
