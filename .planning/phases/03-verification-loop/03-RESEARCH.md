# Phase 3: Verification Loop - Research

**Researched:** 2026-01-21
**Domain:** LLM output verification, claim extraction, code analysis
**Confidence:** HIGH

<research_summary>
## Summary

Researched verification patterns for LLM outputs in the context of our RLM system. The phase requires three capabilities: verifier module (VER-01), evidence coverage checking (VER-02), and recursive refinement on failure (VER-03).

Key finding: Modern verification systems use atomic claim decomposition followed by iterative evidence gathering. The FIRE framework pattern (fact-checking with iterative retrieval) maps directly to our needs - dynamic confidence-based decision making for when to recurse vs. finalize. For code-specific checks (typecheck, test execution, impact scan), we should use TypeScript's Compiler API via ts-morph wrapper and Vitest's programmatic API.

**Primary recommendation:** Build a Verifier module with three check types (typecheck, test execution, impact scan), integrate atomic claim extraction using NLP patterns, and implement FIRE-style confidence-based recursion control.
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| typescript | 5.x | Programmatic type checking | Official compiler API for semantic analysis |
| ts-morph | 27.x | TypeScript AST analysis | Simplifies Compiler API, find references, impact analysis |
| vitest | 3.x | Programmatic test execution | Modern, fast, excellent programmatic API |
| compromise | 14.x | NLP sentence segmentation | Lightweight, JavaScript-native, pattern matching |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 3.x | Schema validation | Already in project, validate check results |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ts-morph | Raw TypeScript API | ts-morph is easier, raw API is lower-level control |
| vitest | jest | Vitest faster, better ESM, already Vite-native |
| compromise | spaCy | spaCy more powerful but requires Python |

**Installation:**
```bash
# ts-morph and vitest for code verification
npm install ts-morph vitest

# compromise for claim extraction (JavaScript-native NLP)
npm install compromise
```

Note: `typescript` and `zod` already in project dependencies.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Recommended Project Structure
```
src/rlm/
├── verification/           # NEW - Phase 3
│   ├── index.ts           # Module exports
│   ├── verifier.ts        # Main Verifier class
│   ├── checks/
│   │   ├── typecheck.ts   # TypeScript type checking
│   │   ├── test-runner.ts # Vitest programmatic execution
│   │   └── impact-scan.ts # ts-morph reference analysis
│   ├── claims/
│   │   ├── extractor.ts   # Claim extraction from responses
│   │   └── coverage.ts    # Evidence coverage analysis
│   └── types.ts           # Verification types
├── engine/                # Existing - Phase 2
│   ├── dispatcher.ts      # Update: integrate verification
│   └── ...
└── evidence/              # Existing - Phase 2
    └── tracker.ts         # Already has basic claim extraction
```

### Pattern 1: FIRE-Style Iterative Verification
**What:** Decision loop that checks confidence after each verification step
**When to use:** Deciding whether to recurse or finalize
**Example:**
```typescript
// Source: FIRE framework pattern (https://github.com/mbzuai-nlp/fire)
interface VerificationResult {
  confident: boolean;
  evidence: Evidence[];
  errors: VerificationError[];
  suggestedRefinement?: string;
}

async function verifyWithConfidence(
  response: RLMResult,
  confidenceThreshold: number = 0.7
): Promise<VerificationResult> {
  const result = await runChecks(response);

  // FIRE pattern: dynamic decision based on confidence
  if (result.overallConfidence >= confidenceThreshold) {
    return { confident: true, ...result };
  }

  // Not confident - suggest refinement for recursion
  return {
    confident: false,
    ...result,
    suggestedRefinement: generateRefinementQuery(result.errors),
  };
}
```

