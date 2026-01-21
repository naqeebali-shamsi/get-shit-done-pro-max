# Phase 2: RLM Engine Core - Research

**Researched:** 2026-01-21
**Domain:** Recursive Language Models, agentic RAG, LLM orchestration
**Confidence:** HIGH

<research_summary>
## Summary

Researched Recursive Language Model (RLM) architecture for building the reasoning engine. RLMs are a new paradigm (Oct 2025) that treats context as external environment rather than direct prompt input, enabling LLMs to programmatically examine, decompose, and recursively call themselves over input data.

Key finding: Don't use heavy frameworks like LangChain or LlamaIndex. The RLM pattern is simple enough to implement directly with the Ollama JS SDK we already have. The core abstraction is a REPL environment where the LLM stores/retrieves context as variables and can spawn sub-LLM calls.

**Primary recommendation:** Build a lightweight custom RLM engine with REPL-style state management using Ollama's tool calling API. Keep it simple - the paper shows depth-1 recursion suffices for most tasks.
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ollama | 0.6.x | LLM chat, embedding, tool calling | Already installed, local-first, supports structured JSON output |
| zod | 3.x | Schema validation for structured outputs | Type-safe response parsing, converts to JSON schema for Ollama |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod-to-json-schema | 3.x | Convert Zod schemas to JSON Schema | For Ollama's `format` parameter |

### NOT Using (and why)
| Library | Reason |
|---------|--------|
| LangChain | Too heavy, abstracts too much, overkill for our use case |
| LlamaIndex | Python-focused, TS version less mature, we have retrieval already |
| @pipewrk/llm-core | Nice but adds unnecessary abstraction layer |

**Installation:**
```bash
npm install zod zod-to-json-schema
# ollama already installed in Phase 1
```
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Recommended Project Structure
```
src/rlm/
├── engine/
│   ├── rlm-engine.ts     # RLMEngine class with query() and recurse()
│   ├── dispatcher.ts      # Orchestrates embed -> retrieve -> query -> verify
│   ├── state.ts          # REPL-style state management
│   └── index.ts
├── evidence/
│   ├── tracker.ts        # Links claims to source chunks
│   ├── confidence.ts     # Confidence scoring
│   └── index.ts
├── types.ts              # Extend existing types
└── index.ts              # Re-export everything
```

### Pattern 1: REPL-Style State Management
**What:** Store context as named variables in a state object, not in the prompt
**When to use:** Always - this is the core RLM innovation
**Example:**
```typescript
interface RLMState {
  variables: Map<string, unknown>;
  context: string;       // Original full context (stored, not in prompt)
  query: string;         // Current query
  depth: number;         // Recursion depth
  tokenBudget: number;   // Remaining tokens
  evidence: Evidence[];  // Accumulated evidence
}

class RLMEngine {
  private state: RLMState;

  async query(input: string): Promise<RLMResult> {
    // LLM never sees full context directly
    // Instead, it gets metadata about what's available
    const contextInfo = this.describeContext();
    const prompt = this.buildPrompt(input, contextInfo);

    // LLM can request slices of context via tool calls
    const response = await this.ollama.chat({
      model: this.config.model,
      messages: [{ role: 'user', content: prompt }],
      tools: this.getTools(),
    });

    return this.processResponse(response);
  }
}
```

### Pattern 2: Dispatcher Pipeline
**What:** Orchestrate the full RLM loop: embed -> retrieve -> query -> verify -> recurse
**When to use:** For the main entry point that GSD commands will call
**Example:**
```typescript
class RLMDispatcher {
  async dispatch(query: string): Promise<VerifiedResult> {
    // 1. Embed the query (already have this from Phase 1)
    const queryEmbedding = await embedText(query);

    // 2. Retrieve relevant chunks (already have this)
    const chunks = await hybridSearch(queryEmbedding, query);

    // 3. Initialize RLM state with chunks as context
    const engine = new RLMEngine({
      context: this.chunksToContext(chunks),
      maxDepth: 5,
      tokenBudget: this.config.maxTokens * 2,
    });

    // 4. Query with verification loop
    let result = await engine.query(query);

    while (!result.verified && result.canRecurse) {
      // 5. Recurse with refined query
      result = await engine.recurse(result.refinedQuery);
    }

    return result;
  }
}
```

