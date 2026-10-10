# Actrone: Native SDK & A2A Protocol Compliance Plan

> **Status: IMPLEMENTED (2026-09-08) — 9 of 10 phases complete; Phase 6 blocked upstream.**
> Build log, per phase, in `progress.md`. Parts A, B and C are built, wired and green; A2A 1.0
> compliance is verified against the `a2aproject/a2a-sdk` reference client, not against our own
> understanding of the spec. Phase 6 (`agent.test()`) is blocked on the competitive parity
> plan's Parts C/E, which Phase 0 verified do not exist — documented as a blocker rather than
> stubbed. Three further items are deliberately not built (guard nodes, mid-run resume, the
> org-wide half of shadow-agent detection); each has no backend to call, and each refusal is
> recorded in the code as well as in `progress.md`.
>
> *Original plan follows, unedited.*
>
> **Status:** Design plan, not yet built. Grounded in a direct read of `internal/agentgraph/graph.go`,
> both SDKs' full module structure (`actrone-py/src/actrone/`, `actrone-ts/src/`), and the complete
> `internal/a2a/` package (`spec.go`, `agentcard.go`, `registry.go`, `partstore.go`, `service.go`,
> `handler/http/a2a.go`), plus current (2026) research on agent-framework durability, A2A protocol
> adoption, and enterprise agent-reliability data. Every claim about what's built or missing was verified
> by reading the code, not assumed.
> **Scope:** three parts: (A) a typed, code-first SDK for building a native agent, covering not just
> control flow but memory/cost discipline, scheduling, structured output, coordination, voice (including
> outbound calling), replay debugging, and a choice of deployment target, informed by a deep comparison
> against the full 2026 agent-framework landscape (LangGraph, Pydantic AI, CrewAI, AutoGen, OpenAI Agents
> SDK, Claude Agent SDK, Google ADK, AWS Strands, Microsoft Agent Framework, Mastra, Vercel AI SDK); (B)
> the A2A implementation is pinned to protocol version 0.3.0, missing the 1.0 stable release's signed-card
> and multi-tenancy capabilities; (C) the CLI's own self-documented gap (no agent-write commands) closed
> now that Part A designs the authoring UX its code comment was waiting on.
> **Owner:** Matt.
> **Precedence:** inherits `../CLAUDE.md` (workspace) and `CLAUDE.md` (Actrone). SDK parity rule applies:
> TypeScript + Python, no Go leg; the CLI (Part C) is Go-only and outside that rule, an operational tool,
> not a client library.
> **Related:** `docs/Actrone_Competitive_Parity_Improvements_Plan.md` (Part A's `NodeGuard`, Part C's
> eval-dataset generator, Part D's query tooling, and the new Part G's universal governed capabilities are
> all direct dependencies of this plan's Part A), `docs/Actrone_Self_Hosting_Plan.md` (the self-hosted
> deployment target in §2.13), `internal/agentgraph/`, `internal/a2a/`, `internal/voiceoutbound/`,
> `internal/voicesessionflow/`, `actrone-py/src/actrone/`, `actrone-ts/src/`, `actrone-cli/cmd/`.

---

## 0. TL;DR

Two confirmed, concrete gaps, found by reading the actual code, not by assumption:

1. **No typed, code-first SDK for building a native agent.** `internal/agentgraph.Graph` (Actrone's own
   governed, durable, LangGraph-equivalent control-flow DSL) exists only in the Go backend. Neither
   `actrone-py` nor `actrone-ts` has a single `Graph`/`Node`/`Edge` type. The SDK's agent-creation method,
   `register_agent(self, agent_file: dict[str, Any])`, takes a raw, untyped dictionary. So "building
   natively, no other framework" today means either the no-code Studio wizard, or hand-typing JSON/YAML
   by hand, no compile-time safety, no autocomplete, no local validation before a round trip to the
   server. This is a real developer-experience gap against LangGraph/CrewAI's typed, fluent construction
   APIs, even though the underlying execution (durable, governed, crash-resumable) is structurally ahead
   of what either of those offer.
2. **The A2A implementation targets protocol version 0.3.0; the stable 1.0 release has been out since
   January 2026.** Confirmed by reading `internal/a2a/spec.go:13` directly: `const ProtocolVersion =
   "0.3.0"`. The 1.0 release adds two capabilities Actrone doesn't have: cryptographically signed Agent
   Cards (JWS, RFC 7515) and true multi-tenant single-endpoint hosting. The good news, also confirmed by
   reading the code: the well-known discovery path is already the correct 1.0 naming
   (`/.well-known/agent-card.json`), the JSON-RPC 2.0 + SSE streaming + webhook push-notification
   machinery is real and complete, and a signing pattern already exists in this exact package
   (`SignedPartStore`, for message-part integrity), so adding card-level signing extends an established
   pattern rather than introducing new architecture.

