# Actrone Voice — Outbound, Embeddable Orb, SDK Voice & the Agentic Moat

> Plan authored 2026-07-02. Status: proposal (no code written yet). Owner: Matt.
> Scope: (1) full outbound calling, (2) distributable `<actrone-orb>` web component,
> (3) voice in all SDKs — plus the two moats the follow-up questions exposed:
> (4) governed **agentic-during-call** (MCP/A2A/MACP + record lookup + post-call workflows),
> (5) **multi-channel** artifact delivery (Slack/WhatsApp/Teams, not email-only).
> All work flag-OFF by default, governance-native, honest about deployment-gating.

> **Status refreshed 2026-07-13 (code-verified): "Status: proposal (no code written yet)" is
> MAJOR-STALE — §1, §2, and §3 are substantially built.** Verified directly:
> - **§1 outbound calling** — `backend/orchestrator/internal/voiceoutbound/` (`originator.go`,
>   `consent_resolver.go` + test, `idempotency_memory.go`, `store_pg.go`) and
>   `internal/voicecampaign/` (`campaign.go`, `planner.go`, `runner.go` — a Temporal-style
>   parent/child campaign structure matching §1.4 exactly, all with tests) both exist.
> - **§2 the `<actrone-orb>` web component** — built: `frontend/apps/control-tower/src/orb/orb.ts`
>   compiles to `frontend/apps/control-tower/public/orb/v1.js` (the exact CDN path this doc
>   specifies, `https://cdn.actrone.com/orb/v1.js`), plus `orb.bundle.test.ts`. The backend token-mint
>   half is `internal/voiceembed/` (`service.go`, `ratelimit.go`, `store_pg.go`) — an
>   origin-allowlisted `public_key` → LiveKit join-token mint, matching §2's design precisely (its own
>   doc comment cites "Voice Outbound Plan §2.2").
> - **§3 voice in all SDKs** — built in both supported client SDKs (Go is not one of them; see
>   `Actrone_Go_SDK_Removal_Plan.md`): `actrone-ts/src/client.ts` exposes
>   `client.voice.calls.create(...)` and campaign methods; `actrone-py/src/actrone/client.py` has
>   `place_call`/campaign methods with `VoiceCallResult`/`Campaign` Pydantic models in `models.py`,
>   both with doc comments explicitly citing "Voice Outbound Plan §1.4/§1.5."
> - **§4/§5 (agentic-during-call, multi-channel artifact delivery)** — not independently re-verified
>   this pass; **(unverified 2026-07-13)**.
>
> What was **not** confirmed built: the carrier-registration/STIR-SHAKEN branded-calling runbook
> (§1.2, inherently deployment-gated, as the doc itself says) and whether AMD-branch TwiML (§1.3) is
> wired. Update the top status line to "code-complete for §1–§3, deployment-gated where the doc says
> so" rather than "proposal (no code written yet)."

---

## 0. The unifying moat thesis

Every incumbent (Vapi, Retell, Bland, ElevenLabs Agents, OpenAI Realtime, Twilio ConversationRelay)
ships *fast, natural* voice. None ship **governed** voice. Actrone's differentiator is that **every
spoken word and every tool the agent touches passes through the same policy engine (DPE → MAL →
Audit) as the rest of the platform**, with an immutable governance diary on the record.

**A critical architectural consequence — and our defensible moat:** speech-to-speech models
(OpenAI `gpt-realtime`) emit *audio directly* — there is no intermediate text to inspect *before*
it is spoken, so you **cannot** gate an utterance against policy pre-speech. Actrone's
STT → LLM → **DPE gate** → TTS pipeline is exactly what makes governance-native voice possible.
**We therefore deliberately keep the pipeline architecture** (and add governed tool-calling to it)
rather than adopt speech-to-speech. This is a feature, not a limitation: it is the only architecture
in which a policy-violating reply is *never synthesized*. Latency cost is real (~200-400ms vs
speech-to-speech) and is mitigated by streaming + filler/thinking cues (§4.4), which the incumbents
also use while awaiting tool results.

The four moats, mapped to the asks:

| Moat | Nobody else has | Lands in |
| --- | --- | --- |
| Governance-gated **agentic** voice (tool/MCP/A2A/MACP mid-call) | tool calls exist elsewhere; **governed** tool calls do not | §4 |
| **Consent-native outbound** (TCPA/DNC/calling-window/attestation enforced *in the origination path*) | others bolt consent on; ours refuses to dial | §1 |
| **Governed embed** (`<actrone-orb>` shows blocked/escalating state to end-users; origin-allowlisted) | embeds are ungoverned black boxes | §2 |
| **Governance-first SDKs** (consent decision, idempotency, request-id, governance events typed in) | SDKs are thin HTTP wrappers | §3 |

We already own ~70% of the substrate: `voiceconsent` (TCPA window + DNC + marketing consent +
two-party recording + disclosures), `voicespend` (budget ceilings), `SessionSigner`, the telephony
factory, per-tenant STT/TTS stores, the LiveKit issuer + assignment queue, the artifact pipeline,
`channels`/`notify`, and the platform's tool/MCP/A2A/MACP execution kernel. Most of this plan is
**wiring existing governed primitives into the voice path**, not greenfield.

---

## 1. Outbound calling (best-in-class, consent-native)

### 1.1 What we reuse
Inbound already gives us: TwiML rendering, `TelephonyFactory` cognitive loop, per-tenant TTS/STT,
`SessionSigner`, `voiceconsent` (calling-window/DNC/marketing-consent/E.164→timezone locator),
`voicespend`. Outbound reuses all of it; the caller-media side is identical (Twilio dials our same
`/v1/voice/twilio/stream` WS).

### 1.2 New: governed call origination
- **`voice.Originator` seam** → Twilio `POST /Accounts/{sid}/Calls.json` with `To`, `From` (a
  verified/branded number), `Url` = our TwiML webhook (`?tenant=&agent=&persona=&direction=outbound`),
  `MachineDetection=DetectMessageEnd`, `AsyncAmd=true`, `AmdStatusCallback`, `StatusCallback`.
  Behind an interface so Telnyx/Vonage can slot later (multi-carrier is a real moat but Twilio-first).
- **Pre-dial governance gate (the moat):** origination is *refused* unless
  `voiceconsent.Evaluate` passes for the target — calling window in the callee's timezone (we already
  resolve E.164→IANA), DNC list, marketing consent for the campaign purpose, per-number frequency
  cap. `voicespend.Evaluate` gates budget. Emits a consent decision + audit row **before** any dial.
- **Idempotency**: client-supplied or generated key stored → dedupe re-dials (CLAUDE.md §6.2).
- **STIR/SHAKEN + branded caller ID**: A-level attestation is carrier-side (Twilio, on owned+verified
  numbers). We (a) store verified `From` numbers per tenant, (b) surface attestation + `AnsweredBy`
  on the artifact, (c) **document** the carrier-registration runbook (branded calling / CNAM / RMD —
  4-6 wk lead, deployment-gated). Research: branded calls answered **62% vs 20%**; B/C attestation
  gets "Spam Likely".

### 1.3 New: AMD-aware TwiML branch
TwiML/`<Connect>` returned to Twilio branches on `AnsweredBy`:
- `human` → speak disclosures (§telephony persona work) → connect to the governed agent stream.
- `machine_end` → **governed voicemail drop** (a DPE-gated TTS message) or hang up, per campaign policy.
- `fax`/`unknown` → hang up, record outcome.

### 1.4 New: `voicecampaign` — durable, governed outbound campaigns (the big outbound moat)
Outbound at scale is a *campaign*, not a call. New `internal/voicecampaign` + a **Temporal workflow**:
- Campaign = {agent, persona, target list, purpose/consent-basis, pacing (calls/min), max attempts,
  retry backoff, quiet-hours policy, DNC suppression, budget ceiling}.
- **Parent workflow** fans out **child workflows per callee**, rate-limited, each of which:
  re-checks consent at dial time (windows shift across timezones during a long campaign), originates,
  handles AMD outcome, retries with backoff on no-answer/busy, respects max attempts, records the
  governed artifact. Durable = survives restarts, exactly-once dial via workflow-ID dedup.
