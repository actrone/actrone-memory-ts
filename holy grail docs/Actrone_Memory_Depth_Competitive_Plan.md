# Actrone — Memory Depth Competitive Plan (beat Mem0 / Zep / Letta / Cognee on their own axes)

> **Goal:** close the four axes where a specialist memory system is currently ahead of us, and on each
> one land a *differentiated* version — the same technique wrapped in the thing none of them have:
> **governance, verifiability, and outcome-gating.** Then earn the claim with a public benchmark, not an
> assertion.
>
> **The one-line strategy for the whole doc:** `their technique × (governance + verifiability +
> outcome-gating)`. We do not win by out-engineering Zep on graphs; we win by making the same graph
> *provable*, the same self-edit *reversible*, the same recall *self-tuning*.
>
> Part of the strategy set: [Memory Strategy & Roadmap](./Actrone_Memory_Strategy_And_Roadmap.md) ·
> [Framework Adapter Parity Plan](./Actrone_Framework_Adapter_Parity_Plan.md) ·
> [Positioning & Competitive Moats](./Actrone_Positioning_And_Competitive_Moats.md).
>
> _Last updated: 2026-07-11 · Owner: Matt · Grounded in a 2026 web sweep of Zep/Graphiti (arXiv
> 2501.13956), Letta memory-blocks + sleep-time compute, Cognee ECL/ontology, and current
> local-embedding/reranker options, cross-referenced against our code:
> `actrone-memory-{py,ts}`, `backend/orchestrator/internal/memorydepth/`, and the service hooks._

> **Status refreshed 2026-07-13 (code-verified) — three corrections to the axis tables above:**
> 1. **Axis A, task A3: "fuse with RRF" is a naming overclaim.** `memorydepth.SemanticRank`
>    (`facts.go`) blends semantic + confidence + utility via a **weighted linear combination**
>    (`w.Semantic*sem + w.Confidence*conf + w.Utility*util`), not reciprocal-rank-fusion. A5 (the
>    reranker stage) **is** wired via `Service.SetReranker` + `RerankConfig.Enabled()`, gated on
>    `ORCHESTRATOR_MODEL_RERANK_BASE_URL` (confirmed present in `config.go`) — but call it "hybrid
>    linear-blend ranking + optional rerank," not RRF, in any external-facing claim.
> 2. **Axis B: the write side is wired further than stated, but the read side has a real gap.**
>    Contradiction-closing (`invalid_at`) is live on every `Ingest` call (`service.go`), so the write
>    side is materially past the "~60% here already" estimate. But **graph traversal (`Neighbors`/
>    `GraphNeighbors`, the bitemporal as-of query) is exposed only via the HTTP handler
>    (`MemoryHandler.Graph`) — it is never consulted by `retrieveMemoryFacts`/context assembly inside
>    the agentic loop.** So the graph is populated live every turn but the loop's own retrieval never
>    reads it back; B3's "as-of filtering in `RetrieveQuery`" is the gap that would close this.
> 3. **Axis C is already BUILT, not a future task list.** `NewBlockEditorAdapter`
>    (`internal/service/looptool_blocks.go`) implements `looptool.BlockEditor`, giving the agent a
>    governed `memory.block.*` loop tool (append/replace/rethink, audited via `EditBlock`) wired into
>    the live Tool-Call Supervisor. Sleep-time consolidation (`ConsolidateBlocks`) is scheduled via the
>    existing `MemoryHygiene` idle scheduler. C1–C4 in the table below should read as **shipped**, not
>    planned — update any downstream status tracker that still lists Axis C as un-started.
> Axis D (D2/D4 ontology + sensitivity) is confirmed wired into every `Ingest` call; D1/D3 (semantic
> chunking, structured-source ingestion) exist only as HTTP admin endpoints, not loop-triggered — which
> is architecturally correct (document ingestion is an operator action, not a conversational-turn
> action) rather than a gap. Migrations `00124_memory_fact_sensitivity.sql` and
> `00125_memory_fact_sensitivity_index.sql` are confirmed present and do exactly what D4 needs.

---

## 0. Honest starting position

We are **not** "way better in general." On raw memory depth the specialists lead or match us today:

