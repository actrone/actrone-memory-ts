# Actrone — Framework Adapter Expansion Plan (MS Agent Framework · Claude Agent SDK · TS frameworks)

> **Goal.** Extend Actrone's governed BYOF surface to the frameworks that closed the 2026 adoption gap:
> **Microsoft Agent Framework 1.0** (Python), **Claude Agent SDK** (Python + TS), and the missing
> **TypeScript** frameworks **LlamaIndex.TS, Firebase Genkit, VoltAgent**. Every addition is wired at
> *all* the integration layers that apply to its architecture — not a single adapter — so each new
> framework reaches full parity with the closest existing one (governed model egress + tool governance
> + durability where the model is injectable + the framework enum + memory + docs + tests).
>
> Owner: Matt. Status: PLAN (not yet built). Standing rule: prod-grade + tests at every layer; no commit.

> **Status refreshed 2026-07-13 (code-verified): THIS PLAN IS BUILT, not "PLAN (not yet built)."**
> All three phases verified directly in the code:
> - **Phase 1 (MS Agent Framework):** `actrone-py/pyproject.toml` has the `microsoft_agent_framework`
>   extra; `actrone-py/src/actrone/integrations/microsoft_agent_framework.py` (L2) and
>   `actrone-py/src/actrone/harness/frameworks/microsoft_agent_framework.py` (L3) both exist;
>   `"microsoft_agent_framework"` is in **both** `HostedFrameworks` and `StepwiseFrameworks`
>   (`backend/orchestrator/internal/domain/agent.go:161-163,201-203`).
> - **Phase 2 (TS frameworks):** `actrone-ts/src/adapters/{llamaindex,genkit,voltagent}.ts` (L2) and
>   `actrone-ts/src/harness/frameworks/{llamaindex,genkit,voltagent}.ts` (L3) all exist; `"genkit"` and
>   `"voltagent"` are in the backend enum alongside the pre-existing `"llamaindex"`.
> - **Phase 3 (Claude Agent SDK):** `actrone-py/src/actrone/integrations/claude_agent_sdk.py` (173
>   lines) and `actrone-ts/src/adapters/claude-agent-sdk.ts` (137 lines) both implement exactly the
>   `PreToolUse`-hook → Supervisor-verdict → `{permissionDecision, permissionDecisionReason}` bridge
>   this doc specifies in §4.2(a); `"claude_agent_sdk"` is in `HostedFrameworks` **only** (confirmed
>   absent from `StepwiseFrameworks`), matching §4's encapsulated-only design exactly.
>
> **The §5 "PRE-EXISTING GAP" this doc itself flags (the 6-driver enum-sync gap from the 2026-07-06
> audit) is CLOSED** — every driver named there (langchain, llamaindex, pydantic_ai, semantic_kernel,
> dspy, google_adk, plus the TS vercel/mastra shims) is now present in both
> `HostedFrameworks`/`StepwiseFrameworks`, and `parser.go` validates against them.
>
> **One correction to §4.5's own numbers:** it says "Python `actrone_memory/integrations/` has 7
> ... TS `adapters.ts` has 4." Current counts are materially higher: Python has **16**
> (`actrone-memory-py/src/actrone_memory/integrations/`: agno, autogen, aws_strands,
> claude_agent_sdk, crewai, dspy, google_adk, haystack, langchain, langgraph, llamaindex,
> microsoft_agent_framework, openai_agents, pydantic_ai, semantic_kernel, smolagents — pyproject
> extras confirm the same 16), and TS has **13** adapter functions in `adapters.ts` (the 4 named plus
> openaiAgentsMemory, genkitMemory, voltagentMemory, cloudflareAgentsMemory, inngestAgentKitMemory,
> claudeAgentMemory, langchainChatHistory, llamaindexChatMemory). This plan's own §6 acceptance
> criteria are satisfied for all three phases. For the authoritative, currently-accurate framework
> matrix, defer to `Actrone_Framework_Adapter_Parity_Plan.md` (updated 2026-07-11), which supersedes
> this doc's status (not its historical design rationale, which still holds).

