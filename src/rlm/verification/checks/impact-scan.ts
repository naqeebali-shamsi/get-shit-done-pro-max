/**
 * Impact Scan via ts-morph Reference Analysis
 *
 * Analyzes which files are affected by changes to a symbol.
 * Uses ts-morph findReferencesAsNodes for reference tracking.
 */

import type { CheckResult } from '../types.js';
import { getProject } from './typecheck.js';

/**
 * Extended CheckResult with impact analysis data
 */
export interface ImpactResult extends CheckResult {
  impactedFiles: string[];
  affectedTests: string[];
}

/**
 * Scan for files impacted by changes to a symbol in a file
 *
 * @param changedFile - Path to the file that changed
 * @param symbolName - Optional symbol name to find references for
 * @returns ImpactResult with impacted files and affected tests
 */
export async function scanImpact(
  changedFile: string,
  symbolName?: string
): Promise<ImpactResult> {
  const startTime = Date.now();
  const impactedFiles: string[] = [];
  const affectedTests: string[] = [];
  const errors: CheckResult['errors'] = [];

  try {
    const project = getProject();

    // Add the changed file if not already added
    if (!project.getSourceFile(changedFile)) {
      project.addSourceFileAtPath(changedFile);
    }

    const sourceFile = project.getSourceFile(changedFile);

    if (!sourceFile) {
      return {
        type: 'impact',
        passed: true,
        errors: [{ message: `File not found: ${changedFile}` }],
        duration: Date.now() - startTime,
        impactedFiles: [],
        affectedTests: [],
      };
    }

    // If no symbol specified, find all exported symbols and their references
    if (!symbolName) {
      // Get all exported declarations from the file
      const exports = sourceFile.getExportedDeclarations();

      for (const [, declarations] of exports) {
        for (const declaration of declarations) {
          if ('findReferencesAsNodes' in declaration) {
            const refs = (
              declaration as {
                findReferencesAsNodes: () => Array<{ getSourceFile: () => { getFilePath: () => string } }>;
              }
            ).findReferencesAsNodes();
            for (const ref of refs) {
              const filePath = ref.getSourceFile().getFilePath();
              if (filePath !== sourceFile.getFilePath()) {
                impactedFiles.push(filePath);
              }
            }
          }
        }
      }
    } else {
      // Find the specific symbol
      const symbol =
        sourceFile.getFunction(symbolName) ||
        sourceFile.getClass(symbolName) ||
        sourceFile.getVariableDeclaration(symbolName) ||
        sourceFile.getInterface(symbolName) ||
        sourceFile.getTypeAlias(symbolName);

      if (!symbol) {
        errors.push({
          message: `Symbol '${symbolName}' not found in ${changedFile}`,
          file: changedFile,
          severity: 'warning',
        });
      } else {
        // Find all references to this symbol
        const refs = symbol.findReferencesAsNodes();

        for (const ref of refs) {
          const filePath = ref.getSourceFile().getFilePath();
          // Exclude self-references
          if (filePath !== sourceFile.getFilePath()) {
            impactedFiles.push(filePath);
          }
        }
      }
    }

    // Dedupe impacted files
    const uniqueImpacted = [...new Set(impactedFiles)];

    // Identify test files from impacted files
    for (const file of uniqueImpacted) {
      if (file.includes('.test.') || file.includes('.spec.')) {
        affectedTests.push(file);
      }
    }

    return {
      type: 'impact',
      passed: true, // Impact scan doesn't fail, just informs
      errors,
      duration: Date.now() - startTime,
      impactedFiles: uniqueImpacted,
      affectedTests,
    };
  } catch (error) {
    return {
      type: 'impact',
      passed: true, // Don't fail on impact scan errors
      errors: [
        {
          message:
            error instanceof Error ? error.message : 'Unknown impact scan error',
          severity: 'warning',
        },
      ],
      duration: Date.now() - startTime,
      impactedFiles: [],
      affectedTests: [],
    };
  }
}

/**
 * Get all affected test files for a list of changed files
 *
 * @param changedFiles - Array of changed file paths
 * @returns Array of unique test file paths that may need to run
 */
export async function getAffectedTestsForFiles(
  changedFiles: string[]
): Promise<string[]> {
  const allAffectedTests: string[] = [];

  for (const file of changedFiles) {
    const result = await scanImpact(file);
    allAffectedTests.push(...result.affectedTests);
  }

  // Dedupe and sort
  return [...new Set(allAffectedTests)].sort();
}