| Axis | Who leads | Where we stand today |
| --- | --- | --- |
| Semantic recall (default) | Mem0 (mature extraction/consolidation) | **OSS default is lexical** (FNV-1a hashing); real recall needs a plugged embedder. Hosted `memorydepth` has `SemanticRank` but no reranker. |
| Temporal knowledge graph | **Zep / Graphiti** (bitemporal, leads LongMemEval) | `memory_graph_edges` is v1 SPO — **no validity intervals**. |
| Self-editing memory | **Letta / MemGPT** (agent-managed blocks + sleep-time) | We have server-side `MemoryHygiene` + `Reflect` but **no agent-editable memory blocks**. |
| Structured-data ingestion | **Cognee** (ECL + ontology + dlt) | `Ingest` is conversation-only; **no ontology, no structured-source pipeline**. |

**What we already own that they don't** — and which every axis below plugs into:

- **Outcome-gated retrieval (Moat A)** — `RecordRetrievalOutcome` + `SemanticRank(cosine × confidence × utility × outcome)`.
- **Verifiable memory on the HMAC audit spine (Moat B)** — tamper-evident record of what the agent knew.
- **Provable forgetting (Moat F)** — cryptographic erasure, not soft-delete.
- **Governed Action Layer** — provenance, purpose-binding, policy checks, SAGA rollback on every write.

The plan: reach parity on the four axes, and on each one attach one of those four moats so the result is a claim the specialist structurally cannot make.

---

## 1. Axis A — Kill the lexical default (recall)

**Current:** OSS default embedder is `HashingEmbedder` (FNV-1a keyword overlap). `memorydepth.Retrieve`
over-fetches then blends `SemanticRank`, but there is no reranker stage and the OSS default never
produces dense vectors without a plugged provider.

**Target:** a dense default that **keeps the local-first / zero-egress / no-API-key promise**, plus
hybrid fusion and an optional reranker.

### Tasks

| # | Task | Surface | Notes |
| --- | --- | --- | --- |
| A1 | In-process ONNX embedder as the default "real" tier | OSS PY + TS | `fastembed` (Python, onnxruntime — no torch/GPU) · `fastembed-js`/`onnxruntime-node` (TS), `transformers.js` fallback for edge/browser. Default model `bge-small-en-v1.5` or `all-MiniLM-L6-v2` (46 MB). Lazy-download + cache; **offline after first fetch**. |
| A2 | Tiered fallback: local ONNX → hashing | OSS PY + TS | If the model can't be fetched (air-gapped first run) fall back to hashing so "no-egress" stays literally true. Config: `embedding_provider="local"` becomes the default; `"hashing"` remains explicit. |
| A3 | Hybrid retrieval via Reciprocal Rank Fusion | OSS + hosted | We already have a lexical scorer; add dense; fuse with RRF. Optionally adopt **BGE-M3** (dense + sparse + multi-vector from one model → hybrid with no separate BM25 index). |
| A4 | Optional cross-encoder rerank over top-K | OSS (opt-in) + hosted | `bge-reranker-base`/`jina-reranker`. **Honest constraint: rerank lifts precision, not recall** — only correct *after* over-fetch (hosted `Retrieve` already over-fetches; OSS must add it). +5–15 NDCG@10 typical. |
| A5 | Reranker stage in `memorydepth.Retrieve` | hosted Go | Insert between over-fetch and `SemanticRank`; keep the outcome term. |

### The beat (Moat A)

Retrieval is **outcome-gated** — a raw embedder or reranker is static; ours self-tunes on whether a
retrieved memory actually helped. Positioning: *dense + hybrid + rerank* (parity) **× outcome-gating**
(beyond). No competitor's default recall self-improves from usage.

**OSS ships:** A1–A4 (opt-in reranker). **Hosted-only:** A5 + the outcome term.

---

## 2. Axis B — Bitemporal graph (match Graphiti, make it provable)

**Current:** `memory_graph_edges` = SPO edges, no time. `DeriveRevisions` already detects
superseding/contradicting facts but records them as replacement, not temporal invalidation.

**Graphiti's model to copy:** every edge carries `valid_from` / `valid_to` / `invalid_at` **and**
`ingested_at` (bitemporal: *when true* vs *when learned*). On contradiction it **sets `invalid_at` on the
old edge instead of deleting** — history preserved. Answers "true now?", "true at date X?", "provenance?".

