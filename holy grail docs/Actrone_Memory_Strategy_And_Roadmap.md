# Actrone — Memory Strategy & Roadmap (OSS wedge → hosted "Verifiable Cognitive Memory" moat)

> Part of the strategy set: [Distribution & GTM](./Actrone_Distribution_And_GTM_Strategy.md) ·
> [Product Review](./Actrone_Product_Review_and_Financial_Model.md) · [Marketing — OSS](./Actrone_Marketing_Strategy_OSS.md).
>
> **Scope:** the honest, code-grounded state of Actrone's memory (OSS lib + hosted backend), the
> architecture decision that keeps "improve once" coherent across languages, and the plan to go from
> "good memory" to a **new category no competitor occupies** — *verifiable cognitive memory.*
>
> _Last updated: 2026-07-10 · Owner: Matt · Grounded in a code sweep of `actrone-memory-{py,ts}`,
> `actrone-py`, and `backend/orchestrator/internal/{memory,memorydepth}`._

> **Status refreshed 2026-07-13 (code-verified) — independently re-confirmed, no drift found:** the
> §0 claim that `memorydepth.Retrieve` is closed-loop is **confirmed with an explicit call chain**:
> `Service.Retrieve` (`service.go`) ← `ActivityService.retrieveMemoryFacts` (`memorydepth_hook.go`) ←
> `RetrieveContext` activity (`activity_service.go`) ← `workflow.ExecuteActivity(ctx, RetrieveContext,
> ...)` in `task_workflow.go` — facts written in a prior turn are demonstrably read back into the next
> turn's context, not write-only. `cost_opt.memory_depth` is confirmed flipped to `true` by default
> (`config.go`) — the only `CostOpt.*` lever that defaults on (every cost/quality-optimizer lever in
> `cost-leadership-implementation-plan.md` defaults off, for contrast). `Erase` is confirmed wired to
> its correct trigger (`POST /v1/agents/{agentID}/memory/erase`, admin/HTTP — not loop-invoked, which
> is the architecturally correct place for a GDPR erasure). One addition worth folding into a future
> revision: the Axis-C self-editing memory blocks described as upcoming work in
> `Actrone_Memory_Depth_Competitive_Plan.md` are **already built** (`internal/service/looptool_blocks.go`,
> a governed `memory.block.*` loop tool) — see that doc's refresh note.

---

## 0. The honest status (verified in code)

There are **three** memory implementations, and the picture is more nuanced than the strategy docs imply:

| Layer | What it is | Intelligence | Status |
| --- | --- | --- | --- |
| **OSS lib** — `actrone-memory` (Py, MIT) + `actrone-memory` (TS, MIT) | the free wedge: L1 recent turns + L2 semantic recall, budget-aware retrieval, auto-summarise | **turn storage + vector recall** (entry tier) | shipped; TS has a zero-service default, Python needs Redis+Qdrant |
| **Hosted simple API** — `/v1/agents/{id}/memory` (Go, `internal/memory`) | what `ActroneMemoryManager` (the SDK hosted proxy) actually calls | vector store + **importance scoring** | shipped, governed (PII/residency/audit on the path) |
| **Hosted `memorydepth`** (Go, `internal/memorydepth`) | the structured-memory engine: `Extract` (turns→facts) → **temporal consolidation + conflict resolution** → **provenance** → **governed right-to-erasure** | **Mem0/Zep-class ingest + governance they don't have** | **BUILT + WIRED on the write path, but OFF by default** (`cfg.CostOpt.MemoryDepth`, "Wave 3"), and the **retrieval loop is not closed** |

**The two facts that matter most (and correct earlier framing):**
1. The *advanced* memory intelligence is **not missing** — `memorydepth` already does extraction,
   temporal consolidation, conflict resolution, provenance, and erasure. My earlier "we lack this" was
   true of the **OSS lib**, not the platform.
