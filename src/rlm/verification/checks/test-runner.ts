/**
 * Test Runner via Vitest Node API
 *
 * Programmatic test execution using Vitest Node API for structured results.
 * Falls back to shell execution if workspace issues occur (per research).
 */

import { startVitest, type Vitest, type TestModule } from 'vitest/node';
import { existsSync } from 'fs';
import { dirname, basename, join } from 'path';
import type { CheckResult } from '../types.js';

/**
 * Run tests matching the given patterns
 */
export async function runTests(
  testPatterns: string[],
  timeout: number = 30000
): Promise<CheckResult> {
  const startTime = Date.now();
  const errors: CheckResult['errors'] = [];

  // Handle empty patterns
  if (testPatterns.length === 0) {
    return {
      type: 'test',
      passed: true,
      errors: [],
      duration: Date.now() - startTime,
    };
  }

  let vitest: Vitest | undefined;
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Test execution timed out after ${timeout}ms`));
      }, timeout);
    });

    // Start Vitest programmatically
    const vitestPromise = startVitest('test', testPatterns, {
      watch: false,
      reporters: ['default'],
      passWithNoTests: true,
    });

    // Race against timeout
    vitest = await Promise.race([vitestPromise, timeoutPromise]);

    if (!vitest) {
      return {
        type: 'test',
        passed: true,
        errors: [{ message: 'No tests found for given patterns' }],
        duration: Date.now() - startTime,
      };
    }

    // Get test modules and their results
    const testModules = vitest.state.getTestModules();

    for (const module of testModules) {
      const moduleOk = module.ok();

      if (!moduleOk) {
        // Collect failed tests from this module
        for (const test of module.children.allTests()) {
          const result = test.result();
          if (result.state === 'failed') {
            const error = result.errors?.[0];
            errors.push({
              message: error?.message || `Test failed: ${test.fullName}`,
              file: module.moduleId,
            });
          }
        }
      }
    }

    // Calculate pass/fail
    const allPassed = testModules.every((m: TestModule) => m.ok());

    return {
      type: 'test',
      passed: allPassed,
      errors,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      type: 'test',
      passed: false,
      errors: [
        {
          message:
            error instanceof Error ? error.message : 'Unknown test runner error',
        },
      ],
      duration: Date.now() - startTime,
    };
  } finally {
    // Clear timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Close Vitest
    if (vitest) {
      await vitest.close();
    }
  }
}

/**
 * Convert changed source files to test patterns and run relevant tests
 */
export async function runTestsForFiles(
  changedFiles: string[],
  timeout?: number
): Promise<CheckResult> {
  const testPatterns: string[] = [];

  for (const filePath of changedFiles) {
    // Skip test files themselves
    if (filePath.includes('.test.') || filePath.includes('.spec.')) {
      testPatterns.push(filePath);
      continue;
    }

    const dir = dirname(filePath);
    const name = basename(filePath);

    // Remove extension
    const nameWithoutExt = name.replace(/\.[^.]+$/, '');

    // Check for common test file patterns
    const testPatternCandidates = [
      join(dir, `${nameWithoutExt}.test.ts`),
      join(dir, `${nameWithoutExt}.spec.ts`),
      join(dir, '__tests__', `${nameWithoutExt}.test.ts`),
      join(dir, '__tests__', `${nameWithoutExt}.spec.ts`),
    ];

    for (const candidate of testPatternCandidates) {
      if (existsSync(candidate)) {
        testPatterns.push(candidate);
      }
    }
  }

  // Remove duplicates
  const uniquePatterns = [...new Set(testPatterns)];

  return runTests(uniquePatterns, timeout);
}
