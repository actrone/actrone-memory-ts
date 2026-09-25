# Changelog

All notable changes to `actrone-memory` are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to
[Semantic Versioning](https://semver.org/).

---

## [0.1.1] - unreleased

A metadata-only release: no code changes.

### Changed

- **npm listing.** The description now says what the library does today, and no longer describes
  it as an on-ramp to a hosted product that is not available yet. Keywords now cover what people
  search for (agent-memory, long-term-memory, semantic-search, the Vercel AI SDK, LangChain.js,
  Mastra, Qdrant, Redis, pgvector), and the homepage link opens the memory docs.

## [0.1.0] - 2026-09-25 (initial release)

### Added

- **`PgVectorL2Store`**, a Postgres + [pgvector](https://github.com/pgvector/pgvector)
  long-term store, so teams already running Postgres add no new service. Takes an injected
  `pg`-compatible client (`PgLike`), like the Redis and Qdrant adapters, so there is still
  no hard database dependency. Ranking reuses the shared `hybridRank` fusion, so recall
  ordering matches the in-memory and Qdrant stores given the same candidates.
- **Published store conformance suite**, exported as `actrone-memory/testing`.
  `checkL1Store` and `checkL2Store` assert the behaviours TypeScript cannot: turns come
  back oldest-first, `n` windows from the end, a search never returns another agent's
  memories, `threshold` and `limit` are honoured, an upsert replaces rather than
  duplicates, and erasure is scoped. `InMemoryStore` and `PgVectorL2Store` pass it. The
  Python library ships the same suite as `actrone_memory.testing`, so an adapter in either
  language is held to one contract.
- **Valkey support, without a new adapter.** `RedisL1Store` uses only standard Redis
  commands, so Valkey, DragonflyDB, ElastiCache and Upstash work with it unmodified. Now
  documented explicitly rather than left to inference.
- **Config validation.** `resolveConfig` rejects out-of-range knobs instead of silently
  producing a manager that never recalls anything (a threshold above 1) or prunes every
  memory (a negative budget fraction).
- **Two-tier persistent memory** for TypeScript/JS: short-term session turns (L1) +
  long-term semantic recall (L2), behind a `MemoryManager` with a real 4-phase retrieval
  pipeline (parallel L1+L2 fetch → budget allocation → relevance filter → pruning).
- **Pluggable stores + embeddings** via the `L1Store` / `L2Store` / `Embedder` seams. Ships
  a zero-dependency default (`InMemoryStore` + `LocalEmbedder`) so it runs with no external
  services, plus concrete `RedisL1Store` / `QdrantL2Store` adapters (structural: the Redis
  and Qdrant clients stay optional).
- **Framework adapters** (`actrone-memory/adapters`), few-line memory wiring for the
  Vercel AI SDK, LangChain.js, LangGraph.js, Mastra, LlamaIndex.TS, OpenAI Agents JS, and
  Firebase Genkit, over a shared framework-agnostic core (`memoryFor` / `recall` /
  `remember` / `formatContext`). Every framework is an optional peer dependency.
- **Provenance-typed facts v1**: every `MemoryEntry` carries `source` (attribution;
  `MemorySource`) and `sensitivity` (`none`/`low`/`pii`/`sensitive`; `Sensitivity`), threaded
  through `injectMemory()` and persisted by the Qdrant adapter. Plus **local right-to-erasure**:
  `MemoryManager.eraseAgentMemories(agentId, sessionId?)` and `L2Store.deleteAgentMemories`.
  The governance seed, in lockstep with the Python lib.
- **Deep framework integrations (parity with the Python adapters)**: beyond the prompt-string
  helpers: `loadMessages()` (structured role-tagged messages), `langchainChatHistory()` (a real
  `BaseListChatMessageHistory`: `getMessages`/`addMessage`/`addMessages`/`clear`, optionally emitting
  genuine `HumanMessage`/`AIMessage` instances), and `llamaindexChatMemory()` (a real `BaseMemory`:
  `get`/`put`/`reset`). New `MemoryManager.getRecentTurns()` public read backs them.
- **`actrone-memory` CLI + recipe registry** (adoption DX): the non-destructive
  existing-project path: `npx actrone-memory add <framework> [--write <file>]` prints an
  install-→-paste recipe or writes **one new self-contained file** (refuses to overwrite; never
  edits your code); `npx actrone-memory list` lists frameworks. Backed by `recipes.ts` (one
  identical-shape recipe per framework (core, Vercel AI, LangChain, LangGraph, Mastra, LlamaIndex,
  OpenAI Agents, Genkit), exported as `RECIPES`/`getRecipe`/`renderRecipe`), the single source of
  truth for the CLI, docs, and CI-tested examples. New `bin` entry `actrone-memory`.
- **Optional LLM fact extraction** (turns → durable facts) to the shared extraction spec v1,
  kept in lockstep with the Python library's `actrone_memory.extraction` module: `extraction.ts`
  (`FactExtractor` seam, `OpenAIFactExtractor` over a structural `ChatCompleterLike` client,
  `parseFacts`, `EXTRACTION_SPEC_VERSION`). Pass an `extractor` to `MemoryManager.create()`, then
  `extractMemories()` stores each fact as `contentType: "fact"`, `source: "extracted"` with a
  classified `sensitivity`. New `"fact"` content type. In lockstep with the Python lib.
- **Governed on-ramp:** API-shaped so swapping to the hosted, governed Actrone memory is a
  one-import change (`ActroneMemoryManager` in `@actrone/sdk`).
- **Best local embedder, picked automatically.** `MemoryManager.create()` uses bge-small-en-v1.5
  through `fastembed` when that optional package is installed (a one-time download of about
  130 MB, cached in `~/.cache/actrone-memory/fastembed` or `FASTEMBED_CACHE_PATH`), and otherwise
  the lexical `LocalEmbedder`, with a one-time `ACTRONE_MEMORY_LEXICAL_EMBEDDER` process warning
  that recall is keyword-only. The same model and the same embedding call as the Python library,
  so both score identical text identically.
- **Calibrated admission thresholds.** Each built-in embedder declares the similarity threshold it
  was calibrated for (`0.3` lexical, `0.63` bge-small), measured on a labelled set of 48 relevant
  and 528 unrelated pairs, because scores are not comparable across models. `relevanceThreshold`
  defaults to it, an explicit value still wins, and `mm.relevanceThreshold` reports the one in use.
- **CLI recipes are compiled code.** Every `actrone-memory add` recipe is the code of a
  type-checked example under `examples/frameworks/`, so a `--write` file compiles as written.

### Supply chain

- Published to npm via **OIDC Trusted Publishing** with **npm provenance**, no long-lived tokens.
