# Actrone Voice — runtime bring-up checklist

> Status: **the voice plan is code-complete + verified in-repo** (build/vet/tests green).
> What remains is *deployment* bring-up: setting secrets and injecting the two live
> vendors that can only be exercised against real audio/LLM. Every item below is
> wired behind config and OFF by default. Owner: Matt.

> **Status refreshed 2026-07-13 (code-verified): this doc's framing is confirmed accurate and, if
> anything, understates how much has since landed.** Re-verified: `internal/voice/` (telephony,
> STT/TTS provider registries, `translate.go`, `bridge.go`, mulaw, LiveKit token issuance),
> `internal/handler/http/responder.go` (`RouterResponder`), and `backend/voiceagent/{turn,
> conversation,deepgram,tts}.go` all exist as described. Since this doc was written, **outbound
> calling has also shipped** (`internal/voiceoutbound/`, `internal/voicecampaign/` — origination,
> consent-gated dialing, durable Temporal campaigns — not covered here because it's a separate
> capability; see `Actrone_Voice_Outbound_Embed_SDK_Plan.md`'s 2026-07-13 status note) and both
> client SDKs now expose governed outbound-call methods (`client.voice.calls.create` in
> `actrone-ts/src/client.ts`, `place_call`/campaign methods in `actrone-py/src/actrone/client.py`).
> §5's "Teams: not a current channel... a greenfield item" is still accurate — confirmed no Teams
> bot/inbound code exists (see `Actrone_Teams_Approvals.md`). No corrections needed to this doc's own
> content; it remains an accurate, narrowly-scoped bring-up checklist for the inbound/browser/email
> legs it covers.

The governance thesis holds throughout: every agent utterance clears the DPE
governor (`VoiceSession.Speak`) before a word is synthesized, on every channel.

---

## 1. Phone calls (Twilio) — enable

The whole telephony leg is built (`internal/voice/session_token.go`,
`internal/handler/http/{twiml,telephony,twilio}.go`) and mounts when configured.

1. **Secrets / env** on the orchestrator:
   - `VOICE_TWILIO_SESSION_SECRET` — any strong random string (signs the `session`).
   - `VOICE_TWILIO_STREAM_WS_URL` — `wss://<public-host>/v1/voice/twilio/stream`.
   - `VOICE_TWILIO_AUTH_TOKEN` — the Twilio account auth token (validates the
     inbound TwiML webhook signature; leave empty only in dev).
2. **Gateway/ingress:** allow the two PUBLIC paths through ext-authz (Twilio can't
   present a Clerk token) with WebSocket upgrade on the stream path:
   - `POST /v1/voice/twiml` (webhook)
   - `GET  /v1/voice/twilio/stream` (media WebSocket)
3. **Per-tenant BYO vendors** (Settings UI already shipped):
   - **Hearing:** Settings → Meeting bots → *Agent hearing* → paste a Deepgram key
     (`/v1/settings/voice-transcriber`).
   - **Speaking:** Settings → Meeting bots → *Agent voice* → ElevenLabs/Cartesia
     (`/v1/settings/voice-synthesizer`).
4. **Twilio number:** point the number's Voice webhook at
   `https://<host>/v1/voice/twiml?tenant=<tenantID>&agent=<agentID>`.
5. **Result today:** a call connects, is transcribed live, and the governed call
   artifact is finalized (transcript/summary/consent → Control Tower + branded
   email). The agent **replies** once the Responder below is wired.

---

## 2. The LLM Responder (the agent's spoken turn) — ✅ SHIPPED + wired

`internal/handler/http/responder.go` `RouterResponder` is built + wired into the
telephony factory in `main.go`: it loads the agent's system prompt + model
(`AgentFile.Spec.Personality.SystemPrompt` / `.Model.Primary`), streams a
completion via the managed `model.Router`, and returns the reply — which is then
gated by `VoiceSession.Speak` (DPE) before synthesis. Fake-tested (accumulate,
stream/route/prompt errors, empty-system omission). So a configured phone call now
**hears, thinks, and speaks**, governance-native, end to end.

Per-tenant **BYOK/model binding** is now wired: the Responder resolves the tenant's
bound provider via `modelKeysResolver` (falling back to the managed router), so a
call uses the tenant's own keys/model when set. Remaining polish (optional): a
**rolling transcript window** as history (currently single-turn: system + latest
utterance; the full transcript still lands in the artifact), and env-specific
binding (the voice turn defaults to the `production` env).

- **Verify live:** place a call, confirm the reply is spoken, and that a
  policy-violating reply is *blocked* (never synthesized) — the governance test.

---

## 3. Browser voice (LiveKit) — the worker cognitive loop — ✅ BUILT

The governance path is **built + tested** on both sides:
- **Orchestrator:** `POST /v1/voice/turn` (worker-token auth) — `{tenant_id,
  agent_id, text}` → the shared `RouterResponder` produces a reply → cleared through
  the DPE governor (`VoiceSession.Speak`) → `{reply, spoken}` ("" when withheld).
  Governance stays server-side; the worker holds no policy.
- **Worker:** `backend/voiceagent/turn.go` `TurnClient` calls it (httptest-verified).

The `agent_id` flows end-to-end: `webrtcToken({agent_id})` → the dispatch assignment
(`AgentAssignment.AgentID`) → the worker's claim → `/v1/voice/turn`. A listen-only
session runs when omitted. `BrowserVoiceAgent` accepts an optional `agentId` prop.

The worker's **live audio loop is now implemented** (`conversation.go`): inbound room
Opus → **pion/opus** decode (pure-Go) to 48 kHz PCM → **Deepgram** live STT
(`deepgram.go`) → on each finalized utterance `TurnClient.Turn(tenant, agent, text)`
(governed) → **ElevenLabs/Cartesia** TTS to PCM (`tts.go`) → published as an Opus
track. Turns are serialized; a withheld reply (`spoken=false`) is never voiced.

**CGO / libopus (deliberate):** producing outbound Opus uses LiveKit's `PCMLocalTrack`,
whose encoder binds **libopus via cgo** (`media-sdk/opus` → `hraban/opus.v2`); there is
no CGO-free encode path (empirically: `media-sdk/opus` excludes all files under
`CGO_ENABLED=0`). Inbound decode is pure-Go. The one libopus call is isolated behind
`SpeakSink` in `mediatrack_cgo.go` (`//go:build cgo`), with a fail-closed
`mediatrack_nocgo.go` stub — so the whole worker still **builds + unit-tests CGO-free**
(sandbox/dev), and only the shipped image needs libopus. The image is therefore a
**minimal-Alpine runtime with `opus`/`opusfile`** (not distroless/static), non-root;
the pod keeps `readOnlyRootFilesystem` + drops ALL caps. CI compile-verifies the cgo
path (the `go` job installs `libopus-dev`/`libopusfile-dev`; the Docker `test` stage
builds with `CGO_ENABLED=1`).

**Enable (deploy):**

1. Build/ship the worker image (CGO on — the Dockerfile already does this).
2. Set `voiceagent-secrets` env: `DEEPGRAM_API_KEY` (+ optional `DEEPGRAM_MODEL`),
   `TTS_PROVIDER` (`elevenlabs`|`cartesia`), `TTS_API_KEY`, `TTS_VOICE_ID` (+ optional
   `TTS_MODEL`), plus `ORCHESTRATOR_API_URL` + `VOICEAGENT_TOKEN` (pool mode) and the
   `LIVEKIT_*` creds. Missing STT/TTS creds ⇒ the worker joins **listen-only**.
3. Helm chart + LiveKit Cloud + claim dispatch are already wired (see infra); set
   `replicaCount>=1`.
4. **Verify live:** open the agent widget, speak, confirm the governed reply is spoken
   and a policy-violating reply is withheld (the governance test).

---

## 4. BYO email over OAuth (V2.1-D) — enable

Shipped full-stack (Gmail + Microsoft Graph). To use:
- Settings → Channels → *Send via Gmail or Microsoft 365 (OAuth)*: paste the OAuth
  app `client_id` + `client_secret` + a **refresh token** + from-address (Microsoft
  also: scope + tenant token URL). `/v1/settings/oauth-sender`.
- Precedence at send: OAuth → BYO-SMTP → managed Resend.
- **Follow-up (optional):** a browser "Connect" authorize/callback flow (needs a
  registered Google/Microsoft OAuth app = deployment secret) to obtain the refresh
  token in-product instead of pasting it.

---

## 5. Slack / Teams

- **Slack:** the channel send-path already uses a Bearer token, so an OAuth access
  token works today (Settings → Channels). Only a browser **app-install** OAuth flow
  is missing — a convenience, needs a registered Slack app; the send-path itself is
  done.
- **Teams:** not a current channel (Slack/Telegram/WhatsApp). Adding it is a new
  Microsoft Graph channel adapter (mirror `internal/channels/slack.go`), a
  greenfield item outside the current plan scope.

---

## 6. Quick verification once bring-up is done

- Phone: call the number → hear a greeting → speak → agent replies (governed);
  attempt a policy-violating prompt → reply is withheld; artifact appears in
  Control Tower → Meetings & Calls with the consent record + branded email.
- Browser: open the agent widget → the Aura orb reacts to the agent's voice.
- Email: trigger an approval email for an OAuth-connected tenant → it sends from
  their mailbox.
