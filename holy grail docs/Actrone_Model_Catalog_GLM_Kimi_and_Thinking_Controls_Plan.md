# Actrone Provider-Neutral Thinking Controls & Per-Provider Model Picker (+ No-Direct-China Model Policy)

> **Status:** ✅ **FULLY COMPLETE (M0–M5, 2026-06-24)** — `go build`/`vet`/`go test ./...` green; frontend
> typecheck/lint/build clean. Shipped end-to-end: M0 no-direct-China policy enforcement (`modelkeys/china_policy.go`,
> DeepSeek direct removed, cheap-tier → Gemini 3.5 Flash) · M1 provider-neutral `ThinkingDialect` (closed the
> linchpin gap — reasoning now works across the whole OpenAI-wire catalog) · M2 `ModelCard` catalog + `GET
> /v1/models/catalog` · M3 frontend `ModelPicker` + `ThinkingControl` + live `?binding` discovery + per-turn chat
> override · M4 the four moats (governed per-env effort ceilings + per-task/aggregate reasoning-spend ledger +
> adaptive/complexity routing + reasoning-trace redaction + tool-call smoke) · M5 Playground + docs. **Plus**
> true split-rate pricing (single source of truth + anti-drift test), the EMAOP→AgentFile Studio compiler +
> create/edit model-&-effort UI (`/agents/[id]/settings`), and Go/Python/TS SDK effort parity. **Designed-not-built
> follow-up:** monetization-tier effort gating (rides P7). Per-increment record: memory `model-catalog-glm-kimi-thinking`.
>
> **Status refreshed 2026-07-13 (code-verified) — independently re-confirmed, no drift found:**
> the no-direct-China policy is enforced at **three** call sites (`modelkeys/china_policy.go` denylist +
> `modelkeys/resolver.go` bind-time block + `handler/http/models.go` create/validate +
> `catalogdrift/checker.go` skip), `modelkeys/presets.go` has zero direct China-host presets, and xAI
> Grok is present as a legitimate BYOK-only preset (US-operated, not subject to the policy). The
> "linchpin" `ThinkingDialect` fix is confirmed live: `model/openai_compatible.go` calls
> `applyThinkingDialect` inside the actual request builder, and `modelkeys/resolver.go` assigns the
> right dialect per preset (OpenRouter/Groq get their native reasoning knob; other aggregators get
> `ThinkingNone` passthrough, still parsing `reasoning_content`). One addition not previously called
> out: **`catalogdrift`** is wired as a **runtime/admin HTTP check** (`main.go`,
> `handler/http/models.go`), not a CI gate — no GitHub Actions reference to it was found. If any
> downstream doc claims CI-gated drift detection, that's an over-claim; the mechanism is real but
> operator-triggered, not build-time.
>
> **SCOPE CHANGE 2026-06-23 (owner directive):** *do away with direct
> first-party API access to Chinese models — GLM, Kimi, DeepSeek, Qwen.* They are reachable **only** via
> aggregators (OpenRouter, Together, Groq, Fireworks, DeepInfra, …) or **self-host** (vLLM/SGLang). No branded
> direct presets for them, and the **existing DeepSeek direct preset + managed third-tier fallback are removed**
> (§4.1–4.2). Extends
> [Actrone_Open_Models_and_Inference_Endpoints_Plan.md](Actrone_Open_Models_and_Inference_Endpoints_Plan.md)
> and [Actrone_EMAOP_Models_Extensibility_Channels_Plan.md](Actrone_EMAOP_Models_Extensibility_Channels_Plan.md) §1.
>
> *(Filename retains "GLM_Kimi" for link stability; the work is now thinking-controls + model-picker + the
> no-direct-China policy. Rename optional.)*
>
> **Scope:** (1) **policy:** no direct first-party Actrone connection to China-operated model endpoints — Chinese
> open models are reached through a (US/EU) aggregator or the customer's own infra only; **remove the DeepSeek
> direct preset + managed fallback**; (2) make extended-thinking a first-class, **provider-neutral** control
> across the providers we *do* offer directly (OpenAI, Anthropic, Gemini, Mistral) **and every aggregator**
> (OpenRouter, Together, Groq, Fireworks, DeepInfra, Novita, Cerebras, …) **and self-host** — enable/disable +
> effort level (off → max); (3) ship a **per-provider model picker** in the Control Tower showing each
> provider's models + capabilities, with **price chips only for Actrone-managed models** (BYOK/aggregator uses
> the user's own key, so the provider — not Actrone — bills; §5.1); (4) do this **everywhere models are used**;
> (5) build the moats that make it defensible.
>
> Last updated: 2026-06-23 | Owner: Matt

---

## 0. Why this, why now

Actrone's differentiator is **model-neutral, governed, cost-optimised** agent execution. Three things drive this plan:

1. **Data-residency / trust posture (the scope change).** Actrone will **not** open a direct first-party
   connection to a China-operated model API (Z.ai, Moonshot, DeepSeek, Alibaba/Qwen). Enterprises do not want
   their prompts and data flowing straight to those endpoints, and we don't want to own that data-handling
   liability. The capable open weights (GLM-5.2, Kimi K2.6/K2.7, DeepSeek V4-Pro, Qwen3.x) are excellent — so
   anyone who wants them reaches them through a **US/EU aggregator** (OpenRouter, Together, Groq, Fireworks, …)
   that sits in front, or **self-hosts** them (vLLM/SGLang) inside their own boundary. We therefore **add no
   GLM/Kimi direct presets**, and we **remove the existing DeepSeek direct preset and its managed third-tier
   fallback** (a direct call to `api.deepseek.com`). This is a deliberate, defensible compliance stance — not a
   capability gap, because the same models remain one aggregator-binding away.
2. **Thinking gap (the linchpin build).** `CompletionRequest.ReasoningEffort` (`off|low|medium|high`) is honoured
   **only by the native Anthropic and Bedrock providers**. Every OpenAI-wire provider — OpenAI's own reasoning
   models, and *every aggregator* (which is exactly how customers now reach GLM/Kimi/DeepSeek/Qwen) — **silently
   ignores it** today ([openai_compatible.go](../backend/orchestrator/internal/model/openai_compatible.go)
   `buildRequest` never emits a reasoning field, and `streamSSE` never reads `reasoning_content`). So "thinking"
   is invisible and uncontrollable for ~80% of the catalog. Fixing this is the linchpin — and it matters *more*
   under the new policy, because the aggregator path is now the **only** path to the strong open reasoning models.
3. **No real model picker or thinking UI.** Default-model is a free-text box; reasoning effort has no control.

Together this turns "we support many models" into "we govern and optimise reasoning spend across every model we
offer — directly, via aggregators, or self-hosted — with one knob, and we never pipe your data to China to do
it" — which competitors do not do.

---

## 1. Research findings — the "online-researched implementations" (verified 2026-06-23)

> **Note (post-scope-change):** §1.1 and §1.2 below are kept as **reference**, not as a direct-integration
> spec. We do **not** build GLM/Kimi *direct* presets (`api.z.ai`, `api.moonshot.ai`). The wire details still
> matter because (a) **self-host** operators serving these weights (vLLM/SGLang) may opt a thinking dialect in,
> and (b) they explain how the **aggregators** (§1.4) expose the same models — which is the supported path.

### 1.1 GLM (Z.ai / Zhipu AI) — *reference only; reached via aggregator/self-host, no direct preset*

| Item | Value |
| --- | --- |
| OpenAI-compatible base URL (global) | `https://api.z.ai/api/paas/v4` |
| Base URL (China / mainland) | `https://open.bigmodel.cn/api/paas/v4` |
| Auth | `Authorization: Bearer <API key>` |
| Flagship (today) | **GLM-5.2** — released 2026-06-14; 753B MoE / ~40B active; **1M context**; ≤131,072 output |
| Other current models | `glm-5.1`, `glm-5`, `glm-5-turbo`, `glm-4.7`, `glm-4.7-flash` (cheapest, ~$0.06/M in), `glm-4.6` (200K ctx, $0.43/$1.74), `glm-4.5`, `glm-4.5-air` |
| GLM-5.2 pricing | **$1.40 / M input, $4.40 / M output** (~1/6 GPT-5.5) |
| License | MIT (weights on Hugging Face → self-host story) |
| **Thinking wire format** | `"thinking": { "type": "enabled" \| "disabled" }` on the request body. Enabled by default on reasoning-capable GLM. |
| GLM-5.2 effort levels | Two reasoning-effort tiers: **`high`** and **`max`** (selected via the thinking/effort field). |
| Reasoning output | Streamed as `choices[].delta.reasoning_content` (separate from `delta.content`). |
| Model discovery | `GET {base}/models` (OpenAI-shaped). |
| Tool calling / structured output | Yes (agentic-grade), OpenAI-shaped `tools` + `response_format`. |

