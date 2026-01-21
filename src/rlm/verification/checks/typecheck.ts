/**
 * TypeScript Type Checking via ts-morph
 *
 * Programmatic type checking using ts-morph for structured diagnostics.
 * Initializes Project once for performance (per research recommendations).
 */

import { Project, DiagnosticCategory, type SourceFile } from 'ts-morph';
import type { CheckResult } from '../types.js';

/**
 * Module-level Project singleton for performance
 * Creating a new Project is expensive - reuse across checks
 */
let project: Project | null = null;

/**
 * Get or create the ts-morph Project instance
 */
export function getProject(): Project {
  if (!project) {
    project = new Project({
      tsConfigFilePath: 'tsconfig.json',
      skipAddingFilesFromTsConfig: true, // Add files explicitly for performance
    });
  }
  return project;
}

/**
 * Reset the Project instance
 * Call after major codebase changes or for testing
 */
export function resetProject(): void {
  project = null;
}

/**
 * Type check specified files and return structured diagnostics
 *
 * @param filePaths - Array of file paths to type check
 * @returns CheckResult with type errors and warnings
 */
export async function typecheckFiles(filePaths: string[]): Promise<CheckResult> {
  const startTime = Date.now();
  const errors: CheckResult['errors'] = [];

  try {
    const proj = getProject();

    // Add source files if not already added
    for (const filePath of filePaths) {
      if (!proj.getSourceFile(filePath)) {
        proj.addSourceFileAtPath(filePath);
      }
    }

    // Get semantic diagnostics for each file
    for (const filePath of filePaths) {
      const sourceFile = proj.getSourceFile(filePath);
      if (!sourceFile) {
        errors.push({
          message: `File not found: ${filePath}`,
          file: filePath,
        });
        continue;
      }

      const diagnostics = sourceFile.getPreEmitDiagnostics();

      for (const diagnostic of diagnostics) {
        const messageText = diagnostic.getMessageText();
        const message =
          typeof messageText === 'string'
            ? messageText
            : messageText.getMessageText();

        const category = diagnostic.getCategory();
        const severity =
          category === DiagnosticCategory.Error ? 'error' : 'warning';

        errors.push({
          message,
          file: sourceFile.getFilePath(),
          line: diagnostic.getLineNumber() || undefined,
          severity,
        });
      }
    }

    // Count actual errors (not warnings)
    const errorCount = errors.filter((e) => e.severity === 'error').length;

    return {
      type: 'typecheck',
      passed: errorCount === 0,
      errors,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      type: 'typecheck',
      passed: false,
      errors: [
        {
          message:
            error instanceof Error ? error.message : 'Unknown type check error',
        },
      ],
      duration: Date.now() - startTime,
    };
  }
}
