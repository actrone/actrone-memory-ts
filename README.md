# @actrone/memory

**Give your JS/TS agent a memory in three lines.** Two-tier persistent memory —
short-term session turns + long-term semantic recall — with a pluggable store
(in-memory by default; Redis/Qdrant adapters) and embeddings. Zero required
dependencies for the on-ramp; MIT licensed.

It's the open-source counterpart to Actrone's governed, hosted memory: when you
outgrow self-hosting, **swap one import** and every call runs through the
governed Orchestrator (PII-tokenised, audited, policy-bounded) — same API.

```text
  storeTurn ─────────────▶ L1  short-term session turns  (recency, token-budgeted)
  injectMemory ──┐
                 └───────▶ L2  long-term semantic memory  (embeddings)

  retrieveContext(query, budget)
        │  embed query + fetch recent turns (parallel)
        │  → L2 search  (+ optional hybrid BM25/RRF, + optional rerank)
        │  → allocate token budget  → prune to fit
        ▼
  { recentTurns, episodicMemories }   ── prepend to your prompt
```

```bash
npm install @actrone/memory
```

## Quick start

```ts
import { MemoryManager } from "@actrone/memory";

const mm = await MemoryManager.create(); // in-memory + local embedder, no services

await mm.storeTurn("support-bot", "sess-1", "What's your refund policy?", "Within 5 days.");
await mm.injectMemory("support-bot", "The customer is on the Enterprise plan.", 0.9);

const ctx = await mm.retrieveContext("support-bot", "sess-1", "refund enterprise", 4096);
// ctx.recentTurns   — the recent conversation, pruned to the session budget
// ctx.episodicMemories — semantically relevant long-term memories
```

## The one-import upgrade to governed hosted memory

```ts
// Self-hosted (this library)
import { MemoryManager } from "@actrone/memory";
const mm = await MemoryManager.create();

// Hosted + governed (Actrone Orchestrator) — same methods, same result shapes.
// Only the import line changes; the rest of your code keeps using `MemoryManager`.
import { ActroneMemoryManager as MemoryManager } from "@actrone/sdk";
const mm = new MemoryManager({ apiKey: process.env.ACTRONE_API_KEY! });
```

## API

`MemoryManager` (all methods async):

| Method | Purpose |
| --- | --- |
| `create(options?)` | Build a manager (in-memory default; pass `l1`/`l2`/`embedder` for Redis/Qdrant/real embeddings) |
| `storeTurn(agentId, sessionId, userMessage, assistantMessage, toolResults?)` | Persist a conversation turn → turn id |
| `retrieveContext(agentId, sessionId, query, tokenBudget)` | Assemble budget-bounded context (4-phase: parallel fetch → allocate → rank → prune) |
| `injectMemory(agentId, content, importance?, sessionId?, topicTags?)` | Write a long-term fact → memory id |
| `searchMemories(agentId, query, limit?)` | Semantic search over long-term memory |
| `deleteMemory(agentId, memoryId)` | Remove a memory |
| `clearSession(agentId, sessionId)` | Clear session turns (long-term memories persist) |
| `getSessionMetadata(agentId, sessionId)` | Session stats, or `null` if expired |

## Pluggable stores & embeddings

The default `InMemoryStore` + `LocalEmbedder` need no services and make the whole
test suite run offline. Swap them for durability + real semantic quality:

```ts
const mm = await MemoryManager.create({
  l1: myRedisStore,       // implements L1Store
  l2: myQdrantStore,      // implements L2Store
  embedder: myOpenAIEmbedder, // implements Embedder
  config: { relevanceThreshold: 0.75 },
});
```

`L1Store`, `L2Store`, and `Embedder` are small interfaces — implement them against
any backend without touching the manager.

## Framework compatibility

Adapters live in `@actrone/memory/adapters` and are **structural** — none imports its framework at
runtime, so nothing is bundled and the base install pulls only `zod`. Install the framework you use;
the versions below are the optional `peerDependencies` each recipe is tested against (npm warns on a
mismatch). Every framework recipe is CI-typechecked against the current adapter API
(`examples/frameworks/`); run `npx @actrone/memory add <framework>` for a copy-paste recipe.

