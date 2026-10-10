# Actrone — Structured Outputs (Agent-File `output_schema`) Plan

> **Status:** **P1 + P2 + P3 (consumer ergonomics) + self-hosted capability unlock ✅ SHIPPED (2026-06-19)**
> — Go suite green (50 pkgs); Python SDK (11 model tests) + TS SDK (43 tests, build) + frontend
> typecheck + eslint all green.
> **Remaining (deferred, see §6):** streaming partial-object surfacing only. **Owner:** Matt.
>
> **Self-hosted capability unlock — shipped as a per-binding opt-in flag** (NOT a runtime probe):
> migration `00048_model_endpoints_structured_output.sql` adds `supports_structured_output BOOLEAN
> NOT NULL DEFAULT FALSE`; threaded through `modelkeys.Endpoint`/store/`CreateInput`/`UpdateInput`;
> `resolver.buildProvider` base_url path sets `Capabilities: baseURLCaps(ep.SupportsStructuredOutput)`
> (preserves the conservative tools+128k default, flips `StructuredOutput` only). `Preset.
> StructuredOutputDefault` seeds the opt-in (true for openai/gemini/mistral; aggregators + self-hosted
> default false; native presets carry their own caps and ignore the column). The create handler's
> effective value = the request's explicit flag when sent, else the preset default. Frontend: an
> "Endpoint supports structured outputs" checkbox in the add-source form (non-native kinds, seeded
> from the preset default) and a "Structured on/off" toggle pill in the bindings list (PATCH on click).
> Opted-out bindings continue to use the validate-and-repair backstop.
>
> **What landed in P3:**
> - **Python SDK** ([backend/src/actrone/models.py]): `Task.structured_output` property (returns the
>   validated object from `output["structured_output"]`, else `None`) + `Task.structured_output_as(Model)`
>   generic that validates into any caller Pydantic model (TypeVar-bound, mypy-strict typed).
> - **TS SDK** ([actrone-ts/src/types/tasks.ts], exported from `index.ts`): `structuredOutput(task)` +
>   `structuredOutputAs<T>(task, zodSchema)` (Zod-validated, throws on absent / on mismatch).
> - **Frontend** ([frontend/.../tasks/[taskId]/page.tsx] + `StructuredOutputPanel.tsx`): a schema-validated
>   pretty-JSON panel under the trace view, rendered only when the task carries `output.structured_output`
>   (renders nothing for free-form tasks — opt-in enrichment, no empty box).
> - No Go SDK exists yet, so the planned Go accessor is N/A until one is built.
>
> **What landed in P2 (Anthropic + Bedrock forced-tool path):**
> - Anthropic `buildRequest` (`applyStructuredOutput`) + Bedrock `buildConverseInput`: when the
>   request carries a strict `OutputSchema` and the model is StructuredOutput-capable, synthesise an
>   "output tool" whose `input_schema` IS the schema (Anthropic/Bedrock have no `response_format`).
>   `tool_choice`/`toolChoice` is forced to that tool only when it stands alone (final wrap-up turn /
>   single-turn); mid-loop, with the agent's real tools advertised, it stays auto (Anthropic/Bedrock
>   cannot force one tool while leaving others callable) and the model reaches for the output tool when
>   ready. `json` mode and incapable models inject nothing — the repair backstop handles them.
> - `activity_service.StreamLLMResponse`: after draining, the forced output-tool call (matched by the
>   schema name) is lifted out of the executable `toolCalls` — it is the final answer, not a tool to
>   run — and its arguments become the candidate the schema validates. A real tool called in the same
>   turn keeps the loop going (the output tool reappears on the final turn). `streamTextOnce` (the
>   repair drain) now also captures tool-call chunks and prefers the output-tool's arguments, so the
>   bounded repair loop works identically on the forced-tool providers.
> - Tests: Anthropic + Bedrock build-request shape (forces alone / auto with real tools / json-mode &
>   incapable inject nothing); service repair-via-forced-tool + `streamTextOnce` tool-arg preference
>   (OpenAI-compatible SSE stub emitting a tool call mimics the forced-tool wire shape).
> **Goal:** let an Agent-File declare a JSON Schema the model's final answer MUST conform to, plumb
> it through `CompletionRequest` to OpenAI / Anthropic / Bedrock / Vertex, and guarantee conformance
> via provider-native constrained decoding where available, with a universal validate-and-repair
> backstop everywhere else.
>
> **What landed in P1:**
> - `domain.OutputSchemaSpec` on `AgentSpec` (`name`/`schema`/`mode` off|strict|json/`max_repair_attempts`)
>   with `Enabled()`/`StrictMode()` helpers; deprecated `PersonalitySpec.ResponseFormat` left inert.
> - New `internal/outputschema` package (santhosh-tekuri/jsonschema/v6) — one compiler shared by
>   load-time validation and runtime instance validation. Agent-file parser fails fast on a malformed
>   schema, missing name, bad mode, or out-of-range repair bound; defaults mode→`off`, repairs→1.
> - `model.StructuredOutput` on `CompletionRequest`; OpenAI-shaped `buildRequest` emits
>   `response_format:{type:json_schema,json_schema:{name,schema,strict:true}}` **only** when
>   strict-mode **and** `Capabilities().StructuredOutput` (real OpenAI, Azure+Vertex native adapters
>   via `nativeCaps`); otherwise omitted (graceful degrade to the repair backstop). No-schema requests
>   are byte-for-byte unchanged.
> - `StreamLLMResponse` validates the final-turn answer, runs a bounded repair loop
>   (`enforceOutputSchema` → `streamTextOnce`, fence-stripping, validator-error feedback), and on
>   exhausting the budget fails the task with `ERR_OUTPUT_SCHEMA_VIOLATION` (→ HTTP 422). Tool-call
>   turns are skipped (not the final answer). Repair cost is added to the task ledger.
> - `StructuredOutput json.RawMessage` threaded `StreamLLMResult` → `AgentTaskResult` (MAL-detokenised)
>   and persisted into the task output JSON as `structured_output` for `GET /tasks/:id` consumers.
> - Tests: `outputschema` compile/validate table; model wire-shape (strict / json / unsupported /
>   none); parser load-time rejections; activity repair-success / hard-fail / fence-strip via SSE stub.
>
> **Deferred to P3 (consumer ergonomics):** Python/TS/Go SDK typed `task.structured_output` accessors
> and the frontend task-detail pretty-JSON panel — the data is already on the API surface.

