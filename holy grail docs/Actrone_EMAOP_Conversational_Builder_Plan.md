# Actrone EMAOP: Conversational, Just-In-Time Agent Builder

> **Status:** Brainstorm and design plan, not yet built. Everything below is a proposal for review.
> **Scope:** A new authoring surface for EMAOP (text, voice, attachments in; a working, tested agent
> out), sitting beside the existing manual Studio wizard, never replacing it.
> **Working name:** Studio Concierge. Tagline: **"described in your words, built by a governed
> compiler."**
> **Owner:** Matt. **Last updated:** 2026-07-26.

---

## 0. TL;DR

Today, building an agent in EMAOP means walking a 4-step wizard (Template, Persona, Capabilities,
Actions & Connections) and manually configuring each field. That wizard is not going away; it becomes
the escape hatch and the inspector.

What's proposed here is a second, parallel front door: the user describes what they want in plain
language, by typing, talking, or dropping in a file (a screenshot of their ticketing tool, an OpenAPI
spec, a policy PDF, a spreadsheet of sample invoices). The system asks only the questions it actually
needs answered, one small batch at a time, renders each question as the *same* UI component the manual
wizard already uses (never a bespoke chat form), and keeps a live "blueprint" preview visible the whole
time. When it has enough signal, it compiles a real agent draft, not by having an LLM freely author
config, but by having the LLM fill a form through the exact same governed, validated write-path a human
clicking through the manual wizard would use. The freshly built agent then has to pass a sandbox test
gauntlet, including deliberately-adversarial scenarios, before it is allowed to graduate toward staging
and production.

The manual wizard and the conversational flow write to the **same underlying draft object**. A user can
drop from one into the other mid-build and see (and edit) exactly the same thing. That single-state
property, not the chat interface itself, is where most of this design's actual defensibility lives.

---

## 1. Why this, why now

Chat-driven "describe it and we'll build it" agent builders are not novel. Lindy, Sierra's Agent Studio,
n8n's AI Workflow Builder and Relevance AI's Invent all ship some version of this in 2026 (see §3). If
Actrone ships the same thing, it ships a commodity feature a year late.

What none of the research turned up anywhere in the competitive set is a conversational builder whose
output is **provably** as governed as a hand-built one, backed by a deterministic compiler and a signed
attestation, tested first against synthetic data engineered to include refusal cases, before it ever
touches a live credential. Actrone already has every one of those primitives half-built for other
reasons (GAL, the attestation system, the onboarding synthetic-dataset generator, environment promotion,
dual-approval). This plan is mostly about wiring an NLP front end onto governance machinery that already
exists, not inventing a new governance model to match a new UI.

That reuse is also the honest read on cost: most of what makes this "groundbreaking" per the brief is
cheap to build precisely because Actrone already paid for the governance substrate. A competitor
retrofitting the same guarantees onto a chat-first builder built without them would be rebuilding their
platform under it.

---

## 2. Design principles (non-negotiable, referenced throughout)

1. **One state, two authoring surfaces.** The conversational flow never has its own schema. It fills
   the same `AgentDraft` the manual wizard's four steps fill. There is no "export the chat result into
   the wizard" step, because there is nothing to export; it was always the same object.
2. **The LLM proposes, the compiler decides.** Nothing the intake model produces reaches the account in
   an executable form until it passes through the exact validation path (`domain` entitlement checks,
   MAL field-classification defaults, GAL risk-class defaults, tier gating) that the manual wizard's
   "create" action already uses. A crafted prompt or a poisoned attachment can at worst cause a failed
   or badly-defaulted draft. It cannot produce an ungoverned one, because "ungoverned" is not a state the
   compiler can write.
3. **Ask the minimum, show everything.** Batch related questions, infer and show a default rather than
   blocking on every field, and keep a live, honest blueprint preview visible at all times so nothing
   the system assumes is invisible to the user.