### Tasks

| # | Task | Surface | Notes |
| --- | --- | --- | --- |
| B1 | Migration: add `valid_from, valid_to, invalid_at, ingested_at` to `memory_graph_edges` | hosted (migration `00120`) | Nullable; backfill `ingested_at = created_at`. Index `(subject, predicate, invalid_at)`. |
| B2 | Extend `DeriveRevisions` → temporal invalidation | `internal/memorydepth/facts.go` + `service.go` | Contradiction closes the old edge (`invalid_at = now`) instead of overwriting. We are ~60% here already. |
| B3 | "As-of" filtering in `RetrieveQuery` + repository | `facts.go`, `repository.go` | `now` (`invalid_at IS NULL`), `as_of(T)`, provenance lookup. |
| B4 | HTTP surface for temporal queries | `handler/http/memory.go` | Extend `Graph`/`Facts` with optional `as_of` param. |

### The beat (Moat B + F)

Zep's bitemporality is a *data feature*. Layered on our **HMAC audit spine**, each invalidation becomes a
**signed, tamper-evident ledger entry** — "what did the agent know, and when, *provably*." That is a
compliance/audit claim Zep cannot make. Ties directly into provable forgetting (F): an erased edge leaves
a verifiable tombstone, not a silent gap.

**Hosted-only** (graph tier is not in the OSS libs).

---

## 3. Axis C — Self-editing memory blocks (implement — we have zero — then govern it)

**Current:** no MemGPT-style blocks. We have server-side `MemoryHygiene` scheduler + `Reflect` +
cost-capped reflection (Loop plan LE).

**Letta's model:** labeled, bounded memory blocks (persona / human / task / scratchpad) the **agent edits
in its own loop** via tools (`memory_append`, `memory_replace`, `memory_rethink`), plus **sleep-time
compute** — idle "heartbeat" turns that consolidate archival → blocks, rewrite messy blocks, summarize
recent turns, all **non-blocking**.

### Tasks

| # | Task | Surface | Notes |
| --- | --- | --- | --- |
| C1 | Memory-block model: labeled, size-bounded blocks in working context | hosted + OSS | Blocks: `persona`, `human`, `task`, `scratchpad` (configurable). Persisted per agent/session. |
| C2 | Governed memory-edit tools (`memory_append/replace/rethink`) | hosted (kernel tools) + OSS helper | Agent calls them inside `runAgenticLoop`. **Every edit routes through the Governed Action Layer.** |
| C3 | Sleep-time pass = extend `MemoryHygiene` | `internal/service/memory_hygiene.go` | Add block-rewrite ops: archival→block consolidation, turn→note summarization. Reuse the existing idle scheduler + cost cap. Non-blocking (already async). |
| C4 | Outcome measurement on sleep-time consolidation | `memory_hygiene.go` + Moat A | Record whether a consolidation improved subsequent retrieval outcomes. |

### The beat (Governed Action Layer + Moat A)

1. **Governed self-editing.** Letta lets the agent freely rewrite memory; we make every self-edit
   provenance-stamped, policy-checked ("may this agent edit this block?"), audit-logged, and
   **SAGA-reversible**. "Self-editing memory you can audit and roll back."
2. **Measured housekeeping.** Letta's sleep-time is unmeasured; ours is **outcome-gated** — sleep-time
   compute that *proves* it made memory better (C4).

**OSS ships:** the block model + edit helpers (local, ungoverned). **Hosted-only:** governance +
outcome-gated sleep-time.

---

## 4. Axis D — Cognee-style ECL (implement the pipeline, make the ontology policy-bearing)

**Current:** `Ingest` = redact → consolidate → embed → edges → revisions. Conversation-only; no ontology,
no structured-source ingestion.

**Cognee's model:** ECL (Extract → **Cognify** → Load). Cognify = classify docs → **semantic chunking +
cross-doc coreference** → extract triples → **ontology-validate (typed `DataPoint` fields as edges)** →
summarize → add datapoints. Structured sources via **dlt** — relational data pulled in, **FK edges derived
automatically**, so a database becomes part of the graph.

