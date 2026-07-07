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
- **Governed on-ramp:** API-shaped so swapping to the hosted, governed Actrone memory is a
  one-import change (`ActroneMemoryManager` in `@actrone/sdk`).

### Supply chain

- Published to npm via **OIDC Trusted Publishing** with **npm provenance** — no long-lived tokens.