4. **No modality is trusted alone for a consequential decision.** Voice can describe an agent. Voice
   alone cannot authorize a money-moving action's threshold, grant OAuth access, or promote to
   production. Those require a visible, typed or tapped confirmation, same as the rest of the platform
   already requires for destructive admin actions.
5. **Test before trust, trust before promote.** An AI-assisted build cannot reach staging without
   passing a sandbox test set that always includes at least one case the agent is expected to refuse or
   escalate. A human can override the gate, but never silently: every override is audit-logged, exactly
   like every other governance override on the platform.

---

## 3. Landscape (what exists elsewhere, and what it teaches)

- **n8n's AI Workflow Builder** runs a supervisor over six specialised sub-agents (Discovery, Builder,
  Planner, Responder, Parameter Updater), and critically the LLM never emits free-form workflow JSON: it
  calls a fixed set of schema-validated builder tools (`add_nodes`, `connect_nodes`, …), so a
  hallucination fails at the tool boundary instead of corrupting the graph. Discovery looks nodes up
  against the real node registry rather than inventing types.
  ([architecture deep-dive](https://medium.com/@rajveer.rathod1301/inside-n8ns-ai-workflow-builder-a-complete-architecture-deep-dive-f2eeb2d57ec8))
- **Lindy** shipped a fully open-ended "big prompt, let the model figure it out" builder first, found it
  unreliable, and rebuilt version 2 as a directed graph of typed, narrowly-scoped nodes: "put the
  Shoggoth in a very small box." ([ZenML case study](https://www.zenml.io/llmops-database/evolution-from-open-ended-llm-agents-to-guided-workflows))
  This is the single strongest piece of outside validation for principle 2 above: the industry already
  tried the unconstrained version and walked it back.
- **v0 (Vercel)** uses a composite-model architecture: a base model streams a full generation, a separate
  Quick Edit model handles narrow follow-up edits without full regeneration, and a token-stream
  consistency checker plus a post-stream autofixer catch errors as they're produced.
  ([Vercel](https://vercel.com/blog/how-we-made-v0-an-effective-coding-agent),
  [composite model](https://vercel.com/blog/v0-composite-model-family)) This is the model for "live
  blueprint preview with cheap incremental edits" in §4.3.
- **Google's A2UI (v0.9, 2026)** is an open, framework-agnostic protocol letting an agent declare UI
  intent (forms, pickers, sliders) as structured JSON, rendered by the client's own trusted component
  library, never as agent-authored code. ([Google Developers Blog](https://developers.googleblog.com/a2ui-v0-9-generative-ui/),
  [InfoQ](https://www.infoq.com/news/2026/07/google-a2ui-genui/)) This is the direct precedent for
  "JIT question = the wizard's own component, driven inline" in §4.2: the protocol exists specifically
  to solve the problem of an agent needing to ask a structured question without shipping it arbitrary
  render code.
- **Structured Uncertainty-guided Clarification** models which follow-up question to ask as a POMDP,
  selecting by expected value of information and penalising re-asking about an already-addressed slot,
  stopping once further questions stop being worth the interruption.
  ([arXiv:2511.08798](https://arxiv.org/html/2511.08798v1)) This is the formal backing for the
  "minimum viable clarification" engine in §4.2; §4.2 proposes a cheaper heuristic approximation of the
  same idea rather than a full POMDP solver, which is not warranted at this scale.
- **Voice-first configuration** research is consistent on two points: ASR error compounds directly into
  wrong downstream understanding especially on domain vocabulary and identifiers
  ([arXiv:2601.15339](https://arxiv.org/html/2601.15339v1)), and the mitigation that matters is always
  pairing voice with a visible live transcript plus an explicit temporary-vs-final transcription state,
  never voice as a silent, unverifiable channel.
  ([Azure Voice Live API](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live))
- **Microsoft's Agent Library** (Copilot Studio) is the cleanest public example of the
  template-plus-generative-fill hybrid: a catalog of named archetypes plus reusable components, where
  deploying a template pre-wires connections/topics/flows and the user fills only the
  environment-specific values. ([Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/agent-library-overview))
  This validates §4.1's archetype-match-first approach over generating a topology from scratch every
  time.
- **Sandbox-to-production discipline**: the strongest published framing is that a sandbox is only useful
  if the promotion path carries forward the *same* scoped secrets, tool permissions and approval gates
  proven in it; staging that is looser than production makes its own test results unreliable. This is
  exactly why §7 reuses Actrone's existing environment-promotion primitive rather than inventing a
  separate "demo mode" that graduates by a different, weaker rule.
- **Prompt injection** is the OWASP-ranked top AI threat of 2026 specifically because instructions and
  data share one channel in an LLM; there is no perfect technical filter, only architecture that limits
  the blast radius of a successful injection. That is the entire argument for principle 2: the defense
  is not a smarter filter on the intake model's input, it is making sure the intake model's output can
  never reach execution without re-validation it cannot itself waive.

---

## 4. The experience, end to end

### 4.1 Entry and intake

The agent creation screen offers two cards, side by side, neither one buried as an afterthought:
**"Describe what you need"** and **"Build it step by step."** Choosing manual goes straight into the
existing 4-step wizard, unchanged. Choosing conversational opens a two-pane layout: a chat/voice column
on the left, a live **Blueprint** panel on the right showing persona, capabilities, connectors, draft
system prompt and governance settings as they fill in, exactly mirroring what the manual wizard's four
steps would eventually show. The panel is real from message one; there is no separate "generating your
agent, please wait" black box.

The opening question is always the same: *"What do you want this agent to do?"* Accepted input:

- **Text**, typed or pasted (including pasting an existing SOP, an email thread, a Slack export).
- **Voice**, streamed through the existing telephony/voice transcription stack
  (`internal/voice/transcriber.go`, `transcriber_stream.go`) repurposed for a non-call context, with a
  live, visible, correctable transcript underneath the mic button. Never a silent black box: the user
  always sees what the system heard before it acts on it.
- **Attachments**, routed by type:
  - An **OpenAPI or Postman file** goes straight into the existing import pipeline
    (`internal/connectorimport/openapi.go`, `postman.go`), which already proposes actions from a spec.
    Nothing new to build here beyond hooking the upload target.
  - A **screenshot or image** of a tool's UI is read by a vision-capable model to identify the system
    (matched against the MCP/connector catalog first; only proposed as a custom-REST candidate if no
    catalog match exists) and to extract visible field names as classification hints.
  - A **policy or approval-matrix document** (PDF/DOCX) is parsed for numeric thresholds, named
    approval roles and escalation language, feeding the governance defaults in §4.4 rather than being
    treated as an instruction to the compiler.
  - A **sample data file** (CSV, a few example records) seeds the synthetic-sandbox schema inference in
    §5, so testing later doesn't require a live connection.
  - Every attachment passes through **MediaGuard** (already built, P1 core + P2/P3 ML engines) before
    it is stored, echoed back, or handed to any model, exactly as any other governed media path on the
    platform.

### 4.2 The just-in-time clarification loop

An intake step (not a freeform chat completion; a constrained extraction call with a fixed output
schema, following the n8n/Lindy lesson in §3) turns the accumulated input into a draft `AgentIntent`:
goal, best-guess template match with a confidence score, named systems mapped to catalog entries (or
flagged "no catalog match, candidate for custom connector"), tone/persona hints, trigger hints
(scheduled, on-demand, event-driven), and risk hints (does this touch money, PII, or an irreversible
action).

Each slot in that intent carries a confidence value, not just filled-or-not. A lightweight scorer (a
practical approximation of the EVPI-style approach in §3, not a full POMDP) ranks the unresolved,
consequential slots and asks about the top few together in one turn, never one field at a time. A slot
below the confidence threshold that isn't safety- or correctness-critical is filled with an inferred
default and shown, not silently assumed and not blocked on.

Every question is rendered as a **JIT widget**, and this is the load-bearing implementation detail: a
JIT widget is not a bespoke chat-bot form. It is the exact same React component the manual wizard already
uses for that field (the connector picker from `IntegrationSelector.tsx`, the risk-class selector from
the custom-connector governance sub-form, the cron field from `ScheduleConfig.tsx`), mounted inline by a
shared field-renderer the JIT engine drives, following the same separation A2UI formalises: the model
declares *which* field needs an answer, the client's own trusted component renders it. This is what
keeps the manual wizard and the conversational flow permanently in sync without a translation layer to
maintain, and it means there is zero new form UI to design, build, or keep visually consistent: the
component library already exists.

The user can answer a JIT widget by typing, speaking, tapping a chip, or (for a connector question)
saying "connect it now," which opens the exact same OAuth flow the manual Integration Hub uses
(`mcpApi.oauthStart`), landing back in the conversation afterward rather than in a separate page.

At any point, the user can say "let me just do this myself" and land in the manual wizard, pre-filled
to whatever has been resolved so far, on whichever step has the least-resolved fields. There is no
loss of information crossing that boundary, because there is no boundary: same object.

### 4.3 Iterative refinement

Every answer updates the Blueprint panel live, as a diff, not a rewrite (the v0 Quick-Edit pattern from
§3): "I'll add the Salesforce connector and set the deal-size approval threshold to $5,000, based on
the policy PDF you shared. Tap to change." The user can also address the Blueprint panel directly at any
time ("actually make the threshold $10,000," "drop the Slack notification, add email instead"), which
routes as a targeted, narrow edit against the specific field rather than a full re-generation of the
draft, keeping every other already-confirmed field untouched.

### 4.4 Governed compilation

Once the required slots clear the confidence bar (or the user explicitly says "build it" over remaining
gaps, accepting the shown defaults), the `AgentIntent` is handed to a compiler that is deliberately
**not** an LLM call. It is the same typed request the manual wizard's create action sends: entitlement
and tier checks, MAL field-classification defaults for any connector fields the intent references,
GAL risk-class defaults for any write action (unclassified defaults to `write` + approval-forced, the
same rule already shipped for OpenAPI-imported actions), capability allowlist resolution. If the
intake step's proposal is somehow malformed or tries to reference a risk class, tool, or connector the
account isn't entitled to, the compiler rejects that field back into a JIT question or a safe default;
it cannot special-case around the check because there is no code path that skips the check.

This is also the point where **the account's plan tier still applies exactly as it does in the manual
flow**: a conversational build with a described need for an enterprise connector still surfaces the
same upgrade prompt a manual click on that connector tile would.

---

## 5. Sandbox-first testing (the part that has to come before staging/production)

A compiled draft never starts life in a promotable state. It is instantiated into a dev/sandbox
environment with every write action forced to `dry_run`/`simulate` regardless of what the compiler
would otherwise have set, exactly mirroring the GAL simulate-then-commit machinery already built for
production traffic.

If the agent references a connector the tenant hasn't actually connected yet, rather than blocking
testing on a live credential, the sandbox generates a **synthetic stand-in system**: this generalises
the pattern just built for the platform onboarding sandbox (four embedded synthetic datasets: hr,
finance, it, procurement, each seeded with invented data and at least one case a governed agent must
refuse or escalate) from "one fixed demo dataset per vertical" to "an inferred schema for *any* described
connector," using whatever schema signal is available (an imported OpenAPI spec, extracted screenshot
field names, or a pasted sample-data file) to shape plausible fake records. The synthetic stand-in
means someone can fully test an agent's behavior before ever granting it a live credential to a real
system, which as far as the research in §3 turned up, no competitor builder offers; most either give you
a code sandbox (isolated compute, not governed behavior) or ask you to connect live and hope.

The test walkthrough itself is not "click run and see if it crashes." A scenario generator, following
the exact editorial rule already applied by hand to the onboarding datasets, always produces at least
one golden-path case and at least one case the agent is expected to **refuse or escalate** (an
over-threshold invoice, a privileged access request, a supplier past its compliance review, or the
domain-appropriate equivalent inferred from the described use case). Each scenario runs and displays its
full reasoning trace, tool calls, and governance verdict inline, reusing the same trace-viewer
components already built for attested runs, so the person testing watches the agent's judgment rather
than only reading a pass/fail line.

---

## 6. Security and governance model

- **Prompt injection is architectural, not filtered.** The intake step never has tool access and never
  executes anything; it is a pure, schema-constrained extraction call, so a malicious instruction buried
  in a pasted document or spoken aloud can at most corrupt the *proposal*, and the compiler in §4.4
  re-validates every field against fixed, server-side defaults regardless of what the proposal claims.
  The strongest published defenses still miss roughly one attack in ten; the response to that fact is to
  make sure a miss cannot reach execution, not to chase a perfect filter.
- **Voice cannot authorize consequence.** Describing an agent by voice is fully supported; setting a
  money threshold, granting an OAuth scope, or promoting to production by voice alone is not. Those
  actions require the same visible, typed or tapped confirmation the rest of the platform already
  requires for account-level destructive actions, consistent with the "typed-confirmed" pattern already
  used elsewhere (for example, the SAD's org-suspend action).
- **Every attachment is MediaGuard-scanned** before storage or model exposure, reusing the existing P1
  fail-closed EXIF/PNG/WebP-strip and text seam, and the P2/P3 ML face/OCR engines where applicable,
  rather than introducing a second, weaker upload path.
- **Attested compilation.** The compiler's output can optionally be signed using the attestation
  primitive already built for Reliability Substrate Plan 2 (L1.1: `BuildAttestation`, the same
  Ed25519-signed, cross-language-verifiable receipt used for run attestation). A customer gets
  cryptographic proof that a given agent's configuration was produced by the governed compiler and has
  not been hand-edited to bypass a default since, which is a genuinely novel claim among the platforms
  surveyed in §3: none of them make an auditable, signed claim about how a given agent's configuration
  came to exist.
- **Rate and cost bounds on the builder conversation itself.** The intake/clarification loop is its own
  LLM-backed loop and gets the same concurrency, timeout, and per-tenant cost ceiling discipline as every
  other governed loop on the platform; a runaway or adversarial back-and-forth degrades to "finish this
  manually" rather than accumulating unbounded spend.

---

## 7. Promotion: sandbox to staging to production

This reuses, rather than duplicates, the platform's existing environment-promotion primitive (the
`org_environment` ledger and promote/switch endpoints) and the dual-approval pattern already used
elsewhere for high-consequence admin actions (kill switches, data purge).

- **Graduation gate.** An AI-assisted build cannot be promoted out of sandbox until its scenario suite
  (§5) passes, specifically including its refuse/escalate cases; a pass on the golden path alone is not
  sufficient, because an agent that approves everything has not demonstrated the property that actually
  matters for a governed platform.
- **Human override exists and is never silent.** A user can promote past a failing gate deliberately, but
  it is a distinct, audited action ("override graduation gate," recorded with who and why), never a
  configuration flag that quietly lowers the bar.
- **High-risk agents get a second approver.** An agent whose compiled config includes a money or
  irreversible-action risk class requires a second human's approval to reach production, mirroring the
  dual-approval requirement already in place for platform kill switches and data purge, applied here to
  the promotion step instead.
- **Staging mirrors production constraints, not a looser version of them.** The same scoped credentials,
  tool permissions, and GAL coverage limits proven in sandbox carry forward unchanged; nothing about
  promotion is allowed to relax what was tested.

---

## 8. USPs and moats

Ranked by how differentiated they actually are, not by how impressive they sound.

1. **Governed compilation over LLM-authored configuration, made provable via attestation.** This is the
   strongest claim in this document. Every competitor in §3 either lets the model author config directly
   (with a constraining tool-schema at best) or generates code/topology for a human to review after the
   fact. None of them make a *signed, independently verifiable* claim that a specific agent's config was
   produced by a deterministic, policy-enforcing compiler rather than hand-edited afterward. That claim
   is only possible because Actrone already built an attestation primitive for a different reason
   (Reliability Substrate Plan 2); reusing it here is close to free and hard for a competitor to retrofit
   without first building the same substrate.
2. **Synthetic-sandbox-first testing with adversarial cases as the acceptance bar.** Turning "sandbox" from
   generic isolated compute into a governance test harness that specifically manufactures refuse/escalate
   scenarios, and requiring them to pass before promotion, is a direct extension of work already shipped
   for onboarding. Nothing in the competitive research showed an equivalent: the closest analogues are
   generic code sandboxes, not behavioral test suites built to prove an agent says no when it should.
3. **One state, two authoring surfaces, with a lossless handoff at any point.** Most competitive tools are
   either chat-first with a one-way "export to visual" step, or template-first with a bolted-on AI helper
   that summarizes back into prose. Neither preserves a live, bidirectional, field-level sync the way
   sharing one draft object does. This is also the cheapest of the four to get right, because it is a
   consequence of not building a second schema, not a feature to build on top of one.
4. **The promotion ladder an AI-built agent walks is identical to the one a hand-built agent walks.**
   No separate, weaker "AI mode" release path exists to quietly become the actual default over time. This
   matters most to the exact enterprise buyers the governance positioning already targets, and it is a
   policy decision more than an engineering one, which is precisely why it is durable: a competitor
   racing to ship the flashy conversational front end has little reason to also slow themselves down by
   holding AI-built agents to the same bar as hand-built ones.
5. **Longer-horizon, opt-in only: a proprietary defaults flywheel.** Aggregated, anonymized *shape*
   telemetry (which archetype gets matched for which described intent, which connector pairs commonly
   co-occur, what threshold values are typical per industry) can improve the confidence scorer's defaults
   over time, without ever aggregating tenant content. This is the standard proprietary-data-flywheel
   moat pattern from the research in §1, deliberately scoped narrow (shape, not content) to avoid it
   becoming a confidentiality liability, and it is explicitly a "later" item, not a launch claim.

**What is *not* a moat, stated plainly so it isn't oversold later:** the conversational interface itself,
voice input, attachment parsing, and a live preview panel are all now table stakes per §3. None of them
should appear in customer-facing positioning as a differentiator on their own. The differentiators are
what happens *after* the conversation: the compiler, the attestation, the adversarial sandbox, and the
identical promotion bar.

---

## 9. What would tell us this is working

- **Time-to-first-working-agent**, sandbox-tested and passing its refuse/escalate cases, compared
  between conversational and manual builds for a matched set of use cases.
- **Clarification-question count per successful build.** A rising count over time means the confidence
  scorer or archetype matcher is degrading, not improving; this should trend down as the archetype
  library grows (see the flywheel item in §8).
- **Graduation-gate override rate.** A high rate of humans overriding a failing gate is a signal the
  scenario generator isn't producing realistic or well-calibrated tests, not a signal the gate is too
  strict; it should be watched, not silently tuned away.
- **Manual-wizard drop-in rate mid-conversation.** Not a failure metric. A user landing in the manual
  wizard to fine-tune one field and returning to the conversation is the lossless-handoff property
  working as designed; what would be concerning is a user abandoning the conversation entirely and
  restarting fully manual, which suggests the conversational path lost their trust.

---

## 10. Phased build plan

Following the same P0 to P4 discipline used elsewhere on this platform's larger builds (ship a real,
useful slice first; add richness once the slice is proven).

- **P0: Smart draft, no live JIT UI yet.** Text-only intake, archetype matching against the existing
  template catalog, a single upfront extraction pass that pre-fills the manual wizard's four steps as a
  starting draft. No new governance surface: this literally cannot produce anything the manual wizard
  couldn't, because it fills the same draft and the user still walks all four steps to confirm. Lowest
  risk, fastest to ship, immediately reuses the OpenAPI/Postman import pipeline for any spec attached at
  this stage.
- **P1: Inline JIT clarification.** The confidence-gated question batching engine, JIT widgets rendered
  from the existing wizard components, live diffable Blueprint panel, targeted-edit refinement.
- **P2: Richer multimodal intake.** Vision-based screenshot understanding, policy-document threshold
  extraction, sample-data upload for schema inference.
- **P3: Voice.** Reusing the existing transcriber stack, live transcript UI, and the hard rule that
  voice never alone authorizes a consequential action.
- **P4: Synthetic-sandbox test generation, attested compile, and the graduation gate wired into
  environment promotion and dual-approval.** This is the phase that makes the sandbox-before-promotion
  requirement real rather than aspirational, and it is sequenced last deliberately: it is the highest-
  value, highest-effort phase, and P0 to P3 are each independently shippable and useful without it.
- **P5 (opt-in, later): the defaults flywheel** described in §8, gated on having enough graduated builds
  across enough tenants for the aggregate shape signal to be meaningful.

---

## 11. Decisions (locked 2026-07-26)

- **Confidence-scorer approach: hand-tuned heuristic (importance-weighted uncertainty, §4.2), not a
  formal EVPI approximation.** Rationale: at P1, an EVPI approximation would run on guessed probability
  and cost inputs anyway, since there is no real usage data yet, so it is not actually more rigorous than
  the heuristic, only more opaque, and opacity is a real cost on a governance product where a slot's
  question may need to be explained to an enterprise customer. The heuristic ships in P1. From day one,
  instrument every scoring decision (slot, confidence value, asked vs. defaulted, whether the user
  overrode the default) so the revisit trigger is concrete rather than "later": revisit if the §9
  clarification-question-count metric plateaus or rises instead of trending down, or at N graduated
  builds, whichever comes first. N to be set once P1 is instrumented and a realistic build volume is
  visible.
- **Synthetic-stand-in schema-inference threshold: keyed on field *type* signal, not a tunable confidence
  score.** A structured source (an imported OpenAPI/Postman spec, or sample data with typed columns) is
  confident enough to fabricate realistic records. A names-only, unstructured source (screenshot OCR
  field labels with no types or values) is not: ask the user for a few real example records instead. The
  failure mode that matters is fabricating a plausible-looking record with the wrong shape, which
  silently poisons the §5 refuse/escalate test scenarios; that is worse than the minor friction of asking
  for examples, so the line is near-binary on "do we have types," not a continuous threshold that invites
  false confidence.
- **Attested-compile exposure: split the primitive from the tooling.** The primitive (every compiled
  agent is attested) ships free and always-on at every tier: gating "was your agent's config tampered
  with" behind a paywall sits badly on a security/governance brand, and reads as "pay us to prove we
  didn't let something bad happen." The *consumption* tooling, bulk verification API, trust-center badge,
  and audit exports are the enterprise-tier differentiator, mirroring the existing split between the
  public trust center (`/v1/trust` + the marketing `/trust` page) and org-auditor tooling. This keeps the
  §8 #1-ranked moat intact as a claim at every tier while still giving pricing a real lever. Final
  packaging sign-off still belongs to whoever owns pricing tiers; this is the recommended default they
  start from, not an engineering override of that ownership.
- **P5 flywheel: opt-in, off by default, per-archetype aggregation (not per-industry, not
  platform-wide).** Default-on is off the table regardless of granularity, given the platform's existing
  tenant-data-confidentiality posture; the toggle must be explicit, visible in tenant settings, and the
  opt-in event itself audited (who opted in, when), consistent with the audit-everything pattern used
  elsewhere on the platform. Per-archetype is the aggregation floor: specific enough to be useful signal
  (an "expense-approval" archetype's typical threshold value is meaningful), without adding a second
  inferred-and-stored dimension about the tenant (industry) for marginal gain. Undifferentiated
  platform-wide aggregation is too coarse to produce good defaults across unrelated use cases.
  Per-industry aggregation stays a possible future escalation, not the launch shape, and would need its
  own confidentiality review if ever proposed.