### Pattern 3: Evidence Tracking via Source Nodes
**What:** Every claim in the response must reference source chunks
**When to use:** To enable verification and prevent hallucination
**Example:**
```typescript
interface Evidence {
  claim: string;           // The statement being made
  sourceChunks: string[];  // Chunk IDs that support it
  confidence: number;      // 0-1 based on retrieval scores
  verified: boolean;       // Post-verification status
}

interface RLMResult {
  response: string;
  evidence: Evidence[];
  reasoning: string[];     // Chain of thought steps
  tokensUsed: number;
  depth: number;
}
```

### Pattern 4: Tool-Based Context Inspection
**What:** LLM uses tools to examine context rather than receiving it in prompt
**When to use:** Core RLM pattern - keeps context window unclogged
**Example:**
```typescript
const rlmTools = [
  {
    type: 'function',
    function: {
      name: 'peek_context',
      description: 'View a slice of the context by line range',
      parameters: {
        type: 'object',
        properties: {
          startLine: { type: 'number' },
          endLine: { type: 'number' },
        },
        required: ['startLine', 'endLine'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_context',
      description: 'Search context for a pattern',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sub_query',
      description: 'Ask a sub-question about a specific chunk',
      parameters: {
        type: 'object',
        properties: {
          chunkId: { type: 'string' },
          question: { type: 'string' },
        },
        required: ['chunkId', 'question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'final_answer',
      description: 'Provide the final answer with evidence',
      parameters: {
        type: 'object',
        properties: {
          answer: { type: 'string' },
          evidence: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
        },
        required: ['answer', 'evidence', 'confidence'],
      },
    },
  },
];
```

### Anti-Patterns to Avoid
- **Passing full context in prompt:** Defeats the purpose of RLM, causes context overflow
- **Deep recursion without limits:** Can cause infinite loops and token explosion
- **Ignoring evidence tracking:** Makes verification impossible, enables hallucination
- **Using LangChain for simple orchestration:** Adds massive dependency for what we can do in 200 lines
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON schema validation | Custom parser | Zod + zod-to-json-schema | Edge cases, type safety |
| LLM chat interface | Raw HTTP calls | ollama npm package | Streaming, tool calls, proper typing |
| Embedding generation | Custom API wrapper | Existing embedText() from Phase 1 | Already built and tested |
| Vector search | Custom similarity | Existing hybridSearch() from Phase 1 | Already built with RRF fusion |

**Key insight:** We built the retrieval layer in Phase 1. Phase 2 is about orchestration logic, not infrastructure. Keep it simple - the RLM paper shows the pattern works with just a REPL + tool calling.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Context Window Overflow
**What goes wrong:** Passing retrieved chunks directly into prompt causes token limit errors
**Why it happens:** Traditional RAG concatenates chunks; RLM should store them externally
**How to avoid:** Store context in state object, only pass metadata/summaries to LLM
**Warning signs:** "Maximum context length exceeded" errors, response quality degrading with more context

### Pitfall 2: Infinite Recursion Loops
**What goes wrong:** Model keeps recursing without making progress
**Why it happens:** No termination conditions, or verification always fails
**How to avoid:** Hard limits (max depth 5), token budget caps (2x baseline), progress detection
**Warning signs:** Same refined query appearing multiple times, depth increasing without answer

### Pitfall 3: Poor Confidence Calibration
**What goes wrong:** Model reports high confidence on wrong answers, low on correct
**Why it happens:** Verbal confidence ("I'm 90% sure") doesn't correlate with accuracy
**How to avoid:** Base confidence on retrieval scores and evidence coverage, not LLM self-report
**Warning signs:** High confidence + verification failures, inconsistent confidence scores

### Pitfall 4: Evidence-Response Mismatch
**What goes wrong:** Response contains claims not supported by cited evidence
**Why it happens:** LLM generates fluent text that drifts from source material
**How to avoid:** Post-hoc verification step that checks each claim against evidence
**Warning signs:** Evidence array smaller than claim count, verification rejecting responses