---

## 1. Design decision — **Strict by construction, with a universal repair backstop** (hybrid)

The question was "best-effort vs strict mode." Chosen: **strict**, but *strict realised differently
per provider* and always backed by validation, because the providers do not share one mechanism
(2026 landscape, verified):

| Provider | Native mechanism (2026) | Conformance | How we use it |
| --- | --- | --- | --- |
| OpenAI / OpenAI-compatible | `response_format: {type:"json_schema", json_schema:{name,schema,strict:true}}` — constrained decoding (FSM over the schema) | ~99.9% | Send native; trust + validate |
| Vertex AI (OpenAI-compat endpoint) | Same `response_format` surface (our Vertex binding speaks OpenAI shape) | ~99.7% | Send native; validate |
| Anthropic (Claude) | No `response_format`; **forced tool call** — synthesise a tool whose `input_schema` is the schema + `tool_choice:{type:"tool",name}` | ~99.8% | Inject tool, read `tool_use.input` as the object |
| Bedrock (Converse) | Model-dependent; use Converse `toolConfig` + `toolChoice:{tool:{name}}` (works for Claude/Nova/Mistral on Bedrock) | high | Inject tool, read tool-use block |
| Self-hosted (vLLM/Ollama) | Many support `response_format` json_schema or guided decoding (outlines/xgrammar); some do not | varies | Send native if `Capabilities.StructuredOutput`; else repair-only |

**Why not best-effort:** CLAUDE.md §0 (production by default) and §4 (errors are values) mean a
consumer asking for a typed object must get a conformant object **or** a structured error — never
silently-malformed JSON. **Why not pure strict (reject on first failure):** providers without
constrained decoding (older self-hosted, some Bedrock models) would fail too often; a single bounded
repair round-trip recovers them deterministically. So: **native-strict first, validate always,
one bounded repair on violation, structured error if still non-conformant.**

## 2. Agent-File surface