2. **But `memorydepth` is half-closed:** it has `Ingest` and `Erase` and **no `Retrieve`** — facts are
   extracted, consolidated, and stored, but **never read back into agent context or exposed via an
   API**. And it's **off by default**. So today it is a sophisticated *write-only* structured store,
   dormant behind a flag. **Closing the retrieval loop + turning it on is the single highest-leverage
   hosted-memory task** — near-term, not greenfield.

---

## 1. The architecture reality + the "improve once" decision

Because the **OSS libs are Python/TS and the hosted engine is Go**, there is *no free* "improve the OSS
lib → hosted gets smarter." They are separate codebases:

- Improving `actrone-memory` flows automatically into the **SDK's local/self-hosted path** (it's a
  dependency of `actrone-py`) — **not** into hosted governed memory (the Go backend).
- So coherence must be *engineered*, not assumed.

**Decision — the coherence mechanism: one spec + one eval, two implementations.**
- Define a **language-neutral memory spec** — the fact model, provenance types, temporal validity,
  extraction/consolidation JSON schemas, and the extractor/reflection *prompts* — as versioned,
  repo-shared reference data (not code).
- Both the OSS lib (Py/TS) and the Go backend implement *that spec* and are **tested against one shared
  eval/benchmark** (see §5). "Improve once" = update the spec + eval; both implementations conform.
- This also future-proofs a possible consolidation (e.g. hosting the OSS engine as the canonical
  memory service) without betting on it now.

---

## 2. The OSS ↔ hosted intelligence split (wedge vs moat — do NOT cannibalize)

The OSS lib must be **best-in-class on its axis** but **not as smart as hosted** — the deep cognitive
layer is the paid graduation. Deliberate split:

| Capability | OSS lib (the wedge) | Hosted (the moat) |
| --- | --- | --- |
| L1/L2 recall, budget-aware retrieval | ✅ | ✅ |
| **Local-first / zero-egress / no-API-key** | ✅ **lead here** (differentiator) | ✅ (BYOC) |
| Provenance-typed facts (source + sensitivity type) | ✅ **v1 hooks** (governance starts in OSS) | ✅ full |
| Basic fact extraction (turns→facts) | ✅ optional (LLM-gated) | ✅ `memorydepth` |
| Temporal consolidation / conflict resolution | ⚠️ light | ✅ `memorydepth` |
| Governed right-to-erasure | ✅ local erase | ✅ provable, audited |
| **Outcome-gated self-improvement (A)** | ✖ | ✅ **hosted-only by nature** |
| **Verifiable memory on the audit spine (B)** | ✖ | ✅ hosted-only |
| **Federated multi-agent memory (C)** | ✖ | ✅ hosted-only |
| Belief-revision + confidence (D), reflection (E), provable forgetting (F) | ⚠️ partial | ✅ full |

The beautiful part: pillars **A/B/C are *structurally* hosted-only** — they need the governed outcome
signal, the tamper-evident audit spine, and the multi-agent mesh that OSS users don't have. So the
groundbreaking intelligence lives exactly where it's defensible, and the OSS wedge stays clean.

---

## 3. The invention — "Verifiable Cognitive Memory" (the category no one occupies)

