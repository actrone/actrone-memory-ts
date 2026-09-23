# actrone-memory

> **Persistent memory for AI agents, so they never forget who you are.**

[![npm version](https://img.shields.io/npm/v/actrone-memory?color=brightgreen&label=npm)](https://www.npmjs.com/package/actrone-memory)
[![node](https://img.shields.io/node/v/actrone-memory)](https://www.npmjs.com/package/actrone-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/actrone/actrone-memory-ts/blob/main/LICENSE)
[![CI](https://github.com/actrone/actrone-memory-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/actrone/actrone-memory-ts/actions)

The TypeScript counterpart to [`actrone-memory`](https://github.com/actrone/actrone-memory-py)
for Python. Same two-tier model, same result shapes, same one-import upgrade path.

---

![A fact landing and being classified by sensitivity](https://raw.githubusercontent.com/actrone/actrone-memory-ts/main/media/oss-launch-loop.gif)

*[Watch the one-minute walkthrough, narrated](https://raw.githubusercontent.com/actrone/actrone-memory-ts/main/media/oss-launch-16x9.mp4)*
*([1:1](https://raw.githubusercontent.com/actrone/actrone-memory-ts/main/media/oss-launch-1x1.mp4) and
[9:16](https://raw.githubusercontent.com/actrone/actrone-memory-ts/main/media/oss-launch-9x16.mp4) cuts.)*

**Give your JS/TS agent a memory in three lines.** Two-tier persistent memory
(short-term session turns plus long-term semantic recall) with a pluggable store
(in-memory by default; Redis/Qdrant adapters) and embeddings. Zero required
dependencies for the on-ramp; MIT licensed.

It's the open-source counterpart to Actrone's governed, hosted memory: when you
outgrow self-hosting, **swap one import** and every call runs through the
governed Orchestrator (PII-tokenised, audited, policy-bounded) with the same API.

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
npm install actrone-memory
```

## Quick start

```ts
import { MemoryManager } from "actrone-memory";

const mm = await MemoryManager.create(); // in-memory store, no services, no API key

await mm.storeTurn("support-bot", "sess-1", "What's your refund policy?", "Within 5 days.");
await mm.injectMemory("support-bot", "The customer is on the Enterprise plan.", 0.9);

const ctx = await mm.retrieveContext("support-bot", "sess-1", "Which plan is the customer on?", 4096);
// ctx.recentTurns      : the recent conversation, pruned to the session budget
// ctx.episodicMemories : relevant long-term memories, here the Enterprise plan fact
```

**Keyword recall or semantic recall.** With nothing else installed, `create()` uses the
lexical `LocalEmbedder`: it recalls memories that share words with the query, and says so
once with a process warning. Install `fastembed` and `create()` switches to
bge-small-en-v1.5, still on your machine, which recalls by meaning: "food allergies" then
finds "The user is allergic to peanuts." The first run downloads the model (about 130 MB)
to `~/.cache/actrone-memory/fastembed`, or to `FASTEMBED_CACHE_PATH` if you set it.

```bash
npm install fastembed
```

## The one-import upgrade to governed hosted memory

```ts
// Self-hosted (this library)
import { MemoryManager } from "actrone-memory";
const mm = await MemoryManager.create();

// Hosted + governed (Actrone Orchestrator): same methods, same result shapes.
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

The defaults, `InMemoryStore` plus the best local embedder, need no services. Swap them
for durability or a hosted embedding model:

```ts
const mm = await MemoryManager.create({
  l1: myRedisStore,       // implements L1Store
  l2: myQdrantStore,      // implements L2Store
  embedder: myOpenAIEmbedder, // implements Embedder; set relevanceThreshold for it (see Configuration)
});
```

`L1Store`, `L2Store`, and `Embedder` are small interfaces, so you can implement them
against any backend without touching the manager. What ships:

| Tier | Adapters |
| --- | --- |
| Hot session (L1) | `InMemoryStore` (default), `RedisL1Store`, `PostgresL1Store` |
| Long-term semantic (L2) | `InMemoryStore` (default), `QdrantL2Store`, `PgVectorL2Store` |

Every adapter takes an **injected client**, so this package has no hard `ioredis`,
`@qdrant/js-client-rest` or `pg` dependency.

**Redis-compatible servers need no separate adapter.** `RedisL1Store` uses only standard
commands, so **Valkey**, DragonflyDB, ElastiCache and Upstash work with it as-is.

**Postgres runs both tiers**, which is the "no new infrastructure" option: if you already run
Postgres with the [pgvector](https://github.com/pgvector/pgvector) extension, memory needs no
extra service at all. One pool serves both.

```ts
import { Pool } from "pg";
import { MemoryManager, PostgresL1Store, PgVectorL2Store } from "actrone-memory";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const l1 = new PostgresL1Store(pool);
const l2 = new PgVectorL2Store(pool, { dimensions: 1536 });
await l1.ensureSchema();
await l2.ensureSchema();

const mm = await MemoryManager.create({ l1, l2, embedder: myEmbedder });
```

### Bring your own store

The built-in adapters have no privileged access: they implement `L1Store` and `L2Store` like
anything else would. Any engine that can satisfy those interfaces plugs in without touching
the manager, and the store you pass is used as-is, so no built-in backend is constructed or
connected behind it.

```ts
import { MemoryManager } from "actrone-memory";

class MyWeaviateStore implements L2Store {
  async upsert(entry) { /* ... */ }
  async search(params) { /* ... */ }
  async delete(memoryId) { /* ... */ }
  async deleteAgentMemories(agentId) { /* ... */ }
}

const mm = await MemoryManager.create({ l2: new MyWeaviateStore(client) });
```

Two things worth knowing before you write one:

- **Return the embedding with each search hit** if you rank with the bundled `hybridRank`
  helper, which recomputes cosine locally. If your database ranks server-side and does not
  return vectors (Pinecone needs `includeValues`), use `fuseChannels` with its own scores
  instead, the way `QdrantL2Store` does.
- **`close()` and `tryAcquireSummaryLock()` are optional.** Implement `close()` if your store
  opens its own connection; `MemoryManager.close()` calls it. Implement the lock with a
  single atomic operation if you want fleet-wide background-job coordination.

### Verifying your own store

To make that a supported extension point rather than a claim, the package ships the same
conformance suite the built-in stores are held to:

```ts
import { checkL1Store, checkL2Store } from "actrone-memory/testing";

await checkL2Store(() => new MyWeaviateStore(client), { dimensions: 1536 });
```

It checks the behaviours the type system cannot: turns come back oldest-first, `n` windows
from the end, a search never returns another agent's memories, `threshold`, `limit` and
`contentTypes` are honoured, an upsert replaces rather than duplicates, erasure is scoped,
and a summary lock admits one holder. Each failure throws `ConformanceError` naming the
requirement. The Python library ships the same suite as `actrone_memory.testing` against the
same contract, so an adapter in either language is held to the same bar.

## Privacy and PII: local-first by default, cloud-capable

This library is **local-first by default**: the built-in embedder runs in-process and fact extraction is
opt-in, so with the defaults **nothing leaves your machine**: no API key, no egress. It is also
**cloud-capable**, so you can inject any OpenAI-compatible embedder or extractor.

**Important, and this is exactly where PII protection holds.** The sensitivity classification (`none/low/pii/sensitive`) is
produced *by* the extraction step, and that step (and any real embedder) sees the **raw** text. So PII
protection here holds **only for local models** (in-process or a local Ollama endpoint, so zero-egress). If you
point extraction or embeddings at a **cloud** provider, the raw text, including PII-classified content, is
sent to that provider. This library does **not** tokenise it first.

Actrone's **hosted** platform adds **MAL (Memory Abstraction Layer)**, which tokenises PII *before* any
inference, a structural guarantee that makes **cloud** models safe. Same API (`MemoryManager`), so migrating
is a one-import change. Short form: **local-first by default; cloud-capable; PII stays protected only on local
models; MAL (hosted) makes cloud safe.**

## Framework compatibility

Adapters live in `actrone-memory/adapters` and are **structural**: none imports its framework at
runtime, so nothing is bundled and the base install pulls only `zod`. Install the framework you use;
the versions below are the optional `peerDependencies` each recipe is tested against (npm warns on a
mismatch). Every framework recipe is CI-typechecked against the current adapter API
(`examples/frameworks/`); run `npx actrone-memory add <framework>` for a copy-paste recipe.

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
helpers: `recall` returns a governed context string you inject as `system`/`instructions`,
and `remember` persists the completed turn. Two go deeper and implement the
framework's own message-history contract: `langchainChatHistory` (a governed
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
| `relevanceThreshold` | Minimum similarity for a long-term memory to be recalled. Leave unset to use the embedder's calibrated value: `0.3` for the lexical `LocalEmbedder`, `0.63` for bge-small-en-v1.5, and `0.7` for an embedder that declares none. `mm.relevanceThreshold` shows the value in use. |
| `maxEpisodicMemories` | Cap on long-term memories considered per retrieval. |
| `budgetFractionSession` / `budgetFractionEpisodic` | How the token budget is split between recent turns and long-term memory. |
| `hybridRetrieval` | Fuse lexical (BM25) + dense signals via reciprocal-rank fusion. |
| `relevanceWeight` / `recencyWeight` | Balance semantic relevance against recency in L2 ranking. |

Stores and embeddings are injected, not configured by env. Pass `l1` / `l2` /
`embedder` / `reranker` to `create()`. The defaults need no services. Pass
`embedder: new LocalEmbedder()` for deterministic, offline recall in tests even when
`fastembed` is installed.

Similarity scales differ between models, so a threshold chosen for one model is wrong for
another: the lexical embedder scores relevant text around 0.24, while bge-small scores
unrelated text around 0.48. For your own embedder, set `relevanceThreshold` to a value you
have measured on your data, or declare `relevanceThreshold` on the embedder itself.

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

- **`retrieveContext` returns no `episodicMemories`.** Nothing cleared the admission
  threshold for that query; `mm.relevanceThreshold` shows the value in use. If you saw the
  `ACTRONE_MEMORY_LEXICAL_EMBEDDER` warning, recall is keyword-only: the query must share
  words with the memory. Install `fastembed` for recall by meaning.
- **`create()` pauses on first run.** With `fastembed` installed, the first `create()`
  downloads bge-small-en-v1.5 (about 130 MB). Later runs load it from the cache offline.
- **`TokenBudgetError: tokenBudget must be > 0`.** `retrieveContext` needs a positive
  token budget (e.g. `4096`).
- **Redis/Qdrant not used.** Stores are *injected*, not auto-detected, so pass
  `l1: new RedisL1Store(...)` / `l2: new QdrantL2Store(...)` to `MemoryManager.create()`.
- **`npm warn` about an optional peer version.** Adapters are structural (nothing is
  imported at runtime); the peer ranges only make the tested version machine-legible.
  Install the framework you actually use; ignore the others' warnings.
- **CLI recipe.** `npx actrone-memory add <framework>` prints an install plus copy-paste
  recipe; `--write <file>` creates one new self-contained file and never overwrites.

## Development

```bash
npm install
npm run typecheck && npm test && npm run build
```

`fastembed` is not a dev dependency, so the suite runs on `InMemoryStore` and the lexical
`LocalEmbedder`: offline, with no key, no model download and no Docker.

## Documentation

| Page | What's in it |
| --- | --- |
| [API reference](https://github.com/actrone/actrone-memory-ts/tree/main/docs/api) | Generated TypeDoc for every export |
| [Framework recipes](https://github.com/actrone/actrone-memory-ts/tree/main/examples/frameworks) | One CI-typechecked example per adapter |
| [Changelog](https://github.com/actrone/actrone-memory-ts/blob/main/CHANGELOG.md) | What changed in each release |
| [Contributing](https://github.com/actrone/actrone-memory-ts/blob/main/CONTRIBUTING.md) | Dev environment setup and how to submit a PR |
| [Security policy](https://github.com/actrone/actrone-memory-ts/blob/main/SECURITY.md) | How to report a vulnerability privately |

## Part of Actrone

`actrone-memory` is the open-source memory layer behind [Actrone](https://actrone.com), a
platform for running AI agents under governance: durable task execution, tool supervision,
PII tokenisation before inference, and an audit trail.

You never have to adopt any of that. This library is MIT and works standalone forever. If
you do outgrow self-hosting, the migration is the one-import change shown above.

## License

[MIT](https://github.com/actrone/actrone-memory-ts/blob/main/LICENSE). Free to use in any project, commercial or otherwise.
