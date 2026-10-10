# Actrone — Framework Adapter Parity Plan (OSS memory ⇄ Client SDKs ⇄ hosted harness)

> **Goal:** one coherent, verifiable framework matrix across every surface — the OSS memory libraries,
> the Client SDKs' BYOF governance integrations, the hosted stepwise harness drivers, and the backend
> allowlist — so a framework we "support" is supported *everywhere it should be*, with tests and pinned
> compatibility. Also: add the most-adopted frameworks we don't cover yet.
>
> Part of the strategy set: [Memory Strategy & Roadmap](./Actrone_Memory_Strategy_And_Roadmap.md) ·
> [Platform evolution plans](./Actrone_Platform_Evolution_Plans.md) · SDK locations in the workspace
> `CLAUDE.md` §0.1.
>
> _Last updated: 2026-07-11 · Owner: Matt · Grounded in a code sweep of `actrone-py`, `actrone-ts`,
> `actrone-memory-{py,ts}`, and `backend/orchestrator/internal/domain/agent.go`._
>
> **✅ STATUS: IMPLEMENTED (2026-07-11) — see `progress.md` Cycle 15.** Tier 0 (T0.1 mastra verified,
> T0.2 voltagent, T0.3 non-hosted docs, T0.4 Python `_govern`/`govern_action`), Tier 1 (T1.1 six
> Python OSS adapters, T1.2 two TS OSS adapters, T1.3 TS-SDK langgraph, T1.4.1 recipes registry +
> mypy-checked `examples/frameworks/*.py` per new adapter + extraction drift-gate, T1.4.2 `add` CLI),
> hygiene (H1 pins, H2 peer-deps, H4 compat matrices, H5 optional redis/qdrant/openai), and Tier 2
> (Agno + smolagents + AWS Strands + Cloudflare Agents + Inngest AgentKit) are all landed and green.
>
> **Stepwise harness drivers for the injectable Tier-2 Python frameworks (agno/smolagents/strands)
> are now SHIPPED** (structural shims + framework-free converters + unit-tested pure helpers +
> `importorskip` real-SDK boundary→replay integration tests), so they are in `StepwiseFrameworks` —
> full per-step durable execution, not just encapsulated. `claude_agent_sdk` remains the only
> hosted-but-encapsulated framework (self-contained runtime, no injectable model shim).
>
> **One deliberate, documented scope decision** (conscious per CLAUDE.md, not an accidental gap): the
> Tier-2 **JS** frameworks (Cloudflare Agents / Inngest AgentKit) are **BYOF-connected** — they run on
> their own edge/durable runtimes (Cloudflare Workers / Inngest), not an Actrone-hosted authoring
> style — so they are governed via D2/D3 + memory but deliberately NOT in `HostedFrameworks`.

> **Status refreshed 2026-07-13 (code-verified): this doc's 2026-07-11 "IMPLEMENTED" claim holds up —
> re-verified independently against the current tree, no drift found.** Spot-checked and confirmed:
> `HostedFrameworks`/`StepwiseFrameworks` include agno/smolagents/strands/vercel/mastra/genkit/
> voltagent (`agent.go:157-206`); `actrone-py/src/actrone/integrations/_govern.py` exists (T0.4);
> `actrone-memory-py` extras include all six T1.1 additions (openai_agents, pydantic_ai,
> claude_agent_sdk, semantic_kernel, google_adk, microsoft_agent_framework) plus agno/smolagents/
> aws_strands (Tier 2); `actrone-memory-ts/src/adapters.ts` has `claudeAgentMemory` +
> `voltagentMemory` (T1.2); `actrone-ts/src/adapters/{langgraph,llamaindex}.ts` exist (T1.3);
> `actrone-memory-py/pyproject.toml` still has the documented `langchain<1` exception with the H1
> comment explaining it; `redis`/`qdrant`/`openai` are optional extras, not hard deps (H5);
> `actrone-memory-py/compatibility.yaml` + `actrone-memory-ts/compatibility.json` both exist (H4);
> `actrone-memory-py/src/actrone_memory/cli.py` has an `add` subcommand (T1.4.2). This is the most
> current and accurate of the framework-adapter docs — no corrections needed beyond this
> confirmation. The other framework docs (`Actrone_SDKs_and_Adapters_Plan.md`,
> `Actrone_Framework_Adapter_Expansion_Plan.md`, `Actrone_EMAOP_Models_Extensibility_Channels_Plan.md`
> §3) should defer to this one for current counts.