Mem0/Zep/Letta/Cognee compete on *storage + recall* (extract-and-retrieve, temporal graphs, self-
editing blocks). The open, unsolved research frontier is **self-improvement from outcomes, reflection,
selective forgetting (most systems *fail* it), belief-revision/staleness, and provenance-typing**
([memory survey 2603.07670](https://arxiv.org/pdf/2603.07670) · [forgetting benchmark 2604.20006](https://arxiv.org/html/2604.20006v1)
· [provenance-typed memory 2605.25869](https://arxiv.org/pdf/2605.25869) · [reflective memory 2512.12818](https://arxiv.org/pdf/2512.12818)).
Every one maps to an asset **only Actrone has.** Six pillars, ranked by uncopyability:

**A. Outcome-gated self-improving memory — the flagship.** We are the only platform with a **governed
outcome signal** (the eval/groundedness gate, the optimizer, the savings ledger, the audit of what each
action *achieved*). Point it at retrieval: the memory learns **which memories actually improved task
outcomes** and re-weights/re-ranks/prunes accordingly, per-agent, per-tenant. Competitors retrieve on
similarity+recency and **have no idea whether a memory helped.** Compounding data moat + genuinely
smarter recall. *Structurally uncopyable without our closed governed loop.*

**B. Verifiable memory (memory ⨝ the tamper-evident audit spine).** Record every retrieval + the exact
memories that drove a decision on the HMAC-chained ledger with provenance. The agent can **prove what
it knew, when, why it believed it, and that it forgot it** — for a regulator or a post-incident review.
No one fuses memory with a cryptographic audit spine.

**C. Governed federated organizational memory (memory ⨝ MACP/A2A).** Institutional knowledge shared
across an org's agents — and federated across orgs — with provenance, access control, and **zero
raw-record leak** across trust boundaries. Network-effect moat; no competitor has governed multi-agent
memory federation.

**D. Belief-revision + calibrated-confidence memory.** Beyond validity windows: a **belief-revision
log** (what the agent believed at time T; when/why it changed its mind) + calibrated **confidence** per
fact → **uncertainty-aware retrieval** so the agent knows what it's unsure about instead of acting on
stale info. Attacks the "memory staleness / provenance-role collapse" frontier directly.

**E. Reflective insight memory.** Periodic **reflection** that synthesises distributed episodic
memories into higher-level semantic insights ("this account is high-risk"), *with provenance back to
the source memories*. The under-served research frontier — owned, and auditable.

**F. Provable selective forgetting.** MemoryAgentBench shows **most systems fail selective forgetting**;
it's already our GDPR DNA (`memorydepth.Erase`). Make it policy-driven (decay/TTL/sensitivity) **and
cryptographically provable**: "the only memory that can prove it forgot." A regulated-market killer.

**One-liner to own:** *"Mem0 stores facts. Zep tracks when they were true. Actrone is the memory that
knows what it's sure of, proves what it knew, learns which memories actually helped, forgets on
command, and shares safely across your agents — verifiable cognitive memory."*

---

## 4. Roadmap (sequenced, honest)

### Now — pre-OSS-launch (months 1–2): make the wedge best-in-class on its axis
- [x] **Local-first everywhere** — a zero-service/in-memory default for **Python** (parity with TS);
      local embeddings the default path. Lead message: *"memory that never phones home."*
      *(Shipped: `InMemoryStore` + `HashingEmbedder`, default `backend="memory"`.)*
- [x] **Provenance-typed facts v1 in OSS** — every stored item carries source + a PII/sensitivity type
      + local erase. Governance *starts* in OSS (the graduation seed). *(Shipped both libs:
      `source`/`sensitivity` on every fact + `erase_agent_memories`/`eraseAgentMemories`.)*
- [x] **Optional basic extraction** (LLM-gated) so OSS is credible beyond turn storage — implemented to
      the shared spec (§1). *(Shipped both libs: `FactExtractor` + `OpenAIFactExtractor`, spec
      `docs/memory-spec/extraction.v1.md`.)*
- [x] **The public benchmark + a shipped eval harness** (§5) — "the only memory lib that ships its own
      quality eval." *(Shipped both libs: `actrone_memory.benchmark` / `src/benchmark.ts`, CI-gated
      recall@5 ≥ 0.85; measured 0.929.)*
- [x] **`create-actrone-app` (TS first) + `actrone-memory init`** for existing projects (non-destructive).
      *(Shipped: `create-actrone-app` scaffolder + `npx actrone-memory add <framework>` snippet-printer
      + recipe registry for 8 frameworks.)*
- [x] **True TS↔Python adapter parity** (fix the shallow-TS structural-adapter gap). *(Shipped:
      `langchainChatHistory` = real `BaseChatMessageHistory`, `llamaindexChatMemory` = real `BaseMemory`,
      `loadMessages` structured view, `getRecentTurns` public read.)*

### Near-term — hosted (close what's already built): light up `memorydepth`
- [x] **Close the retrieval loop:** add `memorydepth.Retrieve` (temporal-aware, provenance-carrying),
      wire it into context assembly (`RetrieveContext`), and expose it via the hosted memory API.
      *(Shipped: `Service.Retrieve` + `RetrieveContext` fact injection + `GET …/memory/facts` + OpenAPI.)*
- [x] **Turn it on by default** (retire the `cfg.CostOpt.MemoryDepth` gate once the loop is closed +
      eval-passed), so hosted memory is genuinely extraction+temporal+governed, not a write-only store.
      *(Shipped: `cost_opt.memory_depth` default flipped to `true`, reversible; extraction best-effort/
      non-blocking. Live-eval + per-tenant cost shadow-measurement remains the ops rollout gate.)*

### The moat — hosted "Verifiable Cognitive Memory" (the groundbreaking layer)
- [x] **A. Outcome-gated self-improving retrieval** — feed the eval/optimizer/savings outcome signal
      into retrieval ranking; measure recall-quality lift on the benchmark. *(Shipped: per-fact
      helpful/unhelpful signal + `OutcomeRank` (confidence×utility) + `RecordRetrievalOutcome` wired to
      reward facts on a grounded final answer. Refinement: eval-fail negative attribution.)*
- [x] **B. Verifiable memory** — memory retrievals + decision-driving memories onto the audit spine.
      *(Shipped: `memory.retrieval` HMAC-signed events with per-fact provenance + content hash. Wired in
      the live retrieval path; the spine requires `emaop.enabled` (governance layer) — coupling now
      surfaced via a startup warning.)*
- [x] **F. Provable selective forgetting** — policy-driven decay + provable erasure (extend `Erase`).
      *(Shipped + WIRED via `POST /memory/forget` + `POST /memory/erase`: `ForgetPolicy` (age/confidence
      decay) + HMAC-signed `memory.forget`/`memory.erasure` proofs. Extension: sensitivity-based
      forgetting (schema column) + a scheduled decay job.)*
- [x] **D. Belief-revision + confidence**, then **E. Reflection**, then **C. Federated org memory**
      (the multi-agent network-effect layer). *(Shipped + WIRED: D = `DeriveRevisions` belief-revision log
      + `Fact.Uncertain`; E = concrete LLM `Reflector` set in `EnableMemoryDepth`, triggered by
      `POST /memory/reflect`; C = org-scoped `IncludeShared` retrieval (live) + `POST /memory/facts`
      writer for `ScopeOrg`. Extensions: cross-org federation via A2A/fabric; reflection scheduler +
      richer provenance.)*

---

## 4b. Adoption DX — install + snippet + recipe (clarity, not cleverness)

For a memory *library*, the highest-trust onboarding is **not** a file-mutating scaffolder/codemod
(devs distrust tools that rewrite their repo, and they break on monorepos / custom layouts). It is
**install → a tiny, readable snippet → a framework-aware recipe.** The library *is* the product; the
recipes *are* the onboarding. Four parts:

**1. A minimal API (DX starts here, not in the docs).** You can only ship a 3-line snippet if the API
is 3 lines. Zero-config, local-by-default:

```ts
import { MemoryManager } from "actrone-memory";
const memory = await MemoryManager.create();                 // zero services, local by default
await memory.storeTurn(sessionId, userMsg, aiReply);
const ctx = await memory.retrieveContext(sessionId, query);  // budget-aware
```

**2. A recipe per framework — selection, not detection.** Don't detect their framework and edit their
code; give a short, runnable recipe for each framework the dev *picks*. Identical shape every time
(`install → paste → run → what you get`), for LangGraph / LangChain / Vercel AI / CrewAI / LlamaIndex /
Mastra / OpenAI Agents / MCP. The dev pastes 5 lines into *their* code — nothing parses or mutates it.
Every recipe ends with the `// ⬆ swap for @actrone/sdk's ActroneMemoryManager → hosted, governed` seed.

**3. The recipes are REAL, CI-tested examples — so they never rot (this is the trust).** ✅ SHIPPED
(TS): each framework recipe is a compiling example in `actrone-memory-ts/examples/frameworks/<fw>.ts`,
**typechecked in CI** (`typecheck:examples`) against the current adapter API, with its `#region` snippet
**extracted** into `examples/snippets.json` (drift-gated by `snippets:check`) and a `vitest` test tying
`RECIPES` ↔ the compiled examples. Because the adapters are structural, the wiring compiles against
`actrone-memory` alone — a recipe that breaks fails the build. *(Executing against each real framework
version — vs typechecking the wiring — remains a further hardening step gated on installing the 8
frameworks in CI.)*

**4. The convenience layer, non-destructively (optional).** A snippet *printer*, not a codemod:

```bash
npx actrone-memory add langgraph            # prints install + the exact recipe (stdout/clipboard)
npx actrone-memory add langgraph --write memory.ts   # writes ONE new self-contained file; never touches yours
```

It only **prints** or **creates a brand-new file** and tells you the one import to add — it never reads
or edits existing code. `create-actrone-app` remains the *greenfield* path; this is the existing-project
path.

**Backends are pluggable + optional (the "3-line snippet" depends on it).** The store is an interface,
not a hard dependency: TS **already** defaults to in-memory + local embedder (Redis/Qdrant optional);
the roadmap's local-first Python default (§4) makes Python the same. Redis/Qdrant become **optional
production adapters**, never a required first-run dependency — which is what lets the snippet be
genuinely 3 lines with no services.

**Docs architecture:** a 30-second zero-framework Quickstart · one identical-shape recipe page per
framework (all CI-tested) · a cookbook (multi-session persistence, local embeddings/no-API-key,
provenance/erasure, the hosted upgrade) · a copy button on every tested block.

**Metrics:** time-to-first-`retrieveContext`, quickstart completion, per-framework recipe copy events,
issues-per-recipe (→ 0, because CI catches breakage first).

**The only real engineering this needs:** (a) the local-first **Python** default so the snippet is
truly 3 lines; (b) **deepen the TS adapters** from prompt-formatters to real integrations so the
recipes are good; (c) the **CI harness that runs every recipe** — which you want anyway for the
benchmark/eval (§5).

---

## 5. Measure it (the benchmark is a first-class deliverable)

- Build a **public, reproducible** benchmark vs Mem0/Zep/Letta on LoCoMo/LongMemEval-style tasks
  ([memory benchmarks 2026](https://mem0.ai/blog/ai-memory-benchmarks-in-2026)) — **honest about where
  we win (latency, cost, local-first, governance) and lose (raw recall depth, today).**
- **Ship the eval harness in the repo** and run it in CI — memory quality becomes a measurable,
  regression-gated property, and the pillars (A/E especially) are validated by *lift on the benchmark*,
  not vibes. This is itself a differentiator no competitor offers.

---

## 6. Corrections this creates for the other docs

- **Product Review §7 / strategy docs:** the "memory lacks extraction/consolidation/graph depth" line
  is accurate for the **OSS lib** but under-sells the **hosted** side — `memorydepth` already implements
  extraction + temporal consolidation + conflict resolution + provenance + governed erasure. The honest
  caveat is that it's **off by default and its retrieval loop is open**, not that it's absent. Update
  the framing to: *"the OSS wedge is turn-based; the hosted engine (`memorydepth`) is Mem0/Zep-class on
  ingest + governance, but dormant and read-loop-incomplete — a near-term turn-on, not a build."*

---

## 7. What's remaining (honest, as of the Cycle-13 gap-closure)

Everything in §4 (Now / Near-term / Moats A–F) and §4b is **built + tested** (see `progress.md`
Cycles 11–13). What follows is the *genuinely* remaining work, split by kind so it's actionable and
nobody over-claims. Nothing here is a silent gap — each is stated.

### 8a. Deploy / config gates (code complete — needs an operator action, not engineering)

- **Apply the migrations:** `00118_memory_fact_outcomes` (Moat-A signal), `00119_memory_fact_embeddings`
  (semantic retrieval). Standard `goose up`.
- **Embedding key for semantic fact retrieval:** set the OpenAI/embedding key. Without it, the write path
  stores no fact embeddings and retrieval ranks by confidence + learned utility only (graceful fallback,
  not a bug).
- **Governance layer (EMAOP) for the memory proofs:** the tamper-evident audit spine only exists when
  `emaop.enabled=true`, so **verifiable memory (B)** and **provable-forgetting/erasure proofs (F)** are
  written only in a governed deployment. A startup warning surfaces the coupling when memory-depth is on
  but the spine is absent. (This is by design — verifiable memory is a governance feature.)
- **Memory-hygiene scheduler:** OFF by default. Set `cost_opt.memory_hygiene_interval` (+ decay
  age/confidence, optional `memory_reflect_enabled`) to enable autonomous decay-forgetting/reflection.
- **memory-depth rollout:** the *code default* is now on, reversibly; the *ops* gate remains a per-tenant
  live-eval + cost shadow-measurement via the savings ledger before broad enablement.
- **OSS release:** both lib CHANGELOGs carry `Unreleased` entries; version bumps + `npm publish` /
  `pypi` are owner-controlled.

### 8b. Remaining engineering (larger, not yet built)

- **Framework examples against *real installed* frameworks in CI.** Today the 8 `examples/frameworks/*.ts`
  are CI-**typechecked** against our structural adapters (a real guarantee the wiring compiles). Executing
  them against each framework's actual published version needs the 8 frameworks installed in CI.
- **Live comparative benchmark numbers vs Mem0/Zep/Letta.** The comparative harness + a dependency-free
  baseline ship (Actrone 0.929 vs baseline 0.571 recall@5, reproducible); real competitor numbers need
  their libs + API keys + a thin adapter (protocol documented in `benchmark/README.md`).
- **Cross-org federated memory (C).** Intra-org sharing (org-scoped facts across an org's agents) is
  wired; cross-*org* federation across trust boundaries rides the existing A2A / cross-org fabric spine —
  not yet built.
- **Sensitivity-based forgetting (F).** Age/confidence decay ships; sensitivity-driven forgetting in the
  hosted engine needs a `sensitivity` column on the Go `memory_facts` (the OSS libs already carry it).
- **Belief-revision history is a *log*, not a store (D).** Supersessions emit a structured
  `memory.belief_revised` log; a durable, queryable belief-revision **table + API** (and calibrated
  per-fact confidence beyond the extractor's) is the next step.
- **Semantic retrieval at scale.** Ranking is Go-side cosine over a bounded candidate set (fine for the
  consolidated active set); a pgvector/ANN index is the scale-out.
- **Recipe single-source-of-truth.** `recipes.ts` strings and the CI-typechecked `examples/frameworks/`
  share the adapter API and are both tested; generating the recipe strings *from* the examples (so they
  are literally one artifact) is a further nicety.
- **OSS integration-test coverage.** The Python durable `redis_qdrant` backend + graceful-shutdown drain
  path lack automated coverage (needs testcontainers); unit coverage is 89%.

### 8c. Known deviations / hygiene (pre-existing, non-blocking)

- **Python OSS logging** doesn't use the workspace canonical `bind_logger()` field schema (`service` /
  `request_id` / `trace_id`) — the `logging.py` helpers are unused (CLAUDE.md §6.3 deviation, pre-dates
  this work).
- **Shared memory spec (§1)** is partially realized: `docs/memory-spec/extraction.v1.md` exists; the
  fuller fact-model / consolidation shared spec across Go + Py + TS is not yet a single versioned artifact.

---

## 8. The one line

> **Keep the OSS lib the best free, local-first, provenance-typed, no-lock-in memory on its axis; close
> and light up the `memorydepth` engine hosted already has; then build the layer only we can — memory
> that learns which memories helped, proves what it knew, forgets provably, and shares safely across
> agents — and name the category we just created: verifiable cognitive memory.**