- **Pacing/quiet-hours across timezones** is governance-native: a callee in a now-closed window is
  *deferred*, never dialed. This is the thing compliance teams cannot get from Vapi/Bland.
- Endpoints: `POST /v1/voice/campaigns` (create), `.../pause|resume|cancel`, `GET .../{id}` (progress),
  `GET .../{id}/calls`. Control-Tower surface: live campaign progress, per-call outcomes, consent
  suppressions, spend burn-down.

### 1.5 Single ad-hoc outbound call
`POST /v1/voice/calls` `{agent_id, persona_id?, to, from?, consent_basis, idempotency_key?}` — the
1:1 path (callback, verification), same pre-dial gate, no campaign machinery. This is what the SDK
`calls.create()` and "call this lead back" autonomy hits.

### 1.6 Autonomy
Once §4 lands, an **agent can request an outbound call as a governed tool** (`voice.place_call`),
subject to the same consent gate + an approval policy for cold outreach — e.g. after a support chat,
the agent offers "want a callback?" and, on yes, places a consent-satisfied call.

### 1.7 Honest gating
Carrier registration (branded calling, RMD cert, verified numbers, 10DLC-adjacent), live STIR/SHAKEN
attestation, and real PSTN dialing verify **on deployment**. All composition/gating/campaign
orchestration is unit-testable with a fake `Originator` (same posture as the inbound work).

---

## 2. Distributable `<actrone-orb>` web component

### 2.1 Shape (industry-standard, per LiveKit/Speechify embed patterns)
A framework-free **custom element** shipped as a standalone bundle:
```html
<script src="https://cdn.actrone.com/orb/v1.js" async></script>
<actrone-orb agent="ag_123" public-key="pk_live_…" mode="voice" theme="auto"></actrone-orb>
```
- **Shadow DOM** encapsulation — host-site CSS can't leak in, orb styles can't leak out.
- Reuses the **pure** Aura core (`lib/aura/state.ts` + Canvas renderer) ported framework-free (no
  React in the bundle → tiny, CSP-friendly, zero runtime deps). Audio-reactive off the remote audio.
- Attributes: `agent`, `public-key`, `api-base`, `mode=voice|text`, `theme`, `brand-*` overrides,
  `greeting`. Emits DOM events: `actrone:state`, `actrone:transcript`, `actrone:governance`,
  `actrone:ended`.
- **Governance visible to end users:** the orb pins red on `blocked`, amber on `escalating` — the
  end-user *sees* governance act. No competitor's embed does this.

### 2.2 New backend: governed embed origin-allowlist
- `POST /v1/voice/embed/token` — **PUBLIC but Origin-checked**: verifies the request `Origin` against
  the tenant's configured **domain allowlist** for that public key, rate-limits per origin, then mints
  a LiveKit join token + enqueues the assignment (reuse §browser-leg). A `public-key` is a
  tenant-scoped, allowlist-bound, revocable embed credential (never the API key).
- New `voice_embed_configs` store: {public_key, tenant, agent, allowed_origins[], mode caps, rate
  limits, enabled}. Settings UI: create key, manage domains, copy snippet, live preview.
- CSP guidance doc + Subresource Integrity hash for the CDN bundle.

### 2.3 Distribution
`@actrone/orb` on npm (custom element + programmatic API) **and** a CDN `<script>` for no-build sites.
Versioned (`/orb/v1.js`), self-contained, no external fetches at runtime (CSP-strict).

### 2.4 Depends on
§3.2 client SDK primitives (token → LiveKit connect → orb events). Build the client SDK core first,
then the orb is a thin custom-element shell over it.

---

## 3. Voice in all SDKs (Go, Python, TS server + TS browser client)

