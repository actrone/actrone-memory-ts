# Actrone Voice — SIP Media-Gateway Plan (a gateway that "looks like Twilio")

> **Goal.** Give Actrone a **local African voice presence (a real +234 CLI + inbound in Nigeria, and
> later EG/GH)** without rewriting the governed voice loop — by terminating an African carrier's **SIP
> trunk** at a **media gateway** that presents each call to Actrone in the **same shape Twilio Media
> Streams already does** (μ-law 8 kHz over a WebSocket). The cognitive loop, governance, and realtime
> model bridge stay **unchanged**.
>
> **Why this is small in Actrone and only "medium" in infra:** the code seams already exist (see §1); the
> real work is standing up + operating one new stateful media component and onboarding a carrier. **Plan,
> not built.** Owner: Matt. Date: 2026-07-21. Gate: only build if **agent voice *in Nigeria* is
> launch-critical** — Twilio can already *terminate* outbound to NG; this is for a genuine **local CLI +
> inbound**.

---

## 1. The seams already exist (verified in `internal/voice`)

- **Caller media is already an interface.** `bridge.go` defines `CallerAudio { Inbound() <-chan []byte; … }`
  — μ-law 8 kHz frames. `TwilioCallerAudio` (`bridge_provider.go`) is just *one* implementation adapting
  `TwilioStream` (Media Streams) onto it. **A gateway = a second `CallerAudio` implementation.** The
  `RealtimeBridge` (`bridge.go`) and the realtime model leg (`ProviderConn`) never change.
- **Outbound is already carrier-agnostic.** `voiceoutbound.Originator { Originate(ctx, OriginateParams) }`
  is explicitly "Twilio-first; Telnyx/Vonage can slot in later." **A gateway = a second `Originator`.**
- **The only Twilio-specific surface left is inbound** (`handler/http/{twilio,twiml,twiml_amd}.go`) — the
  webhook/TwiML that answers a call and opens the media stream. That's the one new inbound path to add.

**So "looks like Twilio" is literal:** the gateway forks call audio to Actrone as μ-law 8 kHz frames over
a WebSocket; a thin `GatewayCallerAudio` feeds them into the existing `CallerAudio.Inbound()` channel.
Nothing downstream knows the carrier changed.

---

## 2. Architecture

```
 +234 caller  ⇄  NG carrier SIP trunk (DIDWW / Infobip / AstraQom)      [SIP signalling + RTP μ-law 8 kHz]
              ⇄  MEDIA GATEWAY  (Jambonz  |  FreeSWITCH)                 [terminates SIP+RTP; forks audio]
              ⇄  WebSocket audio (μ-law 8 kHz frames)                     [Jambonz `listen` / FS mod_audio_fork]
              ⇄  Actrone  GatewayCallerAudio  (new CallerAudio impl)      [maps WS frames → Inbound() chan]
              ⇄  RealtimeBridge  (UNCHANGED)  ⇄  realtime model provider  [governed cognitive loop, tools, spend]
```

**Codec is free:** the caller leg is μ-law 8 kHz on both sides (PSTN ↔ gateway ↔ Actrone) — **no
transcoding** on the caller side. The model leg (`gorillaProviderConn`) already transcodes as needed
(`voice/mulaw.go`). Outbound mirrors the same path in reverse via a `SIPOriginator`.

### Gateway choice
- **Jambonz (recommended)** — "open-source Twilio": speaks **SIP trunks** to any carrier, exposes a
  **webhook/call-control app model + an audio-streaming verb (`listen`)** that forks call audio to a
  WebSocket. It is the closest thing to *drop-in Twilio semantics*, so Actrone's adapter is thin. Run it
  **self-hosted** (a pod in an African region for low RTP latency) or start on **jambonz.cloud** (managed)
  to de-risk the PoC.
- **FreeSWITCH / Asterisk (alternative)** — lower-level: `mod_sofia` (SIP) + `mod_audio_fork` (WS audio).
  More control, more to operate; choose only if you outgrow Jambonz.
- **(Rejected) embed a Go SIP+RTP stack** (`sipgo`+`pion`) directly in the orchestrator — no extra infra,
  but you own SIP signalling, RTP jitter buffering, DTMF, and fraud handling in-process. Only if you want
  zero new infra and accept the code burden.

---

## 3. Build scope (phased; each phase ships dormant/behind config)

### P0 — Code seams (small; in `internal/voice` + `voiceoutbound`, off-by-default)
- **`VoiceCarrier` routing:** select the carrier by **E.164 prefix** (`+234` → gateway carrier, else
  Twilio). A tiny router in front of the existing `Originator` + inbound handler.
- **`GatewayCallerAudio`** — a new `CallerAudio` implementation: a WebSocket server/handler that receives
  the gateway's forked μ-law 8 kHz frames and pushes them onto `Inbound()`, and writes model audio back
  (the same duplex `TwilioCallerAudio` does). Mirror `TwilioCallerAudio` almost line-for-line.