---

## 0. The problem in one line

We have **four** framework-integration surfaces, and they've drifted out of sync. A framework can have a
Client-SDK governance adapter but no OSS memory adapter, a hosted-harness driver but no BYOF adapter, or
be in the backend allowlist with no runnable shim. This plan enumerates the drift and the work to close
it, plus the high-value frameworks absent from every surface.

The four surfaces (verified locations):

| Surface | Purpose | Python | TypeScript |
| --- | --- | --- | --- |
| **OSS memory adapter** | give the framework governed memory (recall/remember + the framework's native memory interface) | `actrone-memory-py/src/actrone_memory/integrations/` | `actrone-memory-ts/src/adapters.ts` (+ `recipes.ts`, `examples/frameworks/`) |
| **Client-SDK BYOF integration** | govern the framework: D1 memory-context · D2 gateway (governed inference) · D3 tools · OTel | `actrone-py/src/actrone/integrations/` | `actrone-ts/src/adapters/` |
| **Client-SDK harness driver** | stepwise, crash-resumable hosted execution (route each completion through the boundary) | `actrone-py/src/actrone/harness/frameworks/` | `actrone-ts/src/harness/frameworks/` |
| **Backend allowlist** | the manifest parser's accepted authoring styles | `backend/orchestrator/internal/domain/agent.go` (`HostedFrameworks` / `StepwiseFrameworks`) | (same enum) |

---

## 1. Current inventory (as verified)

Legend: ✅ present · ❌ missing · — not applicable to that language.

| Framework | Lang | SDK BYOF | SDK harness | Backend enum | OSS-mem PY | OSS-mem TS |
| --- | --- | :--: | :--: | :--: | :--: | :--: |
| langchain | PY+JS | ✅ both | ✅ both | ✅ | ✅ | ✅ |
| langgraph | PY+JS | ✅ PY / ❌ TS | author-loop¹ | ✅ | ✅ | ✅ |
| llamaindex | PY+JS | ✅ PY / ❌ TS | ✅ PY | ✅ | ✅ | ✅ |
| openai_agents | PY+JS | ✅ both | ✅ both | ✅ | ❌ | ✅ |
| claude_agent_sdk | PY+JS | ✅ both | encapsulated² | ✅ | ❌ | ❌ |
| crewai | PY | ✅ | ✅ | ✅ | ✅ | — |
| autogen | PY | ✅ | ✅ | ✅ | ✅ | — |
| dspy | PY | ✅ | ✅ | ✅ | ✅ | — |
| haystack | PY | ✅ | ❌ | ❌³ | ✅ | — |
| pydantic_ai | PY | ✅ | ✅ | ✅ | ❌ | — |
| semantic_kernel | PY | ✅ | ✅ | ✅ | ❌ | — |
| google_adk | PY | ✅ | ✅ | ✅ | ❌ | — |
| microsoft_agent_framework | PY | ✅ | ✅ | ✅ | ❌ | — |
| vercel (AI SDK) | JS | ✅ | ✅ | ✅ | — | ✅ |
| mastra | JS | ✅ | ❌⁴ | ✅ | — | ✅ |
| genkit | JS | ✅ | ✅ | ✅ | — | ✅ |
| voltagent | JS | ❌⁵ | ✅ | ✅ | — | ❌ |
| cursor | JS | ✅ (run-gov) | — | ❌³ | — | n/a⁶ |
| openclaw | any | ✅ (config) | — | ❌³ | — | n/a⁶ |

¹ langgraph is an author-controlled loop (routes each call via `sctx.model/tool/memory`), so it needs no
per-framework stepwise shim. ² claude_agent_sdk runs encapsulated (hooks + MCP + gateway), no stepwise
model shim. ³ deliberately not a hosted framework. ⁴ **inconsistency — see Tier 0.** ⁵ has a harness
shim but no BYOF adapter. ⁶ cursor/openclaw are agent-runtime/editor targets, not conventional memory
targets.

### 1.1 Language applicability (so "parity" is realistic)

- **Cross-language** (both PY + JS ecosystems): langchain, langgraph, llamaindex, openai_agents,
  claude_agent_sdk.
- **Python-only** frameworks: crewai, autogen, dspy, haystack, pydantic_ai, semantic_kernel, google_adk,
  microsoft_agent_framework, Agno, smolagents, AWS Strands.
- **JS-only** frameworks: vercel AI SDK, mastra, genkit, voltagent, Cloudflare Agents, Inngest AgentKit.

You cannot (and should not) add a "crewai TS adapter" or a "mastra Python adapter" — parity is *within
each language's realistic framework set*, plus cross-language frameworks on both sides.

---

## 2. Definition of "fully wired"

A framework `X` is at parity when **all applicable surfaces** exist and are tested:

1. **OSS memory adapter — both tiers (§2.1).** `X`'s native memory-interface conformance (Tier 2) *and*
   the framework-agnostic prompt-string helper (Tier 1), backed by the Actrone store, with a contract
   test.
2. **Client-SDK BYOF integration** — D1 memory-context provider + D2 gateway bind (OpenAI-compatible
   base-URL redirect) + D3 governed-tool wrapper + OTel config, with tests.
3. **Client-SDK harness driver** — a stepwise driver/shim *iff* `X` exposes an injectable model backend
   (author-controlled and encapsulated frameworks are exempt), with tests.
4. **Backend allowlist** — `"X"` in `HostedFrameworks` and (if stepwise) `StepwiseFrameworks`
   (`agent.go`).
5. **Packaging + docs** — Python: a pinned `[project.optional-dependencies]` extra. TS: an optional
   `peerDependency` range + a `recipes.ts` entry + a CI-typechecked `examples/frameworks/X.ts`. Both: a
   README compatibility-matrix row.

### 2.1 Every memory adapter ships **both** tiers

The memory adapters come in two levels; a new adapter is not "done" until both exist (for frameworks that
have a native memory contract). Missing Tier 2 means the developer can only prepend a string; missing
Tier 1 means there's no 3-line path.

- **Tier 1 — prompt-string helpers (default, framework-agnostic).** `recall()` returns a ready-to-prepend
  system-prompt string; `remember()` persists a turn; the per-framework `<fw>Memory(...)` helper binds
  these to one conversation. Simplest path, works everywhere, ~3-line integration. This is what
  `memoryFor`/`vercelMemory`/`langchainMemory`/… already do on TS, and the string-returning integration
  methods on Python.
- **Tier 2 — real interface conformances (native integration).** Implement the framework's *actual*
  memory contract so the Actrone store drops in where the framework expects its own memory object —
  e.g. TS `langchainChatHistory()` = a genuine `BaseChatMessageHistory` (optionally emitting real
  `HumanMessage`/`AIMessage`), `llamaindexChatMemory()` = the current LlamaIndex `Memory`
  (`add`/`get`/`clear`), `loadMessages()` = a structured role-tagged message array; on Python the
  `integrations/<fw>.py` implement the framework's memory base class (LangChain memory, LlamaIndex
  `BaseMemory`, Haystack `@component`, DSPy `Retrieve`, AutoGen `Memory`, …).

