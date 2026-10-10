# Actrone SDKs & Framework Adapters Plan

**Version 1.0 — June 2026 · ✅ LARGELY SHIPPED as Master-Plan P4-C — three SDKs (Go/Python/TS) at platform parity (per-env, gateway client, model-endpoints/BYOK, deployments, env-promotion, reasoning-effort), one global Go `actrone` CLI, and the framework-adapter program (D1 memory · D2 inference · D3 tool/handoff). New-framework adapter breadth continues incrementally. This doc captures the original analysis; authoritative status: [Platform Evolution §0a](./Actrone_Platform_Evolution_Master_Plan.md#0a-implementation-status-verified-2026-06-24).**

> **Status refreshed 2026-07-13 (code-verified) — this entire doc's §1 "current state" table is now
> HISTORICAL, not current.** The "three SDKs (Go/Python/TS)" framing above is stale in one specific
> way: **the Go client SDK was deleted** (`docs/Actrone_Go_SDK_Removal_Plan.md`, code-verified —
> no `actrone-go/` anywhere in the repo). The supported client SDKs are now **TypeScript + Python
> only**. Current verified state: **TypeScript SDK exists and is substantial**
> (`actrone-ts/`, package `@actrone/sdk`, `src/adapters/` has 15 framework-adapter files incl.
> `_govern.ts` now imported by 6 of them, `src/harness/frameworks/` has 6 stepwise driver files) —
> §1.1's "Does not exist" row is obsolete. **Python SDK moved out of `backend/` to top-level
> `actrone-py/`** (`docs/Actrone_Python_SDK_Repo_Extraction_Plan.md`, DONE) and now ships **16**
> framework integrations in `actrone-py/src/actrone/integrations/` (agno, autogen, aws_strands,
> claude_agent_sdk, crewai, dspy, google_adk, haystack, langchain, langgraph, llamaindex,
> microsoft_agent_framework, openai_agents, pydantic_ai, semantic_kernel, smolagents) — not the
> "7" in §1.2/§3 below, and no longer "memory depth only": D2 gateway binds + a unified
> `integrations/_govern.py` (D3) now exist alongside D1. The `HostedFrameworks`/`StepwiseFrameworks`
> enum gap this doc's later sections don't mention is closed (`backend/orchestrator/internal/domain/
> agent.go:157-206`). The Go CLI (`actrone-cli/`) is real, self-contained (no SDK dependency,
> `internal/client/`), and has a full goreleaser + Homebrew/Scoop release pipeline
> (`actrone-cli/.goreleaser.yaml`, `actrone-cli/.github/workflows/release-cli.yml`) — §6.3's plan is
> executed. **For the authoritative current inventory, defer to the four newer, code-grounded docs
> that supersede this one's specifics: `Actrone_Go_SDK_Removal_Plan.md`,
> `Actrone_Python_SDK_Repo_Extraction_Plan.md`, `Actrone_Framework_Adapter_Parity_Plan.md` (updated
> 2026-07-11, most current), and `Actrone_TS_Memory_Parity_Plan.md`.** This doc's remaining value is
> historical rationale (§2 three-depth model, §4 framework rationale) — kept for context, not status.

> The authoritative plan for Actrone's client SDKs (Go, Python, **TypeScript**) and the
> framework-adapter ecosystem. It corrects an earlier mis-statement (the Python SDK + adapters
> **do exist**), defines the **three-depth adapter model** that delivers "full Actrone power,"
> brings every existing adapter to production grade, and adds the new adapters
> (OpenClaw, OpenAI Agents SDK, Cursor SDK, Google ADK, Microsoft Agent Framework / Semantic
> Kernel, Vercel AI SDK, Mastra, Pydantic AI). Ships as **Actrone**; "EMAOP" is a codename.

Related: [EMAOP Models/Extensibility/Channels §3](./Actrone_EMAOP_Models_Extensibility_Channels_Plan.md) · [Master Implementation Plan P4](./Actrone_Master_Implementation_Plan.md) · [Integrations & Capabilities](./Actrone_Integrations_and_Capabilities_Plan.md).

---

## 1. Current state (verified in the codebase)

> **(2026-07-13: the table below is the June-2026 snapshot — HISTORICAL. See the status note at the
> top of this doc for the current inventory: Go SDK deleted, TS SDK built, Python SDK relocated +
> 16 adapters.)**

### 1.1 SDKs that exist (as of June 2026 — superseded, see top-of-doc note)
| SDK | Location | Surface today | Gaps |
|---|---|---|---|
| **Go** | `actrone-go/` | `NewClient` (+ retries, gobreaker, idempotency, X-Request-Id); `RunAgent`, `StreamAgent`, `SubmitTask`, `GetTask`, `CancelTask`, `RegisterAgent`, `GetAgent`, `ListAgents`, `SearchMemory`, `InjectMemory` | No framework adapters; missing `UpdateAgent`/`DeleteAgent`/`DeleteMemory`/session-metadata (parity gap vs Python). *(The global CLI is a separate Go deployable, not part of this library — §6.3.)* |
| **Python** | `backend/src/actrone/` | Full client (`submit_task`, `get_task`, `cancel_task`, `register_agent`, `get_agent`, `list_agents`, `update_agent`, `delete_agent`, `search_memories`, `inject_memory`, `delete_memory`, `get_session_metadata`, `stream_task`); `MarketplaceClient`; `ActroneMemoryManager`; a **Typer CLI** (`validate/login/logout/agent/task/marketplace`) — **to be DELETED, replaced by the global Go CLI (see §6.3)**; **7 framework adapters** | Adapters are **memory-depth only** (see §1.2); no inference/tool governance binding |
| **TypeScript** | — | **Does not exist** | The single biggest SDK gap — the largest agent/app-dev ecosystem is unserved |

Plus `actrone-memory/` — a **separate** Python package (L1 Redis / L2 Qdrant memory manager) with its own integrations (e.g. Haystack). Distinct from the agent SDK; keep it as the memory engine the SDKs' memory adapters can target.

### 1.2 Adapters that exist (Python) — all **memory depth only**
| Framework | Class | What it binds today |
|---|---|---|
| LangChain | `ActroneMemory` | Conversation memory → Actrone memory |
| LangGraph | `ActroneCheckpointer` | Graph-state checkpointer → memory (persists across sessions) |
| CrewAI | `ActroneCrewMemory` | Shared crew memory backend |
| AutoGen | `ActroneAutoGenMemory` | Agent memory store |
| LlamaIndex | `ActroneLlamaMemory` | Memory/index store |
| DSPy | `ActroneRM` | Retrieval model (RM) backed by Actrone memory |
| Haystack | `ActroneRetriever` + `ActroneWriter` | Retriever + writer components |

**The critical limitation:** these give a framework Actrone's *persistent memory* — but the framework still calls the model **directly**, ungoverned. A CrewAI agent with `ActroneCrewMemory` shares memory through Actrone yet its inference never touches MAL/DPE/audit. **Memory ≠ governance.** Closing that is the whole point of §2.

---

## 2. The three-depth adapter model ("full Actrone power")

An adapter can bind a foreign framework to Actrone at three increasing depths. "Full power" = all three.

| Depth | Binds | Mechanism | What Actrone adds | Status |
|---|---|---|---|---|
| **D1 — Memory** | The framework's memory/state/retrieval | Idiomatic drop-in classes (checkpointer, memory backend, retriever) → Orchestrator memory API | Persistent, governed, multi-tenant memory; cross-session continuity | **Shipped (Python ×7)** |
| **D2 — Inference** | The framework's model calls | Point its model client at the **OpenAI-compatible gateway** (base-URL + Actrone key) | MAL tokenisation, DPE policy, per-tenant BYOK/managed routing, savings, audit on **every inference** | **Net-new (gateway = P4)** |
| **D3 — Tool / Governance** | The framework's tool / handoff / action calls | SDK shim routes tool calls through the **Tool-Call Supervisor + DPE**; cross-agent handoffs through **Ed25519 trust** | Capability hard-blocks, injection scan, spend caps, authenticated handoffs, full reasoning-trace audit | **Net-new (per framework)** |

**The gateway (D2) is the universal unlock:** any framework that accepts an OpenAI-compatible base URL gets D2 with ~one line, *regardless of language*. D1 and D3 are framework-idiomatic and live in the SDK of that framework's language. So the realistic target per framework is: **D1 + D2 always; D3 where the framework exposes a tool/handoff hook** (OpenAI Agents SDK, LangGraph, CrewAI, AutoGen, Semantic Kernel, ADK, Mastra, Pydantic AI, Vercel AI SDK all do).

---

## 3. Prod-grade upgrade of the existing 7 adapters

Bring each shipped Python adapter to production grade **and** extend it from D1 to D1+D2(+D3). Per CLAUDE.md (§1.2 Python, §4 errors, §7 testing):

**Cross-cutting (every adapter):**
- **Correctness/completeness of the framework contract.** Several current adapters are partial — e.g. `ActroneCheckpointer.aput` only persists the last two messages and `aget` re-hydrates from a memory search rather than implementing true checkpoint tuples; LangGraph's `BaseCheckpointSaver` contract (`aput`, `aput_writes`, `aget_tuple`, `alist` with `checkpoint_ns`/versions) must be fully and faithfully implemented or graphs lose state. Audit each adapter against its framework's current interface and complete it.
- **Reliability:** every network call inherits the SDK client's retries + backoff + circuit breaker + idempotency + `X-Request-Id`; no bare `except`; structured errors carrying the request id (CLAUDE.md §4.2).
- **Typing & async:** `mypy --strict` clean; all I/O `async`; no blocking calls in async paths; no mutable default args.
- **D2 wiring:** add a governed-inference helper per framework — a one-call `actrone_llm(...)` (or `with_actrone_governance(model)`) that returns the framework's model object pre-pointed at the gateway with the tenant's key + env, so users opt into governed inference idiomatically.
- **D3 wiring (where supported):** map the framework's tool/guardrail/handoff hooks onto the Supervisor + DPE + trust (see §5 per-framework notes).
- **Tests:** table-driven unit tests with the framework mocked; a contract test per adapter that asserts the framework's interface is satisfied; an integration smoke test (testcontainers / recorded) per CLAUDE.md §7. Pin the framework extras (already in `pyproject` optional-deps — keep the bounds current).
- **Docs:** each adapter gets a real, runnable quickstart (mirrors the existing docstrings) surfaced in the BYOF onboarding (the frontend `FrameworkOnboarding` snippets must match the real package APIs — reconcile names).
- **Version pinning & CI:** framework majors move fast (LangGraph, CrewAI, AutoGen pre-1.0). Pin upper bounds, run the adapter test matrix in CI against the pinned versions, and gate upgrades on a green contract test.

---

## 4. New adapters to add (the full set)

Add adapters for every framework named, each at D1+D2 (and D3 where the framework exposes the hook). **Language home** dictates which SDK it lives in — which is what forces the **TypeScript SDK** into existence.

| Framework | Primary language | Target depths | Notes |
|---|---|---|---|
| **OpenAI Agents SDK** | Python **and** TS/JS | D1+D2+D3 | Map its **Guardrails**→DPE, **Handoffs**→A2A Ed25519 trust (it has no native handoff auth — a clean Actrone upgrade), **Sessions**→memory, human-approval→DPE Tier-3 + channels. Flagship. |
| **Cursor SDK** | TypeScript | D2(+D3) | Headless coding agent (`@cursor/sdk`, SSE runs). Govern a Cursor run as a BYOF agent; stream its SSE into the trace viewer; gate side-effects (PR/shell) via capabilities + DPE. |
| **Google ADK** | Python (+ Java later) | D1+D2+D3 | Agent Development Kit; bind tools + sessions; D2 via gateway. |
| **Microsoft Agent Framework / Semantic Kernel** | Python (+ .NET later) | D1+D2+D3 | SK has memory + planners + function-calling → natural D1/D3; D2 via gateway. .NET SDK is a future workstream (see §6). |
| **Vercel AI SDK** | TypeScript | D2(+D3) | `ai` package; a custom provider/middleware pointing at the gateway → governed `generateText`/`streamText`; tool calls → supervisor. Huge Next.js reach. |
| **Mastra** | TypeScript | D1+D2+D3 | TS agent framework with memory + tools + workflows → all three depths. |
| **Pydantic AI** | Python | D1+D2+D3 | Typed agents; bind its model + tools; D2 via gateway. |
| **OpenClaw** | Runtime (config) | D2 + channel/memory bridges | Not an importable library — a local runtime. Integration = point its model endpoint at the gateway (D2) + optional memory bridge (D1) + replace its raw messaging UI with Actrone's **governed channels** (Telegram/WhatsApp/Slack — see Models §4). Framed as a **migration on-ramp**: "OpenClaw, but auditable." |

**Existing (upgrade per §3):** LangChain, LangGraph, CrewAI, AutoGen, LlamaIndex, DSPy, Haystack (Python).

### 4.1 The adapter × language matrix (target)
| Framework | Python | TypeScript | Go |
|---|---|---|---|
| LangChain / LangGraph | ✅ upgrade | ➕ add (LangChain.js / LangGraph.js) | — |
| CrewAI / AutoGen / LlamaIndex / DSPy / Haystack | ✅ upgrade | — (Python-native frameworks) | — |
| Pydantic AI / Google ADK / Semantic Kernel | ➕ add | — | — |
| OpenAI Agents SDK | ➕ add | ➕ add | — |
| Vercel AI SDK / Mastra / Cursor SDK | — | ➕ add | — |
| OpenClaw | bridge | bridge | — |
| **Gateway (D2)** | works for **all** of the above via base-URL, any language | | (Go callers too) |

Go's agent-framework ecosystem is thin (Eino, Genkit-Go) — Go's value is the **client SDK + gateway client**, not framework adapters. Add Go-ecosystem adapters only on demand; Go users mostly consume the gateway + client directly.

---

## 5. Per-framework D3 (tool/governance) notes
- **OpenAI Agents SDK:** input/output/**tool guardrails** → DPE evaluators; **handoffs** (`transfer_to_*` tools) → A2A + Ed25519 trust; **approvals** → DPE Tier-3 + multi-channel.
- **LangGraph:** node/tool interrupts → DPE; `interrupt()`/human-in-the-loop → Tier-3 escalation; checkpointer already D1.
- **CrewAI / AutoGen:** tool registration + agent-to-agent messaging → supervisor + trust.
- **Semantic Kernel / ADK / Pydantic AI / Mastra:** function/tool invocation hooks → supervisor + DPE.
- **Vercel AI SDK:** `tools` + `experimental_` middleware → wrap tool execution through the supervisor.
- All D3 paths reuse the **existing** Tool-Call Supervisor, DPE engine, trust package, and audit spine — adapters are thin shims, not new governance.

> **Execution locus matters as much as depth.** D1/D2/D3 describe *what* an adapter binds; the **[Execution Model & BYOF Durability Plan](./Actrone_Execution_Model_and_BYOF_Durability_Plan.md)** describes *where the loop runs* — **connected** (your process; gets memory + governed/cached inference + D3 tools) vs **hosted** (deploy to Actrone; adds Temporal durability + full supervision) vs **native**. Temporal-grade durability is only achievable when Actrone runs the loop (hosted/native) — that hosted-durable runtime is the flagship paid differentiator.

---

## 6. Client SDKs — bringing Go · Python · TS to platform parity

Three first-class client SDKs. The goal is **parity across all three against the *current* platform surface** — this is not only "add TypeScript," it is also **update / improve / enhance the existing Go and Python clients** to expose everything P1–P5 shipped (environments, the governed gateway, model-endpoints/BYOK, deployments, channels), at the same reliability + quality bar.

### 6.0 SDK platform-parity matrix
The target surface every client SDK must reach (✅ exists · ➕ to add · — n/a):

| Capability | Go | Python | TypeScript |
|---|---|---|---|
| Tasks — submit/get/cancel/**stream** | ✅ | ✅ | ➕ |
| Agents — register/get/list | ✅ | ✅ | ➕ |
| Agents — **update / delete** | ➕ | ✅ | ➕ |
| Memory — search/inject | ✅ | ✅ | ➕ |
| Memory — **delete** + session metadata | ➕ | ✅ | ➕ |
| Marketplace | ➕ | ✅ | ➕ |
| Webhooks verification | ➕ | ✅ | ➕ |
| **Environments** (`X-Actrone-Env`, per-env) | ➕ | ➕ | ➕ |
| **Gateway client** (governed inference, D2) | ➕ | ➕ | ➕ |
| **Model-endpoints / BYOK** mgmt (list/create/validate/delete) | ➕ | ➕ | ➕ |
| **Deployments** (promote/rollback/canary + list) | ➕ | ➕ | ➕ |
| **Channels** (config + approvals) | ➕ | ➕ | ➕ |
| Scoped-RBAC-aware errors (clean 403s) | ➕ | ➕ | ➕ |
| Reliability: retries+backoff+jitter, breaker, idempotency, `X-Request-Id` | ✅ | ✅ | ➕ |

The rows that are **➕ across all three** are the **new platform surface none of the SDKs fully exposes yet** — the heart of this workstream.

### 6.1 Existing SDK enhancement (Go + Python) — update / improve / enhance
Both shipped SDKs are brought up to the matrix **and** to current CLAUDE.md standards — they are actively modernised, not left as-is.

**Go (`actrone-go`):**
- Close the method gap: `UpdateAgent`, `DeleteAgent`, `DeleteMemory`, session-metadata.
- Add the new platform surface: per-env `X-Actrone-Env`, model-endpoints/BYOK management, deployments (promote/rollback/canary + list), channels, and a **gateway client** helper.
- Quality pass: error/request-id surfacing, idempotency on every write, dependency refresh, `go vet` + race-tests green. (Framework adapters only on demand — §4.1.)

**Python (`actrone`):**
- The client is the most complete but lacks the new surface: add per-env `X-Actrone-Env`, model-endpoints/BYOK management, deployments, channels, and a **gateway client** helper.
- Quality pass: `mypy --strict` clean, all I/O `async`, error/request-id surfacing, dependency refresh, pinned bounds current.
- The package becomes **library-only** once the Typer CLI is removed (§6.3) — slimmer installs, no CLI/version coupling.
- The 7 framework adapters get their own prod-grade upgrade (§3).

> Both stay **back-compatible**: new methods are additive; existing call-sites keep working. Each releases independently of the CLI and of the platform.

### 6.2 The TypeScript SDK (`@actrone/sdk`)
New, first-class, because Vercel AI SDK / Mastra / Cursor / OpenAI Agents JS are TS-native and unreachable otherwise.

- **Standards (CLAUDE.md §1.3):** Node ≥ 22, **ESM only**, `strict` TS, `zod`-validated I/O, native `fetch` (no axios), `tsup`/`tshy` build, dual-published types. No `any` without `// UNSAFE:`.
- **Full surface** (the matrix): tasks (submit/get/cancel + **stream** over the existing WS/SSE), agents (register/get/list/update/delete), memory (search/inject/delete), marketplace, webhooks verification, session metadata, environments, gateway client, model-endpoints/BYOK, deployments, channels. Same reliability contract: retries + backoff + jitter, circuit breaker (e.g. `opossum`), idempotency keys, `X-Request-Id`, `X-Actrone-Env` (per-env), BYOK awareness.
- **Adapters (D1/D2/D3):** Vercel AI SDK provider + middleware, Mastra memory/tools, OpenAI Agents JS guardrails/handoffs, Cursor SDK run-governor, LangGraph.js/LangChain.js memory.
- **No TS CLI.** The terminal experience is the **single global Go CLI** (§6.3) — the TS SDK is a library, not a CLI. An optional `npx create-actrone-app` *scaffolder* is the only TS-ecosystem command-line surface.
- **Server-context fit:** usable directly in Next.js server actions / route handlers (ties to CLAUDE.md §5.2's server-client guidance).
- **Future SDKs (noted, not scheduled):** **.NET** (Semantic Kernel / Microsoft shops) and **Java** (ADK Java) — real demand; sequence after Go/Python/TS reach full parity.

### 6.3 CLI strategy — one global Go binary (DECIDED, June 2026)
**One CLI for everyone, regardless of SDK. Implemented in Go, shipped as a single static binary. The existing Python Typer CLI is DELETED — not ported, not kept as a wrapper.**

- **Why one, why Go:** a CLI is a thin client over the orchestrator REST API — it is *already* agnostic to which SDK a user codes against, so there is never a per-SDK CLI. The only real axis is **runtime/distribution**: a Typer CLI needs a Python runtime + `pip install`, which is friction for Go/TS users. A Go binary is **zero-runtime, single static file, cross-platform** (macOS/Linux/Windows), instant cold start — the infra-CLI norm (`gh`, `docker`, `kubectl`, `stripe`). Distribute via Homebrew / Scoop / winget / `curl | sh` / GitHub releases.
- **Delete the Typer CLI** (action items, execute during P4):
  - Remove `backend/src/actrone/cli/` entirely.
  - Remove the `[project.scripts] actrone = "actrone.cli:app"` entry and the `[cli]` (`typer`, `rich`) optional-dependency group from `backend/pyproject.toml`.
  - The Python package becomes a **library only** (no console script) — leaner installs, no CLI version coupling.
- **New `actrone` Go CLI** = its **own deployable** (e.g. `actrone-cli/`, separate from the importable `actrone-go` library SDK so the binary and the library version independently). Commands cover the full platform surface and the capabilities shipped in P1–P3: auth (`login/logout`), `agents` (deploy/get/list/promote/rollback/canary), `tasks` (submit/get/tail-stream/cancel), `keys` (per-env create/list/revoke), `models keys` (BYOK add/validate/list), `channels`, `marketplace`, plus a global `--env {development|staging|production}` flag (→ `X-Actrone-Env`) and respect for scoped RBAC. Same reliability contract as the SDKs (retries/backoff/breaker/idempotency/`X-Request-Id`).
- **No Python or TS CLI.** Per-ecosystem command-line surface is limited to optional *scaffolders* (`npx create-actrone-app`, a Python project template) — project bootstrap, not platform interaction.

---

## 7. Dependencies & sequencing

```
Gateway (D2 universal)  ──► unlocks inference governance for ALL frameworks & languages at once
        │
        ├─► Upgrade existing 7 Python adapters to prod-grade + D2 (+D3)
        ├─► Add Python adapters: OpenAI Agents SDK, Pydantic AI, Google ADK, Semantic Kernel
        ├─► Build @actrone/sdk (TS) ──► TS adapters: Vercel AI SDK, Mastra, Cursor, OpenAI Agents JS
        ├─► OpenClaw bridge (gateway + memory + governed channels)
        ├─► Existing Go + Python client enhancement → platform parity (env/gateway/BYOK/deploys/channels)
        └─► Global Go CLI (own deployable) ── delete the Python Typer CLI
```

**Order (within P4 of the Master Plan):**
1. **OpenAI-compatible gateway** — single highest-leverage unlock (D2 for everything + powers BYOK).
2. **Prod-grade pass on the 7 existing Python adapters** (+ D2 helpers) — protects the capability we already advertise.
3. **Existing Go + Python client enhancement → platform parity** (§6.1: env, gateway client, model-endpoints/BYOK, deployments, channels + quality pass) — modernise what's shipped before/alongside adding the new client.
4. **`@actrone/sdk` (TS) core** — unblocks the TS framework wave + Next.js embedding.
5. **New adapters**, prioritised: OpenAI Agents SDK (py+ts) → Vercel AI SDK + Mastra (ts) → Pydantic AI + Google ADK + Semantic Kernel (py) → Cursor SDK (ts) → **OpenClaw bridge + migration page**.
6. **Global Go CLI** (§6.3) — its own deployable; **delete the Python Typer CLI** (`backend/src/actrone/cli/` + the `[project.scripts]`/`[cli]` entries) in the same change. Parallelisable with the SDK work.

Every item is governed by entitlements + scoped RBAC, rides the existing orchestrator/gateway/supervisor/trust/audit seams, and ships behind real tests + pinned deps. The **`FRAMEWORK_ADAPTERS` registry** (Models §3.5) drives the BYOF picker UI + per-framework quickstart docs and must list every framework here with its real package name, supported depths, and language.

---

## 8. Definition of done (per adapter / SDK)
- Framework contract fully + faithfully implemented (contract test proves it).
- D1+D2 working end-to-end; D3 where the framework supports it; governed inference verified through MAL/DPE/audit on a real call.
- Reliability inherited (retries/breaker/idempotency/request-id/env/BYOK); `mypy --strict` / `tsc strict` / `go vet` clean; ≥ 80% unit coverage + contract + integration smoke.
- Pinned framework versions in CI; quickstart docs match the real API and are surfaced in BYOF onboarding.
- Honest status in the registry: never show a framework as "governed" until D2 is actually wired for it.

---

*Last updated: 2026-06-12 · Planning only — corrects the record that the Python SDK + 7 memory adapters already exist; defines the path to full (memory + inference + tool) governance across Go, Python, and TypeScript.*
