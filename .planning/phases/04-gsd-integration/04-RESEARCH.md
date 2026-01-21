# Phase 4: GSD Integration - Research

**Researched:** 2026-01-21
**Domain:** CLI workflow enhancement via RLM integration
**Confidence:** HIGH

<research_summary>
## Summary

Researched integration patterns for wiring the RLM system into existing GSD commands. The GSD system is a markdown-based workflow orchestration system where workflow files ARE the prompts Claude executes. Integration can be achieved through three complementary approaches: Claude Code hooks for transparent context injection, MCP tools for explicit retrieval, and workflow file modifications for specific commands.

The key architectural insight is that GSD workflows don't need to change significantly - the RLM can enhance them transparently via the `UserPromptSubmit` hook's `additionalContext` field, or workflows can explicitly call RLM tools when deeper analysis is needed.

**Primary recommendation:** Implement a hybrid approach:
1. `UserPromptSubmit` hook for transparent codebase context on all prompts
2. MCP tool exposure for explicit queries (e.g., `/gsd:map-codebase` replacement)
3. Minimal workflow file changes to leverage RLM where beneficial
</research_summary>

<standard_stack>
## Standard Stack

The established libraries/tools for this integration:

### Core (Already Built in RLM)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @qdrant/js-client-rest | 1.13.x | Vector storage | Already integrated in Phase 1 |
| ollama | - | Local LLM | Already integrated in Phase 2 |
| RLMDispatcher | - | Full pipeline | Our Phase 2-3 implementation |

### Supporting (For Integration)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| claude-code-hook-sdk | - | Hook infrastructure | `UserPromptSubmit` context injection |
| Node.js child_process | native | CLI wrapper | If exposing as standalone tool |
| MCP server SDK | - | MCP tool exposure | If exposing RLM as MCP tools |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hooks for injection | MCP prompts resource | Prompts resource is read-only, hooks can modify |
| Full hook SDK | Raw JSON stdin/stdout | SDK has type safety, validation built-in |
| Node.js CLI | Python wrapper | Stay in TypeScript ecosystem |

**No new dependencies needed** - the RLM system is already built. Integration is about wiring, not new libraries.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Integration Point: Claude Code Hooks

Claude Code supports hooks that intercept events. The key hook for GSD integration:

**UserPromptSubmit Hook Pattern:**
```typescript
// From claude-code-sdk-python / claude-code-hook-sdk
async function addRLMContext(
  input: HookInput,
  tool_use_id: string | null,
  context: HookContext
): Promise<HookJSONOutput> {
  // Extract query from user prompt
  const query = input.prompt;

  // Only enhance for GSD commands that benefit from context
  if (!shouldEnhance(query)) {
    return {};
  }

  // Call RLM dispatcher for relevant context
  const result = await rlmDispatcher.dispatch(query);

  // Inject as additionalContext (transparent to user)
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: formatAsContext(result)
    }
  };
}
```

### Recommended Project Structure
```
src/
├── rlm/                    # Existing RLM system (Phase 1-3)
│   ├── index.ts           # Exports
│   └── ...
├── integration/            # NEW: Phase 4
│   ├── hooks/
│   │   └── context-injector.ts   # UserPromptSubmit hook
│   ├── tools/
│   │   └── rlm-mcp-tool.ts       # Optional MCP exposure
│   └── index.ts
└── cli/
    └── rlm-cli.ts          # Standalone CLI (optional)
```

### Pattern 1: Transparent Context Injection (Hook-Based)
**What:** Use `UserPromptSubmit` hook to add relevant codebase context
**When to use:** All GSD workflows that benefit from codebase understanding
**Example:**
```typescript
// Hook receives user prompt, returns additionalContext
{
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: `
## Relevant Codebase Context (via RLM)

Based on your query, here are relevant code sections:

