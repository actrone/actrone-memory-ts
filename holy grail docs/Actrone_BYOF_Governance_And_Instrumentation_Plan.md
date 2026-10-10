# Actrone — BYOF Governance & Framework Instrumentation Plan

> **AUDIT 2026-07-04 — status of this plan's deliverables:** ✅ hosted egress choke point
> (`harness-pool/templates/networkpolicy.yaml`) and ✅ per-framework governed tool wrappers
> (`backend/src/actrone/integrations/*`) are built. **Two real gaps remain:** (1) the universal
> OTel/OpenInference exporter is **TS-SDK-only** (`actrone-ts/src/adapters/otel.ts`) — the **Python-SDK
> twin is NOT built** (violates the Go+TS+Python parity rule); (2) the `byof_connected` **egress-boundary
> proxy/sidecar image (§3)** is unbuilt (only the *hosted* harness NetworkPolicy exists). Also: Python
> **stepwise** shims exist only for `langgraph/actrone_sdk/custom` — OpenAI-Agents/AutoGen/CrewAI run
> encapsulated. Build the Python OTel exporter first (smallest, parity).
>
> **Status refreshed 2026-07-13 (code-verified) — both items above are now stale, in Actrone's favour:**
> 1. **Gap (1) is CLOSED.** `actrone-py/src/actrone/integrations/otel.py` exists (confirmed on disk
>    2026-07-13) alongside `actrone-ts/src/adapters/otel.ts` — Python/TS OTel parity is shipped.
> 2. **The stepwise-shim scope claim is badly stale.** Python stepwise now covers **13** frameworks
>    (`agno, autogen, aws_strands, crewai, dspy, google_adk, langchain, llamaindex,
>    microsoft_agent_framework, openai_agents, pydantic_ai, semantic_kernel, smolagents`) —
>    OpenAI-Agents, AutoGen, and CrewAI (named above as still-encapsulated) all now have real stepwise
>    drivers. TS also gained a full stepwise core (`actrone-ts/src/harness/stepwise.ts`) with 6
>    framework shims. §6.2's per-framework table below (which still lists these as "encapsulated" /
>    "stepwise-capable" future work) is accordingly out of date for LangGraph/OpenAI-Agents/CrewAI/
>    AutoGen — see `Actrone_Stepwise_Framework_Expansion_Plan.md`'s refresh note for the current matrix.
> 3. **Gap (2) — the `byof_connected` egress-boundary proxy/sidecar (§3)** was **not** re-verified this
>    pass; treat as unverified 2026-07-13.
>
> How to give orgs a **spectrum of options** to get Actrone's full governance ("all the superpowers")
> across every authoring mode — and how to instrument each supported framework robustly. Separates the
> two things people conflate: **trace** (observability) vs **gate** (enforcement).
>
> Frameworks we support (`domain.HostedFrameworks`): `langgraph, crewai, autogen, openai_agents,
> llamaindex, dspy, actrone_sdk, custom`. Stepwise (per-step boundary) today: `langgraph, actrone_sdk,
> custom`; the rest run `encapsulated`. **(2026-07-13: this framework list and stepwise set are both
> stale — the enum now carries 21 frameworks and stepwise covers 13 Python + 6 TS drivers; see the
> refresh note above.)**

---

## 1. The core distinction — trace ≠ gate

- **Trace (observability):** *seeing* every step (LLM calls, tool invocations, agent handoffs). Achieved
  by instrumentation. Framework-agnostic via OpenTelemetry + OpenInference. Opt-in, best-effort.
- **Gate (enforcement/governance):** *being able to stop/gate/reverse* an action before it commits.
  Requires the action to pass through a **mandatory choke point** — Actrone's tool layer (app level) or
  a controlled egress (network level).

You can trace without gating; you cannot gate by tracing alone. "Provable governance on every action"
is a **gate + completeness** property, which needs a choke point every action must cross.

---

## 2. The spectrum of governance options (give orgs the choice)