Sources: [Z.AI docs — GLM-4.6](https://docs.z.ai/guides/llm/glm-4.6),
[Z.AI release notes](https://docs.z.ai/release-notes/new-released),
[Z.AI pricing](https://docs.z.ai/guides/overview/pricing),
[GLM-5.2 (DataCamp)](https://www.datacamp.com/blog/glm-5-2),
[GLM-5 (GitHub)](https://github.com/zai-org/GLM-5),
[GLM 4.6 OpenRouter](https://openrouter.ai/z-ai/glm-4.6).

### 1.2 Kimi (Moonshot AI) — *reference only; reached via aggregator/self-host, no direct preset*

| Item | Value |
| --- | --- |
| OpenAI-compatible base URL (global) | `https://api.moonshot.ai/v1` |
| Base URL (China) | `https://api.moonshot.cn/v1` |
| Auth | `Authorization: Bearer <MOONSHOT_API_KEY>` |
| Latest (today) | **Kimi K2.7-Code** (2026-06-12) — coding-focused, **256K** context, *forced* thinking, ~30% fewer thinking tokens vs K2.6 |
| Flagship general | **Kimi K2.6** (2026-04-20) — 1T MoE / 32B active, native multimodal + agentic, **thinking + instant** modes, 256K ctx |
| Other current models | `kimi-k2.6`, `kimi-k2.7-code`, `kimi-k2.5`, `kimi-k2-thinking`, `kimi-k2-0905`, `kimi-k2` |
| Pricing (K2.5 / K2.6) | **$0.60 / M input, $2.50 / M output**; context-cache hits drop input to ~$0.10–0.16/M |
| License | Modified MIT (weights on Hugging Face → self-host story) |
| **Thinking wire format** | Two mechanisms: (a) pick a thinking model (`kimi-k2-thinking`, `kimi-k2.7-code`); (b) toggle on a dual-mode model via `extra_body` → `"chat_template_kwargs": { "thinking": true \| false }` (instant mode = `false`). |
| Reasoning output | Streamed as `choices[].delta.reasoning_content`. |
| Model discovery | `GET {base}/models`. |
| Tool calling | Yes — note the known strict-mode tool-calling quirk on `kimi-k2-thinking` (validate via the existing "say-hi" greeting + a tool-call smoke during binding validation). |

Sources: [Moonshot platform](https://platform.moonshot.ai/),
[Kimi K2.6 quickstart](https://platform.kimi.ai/docs/guide/kimi-k2-6-quickstart),
[Kimi pricing](https://platform.kimi.ai/docs/pricing/chat),
[Kimi-K2 (GitHub)](https://github.com/moonshotai/kimi-k2),
[K2.7-Code (MarkTechPost)](https://www.marktechpost.com/2026/06/12/moonshot-ai-releases-kimi-k2-7-code-a-coding-model-reporting-21-8-on-kimi-code-bench-v2-over-k2-6/).

### 1.3 The cross-provider thinking-dialect matrix (the heart of the design)

Every provider expresses "think harder" differently. The canonical Actrone knob is **one** enum —
`off | low | medium | high | max` — and a per-provider **dialect adapter** translates it:

| Provider / family | Wire mechanism for effort | Reasoning text field | Notes |
| --- | --- | --- | --- |
| Anthropic / Bedrock | `thinking:{type:enabled,budget_tokens:N}` (✅ already implemented) | `thinking_delta` | budget from `ThinkingBudgetTokens()` |
| OpenAI reasoning (o-series, gpt-5.x) | `reasoning_effort: "minimal\|low\|medium\|high"` | (summary only) | `max`→`high`; `off`→omit / non-reasoning model |
| GLM (Z.ai) — *self-host opt-in only* | `thinking:{type:enabled\|disabled}` (+ effort `high\|max` on 5.2) | `reasoning_content` | **no direct preset**; dialect available for self-hosted GLM, else reached via aggregator |
| Kimi (Moonshot) — *self-host opt-in only* | `extra_body.chat_template_kwargs.thinking: bool` **or** thinking-model id | `reasoning_content` | **no direct preset**; dialect for self-hosted Kimi, else via aggregator |
| DeepSeek — *removed as direct* | model switch `deepseek-chat` ⇄ `deepseek-reasoner` | `reasoning_content` | **direct preset + managed fallback removed (§4.2)**; reach via aggregator/self-host |
| **OpenRouter** (aggregator) | unified `reasoning:{effort:minimal\|low\|medium\|high\|xhigh, max_tokens, enabled, exclude}` | `reasoning` / `reasoning_content` | `max`→`xhigh`; `/models` advertises `reasoning.supported_efforts` per model |
| **Groq** (aggregator) | `reasoning_effort:low\|medium\|high` (gpt-oss) / `none\|default` (Qwen) **+** `reasoning_format:hidden\|parsed\|raw` | `reasoning` field | default effort `medium`; set `reasoning_format:parsed` to get a separate field |
| Qwen — *via aggregator/self-host only* | `enable_thinking: bool` (+ `thinking_budget`) | `reasoning_content` | **no direct preset**; per-model on the aggregator that fronts it |
| Together / Fireworks / DeepInfra / Novita / Cerebras | mostly **passthrough**: model-id selection (+ `reasoning_effort` for gpt-oss); platform normalises Harmony/`<think>` to OpenAI wire | `reasoning_content` (passthrough) | covered by the SSE `reasoning_content` parse alone |
| Generic OpenAI-compatible / self-hosted | none by default (operator opts a dialect in) | `reasoning_content` if emitted | graceful no-op |

**Design consequence:** `OpenAICompatibleProvider` gains a `ThinkingDialect` (see §4.3) and the SSE
parser learns to read `reasoning_content` (and `reasoning`) → `Token.Thinking`. This single change lights up
thinking for the **entire OpenAI-wire half of the catalog at once** — and because Together/Fireworks/DeepInfra/
Novita/Cerebras *passthrough* `reasoning_content`, the parse fix alone covers them even before a dialect is set.

### 1.4 The catalog we actually offer — 2026 thinking/discovery snapshot (verified 2026-06-23)

These are the sources Actrone offers **directly**; this plan brings each the **same** model-picker + thinking
treatment. **Chinese open models (GLM, Kimi, DeepSeek, Qwen) are NOT direct presets** — the right-most column
shows where you instead reach them (an aggregator row, or self-host).

| Source | Kind | Discovery | Thinking dialect | 2026 reasoning models / notes |
| --- | --- | --- | --- | --- |
| OpenAI | frontier_byok | `/models` | `openai_effort` | o-series, gpt-5.x reasoning |
| Anthropic | frontier_byok | manual | native (Anthropic) | Claude Opus/Sonnet extended thinking |
| Google Gemini | frontier_byok | `/models` | `openai_effort`-style `reasoning_effort` | Gemini 2.5/3 thinking |
| Mistral | frontier_byok | `/models` | passthrough | Magistral reasoning |
| OpenRouter | aggregator | `/models` (rich: pricing + `supported_parameters` + `reasoning.supported_efforts`) | `openrouter` | 400+ incl. **GLM-5.2, Kimi, DeepSeek**, Qwen, gpt-oss |
| Together AI | aggregator | `/models` | passthrough (+ `openai_effort` for gpt-oss) | **DeepSeek V3.2/R1/V4-Pro, Qwen3, GLM-5, Kimi K2**, gpt-oss, MiniMax-M2 |
| Groq | aggregator | `/models` | `groq` (`reasoning_effort` + `reasoning_format`) | gpt-oss-120B, **Qwen3.6, DeepSeek R1** (lowest latency) |
| Fireworks AI | aggregator | `/models` | passthrough (Harmony normalised) | **Kimi K2.6, GLM-5.1, Qwen3.6 Plus**, gpt-oss-120B, **DeepSeek V4-Pro** |
| DeepInfra | aggregator | `/models` | passthrough | open reasoning models (**DeepSeek/Qwen/GLM/Kimi**) |
| Novita AI | aggregator | `/models` | passthrough | open reasoning models |
| Cerebras | aggregator | `/models` | passthrough (+ gpt-oss effort) | ultra-low-latency open models |
| Meta Llama API | aggregator | `/models` | passthrough | first-party Llama |
| vLLM / SGLang / Ollama / LM Studio / LocalAI / Custom | self_hosted | `/models` | operator-selected (default none) | **any open reasoning model the operator serves — incl. GLM/Kimi/DeepSeek/Qwen inside their own boundary** |
| Bedrock / Azure OpenAI / Vertex | native_adapter | manual | native per family | front frontier reasoning models |
| ~~Z.ai (GLM)~~ · ~~Moonshot (Kimi)~~ · ~~DeepSeek~~ direct | — | — | — | **NOT offered as a direct preset (policy §0.1). Removed/never-added. Reach via an aggregator row above or self-host.** |

The `openai_compatible` UI section is relabelled **"Open-model providers & aggregators"** (it still hosts the
non-Chinese aggregators). The previously-planned GLM/Kimi direct presets are dropped; the existing **DeepSeek
direct preset is removed** (§4.2).

Sources: [OpenRouter reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens),
[OpenRouter parameters](https://openrouter.ai/docs/api/reference/parameters),
[Groq reasoning](https://console.groq.com/docs/reasoning),
[Groq models](https://console.groq.com/docs/models),
[Fireworks best LLMs for coding](https://fireworks.ai/blog/best-llms-for-coding),
[Together DeepSeek V4-Pro](https://www.together.ai/models/deepseek-v4-pro),
[Best Chinese LLMs 2026 (BenchLM)](https://benchlm.ai/blog/posts/best-chinese-llm).

---

## 2. Current-state architecture (what we build on)

- **`internal/model`** — provider abstraction.
  - [provider.go](../backend/orchestrator/internal/model/provider.go): `Provider` interface, `CompletionRequest`
    (already carries `ReasoningEffort`, `OutputSchema`), `Token` (already carries `Thinking` + `Usage.ReasoningTokens`),
    `Capabilities` (`Thinking bool`, …), `ThinkingBudgetTokens()`.
  - [openai_compatible.go](../backend/orchestrator/internal/model/openai_compatible.go): the **one** generic
    OpenAI-wire provider that serves frontier BYOK, aggregators, and self-hosted. `buildRequest` does **not**
    emit reasoning; `openAIChunk`/`streamSSE` does **not** parse `reasoning_content`. ← primary edit site.
  - Thin factories: [deepseek.go](../backend/orchestrator/internal/model/deepseek.go) (**to be deleted — §4.2**),
    [mistral.go](../backend/orchestrator/internal/model/mistral.go) — the dialect-setting template.
  - [budget_predictor.go](../backend/orchestrator/internal/model/budget_predictor.go) `blendedRatePerMTokens` —
    the **single** pricing table (drop `deepseek-v3.2`).
- **`internal/modelkeys`** — BYOK / model-source layer.
  - [presets.go](../backend/orchestrator/internal/modelkeys/presets.go): `OpenModelPresets` catalog (remove the DeepSeek preset; relabel section).
  - [resolver.go](../backend/orchestrator/internal/modelkeys/resolver.go): binding → `model.Provider` (where the dialect is selected per preset).
  - [types.go](../backend/orchestrator/internal/modelkeys/types.go): `Preset`, `Endpoint`, `Kind`, `AuthMode`, `TierGate`.
  - `validator.go` / `native.go`: two-stage validation (key liveness + billable "say-hi"); SSRF-guarded client for self-hosted.
- **`internal/handler/http/models.go`** — preset list + binding CRUD + validation surface.
- **`internal/domain/agent.go`** — Agent-File `ReasoningEffort` field (`validate:"omitempty,oneof=off low medium high"`).
- **Frontend** — [settings/models/page.tsx](../frontend/src/app/(app)/settings/models/page.tsx) +
  [components/features/models/](../frontend/src/components/features/models/) (`AddSourceSections`, `EndpointsList`,
  `CostTransparency`, `modelPrimitives`). Preset **grid** + add/validate **form** exist; a **model picker** and
  **thinking controls** do **not**. Chat has `ThinkingStream` (renders reasoning) but no control to drive effort.

---

## 3. Gap analysis (what's missing)

1. **Policy not yet enforced:** the catalog still ships a **DeepSeek direct preset + managed fallback** (a direct
   call to a China-operated endpoint) that must be removed; and nothing prevents adding GLM/Kimi direct presets.
2. Reasoning effort ignored by all OpenAI-wire providers (no request emission, no `reasoning_content` parse) —
   this is the **only** way to reach the strong open reasoning models under the policy, via aggregators/self-host.
3. No canonical `max` effort level (GLM-5.2 needs it; today the enum stops at `high`).
4. No **model metadata catalog** — the UI can list endpoints but cannot tell the user a model's context window,
   thinking support/style, vision, structured-output, or $/M. `GET /models` returns ids only, not capabilities.
5. No **model picker** UI; default-model is a free-text box (`AddForm`), and per-agent model selection is bare.
6. No **thinking control** UI (enable/disable + level), in agent config or chat.
7. No **governance / cost guardrails** on reasoning spend (thinking tokens bill at output rate and can explode).
8. Reasoning tokens not separately attributed in the savings/cost spine (the `Usage.ReasoningTokens` field is plumbed but unused for display/policy).

---

## 4. Backend design

### 4.1 No direct GLM/Kimi/Qwen presets — reach them via aggregator or self-host

- **Do NOT build** `internal/model/zhipu.go` or `internal/model/moonshot.go` direct providers, and **do not add**
  `zhipu` / `moonshot` / `qwen` presets to `OpenModelPresets`. (The provider-neutral path already serves these
  models perfectly via the generic `OpenAICompatibleProvider`.)
- **How a user reaches GLM/Kimi/DeepSeek/Qwen after this change:**
  1. **Aggregator binding** — create an `openai_compatible` binding for OpenRouter / Together / Groq / Fireworks /
     DeepInfra / Novita / Cerebras (their own key) and pick the model id there (e.g. `z-ai/glm-5.2`,
     `moonshotai/kimi-k2.6`, `deepseek/deepseek-v4-pro`, `qwen/qwen3.6`). The aggregator is the US/EU intermediary.
  2. **Self-host binding** — a `self_hosted` vLLM/SGLang binding inside the customer's own boundary serving the
     open weights; the operator may opt a thinking dialect in (§4.3) — `ThinkingZhipu`/`ThinkingMoonshot` remain
     in the dialect enum **purely for this self-host case**, never wired to a direct preset.
- No `api.z.ai` / `api.moonshot.ai` / `dashscope.aliyuncs.com` base URL is ever offered by Actrone.

### 4.2 Remove the existing DeepSeek direct preset + managed fallback

DeepSeek is the one Chinese model with a **direct** integration today; it must go to honour the policy.

- **Remove the preset** `{ID:"deepseek", … BaseURL:"https://api.deepseek.com/v1" …}` from
  [presets.go](../backend/orchestrator/internal/modelkeys/presets.go) `OpenModelPresets`.
- **Remove the managed third-tier fallback**: delete `internal/model/deepseek.go`
  (`NewDeepSeekProvider`, base `https://api.deepseek.com/v1`) and drop it from the managed routing chain
  (`cmd/orchestrator/main.go` wiring + `RouterConfig.Fallbacks`), plus the `deepseek-v3.2` row in
  [budget_predictor.go](../backend/orchestrator/internal/model/budget_predictor.go) `blendedRatePerMTokens`.
- **Replace the cheap tier** so cost-routing still has a low-cost target — but a **non-Chinese, non-direct** one
  (decision §11): e.g. Claude Haiku 4.5, Gemini Flash, or a cheap open model via an aggregator binding. The
  `routeCost` "last fallback = cheapest" assumption must keep holding after the swap.
- **Migration note:** any existing tenant `deepseek` *binding* rows keep resolving (the generic provider still
  accepts a stored base URL), but the **preset disappears from the picker** so no new ones can be created; surface
  a one-line deprecation in the UI for any lingering binding ("DeepSeek direct is deprecated — use an aggregator").
  Confirm whether to hard-disable existing direct-DeepSeek bindings or let them ride out (decision §11).

### 4.8 Taxonomy — the `openai_compatible` section after the policy

With no Chinese **direct** presets, `openai_compatible` holds the **non-Chinese aggregators** (OpenRouter,
Together, Groq, Fireworks, DeepInfra, Novita, Cerebras, Meta Llama API). Relabel its frontend `KIND_META` blurb
from "Open-model aggregators…" to **"Open-model providers & aggregators…"** (it still fronts every open model,
including the Chinese ones, *through the aggregator*). `frontier_byok` stays OpenAI / Anthropic / Gemini / Mistral.
`Kind` remains a UI-grouping + capability-default hint only — all kinds resolve to the same
`OpenAICompatibleProvider`, so removing DeepSeek changes no runtime code path beyond the wiring deletions in §4.2.

### 4.3 Thinking abstraction — the linchpin change to `OpenAICompatibleProvider`

Add a **dialect** to `OpenAICompatibleConfig` and translate `ReasoningEffort` at `buildRequest` time; parse
`reasoning_content` at stream time. No behaviour change when dialect is empty (every existing binding).

```go
// internal/model/thinking_dialect.go (new)
type ThinkingDialect string
const (
    ThinkingNone           ThinkingDialect = ""               // ignore ReasoningEffort (today's behaviour)
    ThinkingOpenAIEffort   ThinkingDialect = "openai_effort"  // reasoning_effort: low|medium|high
    ThinkingZhipu          ThinkingDialect = "zhipu"          // thinking:{type:enabled|disabled}(+effort)
    ThinkingMoonshot       ThinkingDialect = "moonshot"       // chat_template_kwargs.thinking: bool
    ThinkingQwenEnable     ThinkingDialect = "qwen_enable"    // enable_thinking: bool (+ thinking_budget)
    ThinkingDeepSeekSwitch ThinkingDialect = "deepseek_switch"// model id swap chat⇄reasoner
    ThinkingOpenRouter     ThinkingDialect = "openrouter"     // reasoning:{effort, max_tokens, enabled, exclude}
    ThinkingGroq           ThinkingDialect = "groq"           // reasoning_effort + reasoning_format:parsed
)
```

Aggregator dialects matter because the aggregator already normalises across the open models it hosts:
`ThinkingOpenRouter` maps `off→{enabled:false}` and `low/medium/high/max→effort low/medium/high/xhigh`;
`ThinkingGroq` sets `reasoning_effort` and forces `reasoning_format:parsed` so reasoning arrives in its own
field. Together/Fireworks/DeepInfra/Novita/Cerebras default to `ThinkingNone` + **passthrough** parsing (they
emit `reasoning_content` already), with per-binding opt-in to `openai_effort` when fronting gpt-oss.

- `OpenAICompatibleConfig.ThinkingDialect` + `ThinkingModelMap` (for DeepSeek-style id swaps).
- `buildRequest` injects the right field(s) per dialect from `req.ReasoningEffort`
  (`off` → disable/omit; `low/medium/high/max` → dialect-specific). Effort `max` maps down to the provider's
  ceiling where unsupported (`high`).
- The request struct grows optional, `omitempty` fields: `ReasoningEffort *string`, `Thinking *zhipuThinking`,
  `EnableThinking *bool`, `ExtraBody map[string]any` (for Kimi's `chat_template_kwargs`). Omitted ⇒ wire is
  byte-for-byte unchanged for non-thinking calls (preserve the existing structured-output test guarantees).
- **SSE parse:** extend `openAIChunk.Choices[].Delta` with `ReasoningContent string \`json:"reasoning_content"\``
  (and tolerate `reasoning`); emit it on `Token.Thinking` (distinct from `Delta`) — symmetric with the
  Anthropic adapter, so `ThinkingStream` "just works" for GLM/Kimi/DeepSeek.
- **Capabilities:** flip `Thinking:true` on GLM/Kimi/DeepSeek/OpenAI-reasoning caps so the Router/UI know.
- **Usage:** capture provider `reasoning_tokens` into `Usage.ReasoningTokens` (already a field) for §4.6/§6.

Set the dialect on the **Mistral** and **OpenAI** factories (OpenAI real provider = `openai_effort`) and on the
**aggregator** bindings (`openrouter`/`groq`), so the fix is catalog-wide. (The DeepSeek factory is removed —
§4.2 — so its `deepseek_switch` dialect now applies only to a self-hosted DeepSeek binding.)

### 4.4 Model metadata catalog (drives the picker)

`GET {base}/models` yields **ids only** — and under the new policy the dominant path is **aggregators + self-host**,
where the *same model wears a different wire id on every aggregator* (`z-ai/glm-5.2` on OpenRouter,
`zai-org/GLM-5.2` on Together, `accounts/fireworks/models/glm-5p2` on Fireworks, bare `glm-5.2` self-hosted). So
the catalog's primary job is no longer "describe a few direct presets" — it is to **enrich whatever ids an
aggregator/self-host `/models` call returns** with capabilities the wire never reports (context window, thinking
style + levels, vision, structured-output), and to do so via **alias matching**, not exact-id lookup.

```go
// internal/modelkeys/models_catalog.go (new)
type ThinkingStyle string // "none" | "optional" | "forced"

type ModelCard struct {
    Key           string        // stable internal key, e.g. "glm-5.2" (NOT any one aggregator's id)
    Family        string        // "GLM" | "Kimi" | "DeepSeek" | "Qwen" | "Claude" | "GPT" | "Gemini" | …
    DisplayName   string        // "GLM-5.2"
    // Aliases/Match resolve the per-aggregator + self-host wire ids onto this card. Ordered, case-
    // insensitive; Match is an optional compiled pattern for families with many sizes/quants.
    Aliases       []string      // ["z-ai/glm-5.2","zai-org/GLM-5.2","glm-5.2", …]
    Match         string        // optional regex, e.g. `(?i)^[^/]*/?glm-5\.2(\b|$)`
    ContextTokens int
    MaxOutput     int
    Thinking      ThinkingStyle // none|optional|forced
    ThinkLevels   []string      // supported canonical efforts, e.g. ["low","medium","high","max"]
    Vision        bool
    Tools         bool
    StructuredOut bool
    // Price is advisory metadata. A chip renders ONLY for PriceSource "actrone_managed" (§5.1); for
    // "provider_list" it may show as a distinct low-emphasis advisory chip; "" ⇒ no price shown.
    InputPerM     float64
    OutputPerM    float64
    PriceSource   string        // "actrone_managed" | "provider_list" | ""
    Recommended   []TaskProfile // coding, agentic, cheap-bulk, long-context, vision, …
    Origin        string        // "us" | "eu" | "cn" — surfaced as a residency badge (see below)
    Notes         string
}
```

**Resolution (`ResolveCard(wireID) (*ModelCard, bool)`):** lowercase → exact-alias hit → strip a known
aggregator namespace prefix and retry → `Match` regex → else **miss**. A miss is rendered honestly: the id is
still selectable, with a "**capabilities unverified**" badge and conservative defaults (tools on, thinking
`optional` unknown-levels, no price) — never a guess presented as fact (CLAUDE.md §8).

**Catalog contents under the policy:**
- **Direct presets (OpenAI, Anthropic, Gemini, Mistral)** — full cards, `PriceSource:"actrone_managed"` only for
  the models Actrone actually bills (managed), else `""`.
- **Chinese open models (GLM, Kimi, DeepSeek, Qwen)** — cards are kept **for capability/recommendation enrichment
  only**, so when they surface in an *aggregator's* or *self-host* `/models` list the picker can describe them
  accurately (context, thinking style, "forced thinking" for `kimi-k2.7-code`/`kimi-k2-thinking`, `optional` for
  GLM/DeepSeek/Qwen). `PriceSource:""` (or `provider_list` if the aggregator returns price); **`Origin:"cn"`** so
  the picker shows a residency badge and a "reached via {aggregator}/self-host — not a direct Actrone connection"
  note. No card ever carries a Chinese direct base URL.
- **Aggregator-returned ids with no card** — enriched from the aggregator's own `/models` metadata where present
  (OpenRouter exposes context + pricing + `reasoning.supported_efforts`), else the unverified-badge fallback.

**One source of truth** shared by the picker, the pricing table (§4.5 reads managed rows from here), the Router's
capability hints, and the thinking-dialect/level gating. Pinned/versioned in-repo (no runtime fetch dependency
for the curated set); a thin job can periodically reconcile aliases against live aggregator `/models` output.

### 4.5 Pricing additions

The pricing table only needs rows for models Actrone **bills** (managed). The Chinese-model rows are **advisory
metadata** on the `ModelCard` (Family GLM/Kimi/DeepSeek/Qwen, `PriceSource` `provider_list` at most), never an
Actrone `$/M` chip. **Remove** the `deepseek-v3.2` managed row (§4.2). Add managed rows only for whatever
non-Chinese model replaces the cheap tier (decision §11). Prefer deriving blended rates from the `ModelCard`
table so there is one source.

### 4.6 Reasoning-aware cost & a discovery endpoint

- **Cost spine:** surface `Usage.ReasoningTokens` through `CompletionMeta` and the savings/cost attribution
  so "thinking spend" is a separate, visible line (reasoning bills at the **output** rate).
- **Discovery API:** `GET /v1/models/catalog?preset=<id>` (and `?binding=<id>` to merge live `/models`) returns
  `ModelCard[]` for the picker. Reuses the existing models handler + SSRF-guarded client.

### 4.7 Agent-File + canonical-effort changes

- Extend the canonical enum to `off|low|medium|high|max` in
  [agent.go](../backend/orchestrator/internal/domain/agent.go) `validate` and in `ThinkingBudgetTokens`
  (add `max` → e.g. 32768 for Anthropic; dialects map `max` to their own ceiling).
- Per-agent **model** + **reasoning_effort** are Agent-File fields already plumbed into `CompletionRequest` via
  the service/agentic loop — verify the loop forwards `ReasoningEffort` end-to-end (it does for Anthropic; the
  §4.3 change makes it effective for the rest). Add per-agent **model allowlist** enforcement at resolve time.

---

## 5. Frontend design

### 5.1 `ModelPicker` (per provider) — new `components/features/models/ModelPicker.tsx`

- A `cmdk`/Radix combobox listing models for the selected **provider or binding**, grouped by family, with:
  search, capability **chips** (context window, `Thinking`, `Vision`, `Tools`, `Structured`), a "Recommended
  for {task}" hint, and recent/favourite models. Loading skeleton, empty state ("no models — check the
  binding"), and a designed error state with the request-id (per CLAUDE.md §8.2).
- Data from `GET /v1/models/catalog` (§4.6). Tier-gated rows use the existing `FeatureGate`.
- **Replaces** the free-text "Default model" input in `AddForm`, and powers an **allowlist multi-select**.

#### Price-chip rule — **price is shown only when Actrone is the biller** (owner directive 2026-06-22)

The `$/M` chip answers "what will this cost *me, on Actrone*?" — which is only meaningful for **managed**
(Actrone-hosted) models, where Actrone bills the tenant. So:

| Source kind | Who bills | Price chip | What the picker shows instead |
| --- | --- | --- | --- |
| `managed` (Actrone-hosted) | **Actrone** | ✅ **Show `$/M` price chip** (blended, from the `ModelCard`/pricing table) | price + all capability chips |
| `frontier_byok` (OpenAI, Anthropic, Gemini, Mistral) | the provider, on the user's key | ❌ no Actrone price chip | capability chips + a low-emphasis "Billed by {provider}" note |
| `openai_compatible` — aggregators (OpenRouter, Together, Groq, Fireworks, DeepInfra, Novita, Cerebras, Llama API) — the path to GLM/Kimi/DeepSeek/Qwen | the aggregator, on the user's key | ❌ no Actrone price chip — **optional advisory list-price** "where needed" (see below) | capability chips + advisory price |
| `self_hosted` (vLLM, Ollama, …) | the customer's own compute | ❌ no price chip | capability chips only |
| `native_adapter` (Bedrock, Azure, Vertex) | the cloud, on the user's account | ❌ no price chip | capability chips + "Billed by {cloud}" note |

- **Aggregators "where needed":** some aggregators return list price in their `/models` metadata (OpenRouter
  exposes per-model pricing; others vary). When present we may render it as a **distinct, low-emphasis
  *advisory* chip** clearly labelled "list price · billed by {provider}" — visually different from the managed
  `$/M` chip and **never** implying an Actrone charge. Default-off; opt-in per the owner's call (§11). Where the
  aggregator does not return price, no chip (no guessing — CLAUDE.md §8 no-fake-data).
- Implementation: the picker takes a `billing: 'managed' | 'byok'` prop derived from the binding/preset kind;
  `billing === 'managed'` is the **only** path that renders the priced chip. `CostTransparency` keeps showing
  real spend for whichever path actually incurs Actrone-billed usage.

### 5.2 `ThinkingControl` — new `components/features/models/ThinkingControl.tsx`

- Segmented control **Off · Low · Medium · High · Max** (design tokens only; full a11y: radiogroup, arrow-key
  nav, focus ring). Levels the chosen model can't do are disabled with a tooltip ("GLM-5.2 supports High/Max").
  For **forced-thinking** models (Kimi K2.7-Code) the control shows "Always on" and disables Off.
- Live helper text: estimated reasoning-token budget + a cost-delta hint (reasoning bills at output rate),
  reading the model's `ModelCard`.
- Respects `prefers-reduced-motion`; tabular-nums for numeric readouts.

### 5.3 Where both plug in (every place a model is chosen)

1. **Agent creation** (`agents/new/studio`, `/framework`, `/sdk`) — model + thinking in the config step.
2. **Agent settings** (`agents/[id]`) — edit default model, allowlist, reasoning_effort.
3. **Chat composer** (`agents/[id]/chat`) — per-turn model override + thinking toggle, surfaced next to
   `ThinkingStream`; persists to the turn, not the agent.
4. **Model source form** (`AddSourceSections` `AddForm`) — picker for the binding default + allowlist.
5. **Marketplace publish** — declare supported models/min-thinking for a published agent.
6. **A model "Playground"** (optional, fast follow) — pick provider × model × effort, run a prompt, see
   reasoning + cost side by side. Strong demo surface.

---

## 6. Moats (why this is defensible, not just a checkbox)

0. **Data-residency / no-direct-China posture (the headline enterprise moat).** Actrone never opens a direct
   first-party connection to a China-operated model API — Chinese open models are reachable *only* through a
   US/EU aggregator or the customer's own self-hosted infra. That is a concrete, auditable compliance stance
   enterprises and the public sector demand, and it costs us **zero** capability (the same models stay one
   aggregator-binding away). Vendors that wire DeepSeek/GLM/Kimi straight to `*.cn` endpoints cannot make this
   promise; we can.
1. **One knob, every model (model-neutral reasoning).** Canonical `off→max` effort maps to each provider's
   native dialect (§1.3). An agent is portable Claude ⇄ GPT ⇄ Gemini ⇄ (GLM/Kimi/DeepSeek via aggregator) with
   **zero rewrites** — the thing raw SDKs and single-vendor tools can't offer.
2. **Governed reasoning spend.** Per-org/env **policy caps** on effort (e.g. "Production ≤ medium",
   "Enterprise tier unlocks max") enforced in the governance layer + Resolver. Thinking tokens are the new
   runaway cost; *nobody else governs them.* Ties into the existing policy/entitlements + `TierGate`.
3. **Reasoning-aware savings flywheel.** Separate `reasoning_tokens` attribution + the cost router's complexity
   score → **adaptive thinking**: auto-pick low effort for easy tasks, high for hard, bounded by policy. Turns
   thinking from a cost risk into a measured optimisation, surfaced in `CostTransparency`.
4. **Price-per-quality routing to the cheap frontier (via aggregators).** GLM-5.2 (~1/6 GPT-5.5), Kimi K2.6, and
   DeepSeek V4-Pro — fronted by an aggregator binding — become first-class cost-router targets for coding/agentic
   profiles. Concrete, demonstrable savings, delivered without a direct China connection.
5. **Capability-true picker.** Curated `ModelCard` metadata + live `/models` + the existing billable "say-hi"
   validation means the picker shows **verified** capabilities (and price only where Actrone bills), with a
   smoke-tested tool-call check (covers the known `kimi-k2-thinking` tool quirk on whichever aggregator serves
   it) — trustworthy where aggregator dashboards guess.
6. **Open-weight sovereignty.** The strong open weights (GLM-5.2 MIT, Kimi K2.7 Modified-MIT, DeepSeek, Qwen) can
   be **self-hosted inside the customer's boundary** with the same binding shape and the same thinking dialect —
   pairs with the self-hosted reachability matrix and the data-residency roadmap. "Use them through a vetted
   aggregator, or bring them fully in-house — never through us to China."
7. **Reasoning-trace governance.** Chain-of-thought can leak sensitive intermediate reasoning; a per-policy
   **retain / redact / never-log** control for `reasoning_content` (the log scrubber already exists) — a
   compliance feature enterprises ask for and hosted chat UIs ignore.
8. **One picker over every aggregator (the meta-aggregator).** OpenRouter normalises reasoning across the models
   *it* hosts; Groq does its own; Together/Fireworks do theirs. Actrone normalises **across the aggregators
   themselves** — one `ModelPicker`, one off→max effort knob, one capability/price vocabulary spanning
   OpenRouter + Together + Groq + Fireworks + DeepInfra + Novita + Cerebras + frontier direct (OpenAI/Anthropic/
   Gemini/Mistral) + self-hosted, with governance, savings, and cost-routing layered on top. Switching aggregator
   (or moving a model managed→aggregator→self-host) is a binding change, not an agent rewrite. No aggregator can
   offer this — they are inside one of the boxes we route across.
9. **Honest billing surface.** Price is shown **only where Actrone bills** (managed); BYOK/aggregator/self-host
   show capability chips + a clearly-labelled "billed by {provider}" note (§5.1). Trust-building transparency
   that undifferentiated "model marketplace" UIs blur.

---

## 7. Codebase touchpoints — "everywhere models are used"

**Backend (Go orchestrator):**
- `internal/model/`: **new** `thinking_dialect.go`, `models_catalog.go`(or in modelkeys); **edit**
  `openai_compatible.go` (dialect emit + `reasoning_content` parse + usage), `mistral.go`/`openai.go` (set dialect),
  `budget_predictor.go` (**remove `deepseek-v3.2` row**; pricing from `ModelCard`), `provider.go`
  (`ThinkingBudgetTokens` add `max`; caps). **No `zhipu.go`/`moonshot.go`.**
- **Removals (policy §4.2):** delete `internal/model/deepseek.go` (`NewDeepSeekProvider`); drop it from the
  managed routing chain in `cmd/orchestrator/main.go`; remove the `deepseek` preset from
  `internal/modelkeys/presets.go`; choose a **non-Chinese cheap-tier replacement** (decision §11).
- `internal/modelkeys/`: `presets.go` (**remove DeepSeek; relabel section**; no GLM/Kimi/Qwen added),
  `resolver.go` (dialect per binding + allowlist enforce), `validator.go` (optional tool-call smoke).
- `internal/handler/http/models.go`: `GET /v1/models/catalog` discovery endpoint.
- `internal/domain/agent.go`: effort enum `+max`; allowlist enforcement.
- `internal/service/activity_service.go` + agentic loop: verify `ReasoningEffort` forwarded end-to-end.
- `internal/savings` / cost spine: reasoning-token attribution; governance/policy: effort caps + trace policy.
- `internal/config/config.go` + Helm `orchestrator` chart: **no** Chinese-model keys. If the cheap-tier
  replacement is a new managed provider, add its key (`ORCHESTRATOR_MODEL_*`) via `orchestrator-secrets` (never values.yaml).

**Frontend (Next.js):**
- **new** `components/features/models/{ModelPicker,ThinkingControl}.tsx`; **edit** `AddSourceSections.tsx`
  (picker + allowlist; **relabel the `openai_compatible` `KIND_META` blurb** from "Open-model aggregators…" to
  "Open-model **providers & aggregators**…" per §4.8), `EndpointsList.tsx`, `CostTransparency.tsx` (reasoning spend line),
  chat composer + `ThinkingStream` integration, agent create/settings; **no new zhipu/moonshot brand icons**
  (aggregator icons already exist; show family marks in `ModelCard` rows only);
  `lib/api/client.ts` + `server.ts` (catalog types/calls); `lib/entitlements.ts` (effort-cap features).

**SDKs & docs:**
- Python + TS SDKs: expose `model` + `reasoning_effort` on submit (confirm parity; add `max`).
- Docs: model-source pages, a "Thinking & reasoning effort" page, and a **"Reaching open models (GLM, Kimi,
  DeepSeek, Qwen) via an aggregator or self-host"** how-to that states the no-direct-China policy plainly.

**Note (policy, CLAUDE.md §8):** there is **no** managed or BYOK direct path to a Chinese model. The picker never
offers `api.z.ai`/`api.moonshot.ai`/`api.deepseek.com`/DashScope; those models appear only inside an aggregator's
or self-host binding's `/models` list. No fake/implied managed defaults.

---

## 8. Security & standards (CLAUDE.md)

- Keys are **vault-sealed (AES-256-GCM)**, never logged/returned, masked hint only — reuse the modelkeys vault path.
- Treat API keys as **opaque bearer** tokens (no length/prefix assumptions); allowlist + max-length on every new
  input (model ids, base-url override, effort enum) at the boundary; **422** on validation failure, never 200-with-error.
- New outbound calls (discovery, validation) inherit retries (exp backoff + jitter, max 3), per-call timeout +
  `context.Context`, and the SSRF-guarded client for any user-supplied base URL.
- **Reasoning content is sensitive**: never log raw `reasoning_content`; route it through the structured scrubber;
  honour the per-policy trace control (§6.7).
- `gofmt`/`go vet`/`go build`/`go test ./...` stay green; deps pinned; SVG icons (no emoji); tokens-only UI.

---

## 9. Phasing

- **M0 — Enforce the policy. ✅ SHIPPED 2026-06-23** (Go gofmt/build/vet/test green). Decisions locked (owner):
  cheap-tier replacement = **Gemini 3.5 Flash** (managed); existing direct-DeepSeek bindings = **hard-disabled**;
  canonical effort gains **`max`**. Delivered: deleted `internal/model/deepseek.go` → new
  `internal/model/gemini.go` (`NewGeminiProvider`, Google OpenAI-compat base, tools+vision+structured-output caps,
  1M ctx); `buildProvider` `deepseek`→`gemini` case + `cfg.Model.DeepSeekAPIKey`→`GeminiAPIKey`
  (mapstructure `gemini_api_key`); `SetDefaults` `fallback_provider2`→`gemini`/`gemini-3.5-flash` (preserves
  "last fallback = cheapest" at $1.40 blended < Haiku $3.00); removed `deepseek-v3.2` rows from
  `budget_predictor.go` + `activity_service.go` (added `gemini-3.5-flash`); removed the `deepseek` preset from
  `presets.go` (added the no-direct-China NOTE); `capabilities_test.go` DeepSeek→Gemini; `.env.example` rewired.
  **New `internal/modelkeys/china_policy.go`**: `IsChinaOperatedModelHost(baseURL)` + `ErrChinaOperatedHostBlocked`
  (denylist: deepseek.com, z.ai, bigmodel.cn, moonshot.ai/.cn, dashscope[-intl].aliyuncs.com; exact+dotted-suffix,
  case-insensitive, no lookalike false-positives) — wired **hard-disable at resolve time** (`resolver.buildProvider`
  → endpoint never contacted; agentic loop falls back to managed, gateway surfaces the error) **and create time**
  (`models.go normaliseCreate` → 422 before persist). 18-case table test. `max` added to the canonical effort enum
  (`agent.go` validate `oneof=off low medium high max`) + `ThinkingBudgetTokens("max")=32768`.
- **M1 — Thinking lights up (backend). ✅ SHIPPED 2026-06-23** (gofmt/build/vet/test green; model + modelkeys +
  gateway/service/handler/domain all pass). New **`internal/model/thinking_dialect.go`**: `ThinkingDialect` enum
  (none/openai_effort/openrouter/groq/zhipu/moonshot/qwen_enable/deepseek_switch) + `applyThinkingDialect(out,
  dialect, effort, modelMap)` translating canonical `off|low|medium|high|max` onto each wire shape
  (openai/groq `reasoning_effort` with max→high; openrouter `reasoning:{effort…|enabled:false}` max→xhigh; zhipu
  `thinking:{type}`; moonshot `chat_template_kwargs.thinking`; qwen `enable_thinking`+`thinking_budget`;
  deepseek_switch model-id swap) + `openRouterReasoning`/`zhipuThinking` types. **`openai_compatible.go`:**
  `OpenAICompatibleConfig.ThinkingDialect`/`ThinkingModelMap` + provider fields; `caps.Thinking` flipped on when a
  dialect is set; `openAIRequest` grew 7 omitempty thinking fields (ThinkingNone ⇒ byte-for-byte unchanged, so the
  structured-output wire tests still hold); `buildRequest` calls `applyThinkingDialect`; **SSE parse** extended —
  `delta.reasoning_content` (and `reasoning`) → `Token.Thinking` (distinct from Delta), and
  `usage.reasoning_tokens` / `completion_tokens_details.reasoning_tokens` → `Usage.ReasoningTokens`. Dialects set
  on the **OpenAI** + **Gemini** factories (`ThinkingOpenAIEffort`); **`thinkingDialectForPreset`** in `resolver.go`
  maps BYOK bindings (openai/gemini→openai_effort, openrouter→openrouter, groq→groq; passthrough aggregators +
  self-host → none, reasoning_content still parsed). Tests: 22-case wire-body table (per dialect × off/low/medium/
  high/max), ThinkingNone-unchanged + cap-not-advertised, cap-flip, reasoning_content + reasoning-alt SSE parse +
  reasoning-token capture, `thinkingDialectForPreset` map. *Backend thinking is live for the whole OpenAI-wire
  catalog; UI lands in M3.*
- **M2 — `ModelCard` catalog + discovery endpoint. ✅ SHIPPED 2026-06-23** (gofmt/build/vet/test green). New
  **`internal/modelkeys/models_catalog.go`**: `ModelCard` (Key/Family/DisplayName/Aliases/Match/ContextTokens/
  MaxOutput/Thinking[`ThinkingStyle` none|optional|forced]/ThinkLevels/Vision/Tools/StructuredOut/Input·OutputPerM/
  PriceSource/Recommended[`TaskProfile`]/Origin/ViaAggregatorOnly/Notes) + `ThinkingStyle`/`TaskProfile`/
  `PriceSource{Managed,Provider}` consts. Curated pinned catalog: OpenAI (gpt-5.4-mini **managed**, gpt-5.4,
  gpt-oss-120b), Anthropic (opus/sonnet, haiku-4.5 **managed**), Gemini (3.5-flash **managed**, 3-pro), Mistral
  (large, magistral), + **Chinese open models as ENRICHMENT-ONLY** (GLM-5.2, Kimi K2.6/K2.7-code[forced],
  DeepSeek V4-Pro/R1[forced], Qwen3.6) all `Origin:"cn"` + `ViaAggregatorOnly` + `PriceSource:""`. `ResolveCard
  (wireID)`: lowercase → exact-alias → namespace-strip (`vendor/model`) → `Match` regex → honest miss (lazy
  `sync.Once` index, no init side-effects). `Catalog()`, `CardsForPreset(presetID)` (frontier/native family-scoped
  via `presetFamilies`; aggregators + self-host front the **full** catalog). **Endpoint** `GET /v1/models/catalog`
  (`?preset=<id>` family-scoped, none ⇒ full, unknown preset ⇒ 422) — static curated data, no secrets, mounted in
  the read-only models routes (`models/catalog` beside `models/presets`). Price chip rule encoded in the data:
  managed price only on the 3 managed cards; cn cards never priced. Tests: ResolveCard (10 cases incl. fireworks
  `glm-5p2` alias + `glm-5.2-fp8` Match + namespace-strip + miss), CardsForPreset (family scope + full-catalog),
  managed-price/cn-residency/forced-thinking invariants, handler 200-full/200-scoped/422 + a China-host create
  rejection through `normaliseCreate`. **DEFERRED (documented follow-ups, need a new live-model-fetch primitive —
  the gateway `/models` is itself a stub):** `?binding=<id>` live `/models` merge + per-model enrichment, and the
  aggregator/self-host tool-call validation smoke.
- **M3 — Frontend `ModelPicker` + `ThinkingControl` + live discovery. ✅ COMPLETE 2026-06-23** (tsc 0 errors; backend build/test green; eslint clean). Data layer + both components + live `?binding=` discovery + the picker in the model-source form + **per-turn `ThinkingControl` shipped in the chat composer** (real backend per-task override). Only the *persisted* agent-config model/effort control remains (tracked under M4-deferred, needs the EMAOP manifest→AgentFile translation).
  - **Live `?binding=` discovery (the deferred follow-up, now built):** `Validator.ListModels(ctx, client, base, key, extra)` (GET `/models` → ids; 4MiB cap; best-effort, any failure → caller falls back to curated). `modelkeys.EnrichModelIDs(ids)` maps each live id onto a curated card **keyed by the EXACT wire id** (so a selection sends an id the provider accepts — `z-ai/glm-5.2`, not `glm-5.2`), with metadata from the curated card; unknown ids → `UnverifiedCard` (`Verified:false`, flagged "capabilities unverified"). Handler `GET /v1/models/catalog?binding=<id>` resolves the tenant binding (404 unknown / 422 bad id), fetches live `/models` through the SSRF-guarded client for self-hosted (public client otherwise), enriches, and **degrades gracefully to the binding preset's curated cards** on any failure (200). Native adapters (no OpenAI `/models`) return curated directly; a China-operated host is never contacted. New `ModelCard.Verified`. Tests: EnrichModelIDs wire-id preservation + dedup + unverified fallback.
  - **Frontend:** `lib/api/client.ts` — `ReasoningEffort`/`ThinkingStyle`/`ModelPriceSource`/`ModelTaskProfile`/`ModelOrigin`/`ModelCard` types + `modelsApi.catalog(presetId?)` + `modelsApi.catalogForBinding(id)`. **`ModelPicker.tsx`** — Popover + cmdk combobox grouped by family, capability chips (ctx/Thinking/Vision/Tools/Structured), residency badge, "Unverified" badge, a "Recommended for …" hint, and a `$/M` chip ONLY when `billing==='managed'` && `price_source==='actrone_managed'` (else "billed by provider"); loading/empty/error states; a11y (labelled trigger, listbox popover, type-ahead). **`ThinkingControl.tsx`** — segmented Off·Low·Medium·High·Max radiogroup with roving arrow-key focus; disables levels the card doesn't advertise (tooltip), disables Off + shows "Always on" for forced-thinking models, hides for `thinking==='none'`; reasoning-budget + output-rate-cost helper line; reduced-motion-safe. Wired **`ModelPicker` into the model-source form** (`AddSourceSections`) for **frontier presets** (their card key IS the API model id — fully correct), fed by `catalog(preset.id)`; the `openai_compatible` `KIND_META` blurb relabelled to **"Open-model providers & aggregators … the supported path to GLM, Kimi, DeepSeek and Qwen"** (§4.8).
  - **Per-turn thinking in the chat composer — SHIPPED 2026-06-23 (✅ M3 COMPLETE).** The loop sourced effort ONLY from the Agent-File, so a composer control would have been a fake control without a backend override. Built it REAL, **activity-side only** (no Temporal workflow edits → zero determinism risk; covers both the task and hosted paths since both already pass `Input` to the activity): `domain.ParseReasoningEffortOverride(raw)` (pure, validates off|low|medium|high|max, "" on absent/invalid; 9-case table test) + `reasoningEffortFor(input)` in `activity_service` — a valid per-task `reasoning_effort` in the task input wins, else the Agent-File's `Personality.ReasoningEffort` (the override persists to the turn, not the agent). Frontend: `ThinkingControl` gained an **Auto/inherit** option (`allowInherit`) + a `compact` mode; `ChatComposer` renders it (`SendOptions{reasoningEffort}`, default Auto = no override sent); `AgentChat.submitTask` threads `input.reasoning_effort` only when set. tsc 0 errors, eslint 0 errors on touched files, Go build/test green.
  - **STILL TO WIRE (M4-adjacent, not blocking M3):** the live `?binding=` picker + a persisted `ThinkingControl` into **agent create/settings** — the Studio uses a higher-level EMAOP manifest with server-side model/effort defaults and exposes no raw model/effort field, so that is a manifest-translation change best done with M4's governed effort caps. The components are built, exported, and consumed (picker in the model-source form, ThinkingControl in the chat composer).
- **M4 — Moats. ✅ CORE COMPLETE 2026-06-23 (slices 1–5).** Deferred follow-ups tracked at the end of this section.
  - **Slice 1 — governed reasoning-effort caps (the headline moat). ✅ SHIPPED 2026-06-23** (gofmt/vet/build/test +
    tsc/eslint green). **Server-side enforcement (1a):** `domain.ReasoningEffortRank` + `ClampReasoningEffort
    (requested, ceiling)→(effort, capped)` (max under a medium ceiling → medium; empty/invalid ceiling = uncapped)
    + `domain.EffortCeilings` (env→max, nil-safe, ""→production); `GovernanceConfig.EffortCeiling{Development,
    Staging,Production}` + `ReasoningEffortCeilings()` (all default **empty = uncapped — caps are opt-in, never a
    silent behaviour change**); `ActivityService.reasoningEffortFor(input)` now resolves override-or-AgentFile
    **then clamps to the env ceiling** and audits a cap (`model.reasoning.effort_capped` structured log). This is
    the authoritative guard — a direct API caller cannot exceed the ceiling, so any frontend tier overlay is an
    upsell layer, not the gate. Wired in main via `cfg.Governance.ReasoningEffortCeilings()`; `.env.example`
    documents the three opt-in vars (recommended posture: dev uncapped / staging high / production medium). Tests:
    `ClampReasoningEffort` (8 cases) + `EffortCeilings.Ceiling` (env resolution incl. ""→production + nil). **Cap
    surfaced (1b):** `GET /v1/models/effort-policy` (`{env, ceiling}` for the active env; advisory for the UI,
    server still enforces) — `ModelsHandler` gains the ceilings; handler test. Frontend `modelsApi.effortPolicy()`;
    `ThinkingControl` gains a `ceiling` prop that **disables every level above the ceiling** with a "Capped to
    {ceiling} by governance" tooltip + a "· capped to {ceiling} here" helper note; `ChatComposer` fetches the
    policy on mount and passes it (uncapped on fetch failure — the server is the real guard).
  - **Slice 2 — reasoning-token cost attribution (per-turn). ✅ SHIPPED 2026-06-23** (build/test + tsc/eslint
    green). The reasoning token count was captured (M1) + on `StreamLLMResult` + in the audit spine, but never
    surfaced. Added `Model`/`Tokens`/`ReasoningTokens` to the WS `CompleteData` (also closes the frontend's
    `AWAITING-BACKEND: model + tokens not yet on CompleteEvent` note) and populated them from the real provider
    usage in the activity's terminal `EventComplete` publish. Frontend: `TurnMeter.reasoningTokens` + `readMeter`
    parses `reasoning_tokens`; the chat **TurnMeter renders a separate "{n} reasoning" item** (Brain icon) so
    thinking spend (billed at the output rate) is visible per turn, not buried in the total. **Remaining for full
    attribution:** the *aggregate* `CostTransparency` reasoning line needs savings-ledger attribution (a
    reasoning-tokens field on the cost/savings event + recorder) — deeper, deferred follow-up.
  - **Slice 3 — adaptive thinking + complexity-aware routing. ✅ SHIPPED 2026-06-23** (build/test green). New
    `model.ScoreComplexity(messages, hasTools)→[0,1]` (pure heuristic: length saturating ~4k chars, tool
    availability, transcript depth, reasoning-intent keywords in the latest user message). `domain.AdaptiveEffort
    (complexity)` (→low/medium/high, tops at high — max stays an explicit human choice) + the `EffortAdaptive`
    **directive** ("adaptive"), kept OUT of the clamp/ceiling rank set (it is resolved to a level FIRST) but
    accepted by `IsRequestableEffort`/`ParseReasoningEffortOverride` and added to the Agent-File validate enum
    (`oneof=… adaptive`). `reasoningEffortFor(input, complexity)` now: override-or-AgentFile → resolve `adaptive`
    via `AdaptiveEffort(complexity)` → clamp to the env ceiling. **Bonus:** the real complexity now feeds
    `routeCompletion`/the cost router (replacing the hardcoded `0.5`), so `cost`-strategy model selection is finally
    complexity-aware (no effect on the default `primary_with_fallback`). Tests: `ScoreComplexity` (bands +
    latest-message-only intent), `AdaptiveEffort` (9 points + directive/level distinction), adaptive override parse.
    **Deferred:** exposing "adaptive" in the agent-config UI (no surface yet) + SDK effort parity (M5).
  - **Slice 4 — reasoning-trace policy. ✅ SHIPPED 2026-06-23** (build/test green). `domain.ReasoningTracePolicy`
    (retain | redact | never_log) + `NormalizeReasoningTracePolicy` (empty/unknown ⇒ retain — behaviour-
    preserving) + `Apply(reasoning)` (retain→unchanged, redact→mask email + 4+-digit spans, never_log→""). The
    reasoning is already MAL-tokenised, so this is a defense-in-depth compliance layer (plan §6.7) applied at the
    single audit chokepoint (`AuditAppend` → `InferenceStep.ReasoningSummary`); the **reasoning-token count is
    recorded regardless of policy** (only the content is dropped/masked). `GovernanceConfig.ReasoningTracePolicy`
    (normalised in the `ActivityService` constructor so `main` stays domain-free); `.env.example` documents it.
    Tests: normalize (5 cases) + Apply (retain/redact masks email+number/never_log).
  - **Slice 5 — tool-call validation smoke. ✅ SHIPPED 2026-06-23** (build/test + tsc/eslint green). After the
    billable "say-hi" greeting succeeds, `Validator.toolCallSmoke` fires one tiny request advertising a trivial
    `get_time` tool and checks the SSE for a well-formed tool call (`sseHasToolCall`) — catching the known
    kimi-k2-thinking strict-mode quirk at bind time. **Best-effort + non-gating**: `ValidationResult.ToolsVerified
    *bool` (nil ⇒ not probed); a key proven by the greeting stays valid even when the model declines the tool.
    Surfaced as `tools_verified` on the create/validate responses → `ModelValidationResult.tools_verified` →
    `ValidationPanel` shows "Tool calling verified" / "not confirmed". Test: `sseHasToolCall` (tool vs content-only).
  - **SDK effort parity (M5 slice). ✅ SHIPPED 2026-06-23** (Python mypy clean; TS build + 45 tests; Go build). The
    per-task `reasoning_effort` override already worked untyped via the free-form task input; this adds a typed,
    discoverable parameter to all three SDKs that merges into the input (explicit value wins; original input never
    mutated; server still clamps to the env ceiling). **Python:** `ReasoningEffort` Literal + `_with_reasoning_effort`
    helper + `reasoning_effort=` on `submit_task`/`run_agent`. **TS:** `ReasoningEffort` type (exported) +
    `reasoningEffort?` on `SubmitTaskParams`, merged in `submitTask`. **Go:** `SubmitTaskRequest.ReasoningEffort`
    (`json:"-"`, validated `oneof=off low medium high max adaptive`) merged into `Input` in `SubmitTask` (copy, no
    caller mutation). All accept the M0–M3 set including `max`/`adaptive`.
  - **Still deferred — two substantial subsystem builds (each merits a focused effort, NOT quick polish):**
    1. **Aggregate reasoning-spend ledger line** in `CostTransparency`. The per-turn meter already shows reasoning
       tokens (Slice 2), but a historical aggregate needs per-task reasoning-token **persistence** — the `tasks`
       table has only `output JSONB` + `cost_usd` (no token columns), and the savings ledger tracks optimizer
       savings (baseline-vs-actual), not token breakdowns. So this needs: a task reasoning-token column/field
       (migration) + an aggregation query + endpoint + the UI line.
    2. **Cap-aware agent create/settings model+effort controls.** The Studio's `buildManifest` emits an EMAOP
       manifest (`spec.persona`, no `spec.model`/`reasoning_effort`) while `parser.go` validates a `domain.AgentFile`
       directly (requires `spec.model.primary` + `spec.personality.system_prompt`) — so the EMAOP→AgentFile boundary
       must carry model+effort, AND there is **no agent-settings edit surface today** (only chat/deployments/source).
       This is a no-code-compiler change + a net-new editor, landing cap-aware (it consumes the Slice-1 ceiling via
       the existing `effort-policy` endpoint + the built `ModelPicker`/`ThinkingControl`).
    *(Monetization-tier gating → P7, last. The remaining M5 items — Playground + docs — are separate from this SDK slice.)*
- **M5 — Playground + docs + SDK parity.**

## 10. Testing

- **Unit (Go, table-driven):** one case **per dialect** asserting the exact wire body for `off/low/medium/high/max`
  and a no-effort call (byte-for-byte unchanged); `reasoning_content` SSE parse → `Token.Thinking`; pricing/`ModelCard`
  lookups; allowlist enforcement; effort-cap policy. Error paths (forced-thinking + `off`, unknown model) covered.
- **Integration:** binding create+validate for an **aggregator** (mock OpenAI-wire server) reaching a GLM/Kimi
  model id, plus a **frontier direct** binding — incl. greeting + tool smoke. Assert the picker **never** surfaces
  a Chinese direct base URL.
- **Frontend (vitest):** `ModelPicker` (loading/empty/error, capability chips), `ThinkingControl` (disabled levels,
  forced-on), entitlement-gated effort. **Playwright axe** on the new surfaces (zero violations).
- Determinism: no `time.Sleep`; mock clocks/servers.

## 11. Open decisions (for the owner)

1. **Cheap-tier replacement** for the removed DeepSeek managed fallback — what becomes the cost-router's cheapest
   target? *(Recommend Claude Haiku 4.5 or Gemini Flash — non-Chinese, already trusted; OR a cheap open model via
   a platform-owned aggregator binding. Must preserve the `routeCost` "last fallback = cheapest" invariant.)*
2. **Existing direct-DeepSeek bindings** — hard-disable any tenant rows that point at `api.deepseek.com`, or let
   them ride out with a deprecation banner while blocking new ones? *(Recommend: block new + deprecate visibly;
   decide a sunset date for existing — leaning hard-disable for a clean compliance posture.)*
3. **`max` semantics** — accept `max` as a canonical level mapping down to `high`/`xhigh` where unsupported
   (recommended), or keep four levels?
4. **Aggregator advisory price chips** — for aggregators that return list price in `/models` (e.g. OpenRouter),
   render a low-emphasis "list price · billed by {provider}" advisory chip, or omit price entirely for all BYOK
   sources? *(Recommend: advisory chip **on** only for sources that return real price metadata, visually distinct
   from the managed `$/M` chip, default collapsed; never for sources that don't return price — no guessing.)*
5. ~~**GLM/Kimi direct preset kind / China endpoints**~~ — **MOOT (resolved by the 2026-06-23 policy):** no direct
   Chinese presets at all; reach via aggregator/self-host only.

---

### Appendix A — the dialect cookbook (canonical effort → wire body, per dialect)

> **Reference, not a direct-integration spec.** Actrone opens no direct connection to any Chinese endpoint
> (policy §0.1). This documents how the **one** canonical knob `ReasoningEffort ∈ {off,low,medium,high,max}`
> (§4.7) is rendered by each `ThinkingDialect` (§4.3) — across the providers we offer **directly**, the
> **aggregators** (the supported path to GLM/Kimi/DeepSeek/Qwen), and the **self-host** case. Build the emit +
> the `reasoning_content` parse from this.

**A.1 Providers Actrone offers directly**

```jsonc
// Anthropic / Bedrock — native (ALREADY implemented). off ⇒ omit "thinking".
{ "model": "claude-opus-4-8", "stream": true,
  "thinking": { "type": "enabled", "budget_tokens": 16384 } }   // budget from ThinkingBudgetTokens(effort)

// OpenAI reasoning models — dialect ThinkingOpenAIEffort. off ⇒ omit; max ⇒ "high".
{ "model": "gpt-5.4", "stream": true, "reasoning_effort": "high" }

// Gemini / Mistral — reasoning_effort-style passthrough where supported; else omitted (graceful no-op).
```

**A.2 Aggregators — the supported path to GLM/Kimi/DeepSeek/Qwen** (the user's own aggregator key)

```jsonc
// OpenRouter — dialect ThinkingOpenRouter. off⇒{enabled:false}; low/medium/high/max ⇒ effort low/medium/high/xhigh.
// POST https://openrouter.ai/api/v1/chat/completions
{ "model": "z-ai/glm-5.2", "stream": true,
  "reasoning": { "effort": "high" } }            // OpenRouter advertises reasoning.supported_efforts per model

// Groq — dialect ThinkingGroq. reasoning_effort (off⇒"none" for Qwen / omit for gpt-oss) + force parsed field.
// POST https://api.groq.com/openai/v1/chat/completions
{ "model": "deepseek-r1-distill", "stream": true,
  "reasoning_effort": "medium", "reasoning_format": "parsed" }

// Together / Fireworks / DeepInfra / Novita / Cerebras — dialect ThinkingNone + PASSTHROUGH.
// Effort is the model id (pick the *-thinking / reasoning variant); platform emits reasoning_content already.
{ "model": "moonshotai/kimi-k2.7-code", "stream": true }   // forced-thinking variant — Off is not honoured
```

**A.3 Self-host (operator opt-in dialect; weights inside the customer's boundary)**

```jsonc
// Self-hosted GLM via vLLM — dialect ThinkingZhipu. off ⇒ {type:"disabled"}.
{ "model": "glm-5.2", "stream": true, "thinking": { "type": "enabled" } }

// Self-hosted Kimi via vLLM — dialect ThinkingMoonshot. instant mode ⇒ thinking:false.
{ "model": "kimi-k2.6", "stream": true,
  "extra_body": { "chat_template_kwargs": { "thinking": true } } }

// Self-hosted DeepSeek — dialect ThinkingDeepSeekSwitch (id swap chat⇄reasoner).
// Self-hosted Qwen — dialect ThinkingQwenEnable: { "enable_thinking": true, "thinking_budget": N }
```

**A.4 Same model, different wire id per source** — why `ModelCard.Aliases`/`Match` (§4.4) exists:

| Model | OpenRouter | Together | Fireworks | Self-host (bare) |
| --- | --- | --- | --- | --- |
| GLM-5.2 | `z-ai/glm-5.2` | `zai-org/GLM-5.2` | `accounts/fireworks/models/glm-5p2` | `glm-5.2` |
| Kimi K2.6 | `moonshotai/kimi-k2.6` | `moonshotai/Kimi-K2.6` | `accounts/fireworks/models/kimi-k2p6` | `kimi-k2.6` |

**A.5 Unified stream parse (all of the above):** reasoning text arrives on `choices[].delta.reasoning_content`
(some emit `reasoning`) → map to `Token.Thinking`; visible answer on `choices[].delta.content` → `Token.Delta`;
real `usage.reasoning_tokens` (when present) → `Usage.ReasoningTokens` (§4.6). The parse fix alone lights up
every passthrough aggregator before any dialect is set.
