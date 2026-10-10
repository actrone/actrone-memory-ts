# Actrone — Voice Capabilities V2 for EMAOP Agents (Moat Plan)

> **Status:** Planned · **V2.1 expanded scope 2026-06-29** (persona avatar, meeting artifacts →
> email + Control Tower, per-org branding for ALL channels, BYO providers via OAuth/SSO). Building
> begins with the cross-cutting, locally-verifiable slices (branding + avatar + artifacts data
> model); the real-time media engine + meeting bots are integration/runtime-gated. **Owner:** Matt.
> **Thesis:** Anyone can bolt a TTS API onto an LLM. **Nobody else makes voice agents
> _governance-native_.** Actrone's moat is not the voice — it's that every spoken word, every dial,
> every recording, every cloned voice flows through the same MAL → DPE → Audit-Spine kernel as text,
> with consent/disclosure/recording law enforced *before* the call connects. That is the 2026/2027
> regulatory tailwind turned into a product.

> **Status refreshed 2026-07-13 (code-verified): the top-line "Status: Planned" is MAJOR-STALE — this
> plan is code-complete, not planned.** `docs/Actrone_Voice_Runtime_Bringup.md` (also code-verified
> 2026-07-13) confirms build/vet/tests green with only *deployment* bring-up (secrets, two live
> vendors) remaining. Concretely, against this doc's own sections: **§0.1 Aura orb** — built
> (`frontend/apps/control-tower/src/orb/orb.ts`, compiled to `public/orb/v1.js`, matching the
> `<actrone-orb>` CDN-bundle shape §2 of the companion Outbound plan describes). **§0.2 meeting
> artifacts** — `internal/voice/{artifact,artifact_email,artifact_service,artifact_store}.go` exist.
> **§0.3 per-org branding** — not independently re-verified this pass (unverified 2026-07-13). **§0.4
> BYO OAuth** — built (`internal/email` OAuth senders live; `internal/mcphub/oauth.go` refresh pattern
> reused across email + connectors). **§1 "Where we are today"** — its own **"❌ No real audio"**
> claim (line 174) is now false: real audio is fully wired end-to-end — `internal/voice/{transcriber,
> synthesizer,translate,bridge,mulaw}.go` (STT/TTS provider registries, Deepgram/ElevenLabs/Cartesia),
> `backend/voiceagent/conversation.go` (the worker's live cognitive loop: Opus decode → Deepgram STT
> → governed `RouterResponder` turn → TTS → Opus encode via the isolated cgo `SpeakSink`). Outbound
> calling (§ referenced elsewhere as v3) also shipped: `internal/voiceoutbound/`,
> `internal/voicecampaign/` (Temporal-durable campaigns), `internal/voiceembed/` (the orb's
> origin-allowlisted embed token mint). See `Actrone_Voice_Outbound_Embed_SDK_Plan.md`'s status note
> for that doc's own (also-stale) "proposal" framing. Treat this entire doc as historical design
> rationale; `Actrone_Voice_Runtime_Bringup.md` is the current source of truth for what remains.

---

## 0. V2.1 expanded scope (2026-06-29) — the experience layer + cross-cutting branding

This section folds in the experience, artifact, and branding requirements. It cross-references the
existing stack/governance sections (§2, §5) and **supersedes §8's phasing** with a build order that
front-loads what is buildable and verifiable in-repo today.

### 0.1 "Aura" — the Actrone persona avatar (our own, better than Siri)

A first-party, audio-reactive **WebGL orb** — Actrone's voice persona made visible. Not a clip-art
mascot: a living, brand-tinted presence that reacts to speech in real time and communicates agent
state at a glance. (Research: the 2025–2026 norm is an audio-reactive orb via React Three Fiber/OGL +
GLSL shaders + the Web Audio API — ElevenLabs UI, orb-ui, react-ai-voice-visualizer. We build our own
so it carries Actrone's identity and is governance-aware, not a generic widget.)

- **State-aware visuals** (the core of "more interactive + entertaining"): distinct, legible motion
  for `idle` (slow breathing), `listening` (mic-amplitude ripple), `thinking` (orbiting particles /
  shimmer), `speaking` (TTS-amplitude-driven deformation + glow), `muted`, `blocked-by-governance`
  (the orb flushes brand-red — governance made *visible*, our unfair advantage extended to voice),
  and `escalating` (amber pulse). Driven by an `AvatarState` + a real-time amplitude signal.
- **Audio-reactive**: Web Audio `AnalyserNode` on the mic (listening) and on the TTS playback
  (speaking) feeds the shader's displacement/brightness uniforms. Sub-frame smoothing so it feels
  alive, not jittery.
- **Brand-tinted per org**: the orb's palette derives from the org's brand colours (§0.3) with the
  Actrone warm-grey/iOS-red as the floor — so a customer's voice agent looks like *their* brand in
  *their* meetings, on our engine.
- **Surfaces everywhere it's needed**: the in-meeting overlay (the agent's on-screen presence), the
  Control Tower live-call view, the premium chat composer (voice mode), the marketing hero, and an
  embeddable widget (`<actrone-orb>`) for a customer's own site/app.
