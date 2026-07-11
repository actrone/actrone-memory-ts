# Changelog

All notable changes to `@actrone/memory` are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to
[Semantic Versioning](https://semver.org/).

---

## [0.1.0] — Unreleased (initial release)

### Added

- **Two-tier persistent memory** for TypeScript/JS: short-term session turns (L1) +
  long-term semantic recall (L2), behind a `MemoryManager` with a real 4-phase retrieval
  pipeline (parallel L1+L2 fetch → budget allocation → relevance filter → pruning).
- **Pluggable stores + embeddings** via the `L1Store` / `L2Store` / `Embedder` seams. Ships
  a zero-dependency default (`InMemoryStore` + `LocalEmbedder`) so it runs with no external
  services, plus concrete `RedisL1Store` / `QdrantL2Store` adapters (structural — the Redis
  and Qdrant clients stay optional).
- **Framework adapters** (`@actrone/memory/adapters`) — few-line memory wiring for the
  Vercel AI SDK, LangChain.js, LangGraph.js, Mastra, LlamaIndex.TS, OpenAI Agents JS, and
  Firebase Genkit, over a shared framework-agnostic core (`memoryFor` / `recall` /
  `remember` / `formatContext`). Every framework is an optional peer dependency.
- **Provenance-typed facts v1** — every `MemoryEntry` carries `source` (attribution;
  `MemorySource`) and `sensitivity` (`none`/`low`/`pii`/`sensitive`; `Sensitivity`), threaded
  through `injectMemory()` and persisted by the Qdrant adapter. Plus **local right-to-erasure**:
  `MemoryManager.eraseAgentMemories(agentId, sessionId?)` and `L2Store.deleteAgentMemories`.
  The governance seed, in lockstep with the Python lib.
- **Deep framework integrations (parity with the Python adapters)** — beyond the prompt-string
  helpers: `loadMessages()` (structured role-tagged messages), `langchainChatHistory()` (a real
  `BaseListChatMessageHistory` — `getMessages`/`addMessage`/`addMessages`/`clear`, optionally emitting
  genuine `HumanMessage`/`AIMessage` instances), and `llamaindexChatMemory()` (a real `BaseMemory` —
  `get`/`put`/`reset`). New `MemoryManager.getRecentTurns()` public read backs them.
- **`actrone-memory` CLI + recipe registry** (§4b adoption DX) — the non-destructive
  existing-project path: `npx @actrone/memory add <framework> [--write <file>]` prints an
  install-→-paste recipe or writes **one new self-contained file** (refuses to overwrite; never
  edits your code); `npx @actrone/memory list` lists frameworks. Backed by `recipes.ts` (one
  identical-shape recipe per framework — core, Vercel AI, LangChain, LangGraph, Mastra, LlamaIndex,
  OpenAI Agents, Genkit — exported as `RECIPES`/`getRecipe`/`renderRecipe`), the single source of
  truth for the CLI, docs, and CI-tested examples. New `bin` entry `actrone-memory`.
- **Optional LLM fact extraction** (turns → durable facts) to the shared extraction spec v1
  (`docs/memory-spec/extraction.v1.md`): `extraction.ts` (`FactExtractor` seam,
  `OpenAIFactExtractor` over a structural `ChatCompleterLike` client, `parseFacts`,
  `EXTRACTION_SPEC_VERSION`). Pass an `extractor` to `MemoryManager.create()`, then
  `extractMemories()` stores each fact as `contentType: "fact"`, `source: "extracted"` with a
  classified `sensitivity`. New `"fact"` content type. In lockstep with the Python lib.
- **Governed on-ramp:** API-shaped so swapping to the hosted, governed Actrone memory is a
  one-import change (`ActroneMemoryManager` in `@actrone/sdk`).

### Supply chain

- Published to npm via **OIDC Trusted Publishing** with **npm provenance** — no long-lived tokens.