### Pitfall 5: Tool Call Parsing Failures
**What goes wrong:** Ollama returns malformed tool calls, breaks orchestration
**Why it happens:** Smaller models (8B) less reliable at structured output
**How to avoid:** Use Zod for validation, have fallback for malformed responses, prefer llama3.1:8b or larger
**Warning signs:** JSON parse errors, missing required fields in tool arguments
</common_pitfalls>

<code_examples>
## Code Examples

### Basic RLM Engine Structure
```typescript
// Source: Adapted from RLM paper patterns + Ollama JS docs
import ollama from 'ollama';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Chunk, SearchResult } from '../types.js';

export interface RLMConfig {
  model: string;
  maxDepth: number;
  tokenBudget: number;
  confidenceThreshold: number;
}

export const DEFAULT_RLM_CONFIG: RLMConfig = {
  model: 'llama3.1:8b',
  maxDepth: 5,
  tokenBudget: 16000,  // 2x typical response budget
  confidenceThreshold: 0.7,
};

export class RLMEngine {
  private config: RLMConfig;
  private state: RLMState;

  constructor(config: Partial<RLMConfig> = {}) {
    this.config = { ...DEFAULT_RLM_CONFIG, ...config };
    this.state = this.initState();
  }

  private initState(): RLMState {
    return {
      variables: new Map(),
      context: '',
      query: '',
      depth: 0,
      tokenBudget: this.config.tokenBudget,
      evidence: [],
    };
  }

  async query(input: string, chunks: Chunk[]): Promise<RLMResult> {
    this.state.query = input;
    this.state.context = this.formatChunks(chunks);

    return this.executeLoop();
  }

  async recurse(refinedQuery: string): Promise<RLMResult> {
    if (this.state.depth >= this.config.maxDepth) {
      throw new Error(`Max recursion depth ${this.config.maxDepth} reached`);
    }

    this.state.depth++;
    this.state.query = refinedQuery;

    return this.executeLoop();
  }

  private async executeLoop(): Promise<RLMResult> {
    // Implementation continues...
  }
}
```

### Tool Handler Implementation
```typescript
// Source: Adapted from Ollama tool calling docs
private handleToolCall(toolCall: ToolCall): string {
  const { name, arguments: args } = toolCall.function;

  switch (name) {
    case 'peek_context':
      return this.peekContext(args.startLine, args.endLine);

    case 'search_context':
      return this.searchContext(args.pattern);

    case 'sub_query':
      // This triggers recursion
      return this.scheduleSubQuery(args.chunkId, args.question);

    case 'final_answer':
      this.state.finalAnswer = args;
      return 'FINAL';

    default:
      return `Unknown tool: ${name}`;
  }
}

private peekContext(startLine: number, endLine: number): string {
  const lines = this.state.context.split('\n');
  const slice = lines.slice(startLine, endLine + 1);
  return slice.join('\n');
}

private searchContext(pattern: string): string {
  const regex = new RegExp(pattern, 'gi');
  const lines = this.state.context.split('\n');
  const matches = lines
    .map((line, i) => ({ line, index: i }))
    .filter(({ line }) => regex.test(line));

  return matches
    .slice(0, 10)  // Limit results
    .map(({ line, index }) => `[${index}] ${line}`)
    .join('\n');
}
```

### Confidence Scoring
```typescript
// Source: Adapted from RAG confidence research
interface ConfidenceFactors {
  retrievalScore: number;     // From hybrid search
  evidenceCoverage: number;   // Claims backed by chunks
  consistencyScore: number;   // Agreement across sub-queries
}

function calculateConfidence(factors: ConfidenceFactors): number {
  // Weighted combination - retrieval most important
  const weights = {
    retrieval: 0.5,
    evidence: 0.35,
    consistency: 0.15,
  };

  return (
    factors.retrievalScore * weights.retrieval +
    factors.evidenceCoverage * weights.evidence +
    factors.consistencyScore * weights.consistency
  );
}

function calculateEvidenceCoverage(
  claims: string[],
  evidence: Evidence[]
): number {
  if (claims.length === 0) return 1;

  const supportedClaims = claims.filter(claim =>
    evidence.some(e => e.claim === claim && e.sourceChunks.length > 0)
  );

  return supportedClaims.length / claims.length;
}
```
</code_examples>