- **`GatewayOriginator`** — a new `Originator` implementation that places outbound via the gateway's
  call-control API (Jambonz REST) or a SIP INVITE, with `From` = an **owned +234** number.
- **Config + secrets:** carrier selection map, gateway base URL + auth, per-country CLI numbers, SIP trunk
  creds. Empty ⇒ Twilio-only (byte-identical to today).

### P1 — Stand up the gateway + carrier (infra + ops)
- Deploy **Jambonz** (helm subchart in the cluster, ideally an **African region** near the carrier) — SBC,
  SIP signalling, RTP, TLS/SRTP; or point at jambonz.cloud for the PoC.
- **Carrier onboarding (the real lead time):** contract a NG SIP trunk (**DIDWW / Infobip / AstraQom**),
  complete the **NG business-registration + LOA** bundle, and **provision +234 DID(s)** via the carrier
  API/panel. (Same regulatory bundle Twilio would need — unavoidable for a local number.)
- Wire the SIP trunk (host, IP/registration auth) into the gateway.

### P2 — Inbound + outbound wired
- **Inbound:** DID → tenant/agent mapping; the gateway's inbound webhook hits an Actrone endpoint that
  opens the `GatewayCallerAudio` stream and starts the `RealtimeBridge` — the gateway equivalent of the
  Twilio `twiml` answer path.
- **Outbound:** `voiceoutbound` routes `+234` through `GatewayOriginator`; CLI = owned +234; lifecycle
  callbacks mapped to the existing status handling.

### P3 — Governance, spend, media hardening (reuse existing hooks)
- **Reuse the existing governance:** the governance gate runs *before* the `Originator` (already
  carrier-agnostic), so consent (`voiceconsent`), spend cap (`voicespend`), and audit apply unchanged.
- **Guards:** block emergency numbers (as with Twilio ZA/KE), **enforce owned-CLI** (never spoof), persist
  the **carrier LOA/registration artifacts in the provenance ledger**, DTMF (RFC 2833) + AMD parity.
- **Spend metering** for the new carrier's per-minute rates.

### P4 — Pilot + GA
- **Live NG pilot:** measure **CLI delivery, answer rate, one-way/round-trip latency, MOS** on real calls
  (the quality question is empirical — no vendor publishes it). Compare vs Twilio termination.
- **Failover:** if the gateway/carrier is down, fall back to **Twilio termination** for outbound (degraded
  CLI but connected). HA the gateway (it's stateful RTP).
- GA behind config once the pilot passes.

---

## 4. Ops & latency (the honest hard parts)

- **New stateful media component.** The gateway carries live RTP — it needs **HA + horizontal scaling**,
  **TLS/SRTP**, **toll-fraud protection** (rate limits, allow-listed destinations), and monitoring
  (Jambonz exposes metrics/Grafana). This is a real service to run and patch, not a library.
- **Latency budget:** `caller ↔ carrier ↔ gateway (RTP)` + `gateway ↔ Actrone bridge (WS)` +
  `bridge ↔ model`. Put the **gateway in an African region** to keep the RTP leg short; consider running
  the **RealtimeBridge regionally** too so the WS leg isn't trans-continental. Budget and test end-to-end
  mouth-to-ear latency before GA.
- **Carrier lead time:** the NG business-reg + LOA + DID provisioning is **weeks**, not days — start P1
  early even while P0 code lands.

---

## 5. Why this pays off beyond Nigeria

- The **same gateway + `VoiceCarrier` seam serves EG/GH (wave 2) and any SIP carrier** — one integration,
  many countries.
- It becomes a general **"bring-your-own-carrier / BYO-SIP" capability** — valuable to **enterprise +
  self-host buyers** who must use their *own* telco/trunk (and, for self-host, keeps voice media entirely
  in the customer's network — see the hosted/self-host plan). So this isn't NG-only plumbing; it's the
  carrier-abstraction layer the voice product needs anyway.

---

## 6. Honest caveats
- **New protocol surface + new infra** — the gateway is the cost, not the Actrone code (which is a thin
  `CallerAudio`/`Originator` pair thanks to the existing seams).
- **Quality is empirical** — pilot before GA; don't promise NG voice quality on vendor marketing.
- **Carrier onboarding gates go-live** — NG business reg + LOA are unavoidable for a local number.
- **Gate the whole effort** on whether NG (or African) *local voice presence* is launch-critical. If voice
  isn't a wave-1 African feature, defer this entirely — Twilio termination covers occasional outbound.

---

Last updated: 2026-07-21 | Owner: Matt | Companion to `Actrone_Africa_Launch_Readiness_Plan.md` and
`Actrone_Hosted_And_SelfHost_Compliance_Plan.md`.
