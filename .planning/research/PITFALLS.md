# Pitfalls Research

**Domain:** Code Intelligence / Recursive Language Model (RLM) System
**Researched:** 2026-01-20
**Confidence:** MEDIUM (mix of academic research, production post-mortems, and community experience)

## Critical Pitfalls

### Pitfall 1: Naive Code Chunking

**What goes wrong:**
Fixed-size or character-based chunking splits code mid-function, mid-class, or mid-statement. Embeddings for these fragments capture meaningless snippets that fail to match semantic queries. A search for "authentication logic" returns half a function that starts with `return token`. Text splitters designed for prose destroy code structure.

**Why it happens:**
Teams copy chunking strategies from document RAG without recognizing that code has fundamentally different structure. The quick path (500-character splits) appears to work in demos with small test sets but fails at scale with real queries.

**How to avoid:**
- Use AST-based chunking that respects language syntax boundaries (functions, classes, modules)
- Prepend structural context to each chunk (file path, class membership, function signature)
- Keep chunks small (target ~500 tokens) but semantically complete
- For languages without AST support, use tree-sitter or language-specific parsers
- Implement fallback to line-based splitting only at natural boundaries (blank lines, comment blocks)

**Warning signs:**
- Chunks that start or end mid-statement
- Search results returning code that makes no sense without surrounding context
- High recall but low precision in retrieval evaluation
- Embedding similarity between completely unrelated code snippets

**Phase to address:** Phase 1 (Core Infrastructure) - must be correct from the start