### Tasks

| # | Task | Surface | Notes |
| --- | --- | --- | --- |
| D1 | Semantic chunking + cross-document coreference | hosted `Ingest` | Replace fixed-size splits with coherence-based chunks; resolve entities across docs before edge extraction. |
| D2 | Typed ontology layer constraining extraction | hosted | Entity/relation types (Pydantic-`DataPoint`-style). Extraction validated against the schema. |
| D3 | Structured-source ingestion (relational → FK edges) | hosted | Adopt **dlt** (don't rebuild); derive FK edges so business data joins the graph. |
| D4 | Ontology types carry **policy** (sensitivity + purpose-binding + retention) | hosted | e.g. `PII.email` auto-inherits erasure/retention; purpose-violating extraction refused at ingest. |

### The beat (purpose-binding + Moat F)

Cognee's ontology exists to make the graph *correct*; ours makes it **governed**. The ontology becomes
**policy-bearing** — wired straight into provable forgetting (F) and purpose-binding. Same pipeline shape;
every node/edge is provenance-typed, policy-bound, and audit-sealed. *"The graph that knows what it's
allowed to remember."* This is also the enterprise wedge — memory over **business data**, not just chat.

**Hosted-only** (this is the deep engine).

---

## 5. The acceptance gate — measured, not asserted

**No "better than Zep/Mem0" claim ships until it is benchmarked.** The harness is already scaffolded
(`actrone-memory-py/.../benchmark/`, `actrone-memory-ts/src/benchmark.ts`, `benchmark/compare.py`,
`competitors.py`).

| # | Task |
| --- | --- |
| E1 | Wire real competitor adapters into the compare harness (Mem0, Zep, Letta where APIs allow). |
| E2 | Run **LOCOMO** + **LongMemEval** for: OSS default (post-A), hosted `memorydepth` (post-A/B/C/D). |
| E3 | Publish a reproducible results table; gate marketing claims on it. Zep currently leads LongMemEval — that is the bar. |

Until E2 passes, positioning stays: **OSS = best free local-first + governed, no lock-in; hosted =
verifiable cognitive memory** — never an unbenchmarked "beats Zep."

---

## 6. Sequencing (by leverage)

1. **Axis A (dense default)** — cheapest, kills the most embarrassing gap, near-zero conceptual risk,
   ships to OSS. **Do first.**
2. **Axis B (bitemporal edges)** — bounded; `DeriveRevisions` is already close; the audit-spine twist is a
   real headline.
3. **Axis C (memory blocks + governed sleep-time)** — medium; needs kernel-tool + loop wiring.
4. **Axis D (ECL + policy ontology)** — biggest; the enterprise wedge.
5. **Gate E** runs after each axis lands (A, then A+B, …) so every claim is measured as it's made.

## 7. OSS vs hosted split (honesty guardrail)

| Capability | OSS libs | Hosted `memorydepth` |
| --- | --- | --- |
| Dense/hybrid default recall (A1–A4) | ✅ | ✅ |
| Reranker stage (A5) + outcome-gating | opt-in / — | ✅ |
| Bitemporal graph (B) | — | ✅ |
| Self-editing blocks (C) | model + helpers | ✅ + governance + measured sleep-time |
| ECL + policy ontology (D) | — | ✅ |

Say **"Mem0/Zep-class"** only about the hosted engine; **"best free local-first + governed, one import
from the control plane"** about the OSS.

---

## 8. One-line summary

Reach parity on recall, bitemporal graph, self-editing memory, and structured-data ECL — and on each
attach outcome-gating, the audit spine, the Governed Action Layer, or purpose-binding — so that where the
specialists have *a memory feature*, we have *a provable, governed, self-improving* one. Then prove it on
LOCOMO + LongMemEval before we say a word.

---

_Sources: Zep/Graphiti — arXiv 2501.13956; Neo4j Graphiti blog. Letta — memory-blocks & agent-memory
posts. Cognee — dltHub ECL post & ontology deep-dives. Embeddings/rerankers — FastEmbed, Transformers.js
vs ONNX Runtime, BentoML open-source embedding guide, "Best rerankers for RAG 2026", jina-reranker-v3
(arXiv 2509.25085). All 2026._