### ${chunk.metadata.path}:${chunk.metadata.start_line}-${chunk.metadata.end_line}
\`\`\`${chunk.metadata.language}
${chunk.text}
\`\`\`
Confidence: ${confidence}%
`
  }
}
```

### Pattern 2: Explicit RLM Tool (MCP-Based)
**What:** Expose RLM as MCP tool that workflows can call explicitly
**When to use:** When workflow needs deep analysis (e.g., `/gsd:map-codebase`)
**Example:**
```typescript
// MCP tool definition
{
  name: "rlm_query",
  description: "Query codebase with semantic search and verification",
  parameters: {
    query: { type: "string", description: "Natural language query" },
    depth: { type: "number", default: 3, description: "Recursion depth" }
  }
}
```

### Pattern 3: Workflow File Enhancement
**What:** Modify specific workflow files to leverage RLM
**When to use:** Commands like `/gsd:map-codebase` that could use RLM instead of parallel agents
**Example changes:**
- `map-codebase.md`: Replace 4 parallel Explore agents with single RLM dispatch
- `plan-phase.md`: Use RLM for intelligent context assembly
- `execute-plan.md`: Use RLM for task understanding

### Anti-Patterns to Avoid
- **Over-injecting context:** Don't add context to every prompt - be selective
- **Blocking on slow operations:** Hook must be fast or async; don't block on full RLM pipeline
- **Duplicating existing functionality:** Don't replace Context7/WebSearch, augment them
- **Coupling workflows to RLM:** Workflows should work without RLM (graceful degradation)
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

Problems that have existing solutions in the RLM system:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Codebase search | grep/glob chains | RLMDispatcher.dispatch() | Semantic search, verification |
| Context ranking | Manual scoring | Evidence confidence | Already implemented in Phase 2-3 |
| Chunking | Line-based splitting | AST chunker | Respects code boundaries |
| Result verification | None | Verifier module | FIRE-style verification |
| Context assembly | Manual file reads | RLM hybrid search | RRF fusion, deduplication |

**Key insight:** The entire point of Phase 4 is to use what was built in Phases 1-3. Don't rebuild any of it.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Latency in Synchronous Hooks
**What goes wrong:** Hook blocks Claude response while waiting for RLM
**Why it happens:** RLM involves embedding + vector search + possibly LLM call
**How to avoid:**
- Pre-index codebase (don't index on demand)
- Cache embedding results
- Set aggressive timeouts (500ms for hooks)
- Fall back gracefully on timeout
**Warning signs:** User notices delay before Claude responds

### Pitfall 2: Context Overload
**What goes wrong:** Too much injected context overwhelms the prompt
**Why it happens:** RLM returns 10 chunks × 500 lines = 5000 lines
**How to avoid:**
- Limit to top 3-5 chunks
- Summarize chunks instead of full text
- Only inject for queries that benefit
**Warning signs:** Claude responses become unfocused, context window fills

### Pitfall 3: Breaking Existing Workflows
**What goes wrong:** Hook interferes with normal GSD operation
**Why it happens:** Hook logic has bugs or unexpected interactions
**How to avoid:**
- Hook returns empty `{}` by default (approve, no changes)
- Extensive error handling - never block on RLM failure
- Feature flag to disable RLM integration
**Warning signs:** GSD commands that worked before now fail

### Pitfall 4: Stale Index
**What goes wrong:** RLM returns outdated code references
**Why it happens:** Codebase changed but index not updated
**How to avoid:**
- Background re-indexing on file changes (file watcher)
- Include file hash in chunks, validate on retrieval
- Timestamp in results so user knows freshness
**Warning signs:** "This code doesn't exist" or outdated function signatures
</common_pitfalls>

<code_examples>
## Code Examples

Verified patterns from official sources:

### UserPromptSubmit Hook Structure
```typescript
// Source: @mizunashi-mana/claude-code-hook-sdk
import { runHook } from '@mizunashi-mana/claude-code-hook-sdk';

void runHook({
  userPromptSubmitHandler: async (input) => {
    const prompt = input.prompt;

    // Check if this is a GSD command that benefits from context
    if (!prompt.includes('/gsd:') && !shouldEnhancePrompt(prompt)) {
      return {}; // No enhancement needed
    }

    try {
      // Quick retrieval (not full RLM pipeline for hooks)
      const chunks = await quickRetrieve(prompt, { limit: 5, timeout: 500 });

      if (chunks.length === 0) {
        return {};
      }

      return {
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: formatChunksAsContext(chunks)
        }
      };
    } catch (error) {
      // Never fail the hook - graceful degradation
      console.error('RLM hook error:', error);
      return {};
    }
  }
});
```

### Quick Retrieve (Fast Path for Hooks)
```typescript
// Fast retrieval without full RLM pipeline
async function quickRetrieve(
  query: string,
  options: { limit: number; timeout: number }
): Promise<Chunk[]> {
  const client = getQdrantClient(); // Singleton

  // Just vector search, no LLM, no verification
  const results = await Promise.race([
    hybridSearch(client, 'codebase', query, { limit: options.limit }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), options.timeout)
    )
  ]);

  return results.map(r => r.chunk);
}
```

### Hook Configuration (settings.json)
```json
// ~/.claude/settings.json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": null,
        "hooks": [
          {
            "path": "/path/to/gsd-pro-max/dist/integration/hooks/context-injector.js",
            "description": "RLM context injection for GSD commands"
          }
        ],
        "timeout": 1000
      }
    ]
  }
}
```

### Full RLM as MCP Tool
```typescript
// MCP tool for explicit RLM queries
import { RLMDispatcher, createDispatcher } from '../rlm/index.js';