### Pattern 2: Atomic Claim Decomposition
**What:** Break complex responses into verifiable atomic claims
**When to use:** Evidence coverage checking (VER-02)
**Example:**
```typescript
// Source: Microsoft Claimify pattern
interface AtomicClaim {
  text: string;
  verifiable: boolean;
  context: string;
  sourcePosition: number;
}

function extractAtomicClaims(response: string): AtomicClaim[] {
  // 1. Sentence split using compromise
  const doc = nlp(response);
  const sentences = doc.sentences().json();

  // 2. Filter to verifiable (factual) claims
  // 3. Disambiguate with context
  // 4. Return standalone claims
  return sentences
    .filter(isVerifiable)
    .map(addContext)
    .map(toAtomicClaim);
}
```

### Pattern 3: TypeScript Programmatic Type Check
**What:** Run type checking on code changes without full compilation
**When to use:** Verifying code-related claims in RLM responses
**Example:**
```typescript
// Source: TypeScript Compiler API + ts-morph docs
import { Project } from 'ts-morph';

function typecheckFiles(filePaths: string[]): DiagnosticResult[] {
  const project = new Project({
    tsConfigFilePath: 'tsconfig.json',
  });

  // Get semantic diagnostics (type errors)
  const diagnostics: DiagnosticResult[] = [];
  for (const file of filePaths) {
    const sourceFile = project.getSourceFile(file);
    if (sourceFile) {
      const errors = sourceFile.getPreEmitDiagnostics();
      diagnostics.push(...errors.map(toDiagnosticResult));
    }
  }

  return diagnostics;
}
```

### Pattern 4: Programmatic Test Execution
**What:** Run tests via API and capture results
**When to use:** Verifying that code changes pass tests
**Example:**
```typescript
// Source: Vitest Node API docs (https://vitest.dev/guide/advanced/)
import { startVitest } from 'vitest/node';

async function runTests(testPatterns: string[]): Promise<TestResult> {
  const vitest = await startVitest('test', testPatterns, {
    watch: false,
    reporters: ['default'],
  });

  const modules = vitest.state.getTestModules();
  const results = modules.map(m => ({
    file: m.moduleId,
    passed: m.ok(),
  }));

  await vitest.close();
  return { modules: results, allPassed: results.every(r => r.passed) };
}
```

### Anti-Patterns to Avoid
- **Verifying entire responses at once:** Decompose into atomic claims first
- **Fixed recursion depth:** Use confidence-based stopping, not hard limits
- **Shell-based type checking:** Use programmatic API for structured results
- **Blocking on all tests:** Run relevant tests only (use impact scan to identify)
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Claim extraction | Custom regex splitting | compromise NLP | Sentence boundaries are complex, NLP handles edge cases |
| Type checking | Child process `tsc` | ts-morph + TS API | Structured diagnostics, no parsing needed |
| Test execution | Child process `vitest run` | Vitest Node API | Programmatic access to results, no stdout parsing |
| AST impact analysis | Custom file parsing | ts-morph findReferences | Reference tracking is complex, ts-morph handles it |
| Confidence scoring | Custom heuristics | Retrieval score averaging | Already built in Phase 2 confidence module |

**Key insight:** All three verification types (typecheck, test, impact) have mature programmatic APIs. Shell-based approaches lose structure and require brittle output parsing. ts-morph and Vitest expose rich typed results directly.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Over-Decomposition of Claims
**What goes wrong:** Breaking responses into too many micro-claims loses semantic coherence
**Why it happens:** Aggressive sentence splitting without considering context
**How to avoid:** Use Claimify's "verifiable content" filter - skip opinions, recommendations, meta-commentary. Only extract claims that can be tested as true/false.
**Warning signs:** >10 claims from a 3-sentence response

### Pitfall 2: Type Check Performance
**What goes wrong:** Type checking entire project on every verification
**Why it happens:** Creating new ts-morph Project instance repeatedly
**How to avoid:** Initialize Project once, use incremental updates. ts-morph docs warn: "a large performance improvement can be gained by doing an initial analysis of the code first"
**Warning signs:** >5 second verification times

### Pitfall 3: Test Scope Explosion
**What goes wrong:** Running all tests when only a few files changed
**Why it happens:** Not using impact analysis to identify affected tests
**How to avoid:** Use ts-morph findReferencesAsNodes to identify affected files, then run only related tests
**Warning signs:** Test execution taking >30s for small changes

