# Actrone — OpenAI Provider Consolidation Plan

> **Status refreshed 2026-07-13 (code-verified):** ACCURATE — `model/openai_compatible.go` is confirmed
> as the single OpenAI-wire engine in current code (verified this pass while auditing the
> `ThinkingDialect`/structured-output wiring that also lives there); no second implementation found.
>
> **Status:** ✅ **SHIPPED (2026-06-19)** — full `go build`/`vet` + `go test ./...` green. **Owner:** Matt. **Scope:** `backend/orchestrator/internal/model`.
>
> **What landed:** the wire types (`openAIRequest`/`openAIMessage`/`openAIToolCall`/`openAIChunk`/…)
> moved into `openai_compatible.go`; `NewOpenAIProvider` / `NewMistralProvider` / `NewDeepSeekProvider`
> are now thin **factories** returning a configured `*OpenAICompatibleProvider` (correct `Name()` +
> capabilities + base URL); the `OpenAIProvider` / `MistralProvider` / `DeepSeekProvider` wrapper
> types + `rebuild`/`SetBaseURL`/`SetCapabilities` are deleted. `buildProvider` (main.go) + the
> capabilities test needed no change (they hold the `Provider` interface). Net ≈ −150 LOC, one
> wire-format surface. Behaviour unchanged (Name strings + capability sets + base URLs preserved).
> **Goal:** one OpenAI-shaped implementation, not two. Remove the back-compat `OpenAIProvider`
> wrapper type, fold the shared wire types into the canonical engine, and migrate the
> Mistral/DeepSeek adapters to construct the engine directly. Zero behaviour change.

---

## 1. Current state (why there appear to be "two")

There is **one engine and one thin shim**, not two engines:

- **Engine** — `OpenAICompatibleProvider` in
  [openai_compatible.go](../backend/orchestrator/internal/model/openai_compatible.go). Serves OpenAI,
  Mistral, OpenRouter/Together/Groq, vLLM/Ollama, **and** Azure + Vertex (via the `AuthHeader` /
  `AuthPrefix` / `TokenProvider` knobs). This is the real implementation: `buildRequest`,
  `streamSSE`, credential resolution, capability reporting.
- **Shim** — `OpenAIProvider` in
  [openai.go](../backend/orchestrator/internal/model/openai.go). A 148-line wrapper that owns an
  `inner *OpenAICompatibleProvider` and delegates **every** method to it (`openai.go:78-91`). It
  exists only to preserve three legacy affordances:
  1. the `NewOpenAIProvider(apiKey, modelID, timeout)` constructor signature;
  2. the **post-construction mutation** surface `SetBaseURL` / `SetCapabilities`, which the Mistral
     and DeepSeek adapters call after construction (`mistral.go:19-22`) — each mutation triggers a
     `rebuild()` of the inner engine;
  3. the **shared wire types** (`openAIRequest`, `openAIStreamOptions`, `openAIMessage`,
     `openAITool`, `openAIFunction`, `openAIChunk`) which are physically *defined* in `openai.go`
     (lines 93-147) but *consumed* by the engine in `openai_compatible.go`.

So the only real coupling is (3): the engine depends on types that live in the shim's file. Removing
the shim is a mechanical refactor, not a redesign.

## 2. Target state

- `openai_compatible.go` owns the engine **and** the wire types it consumes.
- `NewOpenAIProvider`, `NewMistralProvider`, `NewDeepSeekProvider` become **thin factory functions**
  that each return a configured `*OpenAICompatibleProvider` — no second type, no mutation surface.
- `openai.go`, `mistral.go`, `deepseek.go` either disappear or shrink to a single factory func each
  (keep the filenames for discoverability; they hold only a constructor + base-URL const).
- `Provider` interface and all call-sites (`main.go` `buildProvider`, the router, tests) are
  unchanged because they only ever hold the `model.Provider` interface.

## 3. Migration steps (atomic, buildable at each step)

1. **Move wire types.** Cut the six `openAI*` struct definitions from `openai.go` into
   `openai_compatible.go` (top of file, above the engine). No call-site changes — same package.
2. **Replace the OpenAI constructor.** Turn `NewOpenAIProvider` into a factory that returns the
   engine pre-configured with the OpenAI defaults currently in `openai.go:34-47`:
   ```
   func NewOpenAIProvider(apiKey, modelID string, timeout time.Duration) *OpenAICompatibleProvider {
       return NewOpenAICompatibleProvider(OpenAICompatibleConfig{
           Name: "openai", BaseURL: openaiBaseURL, APIKey: apiKey, ModelID: modelID, Timeout: timeout,
           Capabilities: Capabilities{Tools: true, ParallelTools: true, Vision: true,
               StructuredOutput: true, MaxContextTokens: 128000},
       })
   }
   ```
   Keep `const openaiBaseURL` here. Delete the `OpenAIProvider` struct, `rebuild`, `SetBaseURL`,
   `SetCapabilities`, and the per-method delegations.
3. **Rewrite Mistral.** Replace the `MistralProvider` wrapper with a factory:
   ```
   func NewMistralProvider(apiKey, modelID string, timeout time.Duration) *OpenAICompatibleProvider {
       return NewOpenAICompatibleProvider(OpenAICompatibleConfig{
           Name: "mistral", BaseURL: mistralBaseURL, APIKey: apiKey, ModelID: modelID, Timeout: timeout,
           Capabilities: Capabilities{Tools: true, ParallelTools: true, MaxContextTokens: 128000},
       })
   }
   ```
   Delete the `MistralProvider` struct + its delegating methods (`Name`/`Capabilities`/`Complete`/
   `CountTokens`). The `Name()` is now carried by the config, so `"mistral"` stays the circuit-breaker
   key — **verify** the router keys on `Name()` and not the concrete type (it does).
4. **Rewrite DeepSeek** identically (its caps already exclude vision; preserve them).
5. **Delete dead code & fix references.** `buildProvider` in
   [main.go](../backend/orchestrator/cmd/orchestrator/main.go) (lines 1385/1395/1400) keeps calling
   the three factories unchanged — they now return `*OpenAICompatibleProvider`, which satisfies
   `model.Provider`. Update any test that references the `OpenAIProvider` / `MistralProvider` /
   `DeepSeekProvider` concrete types (grep `OpenAIProvider{`, `MistralProvider`, `DeepSeekProvider`).
6. **Sweep capabilities call-sites.** The old shim exposed `SetCapabilities`; confirm nothing outside
   the `model` package called it (it did not — internal adapter use only).

## 4. Risk & verification

- **Risk: low.** Pure delegation removal; the engine code path is already what runs today.
- **Behaviour invariants to assert:** provider `Name()` strings unchanged (`openai`/`mistral`/
  `deepseek` — circuit-breaker keys + cost attribution), capability sets unchanged per provider,
  base URLs unchanged.
- **Gates:** `go build ./...`, `go test ./internal/model/... -race`, full orchestrator test suite,
  `golangci-lint`. Add/keep a table-driven test asserting each factory returns the expected
  `Name()` + `Capabilities()` + base URL (via a tiny exported test seam or by hitting a stub server).
- **Net diff:** ~ −180 lines, one fewer type per adapter, single wire-format surface to maintain.

## 5. Out of scope

Anthropic and Bedrock providers are genuinely distinct wire formats and stay separate. This plan only
collapses the OpenAI-shaped trio onto the engine that already backs them.
