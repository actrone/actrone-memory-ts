# Actrone SDK-Native vs Frameworks — feature-by-feature audit

> **Status refreshed 2026-07-13 (code-verified):** gap #3 below ("stepwise harness drivers... so hosted
> frameworks get per-step governed activities, not just encapsulated runs") is now **largely closed**.
> `actrone-py/src/actrone/harness/frameworks/` ships **13** per-framework stepwise model-shim drivers
> (`agno, autogen, aws_strands, crewai, dspy, google_adk, langchain, llamaindex,
> microsoft_agent_framework, openai_agents, pydantic_ai, semantic_kernel, smolagents`), and
> `actrone-ts/src/harness/stepwise.ts` now exists (TS stepwise core, previously absent) with **6** TS
> framework shims (`genkit, langchain, llamaindex, openai-agents, vercel, voltagent`). The
> `HostedFrameworks`/`StepwiseFrameworks` enum (`internal/domain/agent.go`) has a matching entry for
> every driver — a prior enum/driver mismatch (from a 2026-07-06 audit) is fixed and now
> regression-tested (`internal/agent/runtime_test.go` `TestRuntime_AllHostedFrameworksAcceptStepwise`).
> So the feature matrix below should read: for every framework listed, **Stepwise durability is now ✅
> for LangGraph, CrewAI, AutoGen, and OpenAI Agents SDK** (not "flagship LangGraph-only" as originally
> scoped) — see `Actrone_Stepwise_Framework_Expansion_Plan.md` for the full build record. Gap #1 (native
> graph/branching authoring) and gap #2 (crew authoring DX) are **unverified 2026-07-13** by this pass —
> not covered by this audit's code-reading scope.
>
> Honest capability comparison of the **native** Actrone durable governed loop (`actrone_sdk`) against
> the frameworks we support as BYOF (LangGraph, CrewAI, AutoGen, OpenAI Agents SDK). Grounded in the
> actual native runtime: `internal/workflow/task_workflow.go` (the Temporal agentic loop),
> `internal/dpe`, `internal/gal`, `internal/mal`, `internal/mediaguard`, `internal/macp` (crew),
> `internal/domain/agent.go`. Purpose: know precisely when native suffices and when a framework earns
> its place — so we can guide users truthfully.

---

## The native loop, as it actually runs (`AgentTaskWorkflow`)

A single durable Temporal workflow, each stage a crash-resumable Activity:

`MAL tokenise input` → `validate Agent-File` → `MediaGuard (PII in media)` → `retrieve memory (L1 Redis
+ L2 Qdrant)` → `route model` → `DPE pre-check (Tier-1 capability / Tier-2 rules / Tier-3 human
approval)` → **`durable governed agentic loop` (model → governed tool → observe → iterate; GAL runs on
writes; tools = builtin/A2A/connector/MCP)** → `write-back to memory` → `HMAC-chained audit spine` →
`audit governance` → `metrics` → `MAL detokenise final output only`.

Every tool call inside the loop passes the supervisor pipeline (DPE Tier-1 → allow-list → rate/spend →
injection/SSRF → dispatch), and every write passes GAL (detokenise → simulate → gate → commit →
signed receipt). This is the substrate a framework agent does **not** get unless it runs on Actrone.

---

## Feature matrix

Legend: ✅ built-in · ➖ possible but you build/wire it · ❌ not native to it · **bold** = decisive edge.

