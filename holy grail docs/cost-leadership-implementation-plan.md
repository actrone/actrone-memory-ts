# Cost-Leadership & Quality — Implementation Plan

> **Status:** ✅ BUILT & SERVING (verified by code audit 2026-07-04) · **Owner:** Matt · **Last updated:** 2026-07-04
> **Audit note (2026-07-04):** Waves 1–4 are not "shelved libraries" — they are wired into the live
> `activity_service` request path: `costRouter.Select` (`optimizer.PredictiveRouter`), `compress.Compress`,
> `optimizer.NewCascade`, `EnableEvalGate`, `EnableDistillServing`, `savings` emit; `main.go` constructs
> `semcache.New`, `savings.NewService`, the distill Orchestrator + tuner. Packages: `internal/{compress,
> distill,distillflow,eval,floors,optimizer,savings,semcache,semcachestore}`; migrations 00023–00025,00028.
> **Deployment-gated only:** semcache needs a Qdrant collection; distillation needs a fine-tune provider key.
>
> **Status refreshed 2026-07-13 (code-verified) — corrects "deployment-gated only":** every lever in
> this doc is code-complete (no stubs/TODOs found in `internal/{distill,eval,optimizer,semcache,
> savings}`), but **the gate is a flag default, not (only) a deployment prerequisite** — a fresh deploy
> serves byte-identical to pre-flywheel behaviour until an operator flips each flag, exactly as
> `config.go:110-113` itself documents (so this part of the 2026-06-03 strategy doc's own scope guard
> was already honest; the *implementation* doc's "deployment-gated only" undersold how much is also
> flag-gated). Verified flag defaults, all `false` unless noted: `cost_opt.predictive_routing=false`,
> `cost_opt.distillation=false`, `cost_opt.cascade=false`, `semcache.enabled=false`,
> `governance.enable_eval_gate=false`. (`cost_opt.memory_depth` is the one CostOpt lever that defaults
> `true` — unrelated to this doc, see the Memory Strategy doc.) `savings.NewService` is the one
> component that *is* unconditionally live (no flag) — but since its 3 real event producers (cascade,
> semcache, predictive-routing) all default off, the ledger receives ~no events in a stock deployment.
>
> **Three real defects found this pass, not previously documented:**
> 1. **Distillation is double-gated, and the second gate fails *silently*.** Even with
>    `cost_opt.distillation=true`, the flywheel (train→eval→promote) additionally requires
>    `ORCHESTRATOR_MODEL_TOGETHER_API_KEY` — when absent, `main.go` logs
>    `cost_opt.distillation_flywheel.inert` (info, not error) and never registers the workflow/scanner.
>    This confirms the memorydepth-style "inert without a fine-tune key" pattern the task asked about.
> 2. **A/B *experiment* router dormant — but distillation serving is NOT unwired (corrected 2026-07-13).**
>    The first pass concluded the promoted student is never served; that over-reached. `governance/
>    ab_router.RouteModel` (the *A/B-experiment* hook) indeed has no live callers, so A/B experiments are
>    idle. **However, distilled-model serving goes through a different path** — `service.ActivityService.
>    RouteModel` + the distill resolver (see `activity_service.go:245,1539`, which explicitly resolve the
>    distilled/promoted model as the cheapest choice). So the flywheel's *serve* step DOES work via the
>    service router; only the separate A/B experiment router (§7.3's `ab_router` phrasing) is dormant.
>    Net: distillation train→eval→promote→serve is wired; A/B experimentation is the idle piece.
> 3. **The Wave-2 quality/hallucination circuit breaker's trip signal is unconsumed.** `eval.Breaker.
>    Record` is called on every gate check (`service/eval_gate.go`), but `Breaker.Tripped()` is called
>    nowhere in production code — only in `eval/eval_test.go`. The breaker accumulates a rolling
>    pass-rate window that nothing reads to actually revert a route, even when
>    `governance.enable_eval_gate=true`. §5.3's "Quality/hallucination circuit breaker" is built but
>    inert.
>
> Everything else in this doc's per-wave build claims (§4–§8, the M1–M3 implementation-status section)
> checked out against current code: cascade, predictive routing, and semantic cache are genuinely
> invoked per-request when their flags are on (`activity_service.go` call sites for
> `s.tryCascade`/`s.costRouter.Select`, and the gateway's `semanticCache` consultation); the eval
> `Gate.Check` itself (as opposed to the breaker) is real and floor-aware.
> **Companion to:** [cost-leadership-and-quality-waves.md](cost-leadership-and-quality-waves.md) (strategy/what) · [monetization-strategy.md](monetization-strategy.md) (pricing).
> **This doc = the *how*:** production-grade engineering plan for Waves 1–4 + eval + memory, every component held to the standards in the workspace `CLAUDE.md`.
> **Scope guard:** no self-hosted GPU inference — distillation uses provider fine-tuning + serverless inference. KV-cache reuse / speculative decoding are out until that changes.

---

## Table of contents

1. [Engineering standards — the gate every component passes](#1-engineering-standards--the-gate-every-component-passes)
2. [Architecture: the gated optimizer](#2-architecture-the-gated-optimizer)
3. [Shared foundations](#3-shared-foundations)
4. [Wave 1 — Parity foundation + measurement spine](#4-wave-1--parity-foundation--measurement-spine)
5. [Wave 2 — Quality & groundedness gate (eval harness)](#5-wave-2--quality--groundedness-gate-eval-harness)
6. [Wave 3 — Control-plane-only optimizers](#6-wave-3--control-plane-only-optimizers)
7. [Wave 4 — Distillation flywheel](#7-wave-4--distillation-flywheel)
8. [Memory depth workstream](#8-memory-depth-workstream)
9. [Factuality & hallucination control](#9-factuality--hallucination-control)
10. [Security implementation](#10-security-implementation)
11. [Testing strategy](#11-testing-strategy)
12. [Rollout, milestones, risks & acceptance gates](#12-rollout-milestones-risks--acceptance-gates)

---

## 1. Engineering standards — the gate every component passes

Every workstream below is implemented to `CLAUDE.md`. The non-negotiable checklist applied to **each** new package/component:

- **Errors are values.** Wrap with `%w` + call-site context; domain errors carry `code` / `message` / `details` / `request_id` (`domain.DomainError`). No silent swallowing.
- **Context first.** `context.Context` is the first arg of every I/O function; deadlines on every outbound call.
- **Config is typed + validated at startup** (viper struct); fail fast on missing required vars. No scattered `os.Getenv`.
- **Concurrency is bounded.** `errgroup` for fan-out with coordinated cancellation; `sync.Semaphore`/worker-pool limits on every fan-out (eval batches, attribution flush, distill jobs). Never unbounded goroutines.
- **Outbound calls** (provider fine-tune, judge LLM, model API): retry = exponential backoff + jitter, max 3; circuit breaker (`gobreaker`); mandatory timeout.
- **Idempotency** on every write/external submit: client-or-server idempotency key stored in DB; same key on retries (per the existing `submit_task` discipline).
- **Parameterised SQL only** (pgx); indexes on every FK + WHERE/ORDER-BY column on tables > 10k rows; `EXPLAIN ANALYZE` before shipping hot queries.
- **Migrations** via `goose`, embedded (`go:embed`), backwards-compatible + reversible; audit/financial tables are **append-only** (never `UPDATE`/`DELETE`).
- **Structured JSON logs** on stdout with the canonical field schema (`service`, `request_id`, `trace_id`, `event`, plus `tenant_id`/`agent_id`/`task_id`); use `bind_logger` helpers, never ad-hoc kwargs.
- **Metrics** (`promauto`) on `/metrics`: rate, error rate, latency p50/p95/p99, queue depth, cache-hit rate per new subsystem. **Traces**: propagate W3C `traceparent` across boundaries (OTel).
- **Graceful shutdown**: trap SIGTERM/SIGINT, drain, close pools, flush — new background workers (attribution flusher, distill poller, memory consolidator) register with the existing shutdown group.
- **Security by construction**: tenant-scoped every query; secrets in the vault; allowlist input validation + max lengths; injection/SSRF scanning on any externally-influenced content via the existing `tool.Sanitiser`.
- **Tests**: unit ≥ 80% of business logic, table-driven, deterministic (test clocks, no `time.Sleep`); integration via testcontainers (Postgres/Redis/Qdrant); race detector on; error paths tested as rigorously as happy paths.
- **CI gates** (nothing merges without): lint (zero warnings), test (race + coverage threshold), security (`govulncheck` — no HIGH/CRITICAL), build (multi-stage Docker), contract (no breaking API/proto changes).

**Package conventions:** new code lives under `backend/orchestrator/internal/<domain>`; pure logic in `domain/`-style packages with no I/O; adapters in `repository/` + `handler/`; cross-package wiring stays explicit in `cmd/orchestrator/main.go` (no `init()` side effects). Each consumer defines its own **minimal interface** for collaborators (the established `Notifier` pattern) to avoid import cycles.

---

## 2. Architecture: the gated optimizer

The whole system is one loop: **optimize spend subject to quality, groundedness, and security floors, measured on governed traces.** Cost is captured only as the residual.

```
            ┌──────────────────────── Per-agent floors ───────────────────────┐
            │  quality ≥ Q   groundedness ≥ G   cost ≤ C   security policy     │
            └──────────────────────────────────────────────────────────────────┘
                                   ▲ (gate)                 │ (signal)
 task ─▶ memory(retrieve, governed) ─▶ optimizer ─▶ model call(s) ─▶ verify ─▶ result
            │                            │  (cache / route / cascade / distill)   │
            ▼                            ▼                                         ▼
        provenance                savings_events  ◀── attribution ──▶  eval_results
                                        │                                   │
                                        └────────── Cost Monitor + audit ledger ──────────┘
```

- **Optimizer** (Wave 1/3/4) proposes the cheapest path.
- **Gate** (Wave 2 eval/floors) is the hard constraint — a proposal that can't prove it holds quality/groundedness is rejected or escalated.
- **Attribution** (Wave 1 spine) records baseline-vs-actual cost **and** quality delta for every decision → Cost Monitor + the savings-backed fee.
- Everything writes to the tamper-evident **audit ledger**.

New top-level packages: `internal/savings`, `internal/eval`, `internal/optimizer`, `internal/distill`; `internal/memory` extended; `internal/model` extended (semantic cache, compression).

---

## 3. Shared foundations

Built first; everything depends on them.

### 3.1 Per-agent floors (the gate's contract)

- **Migration** `00023_agent_floors.sql`: `agent_floors(tenant_id, agent_id, quality_floor numeric, groundedness_floor numeric, max_cost_usd numeric, max_quality_mode bool, updated_at, PRIMARY KEY(tenant_id, agent_id))`. Backwards-compatible defaults so existing agents get safe floors (max-quality until configured).
- **Package** `internal/floors`: typed `Floors` struct, `Repository` (Get/Upsert, tenant-scoped, cached in Redis with TTL + single-flight), `Resolver` used by optimizer + eval.
- **Security:** tenant-scoped; `max_quality_mode=true` disables all aggressive levers for that agent (the "ignore cost" switch).

### 3.2 The optimizer–gate interface (no import cycles)

```go
// internal/optimizer/gate.go — consumers depend on this, not on eval/floors directly.
type Gate interface {
    // Allow reports whether a proposed cheaper path meets the agent's floors,
    // given the candidate output (or a pre-flight predicted score).
    Allow(ctx context.Context, in GateInput) (Decision, error)
}
type Decision struct{ Allowed bool; Reason string; Escalate bool }
```
`internal/eval` provides the concrete `Gate`; `internal/optimizer` and the Temporal activities depend only on the interface.

### 3.3 Observability conventions

- Metric namespace `actrone_optimizer_*`, `actrone_eval_*`, `actrone_savings_*`, `actrone_memory_*`, `actrone_distill_*`.
- Canonical events: `optimizer.route.selected`, `eval.gate.blocked`, `savings.recorded`, `distill.promoted`, `memory.fact.extracted`, etc.
- Every gate/route/promotion decision → audit ledger entry (immutable).

### 3.4 Feature flags / rollout switch

- Reuse the existing env-var flag boundary (and the planned entitlement layer): every wave behind a flag, default off, shadow-capable. Flags: `OPT_SEMANTIC_CACHE`, `OPT_CASCADE`, `OPT_PREDICTIVE_ROUTE`, `OPT_DISTILL`, `EVAL_ONLINE`, `MEM_STRUCTURED`. Kill-switch parity with the existing cost kill-switch.

---

## 4. Wave 1 — Parity foundation + measurement spine

**Goal:** zero-quality-risk savings + the attribution spine. Ship first; lowest risk.

### 4.1 Savings attribution spine (build before the levers)

- **Migration** `00024_savings_events.sql` — **append-only**: `savings_events(id uuid pk, tenant_id, task_id, agent_id, source text, baseline_usd numeric, actual_usd numeric, saved_usd numeric, quality_delta numeric null, model_baseline text, model_actual text, idempotency_key text unique, created_at timestamptz)`. Indexes: `(tenant_id, created_at)`, `(tenant_id, source, created_at)`. No update/delete (financial integrity).
- **Package** `internal/savings`:
  - `Recorder` interface (minimal): `Record(ctx, Event)` — satisfied by the repo; injected into cache/router/batch like the `Notifier` pattern.
  - Baseline computation reuses `model.BudgetPredictor` (already prices the primary model for the token counts) → no new pricing logic.
  - **Buffered aggregator** with bounded channel + a single drain goroutine (graceful-shutdown-registered) batching inserts (avoid per-call writes). Idempotency key = `sha256(task_id|call_seq|source)`.
- **Source enum:** `cache_hit | prompt_cache | compress | batch | cost_route | cascade | distill | memory_budget`.
- **Cost Monitor surface:** new aggregation query `monthly_saved_by_source(tenant, period)` → API → the dashboard headline (frontend `cost` page). Fee↔savings reconciliation job (monthly) feeds billing credits (monetization §6).
- **Tests:** table-driven per source; idempotency (same key twice → one row); aggregation correctness; race on the aggregator.

### 4.2 Semantic cache

- **Storage:** dedicated Qdrant collection `llm_semantic_cache` (reuse the Qdrant client); payload = `{tenant_id, agent_id, response, prompt_hash, cacheable, created_at}`. Redis holds the hot exact-hash layer (existing `query_cache`).
- **Package:** extend `internal/model` with `SemanticCache` wrapping `QueryCache` wrapping `Router` (decorator chain).
  - Lookup: embed prompt → tenant+agent-scoped vector search → if score ≥ threshold AND `cacheable` AND **governance allows** → optional cheap verify (Gate pre-flight) → serve; else miss.
  - **Governance-scoped cacheability:** a response is cached only if the governance engine marks it non-sensitive (no PII / policy-blocked). Reuse the policy engine + `Sanitiser`.
  - Memory-aware invalidation: cache entries carry the memory-version they were generated under; bump invalidates.
- **Config:** `semantic_cache.{enabled, similarity_threshold, ttl, max_entries_per_tenant}` (viper).
- **Metrics:** hit rate, similarity histogram, verify-reject rate. **Savings:** emit `cache_hit` events (saved = baseline).
- **Security:** strict tenant+namespace scoping (no cross-tenant hits — a correctness *and* security property; covered by an integration test).
- **Tests:** hit/miss thresholds, governance refusal (PII never cached), tenant isolation, TTL/invalidation.

### 4.3 Provider-native prompt caching pass-through

- **Package:** `internal/model` provider adapters (`openai.go`, `anthropic.go`, …) gain prompt-cache controls (cache-control breakpoints / cached prefixes per provider API).
- **Cache-aware prompt construction:** a `PromptBuilder` orders segments stable→volatile (system + long context first) to maximize prefix reuse. Lives in the workflow's prompt assembly.
- **Savings:** emit `prompt_cache` events using provider-reported cached-token counts.
- **Tests:** builder ordering determinism; per-provider cache-control wiring (mocked providers).

### 4.4 Prompt/context compression

- **Package** `internal/compress`: `Compressor` interface; an LLMLingua-style implementation (or a hosted compressor) behind it. Retrieval-aware: compress using the memory relevance scores; **never** compress flagged-critical instruction segments.
- **Gate-bound:** compression ratio is eval-gated per agent (Wave 2) — disabled if it drops groundedness below floor.
- **Savings:** emit `compress` events (baseline = pre-trim tokens).
- **Tests:** critical-segment preservation; ratio bounds; gate interaction (golden faithfulness set).

### 4.5 Durable batch arbitrage

- **Build on** the existing `batch_service` + `batch_provider`. Add an **auto-defer policy**: tasks whose agent declares latency tolerance (or below a priority threshold) are auto-routed to batch by the workflow rather than requiring `batch_mode=true`.
- **Durable:** the Temporal workflow owns deferral; resumes on the batch result (already durable). Hard SLA cap escalates to real-time if the batch window risks breach.
- **Savings:** emit `batch` events (saved = 50% of baseline). **task.failed** alert path already wired.
- **Tests:** deferral policy table; SLA-breach escalation; idempotent result write-back.

---

## 5. Wave 2 — Quality & groundedness gate (eval harness)

**Goal:** the always-on guarantee. **Prerequisite for Waves 3–4.** This is the largest single build; it also delivers the §8 eval-depth differentiators.

### 5.1 Data model

`00025_eval.sql`:
- `eval_datasets(id, tenant_id, agent_id, name, kind, created_at)` — golden/reference sets.
- `eval_examples(id, dataset_id, input jsonb, reference jsonb null, created_at)`.
- `eval_runs(id, tenant_id, agent_id, dataset_id, target jsonb /*model/prompt/version*/, mode text /*offline|online|shadow*/, status, started_at, finished_at)`.
- `eval_results(id, run_id, example_id null, scorer text, score numeric, passed bool, detail jsonb, created_at)` — append-only.
- `eval_online_samples(...)` — production-sampled/online eval records (links to `task_id`, groundedness/quality scores).
- Indexes on `(tenant_id, agent_id, created_at)` and `(run_id)`.

### 5.2 Packages

- `internal/eval`:
  - `Evaluator` interface; implementations: `LLMJudge` (tunable, with retries+breaker+timeout), `Heuristic`, `Pairwise`, `TaskMetric`, `Groundedness`.
  - `Harness` — runs datasets ↔ targets with **bounded `errgroup`** fan-out (semaphore on judge concurrency to respect provider rate limits + cost).
  - `Gate` (implements §3.2) — pre-flight (predicted) and post-hoc (actual) decisions against floors.
  - `OnlineEvaluator` — samples production traffic (100%-capable at Business+; sampled at Pro) and scores groundedness against the **actual retrieved context + tool outputs** held by the runtime.
- `internal/eval/groundedness`: verifier that checks a claim set against provided context/tools → score + unsupported-claim list. Reused by cascades (Wave 3), memory hygiene (§8 of waves), and the abstain default.

### 5.3 Behaviors

- **Per-agent floors** enforced via `internal/floors`.
- **Shadow testing:** run candidate path in parallel, write `eval_runs(mode=shadow)`; never serve until it clears the floor over a window.
- **Eval-as-governance:** a failing gate can *block a deploy/promotion* and writes a signed audit entry (governance engine).
- **Abstain-over-fabricate:** governance default — when groundedness < floor and no escalation path, return a structured "insufficient grounding" result instead of an answer.
- **Quality/hallucination circuit breaker:** `internal/eval` exposes a breaker keyed by (agent, route); trips on rolling quality/groundedness regression → optimizer reverts to safe model + fires the existing alert (`notify`).

### 5.4 Standards specifics

- Judge calls: backoff+jitter, breaker, timeout, idempotency (cache judge results by `sha256(scorer|input|output)` to avoid re-paying).
- **Auto eval-set generation:** a bounded background job builds datasets from *accepted* governed traces (PII-scrubbed) — registered with graceful shutdown.
- **Metrics:** `actrone_eval_score`, gate block rate, online-eval coverage, breaker trips. **Cost:** judge ops metered (monetization §14).
- **Tests:** deterministic judges via a fake LLM in unit tests; golden datasets for the groundedness verifier; gate decision table; breaker trip/recover; integration on Postgres.

---

## 6. Wave 3 — Control-plane-only optimizers

**Goal:** deepest cost wins, every route gated by Wave 2.

### 6.1 Model cascades (verify-then-escalate)

- **Where:** a new activity in the task workflow (`internal/workflow` + `internal/optimizer`). Cheap model → `Groundedness`/quality verify → if `Decision.Escalate`, call frontier; else serve.
- **Determinism:** Temporal activities stay deterministic; the cascade decision is an activity result, not in-workflow nondeterminism.
- **Savings:** `cascade` events (saved = frontier baseline − cheap actual when accepted).
- **Tests:** accept/escalate paths; verifier failure → escalate (fail-safe to quality); cost accounting.

### 6.2 Trace-driven predictive routing

- **Build on** `model.Router` + `BudgetPredictor`. Add `PredictiveStrategy`: per (agent, task-cluster) pick the cheapest model whose **historical** eval scores (from `eval_results`/`eval_online_samples`) cleared the floor.
- **Model:** a lightweight learned policy (start: per-cluster aggregate stats; no heavy ML). Stored in `00026_route_policy.sql` `route_policy(tenant_id, agent_id, cluster_id, model, p_meets_floor, n, updated_at)`, refreshed by a bounded background job.
- **Cold start / OOD:** fall back to primary-with-fallback; low-confidence escalates.
- **Tests:** policy selection table; OOD fallback; floor-respect invariant (never route below predicted floor).

### 6.3 Multi-agent budget allocation

- **Build on** the MACP graph (`internal/macp`). Add a planner pass that assigns models by role (planner→frontier, workers→cheap), dedupes identical sub-agent calls (content-hash), and batches parallel sub-agents via `errgroup` with a semaphore.
- **Critic agent:** optional verifier node reviewing sibling outputs (groundedness).
- **Tests:** allocation table; dedupe correctness; bounded concurrency; critic veto path.

### 6.4 Memory-as-cache / context dedup

- Cross-turn + cross-agent context dedup using memory provenance (§8). Don't resend context already in the model's prompt-cache prefix or already grounded in memory.
- **Savings:** `memory_budget` events.

---

## 7. Wave 4 — Distillation flywheel

**Goal:** per-tenant compounding cost curve. Long-running, durable, fully gated. **No GPUs of ours** — provider fine-tuning + serverless inference.

### 7.1 Data model `00027_distill.sql`

- `distill_candidates(id, tenant_id, agent_id, score numeric, volume int, cluster_tightness numeric, est_savings_usd numeric, status, created_at)`.
- `distill_datasets(id, tenant_id, agent_id, n_examples int, storage_uri text, pii_scrubbed bool, created_at)` — dataset is the customer's asset (export-eligible).
- `distill_jobs(id, tenant_id, agent_id, dataset_id, provider text, base_model text, idempotency_key unique, status, provider_job_ref text, cost_usd numeric, created_at, updated_at)`.
- `distilled_models(id, tenant_id, agent_id, base_model, provider, model_handle text, weights_uri text null, version int, eval_run_id, status text /*shadow|promoted|rolled_back*/, owned_by_customer bool default true, promoted_at, created_at)`.
- All tenant-scoped; **hard constraint: no row may mix tenants** (enforced in code + a CHECK-style test).

### 7.2 Orchestration (Temporal — durability is the point)

`DistillationWorkflow` (one per agent candidate), durable + idempotent:
1. **Eligibility** activity — score from trace stats; gate on volume/savings threshold.
2. **Dataset assembly** activity — pull *accepted* governed traces, **PII-scrub** (governance), dedupe, split; write dataset (idempotent by content hash).
3. **Fine-tune submit** activity — provider fine-tune API; idempotency key prevents duplicate jobs on retry; backoff+jitter+breaker+timeout.
4. **Poll** (durable wait / Temporal timer) until job completes — survives worker restarts.
5. **Eval gate** activity — run the Wave 2 harness on held-out set; faithfulness + quality must clear the agent floor. Fail → stop, mark candidate, alert.
6. **Shadow** — register the student for shadow serving; compare over a window.
7. **Promote** — write `distilled_models(status=promoted)`; flip the routing handle.

### 7.3 Serving + monitoring

- **Serving:** the existing `ab_router` fine-tuned-model hook resolves the promoted student per (tenant, agent). Router sends in-distribution/high-confidence tasks to the student; OOD/low-confidence/failed-groundedness → **cascade-escalate** to frontier (Wave 3).
- **Monitor + auto-rollback:** the Wave 2 circuit breaker watches the student; drift → flip handle back to frontier (`status=rolled_back`), alert, re-queue re-distill.
- **Savings:** `distill` events; the fee↔savings reconciliation (monetization §6) charges only demonstrated net.

### 7.4 Ownership / portability / isolation (build-level)

- **Default:** `owned_by_customer=true`; Actrone holds an operating license.
- **Open-weight path:** `weights_uri` populated (object storage, tenant-scoped, encrypted) → export endpoint hands over weights + dataset. **Business/Enterprise** entitlement.
- **Closed-provider path:** no weights; export hands over the dataset (reproducible).
- **Isolation:** dataset assembly and fine-tune are hard-scoped to one tenant; a guard rejects any multi-tenant dataset; provider calls use **no-retention/enterprise** terms (config-asserted); self-host path keeps everything in-VPC.
- **Audit:** every assemble/submit/eval/promote/rollback/export → signed ledger entry.

### 7.5 Standards specifics

- Long-running workers register with graceful shutdown; provider keys in vault; all provider calls retried/broken/timed-out; jobs idempotent; costs recorded to `distill_jobs.cost_usd` for margin reporting.
- **Tests:** workflow happy + each failure path (Temporal test env); PII-scrub correctness; tenant-isolation guard; eval-gate rejection; rollback path; export (both substrates).

---

## 8. Memory depth workstream

**Goal:** close the Mem0/Zep depth gap, then leap with governed/verifiable/self-improving memory. Extends `internal/memory`.

### 8.1 Data model `00028_memory_depth.sql`

- `memory_facts(id, tenant_id, agent_id, scope text /*user|agent|session|org*/, subject text, predicate text, object text, confidence numeric, source_turn_id, source_tool_id null, valid_from, valid_to null, embedding vector, created_at)` — extracted structured memory with **provenance** (`source_*`) and temporal validity.
- `memory_graph_edges(id, tenant_id, from_node, to_node, relation, weight, source_fact_id, created_at)` — knowledge-graph tier.
- `memory_erasures(id, tenant_id, subject, requested_by, scope, created_at)` — append-only GDPR right-to-erasure log.
- Tenant-scoped; vectors in Qdrant, structured rows in Postgres, hot layer in Redis (the existing two-tier stays as L1/L2; facts/graph are a higher tier).

### 8.2 Components

- **Extraction** (`internal/memory/extract`): LLM-based fact/preference/entity extraction from turns → `memory_facts` (+ embeddings). Bounded, async, idempotent per turn.
- **Consolidation** (`internal/memory/consolidate`): semantic dedup + conflict resolution; supersede stale facts via `valid_to`; **eval-gated hygiene** — a fact failing groundedness verification is invalidated. Background worker, graceful-shutdown-registered.
- **Graph tier**: entity/relation upsert from facts; retrieval can traverse for structured recall.
- **Governed memory:** every read/write passes the policy engine — PII redaction on write, residency-scoped storage, access audit-logged; right-to-erasure executes a tombstone + purge across L1/L2/facts/graph and logs to `memory_erasures`.
- **Provenance ("cited memory"):** recall returns facts with their source ids; the groundedness verifier can confirm a recalled fact against its provenance before use.
- **Cost-joined retrieval:** extend the budget-aware retriever to relevance-minimal, eval-verified context (don't retrieve what won't change the answer).
- **Memory flywheel:** measure retrieval quality per agent via the eval harness → tune store/recall params per agent (stored policy), refreshed by a bounded job.

### 8.3 Standards specifics

- Extraction/consolidation are bounded async; never block the request path.
- Erasure is a first-class, tested, audited operation (compliance).
- **Tests:** extraction golden sets; consolidation conflict cases; erasure completeness across all tiers (critical); tenant isolation; provenance round-trip; retrieval-minimality vs quality (golden faithfulness set).

---

## 9. Factuality & hallucination control

Rides the same machinery — mostly wiring, not new infra.

- **Groundedness verifier** (Wave 2) wired into: cascades (Wave 3), memory hygiene (§8), and the abstain default.
- **Citation/attribution enforcement:** governance policy requiring factual claims to trace to a source (memory provenance or tool output); uncited claims flagged/blocked.
- **Self-consistency** (high-stakes agents only): sample N, escalate on disagreement — gated by the agent's floor (costs more, so reserved).
- **Hallucination-rate-as-a-gated-metric:** measured per agent from online eval → trips the circuit breaker → revert + alert.
- **`max_quality_mode`** (§3.1) hard-disables aggressive levers for an agent.
- **Honest invariant (documented + tested):** the system **bounds and reduces** hallucinations to a customer-set tolerance; it does not eliminate them. The optimizer maximizes savings **subject to** the groundedness floor — never trades factuality for cost.

---

## 10. Security implementation

Per `CLAUDE.md §5`, applied to every wave:

- **Tenant isolation everywhere** — every query/cache key/dataset/model row tenant-scoped; cross-tenant access is a tested failure. **Distillation never pools tenants** (hard guard + test).
- **Secrets** (provider keys, fine-tune creds) in the vault; never in source/images; restricted scopes.
- **Input validation** — allowlist + max lengths on all new inputs (eval inputs, dataset payloads, floors config); reject oversized payloads at the boundary.
- **Injection/SSRF** — cached, retrieved, and distillation content scanned by the existing `tool.Sanitiser` before use/training.
- **PII** — redacted on memory write and dataset assembly; structured log scrubber on all new logs; never log tokens/PII/secrets.
- **Provider terms** — fine-tuning under no-retention/enterprise terms (config-asserted, startup-validated).
- **Audit** — every optimizer/eval/distill/memory-governance decision → tamper-evident ledger.
- **Dependency security** — `govulncheck` in CI; pinned deps; review crypto/network upgrades.
- **Transport** — TLS 1.2+; mTLS for internal service-to-service; standard security headers on any new HTTP surface; rate-limit new public endpoints.
- **Self-host/BYOC** — every component runs in-VPC; no hard dependency on a managed-only service.

---

## 11. Testing strategy

Per `CLAUDE.md §7`:

| Layer | Coverage | Tooling |
|---|---|---|
| Unit | ≥ 80% business logic; table-driven; deterministic (test clocks, fake LLM/judge); error+edge paths | `testing` + `testify` |
| Integration | Repos + adapters (savings, eval, distill, memory) against real backings | testcontainers (Postgres/Redis/Qdrant); Temporal test env for workflows |
| Contract | New REST/gRPC (eval, savings, distill, memory, floors) | pact / buf breaking |
| E2E | Critical journeys: a task that gets cached/cascaded/distilled with savings + quality attribution; an erasure request; a distill promote→rollback | Playwright (frontend) + API harness |

- No flaky tests (fix or delete); no shared mutable state; no `time.Sleep` (event-driven/poll helpers).
- **Property/invariant tests** for the non-negotiables: *savings never recorded without a passed gate*; *no cross-tenant cache hit / training row*; *erasure removes from every tier*; *optimizer never selects a route below the predicted floor*.

---

## 12. Rollout, milestones, risks & acceptance gates

### Milestones (sequenced; Wave 2 gates 3–4)

| # | Milestone | Delivers | Exit gate |
|---|---|---|---|
| M1 | Foundations + spine | floors, savings_events + attribution, Cost Monitor headline | spine records baseline/actual/quality-delta on 100% of calls; reconciliation job green |
| M2 | Wave 1 levers | semantic cache, prompt caching, compression, batch arbitrage | measured net savings > 0 with **zero** quality-floor breaches in shadow |
| M3 | Wave 2 gate | eval harness, floors enforcement, groundedness verifier, breaker | gate blocks below-floor routes in shadow; online eval coverage ≥ target |
| M4 | Wave 3 | cascades, predictive routing, multi-agent budgeting | savings up, quality/groundedness held (eval dashboards); OOD fallback verified |
| M5 | Memory depth | extraction, consolidation, graph, governed memory, erasure | erasure-completeness + provenance tests green; retrieval quality ≥ baseline |
| M6 | Wave 4 | distillation workflow, gated promotion, serving, rollback, export | promote only on eval-pass; rollback on drift; isolation + export tests green |

### Implementation status (live)

- **M1 — shipped.** `agent_floors` + `savings_events` migrations; `internal/floors` (single-flight cached repo) + `internal/savings` (append-only repo + non-blocking buffered aggregator, graceful drain); `model.CostForTokens`; `GET /v1/cost/savings`, `GET|PUT /v1/agents/{id}/floors`; wired in `main.go`. Unit-tested.
- **M2 — partial (the safely-shippable scope).**
  - **Shipped, wired, tested:** the two **quality-neutral** emitters — `cache_hit` (exact query cache, via `ActivityService.StreamLLMResponse`) and `batch` (via `BatchService`). Both feed the spine and `/v1/cost/savings`.
  - **Logic-complete, integration pending:** `internal/semcache` — the semantic cache (interfaces + isolation logic + governance gate + attribution), fully unit-tested incl. the **tenant-isolation invariant** (lookup scoped by agentID). Remaining: a Qdrant cache-collection `VectorStore` adapter + hot-path wiring, rolled out **flag-off → shadow-measured** (the embed-per-request cost must be shown < the saving via the spine).
  - **Deferred with cause:** *provider-native prompt caching* (prompt is already assembled stable-first; remaining work is provider-specific `cache_control` + cached-token accounting); *prompt compression* — eval-gated, unblocked once the M3 gate is consumed by a lever.
- **M3 — gate core shipped (the load-bearing heart).**
  - **Shipped, tested:** `internal/eval` — `Gate` (per-agent floor enforcement via `internal/floors`, **abstain-over-fabricate**, escalate-vs-abstain precedence), `GroundednessVerifier` (deterministic lexical pre-filter + optional LLM judge, **fails open** to the heuristic), quality/hallucination **circuit Breaker** (rolling per-route window, trips below pass-rate floor, recovers), `LLMJudge` (injectable `LLMCaller`, robust score parsing), append-only `eval_results` repository, and the `00025_eval.sql` migration. Comprehensive unit tests with fakes (gate decision table, fail-open, breaker trip/recover, judge parsing).
  - **Pending (M4 consumes it):** the gate is a tested library; its *runtime* effect lands when Wave-3 levers call `Gate.Check` (cascades/predictive routing) — that is M4 by sequence. The broader M3 surface (online-eval sampling pipeline, eval-as-governance deploy blocking, dataset/experiment APIs) is follow-on.
  - **Semantic-cache adapter:** the `VectorStore` Qdrant implementation + hot-path shadow wiring is integration code requiring a live Qdrant to verify; not faked here. The tested `internal/semcache` logic (M2) is ready for it.

### Environment-gated validation (do once a running stack exists)

Almost all remaining **code** is buildable and verifiable now — unit tests, **testcontainers** integration tests (real Postgres/Qdrant/Redis in CI), the Temporal **test environment**, and mockable LLM/fine-tune provider interfaces. Everything ships **flag-off** by default. The items below are *not code* — they are empirical validation and rollout that require real traffic, and must be completed before any lever serves production:

- [ ] **Net-savings shadow check** per lever — measured saving (via `savings_events`) exceeds its overhead (e.g. semantic-cache embed cost) on real prompts, before serving.
- [ ] **Quality-hold shadow check** — cost-routing / cascades / distilled models hold the per-agent quality + groundedness floors on real workloads (via `eval_results`).
- [ ] **Threshold calibration** — semantic-cache similarity threshold, per-agent floors, breaker window/pass-rate, distillation eligibility cutoffs — tuned against real data, not the defaults.
- [ ] **Rollout ramps** — each flag: shadow → canary % → ramp → default, with the kill-switch verified at each stage.
- [ ] **Cross-tenant isolation sign-off under load** — confirm agent-scoped cache/dataset filtering holds against a real Qdrant + concurrent multi-tenant traffic (unit invariant already asserted).
- [ ] **Distillation ROI per tenant** — confirm volume threshold + measured net savings before enabling the flywheel; verify cold-start (new tenants run 100% frontier).
- [ ] **Latency / SLO calibration** — p99 budgets (incl. the 50 ms health targets), embed/judge latency on the hot path, multi-window burn-rate alert thresholds.
- [ ] **Fee↔savings reconciliation at scale** — the monthly credit job matches measured savings against the routing-dividend fee on real volume.
- [ ] **Provider no-retention terms asserted** for fine-tuning in the live config.

A **local docker-compose** (Postgres + Redis + Qdrant + a Temporal dev server) covers most *correctness* validation without a full staging environment; only the real-traffic measurement and ramps above truly need staging/production.

### Rollout discipline

- Every wave: flag-gated → **shadow** (measure, never serve) → canary (small %) → ramp → default. Kill-switch at each stage. No aggressive lever serves traffic before its gate is live.

### Risk register

| Risk | Mitigation |
|---|---|
| Aggressive lever degrades quality | Wave 2 gate is a hard precondition; shadow-first; auto-rollback; `max_quality_mode` |
| Cross-tenant leakage (cache/training) | Hard tenant-scoping + isolation guards + property tests; no cross-tenant pooling, ever |
| Provider data retention on fine-tune | No-retention/enterprise terms asserted at startup; open-weight self-host path for sensitive tenants |
| Overclaimed savings | Attribution measures real net; savings-backed fee only on demonstrated savings |
| Eval/judge cost blowup | Judge-result caching; bounded concurrency; metered + budgeted |
| Scope creep / breadth-thin | Sequence strictly; M1–M3 are non-negotiable foundations before M4–M6 |

### Per-PR acceptance (CI gates, all must pass)

`lint` (zero warnings) · `test` (race + coverage threshold + invariants) · `security` (`govulncheck`, no HIGH/CRITICAL) · `build` (multi-stage Docker) · `contract` (no breaking API/proto). Plus: new migration is reversible; new background worker registers graceful shutdown; new outbound call has retry+breaker+timeout; new table is tenant-scoped (or justified); audit entries emitted for new decisions.

---

**Bottom line:** this plan keeps the strategy's core invariant in code — *cost is the residual after a proven quality, groundedness, and security floor* — and builds it the way `CLAUDE.md` demands: gated, measured, tenant-isolated, idempotent, observable, tested, and self-hostable.