export const rlmQueryTool = {
  name: 'rlm_query',
  description: 'Query the codebase with semantic search and verification. ' +
    'Returns relevant code chunks with confidence scores and evidence.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query about the codebase'
      },
      maxChunks: {
        type: 'number',
        default: 10,
        description: 'Maximum chunks to return'
      }
    },
    required: ['query']
  },
  handler: async ({ query, maxChunks = 10 }) => {
    const dispatcher = await createDispatcher();
    const result = await dispatcher.dispatch(query);

    return {
      response: result.response,
      confidence: result.confidence.score,
      evidence: result.evidence.slice(0, maxChunks),
      warnings: result.confidence.warnings
    };
  }
};
```
</code_examples>

<sota_updates>
## State of the Art (2025-2026)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual grep/find | Semantic vector search | 2024+ | Better relevance, handles synonyms |
| Full file reading | AST-aware chunking | 2024+ | Respects code boundaries |
| No verification | FIRE-style verification | 2025+ | Catches hallucinations |
| Static context | RAG with retrieval | 2023+ | Dynamic, relevant context |

**New tools/patterns to consider:**
- **Claude Code Hooks**: Enable transparent enhancement without workflow changes
- **UserPromptSubmit additionalContext**: Perfect for injecting retrieved context
- **Agentic RAG**: Azure's pattern of query decomposition for complex questions

**Current best practices:**
- Pre-index codebase (don't index on demand)
- Hybrid search (dense + sparse) for best recall
- Confidence thresholds to filter low-quality results
- Graceful degradation when RLM unavailable
</sota_updates>

<open_questions>
## Open Questions

Things that couldn't be fully resolved:

1. **Hook Performance Budget**
   - What we know: Hooks should be fast (<1s)
   - What's unclear: Exact acceptable latency for UserPromptSubmit
   - Recommendation: Start with 500ms timeout, measure real impact

2. **Which Commands Benefit Most**
   - What we know: Analysis commands (map-codebase, plan-phase) clearly benefit
   - What's unclear: Whether execution commands benefit or just add noise
   - Recommendation: Start with analysis commands, expand based on feedback

3. **Index Freshness Strategy**
   - What we know: Stale index = bad UX
   - What's unclear: Best trigger for re-indexing (file watcher vs explicit)
   - Recommendation: Implement both, let user choose
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- /anthropics/claude-code-sdk-python - Hook patterns, additionalContext field
- /mizunashi-mana/claude-code-hook-sdk - TypeScript hook implementation
- /pchalasani/claude-code-tools - Hook configuration examples
- GSD workflow files - Architecture understanding

### Secondary (MEDIUM confidence)
- [Context Design Pattern](https://www.baeldung.com/cs/context-design-pattern) - Pattern theory
- [Interceptor Pattern](https://en.wikipedia.org/wiki/Interceptor_pattern) - Transparent enhancement
- [RAG Wikipedia](https://en.wikipedia.org/wiki/Retrieval-augmented_generation) - RAG foundations
- [Azure AI Search RAG](https://learn.microsoft.com/en-us/azure/search/retrieval-augmented-generation-overview) - Agentic RAG patterns

### Tertiary (LOW confidence - needs validation)
- None - integration patterns are well-documented
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Claude Code hooks, MCP tools
- Ecosystem: GSD workflow files, RLM modules
- Patterns: Context injection, transparent enhancement, graceful degradation
- Pitfalls: Latency, context overload, stale index

**Confidence breakdown:**
- Standard stack: HIGH - using existing RLM, no new deps
- Architecture: HIGH - hook patterns well-documented
- Pitfalls: HIGH - common RAG integration issues
- Code examples: HIGH - from official SDK documentation

**Research date:** 2026-01-21
**Valid until:** 2026-03-21 (60 days - integration patterns are stable)
</metadata>

---

*Phase: 04-gsd-integration*
*Research completed: 2026-01-21*
*Ready for planning: yes*