### Pitfall 4: Infinite Recursion Loops
**What goes wrong:** Verification fails, recurses, same failure, recurses...
**Why it happens:** Refinement query doesn't address the actual error
**How to avoid:** FIRE pattern - track error types across recursions. If same error repeats, abort with partial result.
**Warning signs:** Depth consistently hitting max (5)

### Pitfall 5: False Confidence from Tests
**What goes wrong:** Tests pass but behavior is wrong
**Why it happens:** Tests don't cover the claimed behavior
**How to avoid:** Coverage-aware verification - check if evidence chunks map to tested code paths
**Warning signs:** High test pass rate but low evidence coverage
</common_pitfalls>

<code_examples>
## Code Examples

Verified patterns from official sources:

### Vitest Programmatic Test Run
```typescript
// Source: https://vitest.dev/guide/advanced/
import { startVitest } from 'vitest/node';

async function runTestsForFiles(patterns: string[]): Promise<{
  passed: boolean;
  results: Array<{ file: string; ok: boolean }>;
}> {
  const vitest = await startVitest(
    'test',
    patterns,  // CLI filters like ['src/**/*.test.ts']
    { watch: false },
    {},
    {}
  );

  const testModules = vitest.state.getTestModules();
  const results = testModules.map(m => ({
    file: m.moduleId,
    ok: m.ok(),
  }));

  await vitest.close();

  return {
    passed: results.every(r => r.ok),
    results,
  };
}
```

### ts-morph Find References for Impact Analysis
```typescript
// Source: https://github.com/dsherret/ts-morph/blob/latest/docs/navigation/finding-references.md
import { Project } from 'ts-morph';

function findImpactedFiles(
  project: Project,
  changedFile: string,
  symbolName: string
): string[] {
  const sourceFile = project.getSourceFile(changedFile);
  if (!sourceFile) return [];

  const symbol = sourceFile.getFunction(symbolName)
    || sourceFile.getClass(symbolName)
    || sourceFile.getVariableDeclaration(symbolName);

  if (!symbol) return [];

  // Find all files that reference this symbol
  const referencingNodes = symbol.findReferencesAsNodes();
  const impactedFiles = new Set<string>();

  for (const node of referencingNodes) {
    impactedFiles.add(node.getSourceFile().getFilePath());
  }

  return Array.from(impactedFiles);
}
```

### TypeScript Semantic Diagnostics
```typescript
// Source: https://github.com/microsoft/typescript/wiki/Using-the-Compiler-API
import { Project, DiagnosticCategory } from 'ts-morph';

interface TypecheckResult {
  file: string;
  errors: Array<{
    message: string;
    line: number;
    category: 'error' | 'warning';
  }>;
}

function typecheckProject(project: Project): TypecheckResult[] {
  const results: TypecheckResult[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const diagnostics = sourceFile.getPreEmitDiagnostics();

    if (diagnostics.length > 0) {
      results.push({
        file: sourceFile.getFilePath(),
        errors: diagnostics.map(d => ({
          message: d.getMessageText().toString(),
          line: d.getLineNumber() || 0,
          category: d.getCategory() === DiagnosticCategory.Error ? 'error' : 'warning',
        })),
      });
    }
  }

  return results;
}
```

### Compromise Sentence Extraction
```typescript
// Source: https://github.com/spencermountain/compromise
import nlp from 'compromise';

interface ExtractedSentence {
  text: string;
  isStatement: boolean;
  isQuestion: boolean;
}

function extractSentences(text: string): ExtractedSentence[] {
  const doc = nlp(text);

  return doc.sentences().json().map((s: any) => ({
    text: s.text,
    isStatement: nlp(s.text).sentences().isStatement(),
    isQuestion: nlp(s.text).sentences().isQuestion(),
  }));
}

// Filter to verifiable factual claims
function filterVerifiableClaims(sentences: ExtractedSentence[]): string[] {
  return sentences
    .filter(s => s.isStatement && !s.isQuestion)
    .map(s => s.text)
    .filter(text => {
      // Skip opinions, recommendations
      const doc = nlp(text);
      const hasOpinionVerb = doc.has('(think|believe|feel|suggest|recommend)');
      return !hasOpinionVerb;
    });
}
```
</code_examples>

