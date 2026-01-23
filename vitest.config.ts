import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Standard test configuration
    include: ['**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    environment: 'node',

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/rlm/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.bench.ts',
        'node_modules/**',
        'dist/**',
      ],
      // Tiered coverage thresholds
      thresholds: {
        // Global minimum thresholds
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        // Critical tier: MCP tools and CLI require 90%
        'src/rlm/mcp/**/*.ts': {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        'src/rlm/cli/**/*.ts': {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
      },
    },
  },
  bench: {
    // Benchmark configuration
    include: ['**/*.bench.ts'],
    reporters: ['default', 'json'],
    outputFile: '.planning/benchmarks/results.json',
  },
});
