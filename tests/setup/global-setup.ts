/**
 * Global setup for integration tests.
 *
 * Uses @testcontainers/qdrant to start a Qdrant container before
 * integration tests run and stop it after they complete.
 *
 * This file is referenced in vitest.config.ts globalSetup for the
 * integration test project.
 */

import { QdrantContainer, StartedQdrantContainer } from '@testcontainers/qdrant';
import { execSync } from 'child_process';

let container: StartedQdrantContainer | undefined;

export async function setup(): Promise<void> {
  console.log('[global-setup] Building RLM before integration tests...');

  // Ensure dist is built before running integration tests
  try {
    execSync('npm run build:rlm', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    console.log('[global-setup] Build complete');
  } catch (error) {
    console.error('[global-setup] Build failed:', error);
    throw error;
  }

  console.log('[global-setup] Starting Qdrant container...');

  // Start Qdrant container for integration tests
  container = await new QdrantContainer('qdrant/qdrant:v1.13.1').start();

  // Make URL available to tests via environment variable
  // getRestHostAddress returns host:port, we need to add http:// protocol
  const hostAddress = container.getRestHostAddress();
  const qdrantUrl = hostAddress.startsWith('http') ? hostAddress : `http://${hostAddress}`;
  process.env.QDRANT_URL = qdrantUrl;

  console.log(`[global-setup] Qdrant started at ${qdrantUrl}`);
}

export async function teardown(): Promise<void> {
  if (container) {
    console.log('[global-setup] Stopping Qdrant container...');
    await container.stop();
    console.log('[global-setup] Qdrant container stopped');
  }
}