- **Accessible + responsive (non-negotiable, CLAUDE.md §8.2):** `prefers-reduced-motion` → a calm,
  non-animated state with a textual status; ARIA live region announcing state changes; visible
  focus; works 375→1920px; **live captions** render alongside the orb so a deaf/HoH user has full
  parity (also a compliance win). A static SVG fallback when WebGL is unavailable.
- **Per-agent personality**: an agent's `VoicePersona` (§4) maps to avatar accents (hue, motion
  energy, particle density) so different agents feel distinct while staying on-brand.
- **Implementation**: a self-contained React component (`components/features/voice/Aura/`) — WebGL via
  a lightweight engine (OGL/R3F), pure-function shaders, an `useAudioAmplitude` hook, and a
  pure `avatarStateMachine` (unit-testable without WebGL). No secrets, no network — it's a renderer
  fed by state + an audio stream, so it is fully verifiable in-repo (the state machine + palette
  derivation as unit tests; the visual is QA'd in `npm run dev`).

### 0.2 Meeting/call artifacts → email + Control Tower (the record of everything)

Everything the voice agent does on a call or in a meeting becomes a **governed, MAL-safe artifact
set**, delivered two ways: **(a) emailed to authorized users** (branded, §0.3) and **(b) surfaced in
the Control Tower**. One source of truth, two renderings.

- **Artifact types** (per call/meeting): `transcript` (diarized, timestamped), `recording` ref
  (governed storage; access-controlled signed URL, never public), `summary` (LLM, governance-audited),
  `action_items` (→ already become governed tasks via `meeting_bot.go`; the email lists them with
  task deep-links), `decisions/diary` (a chronological "what happened" log), `attendees` +
  `consent/disclosure record` (who was notified, when — the §5 compliance evidence), `governance
  events` (every block/redaction/escalation that fired during the call), and `metrics` (duration,
  talk-time, sentiment trend, cost).
- **Governance through the kernel**: transcripts/summaries are MAL-tokenised + DPE/MediaGuard-scanned
  before storage or email — so a transcript never leaks PII to an inbox. The recording is a
  reference, not an attachment; the email links to the access-controlled Control Tower view.
- **Authorized recipients**: an org-configurable recipient policy — meeting organizer + agent owner +
  any users with the `voice:read` / `meetings:read` scoped role (RBAC, §P3) + an explicit per-agent
  distribution list. Never broadcast; least-privilege by default.
- **Email**: built on the existing `internal/email` branded `Render` (extended per-org, §0.3) — a
  "Meeting summary" / "Call completed" `Notice` with the summary, action items (+ task links),
  attendees, a "View full transcript & recording in Control Tower" CTA, and the consent record.
- **Control Tower**: a new **Voice / Meetings** surface — a list of calls/meetings, each opening a
  detail view (live or replay): the Aura orb, the diarized transcript, action items (task status),
  the decisions diary, governance-event timeline, recording player (access-controlled), and the
  consent/disclosure evidence. Live calls stream captions + state in real time.
- **Retention + erasure**: artifacts carry a retention policy (tier/residency-aware) and honour DSR
  erasure (reuse the residency/compliance spine).

### 0.3 Per-org branding for ALL channels (standard templates, brand differs)

Today every outbound email + channel message is **single-Actrone-branded** (`internal/email/brand.go`
hardcodes the palette + the Actrone wordmark; `internal/channels/render.go` is unstyled). The
requirement: **one standard template per channel for everyone — the only per-org differences are
brand colours + logo (+ org name).** This is cross-cutting (it improves every notification, not just
voice), so it is built first and reused everywhere.

- **Brand store (new)**: per-org `org_branding` — `primary_color`, `accent_color` (validated hex),
  `logo` reference, and derived sane defaults. Authoring lives **in the builder**: a brand-colour
  picker (with contrast/accessibility validation so a chosen colour never produces unreadable text —
  we auto-pick on-colour text via luminance) + a live preview of the email/channel templates.
- **Logo resolution chain** (exactly as specified): **(1)** the org logo already uploaded in the
  Control Tower (`publicMetadata.branding` / org `imageUrl`, already in `lib/branding.ts`) → **(2)**
  an optional upload prompt in the brand settings if none exists → **(3)** fall back to the **org name
  as a styled wordmark** (no broken image, ever). The same chain feeds email, every channel, the
  avatar, and the embeddable widget.
- **`email.Render` becomes brand-aware**: `Render(Notice, Brand)` where `Brand{Primary, Accent,
  LogoURL, OrgName, ...}` overrides the Actrone defaults; an absent/empty Brand renders exactly
  today's Actrone email (back-compat). A `BrandResolver` (tenant → Brand, cached) is the single seam.
- **Channels become brand-aware**: `channels/render.go` takes the same `Brand` so Slack blocks,
  Telegram/WhatsApp messages, and email all carry the org's colour accents + logo/name. Platforms
  that can't render rich brand (plain WhatsApp text) degrade to the org name + clean styling (per the
  no-emoji rule — colour/structure, not glyphs).