### 3.1 Server SDKs (`@actrone/sdk`, `actrone-python`, `actrone-go`) — new `voice` namespace
- `voice.calls.create({agent, to, persona?, consent_basis, idempotency_key?})` → outbound originate.
- `voice.calls.get/list`, `voice.calls.cancel`.
- `voice.campaigns.create/pause/resume/cancel/get/listCalls`.
- `voice.meetings.dispatch({agent, meetingUrl|platform+id, consent})` (wrap existing endpoint).
- `voice.sessions.list/get` (artifacts: transcript/summary/action-items/governance diary).
- `voice.personas.list/get/create/update/delete`.
- `voice.webhooks.verify(sig, body)` + typed events: `call.started|answered|ended`,
  `transcript.ready`, `artifact.ready`, `utterance.blocked`, `escalation.raised`, `campaign.progress`.
- **Moat baked in:** SDK auto-sets `Idempotency-Key` + `X-Request-Id` (UUIDv7, per CLAUDE.md §4.2/§6.2),
  surfaces the **consent decision** object on the response (why a call was refused), and raises typed
  errors carrying `request_id`. Same key across retries (the documented idempotency semantics).

### 3.2 Browser client SDK (`@actrone/voice-client`)
- `createSession({agentId, publicKey})` → calls the embed/webrtc token endpoint → LiveKit connect →
  publishes mic, plays agent audio, exposes `on('state'|'transcript'|'governance'|'ended')`, `mute()`,
  `end()`. Framework-free core; the `<actrone-orb>` is built on top of it.
- Optional `@actrone/orb-react` thin wrapper for React apps.

### 3.3 Honest gating
SDK unit tests hit a mock server (httptest-style / MSW). Live-call methods verify against a real
deployment. Voice webhooks require the outbound/campaign backend (§1).

---

## 4. Agentic-during-call + post-call workflows (THE moat — closes the biggest gap)

### 4.1 The gap
Today's Responder is a single completion with no tools. To deliver "during a call it checks records
in real time and runs workflows after," the agent turn must become a **governed agentic loop**.

### 4.2 Design — reuse the kernel, under the voice gate
The platform already has a governed agentic loop (`runAgenticLoop`), a tool registry, MCP hub, A2A
client, and MACP mesh. The voice turn should **call into that same execution path** so a voice agent
is a first-class agent, not a lesser chat bot:
- Replace `RouterResponder` with a `GovernedAgentResponder` that runs a **bounded** tool-calling loop
  (max N tool hops, hard turn deadline for latency) over the agent's real tool/MCP/A2A/MACP bindings.
- **Every tool call is DPE-gated** (same as non-voice) and **every spoken summary of a tool result is
  `VoiceSession.Speak`-gated** before TTS. Governance diary records both the tool invocations and any
  blocked utterance — the call's audit trail shows *what data the agent touched*.
- **Rolling history**: the turn carries conversation history (fix the current single-turn limitation).

### 4.3 Real-time capability examples (what this unlocks)
- **Record lookup mid-call** (MCP/tool): "let me pull up your order" → governed MCP call to the
  tenant's order system → speaks the (redacted, policy-checked) result.
- **A2A to another org agent**: the support voice agent consults the org's "Billing" agent via A2A
  during the call, governed + audited across the org boundary.
