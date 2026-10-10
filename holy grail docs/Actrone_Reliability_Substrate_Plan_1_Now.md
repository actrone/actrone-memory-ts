# Actrone Reliability Substrate — Plan 1: Build & Wire NOW

> **Thesis (the 2026 reframe): the moat is the substrate, not the technique.** Model access isn't the moat;
> the moat is *reliability, cost discipline, and provable safety* — the exact reason 79% of enterprises have
> adopted agents but only ~11% run them in production. Actrone already owns more of that substrate than any
> framework. This plan builds the **two things the market is begging for — cheaper and provably-safe agents —
> by WIRING capabilities that already exist but sit dormant/disconnected**, not by inventing new techniques.
>
> **Status:** Ready to build. Hosted-platform work, grounded in a full backend + SDK + FE audit (2026-07-18).
> **Owner:** Matt · **Scope:** orchestrator backend + both SDKs (TS + Python) + Control-Tower FE.
> **Precedence:** inherits `../CLAUDE.md` + `CLAUDE.md`. **Companion:** `Actrone_Reliability_Substrate_Plan_2_Later.md`.
> **Related built substrate:** `internal/model` (router), `internal/optimizer` (cascade/predictive), `internal/eval`
> (gate/groundedness), `internal/gal` (simulate-then-commit + SAGA), `internal/tool` (supervisor), `internal/semcache`.

---

## 0. TL;DR — two tracks, mostly wiring

| Track | What ships | Net-new vs wiring |
| --- | --- | --- |
| **A — Governed Cost-Routing** (make it *adaptive, provable, complete*) | In-loop cascading escalation, a real difficulty/confidence signal, artifact-level caching + `semcache` on the agent path, tier→catalogue resolution, SDK/FE cost-budget + routing-rules | ~70% wiring dormant pieces, ~30% net-new (confidence signal, artifact cache, routing UI) |
| **B — Dream-Run + Adversarial Verifier + Chaos** (make *safety provable before action*) | Per-plan simulate-then-commit, Preview→**true shadow** (fixes a real "preview can still commit" bug), an incentive-independent second-model verifier, a chaos/fault-injection seam | ~50% extends GAL/eval, ~50% net-new (per-plan pass, chaos seam) |

**Why these two, why now:** cost is the #1 production blocker and safety-before-action is #2. Both are where
Actrone's substrate already leads — and both feed Plan 2's category-definers (insurable autonomy needs the
verifier + chaos as its underwriting basis; speculative execution reuses the shadow/pending machinery).

> **⚠️ Two cross-cutting notes:** (1) this plan carries a **pre-existing-fix lane (§3)** — including a **P0 safety
> bug** (a `Preview` run can still fire real commits); §3 F1 is worth shipping before anything else here. (2)
> **Execution-locus applicability (§11):** the action-boundary safety features work at **every** locus (native /
> BYOF-hosted / BYOF-connected); the cost-**loop** features are native (+ BYOF-hosted stepwise), never BYOF-connected.

---

## 1. Audit correction (read first — it changes the framing)

An earlier note claimed the **LE6 per-turn model-tier is "computed but never enacted."** That gap is **CLOSED**
in the current tree: `runAgenticLoop` applies the per-turn tier at `task_workflow.go:788-789`
(`if applyLoopModelTier(ctx) && plan.ModelTier != "" && plan.ModelTier != in.Model { in.Model = plan.ModelTier }`),
version-gated via `loop-model-tier` (`loop_integration.go:77-79`), covered by
`TestRunAgenticLoop_AppliesLoopModelTier` (`agentic_loop_test.go:212`). So Plan 1 is **not** "enact LE6" — it is
"make cost-routing *adaptive + complete + provable* and fix the correctness gaps around the tier that IS enacted."

---

## 2. What already exists (the substrate we build on)

**Cost-routing:**
- **Per-task model selection** — `RouteModel` (`activity_service.go:1120`): distilled → predictive-cheapest
  (`optimizer.PredictiveRouter`) → primary, with quality-breaker reverts (`:1141`, `:1184`).
- **Per-call strategy** — the MAL `Router` (`model/router.go:79`): `cost/latency/quality/pinned/primary_with_fallback`
  + per-provider `gobreaker` breakers.
- **Per-turn tier + effort** — `planLoopTurn` (`loop_integration.go:94`) → `{ModelTier, ReasoningEffort, Downshifted}`;
  both enacted per turn (§1). Cost-SLO downshift at 0.8×SLO.