**Sources:**
- [Building code-chunk: AST Aware Code Chunking](https://supermemory.ai/blog/building-code-chunk-ast-aware-code-chunking/) - HIGH confidence
- [cAST: Enhancing Code RAG with AST](https://arxiv.org/html/2506.15655v1) - HIGH confidence (5.5 points gain with AST chunking)
- [Stack Overflow: Chunking in RAG](https://stackoverflow.blog/2024/12/27/breaking-up-is-hard-to-do-chunking-in-rag-applications/) - HIGH confidence

---

### Pitfall 2: Context Loss in Recursive Calls

**What goes wrong:**
RLM systems that recursively call sub-LLMs lose critical context at each hop. Information from the original query or earlier reasoning steps gets compressed or dropped as it passes through multiple levels. By recursion depth 3-5, the sub-agent is working from a "partial snapshot" that misses key constraints or requirements from the original request.

**Why it happens:**
Each hand-off between recursion levels requires summarizing or truncating context to fit context windows. Sequential chains compress earlier messages, eroding information fidelity with each hop. Developers assume sub-agents will "just know" what the parent intended.

**How to avoid:**
- Implement explicit context propagation with structured state objects passed through recursion
- Use compression strategies that preserve key facts, not just recent text
- Limit recursion depth to 3 for most queries; reserve depth 4-5 for explicitly complex multi-hop tasks
- Implement verification loops that check sub-call results against original query requirements
- Store critical context (original query, constraints, partial results) in a shared memory accessible at all depths

**Warning signs:**
- Sub-agent outputs that ignore constraints from the original request
- Correct individual steps that produce wrong final answers
- Increasing error rates as recursion depth increases
- "Drift" where recursive calls progressively move away from the original intent

**Phase to address:** Phase 2 (Recursive Processing) - core architecture concern

**Sources:**
- [Recursive Language Models (MIT)](https://arxiv.org/abs/2512.24601) - HIGH confidence
- [Why Multi-Agent LLM Systems Fail](https://galileo.ai/blog/multi-agent-llm-systems-fail) - HIGH confidence (40% of multi-agent pilots fail within 6 months)
- [Prime Intellect RLM Blog](https://www.primeintellect.ai/blog/rlm) - MEDIUM confidence

---

### Pitfall 3: Embedding Model Mismatch for Code

**What goes wrong:**
Using general-purpose text embedding models for code search produces high false positive rates. The model maps syntactically similar but semantically different code to nearly identical vectors. Searches for "JWT authentication" return results about "session authentication" because both have similar import statements and function signatures.

**Why it happens:**
Embedding models trained on natural language see code as text and miss its structural semantics. Generic method names like "get," "set," "main" create vector collisions. Negation and logic operators are poorly represented (code that checks `if not authenticated` maps close to `if authenticated`).

**How to avoid:**
- Use code-specific embedding models (CodeBERT, StarCoder embeddings, or fine-tuned models)
- Combine semantic search with lexical search (BM25 hybrid approach reduces failures by 49%)
- Add structural metadata to embeddings (function signature, return type, dependencies)
- Fine-tune embeddings on your specific codebase patterns
- Implement reranking with cross-encoders for final result ordering

**Warning signs:**
- High similarity scores between code with opposite logic
- Search results that match syntactic patterns but wrong semantics
- Inability to distinguish overloaded methods or similarly-named functions
- Benchmark accuracy that drops significantly on real codebase queries vs. synthetic tests

**Phase to address:** Phase 1 (Core Infrastructure) - embedding model selection is foundational

**Sources:**
- [Anthropic Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) - HIGH confidence (49-67% failure reduction with hybrid approach)
- [Hallucination by Design: How Embedding Models Misunderstand Language](https://hackernoon.com/hallucination-by-design-how-embedding-models-misunderstand-language) - MEDIUM confidence
- [RAG for Large Scale Code Repos (Qodo)](https://www.qodo.ai/blog/rag-for-large-scale-code-repos/) - MEDIUM confidence

---

### Pitfall 4: Retrieval Latency Explosion at Scale

**What goes wrong:**
Systems that meet the <500ms latency target with 10k documents fail catastrophically at 1M+ tokens. Vector similarity search without proper indexing becomes O(n), memory usage spikes cause garbage collection pauses, and unindexed points force full scans.

**Why it happens:**
Prototype-level systems use brute-force search that works fine during development. Teams don't test with production data volumes. Qdrant and similar databases require explicit optimization that isn't enabled by default.

**How to avoid:**
- Configure HNSW indexes from the start (tune ef, m parameters for your latency/recall tradeoff)
- Use scalar quantization to reduce memory by 75% while maintaining accuracy
- Set `indexed_only=true` for searches when eventual consistency is acceptable
- Implement payload indexes for any filtered queries
- Use local SSDs with 50k+ IOPS for on-disk storage
- Monitor P99 latency, not just average - tail latency reveals real problems

**Warning signs:**
- Latency spikes during peak usage
- Memory usage growing faster than document count
- Search latency increasing as more documents are indexed
- P99 latency significantly higher than P50

**Phase to address:** Phase 1 (Core Infrastructure) and Phase 4 (Performance Optimization)

**Sources:**
- [Qdrant Performance Optimization Guide](https://qdrant.tech/documentation/guides/optimize/) - HIGH confidence
- [Qdrant Vector Search in Production](https://qdrant.tech/articles/vector-search-production/) - HIGH confidence
- [LSIF Backend Evolution at Sourcegraph](https://www.eric-fritz.com/articles/lsif-backend-evolution/) - HIGH confidence (describes OOM crashes with large indexes)

---

### Pitfall 5: Ollama Scalability Limits

**What goes wrong:**
Ollama, the local-first LLM runtime, has a hard throughput ceiling of ~0.5 requests/second and cannot scale beyond 4 concurrent requests by default. Systems designed around Ollama hit walls when real users generate concurrent queries. Latency jumps from acceptable to 500ms+ under load.

**Why it happens:**
Ollama is designed for single-user local development, not production serving. Its architecture prioritizes simplicity over throughput. Teams choose it for easy setup and assume it will scale with hardware.

**How to avoid:**
- Design for Ollama's limitations: single-user flows, batch processing, or queue-based architectures
- Implement request queuing with backpressure to prevent overload
- Pre-compute embeddings and cache results aggressively
- Consider vLLM or OpenLLM for any multi-user or high-throughput scenarios
- Monitor queue depth and implement graceful degradation when capacity is exceeded
- Use smaller, faster models (7B) and accept quality tradeoffs for latency-critical paths

**Warning signs:**
- Throughput flat-lining regardless of hardware upgrades
- Queue depth growing under normal load
- P99 latency 10x worse than P50
- Out-of-memory crashes during concurrent requests

**Phase to address:** Phase 1 (Core Infrastructure) - critical architecture decision

**Sources:**
- [Ollama vs vLLM Benchmark (Red Hat)](https://developers.redhat.com/articles/2025/08/08/ollama-vs-vllm-deep-dive-performance-benchmarking) - HIGH confidence (41 TPS vs 793 TPS at scale)
- [Ollama Performance Tuning Guide](https://dasroot.net/posts/2026/01/ollama-performance-tuning-gpu-acceleration-model-quantization/) - MEDIUM confidence
- [Ollama GitHub Issue #4843](https://github.com/ollama/ollama/issues/4843) - HIGH confidence (real user reports)

---

### Pitfall 6: Missing Cross-File Context in Code Retrieval

**What goes wrong:**
Retrieval returns the right code snippet but without the imports, type definitions, or related functions needed to understand it. The LLM generates code that references undefined symbols or uses incorrect types because the retrieved context is incomplete.

**Why it happens:**
Code intelligence systems treat each file as independent. Chunking ignores dependency relationships. The retriever optimizes for the single most relevant chunk rather than the cluster of related code.

**How to avoid:**
- Build and index a dependency graph alongside embeddings
- Retrieve related symbols (imports, base classes, called functions) along with primary results
- Use LSP/LSIF data to understand symbol relationships
- Implement multi-hop retrieval that follows references
- Include file-level and module-level context in chunk metadata

**Warning signs:**
- Generated code with undefined symbol errors
- Retrieved functions missing their helper utilities
- Correct answers for simple queries, wrong answers for queries requiring cross-file understanding
- Users manually adding "also include X" to their queries

**Phase to address:** Phase 2 (Recursive Processing) - requires graph-based retrieval

**Sources:**
- [Sourcegraph LSIF Evolution](https://sourcegraph.com/blog/evolution-of-the-precise-code-intel-backend) - HIGH confidence
- [Software Dependency Graphs](https://www.puppygraph.com/blog/software-dependency-graph) - MEDIUM confidence
- [Codebase Parser with Graph + Vector](https://medium.com/@rikhari/codebase-parser-a-graph-vector-powered-tool-to-understand-visualize-and-query-any-codebase-90d065c24f15) - MEDIUM confidence

---

### Pitfall 7: Silent Retrieval Failures

**What goes wrong:**
The system confidently generates wrong answers because retrieved context is irrelevant, but similarity scores are "good enough" to pass thresholds. Users receive plausible-sounding but incorrect code. There's no signal that retrieval failed.

**Why it happens:**
Vector similarity always returns results - it cannot say "I don't know." Fixed top-K retrieval ignores confidence. Systems lack fallback mechanisms for low-quality retrieval.

**How to avoid:**
- Implement retrieval confidence scoring beyond raw similarity
- Use rerankers to validate semantic relevance of top-K results
- Set dynamic thresholds that trigger "I don't know" responses
- Add explicit verification: instruct the LLM to cite specific retrieved content
- Log and monitor retrieval quality metrics in production
- Implement human-in-the-loop for low-confidence queries

**Warning signs:**
- Confident wrong answers that cite non-existent code
- Similarity scores clustered around the same value regardless of query
- Users reporting "hallucinated" function names or APIs
- No "I don't know" responses even for clearly out-of-scope queries

**Phase to address:** Phase 3 (Agent Orchestration) - requires quality gates

**Sources:**
- [Seven Failure Points in RAG Systems](https://arxiv.org/html/2401.05856v1) - HIGH confidence (FP1: Missing Content, FP2: Missed Top Ranked)
- [23 RAG Pitfalls](https://www.nb-data.com/p/23-rag-pitfalls-and-how-to-fix-them) - HIGH confidence (Pitfall #17: No Fallback)
- [Six Lessons from Production RAG](https://towardsdatascience.com/six-lessons-learned-building-rag-systems-in-production/) - HIGH confidence

---

### Pitfall 8: Evaluation Blind Spots

**What goes wrong:**
Internal tests show 90%+ accuracy but real users report constant failures. The evaluation dataset doesn't represent actual query patterns. "Broken benchmarks" show 100% recall because the test is fundamentally flawed (query text literally exists in target documents).

**Why it happens:**
Teams use synthetic or curated test sets that don't match production query distributions. Edge cases and rare query patterns are underrepresented. Evaluation metrics (precision, recall) don't capture semantic correctness.

**How to avoid:**
- Include real user queries in evaluation sets (with consent)
- Test with adversarial examples: negation, ambiguity, multi-hop questions
- Measure faithfulness (did the answer come from retrieved context?) not just relevance
- Use LLM-as-judge evaluation alongside automated metrics
- Implement continuous evaluation in production, not just pre-deployment
- Track retrieval metrics separately from generation metrics

**Warning signs:**
- Benchmark accuracy much higher than user-reported satisfaction
- Test queries that are suspiciously similar to indexed documents
- No evaluation of edge cases or failure modes
- Metrics that never change even as the system evolves

**Phase to address:** Phase 4 (Performance Optimization) - continuous concern

**Sources:**
- [RAG Evaluation Guide (Evidently AI)](https://www.evidentlyai.com/llm-guide/rag-evaluation) - HIGH confidence
- [Evaluating RAG for Large Scale Codebases (Qodo)](https://www.qodo.ai/blog/evaluating-rag-for-large-scale-codebases/) - MEDIUM confidence
- [AST Chunking - Broken Benchmark Discussion](https://supermemory.ai/blog/building-code-chunk-ast-aware-code-chunking/) - HIGH confidence

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Fixed-size chunking | Fast implementation, no language parsing | Wrong retrieval results, poor semantic coherence | Never for code; OK for exploratory text indexing |
| Single embedding model | Simpler architecture | Miss exact matches, domain-specific terms fail | Early prototyping only |
| Brute-force vector search | No index configuration needed | Latency explosion at scale, OOM crashes | <10k documents, development only |
| Skip reranking | Lower latency, simpler pipeline | 30-40% worse precision on complex queries | Low-stakes applications |
| Global recursion depth limit | Easy to implement | Either too restrictive or too permissive per query | MVP only; production needs dynamic limits |
| Synchronous recursive calls | Simpler debugging | Latency compounds, timeout cascades | Never for user-facing queries |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Qdrant | Not creating payload indexes for filtered queries | Create indexes for all fields used in filters before deploying |
| Qdrant | Using default segment count | Set segments = CPU cores for low-latency workloads |
| Ollama | Assuming it scales like cloud APIs | Design for 0.5 req/s ceiling, implement queuing |
| Ollama | Running without memory limits | Set OLLAMA_MAX_LOADED_MODELS=1 for predictable memory |
| AST Parsers | Assuming all languages supported | Have fallback chunking for unsupported languages |
| Embedding Models | Mixing models between index and query time | Version embeddings, re-index when changing models |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unindexed vector search | Latency grows linearly with documents | Configure HNSW index parameters upfront | >50k vectors |
| No embedding cache | Repeated embedding calls for same content | Cache embeddings by content hash | Any production use |
| Large top-K retrieval | Context overflow, LLM truncates important info | Retrieve 10, rerank to 3-5 | >5 results returned to LLM |
| Full document re-indexing | Hours-long reindex on any document change | Implement incremental indexing | >100k documents |
| Synchronous recursive LLM calls | Latency = sum of all depths | Parallelize independent sub-calls | Recursion depth > 2 |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing Ollama API to network | Remote code execution via prompt injection | Bind to localhost (127.0.0.1), use firewall |
| Running with `--dangerously-skip-permissions` | Unintended file modifications/deletions | Use isolated working directories, never with sensitive data |
| Indexing secrets in code | API keys, credentials exposed via retrieval | Pre-filter files matching `.env`, `*credentials*`, `*secret*` |
| No permission-aware retrieval | Confidential code accessible to unauthorized users | Implement access control at retrieval time |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Confident wrong answers | Users lose trust permanently, stop using system | Implement confidence signals, "I don't know" responses |
| No source attribution | Users can't verify answers, don't trust results | Cite specific files, line numbers, code snippets |
| Slow first response | Users abandon before seeing value | Show progress, stream partial results |
| All-or-nothing responses | Simple queries get same latency as complex ones | Fast path for simple queries, reserve recursion for complex |

## "Looks Done But Isn't" Checklist

- [ ] **Chunking:** Often missing overlap between chunks - verify no context is split at chunk boundaries
- [ ] **Embeddings:** Often missing re-indexing when model changes - verify embeddings versioned and regenerated
- [ ] **Search:** Often missing hybrid (BM25 + vector) - verify exact match terms still find results
- [ ] **Recursion:** Often missing depth tracking per query - verify recursion doesn't exceed limits silently
- [ ] **Latency:** Often missing P99 measurement - verify tail latency is acceptable, not just average
- [ ] **Evaluation:** Often missing edge case coverage - verify negation, multi-hop, and ambiguous queries tested
- [ ] **Fallback:** Often missing "I don't know" path - verify low-confidence queries don't hallucinate
- [ ] **Cross-file:** Often missing dependency resolution - verify related code is retrieved together

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong chunking strategy | HIGH | Re-chunk entire corpus, regenerate all embeddings, re-index |
| Embedding model mismatch | HIGH | Select new model, regenerate embeddings, re-index, re-evaluate |
| Missing HNSW indexes | MEDIUM | Create indexes (may take hours for large collections), no data loss |
| Context loss in recursion | MEDIUM | Refactor context passing, test all recursion paths |
| Silent retrieval failures | MEDIUM | Add confidence scoring, implement fallbacks, retrain user trust |
| Ollama scalability hit | HIGH | Architecture change required: add queuing or switch to vLLM |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Naive code chunking | Phase 1 (Core Infrastructure) | AST parser handles all target languages, chunks are semantically complete |
| Context loss in recursion | Phase 2 (Recursive Processing) | Test query at depth 5 still references original constraints |
| Embedding model mismatch | Phase 1 (Core Infrastructure) | Hybrid search (BM25 + vector) implemented, code-specific model selected |
| Retrieval latency explosion | Phase 1 + Phase 4 | P99 latency <500ms at 1M tokens load test |
| Ollama scalability limits | Phase 1 (Core Infrastructure) | Queue-based architecture handles concurrent users gracefully |
| Missing cross-file context | Phase 2 (Recursive Processing) | Multi-hop queries retrieve related symbols correctly |
| Silent retrieval failures | Phase 3 (Agent Orchestration) | "I don't know" responses for out-of-scope queries |
| Evaluation blind spots | Phase 4 (Performance Optimization) | Real user queries in test set, edge cases covered |

## Sources

### Post-Mortems and Production Experience
- [Six Lessons from Production RAG (Towards Data Science)](https://towardsdatascience.com/six-lessons-learned-building-rag-systems-in-production/) - Production deployment insights
- [Building Production RAG: Lessons from 50+ Deployments (Dev.to)](https://dev.to/hamidomarov/building-production-rag-in-2024-lessons-from-50-deployments-5fh9) - Multi-deployment patterns
- [Why Multi-Agent LLM Systems Fail (Galileo)](https://galileo.ai/blog/multi-agent-llm-systems-fail) - 40% failure rate in multi-agent pilots

### Academic Research
- [Seven Failure Points in RAG Systems (arXiv)](https://arxiv.org/html/2401.05856v1) - Systematic failure taxonomy
- [Recursive Language Models (MIT, arXiv)](https://arxiv.org/abs/2512.24601) - RLM architecture and limitations
- [cAST: Code RAG with AST Chunking (arXiv)](https://arxiv.org/html/2506.15655v1) - Empirical chunking improvements
- [Semantic Illusion: Limits of Embedding-Based Detection (arXiv)](https://arxiv.org/abs/2512.15068) - Embedding model failures

### Industry Documentation
- [Anthropic Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) - 67% failure reduction with hybrid approach
- [Qdrant Performance Optimization](https://qdrant.tech/documentation/guides/optimize/) - Vector database tuning
- [Sourcegraph LSIF Evolution](https://sourcegraph.com/blog/evolution-of-the-precise-code-intel-backend) - Code intelligence at scale

### Community Discussions
- [23 RAG Pitfalls and Fixes](https://www.nb-data.com/p/23-rag-pitfalls-and-how-to-fix-them) - Comprehensive pitfall list
- [Stack Overflow: Chunking in RAG](https://stackoverflow.blog/2024/12/27/breaking-up-is-hard-to-do-chunking-in-rag-applications/) - Practitioner perspective
- [Ollama Performance Benchmarking](https://developers.redhat.com/articles/2025/08/08/ollama-vs-vllm-deep-dive-performance-benchmarking) - Local LLM limitations

### Reference Implementation
- [brainqub3/claude_code_RLM (GitHub)](https://github.com/brainqub3/claude_code_RLM) - RLM reference implementation (experimental, not production-ready)

---
*Pitfalls research for: Code Intelligence / Recursive Language Model (RLM) System*
*Researched: 2026-01-20*
*Project constraints: <500ms retrieval latency, recursion depth max 5, 85% test coverage, local-first with Ollama+Qdrant*
