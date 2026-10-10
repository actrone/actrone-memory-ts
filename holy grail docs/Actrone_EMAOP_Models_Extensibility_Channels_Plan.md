# EMAOP — Models/BYOK, Extensibility, Channels & Deployment Plan

**Version 1.0 — June 2026 · ✅ SHIPPED as Master-Plan P4 (models/BYOK + gateway + adapters) & P5 (channels + deployment). This doc captures the original analysis; authoritative status: [Platform Evolution §0a](./Actrone_Platform_Evolution_Master_Plan.md#0a-implementation-status-verified-2026-06-24).**

> **Status refreshed 2026-07-13 (code-verified) — §3's own "reality check" (the 7-Python-adapters,
> memory-only framing) is now itself stale, and §3.6's build order is fully executed.** Current
> verified state: the Go SDK named throughout §3.6 item 6 ("Go SDK parity") **was deleted**, not
> extended — see `Actrone_Go_SDK_Removal_Plan.md` (done) — so "three SDKs (Go/Python/TS)" language
> anywhere below should read **TypeScript + Python**. The gateway (D2) shipped; the 7 shipped Python
> adapters were brought to prod grade **and the set grew to 16**
> (`actrone-py/src/actrone/integrations/`: + agno, aws_strands, claude_agent_sdk, google_adk,
> microsoft_agent_framework, openai_agents, pydantic_ai, semantic_kernel, smolagents — beyond the
> original LangChain/LangGraph/CrewAI/AutoGen/LlamaIndex/DSPy/Haystack seven); `@actrone/sdk`
> (`actrone-ts/`) is built with 15 framework-adapter files; OpenAI Agents SDK, Cursor SDK, Google ADK,
> Microsoft Agent Framework/Semantic Kernel, Vercel AI SDK, Mastra, Pydantic AI, and OpenClaw are all
> now shipped adapters (`actrone-ts/src/adapters/{openai-agents,cursor,vercel-ai,mastra,openclaw}.ts`,
> `actrone-py/src/actrone/integrations/{google_adk,semantic_kernel,pydantic_ai}.py`), not "new to add."
> D3 tool/handoff governance is wired via `_govern.ts` (TS, imported by 6 adapters) and
> `integrations/_govern.py` (Python). For the current, authoritative framework/adapter inventory —
> including the `HostedFrameworks`/`StepwiseFrameworks` enum wiring this section doesn't mention —
> see `Actrone_Framework_Adapter_Parity_Plan.md` (2026-07-11, re-verified 2026-07-13). §4's
> multi-channel claims hold up: Telegram/WhatsApp/Slack/email + Teams (broadcast-only, per
> `Actrone_Teams_Approvals.md`) are all real and shipped, and inbound default-agent chat routing
> (D1) is built (`internal/channels/service.go`, `chat_inbound_test.go`).

> Reminder: **"EMAOP" is the internal codename — it ships as Actrone, one product, one
> codebase.** Everything below is an *additive layer* on the existing orchestrator,
> Control Tower, vault, governance, and SDK. Reuse the seams; do not stand up parallel
> systems (per [EMAOP Integration Plan](./EMAOP_Actrone_Integration_Plan.md) §0.0).

This doc answers eight connected questions:

1. **Models & BYOK** — let orgs bring their own provider keys (OpenAI/Anthropic/Gemini/…) *or* use Actrone-managed models, pick/swap the model in Control Tower, with cost transparency at subscription **and** in usage, plus a secure key-validation flow.
2. **Custom REST/SDK builds** — how an enterprise wires their own systems with minimal code and still gets full autonomous, governed agentic capability.
3. **Framework adapters** — add OpenClaw, OpenAI Agents SDK, Cursor SDK (+ more) to the BYOF adapter set, grounded in each one's official docs.
4. **Multi-channel comms** — agents reach users on Telegram / WhatsApp / Slack / email for chat, approvals, declines, alerts — RBAC-gated, executions driven from the channel.
5. **Full-stack leverage** — confirm EMAOP still rides the whole Actrone stack (memory, governance, MAL, audit, routing).
6. **Premium enterprise feel** — make every surface trustworthy + addictive, beating OpenClaw.
7. **Deployment UX** — Vercel-benchmarked agent deployment, and what else to borrow from Vercel.
8. **Monetization deltas** — what this adds to revenue (detailed in [monetization-strategy.md](./monetization-strategy.md) §15).

---

## 0. The competitive frame: why these features, why now

