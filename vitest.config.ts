import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Standard test configuration
    include: ['**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    environment: 'node',
  },
  bench: {
    // Benchmark configuration
    include: ['**/*.bench.ts'],
    reporters: ['default', 'json'],
    outputFile: '.planning/benchmarks/results.json',
  },
});