- **MACP mesh**: intra-org agent-to-agent collaboration on the NATS mesh mid-call.
- **Post-call workflow**: on hang-up, the agent triggers a governed Temporal task ("open a refund
  workflow", "schedule follow-up", "update CRM") — the action-items→tasks path already exists; extend
  it to arbitrary governed workflows.

### 4.4 Latency masking
Long tool calls run while the agent emits a short filler ("one moment, checking that for you"),
mirroring OpenAI Realtime's "keep talking while awaiting results." Bounded hop count + per-turn
deadline keep it snappy; tool-call spans show on the trace.

### 4.5 Why this is defensible
It is only possible *because* of the text-intermediate pipeline (§0): the agent's tool use and its
speech are both inspected before they take effect. A speech-to-speech competitor cannot gate either.

### 4.6 Governed agentic-voice memory (cross-session recall — the "remembers you" moat)
**The gap (verified in code):** the voice loop (`RouterResponder`) is stateless — no within-call
history and no cross-call recall. It bypasses the platform's *existing* memory stack entirely
(Qdrant L2 episodic store, the 4-phase `RetrieveContext` pipeline, `buildMessages` history injection,
memory-depth fact extraction) that the text/task agents already use. Call/meeting artifacts are
*stored* but never *recalled* by the agent. So a returning caller starts from zero; an outbound
follow-up doesn't remember the prior call; a recurring meeting doesn't remember past minutes.

**Design — wire voice into the same memory kernel (not new infra):**
- **Within-call rolling history** on the turn (also fixes §4.2) — the agent remembers the last N
  turns of *this* call.
- **Cross-session recall**: the responder calls `RetrieveContext` keyed by a **consented identity**
  resolved via a new `CallerIdentity` seam — inbound phone E.164, meeting-attendee email, or the
  browser Clerk user → a stable `subject` key. Retrieved memory is injected as `[Memory]` context
  exactly as the task loop does. Bounded top-K (recency + similarity) to stay low-latency.
- **Governed write-back on finalize**: run memory-depth extraction over the **already-redacted**
  transcript → durable, MAL-scanned *facts* (never raw PII/transcript) → `Upsert` keyed by
  (agent, subject). The next call recalls the substance, not the sensitive detail.

**Governance (non-negotiable — cross-caller memory is privacy-sensitive):**
- **Per-tenant opt-in, default OFF**, and **consent-gated** — recall/write only for a subject who
  consented; unknown/unconsented identity ⇒ no recall, no write (fail-safe).
- **MAL/PII scan before any memory write** (facts only), residency-pinned to the tenant region.
- **Retention + DSR erasure** via the existing `data_retention_service` + Qdrant
  `DeleteSessionMemories`/`DeleteAgentMemories`, plus a per-subject "forget me".

**Natural payoff:** *"Welcome back — last time we set up your refund; it's approved now."* Outbound
follow-ups and recurring meetings resume with full prior context. **Moat:** governed voice memory —
recall *with* consent, redaction, retention, residency, and an audit trail. No competitor has it.

---

## 5. Multi-channel artifact delivery (kills email-only)

- Extend `ArtifactService.deliver` to fan out over the existing governed `channels`/`notify` system:
  email **+** Slack **+** WhatsApp **+** Teams, brand-aware, per the recipient's channel preference.
- **RBAC + redaction unchanged**: same authorized-recipient resolution, same fail-closed redaction —
  a channel post never carries an unscanned transcript; the summary + deep-link go to the channel,
  the full (redacted) record stays access-controlled in Control Tower.
- Per-tenant/per-agent delivery policy: "post call summaries to #support-calls", "DM the organizer",
  "WhatsApp the customer a follow-up (approval-gated)". Reuses `Broadcaster`/`ApprovalCard`.
- Small, high-value, mostly wiring — good early win.

---

## 6. Natural & flawless conversation (the human-parity bar)

Everything above makes voice *capable*; this section makes it *feel human* — low-latency, natural
turn-taking, never-awkward, and still fully governed. The organising principle: **governance must not
cost naturalness**, and the way we achieve both is **streaming** (§6.1). Target = a call/meeting that
is indistinguishable in flow from human-to-human.

### 6.1 Low latency — the #1 driver of "natural"
- **Target: voice-to-voice p50 < 500 ms, p95 < 800 ms** (industry bar from the research). Above ~1 s
  round-trip, a call feels robotic.
- **Stream every stage** end-to-end: STT partials → LLM token stream → **TTS synthesises as tokens
  arrive** → audio out. Never wait for the full reply before speaking.
- **Streaming governance (the key reconciliation):** gate the reply **incrementally** — DPE-check
  each clause/sentence the moment it completes, *before* that clause is synthesised. Governance then
  adds ~one clause of latency, not a whole-completion wait, and a blocked clause halts synthesis
  mid-reply. This is what lets us keep the pre-speech-gate moat AND hit the latency target.
- **Warm + colocated**: pooled/prewarmed STT+TTS websockets (no per-call cold start); SFU + STT +
  TTS + LLM colocated in-region (residency-aligned) to cut network legs.
- **Latency masking** for tool calls (§4.4): a short filler while a governed lookup runs.

### 6.2 Turn-taking & interruption (conversation flow)
- **Barge-in**: the caller talking over the agent stops the agent *immediately* — flush the TTS
  queue + stop the outbound track (Twilio `Clear` is built; add the LiveKit equivalent). No talking
  over the human.
- **Endpointing / VAD**: decide the caller has finished with combined silence-VAD + semantic
  end-of-utterance detection, so the agent answers on the right beat — not clipping the caller, not
  lagging. Per-locale tunable.
- **Backchannel** (optional, persona-controlled): light "mm-hm"/"right" while listening on longer
  caller turns, so silence doesn't read as "did it hang up?"

### 6.3 Speech quality & persona (sounds human, not synthetic)
- Neural TTS (ElevenLabs/Cartesia — have) with a **consistent persona voice** (have, §T3.6).
- **Prosody/SSML**: pacing, emphasis, natural micro-pauses; and **correct pronunciation** of names,
  numbers, dates, currency, addresses, and spellings (a wrong-read account number breaks the spell).
- **Multilingual + language auto-detect**; per-locale voice + disclosures.

### 6.4 Conversational intelligence (feels like it understands)
- Memory (§4.6) + rolling history + agentic tools (§4) + **org-knowledge grounding (RAG)** so answers
  are correct, contextual, and specific — not generic.
- **Sentiment/emotion awareness** → adapt tone (empathetic on frustration) and **auto-escalate to a
  human** when the caller is stuck or upset.
- Disfluency tolerance (understands self-corrections: "um, I meant the *other* order").

### 6.5 Robustness & flawless recovery (never dead air, never a stack trace)
- **Graceful degradation**: an STT/TTS/LLM/tool failure recovers without silence ("bear with me one
  moment"), retries or falls back, and *never* emits an error/stack trace to the caller.
- **Durable conversation state + resume** (see §6.6): a dropped/again call resumes with full context.
- **Warm human handoff**: on escalation, hand to a human *with* the transcript + context, not cold.

### 6.6 Durability & resume — the reconsidered approach (answers "what's the best way")
This **revises** the earlier "declined durable accumulation" call. That decision conflated two
different things; separating them gives the right answer:
1. **Live media-socket resilience** (keep the raw audio connection alive through a process death) —
   genuinely hard, and it's an **SFU/PSTN-layer** concern (LiveKit/Twilio own reconnection
   primitives). The process dying drops the socket regardless. **Not worth app-layer heroics.**
2. **Conversation *state* durability + resume** (transcript, memory, context survive, and the
   conversation can *continue*) — **app-layer, cheap, and exactly what makes it feel flawless.**
- **Best way = make state durable per-turn + enable resume; do NOT chase socket durability:**
  - **Persist each completed turn incrementally** to a durable session store (Redis stream or a
    Postgres append table) keyed by `session_id`, *as it happens* — not only at Close. A hard crash
    then loses at most the last partial turn; the artifact + memory survive.
  - A **reaper** finalises sessions a dead worker abandoned → *no artifact is ever lost*, closing the
    one hole in the current best-effort-on-Close model.
  - **Reconnect/resume**: a caller redialling (or a browser reconnecting) within a window is matched
    to the same `session_id`/`subject`, rehydrates state + memory, and the agent continues
    naturally — *"sorry, we got cut off — as I was saying about your refund…"*. This is the human
    recovery behaviour, powered by durable state + §4.6 memory.
- **Why this beats the earlier decline:** my earlier reasoning ("a hard crash kills the call anyway,
  nothing to preserve") only valued the dead call's *artifact*; it missed that durable state powers
  *resume*, which is the natural/flawless behaviour. For the human-parity goal, durable per-turn
  state IS worth it — implemented as a lightweight append + reaper + resume, **not** a
  Temporal-workflow-per-turn (overkill for a real-time loop; Temporal stays for campaigns + post-call
  workflows). Net: **decision revised — durable per-turn state + reaper + reconnect-resume is in.**

### 6.7 Efficiency (cost without sacrificing quality)
Cost-aware routing (the existing optimizer/cascade): a cheap model for simple turns, escalate for
complex; semantic cache for common answers; distilled per-agent models. Naturalness first, but not
at needless spend.

### 6.8 Security & governance while natural (the moat holds at speed)
The streaming DPE gate (§6.1) is what makes "low-latency" and "every utterance governed" both true.
Plus consent/disclosures (have), MAL/PII redaction (have), governed memory (§4.6), and the full
audit diary. **Low latency AND governed — not a trade-off.**

---

## 7. Sequencing (recommended)

1. **§5 Multi-channel delivery** — smallest, immediate value, de-risks the channels seam. (~days)
2. **§4 Agentic-during-call + §4.6 memory + §6.1 streaming gate** — the biggest moat *and* the
   naturalness foundation (rolling history, tools, recall, streaming low-latency gate) land together.
3. **§6.2–6.6 naturalness hardening** — barge-in/endpointing, recovery, durable state + resume.
4. **§1 Outbound** — origination → AMD → single call → campaign workflow. High commercial value.
5. **§3.1 Server SDK voice** — wrap §1/§4/§5 once the endpoints are stable.
6. **§3.2 client SDK → §2 `<actrone-orb>`** — client core, then the embed shell + origin allowlist.

Rationale: deliver a visible win first, then the defensible moat *with* the naturalness foundation,
then harden the feel, then the commercial + developer surfaces. §2/§3.2 last (they consume the
stabilized endpoints).

## 8. Key decisions — LOCKED 2026-07-02
- **Sequencing**: **finish the remaining open items in `Actrone_Gap_Closure_Tracker.md` FIRST**, then
  execute this voice plan. (User decision.)
- **Agent turn engine**: ✅ **keep STT→LLM→DPE→TTS pipeline + add governed tools** (it *is* the moat;
  speech-to-speech is rejected — it breaks pre-speech governance). Naturalness comes from **streaming
  the pipeline + incremental (clause-level) gating** (§6.1), not from speech-to-speech.
- **Voice memory**: ✅ governed, **per-tenant opt-in, default-OFF, consent-gated**, MAL-scanned facts
  only, residency-pinned, DSR-erasable (§4.6).
- **Durability**: ✅ **REVISED** — durable **per-turn conversation state** (append store) + a reaper +
  **reconnect/resume**; NOT live-media-socket crash-resilience (SFU/PSTN concern), NOT
  Temporal-per-turn (overkill). (§6.6)
- **Outbound scope**: ✅ **full campaign in the first pass** — origination + AMD + the durable
  `voicecampaign` Temporal workflow (pacing/retry/quiet-hours/DNC-suppression) together, not phased.
- **Outbound carrier**: Twilio-first behind a `voice.Originator` seam (multi-carrier later).
- **Embed credential**: new `public-key` + origin allowlist (API keys in a browser — rejected).

## 9. Cross-cutting standards (every phase)
Flag-OFF by default; consent + spend gates on every dial; DPE gate on every utterance *and* every
tool call; idempotency on every write/dial; structured logs w/ request_id + trace_id; fail-closed
redaction before any egress; unit-tested with fakes, live paths honestly deployment-gated; no commits
(user commits).

---

## Sources (research)
- Twilio AMD best practices — https://www.twilio.com/docs/voice/answering-machine-detection-faq-best-practices
- Twilio SHAKEN/STIR — https://www.twilio.com/docs/voice/trusted-calling-with-shakenstir
- Branded calling guide 2026 — https://aloware.com/blog/branded-calling-guide
- STIR/SHAKEN A-attestation for AI calls 2026 — https://callsphere.ai/blog/vw1d-stir-shaken-attestation-ai-calls-2026
- OpenAI Realtime API (function calling, MCP, latency) — https://openai.com/index/introducing-gpt-realtime/
- OpenAI voice-agents guide — https://developers.openai.com/api/docs/guides/voice-agents
- LiveKit embed (script tag, Shadow DOM, origin allowlist) — https://livekit.com/blog/ship-voice-agent-on-any-website-script-tag
- LiveKit web-embed starter — https://github.com/livekit-examples/agent-starter-embed
- Vapi outbound + SDK ecosystem — https://docs.vapi.ai/calls/outbound-calling
