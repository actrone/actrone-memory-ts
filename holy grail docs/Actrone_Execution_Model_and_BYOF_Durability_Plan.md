# Actrone Execution Model & BYOF Durability Plan

**Version 1.0 — June 2026 · ✅ LARGELY SHIPPED as Master-Plan P6-D (native durable governed loop + BYOF-hosted harness P1 encapsulated + P2 stepwise). Pending: harness P3 (more stepwise drivers + TS harness) + per-tenant pool cluster-rollout. This doc captures the original analysis; authoritative status: [Platform Evolution §0a](./Actrone_Platform_Evolution_Master_Plan.md#0a-implementation-status-verified-2026-06-24).**
>
> **Status refreshed 2026-07-13 (code-verified):** harness P3 is now **BUILT**, not pending — the "more
> stepwise drivers" scope shipped as 13 Python framework drivers + a full TS stepwise core
> (`actrone-ts/src/harness/stepwise.ts`, previously absent) with 6 TS framework shims. See
> `Actrone_Stepwise_Framework_Expansion_Plan.md`'s refresh note for the driver list and the
> enum-parity fix. Per-tenant pool cluster-rollout (an infra concern, not orchestrator code) was not
> re-verified this pass.

> Reframes the native-vs-BYOF boundary into **three execution tiers** and defines the
> **BYOF-hosted durable runtime** — the flagship paid differentiator that lets *any*
> framework's agent run in production with Actrone's full governed, durable, supervised,
> cached, remembered stack. Extends [SDKs & Adapters](./Actrone_SDKs_and_Adapters_Plan.md),
> [Agent Modes & Onboarding](./Actrone_Agent_Modes_and_Onboarding_Plan.md), [Master Plan](./Actrone_Master_Implementation_Plan.md).

---

## 0. The governing principle

**Actrone can only govern, supervise, cache, and durabilise what it is *in the execution path for*.**

That one rule determines everything below. The boundary that matters is **where the agent's
reasoning loop runs**, not whether the agent was written with a framework. "Native vs BYOF" was
the wrong axis; **execution locus** is the right one.

---

## 1. The three execution tiers

| | **BYOF-connected** | **BYOF-hosted** | **Native** |
|---|---|---|---|
| **What it is** | The framework loop runs in **your** process; you call Actrone for services (gateway, memory). | You **deploy** your framework agent to Actrone; the **kernel runs its loop** as a durable Temporal workflow. | The agent is an Actrone **manifest** (Agent Studio / SDK); the kernel runs it. No framework. |
| Memory (Redis L1 + Qdrant L2) | ✅ memory API / adapters | ✅ | ✅ |
| Gateway: MAL + routing/BYOK + audit | ✅ | ✅ | ✅ |
| **DPE on inference** | ✅ | ✅ | ✅ |
| **Semantic/query cache on inference** | ◐ gateway consults it (2026-07-01); production Qdrant store pending (T2.1) | ◐ | ◐ |
| **Tool-Call Supervisor (D3)** | ✅ *(D3: route framework tools through Actrone)* | ✅ | ✅ |
| **Temporal durability of the loop** (retries, signals, resume, workflow idempotency) | ❌ *(physics — Actrone doesn't run your loop)* | ✅ | ✅ |
| Friction | lowest (one base-URL + key) | medium (deploy a worker) | highest-value, no framework needed |
| Commercial role | **free/low-tier on-ramp** | **the paid moat** | platform-native |

**The headline:** the only thing **connected** structurally cannot have is *durability of a loop
Actrone never executes* — and the answer to that is **hosted**, not a smarter SDK. Everything
else (cache, DPE, MAL, routing, audit, memory, tool supervision) is buildable for connected.

**Three clarifications (so the table isn't misread):**

- **Connected access = SDK *or* raw REST.** A connected agent reaches Actrone either through the
  typed **SDK** (Go/Python/TS — client + framework adapters for D1 memory / D2 inference / D3 tools)
  **or** through plain **REST**: the gateway is **OpenAI-compatible** (`/v1/gateway/chat/completions`),
  so any OpenAI client or raw HTTP call works by pointing a base-URL + key at it, and the platform
  REST API (`/v1/…`) covers memory/tools/tasks. The SDK is ergonomic sugar over the same REST surface —
  it is **not** required. (The thinnest connected user just sets a base-URL — the "framework-ecosystem
  user".)
- **Hosted is not framework-only.** "Deploy your *framework* agent" also covers an agent authored on
  the **Actrone SDK itself** (`framework: actrone_sdk`) — it hosts via the identical harness pod (the
  entrypoint uses `ctx.client`). "Hosted" = *any code* run on Actrone; the only never-podded style is
  the declarative manifest (Native).
- **`build_mode: byof_connected` is a metadata/policy marker, not a kernel execution path.** A
  connected agent's loop runs in the developer's process and is driven by the SDK/REST directly; a
  registered `byof_connected` AgentFile is a **governance-policy record** the gateway looks up by
  `agent_id` (tools/memory/limits/governance), **not** something the kernel runs. The task API now
  **rejects** a submission for a connected agent (422 — "its loop runs in your process; use the
  gateway/SDK, not the task API") instead of silently routing it to the native workflow
  (`internal/handler/http/tasks.go`, wiring the `IsConnected()` predicate). Done 2026-06-19.

**Compute & billing follow this exactly:** hosted *code* (framework or `actrone_sdk`) runs in a
per-tenant pod → **worker-compute GB-second meter**; connected and native-manifest run no pod → **no
compute meter** (billed on inference/memory/tools/routing). See §4 and
[monetization §15.8](./monetization-strategy.md); pod provisioning in
[Infra §4](./Actrone_Infrastructure_and_Environments_Plan.md).

---

## 2. BYOF-hosted durable runtime — the flagship differentiator

> *"Keep your framework. Run it in production with governance, durability, supervision,
> caching, and memory — without rebuilding it on a new SDK."* No competitor offers this.

### 2.1 How it works
The developer's framework agent (CrewAI/LangGraph/AutoGen/OpenAI-Agents/…) is **deployed to
Actrone as a worker** and its loop is executed **inside a Temporal workflow**, so the kernel
wraps every step:

```
Temporal workflow (durable, retryable, signalable)
  └─ runs the framework agent loop, where each step is a durable activity:
       • model call      → through the gateway (MAL · DPE · cache · routing · audit)
       • tool call       → through the Tool-Call Supervisor (allowlist · injection · caps · MAL)
       • memory r/w      → Redis L1 + Qdrant L2
     + workflow-level: retries w/ backoff, crash-resume from last checkpoint,
       human-in-the-loop signals (DPE Tier-3 approvals), idempotency, spend caps.
```

The framework still "owns" the agent *logic*; Actrone owns the *execution* — so a crash mid-run
resumes, a tool call is governed, an inference is cached, and the whole run is an auditable,
durable workflow.

### 2.2 What to build (the runtime)
- **A worker harness** per language (Python first — most frameworks are Python; then TS): a thin
  runtime that hosts the framework agent and exposes its steps to Temporal as activities. Reuse
  the existing orchestrator activity model (`internal/workflow`, `internal/service`).
- **A deploy path**: package the framework agent (container image / code bundle) + an Actrone
  manifest (`build_mode: byof_hosted`) → the orchestrator schedules it on the worker pool.
  Ties to the deployment UX (versions/rollback/canary — P5-B) and Agent Studio's BYOF mode.
- **Step interception**: the harness routes the framework's model client at the gateway (already
  the D2 adapters) and its tool execution through the Supervisor (D3), but now *inside* a Temporal
  activity so each step is durable.
- **Checkpointing**: framework state persists between steps (the LangGraph checkpointer pattern,
  generalised) so resume-after-crash works.
- **Isolation/limits**: per-tenant worker pools, concurrency caps (reuse `internal/floors`),
  network egress allowlist — same hyperscale posture as the browser/connector framework.

### 2.3 Honest boundary
- **Connected** can never durabilise the dev's in-process loop (physics). It *can* get everything
  else (§3).
- **Hosted** requires the dev to deploy their agent to Actrone (a real, but reasonable, ask for a
  production durability guarantee — it's the trade for "we run it safely").
- This is a **substantial build** (worker harness + deploy + Temporal step-wrapping per language)
  — sequence it as the headline P5/P6-era differentiator, after the connected path is complete.

---

## 3. Completing the connected path (buildable now — closes the gaps)

Make **BYOF-connected** get the whole *inference + supervision* stack so the free on-ramp is
already differentiated:

### 3.1 Gateway gap-closure (do now — small, high-leverage)
Today the gateway routes through the **raw** model router + MAL + audit, but **not** the
**semantic/query cache** or **DPE**. Wire both into the gateway path (mirroring the native task
path):
- **Cache:** back the gateway's managed route with the `QueryCache` (the native path already does),
  so deterministic BYOF inference gets cache hits → the cost-saving differentiator reaches BYOF.
  *(Caching on the per-tenant BYOK provider path is a follow-up — the cache currently wraps the
  managed router.)*
- **DPE:** evaluate the request through the DPE engine before the provider call (Tier-1 capability
  hard-block + Tier-2 threshold rules), so policy governs BYOF inference, not just native tasks.

### 3.2 D3 tool supervision for connected (next)
Route each framework's **tool-execution hook** through the **Tool-Call Supervisor** + the
governed connector/MCP layer, so a connected BYOF agent's tool calls get allowlist, injection
scan, capability hard-block, MAL on args/results, DPE, and spend caps. Per-framework binds
(attach points already documented in each adapter). This gives connected BYOF tool governance
*without* hosting — the tools route through Actrone even though the loop doesn't.

---

## 4. Monetization tie-in (a value + COGS ladder — NOT "connected free vs hosted paid")

**Connected is a paid product, not a free tier.** Every connected call runs real, metered work on
Actrone infra — MAL tokenisation, DPE evaluation, routing, audit writes, the semantic cache (Redis),
Qdrant/Redis memory, plus the model spend — i.e. the *same governed usage* the native path bills.
Giving it away wholesale would be unbounded loss and would price the core product (governance +
cost-routing + memory + audit) at zero. The only "free" is the existing platform **hard-capped Free
trial** (small call volume, capped memory, 1 env — the PLG firewall, [monetization §3](./monetization-strategy.md)).

The ladder (each rung = more value **and** more COGS):

| Rung | What it meters | Tier |
|---|---|---|
| **Free trial** | hard-capped gateway calls + memory (firewall) | Free |
| **Connected** | governed gateway inference (governed-task / call meter) + retained memory (GB-mo) + **routing dividend** (managed) or **BYOK governance fee** | Pro / Scale |
| **Connected + D3 tools** | the above + governed tool-call executions | Pro / Scale |
| **Hosted durable** | all the above **+ a durable-execution premium** — Actrone now *runs your loop* (Temporal worker compute + orchestration + full supervision): a higher per-governed-run price or a durability multiplier | Scale / Enterprise |
| **Native** | governed task-runs end-to-end | all paid tiers |

- **Connected ≠ free; it's the lowest-*friction* paid entry** (point a base URL, no deploy) — the PLG
  *conversion* path, billed on the standard meters above the trial cap.
- **Hosted durable = the expansion/Enterprise driver** and the structural moat: production durability +
  full supervision for *your existing framework*, with no alternative anywhere. Add a **"hosted durable
  execution"** line to [monetization §15](./monetization-strategy.md) (a premium on the governed-run,
  reflecting the extra Temporal/worker COGS) and gate it Scale+.
- The pitch: *"Start connected (lowest friction, pay only for what you route through us); when it has to
  run in production — durable, governed, auditable — deploy it to Actrone and keep your framework."*

---

## 5. Sequencing (mapped to the [Master Plan](./Actrone_Master_Implementation_Plan.md) phases)

1. **Gateway gap-closure (cache + DPE)** — §3.1.
   - **DPE Tier-2: ✅ DONE (June 2026)** — the gateway runs DPE before the provider call (build/vet/test green).
   - **Semantic cache: ◐ wiring DONE 2026-07-01, production store PENDING (T2.1).** Correction — this line
     previously (and wrongly) claimed the cache was DONE; a 2026-07-01 audit found the gateway never consulted
     `semcache`. Now fixed: the gateway consults an optional `ResponseCache` after governance and before the
     model on both `Complete` and `Stream` (agent-isolated key from the original prompt; tool-call requests
     bypassed; final detokenised answer stored on miss; `SourceCacheHit` savings recorded; fails open). Tests
     cover hit/miss/bypass on both paths. **Still pending (T2.1):** the production `VectorStore` (Qdrant) +
     `Embedder` adapters and constructing the `SemanticCache` in `main.go` behind a flag — until then the
     gateway's `Cache` is nil (disabled), so behaviour is unchanged by default.
2. **D3 tool supervision binds** — §3.2. **= Master Plan P4-E** (completes the adapter program, right after
   P4-D). Cheap — reuses the existing Supervisor + DPE + connector layer; connected BYOF gets tool governance.
3. **BYOF-hosted durable runtime** — §2, the flagship. **= Master Plan P6-D**, a phase-scale workstream
   **spanning P5-B → P6**: it needs **P5-B** (the deploy/version path) and **P6-A/C** (worker pools +
   hyperscale), then adds the worker harness (Python → TS) + Temporal step-wrapping. *Do not force it early —
   building it before P5-B/P6 means building those prerequisites first anyway.*
4. Reflect the tiers in **Agent Modes** (`byof_connected` vs `byof_hosted`) + BYOF onboarding, and add the
   **hosted-durable** + **connected** revenue lines to **[monetization §15](./monetization-strategy.md)** (the
   value+COGS ladder in §4 — connected is metered, not free).

---

## 6. The one-paragraph answer to "does BYOF get Actrone power?"

**Connected BYOF gets the full inference + memory + governance + (with D3) tool-supervision
stack** — MAL, DPE, semantic cache, routing/BYOK, audit, and Redis L1 + Qdrant L2 memory — because
those are server-side and reached through the gateway + memory API. The **only** thing it cannot
have is Temporal-grade durability of a loop running in the developer's own process — and that is
delivered by **BYOF-hosted**, where the framework agent is deployed to Actrone and run as a durable
workflow. So: *yes, BYOF gets Actrone power — fully, when hosted; and nearly fully when connected,
with durability the deliberate upgrade that drives the subscription.*

---

*Last updated: 2026-06-14 · Planning. Corrects the earlier "native vs BYOF" binary into connected/hosted/native by execution locus.*
