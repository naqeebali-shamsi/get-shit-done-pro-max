import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Workspace projects for different test types
    projects: [
      {
        // Unit tests - fast, no containers
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          exclude: ['node_modules', 'dist'],
          environment: 'node',
        },
      },
      {
        // Integration tests - with containers
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts', 'tests/e2e/**/*.test.ts'],
          exclude: ['node_modules', 'dist'],
          environment: 'node',
          globalSetup: './tests/setup/global-setup.ts',
          testTimeout: 60000,
          hookTimeout: 120000, // Container startup can be slow
        },
      },
    ],

    // Coverage configuration (applies to all projects)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Phase 7 focused on MCP server testing
      include: ['src/rlm/mcp/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.bench.ts',
        'node_modules/**',
        'dist/**',
        // Exclude main entry points (tested via E2E)
        '**/server.ts',
        '**/index.ts',
      ],
      // Coverage thresholds for MCP modules
      thresholds: {
        // Phase 7 target: 85% overall for MCP modules
        lines: 85,
        functions: 85,
        branches: 80, // Slightly lower for branches
        statements: 85,
        // MCP tools require high coverage
        'src/rlm/mcp/tools/**/*.ts': {
          lines: 90,
          functions: 90,
          branches: 80,
          statements: 90,
        },
        'src/rlm/mcp/formatters/**/*.ts': {
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