<sota_updates>
## State of the Art (2025-2026)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed retrieval passes | FIRE-style iterative | 2025 | Dynamic confidence-based stopping saves compute |
| Manual claim extraction | Claimify atomic decomposition | ACL 2025 | 99% claim entailment, better verification |
| ts-morph 22.x | ts-morph 27.x | 2025 | Better performance, getReferencedSourceFiles() |
| Jest programmatic | Vitest Node API | 2024-2025 | Faster, better ESM, native TypeScript |

**New tools/patterns to consider:**
- **AFEV (Dynamic Atomic Fact Extraction):** Integrates verification feedback into decomposition - could inform recursive claim extraction
- **Confidence-Informed Self-Consistency (CISC):** Prioritizes high-confidence paths - relevant for recursion decisions

**Deprecated/outdated:**
- **Shell-based verification:** Parsing stdout/stderr is fragile; use programmatic APIs
- **Fixed recursion depth:** FIRE shows confidence-based stopping is more efficient
- **Full-project type checking:** Use incremental/file-scoped for performance
</sota_updates>

<open_questions>
## Open Questions

Things that couldn't be fully resolved:

1. **Claim atomicity threshold**
   - What we know: Claimify uses "verifiable content" filter; AFEV uses iterative decomposition
   - What's unclear: Optimal granularity for code-related claims (function-level? line-level?)
   - Recommendation: Start with sentence-level claims, refine based on evidence coverage results

2. **Vitest workspace compatibility**
   - What we know: Vitest Node API works well for single-project setups
   - What's unclear: Behavior with Vitest workspaces or monorepo configurations
   - Recommendation: Test programmatic API early; fall back to shell if workspace issues arise

3. **ts-morph memory usage**
   - What we know: Large projects can cause memory issues with full analysis
   - What's unclear: Exact thresholds for this codebase size
   - Recommendation: Use lazy loading, analyze only changed files + direct references
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- /microsoft/typescript (Context7) - Compiler API, createProgram, getSemanticDiagnostics
- /dsherret/ts-morph (Context7) - findReferences, findReferencesAsNodes, getPreEmitDiagnostics
- /vitest-dev/vitest (Context7) - startVitest, createVitest, programmatic Node API
- /spencermountain/compromise (Context7) - sentences, pattern matching, NLP

### Secondary (MEDIUM confidence)
- [Claimify (Microsoft Research)](https://www.microsoft.com/en-us/research/blog/claimify-extracting-high-quality-claims-from-language-model-outputs/) - Four-stage claim extraction pipeline, ACL 2025
- [FIRE (MBZUAI)](https://github.com/mbzuai-nlp/fire) - Iterative retrieval/verification, confidence-based stopping
- [RLM (MIT)](https://alexzhang13.github.io/blog/2025/rlm/) - REPL environment pattern (already using)
- [Vitest Node API](https://vitest.dev/guide/advanced/) - Official docs for programmatic usage

### Tertiary (LOW confidence - needs validation)
- ts-morph memory concerns - from web search, validate during implementation
- Vitest workspace behavior - community discussions, test during setup
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: TypeScript verification, test execution, claim extraction
- Ecosystem: ts-morph, Vitest, compromise
- Patterns: FIRE iterative verification, Claimify decomposition, programmatic APIs
- Pitfalls: Performance, over-decomposition, recursion loops

**Confidence breakdown:**
- Standard stack: HIGH - verified with Context7, widely used
- Architecture: HIGH - based on official docs and research papers
- Pitfalls: MEDIUM - some from web search, will validate in implementation
- Code examples: HIGH - from Context7/official sources

**Research date:** 2026-01-21
**Valid until:** 2026-02-21 (30 days - stable ecosystem)
</metadata>

---

*Phase: 03-verification-loop*
*Research completed: 2026-01-21*
*Ready for planning: yes*