Add to `AgentSpec` (not `PersonalitySpec` — it's an output contract, not a prompting param). Repurpose
the existing dead `PersonalitySpec.ResponseFormat string` by **deprecating** it (keep parsing for
back-compat; ignore in the request path) and pointing it at the new field in docs.

```go
// AgentSpec += 
OutputSchema OutputSchemaSpec `json:"output_schema" yaml:"output_schema"`

type OutputSchemaSpec struct {
    // Name is the schema's identifier sent to providers (OpenAI requires it). Required when Schema set.
    Name   string         `json:"name"   yaml:"name"   validate:"omitempty,max=64,alphanum_underscore"`
    // Schema is a JSON Schema (draft 2020-12 subset providers accept: object root, typed properties,
    // required, enum, no $ref/oneOf where a provider forbids it). Validated at agent-file load.
    Schema map[string]any `json:"schema" yaml:"schema"`
    // Mode: "off" (default) | "strict" (native constrained decoding + validate + repair) |
    // "json" (ask for JSON, validate + repair, no constrained decoding — for weak upstreams).
    Mode   string         `json:"mode"   yaml:"mode"   validate:"omitempty,oneof=off strict json"`
    // MaxRepairAttempts bounds the repair loop (default 1, max 2). Each attempt is a billable call.
    MaxRepairAttempts int  `json:"max_repair_attempts" yaml:"max_repair_attempts" validate:"omitempty,min=0,max=2"`
}
```

**Validation at agent-file load** (`ValidateAgentFile` activity): when `Schema` is non-empty, compile
it with a JSON Schema validator (Go: `santhosh-tekuri/jsonschema/v6`, actively maintained, draft
2020-12) and **fail fast** if invalid — a broken schema is a config error (CLAUDE.md §4.1). Reject
schemas with constructs a target provider can't honour (warn + downgrade `strict`→`json` when the
routed provider lacks `Capabilities.StructuredOutput`).

## 3. Provider plumbing

`model.CompletionRequest` += an optional structured-output descriptor:

```go
type StructuredOutput struct {
    Name   string
    Schema map[string]any
    Strict bool // true => request native constrained decoding; false => json mode
}
// CompletionRequest += OutputSchema *StructuredOutput
```

Per provider `buildRequest`:
- **OpenAI / compatible / Vertex:** set `response_format` (new field on `openAIRequest`):
  `{type:"json_schema", json_schema:{name, schema, strict}}`. Vertex inherits this for free.
- **Anthropic:** when `OutputSchema != nil`, append a synthetic tool
  `{name: out.Name, description: "Emit the final answer as structured JSON.", input_schema: out.Schema}`
  and set `tool_choice:{type:"tool", name: out.Name}`. The streamed `tool_use` block's accumulated
  `input` JSON is the structured result. (Note: arrives as one block at end — **not** progressively
  parseable; surface the final object.)
- **Bedrock:** Converse `toolConfig.tools=[{toolSpec:{name,inputSchema:{json:schema}}}]` +
  `toolChoice:{tool:{name}}`; read the `toolUse` content block.