| Mode | Where the loop runs | Governance guarantee | Dev effort | Choose when |
| --- | --- | --- | --- | --- |
| **native** | Actrone kernel (durable) | **Airtight** — every tool/model call mediated | none | Most agents; you want governed-first + durable with zero effort. |
| **byof_hosted** | Actrone kernel runs your framework code (durable Temporal) | **Airtight** — loop is inside Actrone's boundary | package your framework agent | You have framework code but want full governance + durability. |
| **byof_connected + Actrone egress boundary** *(new)* | your process, but inside an Actrone-controlled egress | **Airtight** — all egress forced through the governed path | deploy in the boundary (image/sidecar/mesh) | You must run the loop yourself but need provable governance. |
| **byof_connected + governed SDK tools** | your process, calling Actrone | **Best-effort** — governed for every action routed through Actrone's SDK tools | use SDK tools + tracer; don't side-channel | Convenience/latency; strong-but-not-provable governance. |
| **byof_connected (raw)** | your process | **Partial** — only what you explicitly route through Actrone | minimal | Prototyping; you accept the gap. |

The point: **orgs pick their spot on the effort ↔ guarantee curve.** Native/hosted are airtight for free
of thought; the new *egress-boundary* option makes connected airtight too; governed-SDK-tools is the
low-friction strong default. Every mode gets **operate/observe** (see §5).

---

## 3. Restoring the choke point at the network layer (connected → airtight)