**Rule:** every framework with a formal memory interface gets **both** tiers. Frameworks with no formal
memory contract (Vercel AI SDK / Mastra / OpenAI Agents / Genkit / LangGraph-state) ship **Tier 1 only** —
the system-string / graph-state helper *is* the idiomatic integration there, and that's complete.

---

## 3. Most-adopted frameworks we don't cover anywhere (add these)

From 2026 adoption data (LangGraph ~34.5M monthly downloads; LangChain ~134k stars / 1,000+ integrations;
CrewAI 1.14; Claude Agent SDK; Microsoft Agent Framework 1.0 = the Semantic Kernel + AutoGen merger,
Apr 2026; Pydantic AI V2 and LlamaIndex Workflows 1.0 both stable Jun 2026):

| Framework | Lang | Why | Priority |
| --- | --- | --- | --- |
| **Agno** (ex-Phidata) | PY | streamlined, high adoption, memory-forward | **P1** |
| **smolagents** (Hugging Face) | PY | lightweight code-agents, growing | P2 |
| **AWS Strands** | PY | AWS-native, enterprise pull | P2 |
| **Cloudflare Agents** | JS | edge/Workers, rising | P2 |
| **Inngest AgentKit** | JS | durable workflow agents | P3 |

Excluded on purpose: **Dify / Langflow / Flowise / n8n** are low-code platforms integrated via API, not
code adapters. **Letta (MemGPT)** is a memory-native runtime — a competitor to our memory layer, not an
adapter target.

