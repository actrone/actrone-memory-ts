# Actrone — the Governed Multi-Framework Agent Runtime (build plan + moat brainstorm)

> **Status refreshed 2026-07-13 (code-verified):** **G3 stepwise harness drivers (§B.1, the keystone) are
> now built far beyond the original "langgraph + openai_agents first" scope** — 13 Python framework
> drivers (`agno, autogen, aws_strands, crewai, dspy, google_adk, langchain, llamaindex,
> microsoft_agent_framework, openai_agents, pydantic_ai, semantic_kernel, smolagents`) and 6 TS drivers
> (`genkit, langchain, llamaindex, openai-agents, vercel, voltagent`) exist, with the
> `HostedFrameworks`/`StepwiseFrameworks` enum in sync (a prior enum/driver mismatch is fixed and
> regression-tested). See `Actrone_Stepwise_Framework_Expansion_Plan.md`'s refresh note for the full
> record. Part A (`GovernedSystem` runtime, cross-framework handoff) and G1/G2 (native graph DSL / crew
> DX) were **not** re-verified this pass — treat those claims as they stood in
> `Actrone_Governed_Runtime_Roadmap.md`'s own (2026-07-06) audit, which this pass did not re-run.
>
> **Thesis:** frameworks compete on *authoring ergonomics*, which is commoditising (A2A/MCP are now
> Linux-Foundation standards; LLMs write the glue). The durable, governed, reversible, insurable,
> replayable **runtime substrate** is the moat. So Actrone should not try to out-ergonomic LangGraph —
> it should be the **governed runtime that every framework (including our own native SDK) runs on**, and
> let many frameworks coexist in one codebase, all governed identically.
>
> This plan is deliberately grounded: **every "groundbreaking" feature below is pinned to a primitive we
> already built** (so it's real, not a pitch) and to a concrete pain point. Companion audit:
> `docs/Actrone_Native_vs_Framework_Audit.md`.

---

## Positioning (LOCKED)

**Actrone is the governed autonomy *runtime*. Frameworks — including our own native SDK and no-code
builder — are authoring surfaces on top of it. We don't ask you to leave your framework; we make your
framework (and ours) governed, durable, reversible, and insurable.** That is a *category* ("governed
autonomy runtime"), not a better framework.

Three consequences that govern this entire plan:

1. **We compete on the *substrate axis*, not the authoring-ergonomics axis.** The moat is durable +
   governed + reversible + insurable + replayable, and its ledger/actuarial data compounds — a framework
   can copy an ergonomic in a weekend but not the substrate. We stop trying to *win the DX battle*
   against LangGraph/CrewAI.
2. **Native is excellent and we keep making it excellent — but it does not exist to "beat" other
   frameworks.** Native already leads on the axis that matters (see the audit: governance, durability,
   memory, routing, HITL, protocols) and we will close its authoring gaps (graph DSL, crew DX) so
   developers who choose it want for nothing. But native's job is to be the **best-integrated, zero-infra
   front-end and the substrate's reference implementation** — not to out-ergonomic a graph framework.
   Native wins on a *different axis*; we do not frame it as a framework bake-off.
3. **One governed runtime, many front-ends** — no-code EMAOP (non-developers), native SDK (developers
   wanting zero-infra governed durable agents), and BYOF frameworks (existing code / specific DX). All
   three sit on the same governed runtime; the no-code + native surfaces are where the governance becomes
   *visible and sellable* (simulate console, approval inbox, receipts), which keeps the direct user
   relationship and avoids commoditising into invisible infrastructure.

This is a *sharpening* of the existing "governed OS agents run inside" positioning, not a pivot.

---

## Part A — Multi-framework system in one codebase

### A.1 Vision
One codebase declares several agents in **different frameworks** — a LangGraph agent for a branching
flow, a CrewAI-style crew for research, a native governed agent for the money-moving action — wired into
one **governed system**, coordinating via the mesh, with a single action ledger, memory namespace, and
trace spanning all of them. The market is heading to protocol interop (Google ADK, OpenAgents via
A2A/MCP); **Actrone's differentiation is that every framework agent is uniformly governed by GAL** — nobody
else has that.

### A.2 What already exists (grounded)
- **Per-agent `build_mode`/`framework`** (`domain.RuntimeSpec`) — agents in one org can each be a
  different framework.
- **MACP mesh** (`internal/macp`) — intra-org NATS coordination with `Crew` (sequential / hierarchical /
  parallel) + shared Qdrant memory namespace keyed by crew.
- **A2A** — cross-org, signed agent-to-agent (`internal/a2a`).
- **Uniform governance** — any agent's tool/write calls hit the same supervisor → DPE → GAL path.

### A.3 What to build
1. **`GovernedSystem` (a.k.a. workspace/topology)** — a first-class declarative object: a set of agents
   (mixed frameworks) + their coordination (crew process, graph handoffs, or A2A edges), deployed and
   versioned as **one governed unit**. SDK: `defineSystem({ agents: [lg, crew, native], topology })`.
2. **Cross-framework governed handoff** — agent A (LangGraph) → agent B (native) over MACP, with **one
   action ledger + trace spanning both** (the receipt chain doesn't reset at the framework boundary).
3. **Shared governed memory across frameworks** — generalise the crew memory namespace into a
   purpose-bound, provenance-carrying memory any framework agent in the system reads/writes (governed by
   the same MAL/purpose policy).
4. **Unified observability** — one trace + audit spine across all frameworks (OTel/OpenInference in +
   the HMAC audit spine), so a mixed-framework run reads as a single governed timeline.

**Pain points resolved:** framework lock-in; brittle, ungoverned multi-agent glue; no single audit/trace
across a mixed system; no shared governed memory.

---

## Part B — Make native excellent (not a framework bake-off) + the groundbreaking substrate

> **Framing (per the locked positioning):** we close native's authoring gaps so a developer who chooses
> native wants for nothing — but the goal is *native excellence on the substrate axis*, not out-erging a
> graph framework. Native already leads where it counts; G1/G2 remove the last reasons a developer would
> feel forced to a framework, and G3 + B.2 are the substrate moat that makes *every* front-end (native
> and BYOF alike) better than any standalone framework. We are not entering a framework war; we are
> making the runtime that wins regardless of which framework you author in.

### B.1 The three native authoring gaps (from the audit) — close them so native lacks nothing

**G1 — Native graph/branching authoring.** The one *structural* gap vs LangGraph. Build a native
**graph DSL / state-machine** authoring surface that **compiles to Temporal** — nodes, conditional
edges, cycles, sub-graphs. The payoff nobody else has: **every node is a crash-resumable, governed,
deterministically-replayable activity.** LangGraph's expressiveness + durability + governance LangGraph
lacks. *Grounded:* Temporal workflows already are durable state machines; this is an authoring surface
over them. *Pain:* complex agents need real control flow, but graph frameworks are ephemeral + ungoverned.

**G2 — Crew DX.** Execution parity already exists (`macp.Crew` does sequential/hierarchical/parallel +
shared memory). Build the **declarative crew authoring** (roles, goals, delegation, process) over it —
CrewAI ergonomics on the governed mesh. *Pain:* authoring multi-agent crews is clunky without a role model.

**G3 — Stepwise harness drivers.** (Their own roadmap §9 P2; only `encapsulated` ships today.) Give each
hosted framework a **per-step boundary driver** so every model/tool/memory call becomes its own
**governed, crash-resumable Temporal activity** — not a black-box run. *This is the keystone:* it makes
hosted frameworks durable + governed at step granularity, and it's what makes Part A's cross-framework
governance real. Build order: `langgraph` + `openai_agents` first (cleanest tool boundary), then
`crewai` (events), then the encapsulated three.

### B.2 Groundbreaking substrate features — each = a built primitive, exposed

These are the moat. Crucially, **most are assemblies of primitives already shipped** — so they're real.

| Feature | Pain point it kills | Built primitive it stands on | Net-new work |
| --- | --- | --- | --- |
| **Time-travel debugging / deterministic replay** | agent runs are non-reproducible black boxes | Temporal deterministic replay + `dpe` eval-context-store (already persists evals for replay) + HMAC audit spine | replay/fork-at-step UX + SDK |
| **Whole-agent simulation ("shadow mode")** | fear of autonomy — can't preview what an agent will *do* before trusting it | GAL simulate-then-commit + diff + DPE Tier-2 replay | a run mode where **every** action is simulated (dry-run/read-back), nothing commits, and you see the full projected action plan + gate verdicts |
| **Governed evals / regression harness** | no CI for agents; behaviour regresses silently across versions | audit spine (real past runs) + eval-context-store + Agent-File versioning | replay a corpus against a new version, diff decisions/actions, **gate deploys on eval pass** |
| **Reversible agents (one-click undo)** | agent mistakes are irreversible | GAL SAGA rollback **(already built)** — "undo everything agent X did in the last hour" | first-class SDK/UX surface |
| **Provenance-native reasoning** | hallucination / unverifiable outputs | provenance graph **(already built)** | every claim links to source; "show provenance" on any output |
| **Insurable autonomy / risk-priced actions** | liability blocks autonomy adoption | Assurance risk engine + coverage **(already built)** | per-agent risk grade + per-action risk price; the substrate an underwriter prices |
| **Durable long-running / event-driven agents** | frameworks can't reliably run for days or wait on external events | Temporal signals + Tier-3 human-pause + workflow durability | agents that sleep for days, wait on webhooks/approvals, **survive deploys** |
| **Self-improving governed flywheel** | agents don't learn from mistakes *safely* | governance-correction flywheel + distillation/outcome-gated optimizer **(built as moats)** | agent improves from its own governed outcomes, human-gated |

**Why this set is a moat and not a feature list:** every item requires the governed action ledger +
durable runtime + simulate/rollback/provenance/risk primitives *together*. A framework can copy an
authoring ergonomic in a weekend; it cannot copy "deterministic replay of a reversible, provable,
risk-priced agent run" without first building the entire governed substrate — and the ledger/actuarial
data compounds, so the gap widens with use.

### B.3 A few more 2026-native swings (grounded, higher-risk)
- **Deterministic tool virtualization** — tools resolved through a governed sandbox where effects are
  previewable and mockable (stands on GAL simulate + the connector adapter seam). Enables reproducible
  evals + safe testing of side-effecting tools.
- **Portable governed memory** — agent memory as a first-class, purpose-bound, provenance-carrying,
  *framework-portable* substrate (the 7 memory adapters + purpose policy already exist). Kills
  "memory is ad-hoc and framework-locked."
- **Cross-org governed action fabric for agents** — an agent can invoke a *peer org's* governed action
  with signed mutual receipts (Phase 5c `actionfabric`, already built) — the "Visa network" for agent
  actions, now exposed to native/framework agents alike.

---

## Part C — The moat thesis, sequencing, and honesty

### C.1 Positioning (the one move that unifies A + B)
**Actrone is the governed agent *runtime*; frameworks are authoring front-ends that run on it; native is
our first-class front-end and the substrate's reference implementation.** We don't ask users to leave
their framework — we make their framework durable, governed, reversible, replayable, and insurable. That
is a category ("governed autonomy runtime"), not a better framework — and it's defensible because the
substrate is hard to build and its data compounds.

### C.2 Build sequencing
1. **G3 stepwise harness drivers** (langgraph + openai_agents first) — the keystone: unlocks per-step
   governance/durability for hosted frameworks *and* the cross-framework governance Part A needs.
2. **Part A `GovernedSystem` + cross-framework governed handoff + shared memory + unified trace** — makes
   "multi-framework in one codebase, all governed" real and demoable.
3. **G1 native graph DSL** + **G2 crew DX** — close the authoring gaps so native competes head-to-head.
4. **Replay/time-travel + whole-agent simulation + governed evals** (B.2) — mostly assembling built
   primitives; the highest-trust developer features.
5. **Insurable autonomy + self-improvement flywheel** — the compounding, category-defining moats.

### C.3 Honesty ledger
- **Already built (exposed, not invented):** GAL simulate + SAGA rollback + signed ledger, provenance
  graph, Assurance risk/coverage, Temporal durability, MACP crew, A2A, `actionfabric`, the DPE
  eval-context-store + sandbox replay, memory adapters.
- **Net-new engineering:** stepwise drivers, `GovernedSystem` authoring + cross-framework handoff,
  native graph DSL, crew DX, replay/simulation/eval *surfaces* (the engines exist; the SDK/UX doesn't).
- **Needs verification before we commit externally:** the native kernel loop's feature completeness for
  graph control-flow; Temporal replay ergonomics for user-facing time-travel; per-framework stepwise
  driver feasibility (each framework's hook fidelity — see the instrumentation plan).
- **Risks:** graph-DSL scope creep (keep it a thin durable-node layer, not a new language); stepwise
  drivers are per-framework effort (sequence, don't boil the ocean); don't let "insurable" outrun the
  actuarial data (it needs the ledger volume first).

### C.4 The one-line test for every feature here
*"Does it require the governed substrate to exist?"* If yes, it's a moat (a framework can't copy it
cheaply). If no, it's table stakes and we should just match it. Everything in Part B.2 passes the test.
