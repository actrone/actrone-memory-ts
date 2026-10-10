# Cost-Leadership & Quality Waves — Built Into Actrone

> **Status refreshed 2026-07-13 (code-verified):** the "Draft for review" header below is stale — see
> `cost-leadership-implementation-plan.md` for the authoritative, code-grounded status (that doc's own
> 2026-07-13 refresh note is the source of truth on what's live vs flag-gated). Headline correction that
> affects this strategy doc's framing: **every lever in Waves 1/3/4 defaults OFF** in a fresh deployment
> (`cost_opt.predictive_routing`, `cost_opt.distillation`, `cost_opt.cascade`, `semcache.enabled`,
> `governance.enable_eval_gate` are all `false` by default) — so "cost is the residual after quality
> holds" (§1) is the correct *design* invariant, but it is not yet the *default runtime behaviour*; an
> operator must opt in per lever. Also: the Wave-4 distillation flywheel's **serving/promotion step**
> (§7.1 step 6, "the `ab_router` fine-tuned-model hook is the promotion lever") is real code but
> `ab_router.RouteModel` — the function that would route live traffic to a promoted model — has zero
> callers anywhere in the codebase outside its own file, so no live traffic is ever actually routed to a
> fine-tuned model via this mechanism today, even with distillation enabled and a model promoted.
>
> **Status:** Draft for review · **Owner:** Matt · **Last updated:** 2026-06-03
> **Companion to:** [monetization-strategy.md](monetization-strategy.md) (§6 cost-savings mechanics, §14 roadmap summary).
> **Scope:** The technical roadmap that makes Actrone's agents *cheaper over time while proving quality, factuality, and security hold* — implementable on the current stack (no self-hosted GPUs).
> Provider prices and percentages below are **illustrative orders-of-magnitude** (they move constantly); the §6.1 attribution layer measures the real numbers so nothing is assumed.

---

## Table of contents

1. [The governing principle](#1-the-governing-principle)
2. [Why this is a moat (and gateways can't copy it)](#2-why-this-is-a-moat-and-gateways-cant-copy-it)
3. [What we have today](#3-what-we-have-today)
4. [Wave 1 — Parity foundation + the measurement spine](#4-wave-1--parity-foundation--the-measurement-spine)
5. [Wave 2 — The quality & groundedness gate](#5-wave-2--the-quality--groundedness-gate)
6. [Wave 3 — Control-plane-only optimizers](#6-wave-3--control-plane-only-optimizers)
7. [Wave 4 — The distillation flywheel](#7-wave-4--the-distillation-flywheel)
8. [Eval depth — beating LangSmith](#8-eval-depth--beating-langsmith)
9. [Memory depth — beating Mem0 / Zep](#9-memory-depth--beating-mem0--zep)
10. [Factuality & hallucination control](#10-factuality--hallucination-control)
11. [Cross-cutting security](#11-cross-cutting-security)
12. [Sequencing, scope & what's deliberately out](#12-sequencing-scope--whats-deliberately-out)

---

## 1. The governing principle

> **A closed-loop optimizer that captures cost only as the residual — after quality, groundedness, and security floors are provably met on governed traces.**

We never trade quality, factuality, or safety for cost. We maximize savings **subject to** customer-set floors, and we *measure* the result on every call so the claim is auditable. Cost is what's left over once the bar is met — never the goal that compromises the bar.

This is the difference between Actrone and a cost-optimization gateway: a gateway optimizes one API call at a time with no outcome signal; Actrone optimizes the whole agent lifecycle (memory, multi-agent coordination, durable execution, governance, traces) under a guarantee.

---

## 2. Why this is a moat (and gateways can't copy it)

LLM cost optimization is a crowded category at the **gateway layer** (Portkey, LiteLLM, OpenRouter, Cloudflare AI Gateway, Helicone, Martian, Not Diamond). Their individual levers — caching, routing, batch, budgets — are commoditizing.

Actrone's differentiation is **not** "we out-cache the gateways." It is: **cost optimization lives inside a governed, durable, memory-equipped agent runtime, gated by real outcomes.** Every optimization that needs state, execution control, governed outcomes, or a per-tenant data corpus is structurally impossible for a stateless gateway to replicate. That is Waves 2–4. Wave 1 is the cost of entry, not the moat.

---

## 3. What we have today

| Capability | What it does | Source |
|---|---|---|
| **Exact-match query cache** | Deterministic (temp ≤ 0.1) completions hashed and cached in Redis for 24h; cache hit skips the LLM call entirely | `internal/model/query_cache.go` |
| **Cost-optimized routing** | With `routing_strategy: cost`, simple tasks (complexity < 0.4, optional `BudgetPredictor` estimate) route to the cheapest capable model | `internal/model/router.go` (`routeCost`), `budget_predictor.go` |
| **Batch mode** | Tasks with `batch_mode=true` run via the OpenAI Batch API at ~50% lower cost | `internal/model/batch_provider.go`, `internal/service/batch_service.go` |
| **Memory budgeting** | Two-tier (Redis L1 + Qdrant L2) budget-aware retrieval, auto-summarise on overflow → fewer input tokens | Memory retrieval (4-phase) |
| **Tool-Call Supervisor** | 8-step validation: schema, permission, rate-limit, spend-cap, sanitisation/SSRF, execution, response validation, audit | `internal/tool/supervisor.go` |
| **Governance/audit engine** | Policy evaluation (sync for CRITICAL), tamper-evident audit ledger | `internal/governance/*` |
| **Fine-tuned-model routing hook** | Router can resolve a tenant fine-tuned model (the promotion lever for Wave 4) | `internal/governance/ab_router.go` |
| **Trace ledger + alerts** | Governed traces with outcome signals; the alert system (`spend.cap_reached`, `task.failed`, etc.) | trace ledger, `internal/notify/*` |

Honest read: these are **real but mostly table-stakes** as capabilities. The waves below turn this foundation into a measured, gated, compounding advantage.

---

## 4. Wave 1 — Parity foundation + the measurement spine

**Goal:** reach feature parity with gateways on zero-risk savings, and lay the telemetry spine that makes every later wave provable.

**Build on:** Qdrant embeddings, Redis cache, the router + `BudgetPredictor`, the batch provider, the trace ledger, the alerts system.

**Add:**
- **Semantic cache** — cache by embedding similarity (tunable threshold), **governance-scoped cacheability** (never cache PII / policy-blocked outputs), memory-aware invalidation (expire when underlying memory changes, not just TTL).
- **Provider-native prompt-caching pass-through** — Anthropic / OpenAI / Bedrock prompt caching, plus **cache-aware prompt construction** (stable system + context first, volatile last) to lift hit rates.
- **Prompt/context compression** — conservative, retrieval-aware (compress using relevance scores), eval-gated so nothing the answer needs is dropped.
- **Durable batch arbitrage** — auto-defer latency-tolerant tasks into the 50%-off batch window (we own the durable scheduler).
- **Savings + quality attribution pipeline (§6.1 of the strategy doc)** — per call, compute baseline-vs-actual cost *and* a quality delta; emit a structured, idempotent `savings_events` record; aggregate into the Cost Monitor headline.

| Guarantee | How Wave 1 advances it |
|---|---|
| **Efficiency** | Semantic + prompt caching, compression, batch arbitrage — biggest $/effort wins |
| **Quality** | Levers are quality-neutral by construction (same model/output, or only latency changes); the spine measures any delta |
| **Hallucination** | Neutral; semantic-cache hits optionally verified before serving |
| **Security** | Caches tenant/namespace-scoped; PII never cached/shared; residency respected |

**Honest positioning:** the *capabilities* here are standard. The control-plane edge is in *execution* — governance-scoped caching, verified hits, cache-aware prompt shaping, retrieval-aware compression. Do not lead the pitch with Wave 1.

---

## 5. Wave 2 — The quality & groundedness gate

**Goal:** the always-on guarantee that nothing degrades quality or factuality. **Prerequisite for Waves 3–4.**

**Build on:** governed traces, the governance/audit engine, multi-agent coordination, the circuit-breaker + alert patterns.

**Add:**
- **Continuous eval harness** — golden/reference sets per agent, LLM-as-judge scoring, **faithfulness/groundedness** metrics, **shadow testing** (run a candidate path in parallel, never serve until it earns trust).
- **Per-agent floors** — quality, groundedness, and cost floors the optimizer must operate *under*. The customer sets the quality/factuality SLA per agent.
- **Groundedness verifier + abstain-over-fabricate** governance default — prefer "I don't know / need more info" over an ungrounded answer.
- **Quality/hallucination circuit breaker** — same pattern as the provider circuit breakers, tripping on a *quality* regression: auto-revert to the safe model and fire an alert.

| Guarantee | How Wave 2 advances it |
|---|---|
| **Quality** | This *is* the quality guarantee — floors + shadow eval + auto-rollback |
| **Efficiency** | Enables aggressive Wave 3–4 savings to fire safely |
| **Hallucination** | Groundedness verification + abstention + a measured per-agent rate with auto-rollback |
| **Security** | Evals run on governed data inside the tenant boundary; retrieved/cached content injection-scanned by the existing sanitiser |

**Moat:** an outcome-driven quality+factuality gate fed by *governed* results — gateways have call logs, not governed outcomes to gate on.

---

## 6. Wave 3 — Control-plane-only optimizers

**Goal:** the deep cost wins impossible for a gateway — each running under the Wave 2 floors.

**Build on:** Temporal durable workflows, router strategies, the MACP multi-agent graph, two-tier memory, the Tool-Call Supervisor.

**Add:**
- **Model cascades (verify-then-escalate)** — cheap model first; the **grounded verifier** accepts its answer only if it passes the quality+groundedness check, else escalates to the frontier model. Typical 50–80% cuts on extraction/classification workloads.
- **Trace-driven predictive routing** — route to the cheapest model that *historically* met this agent's floors (learned from governed outcomes, not assumptions).
- **Multi-agent budget allocation** — role-based model assignment (planner → frontier, workers → cheap), dedupe redundant sub-agent calls, batch parallel sub-agents, add a **critic/verifier agent**.
- **Memory-as-cache / context dedup** — stop re-sending context the model already has across turns and across agents in a workflow.

| Guarantee | How Wave 3 advances it |
|---|---|
| **Efficiency** | The largest cost wins — workflow-level, not per-call |
| **Quality / Hallucination** | Every route gated by Wave 2; cascades + critic agent actively *reduce* hallucination |
| **Security** | Routing respects allowed-provider/residency policy; every tool call still passes the Supervisor; each decision audit-logged |

**Moat:** workflow-level, outcome-driven optimization a stateless gateway cannot replicate.

---

## 7. Wave 4 — The distillation flywheel

**Goal:** agents that get *cheaper and more specialized the more they're used* — without losing quality or factuality. The compounding moat.

### 7.1 Mechanism (step by step)

1. **Capture.** The trace ledger already stores `{input, retrieved context, frontier output, quality + groundedness scores, governance verdict, tool calls}`. Filter to **accepted** outputs (passed governance + the quality floor) → a clean, pre-labeled training set.
2. **Eligibility scoring.** Score candidate agents from trace stats: high volume, tight input-embedding clusters (narrow task), stable prompts, structured outputs, meaningful frontier spend. Narrow + repetitive + high-volume = distill; broad open-domain reasoning = leave on frontier.
3. **Dataset assembly.** Build a **tenant-scoped, task-scoped** supervised dataset (input → accepted output), PII-scrubbed per governance, deduped, with a held-out eval split. Needs a floor of examples (hundreds–thousands).
4. **Distill (no GPUs of ours).** Fine-tune a small student — `gpt-4o-mini` via OpenAI fine-tuning, or an open small model (Llama-3.x-8B / Qwen / Mistral-small) on a **serverless** provider (Together / Fireworks / Bedrock).
5. **The gate (Wave 2).** The student must pass the eval harness on the held-out set — quality vs the frontier teacher, faithfulness/groundedness, task-specific metrics — and clear the agent's floors. No pass, no promotion.
6. **Shadow → promote.** Run the student in shadow next to frontier on live traffic; if scores hold, promote it to serve a fraction, then the eligible bulk. The `ab_router` fine-tuned-model hook is the promotion lever.
7. **Serve with a cascade fallback.** Route in-distribution, high-confidence tasks to the cheap student; OOD / low-confidence / failed-groundedness inputs escalate to frontier. Student handles the easy 60–80%; frontier handles the hard tail.
8. **Monitor + auto-rollback + re-distill.** Continuous quality/groundedness/hallucination monitoring (Wave 2 circuit breaker); on drift, auto-revert to frontier and re-distill. The flywheel keeps turning as the workload evolves.

### 7.2 Why it compounds

```
more usage → more accepted traces → better/cheaper student → more traffic served cheap
   → bigger measured savings → more reason to run everything on Actrone → more traces ↺
```

It is **per-tenant and proprietary** — trained on *their* workload, behind *their* governance boundary, embodying *their* cost curve. A stateless gateway has no governed outcome stream to distill.

### 7.3 Our costs to operate it

The expensive parts (training + serving) are outsourced to provider fine-tuning + serverless inference, billed per-use. Our marginal cost per tenant is small and amortized.

| Our cost component | Rough magnitude (illustrative) | Notes |
|---|---|---|
| Trace storage for training pairs | cents–$ / tenant / mo | Already stored for observability |
| Eligibility analysis | cents–$ / tenant / mo | Cheap batch jobs |
| **Fine-tune job** (main variable) | **~$1–$50 / job** | Amortized over thousands of inferences it then serves |
| Eval cycle (LLM-as-judge) | ~$1–$10 / candidate | Frontier judge calls |
| Re-distillation (periodic) | = fine-tune cost × cadence | Cadence tied to measured drift |
| Serving the student | **$0 fixed** | Per-token, pay-per-use; passed through to customer usage |

≈ tens to low-hundreds of dollars/month per tenant, **no idle GPU cost.**

### 7.4 The customer's savings — worked example (illustrative)

- Frontier (GPT-4o / Claude Opus class): ~$2.5–$15 / M tokens. Distilled small model: ~$0.10–$0.60 / M tokens → **~80–95% cheaper per token** on eligible tasks.
- Tenant frontier spend **$5,000/mo**; ~60% of volume distills cleanly (~$3,000/mo of that spend).
- Distilled serving for that slice ≈ **$300/mo** → **customer saves ≈ $2,700/mo** at held quality.
- **Our cost to run their flywheel:** ~$80–$200/mo.

### 7.5 Our margin / monetization

Tie to the **savings-backed routing dividend** (strategy §6): charge a share of *demonstrated net savings*, never a levy on spend.

- Charge ~15–25% of the $2,700 saving → **~$400–$675/mo**; our cost ~$80–$200/mo → **~70–85%+ gross margin**, customer still nets ~$2,100/mo ahead. The §6.1 attribution layer puts exact saved-dollars on the invoice, auditable against the customer's own token logs.

### 7.6 Ownership, portability & isolation

**Default stance: the customer owns their data *and* their distilled model; Actrone holds an operating license; strict tenant isolation; never cross-tenant training.** What "own" means depends on substrate:

| Substrate | Weights downloadable? | What "ownership" is |
|---|---|---|
| **Closed-provider fine-tune** (OpenAI / Anthropic / Bedrock-hosted) | **No** | Exclusive *use* of a hosted derivative + ownership of the **training data** (can reproduce elsewhere). Not portable off the provider. |
| **Open-weight fine-tune** (Llama / Qwen / Mistral on serverless or self-host) | **Yes** | **Real, portable ownership** — a downloadable artifact, subject to the base model's license |

Delivered via three layers: **(1) contractual** (customer derivative; tenant-only use; no-retention/enterprise provider terms; deletion on termination); **(2) technical portability** (open-weight → hand over weights + dataset; closed → hand over the dataset to reproduce); **(3) self-host/BYOC** (pipeline runs in the customer's VPC; model never leaves).

**Tiering:** offer the **open-weight, exportable, fully-portable** path as a **Business/Enterprise** feature ("you own and can export your model"); the closed-provider (access-only) path is the convenient default for lower tiers.

**Lock-in ↔ portability:** portability is a *feature, not a hostage situation*. The moat is the compounding cost curve + the always-on pipeline (re-distillation, eval-gating, shadow testing, auto-rollback), **not** holding their weights. That is the trustworthy and stickier position — and the right one for enterprise sales.

> **Legal note:** IP ownership of AI-model derivatives is legally unsettled. The contractual language must be reviewed by counsel; this section describes the product/architecture stance, not legal advice.

### 7.7 Honest caveats (where it doesn't pay)

- **Volume threshold** — below enough accepted traces + ongoing spend the fine-tune doesn't amortize; the eligibility gate skips these. New tenants run 100% frontier until enough data accrues (cold start).
- **Some workloads never distill** (high-variance creative, broad reasoning) — they stay on frontier by design.
- **Fine-tune-serving premiums** can erode savings on some providers — so we **measure real net savings** and charge the dividend only on what's demonstrated.
- **Drift** — managed by continuous eval + a re-distill cadence tuned to measured drift.

---

## 8. Eval depth — beating LangSmith

*Expands Wave 2. Current state: mostly governed traces + governance verdicts — a real evaluation harness is greenfield, which lets us build it actionable-first.*

**The reframe:** we will not win a feature-depth race against a dedicated eval/observability tool (LangSmith, Langfuse, Braintrust, Arize). The play is **reach credible parity, then leap with what a point tool *structurally cannot* do** because it sits *outside* the execution path. Groundbreaking = the leap, not the catch-up.

### 8.1 Parity gaps to close (be credible)
- Datasets & golden-set management; **experiments / regression testing** (compare prompts, models, versions side by side).
- **Evaluator library:** LLM-as-judge (tunable), heuristic/code scorers, pairwise comparison, task-specific metrics.
- **Online (production-sampled) + offline (dataset)** eval modes.
- Prompt versioning + a playground.
- **Trajectory-level eval** — score the whole agent run, not just the final answer.

### 8.2 The groundbreaking layer (only a control plane can do this)
1. **Closed-loop, *actionable* evals.** LangSmith *shows* a score; ours *pulls the lever* — an eval result automatically gates routing, blocks a distilled-model promotion (Wave 4), or trips the circuit breaker. Eval becomes a control signal, not a dashboard.
2. **100%-of-production online eval, not sampled.** Every call already flows through us with the governed outcome → evaluate continuously on *all* traffic, where standalone tools eval a sampled subset after the fact.
3. **Reference-free groundedness against the *actual* context the runtime used.** We hold the exact retrieved memory + tool outputs that produced the answer, so faithfulness is checked against them — a logging tool only has what you remembered to send it.
4. **Joint cost × quality × faithfulness frontier.** Because we own routing + cost + eval, we can show *"this config is 40% cheaper **and** held quality"* — a unified surface no eval tool has (they don't see cost or routing).
5. **Auto-generated, self-improving eval sets** built from *accepted governed traces* — golden sets that grow and refresh from real production, no manual curation.
6. **Eval-as-governance** — eval thresholds become *policy* (block a deploy if faithfulness < floor) with a signed, tamper-evident record. Compliance-grade evaluation, not just analytics.

**Moat:** LangSmith can't gate your router — it isn't in the path. Actionable, governed, production-wide, cost-joined eval is a structural property of owning execution + governance + traces together.

---

## 9. Memory depth — beating Mem0 / Zep

*Spans Waves 1 & 3 plus new work. Current state: two-tier (Redis L1 + Qdrant L2), budget-aware 4-phase retrieval, auto-summarise on overflow, governed + tenant-scoped — fast and solid, but it stores/retrieves **turns**; it lacks the extraction, consolidation, and graph depth Mem0/Zep have.*

Same reframe: close the depth gap to credible, then leap with governed, verifiable, self-improving memory a point tool can't be.

### 9.1 Parity gaps to close (the depth Mem0/Zep have)
- **Fact / preference extraction** — distill turns into structured memories (facts, preferences, entities), not just raw conversation.
- **Consolidation & conflict resolution** — merge duplicates, supersede stale facts (Zep-style temporal handling).
- **A knowledge-graph tier** — entities + relationships for structured recall, on top of the vector tier.
- **Scopes & decay** — user / agent / session / org scoping, relevance + recency weighting.
- **Explicit memory ops** — add / search / update / delete with semantic dedup.

### 9.2 The groundbreaking layer (control-plane-native)
1. **Governed memory.** Every write/read passes the policy engine: PII-aware redaction, residency-scoped storage, access audit-logged, **native right-to-erasure (GDPR)**. For regulated buyers this alone is a category difference — Mem0 has no governance built in.
2. **Memory with provenance — "cited memory."** Every memory traces to the source turn/tool that created it (audit ledger), so a recalled fact is **verifiable against its provenance before use** — directly reducing hallucination from stale/wrong memory. No specialist grounds recall in an audit trail.
3. **Eval-gated memory hygiene.** Consolidation/invalidation tied to the eval layer (§8): a stored "fact" that fails verification is flagged or expired automatically. Memory quality becomes measured and self-correcting.
4. **Governed cross-agent shared memory.** In multi-agent workflows agents share memory *safely under policy* — possible only because we own multi-agent coordination + governance together.
5. **Cost-joined retrieval.** Push budget-aware retrieval to *relevance-minimal, eval-verified* context — retrieve only what changes the answer, proven not to hurt quality. Memory and the cost optimizer act as one.
6. **A memory flywheel** (parallel to the model flywheel, Wave 4): measure retrieval quality per agent via eval → tune what's stored/recalled → memory gets better the more the agent runs. Self-improving, per-tenant, proprietary.
7. **Customer-owned, portable, sovereign memory** — same ownership stance as the distilled model (§7.6): a governed asset the customer owns, can export, and can self-host in their VPC.

**Moat:** Mem0 can't enforce your governance, cite its recall against an audit ledger, or share memory across agents under policy — those are structural limits of being a point tool, not a control plane.

### 9.3 The two flywheels

Wave 4's **model** flywheel and the **memory** flywheel compound together: more usage → better per-tenant model *and* better per-tenant memory → cheaper, more accurate, more grounded agents → more usage. Both are proprietary to the tenant and structurally un-copyable by a stateless tool.

---

## 10. Factuality & hallucination control

No LLM system can *remove* hallucinations — they are inherent. Actrone's stance: **bound and measurably reduce them to a customer-set tolerance**, using the same machinery that gates the cost waves.

| Mechanism | Effect | Notes |
|---|---|---|
| Memory / grounding (retrieval) | **Reduces** | The core RAG anti-hallucination lever |
| Model-cascade verifier | **Reduces** | Verifier checks groundedness, not just quality — rejects/escalates unsupported answers |
| Tool-Call Supervisor + schema validation | **Reduces** | Fabricated/invalid tool outputs are caught |
| Governance output policies | **Reduces** | Enforce citations / no-unverified-claims / abstention |
| Eval harness (faithfulness metrics) | **Detects** | Catches groundedness regressions before they ship |
| Semantic cache | **Slight risk** | Mitigated by high thresholds + optional verify |
| Cheap-model routing / compression / distillation | **Risk if ungated** | Gated by the groundedness floor; OOD/low-confidence escalates |

**Add to lead on this:** groundedness verification, citation/attribution enforcement, faithfulness evals, **abstain-over-fabricate** default, self-consistency for high-stakes agents (sample N, escalate on disagreement — reserved for agents whose floor demands it), a critic agent in multi-agent flows, and **hallucination-rate-as-a-gated-metric** (measured per agent, trips the circuit breaker, fires an alert).

**Tension, stated honestly:** cost and factuality sometimes pull opposite ways (self-consistency reduces hallucination but costs more; cascades save money but need a grounded verifier). Resolution: hallucination rate is part of the per-agent quality floor; the optimizer maximizes savings **subject to** it, never by trading factuality for cost. A one-switch "max quality, ignore cost" mode exists for agents where a single wrong answer is unacceptable.

---

## 11. Cross-cutting security

True across all waves:

- Tenant/namespace-scoped caches with **policy-aware cacheability**; PII never cached, shared, or trained on cross-tenant.
- **Strict tenant isolation** for distillation — training data never pooled across tenants (a hard rule; cross-tenant training is a data/IP leak).
- Every optimized route still traverses the **Tool-Call Supervisor** (schema, permission, SSRF, sanitisation).
- **Injection-scanning** on retrieved / cached / distillation content (the existing sanitiser).
- Secrets in the vault; **every routing / cache / eval / distill / promote decision** written to the tamper-evident audit ledger.
- Provider fine-tuning under **no-retention / enterprise terms**; open-weight self-host path for the most sensitive tenants.
- Fully **self-hostable in the customer's VPC** — data never leaves.

---

## 12. Sequencing, scope & what's deliberately out

**Sequence:** Wave 1 (parity + spine) → Wave 2 (the gate; prerequisite) → Wave 3 (control-plane optimizers, gated) → Wave 4 (the flywheel, gated).

| Wave | Horizon | Primary payoff |
|---|---|---|
| 1 — Parity + spine | Weeks | Immediate zero-risk savings; the measurement spine |
| 2 — Quality/groundedness gate | ~1 quarter | The guarantee everything else runs under |
| 3 — Control-plane optimizers | 1–2 quarters | The "no gateway can do this" cost wins |
| 4 — Distillation flywheel | The bet | Compounding, structurally un-copyable moat |

**Deliberately out (to stay realistic now):** KV-cache reuse and speculative decoding — they only apply if we run our own inference, which we don't. Excluded until/unless that changes.

**The one-line claim this earns:**

> *Actrone is the only platform where agents get cheaper over time **because** quality, factuality, and security are guaranteed first — every dollar saved is the residual after a proven quality, groundedness, and security floor, measured on your own governed traces.*