Sources: [LangChain — AI agent frameworks](https://www.langchain.com/resources/ai-agent-frameworks) ·
[JetBrains — Top agentic frameworks 2026](https://blog.jetbrains.com/pycharm/2026/06/top-agentic-frameworks-for-building-applications-2026/) ·
[KDnuggets — 10 agentic frameworks 2026](https://www.kdnuggets.com/10-agentic-ai-frameworks-you-should-know-in-2026) ·
[Vellum — top frameworks for developers](https://www.vellum.ai/blog/top-ai-agent-frameworks-for-developers) ·
[ayautomate — best TS agent frameworks](https://www.ayautomate.com/blog/best-typescript-ai-agent-frameworks).

---

## 4. The plan

### Tier 0 — fix internal inconsistencies first (cheap, correctness)

These are live drifts inside the SDK ecosystem, independent of any new framework:

- **T0.1 — mastra has no stepwise harness shim** but is in `StepwiseFrameworks` and the enum comment
  claims "every value has a shim." A mastra `byof_hosted` agent would parse OK but fail to run stepwise.
  → Add `actrone-ts/src/harness/frameworks/mastra.ts`, **or** remove mastra from `StepwiseFrameworks`
  (leave it encapsulated-only) and correct the comment. Decide based on whether Mastra exposes an
  injectable model backend.
- **T0.2 — voltagent has a harness shim + enum entry but no BYOF adapter and no OSS memory adapter.**
  → Add `actrone-ts/src/adapters/voltagent.ts` (gateway/tools/otel) + `voltagentMemory()` in the OSS lib.
- **T0.3 — document the deliberate non-hosted set** (haystack, cursor, openclaw) so their absence from
  the enum reads as intentional, not a gap.
- **T0.4 — Python SDK `_govern.py` facade + `govern_action` (SDK cross-language parity).** The TS SDK has
  a unified `actrone-ts/src/adapters/_govern.ts` (`governTool` / `governTools` / `governAction`) that
  wraps both governed-tool modes — execute-via-Actrone (`actroneTool`) and supervise-only
  (`governLocalTool`) — behind one API, and adds `governAction` to gate a *side-effecting action* (e.g. a
  Cursor run's PR-creation / shell step) behind the Tool-Call Supervisor. The Python SDK has the
  primitives (`_local.py` supervise-only + per-adapter `actrone_tool`) but **no unified facade and no
  `govern_action`.** → Add `actrone-py/src/actrone/integrations/_govern.py` unifying execute + supervise-
  only behind `govern_tool` / `govern_tools`, plus `govern_action(client, agent_id, name, action)` for
  action-gating (raises `PermissionDeniedError` on a denied action, mirroring the supervise-only path).
  No framework imported at runtime (structural), testable with a fake client. This is the one genuine
  TS-ahead SDK asymmetry from the audit.

### Tier 1 — OSS ⇄ Client-SDK parity (the core ask)

Bring the OSS memory libs up to the frameworks the SDKs already govern (SDK integrations are the
reference implementation to mirror):

- **T1.1 — OSS-mem Python, +6:** `openai_agents`, `pydantic_ai`, `claude_agent_sdk`, `semantic_kernel`,
  `google_adk`, `microsoft_agent_framework`. Each: `integrations/<fw>.py` (mirror the SDK's memory-context
  provider) + pyproject extra (pinned to the current major) + `tests/contract/test_<fw>.py` + docs.
- **T1.2 — OSS-mem TS, +2:** `claude_agent_sdk`, `voltagent` (voltagent overlaps T0.2). Each: an adapter
  in `adapters.ts` + `recipes.ts` entry + `examples/frameworks/<fw>.ts` + test + optional peer dep.
- **T1.3 — SDK-TS BYOF, +2:** `langgraph.ts`, `llamaindex.ts` (cross-language; PY-SDK + OSS-TS already
  have them, TS SDK is behind). Add the BYOF adapter (+ stepwise shim if injectable) + enum stays as-is
  (langgraph already listed).
- **T1.4 — Python OSS DX parity (recipes doc page per framework → then a Python `add` CLI).** TS has the
  §4b onboarding DX (a copy-paste recipe per framework + `npx actrone-memory add <fw>`); Python currently
  relies on extras + prose. Close the gap, **in this order:**
  1. **Recipes doc page per framework FIRST.** One docs page per integration, identical shape
     (`install → paste → run → what you get`), ending with the hosted-upgrade seed
     (`# ⬆ swap for actrone's hosted ActroneMemoryManager`). Make them **single-source-of-truth**: each
     snippet is a `# region`-marked block in a runnable `examples/<framework>_quickstart.py` that CI
     type-checks (`mypy`) + a `scripts/extract_snippets.py` extraction with a `--check` drift gate —
     mirroring the TS `examples/frameworks/` + `snippets.json` + `snippets:check` pattern already
     shipped. This is the higher-trust, lower-effort half and should land before any CLI.
  2. **Python `add` CLI (lower priority).** A `console_scripts` entry point so `actrone-memory add
     <framework>` prints the install + recipe, and `actrone-memory add <framework> --write memory.py`
     writes **one** new self-contained file (non-destructive — never edits existing code), plus
     `actrone-memory list`. Mirrors `npx actrone-memory add` for literal TS↔Python DX symmetry. Optional
     — the recipe docs cover the need; add the CLI only for full parity.

### Tier 2 — new common frameworks, across all applicable surfaces

Full ①–⑤ wiring per framework:

- **T2.1 — Agno (Python)** — P1. Memory adapter + SDK BYOF + harness driver + enum + tests.
- **T2.2 — smolagents (Python)** — P2.
- **T2.3 — AWS Strands (Python)** — P2.
- **T2.4 — Cloudflare Agents (JS)** — P2.
- **T2.5 — Inngest AgentKit (JS)** — P3.

### Cross-cutting hygiene (do alongside Tier 1)

- **H1 — Refresh stale Python extras pins.** `langchain`, `langgraph`, `crewai`, `llamaindex` are capped
  `<1` in `actrone-memory-py/pyproject.toml`, but all shipped 1.x in 2026 — so the extras install pre-1.0
  or conflict with a user on 1.x. Bump to the current majors and re-run contract tests. (Same audit for
  the SDK's dependency ranges.)
- **H2 — TS optional `peerDependencies` + version ranges** on `actrone-memory` (and the SDK), so the
  framework requirement is machine-legible and npm warns on mismatch — without publishing a package per
  framework.
- **H3 — Run the TS framework examples against the *real* installed versions in CI** (not just typecheck
  against our adapter API), so a framework method rename (e.g. LlamaIndex `put`→`add`) fails the build,
  not a user's runtime.
- **H4 — Ship a compatibility matrix** (adapter ↔ tested framework version) in both OSS READMEs and the
  SDK READMEs.
- **H5 — Consider making `redis`/`qdrant`/`openai` optional extras** in `actrone-memory-py` so the truly
  local-first install pulls nothing but the in-memory + hashing path (today they're hard deps imported at
  module load). Separate DX refinement, tracked here for visibility.

---

## 5. Per-framework wiring checklist (copy per framework)

**Python framework `X`:**

- [ ] `actrone-memory-py/src/actrone_memory/integrations/X.py` — **Tier 2** native memory-interface
      conformance **+ Tier 1** string helper (§2.1); lazy framework import
- [ ] `actrone-memory-py/pyproject.toml` — `X = ["<pkg>>=<cur-major>,<next>"]` extra (+ add to `all`)
- [ ] `actrone-memory-py/tests/contract/test_X.py` — contract test (fake client, no network)
- [ ] `actrone-memory-py/examples/X_quickstart.py` — `# region`-marked, `mypy`-checked recipe source (T1.4)
- [ ] Recipes **doc page** for `X` (extracted snippet) + README compatibility-matrix row
- [ ] `actrone-memory-py` `add` CLI registry entry for `X` (once the CLI lands, T1.4)
- [ ] `actrone-py/src/actrone/integrations/X.py` — D1/D2/D3/OTel (if not already present)
- [ ] `actrone-py/src/actrone/harness/frameworks/X.py` — stepwise driver (if injectable model backend)
- [ ] `backend/.../domain/agent.go` — add `"X"` to `HostedFrameworks` (+ `StepwiseFrameworks` if stepwise)
- [ ] SDK contract/harness tests green

**JS framework `X`:**

- [ ] `actrone-memory-ts/src/adapters.ts` — **Tier 1** `XMemory()` string helper **+ Tier 2** native
      interface conformance if `X` has a memory contract (§2.1)
- [ ] `actrone-memory-ts/src/recipes.ts` — recipe entry (identical shape, hosted-upgrade seed) → docs page
- [ ] `actrone-memory-ts/examples/frameworks/X.ts` — CI-typechecked `#region X` example
- [ ] `actrone-memory-ts/test/adapters.test.ts` — contract test + `test/recipes-examples.test.ts` picks it up
- [ ] `actrone-memory` `package.json` — optional `peerDependency` range for `X`
- [ ] `actrone-ts/src/adapters/X.ts` — gateway/tools/otel/govern (if not present)
- [ ] `actrone-ts/src/harness/frameworks/X.ts` — stepwise shim (if injectable)
- [ ] `backend/.../domain/agent.go` — enum entry
- [ ] typecheck + vitest green

---

## 6. Suggested order & scope

**Order:** Tier 0 (4 fixes, incl. `_govern.py`/`govern_action` T0.4) → Tier 1 Python +6 (biggest parity
win — SDK reference impls exist) → **T1.4.1 Python recipes doc pages** (each new adapter ships its page) →
Tier 1 TS (+3) → hygiene H1–H4 → **T1.4.2 Python `add` CLI** (optional, after the docs) → Tier 2
(Agno first, then the rest).

**Rough scope:** ~9 OSS-memory adapters (each **both tiers**, §2.1) · `_govern.py` facade + `govern_action`
· ~4 SDK adapters/shims · ~5 enum edits · ~13 contract-test files · per-framework recipe doc pages (+
extraction harness) · optional Python `add` CLI · the pin refresh + peer-deps + matrix. The Tier-1 Python
six are the highest-leverage: each is a small, well-scoped port of an existing `integrations/<fw>.py` (its
Tier-2 conformance) plus a Tier-1 string helper, a contract test, a pyproject extra, and a recipe page.

**Execution discipline (per CLAUDE.md):** one framework at a time — adapter + extra/peer-dep + contract
test, green before the next; refresh the compatibility matrix as each lands; mark each in `progress.md`.

---

## 7. The one line

> **Make "supported framework" mean the same thing on every surface — OSS memory, SDK governance, hosted
> harness, and the backend allowlist — with pinned, tested compatibility; close the six Python + three TS
> parity gaps, fix the mastra/voltagent drift, and add Agno + the rising frameworks — so a developer on
> any mainstream framework gets governed memory, governed inference, and hosted durability with one
> import.**