- **One template set, many brands**: templates are standard + governed; the brand layer is pure
  presentation. This keeps "premium, consistent, on-brand" without per-customer template forks.

### 0.4 BYO providers via OAuth/SSO — current state + gap

**Check result (verified in-repo):** BYO email = a **per-tenant SMTP relay** already exists
(`internal/email/config_store.go`, `email_configs`, vault-sealed password, per-env). Channels
(Slack/Telegram/WhatsApp) already authenticate with per-tenant tokens via the channels store. **Gap:**
**OAuth-based** providers (Gmail / Microsoft 365 send-as via OAuth2, Slack OAuth app-install rather
than a pasted bot token) are not yet wired. Plan: add an `OAuthProvider` seam reusing the **MCP Hub
OAuth + credential vault** already in the platform (the same flow `Connect` uses for tools), so a
user connects their email/Slack/Teams via OAuth in settings; SMTP stays as the fallback. SSO for
recipient auth reuses Clerk. (Build only the OAuth send-path that's missing; do not rebuild SMTP.)

### 0.5 Brainstormed enhancements (added on top — the UX/workflow multipliers)

- **Calendar-connected auto-join**: connect Google/M365 calendar (OAuth, §0.4) → the agent auto-joins
  scheduled meetings as a governed bot, posts the summary afterward. Pre-join **consent card** to the
  organizer (governance-native).
- **Live in-meeting assist**: real-time captions, on-the-fly action-item capture the user can confirm,
  and a "governance shield" indicator (the Aura orb) showing the call is being protected.
- **Speaker diarization + sentiment + multilingual** (Deepgram supports these) → richer transcripts +
  a sentiment trend in the diary; auto-translate summaries to each recipient's locale.
- **Voice-cloning governance** (already §5): consent-gated, watermarked, audited — a moat feature.
- **Post-meeting follow-up drafts**: the agent drafts the follow-up email (branded, §0.3) for human
  approval (escalation queue) before sending — never auto-sends without the configured approval mode.
- **"Barge-in" + turn-taking** in the chained pipeline so conversations feel natural, not walkie-talkie.
- **Per-meeting privacy modes**: `redacted` (PII masked in transcript), `no-recording` (transcript
  only), `ephemeral` (auto-erase after N days) — surfaced as a one-click meeting setting.
- **Embeddable voice widget** (`<actrone-orb>` + a thin client) so customers put a governed voice
  agent on their own site, fully brand-tinted — a distribution/virality lever.
- **Notification fan-out**: the artifact set can also post to the org's chosen channel (Slack summary)
  in addition to email — same Brand, same governance.

### 0.6 Revised build order (supersedes §8)

Front-load the **verifiable, cross-cutting, high-reuse** slices; gate the real-time media + meeting
bots to CI/runtime (they need external services + audio I/O, unverifiable in the build sandbox —
honest, same posture as MediaGuard's GPU tier and the BYOF Temporal harness).

1. **V2.1-A · Per-org branding layer** (build first — benefits *every* channel now): the `org_branding`
   store + `BrandResolver`, brand-aware `email.Render(Notice, Brand)` + `channels` render, the logo
   resolution chain, the builder brand-colour picker + live preview. Fully verifiable (Go + frontend).
2. **V2.1-B · Aura persona avatar**: the React WebGL orb + state machine + audio hooks, brand-tinted,
   accessible. Verifiable (state machine/palette unit tests + dev QA).
3. **V2.1-C · Meeting/call artifact model + delivery**: the artifact domain types + governed storage
   seam + the branded email delivery (reusing A) + the Control Tower Voice/Meetings surface
   (list/detail, replay). Recipient-authorization policy. Verifiable (domain + handler + frontend).
4. **V2.1-D · BYO OAuth providers**: the `OAuthProvider` send-path for Gmail/M365/Slack via the MCP
   Hub OAuth+vault. Verifiable (the client/seam; live OAuth is integration-gated).
5. **V2.1-E · Real-time engine** (§2 stack): `VoiceTransport`/`Transcriber`/`Synthesizer`/`Telephony`
   adapters (LiveKit/Pipecat + Deepgram + Cartesia/ElevenLabs + SIP) + the chained governed pipeline.
   **Runtime/CI-gated** (real audio + external vendors).
6. **V2.1-F · Meeting bots** (`MeetingBot` seam, provider-neutral: Recall.ai / Nylas Notetaker /
   MeetingBaas / self-host) + calendar auto-join. **Runtime-gated.**

---

## 1. Where we are today

A real but skeletal `voice` package exists:
- ✅ **Capability enforcement** — `EnforceCall` / `EnforceMeeting` gate on manifest flags
  `make_voice_calls` / `chair_meetings` ([capability.go](../backend/orchestrator/internal/voice/capability.go)),
  mirroring the browser-tier model. Flags already live in `AgentCapabilities` (agent.go).
- ✅ **Meeting→task domain logic** — `meeting_bot.go` turns spoken action items into governed tasks
  (unit-tested).
- ❌ **No real audio** — WebRTC transport, STT, TTS sit behind interfaces with no provider wired.
  No call is actually placed or transcribed today. (Honest: the spine is real; the voice is not.)

V2 makes the voice real **and** builds the governance moat around it.

## 2. 2026 stack decision (verified)

The orchestration layer has commoditised; **bring-your-own STT/LLM/TTS behind a vendor-neutral
orchestrator** is the winning shape. We mirror it with provider interfaces (same pattern as our model
layer + browser framework):

- **Transport / orchestration:** LiveKit Agents or Pipecat (open, self-hostable — fits our
  zero-egress/self-host posture) behind a `VoiceTransport` interface. Telephony via SIP trunk
  (Twilio/Telnyx) behind a `Telephony` interface.
- **STT:** Deepgram Nova-3 / Flux (sub-300ms) behind `Transcriber`.
- **TTS:** Cartesia Sonic-3 (sub-90ms TTFB) or ElevenLabs Flash v2.5 (~75ms) behind `Synthesizer`.
- **Two pipeline modes** behind one interface:
  - **Chained (STT→LLM→TTS)** — *default for governed calls*: every turn is interceptable, so MAL
    tokenisation, DPE pre-checks, PII redaction, and audit run per utterance. Higher latency
    (~800ms-1.2s) but fully governable.
  - **Speech-to-speech (OpenAI Realtime, ~500ms, ~$0.25–0.35/min)** — low-latency mode for
    interactions the policy engine has pre-cleared; governance shifts to pre/post-call + streaming
    transcript monitoring. Tier-gated and policy-gated (not allowed where per-utterance governance is
    required).
- All providers are **BYOK via the existing model-source pattern** (sealed `CredentialVault`,
  per-tenant×env bindings). Voice keys reuse that infra — no new secrets system.

## 3. Capability taxonomy — pre-built, extensible, and custom

A **voice capability** = a manifest entry binding a **trigger** + a **governed toolset** + a
**VoicePersona**. Three tiers:

### 3.1 Pre-built capabilities (ship these)
- **`make_voice_calls`** (exists as flag) — outbound calls: reminders, confirmations, follow-ups,
  collections, surveys, outbound sales (with consent gating).
- **`chair_meetings`** (exists) — join/host meetings, diarise, extract decisions + action items →
  governed tasks, post a decision log.
- **`answer_inbound_calls`** — AI receptionist / front-desk / L1 support; routes, answers from
  governed knowledge, escalates to human.
- **`ivr_navigate`** — call external phone trees on the user's behalf (book, cancel, dispute) —
  high-governance (acts on the user's accounts).
- **`live_translate`** — real-time bilingual interpreter in calls/meetings.
- **`voicemail_drop`** — leave compliant pre-disclosed voicemails.
- **`voice_approvals`** — outbound callback that authenticates a human approver and captures a
  spoken/keypad approval for a pending escalation (closes the human-in-the-loop over the phone).

### 3.2 Extensible (config, not code)
Each pre-built capability is parameterised: scripts/objectives, allowed tools, knowledge sources,
escalation rules, calling windows, max duration, per-minute + per-call spend ceilings.

### 3.3 Custom capabilities (user-defined)
A no-code **Voice Capability Builder**: pick a trigger (inbound number / scheduled outbound / meeting
join / webhook), attach a governed toolset (existing tool + MCP catalog), choose a persona, set
guardrails. Produces a manifest entry — governed identically to pre-builts. This is the "build your
own voice agent" surface, but inside the kernel.

## 4. VoicePersona — voice/tone/persona configuration

A first-class, reusable spec (per-agent default + per-capability override):

```yaml
voice_persona:
  provider: cartesia            # cartesia | elevenlabs | openai_realtime | azure_tts | ...
  voice_id: "sonic-en-female-2"
  language: en-US               # + accent variants
  tone: professional            # professional | warm | empathetic | assertive | playful | calm
  speaking_rate: 1.0            # 0.5–2.0
  pitch: 0                      # semitone offset
  persona_prompt: "You are Aria, a courteous scheduling assistant for Acme Health."
  disfluencies: light           # off | light | natural (human-like 'um's, for warmth)
  interruption: barge_in        # barge_in (caller can cut in) | hold
  emotion: adaptive             # static | adaptive (sentiment-aware prosody)
  max_call_minutes: 10
  per_minute_ceiling_usd: 0.35
```

A **Persona Library** (org-level, reusable across agents) + a preview ("hear this persona say…")
in the Control Tower. Personas are entitlement-gated (premium voices = higher tiers).

## 5. THE MOAT — governance-native voice (what no competitor has)

Every item below runs on the **existing** MAL/DPE/Audit kernel — that's the unfair advantage.

1. **Consent & disclosure engine (pre-dial, jurisdiction-aware).** Before a call connects, the DPE
   checks: TCPA prior-express-consent on file for the number, calling-window legality (local time +
   DNC list), and the recording-consent regime (two-party-consent states require explicit
   record-consent). The agent auto-speaks an **AI-identity disclosure** at call start ("This is an
   AI assistant calling on behalf of Acme") where law requires it, and a **recording disclosure**
   before substantive conversation in two-party regions. All configurable per region; **fails
   closed** (no consent → no dial, logged as a governed block).
2. **Voice-clone consent vault.** Any cloned/custom voice requires a stored, signed consent artifact
   tied to a named person + use case. The DPE **blocks** any call using an unconsented cloned voice.
   (Directly answers 2026 voice-cloning law.)
3. **Real-time in-call governance.** Live transcript is MAL-tokenised; PII is redacted from
   stored recordings (ties to the **MediaGuard** plan for audio PII); a mid-call agent action (send
   email, make payment) hits the **same DPE Tier-1 hard block** as a text agent — the LLM cannot
   exceed its manifest capabilities even by voice. "Voice DLP": block the agent from *speaking*
   restricted data.
4. **Admissible audit spine.** Every utterance, tool call, disclosure spoken, consent captured,
   recording retention decision, and the reasoning trace are appended to the audit spine — a
   defensible record for TCPA/BIPA/HIPAA disputes. Recording retention honours a per-tenant policy
   (region + TTL).
5. **Spend governance.** Voice is expensive (~$0.25–0.35/min S2S). Per-minute + per-call + monthly
   ceilings enforced by the existing token-budget engine; `on_exhaustion` policy (pause/notify/
   hard_stop) applies to voice minutes too.
6. **Voice-biometric caller verification** (future) — verify a known caller by voiceprint *with BIPA
   consent governance* before acting on their account.

**Positioning:** "The only voice-agent platform where compliance is enforced by the runtime, not
promised in a PDF."

## 6. Architecture

- **Voice gateway/worker** (peer to the browser worker): holds the WebRTC/SIP session, runs the
  chained or S2S pipeline, calls back into the orchestrator for governance decisions per turn.
- **Call/meeting lifecycle = a durable Temporal workflow** (`VoiceSessionWorkflow`): resumable,
  audited, idempotent (workflow id = call id); survives worker restarts; the same governance
  activities (MALTokenise, DPEPreCheck, AuditAppend) the task workflow uses.
- **Interfaces** (provider-neutral, unit-testable like today): `VoiceTransport`, `Telephony`,
  `Transcriber`, `Synthesizer`, `RealtimeSession`. Heavy SDKs sit behind them; governance logic stays
  pure Go.
- **BYOK** voice provider keys via the existing modelkeys vault; per-tenant×env.
- **Reachability/SSRF**: outbound SIP + provider endpoints flow through the same egress controls;
  self-hosted STT/TTS supported for zero-egress tenants.

## 7. Tiering & monetisation

- Voice is a **premium capability** (Business+), metered by the minute on top of plan. Pre-built
  voices on Pro; premium/cloned voices + S2S realtime + meeting intelligence on Business/Enterprise;
  voice-clone vault, biometric verification, and custom regions on Enterprise. Drives `UpgradeModal`.

## 8. Phasing

- **P1 — Governed outbound, real audio.** Chained pipeline (Deepgram + Cartesia + LiveKit/SIP) behind
  interfaces; `make_voice_calls` live; VoicePersona spec + library; **consent/disclosure/recording
  engine + audit** (the moat from day one); spend ceilings; `VoiceSessionWorkflow`.
- **P2 — Inbound + meetings + clone governance.** `answer_inbound_calls`; real meeting-bot wiring
  (diarisation, decision log, action-item→task already modelled); voice-clone consent vault; PII
  redaction in recordings (MediaGuard tie-in); Voice Capability Builder (custom capabilities).
- **P3 — Realtime + intelligence + biometrics.** OpenAI Realtime S2S low-latency path (policy-gated);
  `live_translate`; sentiment-aware routing/escalation; voice-biometric verification (BIPA-governed);
  `ivr_navigate`; `voice_approvals` callback for human-in-the-loop.

## 9. Compliance surface to enforce (the checklist the engine encodes)

TCPA prior consent + calling windows + DNC; two-party recording consent (13 US states); AI-identity
disclosure mandates; voice-cloning consent (written, use-case-scoped); BIPA (voiceprints); HIPAA
(health calls); CCPA/GDPR (recordings = personal data → residency + DSAR). Penalties make this a
buyer's #1 question — answering it in-runtime is the sale.

## 10. Sources (2026 verification)

- [Voice AI Chatbot Platforms in 2026 — GetStream](https://getstream.io/blog/voice-chatbot-platforms/)
- [Best Voice Agent Stack selection framework — Hamming AI](https://hamming.ai/resources/best-voice-agent-stack)
- [Real-Time vs Turn-Based Voice Agents 2026 — Softcery](https://softcery.com/lab/ai-voice-agents-real-time-vs-turn-based-tts-stt-architecture)
- [Best TTS APIs for AI Voice Agents 2026 — Cekura](https://www.cekura.ai/blogs/best-tts-for-ai-voice-agents)
- [OpenAI Realtime API: Production Voice Agents 2026 — Forasoft](https://www.forasoft.com/blog/article/openai-realtime-api-voice-agent-production-guide-2026)
- [AI Voice Agent Compliance Guide — Brainova](https://brainova.ai/blog/ai-voice-agent-compliance-guide/)
- [TCPA-Compliant AI Calling US 2026 — Caller Digital](https://www.caller.digital/blog/tcpa-compliant-ai-calling-us-enterprises-2026)
- [US Voice AI Regulations 2026 (TCPA/BIPA/COPPA/HIPAA) — Softcery](https://softcery.com/lab/us-voice-ai-regulations-founders-guide)
- [AI Voice Cloning Laws & Ethics 2026 — MagicHour](https://magichour.ai/blog/ai-voice-cloning-laws-and-ethics)
