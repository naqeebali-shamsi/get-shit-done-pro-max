/**
 * Verification Checks
 *
 * Three check types for VER-01:
 * - typecheck: TypeScript semantic analysis
 * - test-runner: Vitest programmatic execution
 * - impact-scan: Reference analysis for affected files
 */

export { typecheckFiles, resetProject, getProject } from './typecheck.js';
export { runTests, runTestsForFiles } from './test-runner.js';
export {
  scanImpact,
  getAffectedTestsForFiles,
  type ImpactResult,
} from './impact-scan.js';