3. **The SDK's scope was too narrow even for what "native" already means.** A deeper pass against the
   full 2026 framework landscape, not just LangGraph and Pydantic AI, surfaced that the graph is one of
   several manifest sections with no typed SDK surface (`Memory`, `Loop`, `TokenBudget`, `Schedule`,
   `OutputSchema`, `Coordination`, voice sessions including outbound calling), that leading graph-first
   with the graph builder risks the exact complaint Microsoft's Agent Framework 1.0 draws in 2026 press
   ("confuses developers while rivals simplify"), and that "native" has always meant Actrone's kernel runs
   the loop, so "build with the SDK, host wherever you want" needs an honest third deployment target
   (§2.13), not a redefinition of native.

Both original gaps matter more than they might look in isolation, given where the industry actually is in
2026: Temporal (the durable-execution substrate Actrone's native agents already run on) raised $300M at a
$5B valuation this year specifically to scale durable execution for agentic AI, and there's a real, current
body of technical writing arguing that competing frameworks' checkpointing is *not* the same guarantee as
true durable execution. A2A reached 150+ supporting organisations (AWS, Google, Microsoft, IBM,
Salesforce) and Linux Foundation hosting by its 1.0 release. Closing these gaps isn't catching up to
a trend, it's making an already-correctly-positioned architecture legible and interoperable to a market
that's actively converging toward exactly what it already does.

---

## 1. Motivation, grounded in 2026 industry data

- **Durable execution is being recognised as the real dividing line, not a feature checkbox.** Current
  (2026) industry writing draws an explicit distinction between checkpointing (what LangGraph, CrewAI,
  Microsoft Agent Framework, Google ADK, and Strands all offer) and true durable execution (event-sourced
  replay recovery), arguing the former still leaves production gaps the latter doesn't. Actrone's native
  agents already run as real Temporal workflows, this is a structural advantage today, not a roadmap item,
  but it's invisible to a developer comparing SDKs side by side if the SDK itself doesn't make it easy to
  build with, test, and *demonstrate*.
- **A2A is now the market's actual cross-framework standard, not one of several competing proposals.**
  1.0 stable, Linux Foundation hosted, 150+ supporting organisations, production deployments in financial
  services, insurance, and supply chain as of its one-year mark. Organisations connect agents built on
  different frameworks, LangGraph, CrewAI, AutoGen, or proprietary systems, through A2A without
  point-to-point custom integration. Being pinned to a pre-1.0 spec version means Actrone-hosted agents
  are not confirmed interoperable with what the rest of the ecosystem is now standardising on.
- **Evaluation and observability, not the loop itself, is the industry's stated #1 reason agent pilots
  never reach production.** 88% of agent pilots never reach production; evaluation/observability is named
  the largest single blocker (64%); non-deterministic output is the top-named barrier (70%). This directly
  validates prioritising Part A's eval-testing integration (§2.3 below) as a first-class part of the SDK's
  own happy path, not an afterthought bolted on later.
- **"Shadow agents", unregistered, ungoverned, unmonitored agents touching production data, are a named,
  growing enterprise pain point.** This is precisely the failure mode Actrone's capability-ceiling and
  audit-ledger model already prevents by construction; it's a positioning and tooling opportunity, not new
  infrastructure to build from scratch.
- **The market's own conclusion is that no single SDK has won on developer experience**, "great DX in
  2026 means picking the framework that matches your language, stack, and complexity requirements rather
  than seeking a universal winner." That's the opening: Actrone can combine axes competitors individually
  win (Pydantic AI's type safety, Mastra's built-in memory/tracing, Vercel AI SDK's streaming and bundle
  discipline) with durability, governance, and cost-discipline none of them have together, but only if the
  SDK doesn't also inherit their individual weaknesses in the process.
- **Microsoft's Agent Framework 1.0 is a named 2026 cautionary tale**, criticised in the press for
  confusing developers with too much surface area while rivals simplify. Directly relevant: this plan adds
  several typed builders (§2.4-§2.6); shipping them all as equally-weighted, always-visible surface would
  risk the same complaint. Progressive disclosure (§2.2) is the stated mitigation, not an afterthought.
- **Time-travel/replay debugging is named as a top-tier 2026 DX differentiator**, and tools like LangSmith
  and Braintrust exist substantially to bolt it onto frameworks that don't have it natively. Native and
  BYOF-hosted agents already run as durable Temporal workflows with full execution history; exposing
  replay (§2.9) is close to free given that substrate, not a new capability to build from nothing.
- **The context/memory-management pain point is larger than orchestration itself**: current research puts
  roughly 65% of enterprise AI failures at context drift and memory loss during multi-step reasoning, not
  raw model limitations, with cost discipline (compression, model routing, prompt caching) named as the
  direct lever. Actrone already has real infrastructure here (two-tier memory, the semantic cache, the
  Loop Engineering work), invisible in the SDK today; §2.4 closes that.

---

## 2. Part A: Typed native-agent SDK

### 2.1 What exists and what's missing

`internal/agentgraph/graph.go` gives native agents governed, durable, LangGraph-style control flow:
`NodeKind` (`tool | llm | decision | end`, soon `guard` per the parity plan's `NodeGuard`), `Edge` with
optional `When` conditions, cycles, a validated entry and terminals, compiled to crash-resumable, governed
Temporal activities. None of this has a corresponding SDK type, and the graph is only one of several
manifest sections with no typed surface at all: `MemorySpec`, `LoopPolicySpec`, `TokenBudgetSpec`,
`ScheduleSpec`, `OutputSchemaSpec`, `CoordinationSpec` all exist on `AgentSpec` today, configurable only by
hand-typing the manifest dict. `register_agent`/`update_agent` in both SDKs take an untyped
`dict[str, Any]`; a malformed manifest of any kind is only discovered server-side, after a round trip.

### 2.2 Design principle: progressive disclosure, a simple path is the default, the graph is the power path

**This governs every subsection below and is stated once, explicitly, so it isn't lost as builders
accumulate.** Leading with the graph as the primary interface risks the exact complaint 2026 industry
coverage levels at Microsoft's Agent Framework 1.0, too much surface, confusing stack, while the framework
winning the "start here" recommendation (Pydantic AI) does so specifically by being low-ceremony: define
tools, a system prompt, and typed config, and go. Current research states roughly 90% of real agent use
cases are linear or close to linear.

- **The default authoring surface is a simple, linear, type-safe agent definition** (a system prompt,
  typed tools, a model, typed config), not a graph construction call. It compiles to a trivial two-or-three
  node `Graph` under the hood, the simple path is not a second, disconnected system, it's a thinner
  entry point onto the same wire format §2.3 produces.
- **The full `Graph`/`Node`/`Edge` builder (§2.3) is the explicit, opt-in path** for genuinely branching or
  cyclic flows, discovered when a developer needs it, not the first thing in the quickstart.
- **Every other typed builder in this plan (§2.4-§2.6) follows the same rule**: usable independently and
  minimally (sane defaults, nothing required to get started), full configuration available but not
  front-loaded.

### 2.3 The graph builder: mirror `agentgraph.Graph`'s types in both SDKs, fluent construction, client-side validation

- **Python** (`actrone-py`, new `actrone.graph` module): `Graph`, `Node`, `Edge`, `NodeKind` as typed,
  chainable classes, e.g. `g = Graph(entry="start"); g.add_node("start", kind="llm"); g.add_edge("start",
  "call_tool", when="needs_lookup")`. **TypeScript** (`actrone-ts`, new `graph` module): the equivalent
  typed, chainable API.
- **Client-side `validate()`, mirroring the Go package's exact invariants** (a defined entry that exists,
  unique node ids with a known kind, edges referencing declared nodes, at least one terminal, every node
  reachable from the entry), so a malformed graph fails immediately, locally, with a clear message, not
  after a network round trip. The Go validation logic is the single source of truth; the SDK-side check is
  a fast-feedback mirror of it, not a second, divergent implementation, the wire format is still
  authoritatively re-validated server-side on submission regardless.
- `graph.to_dict()` / `graph.toJSON()` feeds directly into `register_agent`/`update_agent`'s existing
  `agent_file` parameter, no backend API change required, this is purely an SDK-side ergonomics layer over
  an unchanged wire contract.
- Guard nodes (the parity plan's `NodeGuard`) are supported from day one in the builder, not added later,
  so code-first developers get the same capability Studio users get through the visual graph editor, not
  a second-class path.

### 2.4 Typed builders for memory, cost, and context discipline, the largest named pain point, closed first

Ranked above §2.5's builders deliberately: current research names context drift and memory loss as the
cause of roughly 65% of enterprise AI failures, larger than orchestration itself, and Actrone already has
real, working infrastructure here (two-tier memory, the semantic cache, the Loop Engineering work: a
Context Ledger, a compactor, JIT context, per-turn model-tier routing) that is completely invisible in the
SDK today.

- **`MemorySpec` builder**: typed configuration for what memory backs an agent, retrieval budget, and
  retention, mirroring the manifest field, with a documented, sane default (memory on, conservative budget)
  so a developer gets working memory without first learning the full config surface (§2.2).
- **`LoopPolicySpec` builder**: typed access to per-phase reasoning/model tier, compaction triggers and
  never-compact classes, the bounded reflection budget, tool-advertise strategy, and the cost SLO, the
  actual cost-discipline levers named as the enterprise ask (compression, cheaper-model routing, prompt
  caching), currently only reachable by hand-editing YAML.
- **`TokenBudgetSpec` builder**: typed spend/token ceilings per agent, surfaced at authoring time, not
  discovered after a bill.

### 2.5 Typed builders for scheduling, structured output, and coordination

- **`ScheduleSpec`/`TriggerMode` builder**: typed construction for `scheduled | event_driven |
  webhook_inbound` triggers, covering the background/automation agent type (§ the platform's own agent-type
  breadth, not just conversational), currently only settable via the raw manifest dict.
- **`OutputSchemaSpec` builder**: typed JSON Schema declaration for an agent's constrained final answer,
  for API-style/structured-output agents, mirroring the manifest's existing provider-native
  constrained-decoding + bounded-repair behaviour, just made discoverable and type-checked at the call
  site instead of hand-typed.
- **`CoordinationSpec` builder**: typed multi-agent/crew configuration, for agents that spawn and
  coordinate sub-agents via MACP, currently manifest-only.

### 2.6 Typed voice-session construction, including outbound calling

Voice runs as its own workflow type (`VoiceSessionWorkflow`, confirmed by reading
`internal/voicesessionflow/workflow.go`), not a node inside `agentgraph.Graph`, so this is a separate typed
surface, not an extension of §2.3's builder. Two real, already-built capabilities need a typed SDK path:

- **Inbound/interactive voice sessions**: telephony (Twilio), meeting bots, browser voice (LiveKit), voice
  personas, consent-gated cloning, typed construction over the existing `voice.LaunchRequest` shape.
- **Outbound calling** (`internal/voiceoutbound`, confirmed real and already governance-first: consent
  resolution against DNC/prior-consent/timezone facts, a spend-budget gate, E.164 validation at the
  boundary, idempotent dispatch): a typed builder for an outbound-calling agent (an appointment-reminder or
  renewal-notice agent that dials on a schedule), surfacing the consent and spend gates as visible,
  documented, required inputs, not hidden manifest fields a developer could accidentally omit.

### 2.7 Eval-testing as a one-line step in the SDK's own happy path

Given evaluation/observability is the industry's stated #1 production blocker (§1), the SDK should make
testing trivially easy, not a separately-discovered tool: `agent.test(eval_dataset_id)` (or
`agent.test(await evalDatasets.generate(spec))` inline), returning a scored report (cost, latency,
governance-verdict accuracy) before the agent is ever deployed. This depends directly on the competitive
parity plan's Part C (eval-dataset generation) and Part E's extended `loopeval` governance-accuracy
scoring; **this plan does not duplicate that work**, it's the SDK-ergonomics layer over it, the same
"don't build a second version" discipline used throughout the parity plan.

### 2.8 Durability as a demonstrable SDK feature, not a claim

Ship a documented, runnable example specifically demonstrating crash-resume: start a long-running native
agent, kill the worker process mid-task, show it resumes at the exact step of failure with no
re-execution of completed work. This is something LangGraph, CrewAI, Microsoft Agent Framework, and
Strands cannot demonstrate the same way per current industry analysis of their checkpointing-only model.
Make this the centrepiece of the native-SDK quickstart docs, not a buried appendix, it's a provable claim,
not a slogan.

### 2.9 Replay / time-travel debugging

Named as a top-tier 2026 DX differentiator, and something LangSmith/Braintrust exist substantially to bolt
onto frameworks that don't have it natively. Native and BYOF-hosted agents already run as durable Temporal
workflows with full execution history, exposing this is close to free, not a new capability to invent.
`agent.replay(task_id, from_step=N)` in both SDKs, and a CLI equivalent (Part C, §4), re-runs or inspects a
task from any recorded step, using Temporal's existing replay machinery.

### 2.10 A local dev view

`actrone dev` (Part C, §4), reusing Control Tower's existing `TraceViewer` component rather than building a
second visualisation surface, gives instant, local, visual feedback while iterating: the current graph,
a live trace of a local test run, tool calls, memory reads, matching Mastra's named DX advantage
("studio, evals, tracing... out of the box") without a second implementation of tracing UI.

### 2.11 Streaming by default, and a bundle-size discipline for `actrone-ts`

Two explicit design constraints, both named as the top praise for the frameworks currently winning on DX:
streaming is a default code path, not an advanced feature requiring extra configuration to reach; and
`actrone-ts`'s core client stays lean and tree-shakeable, a stated, tested constraint, not an aspiration,
since bundle size is a named, measured differentiator for TypeScript web developers specifically.

### 2.12 Shadow-agent detection

A lightweight SDK/CLI command (Part C, §4) that scans a codebase or org for BYOF-connected calls or agents
not routed through Actrone's governed gateway, surfacing "shadow agent" risk directly. Reuses the
competitive parity plan's Part D query tooling (governance data is already queryable there) rather than
building a second scanning mechanism.

### 2.13 Three deployment targets, one authoring surface

**This resolves the tension between "build with the SDK, host wherever you want" and what "native" has
always architecturally meant** (Actrone's kernel runs the loop). The fix is not redefining native, it's
decoupling authoring from the execution target, the same way Temporal's own SDK works regardless of
whether it's pointed at Temporal Cloud, a self-hosted cluster, or a local dev server.

- **`target="managed_cloud"`** (recommended default): Actrone's own production infrastructure, confirmed
  by the codebase's own terminology (`internal/config/config.go`'s repeated "managed cloud" vs.
  "self-hosted" contrast). Full Temporal-backed durability, kernel-level governance, everything this whole
  session has been building.
  - **`target="self_hosted"`**: the identical governed, durable kernel, on the customer's own
  infrastructure, per the existing Self-Hosting Plan. Genuinely "host wherever you want" in the fullest
  sense, without losing anything, since it's the same platform, not a lesser mode.
- **`target="connected"`**: the same typed SDK, but the developer's own process runs the loop
  (BYOF-connected under the hood). The tradeoff is stated plainly, not hidden: no Temporal-backed
  crash-resume, no kernel-level capability ceiling on the loop itself, but every governed action
  (inference, memory, tools, and the parity plan's new AP2/code-execution capabilities) still routes
  through the gateway and is audited exactly like any other BYOF-connected call.
- `agent.deploy(target=...)` is the one call that picks the destination; the `Graph`/`Memory`/`Schedule`/
  etc. builders from §2.3-§2.6 are unaffected by which target is chosen.

### 2.14 SDK parity, testing

Per the CLAUDE.md parity rule: identical API shape for every builder in this part, identical `validate()`
behaviour, identical `.test()`, `.replay()`, and shadow-agent-audit commands in both `actrone-ts` and
`actrone-py`, contract-tested so an agent built in Python and one built in TypeScript that describe the
same logical configuration serialise to the same wire shape.

### 2.15 Not in scope for v1

A visual graph editor inside the SDK itself (Studio already owns that surface); this plan is the code-first
path specifically, not a replacement for the no-code one. Automatic selection of a deployment target
(§2.13) based on inferred workload characteristics, target selection is explicit and developer-chosen, not
guessed.

---

## 3. Part B: A2A protocol upgrade to 1.0 stable

### 3.1 What's confirmed present and correct today

Reading `internal/a2a/` directly: JSON-RPC 2.0 request/response envelopes (`spec.go`), the full task
lifecycle (`submitted | working | input-required | completed | canceled | failed | rejected |
auth-required | unknown`, a superset of the spec's core states), SSE streaming, webhook-based push
notifications (`push.go`), a signed part store for context-by-reference blobs (`partstore.go`), a
delegation-verified registry (`registry.go`), and governance layered on top of all of it (vaulted
credentials, SSRF screening, tool-poisoning scans, spend caps, audit, per `spec.go`'s own header comment).
The well-known discovery path is already `/.well-known/agent-card.json`, the correct 1.0 naming
convention, not the older `/.well-known/agent.json`.

### 3.2 What's confirmed missing or unverified

- **`ProtocolVersion = "0.3.0"`** (`spec.go:13`), hardcoded, advertised on every Agent Card. The 1.0
  stable spec has been out since January 2026.
- **No Agent Card signing.** The 1.0 release adds JWS (RFC 7515) signatures over Agent Card content for
  identity verification. Nothing in `agentcard.go` signs the card; the only signing in the package
  (`SignedPartStore`) covers message parts, a different object, for a different purpose (fetch-capability
  integrity, not agent identity).
- **Multi-tenancy status unverified.** The 1.0 release's other named capability is a single A2A endpoint
  securely hosting many agents. `WellKnownCard` currently returns one `PlatformCard()`; `RegisterForAgent`
  and `CompileCardForCaller` suggest per-agent addressability exists internally, but whether an external
  A2A caller can already discover and address one specific agent among a tenant's many, versus only the
  platform/tenant as a whole, was not conclusively determined by this investigation. **Verify precisely
  before designing further**, this could be a small gap or already substantially satisfied.
- **Wire-type diff not yet done.** `spec.go`'s `Part` type is already a single struct with a `Kind`
  discriminator, which may already be close to where 1.0 wants implementations to be (a single sealed Part
  with field-presence, per the 1.0 release notes, as opposed to a v0.3-style per-kind subclass hierarchy
  in languages that have one). Go has no real subclassing distinction to begin with, so this may already
  be compliant, but it needs a field-by-field diff against the actual 1.0 JSON schema, not an assumption
  either way.

### 3.3 Design

- **Do not simply flip the version string.** Bump `ProtocolVersion` to `"1.0"` only after the diff in
  §3.2's last bullet is complete and every required 1.0 field/behaviour is confirmed present; a version
  bump that isn't actually compliant is a false interoperability claim, directly against this codebase's
  own honesty discipline applied everywhere else in this session's plans.
- **Agent Card signing**: extend `agentcard.go` to produce a JWS (RFC 7515) signature over the card
  content on generation. Reuse Actrone's existing Ed25519 signing/key-management infrastructure
  operationally (the same primitive already used for skills, capability packs, executed agreements, and
  residency attestation), but the **wire output must be a spec-compliant JWS**, not an Actrone-proprietary
  signature format, real interop requires the exact format other A2A implementations expect to verify,
  not just internal consistency.
- **Multi-tenancy**: once §3.2's verification is done, if a real gap exists, extend `registry.go` and the
  card-compilation path so a single Actrone A2A endpoint can address any of a tenant's individual agents
  by id, each with its own card, not only a platform-wide or tenant-wide aggregate card.
- **Backward-compatible migration, per the 1.0 spec's own guidance**: the 1.0 release is explicitly
  designed to let an Agent Card advertise both v0.3 and v1.0 behaviour simultaneously, so existing
  integrations migrate progressively rather than breaking on a single cutover. Advertise both during the
  transition; don't force a hard cutover.
- **The moat, once compliant**: pair standards compliance with what none of the other A2A implementations
  in the ecosystem have underneath them, the same governance layer (vaulted credentials, SSRF screening,
  tool-poisoning scans, spend caps, signed audit) already built into this exact package. The claim becomes
  "any A2A 1.0 agent talks to an Actrone-hosted agent with zero custom integration code, and every one of
  those calls is governed, audited, and capability-capped on Actrone's side", a combination no compared
  implementation makes.

### 3.4 Data model & migrations

No major new tables expected; `internal/a2a/repository.go` already persists registry/connection state.
A signing-key reference for Agent Card JWS likely reuses whatever key-management table already backs
skill/agreement signing, confirm at implementation time rather than assume a new table is needed.

### 3.5 Backend architecture

- `internal/a2a/agentcard.go`: add JWS signing over the card payload.
- `internal/a2a/registry.go`, `internal/a2a/service.go`: extend per-agent card compilation/addressing if
  §3.2's verification finds a real multi-tenancy gap.
- `internal/a2a/spec.go`: bump `ProtocolVersion` only once the diff is complete; add any new wire fields
  the 1.0 schema requires that `Part`/`Message`/`Task`/`AgentCard` don't yet carry.

### 3.6 Testing: real external interop, not only internal unit tests

Because "compliant" is a claim about interoperating with *other people's* implementations, verify against
an actual A2A 1.0 reference client (e.g. the `a2a-python` or equivalent reference SDK from the
`a2aproject` org), not only tests written against Actrone's own understanding of the spec, which risks
testing the implementation against itself. A signed card's JWS should be verified by a standard,
independent JWS library, not just Actrone's own signer/verifier pair.

---

## 4. Part C: CLI parity

### 4.1 What exists and what's missing

`actrone-cli` today (confirmed by reading `cmd/agents.go`, `cmd/deploy.go`) is deliberately an
operational/inspection tool, not an authoring one: `agents list`/`get` (read-only), `deploy` (push a
manifest for a hosted bundle, verify and scan the image, optionally promote), `promote`, `auth`, `models`,
`tasks`, `deployments`. The CLI's own code comment in `agents.go` is explicit about why write commands are
absent: *"Writes (register/update/delete) exist in the SDK but are intentionally left out of this CLI
release... add them when the agent-authoring UX is designed."* Part A designs that UX; this closes the gap
the CLI's own comment names as the trigger condition.

### 4.2 Design: operational commands over what Part A and the parity plan already expose, not a second authoring surface

- **`agents create`/`update`/`delete`**, accepting a manifest file the same way `deploy` already does, so
  native (not just hosted) agents get a full write path from the terminal.
- **Operational commands mirroring every part of the competitive parity plan**: `topic-rails
  list/get/benchmark/promote`, `eval-datasets generate/export`, `query` (running a governed query straight
  from the terminal or a CI pipeline), `prompt-variants compare/promote`, and an `a2a` debug group (fetch a
  remote agent's card, send a test message, inspect a signature), useful for exactly the interop
  verification Part B's testing strategy (§3.6) needs.
- **`actrone init`**, a project scaffold command (`actrone init my-agent --lang python`), generating a
  starter project wired to the SDK's typed builders (§2). This is the CLI's correct role in "building"
  agents, bootstrapping a project that then uses the SDK, not a third, Go-native reimplementation of
  graph/memory/schedule construction logic, which would duplicate authoring logic that already has to stay
  in parity across two SDKs per CLAUDE.md's dependency discipline.
- **`actrone dev`** (§2.10) and **`actrone tasks replay`** (§2.9's CLI-side mirror).
- **`actrone agents audit`** (§2.12's shadow-agent detection), already named as a CLI command when first
  discussed, consistent with the CLI's existing ops-tool identity.

### 4.3 Explicitly not built

A rich, interactive agent-construction wizard inside the CLI. That would duplicate either the SDK's typed
builders in a third language, or EMAOP's conversational builder (a hosted, LLM-driven, web-UI feature) in a
terminal. The CLI's role stays "operate on and inspect what the SDK, Studio, or EMAOP produced," not a
third authoring surface.

### 4.4 Backend architecture

No new backend endpoints beyond what Parts A, B, and the parity plan's Parts A/C/D/E/G already define; the
CLI is a thin `cobra` command layer over `internal/client` (already self-contained, no SDK dependency per
the Go SDK Removal Plan) calling those same endpoints.

---

## 5. Testing strategy (CLAUDE.md §7/§8)

| Layer | Coverage |
| --- | --- |
| **Unit (Part A, graph)** | `Graph`/`Node`/`Edge` builder API in both SDKs; `validate()` mirrors every invariant `agentgraph.Graph.Validate()` enforces, table-driven, including every currently-tested failure case in the Go package's own test suite. |
| **Unit (Part A, other typed builders)** | `MemorySpec`/`LoopPolicySpec`/`TokenBudgetSpec`/`ScheduleSpec`/`OutputSchemaSpec`/`CoordinationSpec` builders each round-trip to the exact wire shape the manifest already expects; each has a documented, tested default requiring zero configuration to produce a working value (§2.2's progressive-disclosure principle, asserted as a test, not just a design note). |
| **Unit (Part A, voice)** | The outbound-calling builder cannot construct a call without the consent and spend-gate fields present, asserted as a compile-time or immediate-validation failure, not a runtime surprise. |
| **Unit (Part B)** | Agent Card JWS signing/verification round-trips correctly; a tampered card fails verification; `ProtocolVersion` is only ever `"1.0"` once a compile-time-enforced completeness check (a table of required 1.0 fields) passes. |
| **Integration** | A graph built via the SDK, submitted through `register_agent`, deploys and executes identically to a Studio-authored graph with the same logical shape; `agent.replay()` against a completed task returns the same recorded steps Temporal's own history shows. |
| **Interop (Part B, the headline test)** | An actual external A2A 1.0 reference client successfully discovers Actrone's signed Agent Card, sends a message, receives a streamed response, and cancels a task, exercising the real protocol, not Actrone's own mocked understanding of it. |
| **Cross-language parity** | The same logical agent configuration, built once in Python and once in TypeScript across every builder in Part A, serialises to an identical wire manifest. |
| **CLI (Part C)** | `agents create`/`update`/`delete` round-trip against a live orchestrator the same way `deploy` already is tested; `actrone init` produces a project that builds/typechecks with no manual edits. |
| **CI gates** | lint 0-warnings, race/`-forked` (Go side), coverage threshold, contract breaking-change check, `openapi-drift` gate extended if any new HTTP surface is added. |

---

## 6. Phased delivery

- **Phase 0: A2A wire-type diff and multi-tenancy verification (Part B, §3.2).** Pure investigation, no
  code changes yet, resolve the two open unknowns (exact 1.0 field diff, current multi-tenancy status)
  before designing further, the same discipline this whole plan was built on. *Exit:* a precise, written
  list of exactly what's missing, not an estimate.
- **Phase 1: Agent Card signing + version bump (Part B).** Ship once Phase 0's diff confirms every
  required 1.0 field is present; signing is additive and doesn't block on the multi-tenancy question.
  *Exit:* an external A2A 1.0 reference client verifies a signed Actrone Agent Card successfully.
- **Phase 2: Multi-tenancy, if Phase 0 found a real gap.** Extend per-agent card addressing on the single
  endpoint. *Exit:* an external caller discovers and addresses two different agents belonging to the same
  tenant through the same A2A endpoint, each with its own correct card.
- **Phase 3: The simple authoring path plus the graph builder (Part A, §2.2-§2.3).** The simple path ships
  *with*, not after, the graph builder, since §2.2 makes it the default, shipping the graph alone first
  would put the power path in front of users before the simple one exists. *Exit:* a developer builds a
  native agent entirely in Python or TypeScript through either path, no hand-typed dict, no Studio.
- **Phase 4: Memory, cost, and scheduling builders (Part A, §2.4-§2.5).** Sequenced ahead of eval-testing
  and voice deliberately, per §1's finding that context/memory/cost discipline is the larger named pain
  point. *Exit:* an agent's memory, loop policy, token budget, schedule, output schema, and coordination
  are all configurable through typed builders, none requiring a hand-typed manifest field.
- **Phase 5: Voice, including outbound calling (Part A, §2.6).** *Exit:* a typed SDK call constructs both
  an inbound voice session and an outbound consent-gated, spend-capped calling agent.
- **Phase 6: Eval-testing integration (Part A, §2.7).** Gated on the competitive parity plan's Part C/E
  shipping first, `.test()` has nothing real to call until the eval-dataset generator and the extended
  `loopeval` scoring exist. *Exit:* `agent.test(eval_dataset_id)` returns a real scored report.
- **Phase 7: Durability demo, replay, local dev view, shadow-agent audit (Part A, §2.8-§2.10, §2.12).**
  Grouped together as documentation/tooling-shaped additive polish over Phases 3-6, not blocking anything.
  *Exit:* the crash-resume demo runs as documented; `agent.replay()` works against a real completed task;
  `actrone dev` shows a live local trace.
- **Phase 8: Deployment targets (Part A, §2.13).** Sequenced after the builders exist, since there's
  nothing to target-select until an agent can be authored. *Exit:* the same agent definition deploys
  successfully to managed cloud, to a self-hosted instance, and runs standalone under `target="connected"`,
  with the documented governance tradeoff holding in the third case (governed actions still audited, the
  loop itself not durable).
- **Phase 9: CLI parity (Part C).** Can start once Phase 3 lands (write commands need the authoring UX to
  mirror) and proceeds in step with whichever SDK phase it operationalises. *Exit:* every command in §4.2
  works against a live orchestrator.

---

## 7. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| **Claiming A2A 1.0 compliance without actually being compliant** | Phase 0's investigation-only phase before any version bump; the headline interop test (§5) uses an external reference client, not self-written mocks. |
| **SDK-side `validate()` drifts from the Go package's actual invariants over time** | Treat the Go `Validate()` function as the single source of truth; the SDK mirror is documented as a fast-feedback convenience, and server-side re-validation on submission is the real authority regardless, so a drifted client-side check fails safe (a false negative just means a slower round trip, never a false positive that lets an invalid graph through). |
| **Agent Card JWS signing reinvents a proprietary format instead of interoperating** | Explicit requirement in §3.3 that the wire output is spec-compliant RFC 7515, verified against an independent JWS library in testing, not just Actrone's own verifier. |
| **The typed graph-builder becomes a second, parallel authoring surface that drifts from Studio's visual editor** | Both compile to the identical `agentgraph.Graph` wire format and the identical backend `Validate()`; there is one manifest shape, two authoring surfaces, not two competing models. |
| **The SDK accumulates enough typed builders to repeat Microsoft Agent Framework's named "confusing stack" complaint** | §2.2's progressive-disclosure principle is asserted as a design rule up front, not a retrofit; the simple path (§2.2, Phase 3) ships as the default before any other builder, and each subsequent builder is documented as opt-in with a working default, tested as such (§5). |
| **`target="connected"` (§2.13) is misunderstood as "the same guarantees as native, just self-hosted"** | The tradeoff is stated in the SDK's own documentation at the point of choosing a target, not only in this plan: no kernel-level durability or capability ceiling on the loop, governed actions still audited via the gateway. |
| **The outbound-calling builder (§2.6) makes it easier to accidentally omit consent/spend checks than to include them** | Those fields are required, not optional, in the typed builder, asserted as a test (§5); the builder cannot construct a valid call without them. |

---

## 8. Definition of done

- A developer builds, tests, and deploys a native Actrone agent entirely in Python or TypeScript, through
  either the simple default path or the full graph builder, no hand-typed manifest dict, no Studio
  required.
- An agent's memory, loop/cost policy, token budget, schedule, output schema, coordination, and voice
  (including outbound calling) are all configurable through typed builders with working defaults.
- `agent.test()` returns a real, scored eval report before deployment, wired to the parity plan's eval
  infrastructure once that ships; `agent.replay()` returns a real completed task's recorded steps.
- The same agent definition deploys to managed cloud, to a self-hosted instance, or runs standalone under
  `target="connected"`, with the governance tradeoff for the latter documented and tested, not assumed.
- An external, independent A2A 1.0 reference client can discover Actrone's signed Agent Card, exchange
  messages, stream a response, and cancel a task, successfully, against the real protocol.
- The multi-tenancy question from §3.2 is resolved with evidence (either confirmed already satisfied, or
  closed by Phase 2), not left open.
- Every CLI command in §4.2 works against a live orchestrator; `actrone init` produces a working scaffold.
- SDK parity (TS + Python) confirmed via contract tests; CI gates green.
- `progress.md` updated; Phase 6's dependency on the competitive parity plan's Parts C/E explicitly
  documented as a blocker, not silently worked around.

---

*Last updated: 2026-08-12 | Owner: Matt | Scope: `actrone-py` and `actrone-ts` (new `graph`, `memory`,
`loop`, `schedule`, `output_schema`, `coordination`, and `voice` modules), `internal/a2a/`
(`agentcard.go`, `registry.go`, `spec.go`), `actrone-cli` (Part C), depends on
`docs/Actrone_Competitive_Parity_Improvements_Plan.md` Parts A, C, D, E, and the new Part G for full
functionality.*