- **A cheap→verify→frontier cascade EXISTS but is dormant + narrow** — `optimizer.Cascade.Run`
  (`optimizer/cascade.go:77`): cheap model → `eval.Gate.Check` → serve or escalate to frontier. Wired only via
  `EnableCascade` (`main.go:1112`), triple-gated to `RoutingStrategy=="cost"` + single-turn + non-tool
  (`service/cascade.go:34`). One-shot, not in-loop.
- **A ReflectionController EXISTS but is NOT wired** (`service/reflection.go:13`); no code computes the
  `confidence`/`triggered` signal it needs.
- **Caches:** exact-match LLM cache (`model/query_cache.go`, temp≤0.1, no-tools); `semcache` (semantic) — but
  **wired only into the gateway, not the agent path** (`main.go:2598`). **No artifact cache** (tool results,
  entities, embeddings).
- **Cost accounting is solid** — `totalCost` accrual + `MaxTaskCostUSD` cap (`task_workflow.go:730,870`) +
  metering + savings ledger.

**Dream-run / verifier:**
- **Simulate-then-commit is real, per-write** — `gal.Service.ExecuteWrite` (`gal/service.go:140`):
  detokenise → **Simulate** (dry-run or read-back diff, `connectortool/gal_committer.go:55`) → gate → commit →
  Ed25519 signed receipt → SAGA compensation. Non-committing `Service.Preview` (`:219`) exists.
- **Tool-Call Supervisor** — `supervisor.Execute` (`tool/supervisor.go:441`), 8-step authorize→execute→validate→audit.
- **Verifiers exist but are observational** — `eval.Gate.Check` (escalate/abstain), `GroundednessVerifier` +
  an `eval.Judge` seam (`eval/gate.go`, `eval/groundedness.go`); `AuditGovernance` rule engine on the final output.
- **`Preview` suppresses memory + billing only** — it does **NOT** force connector side-effects to simulate-only
  (`ExecuteGovernedTool`/`supervisor.Execute` never consult `input.Preview`), so **a preview run can still fire
  real GAL commits** (a genuine safety bug, §5.2).
- **Chaos injection: absent** everywhere in non-test code.

**SDK + FE:** FE `ModelPicker` + `ThinkingControl` (wired in `agent-studio/RulesDeployment.tsx`) + Cost Monitor
(`cost/page.tsx`, burn gauge/forecast/per-model table/kill switch). Python SDK forwards `custom_model_routing`/
`spend_cap_usd` headers; **TS `ActroneClientConfig` has none** (parity gap). **Neither SDK has a per-task cost
budget on submit.** FE `GovernancePreview` is **action-level only**; the only "sandbox" UI (`SandboxValidation`)
is **faked synthetic data**. `recharts` + custom SVG charts available; no DAG/tree lib.

---

## 3. Pre-existing fixes & hygiene (independently shippable — do these even if the features slip)

The audit surfaced defects/debt that exist in the tree **today**, independent of the new features. They are folded
into the tracks below, but consolidated here so they aren't lost if a feature slips — several are worth shipping on
their own. **F1 is a P0 you should fix regardless of everything else in this plan.**

| # | Pre-existing issue | Kind | Fixed in | Ship alone? |
| --- | --- | --- | --- | --- |
| **F1** | **`Preview` suppresses memory+billing but does NOT force connector writes to simulate-only → a preview run can still fire real GAL commits** (`ExecuteGovernedTool`/`supervisor.Execute` never read `input.Preview`) | **Safety bug (P0)** | §5 B2 | **Yes — fix first, alone** |
| F2 | Per-turn tier override sets `in.Model` but not `in.Provider`, and uses the free-form tier **verbatim** with no catalogue resolution (`task_workflow.go:788-789`) — wrong provider on BYOK tenants; only works if the author writes concrete model ids | Correctness | §4 A3 | Yes |
| F3 | `semcache` is wired only into the gateway, **not the agent completion path** (`main.go:2598`) — agent tasks get no semantic-cache savings | Built-but-unwired | §4 A4 | Yes |
| F4 | `ReflectionController` (`service/reflection.go:13`) exists but is **never wired**, and no code computes the confidence/`triggered` signal it needs | Dead/unwired | §4 A2 | Partial (needs the signal) |
| F5 | `optimizer.Cascade` (cheap→verify→frontier) is built but **dormant + triple-gated** to single-turn non-tool cost-strategy runs | Dormant capability | §4 A1 | With A1 |
| F6 | **TS SDK `ActroneClientConfig` cannot set `spend_cap`/`custom_model_routing`/`governance_policy`/`data_residency_region`** that Python already forwards — a **contract-parity defect** (CLAUDE.md §0.1); a TS user literally cannot cap spend today | SDK parity defect | §4 A6 | **Yes** |
| F7 | `SandboxValidation.tsx` presents a **faked** staged preview over synthetic data as if it were validation (its own docstring flags `runValidation()` as the swap seam) | Stub-as-real | §5 B5 | With B5 |
| F8 | `ReasoningTracePanel` **derives** its trace; the seam to the real `audit_events.reasoning_trace` is unwired (`ReasoningTracePanel.tsx:8`) | Unwired seam (FE) | *added here* | Yes (small) |
| F9 | Two divergent `RiskScore` types — the FE `RiskScorePanel` type ≠ the assurance-engine `RiskScore` | Type drift (FE/contract) | *added here* | Yes (small) |