| Framework | Adapter | Tested peer version |
| --- | --- | --- |
| Vercel AI SDK | `vercelMemory` | `ai >=5 <6` |
| LangChain.js | `langchainMemory` / `langchainChatHistory` | `@langchain/core >=0.2 <2` |
| LangGraph.js | `langgraphMemory` | `@langchain/langgraph >=0.1 <2` |
| Mastra | `mastraMemory` | `@mastra/core >=0.10 <1` |
| LlamaIndex.TS | `llamaindexMemory` / `llamaindexChatMemory` | `llamaindex >=0.8 <1` |
| OpenAI Agents JS | `openaiAgentsMemory` | `@openai/agents >=0.1 <1` |
| Firebase Genkit | `genkitMemory` | `genkit >=1 <2` |
| VoltAgent | `voltagentMemory` | `@voltagent/core >=0.1 <2` |
| Claude Agent SDK | `claudeAgentMemory` | `@anthropic-ai/claude-agent-sdk >=0.1 <1` |
| Cloudflare Agents | `cloudflareAgentsMemory` | `agents >=0.0.1 <1` |
| Inngest AgentKit | `inngestAgentKitMemory` | `@inngest/agent-kit >=0.5 <1` |

**Adapter depth (honest scope).** Most adapters are lightweight, framework-idiomatic
helpers: `recall` → a governed context string you inject as `system`/`instructions`,
and `remember` → persist the completed turn. Two go deeper and implement the
framework's own message-history contract — `langchainChatHistory` (a governed
`BaseListChatMessageHistory` duck-type for `RunnableWithMessageHistory`) and
`llamaindexChatMemory` (the current LlamaIndex.TS `Memory` shape). This is *not* full
parity with the Python library's per-framework memory subclasses; it is the pragmatic
TS surface, and every recipe is CI-typechecked against the current adapter API. The
framework-agnostic core (`recall` / `remember` / `memoryFor`) works with any framework.

## Configuration

`MemoryManager.create({ config })` takes a partial `MemoryConfig` merged over
`DEFAULT_CONFIG`; unset keys keep their defaults. Common knobs:

| Key | Purpose |
| --- | --- |
| `relevanceThreshold` | Minimum L2 similarity for a memory to be recalled. |
| `maxEpisodicMemories` | Cap on long-term memories considered per retrieval. |
| `budgetFractionSession` / `budgetFractionEpisodic` | How the token budget is split between recent turns and long-term memory. |
| `hybridRetrieval` | Fuse lexical (BM25) + dense signals via reciprocal-rank fusion. |
| `relevanceWeight` / `recencyWeight` | Balance semantic relevance against recency in L2 ranking. |

Stores and embeddings are injected, not configured by env — pass `l1` / `l2` /
`embedder` / `reranker` to `create()`. The defaults (`InMemoryStore` + `LocalEmbedder`)
need no services, so the whole test suite runs offline.

## Architecture

The `retrieveContext` recall pipeline (GitHub renders the diagram):

```mermaid
flowchart TD
    Q["retrieveContext(query, budget)"] --> P1["embed query + fetch recent L1 turns<br/>(parallel)"]
    P1 --> L2["L2 semantic search"]
    L2 -->|"hybridRetrieval"| RRF["+ BM25 / reciprocal-rank fusion (optional)"]
    RRF --> RR["+ cross-encoder rerank top-K (optional)"]
    L2 --> RR
    RR --> ALLOC["allocate token budget<br/>session vs episodic"]
    ALLOC --> PRUNE["priority-weighted prune to fit"]
    PRUNE --> OUT["{ recentTurns, episodicMemories }"]
```

## Troubleshooting

- **`retrieveContext` returns no `episodicMemories`.** Nothing cleared the
  `relevanceThreshold` (default `0.7`) for that query, or you're on the `LocalEmbedder`
  (a fast, deterministic hash embedder for offline dev — swap in a real `Embedder` for
  production-quality recall). Lower `relevanceThreshold` or inject real embeddings.
- **`TokenBudgetError: tokenBudget must be > 0`.** `retrieveContext` needs a positive
  token budget (e.g. `4096`).
- **Redis/Qdrant not used.** Stores are *injected*, not auto-detected — pass
  `l1: new RedisL1Store(...)` / `l2: new QdrantL2Store(...)` to `MemoryManager.create()`.
- **`npm warn` about an optional peer version.** Adapters are structural (nothing is
  imported at runtime); the peer ranges only make the tested version machine-legible.
  Install the framework you actually use; ignore the others' warnings.
- **CLI recipe.** `npx @actrone/memory add <framework>` prints an install + copy-paste
  recipe; `--write <file>` creates one new self-contained file (never overwrites).

## Development

```bash
npm install
npm run typecheck && npm test && npm run build
```

## License

MIT.
