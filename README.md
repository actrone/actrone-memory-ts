# @actrone/memory

**Give your JS/TS agent a memory in three lines.** Two-tier persistent memory —
short-term session turns + long-term semantic recall — with a pluggable store
(in-memory by default; Redis/Qdrant adapters) and embeddings. Zero required
dependencies for the on-ramp; MIT licensed.

It's the open-source counterpart to Actrone's governed, hosted memory: when you
outgrow self-hosting, **swap one import** and every call runs through the
governed Orchestrator (PII-tokenised, audited, policy-bounded) — same API.

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

// Hosted + governed (Actrone Orchestrator) — same methods, same result shapes
import { ActroneMemoryManager as MemoryManager } from "@actrone/sdk";
const mm = new ActroneMemoryManager({ apiKey: process.env.ACTRONE_API_KEY! });
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

## Development

```bash
npm install
npm run typecheck && npm test && npm run build
```

## License

MIT.
