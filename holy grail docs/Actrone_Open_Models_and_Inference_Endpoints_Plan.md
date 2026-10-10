# Open Models & Inference Endpoints Plan

**Version 1.0 — June 2026 · ✅ SHIPPED as Master-Plan P4-B (generic `OpenAICompatibleProvider`, open-model API presets, self-hosted endpoints + SSRF guard, native Bedrock/Azure/Vertex adapters) + the Model Catalog & Thinking Controls plan (no-direct-China policy). This doc captures the original analysis; authoritative status: [Platform Evolution §0a](./Actrone_Platform_Evolution_Master_Plan.md#0a-implementation-status-verified-2026-06-24).**
>
> **Status refreshed 2026-07-13 (code-verified):** the generic `OpenAICompatibleProvider` +
> aggregator/self-hosted preset catalog (`modelkeys/presets.go`, §2) is confirmed live — it's the same
> code path this pass verified for the no-direct-China policy and `ThinkingDialect` wiring (see
> `Actrone_Model_Catalog_GLM_Kimi_and_Thinking_Controls_Plan.md`'s refresh note). The reachability
> matrix (§3, patterns A–D) and native cloud adapters (§4) were **not** independently re-verified this
> pass — treat those sections as unverified 2026-07-13.

> How Actrone serves users who want **open-source / open-weight models** — whether via
> aggregator APIs (OpenRouter, Together, Groq, Fireworks, DeepInfra, Meta's Llama API…),
> their **own inference servers** (vLLM, Ollama, SGLang, llama.cpp, LM Studio, LocalAI),
> or cloud model platforms (Bedrock, Vertex, Azure AI, Hugging Face). Generalises **BYOK**
> from "your OpenAI/Anthropic key" to **"any model source,"** all governed identically.
> Ships as **Actrone**. Extends [EMAOP Models §1 (BYOK)](./Actrone_EMAOP_Models_Extensibility_Channels_Plan.md), [SDKs & Adapters (the gateway)](./Actrone_SDKs_and_Adapters_Plan.md), [Master Plan P4](./Actrone_Master_Implementation_Plan.md).

---

## 0. The unifying insight — OpenAI-compatibility is the lingua franca

Research finding ([XALEN gateway survey](https://xalen.io/guides/openai-compatible-api-gateways-2026), [Fireworks: best LLM API providers](https://fireworks.ai/blog/best-llm-api-providers), [GIGAGPU self-hosted guide](https://gigagpu.com/openai-compatible-api-self-hosted-guide/), [LiteLLM docs](https://docs.litellm.ai/docs/)): **almost the entire open-model ecosystem — aggregators *and* self-hosted servers — exposes a drop-in OpenAI-compatible `/v1/chat/completions` + `/v1/models` endpoint.** "Switching between them usually means changing the base URL and API key, nothing more."

Two consequences for Actrone:
1. **The provider we already have nearly covers it.** [`model.OpenAIProvider`](../backend/orchestrator/internal/model/openai.go) already carries a `baseURL` field (used today to adapt Mistral). A **generic "OpenAI-compatible provider"** = that provider + a configurable base URL + a per-tenant key. One provider type unlocks dozens of sources.
2. **Actrone's own gateway (P4-A) is "LiteLLM, but governed."** LiteLLM is the popular self-hosted OpenAI-compatible proxy that normalises 100+ providers behind one endpoint. Actrone's gateway does the same **plus** MAL tokenisation, DPE policy, audit, routing, and savings. We are not competing with LiteLLM — we are the governed superset, and we can even *consume* a customer's existing LiteLLM as one upstream.

**So the work is mostly catalog + UX + reachability + a few native adapters — not new inference plumbing.**

---

## 1. Taxonomy — the five model sources

Every model an agent can use resolves to one of five **source kinds**. The Router/gateway treats them uniformly behind the `model.Provider` interface; only resolution + credential handling differ.

| # | Source kind | Examples | Wire format | Credential | Reachability |
|---|---|---|---|---|---|
| **1** | **Actrone-managed** | Our hosted models (current platform keys) | native per provider | Actrone's keys | n/a |
| **2** | **Frontier BYOK** | OpenAI, Anthropic, Gemini, Mistral | native (already have providers) | tenant key (vault) | public |
| **3** | **Open-model API (BYOK)** | OpenRouter, Together, Groq, Fireworks, DeepInfra, Novita, Cerebras, Anyscale, **Meta Llama API**, AI/ML API | **OpenAI-compatible** | tenant key (vault) | public |
| **4** | **Self-hosted endpoint** | vLLM, SGLang, Ollama, llama.cpp, LM Studio, LocalAI, Jan, HF TGI, a customer's LiteLLM | **OpenAI-compatible** | optional key (vault) | **public OR private (the hard part — §3)** |
| **5** | **Cloud native adapter** | AWS Bedrock, Google Vertex, Azure AI Foundry, Hugging Face Inference Endpoints, Replicate | **native (mostly not OpenAI shape)** | cloud creds (vault) | public/PrivateLink |

Kinds **3 and 4 collapse onto a single generic OpenAI-compatible provider** (§2). Kind 5 needs per-provider adapters (§4). Kind 2 already exists. This is the **generalisation of BYOK** — the [Models §1 BYOK](./Actrone_EMAOP_Models_Extensibility_Channels_Plan.md) `modelkeys` design becomes a **model-source binding** that carries a `kind` + optional `base_url`.

### 1.1 Data-model change (extends P4-B `provider_keys`)
Rename/extend to **`model_endpoints`**:
```
id, tenant_id, env, kind (managed|frontier_byok|openai_compatible|self_hosted|native_adapter),
provider_or_preset (e.g. "openrouter" | "groq" | "vllm" | "bedrock"),
display_name, base_url (nullable), region (nullable, native),
vault_ref (sealed key/creds — NEVER plaintext), masked_hint,
default_model, model_allowlist (nullable), reachability (public|private_tunnel|private_link|loopback),
status, last_validated_at, created_by
```
The `Resolver` (P4-B) returns the right `Provider` for `(tenant, env, agent)` from this table; **managed stays the back-compat default** when a tenant has no binding.

---

## 2. The generic OpenAI-compatible provider + preset catalog (kinds 3 & 4)

### 2.1 One provider type
A `model.OpenAICompatibleProvider` (thin generalisation of `OpenAIProvider`): `base_url`, `api_key` (from vault, may be empty for keyless local servers), `model_id`, plus small per-preset quirks (some omit certain fields, some need a custom header). Reuses the existing SSE streaming, retries (Router), circuit breaker, and `CountTokens`. **This single type serves every kind-3 aggregator and every kind-4 self-hosted server.**

### 2.2 The preset catalog (`OPEN_MODEL_PRESETS`)
A living catalog (frontend + backend) so users pick a brand, not paste a URL. Each preset: `id, name, iconSlug, base_url, auth (key|none), model_discovery (list_models|static|manual), docs_url, tier_gate, notes`. Researched 2026 set:

**Open-model aggregator APIs (kind 3):**
- **OpenRouter** — broadest catalog (300+ models), one key → many models ([survey](https://www.morphllm.com/openrouter-alternative)).
- **Together AI** — fastest open-source inference, lowest per-token ([Fireworks survey](https://fireworks.ai/blog/best-llm-api-providers)).
- **Groq** — lowest first-token latency (LPU); Llama/Qwen/Gemma.
- **Fireworks AI** — best structured output; fast OSS.
- **DeepInfra**, **Novita**, **Cerebras**, **Anyscale**, **AI/ML API**, **XALEN** — all OpenAI-compatible.
- **Meta Llama API** (official) — first-party Llama.
- **DeepSeek**, **Mistral**, **Together** — *already partially wired at platform config level* (`DeepSeekAPIKey`, `MistralAPIKey`, `TogetherAPIKey`); promote them to per-tenant BYOK presets.

**Self-hosted server presets (kind 4):**
- **vLLM** — production default (PagedAttention, continuous batching) ([TensorFoundry](https://tensorfoundry.io/blog/llm-inference-servers-compared), [Spheron](https://www.spheron.network/blog/ollama-vs-vllm/)).
- **SGLang** — production GPU tier, OpenAI-compatible + native `/generate`.
- **Ollama** — local/dev; `/v1/chat/completions` + `/v1/models` ([GIGAGPU](https://gigagpu.com/openai-compatible-api-self-hosted-guide/)); narrower concurrency — flag "not for high-concurrency prod."
- **llama.cpp server**, **LM Studio**, **LocalAI**, **Jan** — local/desktop OpenAI-compatible servers.
- **Hugging Face TGI** — OpenAI Messages API, **but archived/maintenance-mode since March 2026** ([TensorFoundry]) — list as legacy, steer new users to vLLM/SGLang.
- **"Custom OpenAI-compatible endpoint"** — the catch-all: paste base_url (+ optional key, + model name). Covers anything not in the preset list, incl. a customer's **LiteLLM** proxy.

### 2.3 Model discovery
Where the endpoint implements `GET /v1/models` (most do), Actrone lists available models automatically; otherwise the user types the model id. Cache discovery per binding with a short TTL; re-discover on validate.

---

## 3. Self-hosted endpoints — the reachability matrix (the genuinely hard part)

For kind 4, the orchestrator must be able to **reach** the customer's inference server. Public endpoints are trivial (TLS + optional key). Private ones (in the customer's VPC / on-prem) need one of four patterns — ordered by enterprise-grade isolation ([AWS PrivateLink for SaaS](https://aws.amazon.com/blogs/networking-and-content-delivery/extend-saas-capabilities-across-aws-accounts-using-aws-privatelink-support-for-vpc-resources), [GCP Private Service Connect](https://cloud.google.com/vertex-ai/docs/predictions/private-service-connect), [BentoML BYOC](https://bentoml.com/llm/infrastructure-and-operations/bring-your-own-cloud)):

| Pattern | How | Best for | Tier |
|---|---|---|---|
| **A. Public endpoint + auth** | Customer exposes `https://llm.acme.com` with a bearer key; Actrone calls it directly (TLS required, key in vault). | Quick start; teams comfortable exposing a guarded endpoint | Pro+ |
| **B. Self-hosted / BYOC Actrone** | The whole Actrone control plane runs in the customer's VPC (Helm chart); the orchestrator reaches the inference server over the **internal network / loopback** — no exposure at all. | Strict data-residency / air-gapped; the cleanest answer | Enterprise (already the [Sovereign tier](./monetization-strategy.md)) |
| **C. Private link** | **AWS PrivateLink / GCP Private Service Connect** between Actrone's VPC and the customer's endpoint — private, no public IP, low latency. | Enterprises on AWS/GCP that want SaaS Actrone but private model traffic | Enterprise |
| **D. Outbound tunnel agent** | A lightweight **Actrone Edge Connector** the customer runs inside their network: it **dials out** to Actrone (no inbound firewall change) and reverse-proxies governed requests to the local server. | Customers who can't do PrivateLink and won't expose a public endpoint | Business/Enterprise add-on |

**Recommendation:** ship **A** first (covers most), document **B** (already our self-host story), build **D** (the Edge Connector) as the differentiated middle option, and add **C** for large AWS/GCP accounts on demand. The Edge Connector (D) is the highest-leverage *new* build — it makes "use your private GPU cluster with governed Actrone SaaS" possible without networking projects.

### 3.1 Security for user-supplied endpoints (mandatory — CLAUDE.md §5)
- **SSRF defense (critical):** the base_url is user input. Validate scheme (`https`, or `http` only for explicit loopback/Edge-Connector), **deny private/link-local/metadata ranges** (`169.254.0.0/16`, `127.0.0.0/8` except the Edge-Connector path, `10/8`, `172.16/12`, `192.168/16`, `::1`, cloud metadata `169.254.169.254`) when called from the SaaS data plane, and resolve+pin DNS to prevent rebinding. A self-hosted Actrone (pattern B) relaxes this since loopback IS the target.
- **Egress allowlist + per-binding rate/spend caps**; TLS required for non-loopback; bounded response size; timeouts on every call.
- Key/creds **sealed in the vault** (reuse `mcphub.CredentialVault` AES-256-GCM), never logged/returned (masked hint only) — same discipline as BYOK.
- The endpoint's responses pass through **MAL** before the LLM boundary, exactly like any provider — a self-hosted model is governed identically.

---

## 4. Cloud native adapters (kind 5)

Where the platform is **not** OpenAI-shaped, add a dedicated `model.Provider` implementation behind the existing interface. Demand-ordered:
- **AWS Bedrock** — open models (Llama, Mistral, etc.) via the **Converse API**; SigV4 auth; region. High enterprise demand (Bedrock is the leading enterprise aggregator — [comparison](https://dev.to/ciroveldran/aws-bedrock-vs-azure-openai-vs-vertex-ai-2026-enterprise-comparison-4no5)).
- **Google Vertex AI** — `predict`/`generateContent`; chat-template formatting; *note Vertex also now offers an OpenAI-compatible endpoint* — prefer that path where available (collapses to kind 3).
- **Azure OpenAI / Azure AI Foundry** — near-OpenAI with deployment names; thin adapter.
- **Hugging Face Inference Endpoints** — Messages API/TGI is **OpenAI-compatible** → usually kind 4 (just a base_url), no native adapter needed.
- **Replicate** — async prediction API (submit→poll); different shape; lowest priority.

Each adapter reuses the Router/breaker/MAL/audit; only request/response mapping + auth differ. Gate behind entitlements (`enterprise_connectors`-style) where appropriate.

---

## 5. Validation & health (generalises the BYOK "say-hi" test)

Per binding, on create + on demand:
- **Kind 2/3 (API key):** the two-stage test from [Models §1.4](./Actrone_EMAOP_Models_Extensibility_Channels_Plan.md) — cheap `GET /v1/models` (or metadata) pre-check, then a tiny greeting completion proving the key is **valid AND funded**. Returns the greeting; never exposes the key.
- **Kind 4 (self-hosted):** a **connectivity + capability** check — reach the base_url, `GET /v1/models` to confirm the server is up and the requested model is loaded, then a 1-token completion to confirm it actually generates. Surface latency (self-hosted perf varies wildly). For the Edge Connector, validate the tunnel is connected.
- **Kind 5 (native):** provider-specific lightweight call (e.g. Bedrock `ListFoundationModels` + a tiny `Converse`).
- Health is **re-checked periodically** for self-hosted/native (they go down); a failing endpoint flips the binding to `degraded` and (per routing policy) falls back to managed/another binding + fires a `notify` alert.

---

## 6. How it composes with the rest of P4

- **Router (existing):** open + closed models become **routing targets**. Cost-routing now means "simple tasks → a cheap open model on Groq/Together; complex → frontier" — a big savings lever. `routing_strategy` is unchanged; the Resolver just supplies more providers. Per-tenant multi-binding routing (a tenant's own Groq + Anthropic) is the BYOK multi-key story made real.
- **Gateway (P4-A):** accepts OpenAI-shaped requests and resolves to *any* of the five kinds — so a BYOF framework pointed at Actrone can transparently run on the tenant's self-hosted vLLM, governed.
- **BYOK (P4-B):** this doc **is** the generalisation — implement `model_endpoints` (not just `provider_keys`) and the generic OpenAI-compatible provider from the start, so open models aren't a bolt-on later.
- **Entitlements + scoped RBAC + env:** bindings are per-env (a dev vLLM ≠ prod), gated by plan (self-hosted/Edge-Connector/native at higher tiers), and managed by the `billing`/`platform` scope.
- **Monetization:** open models slash COGS and supercharge the **savings dividend** (managed) and make **BYOK/self-hosted** attractive (customer pays their own GPU/Together bill; Actrone takes the governance fee). Add to [monetization §15](./monetization-strategy.md): *self-hosted endpoint = pure governance-fee revenue, zero token COGS to us; Edge Connector = a Business/Enterprise add-on.* Strengthens the [cost-leadership](./cost-leadership-and-quality-waves.md) story.

---

## 7. UX — Settings → Models (extends the BYOK surface)

Source-typed sections (reuse the BYOK UI from Models §1.3):
- **Managed** (default; pick model + routing strategy).
- **Frontier BYOK** (OpenAI / Anthropic / Gemini / Mistral — key + validate).
- **Open-model API** (preset grid: OpenRouter / Together / Groq / Fireworks / DeepInfra / Llama API / … → key + validate + model discovery).
- **Self-hosted endpoint** (preset: vLLM / Ollama / SGLang / LM Studio / LocalAI / Custom → base_url + optional key + model + **reachability picker** [public / Edge Connector / PrivateLink / loopback] + connectivity test + latency readout).
- **Cloud (native)** (Bedrock / Vertex / Azure — creds + region).
Per binding: official `IntegrationIcon`, env badge, status (valid/degraded), masked hint, "set as default for env / for agent," cost-per-1k preview where known. All reveal-once for secrets; full a11y; loading/empty/error states.

---

## 8. Sequencing (within P4, alongside gateway + BYOK)

1. **Implement `model_endpoints` + the generic `OpenAICompatibleProvider` + Resolver** as the *core* of P4-B (not `provider_keys` narrowly) — gets frontier BYOK **and** every open-model API (kind 3) in one shot.
2. **Preset catalog** (`OPEN_MODEL_PRESETS`) + Settings → Models source-typed UI.
3. **Self-hosted (kind 4) public endpoints (pattern A)** + SSRF defense + connectivity/health check.
4. **Gateway (P4-A)** resolves to any binding (open models become BYOF inference targets).
5. **Cost-routing across open+closed** (Router policy surfacing in the UI: "route simple tasks to {cheap open model} to save ~$X").
6. **Edge Connector (pattern D)** — the differentiated private-endpoint build.
7. **Native adapters** — Bedrock first, then Vertex; others on demand.
8. **PrivateLink/PSC (pattern C)** for large AWS/GCP accounts.

Items 1–3 fold directly into the P4-B work already planned; 4–5 ride P4-A; 6–8 are follow-ons (Business/Enterprise).

---

*Sources: [XALEN OpenAI-compatible gateways 2026](https://xalen.io/guides/openai-compatible-api-gateways-2026) · [Fireworks: best LLM API providers](https://fireworks.ai/blog/best-llm-api-providers) · [OpenRouter alternatives](https://www.morphllm.com/openrouter-alternative) · [Infrabase inference providers](https://infrabase.ai/blog/ai-inference-api-providers-compared) · [GIGAGPU self-hosted OpenAI-compatible](https://gigagpu.com/openai-compatible-api-self-hosted-guide/) · [TensorFoundry vLLM/SGLang/llama.cpp/Ollama](https://tensorfoundry.io/blog/llm-inference-servers-compared) · [Ollama vs vLLM](https://www.spheron.network/blog/ollama-vs-vllm/) · [LiteLLM docs](https://docs.litellm.ai/docs/) · [Bedrock vs Vertex vs Azure 2026](https://dev.to/ciroveldran/aws-bedrock-vs-azure-openai-vs-vertex-ai-2026-enterprise-comparison-4no5) · [AWS PrivateLink for SaaS](https://aws.amazon.com/blogs/networking-and-content-delivery/extend-saas-capabilities-across-aws-accounts-using-aws-privatelink-support-for-vpc-resources) · [GCP Private Service Connect](https://cloud.google.com/vertex-ai/docs/predictions/private-service-connect) · [BentoML BYOC](https://bentoml.com/llm/infrastructure-and-operations/bring-your-own-cloud)*

*Last updated: 2026-06-13 · Planning only.*