**Already built for `byof_hosted`:** the harness pod runs under a NetworkPolicy driven by
`domain.RuntimeSpec.EgressSpec` — it denies all egress except the Actrone gateway/tools/memory + an
explicit allowlist, which the code comments call *"what makes 'we run your loop' governance
non-bypassable."* So the choke point exists today for hosted; the work below is **extending the same
mechanism to `byof_connected`** (where the loop runs in the developer's own process/network).

The principle: **make Actrone the sole egress path**, so every outbound action must cross a point Actrone
controls — without hosting the loop. Mechanisms (offer as a menu; ship the first as the paved road):

1. **Actrone governed-runtime image / sidecar (paved road).** Ship a container the dev's framework agent
   runs in, pre-wired with (a) an **egress forward-proxy**, (b) the SDK's governed tools, (c) the OTel
   tracer. The proxy **governs calls to connected systems through the GAL path and blocks/flags direct
   vendor egress**. Zero network expertise required from the dev.
2. **Kubernetes NetworkPolicy / service mesh (Istio/Linkerd).** Egress rules force all outbound through
   the Actrone gateway and **deny direct egress** to vendor endpoints. For orgs running their own k8s.
3. **Transparent eBPF interception (sidecar).** Captures egress with no app config, for environments
   that can't set `HTTPS_PROXY`.

**What the egress proxy does per request:** if it's a call to a connected system Actrone governs → route
through GAL (detokenise → simulate → gate → commit → receipt); if it's a direct vendor call outside the
governed catalog → **block** (strict mode) or **record as ungoverned** (audit mode) so completeness is at
least *provable-by-absence*.

**Developer responsibilities for provable-every-action (connected):**
- Run the agent inside the Actrone egress boundary (the image/sidecar/mesh policy) — this is what makes
  it *provable*.
- Use the SDK's **governed tools** for enterprise actions (so they hit the GAL path, not a raw client).
- Propagate **W3C `traceparent`** (the SDK does this) so steps stitch into Actrone's trace.
- Don't disable the proxy / don't add out-of-band egress. In strict mode this is enforced, not trusted.

---

## 4. How we guarantee governance for byof_connected — summary

Two enforcement seams, used together (defence in depth):
- **App layer — governed SDK tools.** The SDK provides the framework its tools **as Actrone-governed
  wrappers**; when the framework calls a tool, it's actually calling Actrone's `connector/{id}` → GAL.
  This gates every action the *framework* takes through its tools.
- **Network layer — egress boundary (§3).** Catches anything that tried to bypass the tools (a raw HTTP
  client). This is what upgrades "best-effort" to "provable."

With **both**, connected mode is governed as strongly as hosted. With only the first, it's strong but
dev-discipline-dependent. This is the honest guarantee ladder.

---

## 5. Operate & observe parity (all modes)

The Control Tower is **authoring-agnostic** — approvals (`/governance/escalations`), the signed action
ledger, rollback, cost, usage, posture read from the **runtime**, so a connected/hosted/native/SDK agent
all appear identically. The one variable is **reasoning-trace depth**, which §6 closes for connected via
instrumentation. So: **GAL + operate/observe parity for everything routed through Actrone, in every
mode** — the only delta is the completeness guarantee (§2) and trace depth (§6).

---

## 6. Framework instrumentation plan (robust + correct per framework)

Two goals: **observability** (trace, all frameworks) and **governance** (gate, via governed tools). The
robust approach is the industry standard — **OpenTelemetry with OpenInference semantic conventions** —
not bespoke per-framework hacks. The SDK ships a pre-configured OTel exporter → Actrone's collector
(traceparent already propagated), plus per-framework native hooks for fidelity + the tool seam.

### 6.1 Universal substrate
- **OTel + OpenInference** ([Arize OpenInference](https://arize-ai.github.io/openinference/) covers 30+
  integrations incl. all our frameworks) → the SDK auto-instruments and exports to Actrone. This yields
  standardized spans (LLM call, tool call, retrieval, agent step) framework-agnostically. Kill-switch via
  `OTEL_SDK_DISABLED`. This is the observability floor for **every** framework.

### 6.2 Per-framework mechanisms (verified against each framework's docs)
| Framework | Observability hook (trace) | Governance seam (gate) | Class |
| --- | --- | --- | --- |
| **LangGraph** | [OTel via global trace provider / `LANGSMITH_OTEL_ENABLED`](https://docs.langchain.com/langsmith/trace-with-opentelemetry); `BaseCallbackHandler` (`on_tool_start`/`on_llm_*`); `astream_events` typed stream | provide LangChain-compatible **tool objects** that call Actrone's governed tools | **stepwise** (already per-step) |
| **OpenAI Agents SDK** | [`add_trace_processor(TracingProcessor)` / custom `TracingExporter`](https://openai.github.io/openai-agents-python/tracing/) | provide `@function_tool` wrappers routing to Actrone | stepwise-capable |
| **CrewAI** | [event listeners (`BaseEventListener`/`TraceCollectionListener`) + `CrewAIInstrumentor().instrument()` (OpenInference)](https://signoz.io/docs/crewai-observability/) | CrewAI `Tool` wrappers → Actrone | encapsulated → stepwise via events |
| **AutoGen** | OpenInference AutoGen instrumentor (OTel) | AutoGen tool/function wrappers → Actrone | encapsulated |
| **LlamaIndex** | [OpenInference LlamaIndex instrumentor](https://arize-ai.github.io/openinference/python/instrumentation/openinference-instrumentation-llama-index/) + LlamaIndex `instrumentation` module | LlamaIndex `Tool` wrappers → Actrone | encapsulated |
| **DSPy** | OpenInference DSPy instrumentor | tool wrappers → Actrone | encapsulated |
| **actrone_sdk / custom** | native — Actrone drives the loop | native tool layer (already GAL) | **stepwise** (no instrumentation needed) |

### 6.3 Build order
1. **Universal OTel/OpenInference exporter in the SDK** (all frameworks get trace for free) →
   `traceparent` into Actrone's existing collector; render in the task trace viewer.
2. **Governed tool wrappers** per framework (the gate seam) — start with the stepwise set
   (`langgraph`, `openai_agents`) where the tool boundary is cleanest, then `crewai` (events), then the
   encapsulated three.
3. **Egress boundary** (§3) as the belt-and-braces that makes connected *provable*, shipped as the
   governed-runtime image first.
4. **Trace-depth surfacing** — connected agents' framework-internal steps appear in the Control Tower
   trace viewer (closing the depth gap from §5).

*Note: instrumentation is observability + convenience; the governance guarantee still comes from the tool
seam + egress boundary (§4), not from tracing.*

---

## 7. Is SDK-native robust vs LangGraph/CrewAI? (design-intent answer)

`native` (`actrone_sdk`) is a first-class **durable, governed agentic loop** (kernel `runAgenticLoop`;
stepwise), with tool-calling, memory, multi-step reasoning, human-in-loop (the GAL approval flow),
durability (Temporal), and multi-agent via the MACP mesh. It is production-grade for the **common agent
shape**, and it is the **only** mode with zero-effort *airtight* governance + durability.

Frameworks earn their place for **specific orchestration ergonomics**: LangGraph for explicit
graph/state-machine control (complex branching, cycles, sub-graphs); CrewAI for opinionated multi-agent
crew/role/delegation; AutoGen for conversational multi-agent. The honest framing is **not** "native is
weaker" — it's **"native is governed-first + durable; frameworks are ergonomics-first."** Guidance:
default to native unless you need a framework's control model or already have framework code — and in
those cases use `byof_hosted` (or connected + egress) to keep governance airtight.

*(A feature-by-feature native-vs-framework capability audit against the kernel loop is a separate,
worthwhile check before we publish this as guidance.)*