**F8/F9 are net additions to this plan** (the feature tracks didn't cover them): **F8** — wire `ReasoningTracePanel`
to the real `audit_events.reasoning_trace` the audit spine already records (`activity_service.go:805`) instead of
deriving it; **F9** — unify the two `RiskScore` shapes onto the single assurance `RiskScore` (`types/assurance.ts`)
so the predictive panel and the assurance posture speak one contract.

**Explicitly OUT of scope (acknowledged, not silently dropped):** codebase-wide debt *outside* the cost/safety
surface these three audits covered is **not** in this plan — most notably the **`00030` vs `00041` migration-chain
duplicate** (both create `escalation_queue`), plus other built-but-unwired items tracked in
`memory/plan-status-audit-2026-07-05`. Those belong to a separate hygiene pass; listed here only so the boundary is explicit.

---

## 4. Track A — Governed Cost-Routing (adaptive · provable · complete)

Cost is the #1 production blocker. The goal: **provably use the cheapest capable tier per step, escalate only on
measured failure, and never recompute what you can reuse.**

### A1 — In-loop cascading escalation *(net-new wiring of dormant pieces)*
- **Have:** `optimizer.Cascade` (cheap→gate→frontier) + `eval.Gate` verdict (`Allowed/Escalate/Abstain`), both
  present, both disconnected from the tool loop.
- **Gap:** no "escalate to the next-stronger tier after N failed validations" *inside* `runAgenticLoop` — the
  cascade is single-turn, non-tool only.
- **Build:** in the tool-result / final-answer branch of `runAgenticLoop` (`task_workflow.go:814-864`), consult the
  `eval.Gate` verdict on the turn's output; on `Escalate`/`Abstain`, bump a **bounded per-run escalation counter**
  (sits next to `totalCost`) and re-plan the next turn one tier up. Cap escalations per run (config, default 2) so
  it can't runaway-cost. Record each escalation as a `SourceCascade` savings/telemetry event.

### A2 — A real difficulty/confidence signal *(net-new)*
- **Gap:** `ReflectionController.ShouldReflect(cost, triggered)` and the tier planner both *want* a confidence/
  difficulty signal, and **none is computed** (the `triggered bool` has no production feeder).
- **Build:** a cheap, deterministic `TurnSignal` computed per turn from already-available inputs — groundedness
  score (`eval.GroundednessVerifier`, already run observationally at `activity_service.go:1544`), tool-error rate,
  self-consistency (does the model repeat/oscillate), and output-schema validity. Feed it into (a) `planLoopTurn`'s
  phase choice (replace the coarse turn-0-vs-rest heuristic, `loop_integration.go:83`), (b) the A1 escalation
  decision, and (c) finally **wire `ReflectionController` into the loop** (it exists, unused). One signal, three consumers.

### A3 — Tier→catalogue resolution + per-turn provider re-resolution *(correctness fix)*
- **Gap (from audit):** the per-turn tier override sets `in.Model` **verbatim** as a model id with **no
  tier→catalogue resolution** (only works if the policy author writes concrete ids), and does **not re-resolve
  `in.Provider`** — so on a BYOK-bound tenant the tier string can be served through the wrong provider.
- **Build:** a `ResolveTier(tier, catalogue, tenant) → (provider, modelID)` step invoked at the same hook
  (`task_workflow.go:776-796`), so a free-form tier (`"fast"`, `"frontier"`) maps to a concrete catalogue entry +
  the correct provider per turn. Reuses `modelkeys.Resolver` + the model catalogue.

### A4 — Artifact-level cache + `semcache` on the agent path *(biggest cost win)*
- **Gap:** `semcache` serves only the gateway; the agent completion path consults only the exact-match
  `query_cache`. **No caching of tool results, extracted entities, or embeddings.**
- **Build:** (1) route the existing `semcache` into `routeCompletion` (`activity_service.go:1588`) — governance-gated,
  tenant-isolated, already built, just not plumbed here. (2) An **artifact cache** (`cacheaside`-backed, single-flight
  + jittered TTL — the helper exists) wrapping `ExecuteGovernedTool` (`activity_service.go:1780`) keyed by
  `(agent, tool, args-hash)` for **idempotent/read** tool calls only (never governed writes), and embeddings keyed
  by content-hash. Every hit emits a `SourceCacheHit` savings event (ledger already supports it).

### A5 — Cost-aware tier selection *(small net-new)*
- **Gap:** `planLoopTurn` reads accrued cost only for a **binary** downshift; there's no "pick the tier that keeps
  *projected* task cost under budget."
- **Build:** a projected-cost estimate (accrued + expected remaining turns × tier blended rate, via
  `model/pricing.go`) so the planner picks the highest tier that stays under `MaxTaskCostUSD` — graceful degradation
  instead of a hard cap-break.

### A6 — SDK parity + FE
- **SDK (TS parity gap):** add `customModelRouting` / `spendCap` / `governancePolicy` / `dataResidencyRegion` to TS
  `ActroneClientConfig` (Python already forwards them) → contract parity. Add a **per-task cost budget** to
  `submitTask`/`submit_task` in **both** SDKs (absent today; `submitTaskBodySchema` sends only
  agent_id/input/idempotency_key) → `X-Spend-Cap`-per-task. Contract tests, both SDKs.
- **FE:** (1) a **routing-rules editor** (canonical→target tier map / per-phase tier policy) — no FE home today;
  add to Agent Studio next to `ModelPicker`/`ThinkingControl` (`agent-studio/RulesDeployment.tsx`). (2) a per-task
  budget field on the submit/playground surfaces. (3) surface **escalation + cache hits** in `TraceViewer`
  (a turn badge: "escalated fast→frontier", "cache hit −$0.004") and in the per-model cost table (`cost/page.tsx`).

---

## 5. Track B — Dream-Run + Adversarial Verifier + Chaos (provable safety before action)

"It'll break my production data" is the #2 blocker. Actrone already has simulate-then-commit *per write* — this
track generalises it to a **whole-plan dry-run that must survive an adversarial validator before anything commits.**

### B1 — Per-plan simulate-then-commit *(extends GAL from per-write to per-plan)*
- **Have:** `gal.ExecuteWrite` simulates+gates **each connector write** individually mid-loop.
- **Gap:** no "simulate the *whole turn/plan* first, then commit" — each tool executes immediately.
- **Build:** a **pre-commit pass** in `runAgenticLoop` before the `for _, call := range turnResult.ToolCalls`
  block (`task_workflow.go:840`): run every requested call through a supervisor **simulate-only** mode (extend
  `supervisor.Authorize` (`tool/supervisor.go:705`) to drive `gal.Preview` for writes), collect the predicted diffs,
  and gate the real commit loop on **all simulations passing** the verifier (B3). Reuses GAL's non-committing
  `Preview` + the deferred-commit `PendingStore` (`gal/pgpending.go`) — hold sealed real args, commit only after the pass.

### B2 — Preview → a TRUE shadow run *(safety-correctness fix — do this regardless)*
- **Bug (from audit):** `Preview` suppresses memory + billing but **does not force connector side-effects to
  simulate-only** — `ExecuteGovernedTool`/`supervisor.Execute` never consult `input.Preview`, so **a preview task
  can still fire real GAL commits.** That's a genuine safety defect.
- **Build:** thread `Preview` into `ExecuteGovernedToolInput` → the supervisor context, and when set, **force
  `gal.Preview` (never `ExecuteWrite`)** for every write. A preview/shadow run then provably touches nothing real.
  This is small, high-value, and a prerequisite for B1 and for Plan-2 speculative execution.

### B3 — Adversarial (incentive-independent) verifier *(promote observational → gate)*
- **Have:** `eval.Gate`/`GroundednessVerifier` + the `eval.Judge` seam — but observational only.
- **Gap:** no **second-model / incentive-independent** verifier *gating* a write before commit (the 2026 literature's
  "verification as a moat" — a verifier that doesn't share the actor's incentives).
- **Build:** insert a verifier between `Simulate` (`gal/service.go:164`) and `Evaluate` (`:171`) — a **cheap**
  independent judge (rule engine or a small model via `eval.Judge`) checks the simulated diff for consistency
  (ledger/CRM invariants, missing fields, math) before authorising; and/or after each tool result
  (`activity_service.go:1840`) before it's appended to loop history (`task_workflow.go:858`). **Cheap by design —
  ties directly to Track A** (a small verifier catches the correlated failures the acting model won't). Majority/
  threshold config; a failed verification triggers the A1 escalation.

### B4 — Chaos / fault-injection seam *(net-new — the "adversarial chaotic environment")*
- **Gap:** absent entirely.
- **Build:** a context-flag-driven fault seam (activated **only under Preview/shadow**) in `supervisor.Execute`
  step 6 and in `gal_committer` `Simulate` — inject latency, network drops, partial failures, and bad return values,
  so the shadow run proves the plan **handles exceptions gracefully** before it's allowed to commit for real. A
  small, declarative chaos profile (`{latency_ms, drop_rate, bad_data_rate}`) on the preview request.

### B5 — SDK + FE
- **SDK:** add a **task-level `preview`/`shadow` flag (+ optional chaos profile)** to `submitTask`/`submit_task` in
  **both** SDKs (today only connector-*action*-level `previewAction` exists). Return the shadow verdict (simulated
  diffs + verifier result + chaos outcomes). Contract tests.
- **FE:** (1) promote `GovernancePreview` from action-level to a **task-level "dream-run" panel** — run the shadow,
  show the predicted diffs across the whole plan + the verifier verdict + chaos survival. (2) **Replace the faked
  `SandboxValidation`** synthetic preview with the real shadow run (its docstring already names `runValidation()`
  as the single seam). (3) surface the verifier verdict + chaos results as rows in `TraceViewer`.

---

## 6. Data model / migrations

Minimal. Track A: no new tables (savings/telemetry events reuse the existing savings ledger; the artifact cache is
Redis/`cacheaside`). Track B: no new tables (shadow runs are ephemeral; predicted diffs ride the existing GAL
`Preview` path; the pre-commit pass reuses `PendingStore`). New **config** only: escalation cap, verifier
threshold/model, chaos-profile bounds, artifact-cache TTL (all off/conservative by default, feature-flagged).

## 7. Testing (CLAUDE.md §7/§8)

- **Unit:** the `TurnSignal` computation; tier→catalogue resolution + per-turn provider re-resolution; projected-cost
  tier selection; the escalation counter + cap; artifact-cache key/hit/miss + never-cache-writes; the per-plan
  simulate pass (all-pass vs one-fail gating); Preview→simulate-only forcing; the verifier gate (pass/fail →
  commit/escalate); chaos-seam determinism.
- **Integration (Temporal test env + real Temporal via Docker, as the scheduling work proved out):** a run that
  escalates fast→frontier after N failed verifications; a preview run that provably fires **zero** real commits
  (the B2 fix); a shadow run whose plan survives injected latency/drops before committing; `semcache`/artifact-cache
  hits cut cost on a repeat task.
- **Contract:** the new SDK surfaces (per-task budget + routing config in TS; task-level preview/chaos flag) in
  **both** SDKs vs the OpenAPI (the 3 synced copies).
- **Back-compat:** every existing agent byte-identical when the flags are off (version-gate the loop changes exactly
  as `loop-model-tier` already is).

## 8. Phasing (each independently shippable)

- **Phase 1 — Safety-correctness first:** B2 (Preview→true shadow — it's a bug) + B3 (verifier gate on writes). Small,
  high-trust, unblocks B1 + Plan 2.
- **Phase 2 — Cost:** A4 (artifact cache + semcache on the agent path — biggest $ win) + A1 (in-loop escalation) +
  A2 (confidence signal) + A3 (tier resolution fix).
- **Phase 3 — Complete the loop:** B1 (per-plan simulate) + B4 (chaos) + A5 (cost-aware tier).
- **Phase 4 — Surface it:** SDK parity + per-task budget + preview flag; FE routing editor + dream-run panel +
  TraceViewer badges.

## 9. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Escalation loops runaway cost | Bounded per-run escalation counter + projected-cost tier selection (A5) + the existing `MaxTaskCostUSD` hard cap |
| Verifier adds latency/cost | Verifier is **cheap by design** (rule engine or small model) — it's the point (§Track A); only runs on consequential writes |
| Per-plan simulate breaks streaming/latency | Simulate-only pass is fast (no real I/O for read-backs; dry-run for writes); gate applies only to write-bearing turns |
| Determinism (Temporal) | Every loop change version-gated exactly like `loop-model-tier`; signals/verifiers are deterministic or run in activities |
| Artifact cache serves stale/cross-tenant | Tenant-isolated keys, never cache governed writes, TTL + governance-gated cacheability (reuse `semcache` rules) |

## 10. Definition of done

- A preview/shadow run **provably touches nothing real** (B2) — asserted by integration test.
- A consequential write is gated by an **independent verifier** before commit (B3); a whole plan is dry-run before
  any commit (B1); shadow runs survive **injected chaos** before committing (B4).
- A run **escalates tiers only on measured failure** (A1) driven by a real signal (A2), with correct provider/model
  resolution per turn (A3) and projected-cost-aware selection (A5); repeat work hits the **artifact/semantic cache**
  (A4) with savings recorded.
- TS↔Python SDK parity for routing/budget + a task-level preview flag; FE routing editor + task-level dream-run panel
  + TraceViewer escalation/cache/verifier badges — all with loading/error/empty states + brand tokens.
- Everything off-by-default + version-gated; existing agents byte-identical; CI green; `progress.md` updated.

---

## 11. Execution-locus applicability (native · BYOF-hosted · BYOF-connected)

Same rule that governs Skills + Scheduling (see [[execution-authoring-taxonomy]]): **action-boundary features work
at every locus; loop-orchestration features are native (+ BYOF-hosted stepwise), never BYOF-connected** — because
Actrone owns the native kernel loop (`runAgenticLoop`) and the hosted harness, but a connected agent's loop runs in
the customer's own process where Actrone only sees what it routes through the gateways.

| Feature | native | byof_hosted | byof_connected | Why |
| --- | --- | --- | --- | --- |
| Per-call model router + query/semantic/**artifact** cache (A4, F3) | ✅ full | ✅ via `sctx.model` (stepwise) + the gateway; `semcache` is already gateway-wired | ✅ **at the gateway** — calls routed through Actrone get routed + cached | enforced where the model call passes through Actrone |
| Per-turn tier planning · in-loop cascade/escalation · confidence signal (A1–A3, A5) | ✅ full | ⚠️ stepwise only, for calls routed via `sctx`; the framework still owns its control flow | ❌ | Actrone can only plan turns of a loop it runs |
| Per-**action** simulate-then-commit · adversarial verifier · **Preview→shadow (F1)** · action-level chaos (B2–B4) | ✅ full | ✅ every governed tool/write goes through the Supervisor + GAL | ✅ governed writes route through Actrone's tool gateway | enforced at the governed-action boundary, regardless of who called it |
| Per-**plan** (whole-turn) simulate-then-commit (B1) | ✅ full | ⚠️ stepwise (Actrone sees the step sequence) | ❌ | needs Actrone to see the whole plan |
| SDK routing/spend-cap config + per-task budget + preview flag (A6, B2) | ✅ | ✅ | ✅ | client-config + gateway concern, locus-independent |

**The honest limit (identical to Skills/Scheduling):** anything a BYOF-connected agent does that does **not** pass
through Actrone's model gateway or governed-tool gateway (pure local compute, an ungoverned direct API call) is
invisible to these features — cost-routing, simulation, and verification can only act on what flows through the
substrate. **The safety win (F1 + B2–B4) is the one that holds everywhere:** it binds to the governed-action
boundary, so a preview/shadow run touches nothing real and a consequential write is verified before commit *no
matter which locus initiated it*. The cost-*loop* wins (A1–A3, A5) need Actrone to own or step-drive the loop
(native, or BYOF-hosted stepwise); BYOF-connected still gets gateway-level routing + caching (A4, F3) and the full
SDK budget/preview surface.

---

*Plan 1 — the two things the 2026 market says are missing (cheaper + provably-safe), built mostly by wiring the
substrate Actrone already has. It also lays the rails Plan 2 stands on. Last updated: 2026-07-18 | Owner: Matt.*
