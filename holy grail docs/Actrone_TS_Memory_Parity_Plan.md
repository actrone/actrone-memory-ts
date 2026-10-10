# Actrone — TS Memory Parity Plan (`actrone-memory` OSS lib + TS SDK drop-in)

> **Goal:** give the TypeScript/JS ecosystem the **same two-part memory story** Python already has —
> a standalone **open-source memory library** *and* a **one-import-swap SDK drop-in** that upgrades it
> to the hosted, governed Orchestrator. This closes a real asymmetry and extends Actrone's strongest
> acquisition funnel into the largest developer ecosystem.
>
> Status: PLAN. Owner: Matt. Created: 2026-07-05. Inherits `CLAUDE.md`.

> **Status refreshed 2026-07-13 (code-verified): BOTH DELIVERABLES ARE BUILT — this is no longer just
> "Status: PLAN."** Deliverable A exists at top-level `actrone-memory-ts/` (package `actrone-memory`,
> `src/manager.ts` + `src/store.ts` with the zero-dependency `InMemoryStore` default implementing both
> `L1Store`/`L2Store` + `src/stores/{redis,qdrant}.ts` adapters, matching §1.A's spec exactly).
> Deliverable B exists at `actrone-ts/src/memory.ts` — a real `ActroneMemoryManager` class
> (`storeTurn`/`retrieveContext`/`injectMemory`/`deleteMemory`/`searchMemories`/`clearSession`/
> `getSessionMetadata`), API-shape-compatible with the OSS lib as designed, and exported from
> `actrone-ts/src/index.ts`. M5's migration doc exists at `actrone-ts/docs/migration-from-
> actrone-memory.md`. **One correction to §1.A/§4.5's own adapter count:** `actrone-memory`'s
> `src/adapters.ts` now ships **far more** than the "Vercel AI SDK, Mastra, LangChain.js" trio this
> doc names — it has 13 exported adapter functions covering Vercel AI SDK, LangChain.js (both a
> string-wrapper `langchainMemory` and a real `BaseListChatMessageHistory`-shaped
> `langchainChatHistory`), LangGraph.js, Mastra, LlamaIndex.TS (both a string wrapper and a real
> chat-memory-store shape), OpenAI Agents JS, Firebase Genkit, VoltAgent, Cloudflare Agents, Inngest
> AgentKit, and the Claude Agent SDK. This is real, materially deeper than a Python-vs-TS "4 vs 7"
> framing found elsewhere (`Actrone_Framework_Adapter_Expansion_Plan.md` §4.5) — that framing is
> itself now stale; see `Actrone_Framework_Adapter_Parity_Plan.md` (2026-07-11) for the current,
> per-framework matrix. Publishing status (whether either package has actually shipped to npm) is
> unverified from code alone — see `Actrone_SDK_OSS_Publishing_Runbook.md`.

---

## 0. The asymmetry (grounded)

**Python has the full funnel:**
- **`actrone-memory`** — a standalone **MIT open-source** Python lib (`actrone-memory/`, package
  `actrone_memory`): short-term + long-term agent memory over Redis/Qdrant, with a `MemoryManager` API,
  models/config/metrics/exceptions/logging, and framework example adapters (LangChain, CrewAI). It is a
  self-hosted, works-with-any-LLM on-ramp — top-of-funnel "give your agent memory."
- **SDK drop-in** — `backend/src/actrone/memory.py` `ActroneMemoryManager`: **API-identical** to
  `actrone_memory.MemoryManager`, but routes every call through the governed Orchestrator REST API
  instead of local Redis/Qdrant. Migration is **one import change** (`from actrone_memory import
  MemoryManager` → `from actrone import ActroneMemoryManager as MemoryManager`).

**TS has neither.** The TS SDK exposes only client-level memory *endpoints*
(`searchMemories`/`injectMemory`/`deleteMemory` in `actrone-ts/src/client.ts`). There is **no**
`MemoryManager`-style drop-in and **no** standalone OSS TS/JS memory library. So a JS developer gets no
self-hosted on-ramp and no one-line upgrade path.

**Why close it:** the OSS memory lib is the acquisition funnel; JS/TS is the biggest ecosystem;
mirroring the "self-host free → swap one import → hosted governed" story doubles reach and gives the TS
SDK genuine memory parity with Python (beyond raw endpoint calls).

---

## 1. Deliverables (two packages, one shared API contract)

### A. `actrone-memory` — standalone OSS TS/JS memory library (new top-level repo/dir)
Mirror of the Python `actrone-memory`, idiomatic TS. MIT. Node LTS + browser-safe where feasible.

- **Core:** a `MemoryManager` class — short-term (recent turns) + long-term (semantic search) memory,
  with a **pluggable store** interface (default in-memory + adapters for Redis/Qdrant; embeddings via a
  pluggable provider). Mirror the Python module shape: `manager.ts`, `models.ts`, `config.ts`,
  `metrics.ts`, `errors.ts`, `logging.ts`.
- **Framework adapters** (peer-dep optional, matching the SDK's D2 adapter set): Vercel AI SDK, Mastra,
  LangChain.js — "wire memory into your JS agent in 3 lines" (mirrors the Python `examples/` adapters).
- **Tooling:** `vitest`, `tsc --strict`, ESM, zod for config — consistent with `actrone-ts`.

### B. TS SDK drop-in — `actrone-ts/src/memory.ts` `ActroneMemoryManager`
The governed counterpart, in the SDK: **API-compatible with `actrone-memory`'s `MemoryManager`** but
backed by the hosted Orchestrator via the existing `ActroneClient` memory endpoints (routing, no local
Redis/Qdrant). Migration is one import:

```ts
// Before (self-hosted actrone-memory)
import { MemoryManager } from "actrone-memory";
const mm = await MemoryManager.create();

// After (hosted, governed Orchestrator)
import { ActroneMemoryManager as MemoryManager } from "@actrone/sdk";
const mm = new ActroneMemoryManager({ baseUrl, apiKey });
```

Export `ActroneMemoryManager` from `actrone-ts/src/index.ts`. Reuse the SDK's client memory methods;
add any missing endpoint wrappers (`storeTurn`/`retrieveContext`/`clearSession`/`getSessionMetadata`)
so the drop-in surface matches Python's.

---

## 2. The shared API contract (parity is the whole point)

The **three** `MemoryManager` surfaces — Python OSS, Python SDK drop-in, TS OSS, TS SDK drop-in — must
present the **same conceptual API** (names idiomatic per language) so cross-language docs and the
one-import-swap promise hold. Define the canonical method set from the existing Python
`actrone_memory.MemoryManager` (create, add/store turn, retrieve/search, get context with budget,
session metadata, clear) and hold every implementation to it with a shared contract test list.

- **Client-parity note:** the TS SDK drop-in's *endpoints* already fall under the 2-SDK client-parity
  rule (Python + TS). This plan adds the **manager abstraction** on top; keep the drop-in method names
  aligned across Python (`ActroneMemoryManager`) and TS (`ActroneMemoryManager`).

---

## 3. Plan

- **M1 — Freeze the canonical `MemoryManager` API** from the Python `actrone_memory.MemoryManager` +
  the Python SDK drop-in; write it up as a language-neutral contract (method list + semantics + the
  context-budget shape). This is the single source both TS packages implement against.
- **M2 — Build `actrone-memory`** (deliverable A): core `MemoryManager` + pluggable stores
  (in-memory default; Redis/Qdrant adapters) + embeddings seam; `vitest` unit + a contract-test suite
  derived from M1; README with the "goldfish → memory" framing mirroring the Python lib.
- **M3 — Framework adapters** for `actrone-memory` (Vercel AI / Mastra / LangChain.js), peer-dep
  optional, with examples — the acquisition surface.
- **M4 — TS SDK drop-in** (deliverable B): `actrone-ts/src/memory.ts` `ActroneMemoryManager` backed by
  `ActroneClient`; add any missing endpoint wrappers; run it against the **same contract test** as the
  OSS lib (proving the one-import swap really is behavior-compatible); export from `index.ts`.
- **M5 — Docs:** a TS "migration-from-actrone-memory" doc mirroring the Python
  `09-migration-from-actrone-memory.md`; update the SDK matrix + quickstarts.

**Done-when:** `actrone-memory` passes the M1 contract suite; the SDK `ActroneMemoryManager` passes the
**same** suite (against a mocked Orchestrator); a JS agent example runs with the OSS lib and then, after
one import change, against the hosted drop-in.

---

## 4. Sequencing, risks, non-goals

- **Sequencing:** M1 (contract) gates everything. M2/M3 (OSS lib) and M4 (SDK drop-in) can proceed in
  parallel once M1 is frozen; both validate against the M1 suite. Independent of the Go-removal and
  Python-extraction plans, but coordinate the SDK-matrix doc edits.
- **Risks:** (a) API drift between the four managers → the shared M1 contract test is the guard;
  (b) embeddings/store deps bloating the OSS lib → keep them behind optional adapters (in-memory
  default has zero heavy deps); (c) browser vs Node surface → gate store adapters by runtime.
- **Non-goals:** re-implementing the governed backend in TS (the drop-in *routes* to the Orchestrator,
  it does not re-host governance); a universal cross-language memory RPC (each language ships its own
  idiomatic lib against the shared contract).

### Branding (locked) — namespace, don't language-suffix the package
The installable package name carries the brand; the language is implied by the registry (the pattern
every strong vendor uses — LangChain `langchain-core`↔`@langchain/core`; mem0/chroma use one name in
both). So:

| | Package users install | Import / API | GitHub repo |
| --- | --- | --- | --- |
| **Python** | `actrone-memory` (existing, keep) | `import actrone_memory` · `MemoryManager` | `actrone-memory-py` |
| **TypeScript** | `actrone-memory` (npm scope, matches `@actrone/sdk`) | `import { MemoryManager } from "actrone-memory"` | `actrone-memory-ts` |

- Same `MemoryManager` class name both languages (docs + one-import-swap align). Do **not** ship
  `actrone-memory-python` / `-typescript` as *package* names — language goes on the **repo** only
  (symmetric `-py`/`-ts`; rename the existing `actrone-memory` repo → `actrone-memory-py`, GitHub
  auto-redirects). Sits naturally beside `@actrone/sdk` + `actrone`. Stay in the `@actrone` namespace
  (one brand) — no separate product codename.

### Publishing
Both OSS libs **are** publish-targeted (PyPI + npm) — that's the funnel. Publish **when prod-grade and
tested**, not before; until then, develop against local path/workspace installs.