**Capability gating:** only emit native constrained decoding when `provider.Capabilities().
StructuredOutput` is true; otherwise downgrade to `json` mode (prompt-instructed JSON + validate +
repair). Capability already exists on real OpenAI; set it true for Vertex-Gemini, Anthropic (via the
tool path it's effectively always available), Bedrock-Claude/Nova.

## 4. Validate-and-repair path (orchestrator)

In `StreamLLMResponse` / the agentic loop's final turn, after the response is assembled:
1. If `OutputSchema.Mode == off` → unchanged behaviour.
2. Else extract the candidate object (raw text for `response_format`; tool-use `input` for
   Anthropic/Bedrock).
3. **Validate** against the compiled schema.
4. On violation and `attempts < MaxRepairAttempts`: issue one repair call — same provider, append a
   `user` message containing the validator error(s) + "Return ONLY JSON conforming to the schema."
   Re-validate. (Bounded; each attempt respects the task cost ceiling and `MaxToolCallsPerTask`.)
5. On still-non-conformant: return a domain error `ERR_OUTPUT_SCHEMA_VIOLATION` (code + message +
   details{schema_name, validator_errors} + request_id) — mapped to HTTP 422. Never return malformed
   JSON as success.
6. **Audit:** record the validation result + repair count on the `ReasoningTrace` evaluation step
   (reuse the audit spine) so governance can see how often models miss schema.

## 5. Consumer surface (closes the "no consumer" gap)

- **Task result:** `AgentTaskResult` += `StructuredOutput json.RawMessage` (populated when a schema is
  set). The text answer remains for display; structured consumers read the typed field.
- **SDKs (Python/TS/Go):** surface `task.structured_output` typed as the caller's
  model/`unknown`; document that it's present iff the Agent-File declares `output_schema`.
- **Frontend:** Agent-File editor docs + the task detail view renders the structured object in a
  pretty JSON panel (reuse `CodeBlock`); empty/absent state when no schema.
- **Docs:** `docs/orchestrator/agent-files` gains an `output_schema` section; `docs/orchestrator/
  streaming` notes the tool-path-arrives-at-end caveat.

## 6. Phasing

- **P1:** schema field + load-time validation + OpenAI/Vertex `response_format` + validate/repair +
  task-result field + docs. (Covers the constrained-decoding majority.)
- **P2:** ✅ SHIPPED — Anthropic + Bedrock forced-tool path (synthetic output tool, `tool_choice`
  forced when alone / auto mid-loop; activity lifts the output-tool call as the candidate; repair
  drain captures tool args).
- **P3:** ✅ SHIPPED (consumer ergonomics) — Python/TS SDK typed `structured_output` accessors
  (`structured_output` / `structured_output_as` · `structuredOutput` / `structuredOutputAs`) +
  frontend task-detail pretty-JSON panel.
- **Self-hosted capability unlock:** ✅ SHIPPED — the plan said "probe `Capabilities`", but a live
  runtime probe of arbitrary tenant endpoints is the wrong design (flaky, latency-adding, SSRF-adjacent,
  and it can't tell per-*model* support apart on aggregators). Shipped instead as a **per-binding opt-in
  flag** (`endpoint.supports_structured_output`, default off) the operator sets when they know their
  vLLM/SGLang build has guided decoding (xgrammar/outlines) — deterministic, safe, no extra network call.
  Migration `00048` + `modelkeys` wiring (`resolver.baseURLCaps` flips `StructuredOutput` only) +
  `Preset.StructuredOutputDefault` (openai/gemini/mistral) + add-source checkbox + bindings-list toggle.
  Opted-out bindings degrade to the validate-and-repair backstop (correct, just not provider-native).
- **Streaming partial-object surfacing** — DEFERRED (marginal); the token stream already carries the
  partial JSON, so this is UI incremental-parse polish, not a correctness gap.

**Status refreshed 2026-07-13 (code-verified) — independently re-confirmed, no drift found:** the
per-provider translation is confirmed live: `model/openai_compatible.go` emits native
`response_format: json_schema`; `model/anthropic.go` and `model/bedrock.go` use the synthetic-tool
constrained-decoding path; `model/gemini.go` sets `Capabilities.StructuredOutput: true`. Compiled at
both load-time (`agent/parser.go`) and runtime (`service/activity_service.go`) from the **same**
compiled schema. No stale claims found in this section of the doc.

## 7. Verification

Table-driven provider tests (stub servers) asserting the right wire shape per provider; schema
load-time rejection tests; repair-loop tests (conformant first try / repaired on second / hard-fail →
`ERR_OUTPUT_SCHEMA_VIOLATION`); audit-trace assertion; cost-ceiling respected across repair attempts.

## 8. Sources (2026 verification)

- [Structured output comparison across LLM providers — glukhov.org](https://www.glukhov.org/llm-performance/benchmarks/structured-output-comparison-popular-llm-providers/)
- [Structured outputs: JSON Schema, OpenAI, Claude, Gemini — logic.inc](https://logic.inc/resources/structured-outputs-guide)
- [Structured Output and JSON Mode Guide 2026 — TokenMix](https://tokenmix.ai/blog/structured-output-json-guide)
- [JSON Mode vs Function Calling vs Structured Output: 2026 Guide — buildmvpfast](https://www.buildmvpfast.com/blog/structured-output-llm-json-mode-function-calling-production-guide-2026)