Research finding ([Milvus](https://milvus.io/blog/openclaw-formerly-clawdbot-moltbot-explained-a-complete-guide-to-the-autonomous-ai-agent.md), [emergent.sh](https://emergent.sh/learn/what-is-openclaw), [Wikipedia](https://en.wikipedia.org/wiki/OpenClaw)): **OpenClaw** (68k+ GitHub stars, Nov 2025) is a free, open-source, model-agnostic autonomous agent that **uses messaging platforms — WhatsApp, Telegram, Slack, Discord (11+) — as its primary UI**, runs locally, holds persistent memory, has 700+ skills, controls the browser via Playwright, and connects to OpenAI/Anthropic/DeepSeek via the user's own keys.

That single fact reframes every request in this doc. OpenClaw's appeal is: *bring your own model, talk to your agent from WhatsApp, it just does things.* Its fatal enterprise weakness is the inverse of Actrone's entire thesis: **it is ungoverned, unaudited, runs with raw credentials and raw PII on a local box, and no CISO can ship it.** Actrone wins by matching OpenClaw's *convenience* (BYOK, messaging channels, low-code) while keeping the *governance moat* (MAL tokenisation, 3-tier DPE, tamper-evident audit, Ed25519 trust, per-env isolation) that OpenClaw structurally cannot have.

**Design principle for this whole plan:** *every convenience we borrow from OpenClaw passes through the governance spine.* BYOK keys go in the vault, never to a log. Channel approvals are RBAC-checked and audit-logged. Custom connectors are MAL-classified. That is the unfair advantage — convenience **and** control, which no competitor offers together.

---

## 1. Model strategy — BYOK vs Actrone-managed

### 1.1 Current reality (codebase)

Model provider keys today are **platform-level config** ([config.go](../backend/orchestrator/internal/config/config.go) `OpenAIAPIKey`, `AnthropicAPIKey`, `MistralAPIKey`, `DeepSeekAPIKey`, `TogetherAPIKey`) injected as env vars. The [`model.Provider`](../backend/orchestrator/internal/model/provider.go) interface is clean — every provider constructor takes an `apiKey` (e.g. `NewOpenAIProvider(apiKey, modelID, timeout)`) — and a [`Router`](../backend/orchestrator/internal/model/router.go) selects among them. **There is no per-tenant key today.** Every tenant runs on Actrone's keys; that is the "Actrone-managed" path, already working. BYOK is the net-new addition.

### 1.2 The two modes (per org, per environment)

| Mode | Who pays the provider | Margin model | Best for |
|---|---|---|---|
| **Actrone-managed** (default) | Actrone (we hold the keys, you pay us) | Subscription + governed-task meter + routing dividend (existing §2 of monetization) | Solo/startup, zero-setup, savings-flywheel benefits |
| **BYOK — Bring Your Own Key** | The customer (direct provider billing) | Platform/governance fee per governed task; **no token markup** | Enterprises with existing provider contracts, data-residency/compliance review, cost control |

This is exactly the BYOK value prop the market expects ([Augment Code](https://www.augmentcode.com/guides/byok-enterprise-agent-rollouts)): *"BYOK keeps API credentials under enterprise control, preserves direct provider billing and agreements, and produces auditable lifecycle evidence regulated rollouts require."* Vercel AI Gateway, Cloudflare AI Gateway, Cursor, and Kodus all ship BYOK with encrypted key storage + a validation test — this is now table stakes for a serious platform.

**Both modes are first-class and switchable in Control Tower** — an org can run managed in dev and BYOK in prod, or BYOK for the frontier model and managed (our routing) for cheap fallbacks.

### 1.3 Provider & model selection (Control Tower)

A new **Settings → Models** surface (and an inline step in Agent Studio / onboarding):

- **Provider catalog** with official `simple-icons` logos (see [Integrations Plan](./Actrone_Integrations_and_Capabilities_Plan.md) §2): OpenAI, Anthropic, Google Gemini, Mistral, DeepSeek, Together, Cohere, xAI/Grok, Groq, AWS Bedrock, Azure OpenAI, Google Vertex, OpenRouter, plus an **OpenAI-compatible "Custom endpoint"** (base-URL override — the `OpenAIProvider.baseURL` field already supports this, used today for Mistral).
- Per provider: **Use Actrone's key** (managed) or **Add your key** (BYOK).
- **Model picker** per provider (resolved from a living `MODEL_CATALOG` keyed by provider → models with context window, modality, input/output price, and tier gate). Default model + per-agent override + routing strategy (`primary_with_fallback | cost | latency | quality | pinned` — already in [provider.go](../backend/orchestrator/internal/model/provider.go)).
- **Changeable anytime** — switching the model/provider re-resolves the agent's provider on the next task; no redeploy. Versioned in the audit spine (who changed the model, when).

### 1.4 BYOK key-validation flow (the "say hi" test) — secure by construction

The user's requested flow, made precise and safe:

```
1. INPUT      Settings → Models → Add key → choose provider.
              A single password-type field (autocomplete=off, never rendered back).
              Optional: base URL (for Azure/Vertex/custom), org id.

2. SEAL       The key is POSTed once over TLS to a dedicated backend endpoint and
              IMMEDIATELY sealed in the vault (mcphub AES-256-GCM CredentialVault /
              HashiCorp Vault transit for Enterprise). It is NEVER written to logs,
              NEVER returned by any GET, NEVER placed in the client bundle.
              Stored at  secret/provider-keys/<tenant_id>/<env>/<provider>.

3. VALIDATE   The backend runs a live two-stage test (server-side only):
              (a) a cheap metadata/list-models call → catches invalid key / wrong
                  base URL / network ([Augment Code], [Kodus] pattern); then
              (b) a tiny generation: system prompt instructs the model to greet the
                  user by FIRST NAME (from Clerk) or ORG NAME (from DB) — e.g.
                  "Reply with exactly: 'Hi Matt — your OpenAI key is live on Actrone.'"
              A successful, correctly-formed, billable completion proves the key is
              valid AND paid (free/over-quota keys 401/429 here). ~$0.0001 cost.

4. RESULT     UI shows: ✓ Connected · provider · model · the greeting it returned ·
              "validated just now". On failure: a precise, non-leaking error
              (invalid key / no quota / network) + retry. The raw key never appears.

5. USE        From now on the Router loads the per-tenant key from the vault at task
              time (5-min in-memory DEK cache, same pattern as MAL) and injects it at
              the provider edge. The key never reaches the LLM context, the frontend,
              or any agent.
```

**Why a generation test, not just metadata:** a metadata call proves the key *exists*; the greeting call proves it is *funded and inference-capable* — the thing the user actually cares about ("is it paid for"). We keep the metadata pre-check to give precise error messages cheaply before spending the (tiny) generation cost.

**Security checklist (CLAUDE.md §5):** key sealed at rest + in transit; never logged (structured-log scrubber); BYOK status endpoint returns only `{connected, provider, model, last_validated_at, masked_hint:"sk-…x�4f"}` — never the key; per-env scoping (a dev key cannot touch prod); rotation = re-seal + re-validate; revoke = vault delete + audit event; rate-limit the validate endpoint (anti-abuse).

### 1.5 Cost transparency — at subscription AND in usage

The user's hard requirement: **show the cost difference between BYOK and managed, transparently, before and after purchase.**

**At subscription (pricing page + checkout):** a **"How you pay for models"** comparison block:

| | Actrone-managed | BYOK |
|---|---|---|
| Model tokens | Billed by Actrone (pass-through + routing dividend, shown net-of-savings) | **Billed directly by your provider** — $0 token markup from us |
| Actrone fee | Subscription + governed-task meter + routing dividend | Subscription + governed-task meter (governance/platform fee) |
| You get the savings flywheel (cache/route/batch)? | ✅ automatic, credited | ⚠️ caching still saves *your* provider bill; routing limited to your own keys |
| Setup | None | Add + validate a key |
| Best when | You want simplest + provable savings | You have provider contracts / compliance / want direct billing |

A small **estimator**: "At ~X governed tasks/mo on `gpt-4o`, managed ≈ $A all-in; BYOK ≈ $B to OpenAI + $C to Actrone." Honest framing per monetization §6 — never overclaim savings.

**In usage (Settings → Usage / Cost Monitor):** the existing savings-attribution spine ([monetization §6.1](./monetization-strategy.md)) already computes baseline-vs-actual per call. Extend it to **split by key ownership**:
- Managed agents: full "Actrone saved you $X, fee $Y, net −$Z" headline.
- BYOK agents: "Your provider spend this period: $P (billed by OpenAI). Actrone governance fee: $Q. Caching saved you $R on your own bill." — so BYOK customers *also* see Actrone creating value, not just taking a fee.
- A per-agent, per-model, per-provider breakdown table (reuse `useDataView`/`DataToolbar`), exportable.

### 1.6 Backend shape (planning)

- New `internal/modelkeys/` package: `Store` (vault-backed CRUD, per tenant×env×provider), `Validator` (the two-stage test), `Resolver` (Router asks it for the right `Provider` given tenant+env+agent — returns a managed provider or a BYOK-keyed one).
- Migration `provider_keys` (id, tenant_id, env, provider, base_url, model_default, masked_hint, vault_path, last_validated_at, status, created_by) — **never store the key in Postgres; only the vault path + masked hint.**

> **Generalise BYOK → "BYO model source" from day one.** BYOK is not just OpenAI/Anthropic/Gemini keys — the *same* binding mechanism must also cover **open-model APIs** (OpenRouter, Together, Groq, Fireworks, DeepInfra, Meta's Llama API…) and **self-hosted inference servers** (vLLM, Ollama, SGLang, LM Studio, LocalAI), which are nearly all **OpenAI-compatible** (base-URL + key), plus cloud native adapters (Bedrock/Vertex). Implement the table as **`model_endpoints`** (carrying a `kind` + `base_url`) and a generic `OpenAICompatibleProvider`, **not** a narrow `provider_keys`, so open models are first-class, not a later bolt-on. Full taxonomy, the preset catalog, the self-hosted **network-reachability matrix** (public / BYOC self-host / PrivateLink / outbound Edge-Connector tunnel), SSRF defense, and native adapters: **[Open Models & Inference Endpoints Plan](./Actrone_Open_Models_and_Inference_Endpoints_Plan.md)**.
- Wire `Resolver` into the Router's provider selection; managed path unchanged (back-compat: no key → managed).
- HTTP: `POST /v1/models/keys` (seal+validate), `POST /v1/models/keys/{id}/validate` (re-test), `GET /v1/models/keys` (masked list), `DELETE /v1/models/keys/{id}`, `GET /v1/models/catalog`.
- All write paths idempotent + RBAC-gated (`billing`/`platform` admin scope, see [Scoped RBAC](./Actrone_Scoped_RBAC_Plan.md)).

---

## 2. Custom REST/SDK builds — "write only your integration, get the whole platform"

> The ask: an enterprise wants EMAOP but with **custom REST/SDK** wiring into their own
> systems/SaaS, *without writing a lot of code* — then define capabilities, rules, persona
> and get full autonomous, governed agentic behaviour.

Actrone already has the seam: the [`connector.Adapter`](../backend/orchestrator/internal/connector/adapter.go) interface (`ID/Category/RequiredScopes/Fetch`) with a `custom_builder.go` slot, and every adapter's output is wrapped in `ConnectorResponse{Raw, ClassifiedFields, SchemaVersion}` **before MAL** — so any custom system inherits PII tokenisation, governance, and audit for free. Three escalating tiers of "low code → some code", so the customer writes *only* the part unique to them:

### Tier A — No-code Custom REST connector (Integration Hub builder)
Already specced in [EMAOP §6.4 Integration Hub](./EMAOP_Actrone_Integration_Plan.md). The admin: base URL + auth (API key / Bearer / OAuth2) → map endpoints to action types (read/write/event) → declare field schema + MAL classification per field → **Test in sandbox** → Activate. Zero code. Covers most REST SaaS. The credential seals in the vault; the platform handles retries/timeouts/circuit-breaking/scope-minimisation. **This is the default path and should be the headline.**

### Tier B — Custom SDK/code connector (thin adapter, governed harness)
For systems a declarative form can't express (custom signing, gRPC, SOAP, paginated GraphQL, weird auth). The customer implements **only** the `Adapter` interface (one `Fetch` method, ~30–60 lines) — or a language-native equivalent via a small **connector SDK**:
- Provide a `@actrone/connector-sdk` (TS) + `actrone-connector` (Python/Go) that exposes a typed base class: implement `fetch(query) → records[]`, declare field classifications, done. The SDK handles auth injection from vault, MAL wrapping, schema-hash drift, scope minimisation, retries.
- Deploy modes: (a) **in-platform** registered adapter (Go plugin / WASM via the `wazero` runtime already in go.mod — sandboxed customer code) or (b) **out-of-platform** "connector webhook" — the customer hosts a tiny HTTPS endpoint conforming to the connector contract, Actrone calls it with a signed request and vault-injected creds. Out-of-platform is the safest for arbitrary code and the easiest sell (they keep their code in their VPC).
- Everything downstream (capabilities, rules, persona, autonomy) is **identical to a built-in connector** — the agent doesn't know or care the connector is custom.

### Tier C — Custom agent logic via the Actrone SDK + their framework (BYOF)
If they want custom *agent reasoning* (not just a custom data source), that's the **BYOF path** (§3): write the agent in their framework, wrap it with the Actrone SDK, and it runs inside the governed orchestrator. Custom connector (A/B) + BYOF agent (C) compose.

**The pitch:** *"Write only the ~40 lines that are unique to your system. Capabilities, rules, persona, memory, governance, audit, multi-channel approvals, deployment, and autonomy come from Actrone — you don't build any of it."* This is dramatically less code than wiring OpenClaw skills by hand, and it's governed.

**Frontend:** the Integration Hub's "Custom" group gets three entry cards — *No-code REST* (Tier A wizard), *Code connector* (Tier B: SDK quickstart with real code blocks via Shiki + "connector webhook" registration), *Custom agent* (Tier C → routes to the BYOF build mode from [Agent Modes Plan](./Actrone_Agent_Modes_and_Onboarding_Plan.md)).

---

## 3. Framework adapters — OpenClaw, OpenAI Agents SDK, Cursor SDK (+ more)

> Add these to Actrone's **BYOF (bring-your-own-framework)** adapter set so agents built in
> them run under Actrone governance. Grounded in each framework's official docs.

### 3.1 The adapter model (how BYOF works)

> **Reality check (corrects an earlier draft):** a **Python SDK with framework adapters already
> exists** — `backend/src/actrone/` ships adapters for **LangChain, LangGraph, CrewAI, AutoGen,
> LlamaIndex, DSPy, Haystack** (plus a full client + CLI). **But every existing adapter binds only
> the framework's *memory*** (checkpointer / memory backend / retriever) — the framework still calls
> the model directly, *ungoverned*. So the work here is not "build adapters from scratch"; it is
> (a) bring the existing memory adapters to production grade, (b) add **inference + tool governance**
> to them, and (c) add the new frameworks. The full SDK/adapter program — three SDKs (Go, Python,
> **TypeScript**), the complete adapter matrix, and the prod-grade upgrade of the shipped seven —
> lives in its own plan: **[Actrone SDKs & Framework Adapters Plan](./Actrone_SDKs_and_Adapters_Plan.md)**. This section is the model-layer view.

The [Agent Modes Plan](./Actrone_Agent_Modes_and_Onboarding_Plan.md) defines `build_mode: byof`. An adapter binds a foreign framework to Actrone at **three increasing depths** (full detail in the SDKs & Adapters plan §2):

- **D1 — Memory (shipped, Python ×7):** the framework's memory/state/retrieval → Actrone's governed, persistent, multi-tenant memory. *This is all the current adapters do.*
- **D2 — Inference (the gateway; universal, ship first):** the foreign SDK points its model client at Actrone's **OpenAI-compatible gateway** (base-URL + Actrone key). Every inference then flows through MAL tokenisation, the Router (BYOK or managed), savings, and the audit spine — *with ~one line, regardless of language.* This works for **any** SDK that accepts an OpenAI-compatible base URL (OpenAI Agents SDK, Cursor SDK, OpenClaw, Vercel AI SDK, Mastra, Pydantic AI, Google ADK, Semantic Kernel, LangGraph, CrewAI, AutoGen, LlamaIndex). Build the gateway → every framework gets governed inference at once. **The gateway is complementary to the D1 memory adapters, not a replacement** — together they make a framework's *memory and inference* both governed.
- **D3 — Tool / Governance (per framework, deepest):** an SDK-specific shim routes the framework's **tool/handoff calls** through the Tool-Call Supervisor + DPE, and cross-agent handoffs through Ed25519 trust. Full governance on tool execution, not just inference.

"Full Actrone power" for a framework = **D1 + D2 + D3**. The realistic target is D1+D2 everywhere, D3 wherever the framework exposes a tool/handoff hook.

### 3.2 OpenAI Agents SDK
Official docs: [developers.openai.com/api/docs/guides/agents](https://developers.openai.com/api/docs/guides/agents), [openai.github.io/openai-agents-python](https://openai.github.io/openai-agents-python/). Built on four primitives — **Agents, Tools, Handoffs, Guardrails** — plus **Sessions** (automatic history) and a **Runner** that manages turns; defaults to the Responses API; also a [JS/TS SDK](https://github.com/openai/openai-agents-js).
- **Gateway bind:** set the SDK's client `base_url` to Actrone + an Actrone key → inference governed. Handoffs (modeled as `transfer_to_*` tools) and tool calls become visible to Actrone as tool calls.
- **Native bind:** map OpenAI **Guardrails** (input/output/tool guardrails — [docs](https://openai.github.io/openai-agents-python/guardrails/)) onto Actrone **DPE** so an org's DPE rules *are* the agent's guardrails; map **Handoffs** onto Actrone A2A + Ed25519 trust (so cross-agent handoffs are authenticated, which the SDK does **not** do natively — a clean Actrone upgrade); map **Sessions** onto Actrone memory. OpenAI's [human-review/approvals](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals) maps onto Actrone's DPE Tier-3 escalation + multi-channel approvals (§4).

### 3.3 Cursor SDK
Official: [cursor.com/blog/typescript-sdk](https://cursor.com/blog/typescript-sdk), [cursor.com/docs/cli/headless](https://cursor.com/docs/cli/headless). Shipped **2026-04-28**; `npm install @cursor/sdk` (public beta) — turns Cursor's coding agent into **headless infrastructure**: create/run/manage agents from code/CI; first-class **SSE run streaming** with reconnect via `Last-Event-ID`; the harness brings codebase indexing, MCP servers, skills, hooks, subagents; results merge into a PR / Slack / another flow. Headless CLI: `curl https://cursor.com/install` then `agent -p "…"`.
- **Use case in Actrone:** a *coding/DevOps* EMAOP agent. Actrone governs it as a BYOF agent whose tool surface is "the Cursor agent run." The **Connect** flow OAuths/keys Cursor; an Actrone agent task can spawn a Cursor run, **stream its SSE events into the Actrone chat/trace viewer** (we already consume SSE/WebSocket streams — [Chat Plan](./Actrone_Chat_Interface_Plan.md) reuses `ws.Broker`), and gate the run's side effects (PR creation, shell) behind DPE + capability flags. Cursor's output passes through MAL before it lands in audit.
- **Native bind:** model Cursor's background-agent result as an Actrone tool result; its MCP servers can be the *same* governed MCP connections Actrone already manages.

### 3.4 OpenClaw
Official/source: [openclawed-ai.com](https://openclawed-ai.com/), [GitHub guide](https://emergent.sh/learn/what-is-openclaw). Model-agnostic local runtime; messaging-platform UI; 700+ skills; Playwright browser; persistent memory; user-supplied model keys.
- **Positioning first:** OpenClaw is primarily a **competitor**, not a dependency — most users pick *Actrone instead of* OpenClaw. But supporting it as a BYOF adapter is a smart **migration on-ramp**: "Already run OpenClaw? Point it at Actrone and instantly get governance, audit, and team controls on top."
- **Adapter:** OpenClaw is model-agnostic with an OpenAI-compatible configuration, so the **gateway bind** is the play — set OpenClaw's model endpoint to Actrone. Its skills/browser actions then flow as governed tool calls; its messaging-channel UI can be **replaced or augmented** by Actrone's own governed channels (§4) so approvals become RBAC-checked and audited rather than a raw local chat. Frame the docs as *"OpenClaw, but auditable and safe for work."*
- **Security note:** OpenClaw has a documented [vulnerability taxonomy](https://arxiv.org/pdf/2603.27517) and even a [detection scanner](https://www.helpnetsecurity.com/2026/02/12/openclaw-scanner-open-source-tool-detects-autonomous-ai-agents/) — lean into this in positioning: ungoverned local autonomy is a security liability; Actrone is the governed alternative.

### 3.5 The full adapter set (existing + new)
**Already shipped (Python, D1 memory — upgrade to prod-grade + D2/D3):** LangChain, LangGraph, CrewAI, AutoGen, LlamaIndex, DSPy, Haystack.
**New to add:** OpenAI Agents SDK (py+ts), Cursor SDK (ts), Google ADK (py), Microsoft Agent Framework / Semantic Kernel (py, .NET later), Vercel AI SDK (ts), Mastra (ts), Pydantic AI (py), OpenClaw (runtime bridge).
The new TS-native frameworks (Vercel AI SDK, Mastra, Cursor, OpenAI Agents JS) **force the TypeScript SDK** into existence. A `FRAMEWORK_ADAPTERS` registry (id, name, `iconSlug`, **supported depths D1/D2/D3**, language, real package name, docs URL, quickstart snippet) drives the BYOF picker UI + docs, mirroring the integration catalog — and must show honest status (never "governed" until D2 is wired). **Full matrix, per-language homes, and prod-grade requirements: [Actrone SDKs & Framework Adapters Plan](./Actrone_SDKs_and_Adapters_Plan.md) §3–§7.**

### 3.6 Build order (model-layer slice; full SDK order in the SDKs & Adapters plan §7)
1. **OpenAI-compatible gateway** (D2, the universal bind) — unlocks *every* framework's governed inference at once + powers BYOK §1. Highest leverage.
2. **Prod-grade upgrade of the 7 shipped Python adapters** (+ D2 helpers) — protect the capability we already advertise.
3. **`@actrone/sdk` (TypeScript) core** — unblocks the TS framework wave + Next.js embedding.
4. **Framework registry + BYOF picker + per-framework quickstart docs** (real code blocks).
5. **New adapters:** OpenAI Agents SDK (py+ts, D3: guardrails→DPE, handoffs→A2A trust) → Vercel AI SDK + Mastra (ts) → Pydantic AI + Google ADK + Semantic Kernel (py) → Cursor SDK (ts, SSE→trace viewer) → **OpenClaw bridge + migration page**.
6. **Go SDK parity** (UpdateAgent/DeleteAgent/DeleteMemory/session-metadata/env/BYOK) + gateway client.

---

## 4. Multi-channel comms — Telegram / WhatsApp / Slack / email approvals

> The ask: an agent can message a user on Telegram/WhatsApp/email/Slack (per RBAC); the
> user chats, **approves/declines**, and executions run — plus alerts & notifications.

### 4.1 The seam already exists
[`notify`](../backend/orchestrator/internal/notify/service.go) already does **channel fan-out** (email + Slack today) with a curated alert `Catalogue`, per-user `Settings`, a `Vault` interface for channel secrets, and an `EmailSender`. The DPE **Tier-3 escalation queue** ([EMAOP §5.1](./EMAOP_Actrone_Integration_Plan.md)) already models "task pending human approval → on approve `workflow.Signal('escalation_approved')`". **Channels = a new delivery surface for escalations + a new inbound command path that resolves the same Signal.** This is an extension, not a new system.

### 4.2 Outbound: agent → user (alerts, notifications, approval requests)
Add channel adapters behind a `Channel` interface (`Send(ctx, recipient, msg) error`), mirroring `EmailSender`:
- **Telegram** — Bot API, **free, richest interactive surface** ([core.telegram.org/bots/api](https://core.telegram.org/bots/api), [buttons](https://core.telegram.org/api/bots/buttons)). Send an approval as a message with an **inline keyboard**: `[✅ Approve] [❌ Decline] [👁 View details]`, each carrying `callback_data` = the escalation id + action. **Recommend Telegram as the flagship channel** (free, instant, best buttons).
- **WhatsApp** — WhatsApp Business Cloud API with **interactive reply buttons** ([comparison](https://telegram-group.com/en/telegram-guides/telegram-bots-for-business-automate-engage-grow-2026/)); charges per conversation and needs template pre-approval — gate it as a Business/Enterprise add-on. Same Approve/Decline button payloads.
- **Slack** — interactive **Block Kit** message with Approve/Decline buttons + an Actions URL (extends the existing Slack webhook support; upgrade to a Slack app for interactivity).
- **Email** — existing `email.Service`; approval via **signed magic-link buttons** (Approve/Decline links carrying a short-TTL signed token) for channels without native buttons.

### 4.3 Inbound: user → agent (chat, approve, decline) — the governed loop
A new `internal/channels/` package + a single inbound webhook per provider (`POST /v1/channels/{provider}/webhook`, signature-verified):

```
1. Agent task hits DPE Tier-3 (or sends an alert). Escalation row created
   (existing escalation_queue), SLA countdown starts.
2. notify fans out to the approver's chosen channels (RBAC: only users whose
   actrone_roles grant emaop:approver for this agent/scope are messaged).
3. Approver taps [✅ Approve] in Telegram/WhatsApp/Slack (or the email magic link).
4. Inbound webhook verifies signature → maps callback_data → escalation id + action
   → re-checks RBAC + that the SLA hasn't expired + idempotency (a tap can't double-fire).
5. Resolve the escalation: approve → workflow.Signal("escalation_approved");
   decline → Signal("escalation_denied"). The Temporal workflow resumes/halts.
6. The channel message edits in place to "✅ Approved by Matt · 14:32" (audit-stamped).
7. The whole exchange — who, which channel, what they saw, decision, latency —
   lands in the tamper-evident audit spine. Channel approvals are first-class
   governed events, not side chatter.
```

**Conversational mode (beyond buttons):** a reply in the channel becomes a chat turn against the agent (same governed `AgentChat` pipeline as [Chat Plan](./Actrone_Chat_Interface_Plan.md), just a different transport). The channel is a thin client; **all governance runs server-side** — so a Telegram chat with an Actrone agent is MAL-tokenised, DPE-evaluated, and audited, which an OpenClaw Telegram chat is not. **This is the headline differentiator vs OpenClaw: same channel convenience, full governance underneath.**

### 4.4 RBAC + security (non-negotiable)
- **RBAC-gated** ([Scoped RBAC](./Actrone_Scoped_RBAC_Plan.md)): only `emaop:approver`/`admin` for the relevant scope can approve; a `viewer` gets read-only alerts, no buttons. The inbound handler re-verifies the *channel identity → Actrone user → role* binding on every action (a linked, verified channel account, established via a one-time deep-link verification — never trust a raw chat id).
- **Channel-account linking:** user links their Telegram/WhatsApp/Slack id to their Actrone identity via a signed deep link from Settings → Channels; stored as a verified mapping. Unlinked/unknown senders are ignored.
- Webhook **signature verification** on every inbound call; **idempotent** action handling (callback replay-safe); short-TTL signed tokens on email links; secrets (bot tokens) sealed in the vault; rate-limited; **no PII in channel messages beyond what MAL permits** (approval cards show tokenised/summarised context + a deep link to the full governed record in Control Tower, not raw salary/PII).
- **Per-env**: a prod approval and a dev approval are different bots/scopes; a dev channel can't approve prod.

### 4.5 Frontend
- **Settings → Channels**: connect Telegram (BotFather token or Actrone-hosted bot + deep-link link), WhatsApp (Business API onboarding, gated), Slack (OAuth app install), email (existing). Per-channel test ("send me a test approval"). Per-alert-type × per-channel matrix (extends the existing notify settings grid).
- **Agent Studio Step 5 / escalation chain**: choose which channels an agent's approvals go to, and the approver routing (primary → secondary → SLA breach), reusing the escalation spec.
- Approval cards rendered identically in-app and in-channel (consistent design language).

### 4.6 Backend shape
`internal/channels/`: `telegram.go`, `whatsapp.go`, `slack.go` (adapters), `webhook.go` (inbound router + signature verify + idempotency), `linking.go` (verified account mapping), `approval.go` (callback → RBAC → escalation resolve → Signal). Reuse `notify` for outbound fan-out and the `escalation_queue` for state. Migrations: `channel_links`, `channel_configs` (vault-pathed secrets, per tenant×env). All approval actions emit audit events.

---

## 5. Does EMAOP still leverage the whole Actrone stack? — Yes, by construction

Direct answer to *"Is everything EMAOP still leveraging everything about the Actrone SDK and orchestrator — memory, governance, and so on?"* — **Yes, and that is the deliberate architecture, not a coincidence.** EMAOP is defined as additive layers on the existing orchestrator ([EMAOP §0.0/§1 "extend, don't rebuild"](./EMAOP_Actrone_Integration_Plan.md)). Mapping every EMAOP capability to the Actrone primitive it rides:

| Actrone primitive | How EMAOP (and the features in this doc) use it |
|---|---|
| **Orchestrator (Temporal)** | Every EMAOP agent task is a durable workflow; MAL/DPE/audit/channel-approval insert as activities + signals. BYOF agents run *inside* this loop via the gateway bind (§3). |
| **Memory (Redis L1 + Qdrant L2)** | Agent context, persona continuity, and cross-channel conversation history. BYOF "sessions" map onto it. The thing OpenClaw does locally, Actrone does governed + multi-tenant. |
| **Governance (DPE + rules + eval)** | The guardrail on every inference, tool call, and **channel approval**. Foreign-framework guardrails map onto it (§3.2). |
| **MAL (tokenisation)** | Every connector (built-in, custom REST, custom SDK), browser response, and **channel message** is MAL-classified before the LLM — including BYOK paths. |
| **Audit spine (HMAC)** | Model changes, BYOK key lifecycle, every channel approval, every custom-connector call — all tamper-evident. |
| **Trust (Ed25519 A2A)** | Cross-agent handoffs, including those originating from OpenAI Agents SDK handoffs (which natively lack auth — Actrone upgrades them). |
| **Model layer (Router/providers)** | The home of BYOK (§1) and the OpenAI-compatible gateway (§3). Routing/savings/cache apply to managed *and* (for caching) BYOK. |
| **Actrone SDK (`actrone-go`)** | The native build path; the connector SDK (§2 Tier B) and framework adapters (§3) extend its surface. |
| **Entitlements + Scoped RBAC** | Gate BYOK, channels, custom connectors, framework adapters, and deployment per plan + per role. |

**The one rule:** a feature is only "EMAOP" if it composes these primitives. If any new surface tries to bypass governance/MAL/audit for convenience, it is wrong by definition — that bypass is exactly what makes OpenClaw unshippable for enterprises.

---

## 6. Premium enterprise look & feel — beating OpenClaw on trust + delight

OpenClaw wins hobbyists on raw capability; Actrone must win enterprises on **trust you can feel** + **delight you don't expect from compliance software.** Concrete UX commitments (all consistent with [§8 of CLAUDE.md](../CLAUDE.md) and the [Chat Plan](./Actrone_Chat_Interface_Plan.md)):

- **Governance made visible = trust made tangible.** Every autonomous action shows, inline, *what it was allowed to do and why it was safe*: the MAL "3 fields protected" badge, the DPE verdict chip, the "view in audit log" link, the live 6-step reasoning trace. Competitors show a spinner; Actrone shows a **glass cockpit**. Users trust what they can see governed.
- **The approval moment is the product.** When an agent pauses for a Tier-3 approval — in-app or on Telegram — it must feel *premium and reassuring*: a clear summary of the proposed action, the (tokenised) context, the rule that triggered it, the cost, one confident tap to approve. This is the moment that converts "scary autonomy" into "trusted colleague." Invest the most design here.
- **Real-time Control Tower** ([EMAOP §6.4](./EMAOP_Actrone_Integration_Plan.md)): live agent-state grid, token-budget gauges, emergency "Pause all", escalation panel with SLA countdowns. The feeling of *being in command* of a fleet of autonomous agents is the addictive core loop.
- **Premium motion + loaders** ([Chat Plan §4](./Actrone_Chat_Interface_Plan.md)): branded staged ProcessLoaders ("Connecting → Thinking → Querying Salesforce → Governing → Writing"), not generic spinners — every wait communicates competence.
- **Zero-anxiety design:** no surprise bills (caps + pre-emptive alerts, monetization §7), no surprise actions (everything gated/auditable), no surprise data exposure (MAL). The emotional target: *"this is the safe, beautiful way to run autonomous agents."*
- **Honest, characterful brand** (Space Grotesk display + Geist, warm-grey + iOS-red tokens) — committed and distinctive, never a generic dashboard template.

The thesis: **OpenClaw makes you nervous (it's powerful and ungoverned); Actrone makes you confident (it's powerful and you can see every guardrail).** Confidence is what an enterprise pays for and what makes daily use addictive.

---

## 7. Agent deployment UX — Vercel-benchmarked

> Research the Vercel deployment experience and implement it (and better) for EMAOP agent
> deployment; borrow more from Vercel where useful.

Vercel's deployment model ([promoting](https://vercel.com/docs/deployments/promoting-a-deployment), [environments](https://vercel.com/docs/deployments/environments), [instant rollback](https://vercel.com/docs/deployments/rollback-production-deployment), [rolling releases](https://vercel.com/docs/rolling-releases)) maps almost perfectly onto agent lifecycle. The mental model to adopt: **an agent manifest version is a "deployment"; environments are dev/staging/prod (already planned, [Infra Plan §3](./Actrone_Infrastructure_and_Environments_Plan.md)); promotion and instant rollback work at the routing layer.**

### 7.1 What to borrow directly
| Vercel concept | Actrone agent-deployment equivalent |
|---|---|
| **Deployment = an immutable build** | **Agent version = an immutable manifest** (already hashed: `ManifestHash = SHA-256(manifest)`, [EMAOP §5.2](./EMAOP_Actrone_Integration_Plan.md)). Each deploy is a pinned, signed version. |
| **Preview deployments** | **Sandbox/preview agent**: deploy a manifest version against synthetic data (onboarding sandbox) — try before it touches prod, with a live reasoning trace ([EMAOP §6.3](./EMAOP_Actrone_Integration_Plan.md)). |
| **Promote preview → production** | **Promote sandbox-validated version → live env**: ellipsis menu → "Promote to Production". Re-runs validation, flips the active version. |
| **Instant rollback (routing-layer, seconds, no rebuild)** | **Instant agent rollback**: every agent already versions its manifest; flip the active pointer to a prior version in seconds — no redeploy. *Critical safety feature for autonomous agents.* Pro+ can roll back to any prior version; Free to the immediately previous. |
| **Rolling releases (canary %, then 100%)** | **Canary agent rollout**: route X% of an agent's task volume to the new manifest version, watch DPE-verdict/error/cost deltas, then promote to 100% or instant-rollback. The orchestrator already routes tasks — gate by version weight. |
| **Deployments list + status + logs** | **Agent Deployments tab**: every version with status (building/validating/live/rolled-back), who deployed, manifest diff, the validation/sandbox result, and a deep link to that version's audit trace. |
| **Production checklist** | **Go-live checklist** per agent: persona set, capabilities reviewed, rules attached, connectors live, escalation chain + channels set, sandbox passed, budget set — the Layer-3 onboarding checklist *is* this. |
| **Git-connected auto-deploy** | **SDK/CI deploy**: `actrone deploy` from CI (native + BYOF), so a manifest in the customer's repo auto-deploys to an env on push — the "git push to deploy" feel for agents. |

### 7.2 More Vercel patterns worth stealing
- **The deployment detail page** (build logs, source, env, domains) → **agent version detail** (validation logs, manifest source, env, bound connectors, the reasoning trace of its sandbox run).
- **Environment variables UI** (scoped per env, encrypted, reveal-once) → already planned for **API keys + now BYOK provider keys** per env ([Infra §3.5](./Actrone_Infrastructure_and_Environments_Plan.md)) — mirror Vercel's exact UX (masked, per-env, reveal-once, last-used).
- **Comments/collaboration on previews** → **review-on-sandbox**: teammates comment on a sandbox agent run before promotion (ties to escalation/approver UX).
- **Activity log** → already covered by the audit spine; surface a Vercel-style human-readable activity feed on top.
- **Instant, confident, "it just shipped" microcopy + motion** — the deploy success state should feel as good as Vercel's. The emotional payoff of "your agent is live" matters.

### 7.3 Where Actrone goes *better* than Vercel
- **Governed deploys:** a promotion to prod can be **gated by DPE/approval** (deploying an agent with `browser_autonomous` requires an approver) — Vercel has no governance equivalent.
- **Audited deploys:** every promotion/rollback is a tamper-evident audit event with the manifest diff — regulator-grade deploy history.
- **Sandbox = real execution, not a static preview:** the preview *actually runs the agent* against synthetic data and shows the reasoning trace — richer than a static web preview.
- **Capability/cost diff on promote:** "this version adds `send_email` + raises budget to $500/mo — approve?" — a governance-aware deploy gate.

### 7.4 Frontend
New **`agents/[id]/deployments`** surface (or a tab on agent detail): versions list (reuse `useDataView`), promote/rollback actions (RBAC-gated, confirm modals with diff), canary slider, validation/sandbox result panel, per-version audit deep link. New backend: version pointer + weighted routing in the orchestrator; `POST /v1/agents/{id}/promote`, `/rollback`, `/canary`; all idempotent + audited.

---

## 8. Monetization deltas (summary — full detail in monetization §15)

Every feature here is a revenue point; consolidated into [monetization-strategy.md §15](./monetization-strategy.md):
- **BYOK vs managed** — two pricing modes; BYOK = governance/platform fee per governed task (no token markup), managed = subscription + routing dividend. BYOK is an **enterprise-trust unlock** (direct provider billing/contracts) that wins deals procurement would otherwise block.
- **Channels** — Telegram/Slack included on paid tiers; **WhatsApp Business as a metered add-on** (per-conversation cost passes through + margin).
- **Custom connectors** — no-code REST included (Pro+); code/SDK connectors + connector-webhook hosting (Business+); professional-services for bespoke (Enterprise).
- **Framework adapters** — gateway bind drives **routing-dividend revenue from BYOF agents** (LangGraph/CrewAI/OpenAI SDK/Cursor users routing through Actrone) — a large TAM expansion: *governance + routing for agents built elsewhere.*
- **Deployment** — canary/rolling + instant rollback + governed deploys as a Business/Enterprise capability gate.
- **OpenClaw migration** — a funnel: convert OpenClaw's 68k-star user base with "keep your setup, add governance."

---

## 9. Recommended sequencing

1. **OpenAI-compatible gateway** — unlocks BYOK (§1) *and* every framework adapter (§3) at once. Single highest-leverage build.
2. **BYOK model keys** (§1): `modelkeys` store + validator (the "say-hi" test) + Settings → Models + cost-transparency blocks.
3. **Channels** (§4): Telegram first (free, best buttons) → Slack app → email magic-links → WhatsApp (gated). Approval loop wired to the existing escalation queue.
4. **Custom REST connector (Tier A)** no-code builder polish + connector SDK (Tier B).
5. **Framework registry + BYOF picker + quickstart docs**; OpenAI Agents SDK native bind; Cursor SDK; OpenClaw migration page.
6. **Agent deployments** (§7): versions list + instant rollback → canary → governed/audited promote.
7. **Premium polish pass** (§6) across approvals, Control Tower, loaders.

Each item is independently shippable, governed by entitlements + scoped RBAC, and rides the existing orchestrator/vault/audit/notify seams — no parallel systems.

---

*Sources: [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) · [OpenAI Agents guide](https://developers.openai.com/api/docs/guides/agents) · [OpenAI guardrails/approvals](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals) · [Cursor SDK](https://cursor.com/blog/typescript-sdk) · [Cursor headless CLI](https://cursor.com/docs/cli/headless) · [OpenClaw guide](https://emergent.sh/learn/what-is-openclaw) · [OpenClaw (Milvus)](https://milvus.io/blog/openclaw-formerly-clawdbot-moltbot-explained-a-complete-guide-to-the-autonomous-ai-agent.md) · [OpenClaw security taxonomy](https://arxiv.org/pdf/2603.27517) · [Telegram Bot API](https://core.telegram.org/bots/api) · [Telegram buttons](https://core.telegram.org/api/bots/buttons) · [BYOK enterprise (Augment)](https://www.augmentcode.com/guides/byok-enterprise-agent-rollouts) · [Vercel BYOK](https://vercel.com/docs/ai-gateway/authentication-and-byok/byok) · [Vercel promote](https://vercel.com/docs/deployments/promoting-a-deployment) · [Vercel rollback](https://vercel.com/docs/deployments/rollback-production-deployment) · [Vercel rolling releases](https://vercel.com/docs/rolling-releases)*

*Last updated: 2026-06-11 · Planning only.*
