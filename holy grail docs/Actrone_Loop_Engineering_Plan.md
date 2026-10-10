# Actrone — Governed Loop Engineering Plan

> **Goal:** make Actrone's agent execution loop the **frontier** of 2026-era *loop engineering* —
> and beyond it — by owning the one axis no lab or framework owns: a loop that is not just
> capable and cheap, but **provenance-tracked, policy-bounded, cost-optimal, audited, and
> reversible at every iteration.** This doc grounds that in the code we already ship, does an
> honest gap analysis against the 2026 frontier, defines a small set of *governed loop primitives*,
> and lays out a measured, phased plan.
>
> Status: PLAN (superseded by the 2026-07-13 refresh below — LE0–LE10 built). Owner: Matt. Created:
> 2026-07-05. Inherits `CLAUDE.md`. Companion to `progress.md` (code) and
> `infra/docs/Actrone_Deployment_Runbook.md` (deploy).
>
> **Status refreshed 2026-07-13 (code-verified):** §4's ten workstreams are no longer a backlog —
> **LE0 through LE10 are ALL BUILT + WIRED into the live Temporal loop**, verified via the real
> `ExecuteActivity` call chain in `internal/workflow/task_workflow.go` (not test-only code). Two
> load-bearing corrections to claims that circulated as "known residuals" in prior audits — **both
> are now fixed, and the fix is self-documented in the code:**
> - **LE6 (per-turn model tier) is enacted, not just computed.** `planLoopTurn`
>   (`internal/workflow/loop_integration.go:94-112`) computes `plan.ModelTier`; `task_workflow.go:672-675`
>   (mid-loop) and `:774-777` (wrap-up) now **apply** it to `in.Model`/`wrapIn.Model` (clearing
>   `BaselineModel` so it isn't misattributed as an unrelated cost-route saving), gated only by a
>   Temporal `GetVersion` replay-determinism guard (`applyLoopModelTier`), not a feature flag.
> - **LE3/LE4 (scratchpad + JIT context loop tools) are wired unconditionally**, independent of
>   `cfg.EMAOP.Enabled`. `main.go:857-882` constructs `looptool.NewRouter` outside the EMAOP block,
>   with an explicit comment: *"these operate on the agent's OWN memory/notes/docs... so they do NOT
>   depend on the EMAOP MAL/DPE stack and are wired UNCONDITIONALLY... they were previously gated
>   behind cfg.EMAOP.Enabled and thus unreachable in that mode."* — the gap this doc might imply is
>   closed, and the closure is documented in-repo.
>
> Per-item status (all BUILT+WIRED, with real caller chains, not test-only):
> LE0 telemetry (`task_workflow.go:694-696` → `service/loop_metrics.go`) · LE1 Context Ledger
> (`service/context_ledger.go`, inside the live `RetrieveContext` activity) · LE2 Governed Compactor
> (`service/governed_compactor.go`, invoked from `RetrieveContext` on compaction triggers) · LE3/LE4
> scratchpad/JIT tools (`internal/looptool`: `memory.search`/`doc.fetch`/`ledger.get`/`notes.*`/`todo.*`,
> plus an Axis-C `memory.block.*` editor, attached to the Tool-Call Supervisor via
> `toolSupervisor.WithLoopToolRouter`) · LE5 Sub-Agent Quarantine (wired at the **`governedsystem`**
> runtime level — `governedsystem/quarantine.go`'s `quarantineUpstream`/`distillOutput`, called from
> `governedsystem/runtime.go`; note `service/subagent_quarantine.go` holds an orphaned duplicate of the
> pure primitives, kept only to avoid an import cycle — documented dead code, not a functional gap) ·
> LE6 model tier (above) · LE7 semantic tool-result pruning (`service/tool_result_pruner.go`, called
> from `context_manager.go:338`) · LE8 tool-space selection (`service/tool_selector.go`, applied at
> `activity_service.go:1216-1234`, gated on the agent's own `Spec.Loop.EffectiveToolAdvertise()` — an
> **author-opt-in Loop Policy setting**, default "all" = unchanged behaviour, not a platform kill-switch)
> · LE9 cost-capped reflection (`runReflection`, `loop_integration.go:18-45`, behind a `GetVersion` guard
> + `ReflectionEnabled()`) · LE10 adaptive per-turn effort (folded into `planLoopTurn`'s cost-SLO
> downshift). `internal/loopeval` is an intentionally **offline** eval harness by design (consumes LE0
> telemetry `TurnRecord`s) — not a wiring gap. Treat §4 below as a **build log**, not a live backlog.

---

## 0. Thesis — why loop engineering, why now, why *governed*

2024 was prompt engineering; 2025 was **context engineering** (what you put *in* the window);
2026 is **loop engineering** — engineering the *iteration* itself: `assemble context → model →
tools → update state → decide → repeat`. On long-horizon tasks the loop, not the prompt, is the
dominant lever for capability, token cost, latency, and reliability. Every serious agent stack
(Claude's context-compaction + sub-agents, OpenAI's Agents SDK sessions, LangGraph's checkpointer,
CrewAI's flows) is really a set of loop-engineering choices.

**Everyone optimises the loop for *capability*. Actrone's differentiated bet is to own GOVERNED
loop engineering:** every loop decision — what enters the context window, when to compact and what
may never be compacted away, which sub-agent sees what, when to stop, which model tier per turn —
is a *governed* decision with provenance, a policy, a cost, an audit record, and (for actions) a
reversal path. Nobody else governs the loop. That is simultaneously the moat and the frontier: a
loop that a regulated enterprise can actually run autonomously because it can prove and undo what
the loop did.

---

## 1. Where we already are (grounded in code — this is a strong base, not a greenfield)

Actrone ships a genuinely governed agentic loop today:

| Capability | Where | What it does |
| --- | --- | --- |
| **Durable governed loop** | `internal/workflow/task_workflow.go` `runAgenticLoop` | crash-resumable model→tool iteration; every step a durable Temporal activity; workflow owns the transcript (deterministic replay) |
| **Loop caps** | same | hard turn ceiling, cumulative tool-call count, cumulative spend (`max_task_cost_usd`); forced tool-free **wrap-up** on cap so the task still answers |
| **Per-turn operator control** | same (`applyLoopControl`) | pause / resume / cancel / force-escalate at every turn boundary (<30s "pause any agent") |
| **Budgeted context assembly** | `internal/service/context_manager.go` | 4-phase pipeline with a **token budget** split System 30% / Episodic 25% / Session 35% / CurrentTurn 10%; relevance-thresholded L2 (Qdrant) recall; L1 (Redis) sliding window |
| **Compaction** | `internal/service/activity_service.go` (`Summarise the following…`) + `context_manager.go` extractive summary | LLM summarisation of overflow turns + an extractive fallback |
| **Memory consolidation** | `internal/service/memorydepth_hook.go` | per-turn durable-fact extraction into governed structured memory, PII-redacted |
| **PII-safe context** | `internal/mal` (Memory Abstraction Layer) | everything entering the loop is MAL-tokenised; de-tokenised only at a governed commit |
| **Multi-agent** | `internal/governedsystem` | cross-framework handoff ledger — one trace across agents/frameworks |
| **Per-step BYOF durability** | `backend/src/actrone/harness/stepwise.py` | replay-with-memoization so a hosted framework loop resumes from the last completed model/tool boundary |
| **Reasoning control** | ThinkingDialect (provider-neutral) | per-request reasoning-effort/thinking budget |
| **Outcome learning (offline)** | `internal/assurance` flywheel + evals | distillation + governance-correction flywheels feed back into routing/policy |

**Read:** we are already ahead of most stacks on the *governance* axis and at par on the *capability*
axis. To be frontier **and better than anyone**, close the capability gaps below **while keeping each
one governed** — that combination is what no one else has.

---

## 2. The 2026 frontier + honest gap analysis

Legend: **A** ahead · **=** at par · **B** behind / partial.

| # | Frontier technique (2026) | Actrone today | Std | The governed differentiator we add |
| --- | --- | --- | --- | --- |
| 1 | **Agentic compaction** — summarise with attention to the goal + recent tool outputs, not just "oldest turns" | LLM/extractive summary of overflow, order-based | **B** | Compaction is **provenance-preserving + policy-bounded**: never compact away an audit-required or commit-relevant fact; emit a signed **compaction receipt** |
| 2 | **Sub-agent context quarantine** — each sub-agent gets a minimal, isolated window; only a distilled result returns | handoff ledger passes outputs; no enforced isolation/minimisation | **B** | Quarantine + **purpose-binding** per sub-agent + **independently reversible** sub-agent actions |
| 3 | **Just-in-time / progressive context** — the agent *pulls* context via tools (lazy retrieval, refs/pointers) instead of pre-loading | retrieval is front-loaded by budget | **B** | Every JIT pull is a **governed, audited retrieval** (MAL + purpose + cost) — lazy context without losing the audit trail |
| 4 | **Structured note-taking / external scratchpad** — agent writes durable notes/todos outside the window and re-reads them | consolidation exists, but no in-loop agent-writable working memory | **B** | Scratchpad **is governed memory** (PII-safe, provenance, survives compaction) |
| 5 | **Semantic tool-result pruning** — drop/summarise stale tool outputs by relevance | budget-fraction/order pruning | **B** | Pruning decisions **logged**; a commit-relevant result is never silently pruned |
| 6 | **Tool-space management** — mask/RAG over a large tool set so only relevant tools are advertised per turn | advertises the agent's full tool set | **=/B** at scale | Per-turn tool selection is **policy-gated + audited** (no silent capability expansion) |
| 7 | **In-loop reflection / self-correction** — critique-and-retry primitive | offline eval flywheel only | **B** | Reflection **bounded by the cost cap**; corrections audited as first-class loop events |
| 8 | **Long-horizon orchestration** — checkpoint/resume, map-reduce fan-out, durable sub-tasks over hours/days | Temporal durability + stepwise = strong base | **=/A** | Durable **+ reversible + cost-attributed** per sub-task |
| 9 | **Adaptive per-turn cost/latency** — cheap model to route, strong to reason; thinking budget per phase; speculative tool exec | routing + ThinkingDialect + distillation exist | **=/A** | Extend to **per-turn adaptive** under a governed **Loop Policy** with a cost SLO |
| 10 | **Context-rot resistance** — measured degradation as context grows; keep *effective* context small | sliding window helps; unmeasured | **B** | A **loop-quality eval** that measures effective-context ratio + rot curve per agent |

Net: our unique strengths are durability, reversibility, provenance, and cost learning (#8/#9 and the
governance column throughout). Our real capability gaps are **#1–#5, #7, #10** — all closable on
existing seams (`context_manager`, `runAgenticLoop`, `governedsystem`, the harness `sctx`).

---

## 3. The differentiated design — **Governed Loop Primitives**

Rather than bolt on ad-hoc features, define a small primitive set that becomes the platform's loop
API (kernel-side, so *every* execution surface — native agents, EMAOP no-code, BYOF harness —
inherits them, and they surface into the SDKs as config + telemetry):

1. **Context Ledger.** Every item in the context window is an entry carrying `{source, purpose,
   mal_class, tokens, cost, added_turn, pin?}`. Assembly, compaction and pruning operate on the
   ledger and **record every add/drop with a reason**. Makes context auditable and makes #1/#3/#5
   policy-enforceable. (Extends `context_manager.RetrievedContext`.)
2. **Governed Compactor.** Goal-aware + tool-output-aware summarisation that reads the ledger,
   **respects `pin` and a "never-compact" policy** (audit/commit-relevant), and emits a signed
   compaction receipt into the GAL audit stream. (Replaces the order-based summariser.)
3. **Working-Memory Scratchpad.** Governed, agent-writable notes/todo store *outside* the window,
   exposed as loop tools (`notes.write`, `notes.read`, `todo.update`); PII-safe via MAL; survives
   compaction. (New; backed by the memory layer + `memorydepth_hook`.)
4. **JIT Context Tools.** First-class governed retrieval tools (`memory.search`, `doc.fetch`,
   `ledger.get`) the agent calls to pull context lazily — shifting from front-loaded assembly to
   pull-based, shrinking the resident window. Each call audited. (New loop tools over existing
   memory/retrieval.)
5. **Sub-Agent Quarantine.** In `governedsystem`, a delegated sub-agent runs with an **isolated,
   minimised, purpose-bound** context (not the parent's full window); only a distilled, MAL-clean
   result returns to the parent; sub-agent actions are independently reversible.
6. **Loop Policy (typed, fail-closed).** Per-agent config: `max_turns`, per-turn `thinking_budget`,
   `model_tier` per phase (route/reason/wrap-up), `compaction` trigger + never-compact classes,
   `reflection_budget`, `tool_advertise` strategy, `cost_slo`. Lives on the Agent-File spec next to
   the existing `Limits`.
7. **Loop Telemetry + Eval.** Per-turn metrics (tokens in/out, effective-context ratio, cost,
   latency, compaction/prune events) + an offline **loop-quality eval harness** (task success,
   cost/outcome, context-rot curve, per-primitive ablation). Measure first, then optimise.

---

## 4. Phased plan (workstreams) — measured, each shippable, each governed

Each workstream states: **deliverable · where in code · tests · done-when · governed edge.** Order
front-loads measurement so every later change proves its worth.

### LE0 — Telemetry & loop-quality eval *(measure first)*
- **Deliverable:** per-turn loop telemetry (Prometheus + audit event) from `runAgenticLoop` +
  `context_manager`; a `loop-quality` eval harness (offline) scoring task success, tokens/outcome,
  cost/outcome, and a context-rot curve on a fixed task suite.
- **Where:** `internal/workflow/task_workflow.go`, `internal/service/context_manager.go`, new
  `internal/loopeval/`.
- **Tests:** deterministic eval fixtures; metric-emission unit tests. **Done-when:** a baseline
  report exists for a reference agent. **Edge:** the eval itself is auditable + reproducible.

### LE1 — Context Ledger
- **Deliverable:** ledger entries with provenance/cost/pin threaded through assembly; surfaced in the
  task audit + a `GET` on the task. **Where:** `context_manager.go` (extend `RetrievedContext`),
  audit sink. **Tests:** ledger records every add/drop with a reason; budget math unchanged.
  **Done-when:** an operator can see *why* each context item was present. **Edge:** auditable context.

### LE2 — Governed Compactor
- **Deliverable:** goal/tool-aware compaction reading the ledger, honouring `pin` + never-compact
  policy, emitting a signed compaction receipt. **Where:** replace the summariser in
  `activity_service.go`; policy on Loop Policy (LE6). **Tests:** never drops a pinned/commit-relevant
  entry; receipt verifiable; token reduction ≥ target on the eval suite. **Edge:** policy-bounded,
  receipted compaction.

### LE3 — Working-Memory Scratchpad
- **Deliverable:** governed `notes.*` / `todo.*` loop tools writing to memory outside the window,
  re-read across turns/compactions. **Where:** loop tool registry + memory layer + `memorydepth_hook`.
  **Tests:** notes survive a compaction; PII redacted; provenance recorded. **Edge:** scratchpad is
  governed memory, not raw context.

### LE4 — JIT Context Tools
- **Deliverable:** `memory.search` / `doc.fetch` / `ledger.get` governed retrieval tools; a Loop
  Policy switch to run pull-based (lean resident window) vs front-loaded. **Where:** loop tools over
  the retrieval pipeline + Tool-Call Supervisor. **Tests:** pull-based mode reduces resident tokens
  with equal task success on the eval suite; each pull audited. **Edge:** lazy context, full audit.

### LE5 — Sub-Agent Quarantine
- **Deliverable:** `governedsystem` sub-agents run with isolated, minimised, purpose-bound context;
  distilled MAL-clean return; independent reversibility. **Where:** `internal/governedsystem/runtime.go`
  + `adapters.go`. **Tests:** parent context not leaked to sub-agent; sub-agent action reversible in
  isolation; handoff ledger records the quarantine boundary. **Edge:** quarantine + purpose-binding +
  reversible sub-agents.

### LE6 — Loop Policy (typed, fail-closed)
- **Deliverable:** `spec.loop` on the Agent-File (validated, fail-closed defaults) driving turns,
  thinking budget, per-phase model tier, compaction triggers, reflection budget, tool-advertise
  strategy, cost SLO; consumed by `runAgenticLoop`. **Where:** Agent-File schema + parser +
  task_workflow. **Tests:** invalid policy rejected at author time; defaults reproduce today's
  behaviour. **Edge:** the loop is *configurable governance*, not hardcoded.

### LE7 — Semantic tool-result pruning
- **Deliverable:** relevance-scored pruning/summarising of stale tool outputs on the ledger (never a
  commit-relevant result), replacing order-only. **Where:** `context_manager.go` + ledger. **Tests:**
  commit-relevant results retained; token savings on the eval suite. **Edge:** logged, safe pruning.

### LE8 — Tool-space management (scale)
- **Deliverable:** per-turn tool selection/masking (RAG over the tool catalogue) so large tool sets
  advertise only relevant tools, policy-gated. **Where:** loop tool advertiser + Tool-Call Supervisor.
  **Tests:** accuracy at 50+ tools improves; no silent capability expansion (audited). **Edge:**
  governed tool-space.

### LE9 — In-loop reflection
- **Deliverable:** a bounded self-critique/retry primitive (cost-capped) as a first-class loop event.
  **Where:** `runAgenticLoop`. **Tests:** reflection respects the cost cap; corrections audited;
  success-rate lift on the eval suite. **Edge:** bounded, audited self-correction.

### LE10 — Adaptive per-turn optimisation
- **Deliverable:** per-turn model-tier + thinking-budget selection (cheap-to-route / strong-to-reason)
  under the Loop Policy cost SLO; optional speculative tool exec. **Where:** router + ThinkingDialect
  + task_workflow. **Tests:** cost/outcome improves at equal success on the eval suite. **Edge:**
  cost-optimal loop with a governed SLO.

---

## 5. Surfacing to the SDKs & BYOF (parity)

- **Kernel-first:** LE0–LE10 land in the orchestrator so **every** execution surface (native agents,
  EMAOP no-code, BYOF-encapsulated) inherits them with no author work.
- **Client SDKs (TS + Python):** expose **Loop Policy** authoring + **loop telemetry** reads —
  a client-facing surface, so it lands in both per the parity rule. (The Go SDK is **removed from the
  matrix** — see the Go SDK Removal Plan — so **no Loop-Policy/telemetry surface is built for Go**.)
- **BYOF harness:** the scratchpad + JIT context tools + Loop Policy surface through the harness
  context (`ctx`/`sctx`) so hosted frameworks opt in. Python has stepwise today; **bring the TS
  harness to stepwise** so JS frameworks (Mastra / OpenAI-Agents-JS / Vercel-AI) get per-step
  governed loops + these primitives too (this closes the current Python↔TS BYOF gap — see
  [[sdk-locations]]).

---

## 6. How we know it's frontier — success metrics

Measured by the LE0 eval harness on a fixed long-horizon task suite, per reference agent:

- **Token efficiency:** ≥ 40% fewer resident context tokens at equal task success (LE1–LE4, LE7).
- **Effective-context ratio:** resident tokens / tokens the model actually attends to — trending up.
- **Context-rot resistance:** task success stays flat as horizon grows (turns × tools), where a naive
  full-history loop degrades.
- **Cost/outcome:** ≥ 30% lower $ per successful task (LE10) at equal success.
- **Long-horizon:** tasks of 100+ turns / multi-hour complete durably and remain fully reversible.
- **Governance (the unique column):** 100% of context items carry provenance; 100% of
  compaction/prune/handoff decisions audited; sub-agent + loop actions reversible; zero
  never-compact-policy violations.

The bar for "better than anyone": match the frontier on the capability metrics **and** be the only
stack that satisfies the governance metrics — a loop a regulated enterprise can run unattended.

---

## 7. Non-goals & risks

- **Non-goals:** replacing Temporal durability (we build on it); a new agent DSL (loop primitives are
  config + tools, not a language); model training (distillation flywheel already covers that).
- **Risks:** (a) compaction/pruning that drops something needed → mitigated by the ledger + pin +
  never-compact policy + the eval harness catching regressions; (b) JIT/pull-based latency →
  mitigated by measuring cost/latency in LE0 before shipping LE4; (c) primitive sprawl → mitigated by
  the fixed 7-primitive set and kernel-first placement; (d) governance overhead → the audit is
  event-emission, off the hot path, and already how the loop records tool/GAL events.

---

## 8. Sequencing summary

**Measure → make context legible → make it lean → make it safe at scale.**
LE0 (telemetry+eval) → LE1 (ledger) → LE2 (governed compactor) → LE3 (scratchpad) → LE4 (JIT
context) → LE5 (sub-agent quarantine) → LE6 (loop policy) → LE7 (semantic prune) → LE8 (tool-space)
→ LE9 (reflection) → LE10 (adaptive cost). LE0/LE1 unblock everything; LE6 (policy) can land early
to make the rest configurable. Each merges independently, each proven on the LE0 eval, each
uncommitted until the owner commits.
