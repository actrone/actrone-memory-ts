# Actrone — Stepwise Framework Expansion Plan (Python breadth · TS depth · TS D3)

> **Goal:** extend per-step **governed, crash-resumable** hosted execution (stepwise) across the
> whole framework matrix. Three waves: **(A)** stepwise drivers for the remaining injectable-model
> **Python** frameworks (LlamaIndex, Pydantic-AI, Semantic Kernel, DSPy, Google ADK, LangChain);
> **(B)** bring the **TS** SDK to full BYOF parity — a hosted harness + stepwise driver; **(C)** wire
> **D3 tool/handoff governance** into the TS framework adapters (currently D2-only).
>
> Status: PLAN. Owner: Matt. Created: 2026-07-05. Inherits `CLAUDE.md`. Companion to `progress.md`.
> Prior art in this repo (the proven pattern): `backend/src/actrone/harness/frameworks/{openai_agents,
> autogen,crewai}.py` + `_common.py`, verified end-to-end against the real SDKs.
>
> **Status refreshed 2026-07-13 (code-verified):** this plan is now largely a **build log** —
> **Wave A is BUILT** (and exceeds its "6 more" scope) and **Wave B is BUILT** (the highest-risk wave,
> originally gated on a prototype spike). Verified on disk:
> - **Wave A — Python breadth: DONE, 13 frameworks total** (`actrone-py/src/actrone/harness/frameworks/`:
>   `agno, autogen, aws_strands, crewai, dspy, google_adk, langchain, llamaindex,
>   microsoft_agent_framework, openai_agents, pydantic_ai, semantic_kernel, smolagents`) — all 6 named
>   in this plan (LangChain, LlamaIndex, Pydantic-AI, Semantic Kernel, DSPy, Google ADK) plus 4 more not
>   originally scoped here (Agno, AWS Strands, Microsoft Agent Framework, and the earlier-shipped
>   OpenAI-Agents/AutoGen/CrewAI trio).
> - **Wave B — TS stepwise: DONE.** `actrone-ts/src/harness/stepwise.ts` now exists (the B1 boundary-
>   propagation problem this plan calls "the central design problem... must be solved before B2 is
>   reliable" has evidently been resolved — the resolution approach was not independently re-verified
>   this pass, only the file's existence and the presence of 6 downstream framework shims). B2 model
>   shims: `actrone-ts/src/harness/frameworks/` has `genkit, langchain, llamaindex, openai-agents,
>   vercel, voltagent` (6 — more than the 3 named here). B3 (harness worker wire-contract parity) not
>   independently re-verified this pass.
> - **Enum parity:** `internal/domain/agent.go` `HostedFrameworks`/`StepwiseFrameworks` list all 21
>   frameworks (13 Python + 6 TS + `langgraph/actrone_sdk/custom/claude_agent_sdk`) with every driver
>   present, and `internal/agent/runtime_test.go` (`TestRuntime_AllHostedFrameworksAcceptStepwise`)
>   regression-guards the parity — a real gap flagged by a 2026-07-06 audit (drivers built, enum
>   omitted 6+4) is closed.
> - **Wave C — TS D3 tool/handoff governance:** **not verified this pass** (this audit's scope was the
>   harness/stepwise layer, not the `actrone-ts/src/adapters/*` D3 wrappers) — treat Wave C's status as
>   it stood before this refresh (unverified 2026-07-13).
> The per-framework risk notes, shim pattern, and testing discipline described below remain accurate
> as the *design rationale* even though the work itself has shipped — kept for onboarding future
> framework additions.

---

## 0. Background — what "stepwise" is and the proven shim pattern

The **stepwise** harness driver (`backend/src/actrone/harness/stepwise.py`) makes a hosted framework
loop crash-resumable by surfacing each model/tool/memory call as its own governed Temporal activity,
using **replay-with-memoization**: the checkpoint is the ordered log of resolved boundary results; on
each step the driver re-runs the author loop, feeding memoized results until the first *unresolved*
boundary, which it raises to the workflow.

Frameworks whose loop is **internal** (not author-controlled) adopt stepwise by making their **model
backend** route each completion through the governed boundary. The proven pattern (3 shims already
shipped + real-SDK verified):

1. A factory `make_<framework>_model(sctx)` that **lazily imports** the framework and subclasses its
   model base class.
2. Its completion method converts inbound framework messages → LoopMessage shape (`_common.
   normalize_loop_messages`), calls `await sctx.model(...)` (or `sctx.model_sync(...)` for sync
   frameworks), and maps the governed result → the framework's native response type (`_common.
   split_boundary` → text + normalised tool calls).
3. **Boundary propagation is durability-critical:** `_BoundarySignal` subclasses `BaseException` so a
   framework's `except Exception` retry/tracing wrapper cannot swallow it.
4. **Pure converters are unit-tested** framework-free; the **factory is `importorskip` integration-
   tested against the real installed SDK** (this is non-negotiable — the CrewAI 1.15.1 build caught a
   real `call(**kwargs)` signature drift the docs missed).

Wave A applies this pattern six more times. Wave B ports the whole mechanism to TS. Wave C is a
different axis (tool/handoff governance, not model durability) on the TS adapters.

---

## Wave A — Stepwise drivers for 6 more Python frameworks

New modules under `backend/src/actrone/harness/frameworks/`, one per framework, each reusing
`_common.py`. All six already have D2/D3 **gateway** adapters in `backend/src/actrone/integrations/`
(`langchain.py`, `llamaindex.py`, `dspy.py`, `google_adk.py`, `semantic_kernel.py`, `pydantic_ai.py`)
— the stepwise driver is the *hosted* counterpart (in-process model hook), distinct from those
gateway adapters.

**Per-framework injection seam (R&D-confirm the exact signature against the installed version at
implementation — do NOT trust docs alone):**

| Framework | Base class to subclass | Completion method (→ convert) | Inject via | Sync/async |
| --- | --- | --- | --- | --- |
| **LangChain** | `langchain_core.language_models.BaseChatModel` | `_agenerate(messages,…) -> ChatResult` (+ `_generate`) | `Agent`/`Runnable(llm=…)` | async (+ sync) |
| **LlamaIndex** | `llama_index.core.llms.CustomLLM` / `LLM` | `achat(messages) -> ChatResponse` (+ `chat`, `complete`) | `Settings.llm` / agent `llm=` | async (+ sync) |
| **Pydantic-AI** | `pydantic_ai.models.Model` | `request(messages,…) -> ModelResponse` | `Agent(model=…)` | async |
| **Semantic Kernel** | `…connectors.ai.chat_completion_client_base.ChatCompletionClientBase` | `get_chat_message_contents(…) -> list[ChatMessageContent]` | kernel service registration | async |
| **DSPy** | `dspy.LM` | `__call__(prompt=…, messages=…) -> list[str]` | `dspy.configure(lm=…)` | sync (use `sctx.model_sync`) |
| **Google ADK** | `google.adk.models.BaseLlm` | `generate_content_async(request) -> AsyncGenerator[LlmResponse]` | `Agent(model=…)` | async (streaming) |

**Notes / per-framework risks (call these out in each PR):**
- **DSPy** is sync (like CrewAI) → route through `sctx.model_sync`; DSPy returns `list[str]` completions
  (no native tool-call channel by default) → return the assistant text; tool use is DSPi-module-driven.
- **Google ADK** yields an async generator of `LlmResponse` — the shim yields a single terminal
  `LlmResponse` built from the governed result (non-streamed boundary), mirroring the AutoGen
  `create_stream` approach.
- **Semantic Kernel** returns a *list* of `ChatMessageContent` (roles/items incl. `FunctionCallContent`)
  → map governed tool calls to `FunctionCallContent`, text to a `ChatMessageContent`.
- **LangChain / LlamaIndex / Pydantic-AI** have first-class tool-call channels → map `split_boundary`
  tool calls into the framework's tool-call representation so the framework's own loop continues.
- **Tool governance boundary:** these shims govern the **model turn** (the durable boundary). If the
  author wants governed *tool execution* too, tools route separately through `sctx.tool` (as today) —
  the model shim does not silently execute tools.

**Deliverables (per framework):** `frameworks/<name>.py` (`make_<name>_model(sctx)`), reuse
`_common`; unit tests for any framework-specific inbound converter (duck-typed, framework-free);
`importorskip` integration test in `tests/integration/test_harness_frameworks_integration.py` that
drives a real minimal agent through the real `StepwiseDriver`; add the module to the coverage-omit +
mypy-`ignore_errors` lists (like the existing three); `pyproject` optional extras (`actrone[langchain]`
etc.) if not already present.

**Done-when (per framework):** pure converters unit-green; the real-SDK integration test passes (step
1 surfaces a `model_request` boundary, replay completes); ruff + the harness mypy pass.

**Sequencing (by ecosystem demand + ease):** LangChain → LlamaIndex → Pydantic-AI → Google ADK →
Semantic Kernel → DSPy. LangChain first (largest surface, first-class tool channel, exercises the
converters hardest); DSPy last (sync + no tool channel — reuses the CrewAI path).

---

## Wave B — TS SDK hosted harness + stepwise driver

Today `actrone-ts/src/harness/` ships the **encapsulated** driver only (`activity.ts`, `context.ts`,
`encapsulated.ts`, `loader.ts`, `protocol.ts`, `worker.ts` — no `stepwise.ts`). Bring it to parity
with the Python harness.

### B1 — Port the stepwise driver
- **Deliverable:** `src/harness/stepwise.ts` — `StepwiseContext` (the durable boundary API:
  `model`/`modelSync`-equivalent, `tool`, `memoryRetrieve`, `memoryWrite`, `approval`) + `StepwiseDriver`
  (replay-with-memoization over the resolved-boundary log), mirroring `stepwise.py`, against the same
  wire contract (`protocol.ts` `RunFrameworkStepInput/Result`).
- **THE central design problem — boundary propagation without `BaseException`:** JS `catch (e)` catches
  *everything*, so a framework's internal `try/catch` around its model call will swallow a thrown
  boundary signal — the exact failure `BaseException` prevents in Python. **This must be solved before
  B2 is reliable.** Options, in preference order:
  1. **Branded non-Error signal + escape check:** throw a unique `Symbol`-branded object (not an
     `Error`), and have the driver treat "loop returned normally but a boundary is still pending"
     (tracked on the context) as the unwind trigger — so even a swallowed throw is recovered on the
     next `sctx.model` call, which short-circuits. Robust to `catch`; needs the context to carry a
     "pending boundary" latch.
  2. **AbortController + sentinel:** the boundary aborts the run via an `AbortSignal` the driver owns;
     frameworks that honour abort unwind cleanly.
  3. **Author-controlled-loop only (fallback):** support stepwise for author loops (the Vercel AI SDK
     `experimental` loop, LangGraph.js) where the author calls `await sctx.model()` directly, and keep
     internal-loop frameworks on the encapsulated driver until (1) is proven.
  → **Decision to make in B1:** prototype option 1 against a real framework and only then commit. This
     risk is why TS stepwise is its own wave, not a footnote.
- **Tests:** port the Python stepwise unit suite (boundary surfaces, replay, crash-resume,
  `except`-survival) to `vitest`.

### B2 — Per-framework TS model shims (over the injectable seams)
Mirror the Python shims for the injectable-model JS frameworks that already have D2 adapters:
`make_openai_agents_model` (`@openai/agents` custom `Model`), `make_vercel_model` (Vercel AI SDK
`LanguageModelV1` provider), `make_mastra_model` (`@mastra/core` model). Each routes completions
through the ported `StepwiseContext`; reuse a TS `_common` (message-normalise + boundary-split).
Real-SDK integration tests (vitest, optional-peer-dep guarded) per framework.

### B3 — Harness worker + wire contract parity
- Ensure `src/harness/worker.ts` + `activity.ts` register a `runFrameworkStep` activity for the
  stepwise strategy (the Go workflow dispatches strategy=`stepwise` identically for Python/TS pools).
- The BYOF worker-pool image (`harness-pool` chart) gains a TS runtime variant (or the pool selects a
  Node entrypoint by manifest `spec.runtime.language`).

**Done-when:** the ported stepwise unit suite is green; at least one JS framework (recommend Vercel AI
SDK — simplest injectable model) passes a real-SDK stepwise integration test; the harness worker runs a
`stepwise` step end-to-end against a local orchestrator contract mock.

---

## Wave C — D3 tool/handoff governance in the TS adapters

The five TS adapters (`cursor`, `mastra`, `openai-agents`, `vercel-ai`, + `tools`/`gateway`) are **D2
today** (governed inference: MAL → DPE → routing → audit through the gateway). **D3** = route each
framework's **tool execution + handoffs** through the governed **Tool-Call Supervisor + DPE + Ed25519
trust**. The attach points are already documented per adapter (`src/adapters/index.ts` header;
`cursor.ts` "gate side-effects"; `mastra.ts` "tools + workflow steps through the Tool-Call
Supervisor"; `openai-agents.ts` "guardrails map onto DPE evaluators").

### C0 — Shared D3 client surface
- The TS client already exposes `authorizeTool` + `callTool` (`src/client.ts`) — the governed
  supervise/execute seam. C0 packages a reusable `governTool(client, spec)` wrapper (mirrors the
  Python `integrations/_local.govern_local_tool`) that: authorises via DPE → executes (or blocks with a
  governance reason fed back) → audits. New `src/adapters/_govern.ts`.

### C1–Cn — Per-adapter D3 wiring
| Adapter | D3 wiring | Governed surface |
| --- | --- | --- |
| **vercel-ai** | wrap `tools` passed to `generateText`/`streamText` so each tool `execute` routes through `governTool` | tool-call supervision |
| **openai-agents** | map the SDK's **guardrails** onto DPE evaluators; wrap `tool` definitions through `governTool`; route **handoffs** through Ed25519 delegation (`authorizeTool` + trust) | tools + guardrails + handoffs |
| **mastra** | wrap Mastra **tools** and **workflow steps** through `governTool`; agent handoffs → trust | tools + workflow steps + handoffs |
| **cursor** | gate side-effecting actions (PR creation, shell) behind `governTool` (simulate-then-commit where GAL applies) | side-effect gating |

**Deliverables:** `_govern.ts` + per-adapter D3 wrappers (type-only against the framework, peer-dep
optional — nothing imported at runtime, consistent with the existing D2 adapters); vitest for the
governed path (authorise→execute, block-with-reason, audit emitted) with a mocked client.

**Done-when:** each adapter's tools/handoffs demonstrably route through `authorizeTool`/`callTool`
(mocked) with a block path tested; the adapter JSDoc "D3 (later)" notes flip to "D3: implemented."

---

## Cross-cutting: parity, tests, docs

- **Parity note:** stepwise/harness is a **BYOF-hosting** capability, not a *client* surface, so it
  does **not** trigger the client-parity rule (now **TS + Python**, Go removed). Wave A/B intentionally
  make **Python ⊃ TS** for hosting. **Nothing here is built for Go** — the Go SDK is removed from the
  matrix entirely (see the Go SDK Removal Plan). See [[sdk-locations]] for the capability tiering.
- **Testing discipline (non-negotiable):** every framework shim ships a **real-SDK integration test**;
  docs are never trusted over the installed API (the CrewAI signature drift is the standing lesson).
- **Docs:** update each SDK's README + the framework matrix; record completions in `progress.md`.

## Sequencing & effort

1. **Wave A** (Python breadth) — highest value, lowest risk (proven pattern × 6). Ship incrementally.
2. **Wave C** (TS D3) — medium; unblocks "fully governed" for the existing TS adapters; independent of B.
3. **Wave B** (TS stepwise) — highest risk (the JS boundary-propagation problem); do the B1 prototype
   spike first and let its result gate the rest. B and C are independent; C can land while B1 de-risks.

## Non-goals & risks
- **Non-goals:** rewriting the frameworks' loops; a universal model-shim abstraction (each framework's
  types differ enough that per-framework shims + shared `_common` converters is the right factoring).
- **Risks:** (a) API drift → mitigated by real-SDK integration tests pinned to a verified version;
  (b) the JS boundary-propagation problem (Wave B) → de-risked by the B1 spike before committing B2;
  (c) sync frameworks (DSPy) with no tool channel → reuse the CrewAI text path; (d) coverage/mypy noise
  from framework-bound modules → reuse the existing omit/ignore lists.