<sota_updates>
## State of the Art (2025-2026)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| RAG (stuff all chunks in prompt) | RLM (context as external environment) | Oct 2025 | Handles 10M+ tokens, flat performance scaling |
| Heuristic depth limits | Verification-driven recursion | 2025 | More principled termination, better quality |
| Verbal confidence ("I'm 90% sure") | Retrieval-based confidence | 2025-26 | Actually correlates with correctness |
| LangChain everything | Lightweight custom orchestration | 2025 | Less bloat, more control, easier debugging |

**New tools/patterns to consider:**
- **RLM pattern:** Paper shows GPT-4o-mini with RLM beats GPT-4o and Claude 3.5 Sonnet on 1M+ token tasks
- **Ollama tool calling:** Native support as of v0.6, no need for external libraries
- **Zod structured outputs:** Type-safe JSON responses from local LLMs

**Deprecated/outdated:**
- **Direct context stuffing:** RLM shows this fails at scale
- **ReAct without verification:** Needs evidence loop to be reliable
- **Heavy agent frameworks for simple tasks:** Overkill, hard to debug
</sota_updates>

<open_questions>
## Open Questions

1. **Optimal recursion depth for code analysis**
   - What we know: Paper tested depth-1 sufficed for benchmarks
   - What's unclear: Code analysis may need deeper decomposition
   - Recommendation: Start with depth-1, add depth-2+ if needed based on quality metrics

2. **Local model capability for tool calling**
   - What we know: llama3.1:8b supports tools, larger models more reliable
   - What's unclear: Minimum model size for reliable RLM orchestration
   - Recommendation: Default to llama3.1:8b, document requirements, allow config override

3. **Evidence extraction granularity**
   - What we know: Need to link claims to chunks
   - What's unclear: Best approach for extracting claims from natural language
   - Recommendation: Start simple (sentence splitting), refine based on verification failures
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- [RLM Paper](https://arxiv.org/abs/2512.24601) - Core architecture, benchmarks, implementation guidance
- [RLM Blog Post](https://alexzhang13.github.io/blog/2025/rlm/) - Implementation details, REPL patterns
- [Ollama JS SDK](https://github.com/ollama/ollama-js) - Tool calling, structured output, streaming
- [LlamaIndex Workflow Docs](https://github.com/run-llama/llama_index) - Citation tracking, sub-question patterns

### Secondary (MEDIUM confidence)
- [Prime Intellect RLM Analysis](https://www.primeintellect.ai/blog/rlm) - Industry perspective, adoption
- [LangChain Agent Docs](https://docs.langchain.com) - ReAct patterns (used as reference, not dependency)
- [Confidence Scoring Research](https://arxiv.org/html/2503.15850) - UQ methods, calibration

### Tertiary (LOW confidence - needs validation)
- [Community RLM implementations](https://github.com/fullstackwebdev/rlm_repl) - Alternative patterns
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Recursive Language Models (RLM)
- Ecosystem: Ollama, Zod, minimal deps approach
- Patterns: REPL state, tool-based context inspection, evidence tracking
- Pitfalls: Context overflow, recursion loops, confidence calibration

**Confidence breakdown:**
- Standard stack: HIGH - Ollama already in use, Zod is standard
- Architecture: HIGH - Direct from RLM paper + verified patterns
- Pitfalls: HIGH - Documented in research + RAG literature
- Code examples: MEDIUM - Adapted from multiple sources, needs testing

**Research date:** 2026-01-21
**Valid until:** 2026-02-21 (30 days - RLM is new but pattern is stable)
</metadata>

---

*Phase: 02-rlm-engine-core*
*Research completed: 2026-01-21*
*Ready for planning: yes*