| Capability | Actrone native | LangGraph | CrewAI | AutoGen | OpenAI Agents SDK |
| --- | --- | --- | --- | --- | --- |
| **Orchestration model** | tool-calling agentic loop + role-based crew | **graph/state-machine (cycles, branches, sub-graphs)** | role/delegation crew | conversational multi-agent | handoff-based |
| **Arbitrary control-flow graphs** | ➖ (loop + crew, not a free graph) | **✅** | ❌ | ➖ | ➖ |
| **Durability / crash-resume** | **✅ Temporal — resumes on any worker mid-run** | ➖ (checkpointer you host) | ❌ ephemeral | ❌ ephemeral | ❌ ephemeral |
| **State management** | ✅ durable workflow state + memory | ✅ checkpointed | ➖ | ➖ event-ish | ➖ |
| **Data governance (PII boundary)** | **✅ MAL tokenise/detokenise + MediaGuard** | ❌ | ❌ | ❌ | ❌ |
| **Action governance (writes)** | **✅ GAL: simulate→gate→commit→reversible→signed receipt** | ❌ | ❌ | ❌ | ❌ |
| **Policy engine** | **✅ DPE Tier-1/2/3 (capability, threshold rules, human approval)** | ❌ | ❌ | ❌ | ➖ guardrails |
| **Tamper-evident audit** | **✅ HMAC-chained audit spine + action ledger** | ❌ | ❌ | ❌ | ❌ |
| **Human-in-the-loop** | ✅ built-in Tier-3 pause / GAL approval queue | ✅ interrupts | ➖ | ➖ | ➖ |
| **Integrated memory** | **✅ L1 Redis + L2 Qdrant, retrieve + write-back** | ➖ (bring a store) | ➖ | ➖ | ➖ |
| **Multi-agent** | ✅ MACP crew: sequential / hierarchical / parallel + shared memory | ➖ (sub-graphs) | **✅ role/delegation ergonomics** | **✅ conversation** | ✅ handoffs |
| **Model routing / fallback / BYOK** | **✅ built-in RouteModel (multi-provider, fallback, cost)** | ➖ | ➖ | ➖ | ❌ (OpenAI-centric) |
| **Tool ecosystem** | ✅ connectors + MCP + A2A + builtin (all governed) | ✅ large LangChain ecosystem | ✅ | ✅ | ✅ |
| **Cross-org / cross-agent protocol** | **✅ A2A (cross-org, signed) + MACP (intra-org mesh)** | ➖ via A2A adapter | ➖ | ➖ | ➖ |
| **Observability** | ✅ metrics + trace + governance ledger (native) | ➖ OTel/LangSmith | ➖ OTel | ➖ OTel | ✅ tracing |
| **Orchestration ergonomics / DX** | ✅ good for the common shape | **✅ best for complex flows** | **✅ best for crews** | ✅ | ✅ clean handoffs |
| **Community / examples** | ➖ (ours) | **✅ largest** | ✅ large | ✅ | ✅ growing |
| **Language** | Go/TS/Python SDK | Python/JS | Python | Python/.NET | Python |

---

## Verdicts by dimension

**Native wins decisively (nothing else has these without becoming Actrone):**
governance (MAL + GAL + DPE + MediaGuard + audit spine), **durability** (Temporal crash-resume vs
ephemeral loops), integrated **memory**, **model routing/BYOK/fallback**, built-in **human approval**,
tamper-evident **audit**, and the **A2A/MACP** protocols. For a *governed, durable, multi-provider*
enterprise agent, native is simply ahead — the frameworks would each need a pile of extra infra to
approach it, and still wouldn't have GAL.

**Frameworks win (why BYOF exists):**
- **LangGraph** — arbitrary **graph control flow** (cycles, conditional branches, sub-graphs,
  deterministic state machines). If your agent's logic is a real graph, native's loop+crew is less
  expressive.
- **CrewAI** — the most ergonomic **role/delegation crew** authoring (though MACP crew covers the same
  execution shapes — see below).
- **AutoGen** — conversational multi-agent patterns.
- **OpenAI Agents SDK** — clean **handoff** ergonomics.
- All four — bigger **community/examples** and Python-first ecosystems.

**Closer than expected — MACP crew:** Actrone's `macp.Crew` already runs **sequential / hierarchical
(manager delegates) / parallel** processes with shared memory — i.e. it natively covers CrewAI's core
*execution* model. The gap vs CrewAI is authoring ergonomics/DX, not capability. The gap vs LangGraph
is real and structural (free-form graphs).

---

## Guidance (truthful)

- **Default to native** for the overwhelmingly common enterprise shape: a governed, durable,
  tool-calling agent (optionally a sequential/hierarchical/parallel crew) that must be provable,
  reversible, and audited. Native gives all of that with zero extra infra.
- **Reach for a framework when** you need (a) **LangGraph** graph control flow, (b) an existing
  framework codebase, or (c) a specific framework's DX/community — and then run it **`byof_hosted`**
  (or connected + egress) so GAL/DPE/MAL/audit still apply and the egress network policy makes it
  non-bypassable.
- **The honest one-liner:** *native is governed-first + durable; frameworks are ergonomics-first.* We do
  not ask users to give up their framework — we make their framework governed.

## Gaps worth closing so "default to native" holds more often
1. A **graph/branching authoring** option in the native SDK (to close the main LangGraph gap).
2. **Crew authoring DX** parity with CrewAI (the execution model already matches).
3. The **stepwise harness drivers** (design §9 P2) so hosted frameworks get per-step governed
   activities, not just encapsulated runs.