---

## 0. The framework-integration surface (the "adapter" is a 7-layer stack)

Adding a framework means touching each layer **that its architecture supports** (existing frameworks
already vary — see the matrix in §1):

| # | Layer | Python location | TS location | Applies when |
| --- | --- | --- | --- | --- |
| L1 | **BYOF dependency extra** | `actrone-py/pyproject.toml` `[optional-dependencies]` + `all` | `actrone-ts/package.json` `peerDependencies*` (optional) | always |
| L2 | **D2 governed integration helper** (`governed_llm()`/`governed_model()` → gateway) | `src/actrone/integrations/<fw>.py` | `src/adapters/<fw>.ts` | always (author-controlled path) |
| L3 | **Harness stepwise driver** (`make_*_model` → `sctx.model`, per-turn durable) | `src/actrone/harness/frameworks/<fw>.py` + `__init__.py` | `src/harness/frameworks/<fw>.ts` + `index.ts` | **only injectable-model frameworks** |
| L4 | **Backend framework enum** (`HostedFrameworks`, `StepwiseFrameworks`, parser) | `backend/orchestrator/internal/domain/agent.go` (+ `parser.go`, `governed_system.go`) | — (language-agnostic string) | always |
| L5 | **Memory adapter** (governed store/context provider — bridges L1/L2 to the framework's memory interface) | `actrone-memory-py/src/actrone_memory/integrations/<fw>.py` (+ extra) — 7 today | `actrone-memory-ts/src/adapters.ts` `<fw>Memory(mm, ref)` — 4 today | only if the framework has a memory/store interface |
| L6 | **Docs + marketing** framework lists | `docs/` + marketing site | dual-language | always |
| L7 | **Tests** (framework-free unit tests per layer + enum + integration) | per package | per package | always |

**Governance is constant across all frameworks** regardless of layers: model turns route through the
governed gateway (metered · routed · semantic-cache/cost-moat · DPE-able) and tool calls through the
**Tool-Call Supervisor** (`allowed_tools` · rate · spend · injection/SSRF · MCP/A2A/connector · audit).
Durability is **per-turn** for L3 frameworks and **task-level (encapsulated)** for the rest — both valid.

---

## 1. Parity matrix — which layers each new framework needs

| Framework | Lang | Architecture | L1 extra | L2 helper | L3 stepwise | L4 enum | L5 memory | Mirrors existing |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **MS Agent Framework 1.0** | Py | injectable `ChatClient` | ✅ | ✅ | ✅ (per-turn) | Hosted + **Stepwise** | ◐ context-provider | `semantic_kernel` |
| **Claude Agent SDK** | Py + TS | self-contained runtime (hooks + MCP) | ✅ | ✅ *(hooks+MCP+gateway bridge, not a model shim)* | ❌ (encapsulated) | Hosted only | via MCP (existing `actrone-memory` server) | `llamaindex`/`dspy` shape + a new bridge |
| **LlamaIndex.TS** | TS | injectable LLM / Workflows | ✅ | ✅ | ✅ (per-turn) | `llamaindex` already in enum | ◐ chat store | Py `llamaindex` (TS side) |
| **Firebase Genkit** | TS | model-plugin, flows | ✅ | ✅ | ✅ (per-turn) | add `genkit` | — | `vercel` shim |
| **VoltAgent** | TS | injectable providers, own loop | ✅ | ✅ | ✅ (per-turn) | add `voltagent` | ◐ memory | `openai-agents` shim |

◐ = do only if the framework's store interface is clean; otherwise memory is available via the
`actrone-memory` MCP server / the governed gateway, so it is never a blocker.

---

## 2. Phase 1 — Microsoft Agent Framework 1.0 (Python) — the fast, clean add

MAF (GA Apr 2026, Python + .NET; the AutoGen + Semantic Kernel convergence) is built on an injectable
`ChatClient`, so it is a near-copy of the existing `semantic_kernel` driver. **.NET is out of scope**
(no .NET SDK in the family). Tasks:

1. **L1** — add extra to `actrone-py/pyproject.toml`:
   `microsoft-agent-framework = ["agent-framework>=1,<2", "openai>=1.40,<2"]`; add to `all`.
2. **L2** — `integrations/microsoft_agent_framework.py`: `governed_chat_client()` returning a MAF
   `ChatClient` whose completions target the governed gateway (mirror `integrations/semantic_kernel.py`).
   Optionally register an Actrone **middleware** (DPE/compliance filter) in the MAF middleware pipeline.
3. **L3** — `harness/frameworks/microsoft_agent_framework.py`: `make_agent_framework_client(sctx)` — a
   governed `ChatClient` (implements `get_response`/`get_streaming_response`) that converts MAF messages
   ↔ LoopMessages and routes each turn through `sctx.model`; export from `frameworks/__init__.py`. Wire
   into `harness/stepwise_adapter.py` (`as_stepwise_entrypoint`) alongside the other injectable drivers.
4. **L4** — add `"microsoft_agent_framework"` to `HostedFrameworks` **and** `StepwiseFrameworks`
   (`agent.go`); confirm `parser.go` + `governed_system.go` accept it.
5. **L5** — (stretch) governed `ContextProvider` for MAF memory in `actrone-memory-py`.
6. **L6/L7** — docs + marketing list; framework-free unit tests for the message converter + enum test;
   `mypy --strict` + `pytest` green.

**Benefit:** teams migrating off SK/AutoGen onto the unified MS framework keep per-turn governed +
durable execution with a one-line chat-client swap — no rewrite. Effort: **small** (~2 modules + tests).

---

## 3. Phase 2 — TypeScript frameworks (LlamaIndex.TS · VoltAgent · Genkit)

Each is a governed model shim mirroring an existing TS adapter; do them independently.

**Common per framework:**
1. **L1** — `actrone-ts/package.json`: add the framework package to `peerDependencies` +
   `peerDependenciesMeta` (`optional: true`) — e.g. `llamaindex`, `@voltagent/core`, `genkit`/`@genkit-ai/*`.
2. **L2** — `src/adapters/<fw>.ts`: a governed model/LLM factory pointed at the gateway (mirror
   `adapters/vercel-ai.ts`); export from `adapters/index.ts`.
3. **L3** — `src/harness/frameworks/<fw>.ts`: `make<Fw>Model(sctx)` stepwise shim (structural, no runtime
   framework import — mirror `frameworks/vercel.ts`/`openai-agents.ts`); export from `frameworks/index.ts`.
4. **L4** — backend enum (`agent.go`): `llamaindex` is already present (language-agnostic name, covers
   TS); **add `"genkit"` and `"voltagent"`** to `HostedFrameworks` + `StepwiseFrameworks`.
5. **L5** — governed memory adapter in `actrone-memory-ts` where the framework has a clean store
   (LlamaIndex.TS chat store, VoltAgent memory) — else defer.
6. **L6/L7** — docs + marketing (dual-language); framework-free unit tests for the converters; `tsc` +
   `vitest` + `eslint` clean.

**Per-framework notes:**
- **LlamaIndex.TS** — mirror the Python `llamaindex` integration; its Workflows loop is author-controlled
  (call `sctx.model` directly) while its agent LLM is injectable (stepwise). Best for RAG/data agents.
- **VoltAgent** — injectable provider + own loop → `openai-agents`-style shim; observability-first users.
- **Genkit** — model-plugin architecture → `vercel`-style shim; Google/Firebase shops.

**Benefit:** closes the TS second-tier gap so a JS team on any of the top frameworks gets the same
governed + durable execution as our Python users. Effort: **small each** (~1 adapter + 1 shim + tests).

---

## 4. Phase 3 — Claude Agent SDK (Python + TS) — the deeper governed-hooks integration

The Claude Agent SDK is a **self-contained runtime** (owns its loop, tools — bash/file/computer-use/MCP —
and the Claude model), so it is **not** a `make_*_model` shim and gets **no L3 stepwise driver**; it runs
**encapsulated** (task-level durable, like `llamaindex`/`dspy`) with a new governed bridge. It is the
highest strategic value (governed autonomy on the flagship, #2-ranked runtime) and lands in both SDKs.

1. **L1** — Py extra `claude-agent-sdk = ["claude-agent-sdk>=0.1,<1"]` + `all`; TS optional peerDep
   `@anthropic-ai/claude-agent-sdk`.
2. **L2 (governed bridge, not a model helper)** — `integrations/claude_agent_sdk.py` +
   `adapters/claude-agent-sdk.ts` exposing `governed_options()` / `GovernedClaudeAgent` that wire:
   - **(a) Tool governance via hooks** — a `PreToolUse` hook / `can_use_tool` callback → the Tool-Call
     Supervisor + DPE. Map the Supervisor decision 1:1 to the SDK's
     `{permissionDecision: allow|deny|ask, permissionDecisionReason, updatedInput}` — so every tool call
     is governed pre-execution with policy-driven **input mutation** (redact/scope). `PostToolUse` →
     attach signed provenance to the audit ledger.
   - **(b) Governed tools + memory via MCP** — register Actrone's **in-process MCP server** (governed
     builtins + connectors + the existing `actrone-memory` L1/L2 server) so the agent's tools are
     `mcp__actrone__*` governed tools.
   - **(c) Model routing** — set `ANTHROPIC_BASE_URL` to the governed gateway → metering, routing,
     semantic-cache/cost-moat, DPE-on-output on every Claude turn.
3. **L3** — none (self-contained loop). Runs under the **encapsulated** harness driver in the BYOF pod
   (task-level durability + controlled egress).
4. **L4** — add `"claude_agent_sdk"` to `HostedFrameworks` **only** (NOT `StepwiseFrameworks`); parser +
   `governed_system.go`.
5. **L5** — memory via the existing `actrone-memory` MCP server (no new adapter — just registration).
6. **L6/L7** — docs + marketing (dual-language); **framework-free unit tests for the hooks→Supervisor
   decision mapping** (allow/deny/updatedInput), the MCP registration, and the gateway env; the pure
   decision bridge is fully testable without the SDK installed.

**Benefit:** teams on Anthropic's most autonomous runtime get Actrone's full moat — DPE on tools *and*
model, signed audit ledger, cost moat, persistent governed memory — without leaving the Claude Agent
SDK. De-risks exactly where autonomy is highest. Effort: **medium** (a hooks bridge + MCP wiring + base-url
plumbing; each reuses an existing surface — no new runtime).

---

## 4.5 Memory adapters (`actrone-memory-py` / `actrone-memory-ts`) — L5, per framework

The memory libraries already ship a first-class per-framework adapter layer: **Python `actrone_memory/
integrations/`** has 7 (langchain, langgraph, crewai, autogen, llamaindex, haystack, dspy) + matching
extras; **TS `adapters.ts`** has 4 (`vercelMemory`, `langchainMemory`, `langgraphMemory`, `mastraMemory`)
over a framework-agnostic `recall`/`remember`/`memoryFor` core. Adapters are **structural** (nothing
imported at runtime — frameworks stay optional peer deps), so each new one is a small, self-contained add
that bridges the governed L1/L2 store to the framework's memory interface. Tasks:

- **MS Agent Framework** → `actrone_memory/integrations/microsoft_agent_framework.py`: a governed
  `ContextProvider` / chat-message store (MAF has a context-provider memory abstraction) + a
  `microsoft-agent-framework` extra + `all`.
- **LlamaIndex.TS** → `adapters.ts` `llamaindexMemory(mm, ref)` (chat store / memory buffer). *(Python
  `llamaindex` memory adapter already exists.)*
- **VoltAgent** → `adapters.ts` `voltMemory(mm, ref)` (its `Memory` provider interface).
- **Genkit** → `adapters.ts` `genkitMemory(mm, ref)` if its session/state memory hook is clean; else the
  generic `memoryFor` core already covers it (recall-before / remember-after).
- **Claude Agent SDK** → **no memory-lib adapter needed** — the agent consumes the existing
  `actrone-memory` **MCP server** as a tool (`mcp__actrone__memory_*`); the L5 work here is MCP
  registration, done in §4.
- **Close TS memory parity while here** — TS is behind Python (4 vs 7). Where a JS equivalent exists,
  add the missing wrappers (e.g. the new TS frameworks above); Python-only frameworks (crewai/autogen/dspy)
  have no TS counterpart, so full numeric parity is not the target.

Each memory adapter ships with framework-free unit tests (the core `recall`/`remember` is already tested;
the wrapper just asserts the framework-shaped return). Same governance + store — no new backend.

## 5. Cross-cutting (do once, spanning all frameworks)

- **BYOF harness image** — ensure the harness Dockerfile installs the new extras for the hosted worker
  (or a per-framework image variant), consistent with the existing `actrone[<fw>]` matrix.
- **Framework enum single-sourcing** — `HostedFrameworks`/`StepwiseFrameworks` in `agent.go:129-143` are
  the one authoritative list; the parser + governed-system validator read them. Add each new name there once.
  > ⚠️ **PRE-EXISTING GAP found by the 2026-07-06 deep audit:** the *current* stepwise drivers are already
  > out of sync with this enum — 6 built Python drivers (langchain, llamaindex, pydantic_ai, semantic_kernel,
  > dspy, google_adk) + the TS vercel/mastra shims exist and are exported, but are **NOT** in
  > `HostedFrameworks`/`StepwiseFrameworks`, so `parser.go` rejects a `byof_hosted` agent-file that declares
  > them. Fix this enum sync as **Phase 0** (a few lines) before adding the new frameworks — it un-gates
  > already-written code and is the template for every L4 step here.
- **Contract/parity** — CLAUDE.md parity rule applies *per language a framework exists in*: MAF = Python
  only (no JS); Claude Agent SDK = Python + TS (build both); the three TS frameworks = TS only.
- **Docs + marketing** — the "supported frameworks" lists (site + docs) are dual-language; update both,
  and note the durability tier (per-turn vs encapsulated) so the promise is honest.

---

## 6. Rollout order, acceptance, effort

**Order:** (1) MS Agent Framework → (2) TS frameworks (LlamaIndex.TS, VoltAgent, Genkit) → (3) Claude
Agent SDK. Rationale: 1 and 2 are fast shims that mirror existing code; 3 is the deeper bridge.

**Acceptance criteria (per framework):**
- [ ] L1 extra installs cleanly; `all` updated.
- [ ] L2 helper points model egress at the gateway (a metered turn is recorded).
- [ ] L3 (where applicable) crash-resume test proves per-turn durability; N/A frameworks run encapsulated.
- [ ] L4 enum registered; parser accepts a `byof_hosted` agent-file for it; `GovernedSystem` validates it.
- [ ] Tool calls are governed by the Supervisor (denied tool → blocked/observation, not silent).
- [ ] L5 memory round-trips where an adapter was added.
- [ ] L6 docs + marketing lists updated (dual-language, with durability tier).
- [ ] L7 all unit tests framework-free + green; `mypy --strict`/`tsc`/`eslint` clean; `go build`+`vet` green.

**Effort estimate:** Phase 1 ~small; Phase 2 ~small each (×3); Phase 3 ~medium. No infra/live-IdP
dependencies — all buildable + testable in-repo (framework-free converter/bridge unit tests; the live
framework only needed for optional end-to-end smoke, gated like the other BYOF extras).

## 7. Out of scope

- **.NET** MS Agent Framework (no .NET SDK in the family).
- Second-tier frameworks with no 2026 top-tier adoption (Agno/Phidata, smolagents, Haystack-TS, Strands,
  Letta) — revisit if demand appears.
- Streaming through the stepwise boundary (unchanged: stepwise governs non-streaming `get_response`;
  streaming runs encapsulated).
</content>
