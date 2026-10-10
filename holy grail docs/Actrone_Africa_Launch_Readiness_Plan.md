# Actrone Africa Launch Readiness Plan — Markets, Auth/SMS, Voice, Data-Protection

> **Purpose.** A plan (not built) for launching Actrone into Africa as a first-class wave region: which
> countries, how auth/OTP-SMS must work given our WorkOS + self-host stack, whether Twilio voice suffices,
> and the per-country data-protection/sector-compliance picture. Grounded in July-2026 web research +
> Actrone's existing residency/compliance code.
>
> **Not legal advice.** Statutory points are researched from official sources but must be confirmed with
> per-country counsel before any customer-facing commitment. Items flagged *(verify)* were not fully
> pinned to a primary source. Owner: Matt. Date: 2026-07-20.
>
> **Scope.** Africa opens inside Actrone’s company-wide launch waves (updated 2026-10-09, `Actrone_Launch_Markets.md`): **South Africa in wave 1, Kenya in wave 2, Nigeria and Ghana in wave 3, Egypt later**. This plan first grouped ZA, NG and KE as Africa’s wave 1 and EG and GH as its wave 2.
> Zimbabwe (home context) is an adjacency, not a primary launch market.
>
> **⚑ Rescoped 2026-07-21 (owner decisions).** Two things shrank this plan dramatically:
> 1. **SMS OTP is dropped** — auth is **email + MFA/passkeys** (tech-savvy audience), so the entire
>    phone-verification / SMS-aggregator / sender-ID-registration workstream (old §2) is **removed**.
> 2. **Compliance is staged, not maximalist** — most of the heavy legal/ops work is **buyer-gated or
>    deferred**, and the hardest-regulated buyers are routed to **self-host** (where the burden shifts to
>    the customer). The full "what to do" now lives in the companion
>    **[`Actrone_Hosted_And_SelfHost_Compliance_Plan.md`](./Actrone_Hosted_And_SelfHost_Compliance_Plan.md)**.
>    Voice-carrier build detail lives in **[`Actrone_Voice_Media_Gateway_Plan.md`](./Actrone_Voice_Media_Gateway_Plan.md)**.
>    This doc keeps the **market-selection** decision + the **per-country reference matrix**; the action
>    lists below are trimmed to match.

---

## 0. What's already built vs. what this plan adds

Actrone is **not starting from zero** on Africa compliance. The codebase already ships:

- **A multi-framework residency catalog** (`internal/residency/catalog.go`) that already models **POPIA
  (ZA), NDPA (NG), Kenya DPA, Ghana GPA** — alongside GDPR/UK/Swiss/LGPD/PIPEDA+Quebec/Australia/CCPA/
  HIPAA/EU-AI-Act — each with `Transfer` / `Rights` / `Localization` behaviours + adequacy lists + a
  **DeclineToServe** flag (China PIPL, Russia 152-FZ). It also enforces **honest Region status**: only
  Live regions may be claimed; **`za`, `eu`, `uk`, `ng`, `ca`, `au`, `ap` are all `Roadmap`** — only
  `global` + `us` are Live today.
- **POPIA + FSCA DPE policy packs** (`governance/policies/{popia,fsca}.yaml`), a full **DSR/DSAR surface**
  (`handler/http/privacy.go`: access/erasure/portability/correction/restriction/objection), **per-tenant
  DPA automation**, the **certification track** (SOC 2 / ISO 27001/27701/27018), and **regional data-plane
  routing** (`regionpool`, Tier A/B/C) — the mechanism to physically pin PII to a region.
- **Auth on WorkOS** (managed) + **generic-OIDC self-host** (Clerk fully removed). **Voice on Twilio**
  (Media Streams / μ-law). **Messaging channels** = WhatsApp/Telegram/Slack/Teams (no SMS channel).

**So this plan adds, after the 2026-07-21 rescope, essentially three things — none a rebuild:** (1) a
**market-selection** decision (§1); (2) an **African voice-carrier path** for the countries Twilio serves
poorly (§4 → detail in `Actrone_Voice_Media_Gateway_Plan.md`), *gated on whether African voice is
launch-critical*; (3) a **light, staged compliance posture** (§3, §6 → detail in
`Actrone_Hosted_And_SelfHost_Compliance_Plan.md`) where the heavy registration/local-rep/localization work
is **buyer-gated** and the hardest-regulated buyers are **routed to self-host** (burden shifts to the
customer). *(The old 4th item — a bespoke SMS-OTP service — is **dropped**, §2. The `af-south-1` plane is a
strategic infra choice, not a launch gate — you can launch on `us`/`global` with SCCs.)*

---

## 1. Market selection — which African countries, and why

> **Launch markets for all of Actrone live in `Actrone_Launch_Markets.md`** (created 2026-10-09). This section keeps the reasoning; that document holds the current list, order and per-market gates.

**Weighting for an AI-agent platform** (OSS developer wedge + governed enterprise hosted): developer/tech
base, enterprise + regulated (fintech) adoption, English (for the OSS/docs wedge), data-law tractability,
and whether a physical data plane is feasible.

| Country | genAI adoption (Q1'26) | 2025 tech funding | Dev/fintech base | English | Data law (already modeled) | Physical plane | Verdict |
|---|---|---|---|---|---|---|---|
| **South Africa** | **#1, 23.1%** | $715M (+21%) | Cape Town corridor 450+ firms | ✅ | POPIA (mature) | **af-south-1 (real AWS region)** | **Wave 1 (anchor)** |
| **Nigeria** | 10.1% | $572M | Largest dev + 430+ fintechs | ✅ | NDPA 2023 + GAID | AWS via ZA only | **Wave 3** |
| **Kenya** | 8.7% | **$1.04B (#1)** | Silicon Savannah, M-Pesa; MSFT $1B Azure | ✅ | DPA 2019 | Azure East-Africa (MSFT) | **Wave 2** |
| **Egypt** | 14.8% | $604M | Fintech/e-commerce depth | ✗ Arabic | PDPL (now licensing regime) | No AWS in-country | **Later** |
| **Ghana** | 10.1% | (smaller) | Growing, stable | ✅ | GPA 2012 (reform pending) | No in-country | **Wave 3** |

**Decision:** **Wave 1 = ZA (anchor), NG, KE** — all English (fits the OSS/docs wedge), all fintech-heavy
(governance buyers), all with data laws Actrone already models, ZA giving a real physical region. **Wave 2
= EG, GH** — bigger localization/legal lift (EG Arabic + licensing regime + CBE localization; GH BoG
localization) so they follow once wave 1 proves out. *(Kenya + South Africa + Egypt + Nigeria = 72% of
2025 African tech funding, so the shortlist tracks where the money and developers already are.)*

**Updated 2026-10-09:** the company-wide waves open South Africa first, Kenya in wave 2 and Nigeria and Ghana in wave 3, because Actrone’s agents need local phone numbers and Nigeria needs the local carrier gateway; Egypt follows later. The current list is `Actrone_Launch_Markets.md`.

---

## 2. Auth, OTP & SMS — ⚑ DROPPED (retained below for reference only)

> **Decision (2026-07-21): no SMS OTP.** Auth is **email sign-up/sign-in + MFA/passkeys** (WorkOS TOTP /
> passkeys / email magic-auth), which are the preferred factors and need no carrier in any region. That
> **removes the entire first-party phone-verification service, the SMS aggregator (Africa's Talking-for-
> SMS / Termii / Infobip-SMS), and all per-network sender-ID registration** (NG NCC/DND, KE CA, ZA
> WASPA-SMS) — plus the POPIA s69 / KE s37 SMS-consent duties, which only ever applied to *outreach*, not
> auth. The original design is kept below **only** in case an SMS/phone-verification feature is ever
> revived; it is **not in the launch scope.** (The one place telecom rules can still surface is if the
> *voice/messaging agent features* do outbound to end-users — a product feature, opt-in per deployment,
> not auth.)

### 2.1 The WorkOS reality (verified against workos.com/docs) — reference only
- **WorkOS's built-in SMS MFA is US-only and cannot be intercepted.** The SMS factor requires a valid US
  phone number; the only customization is a cosmetic `sms_template` (`{{code}}` token); there is **no
  bring-your-own-SMS provider, no webhook, and no API that returns the OTP for you to deliver.** WorkOS
  owns SMS delivery end-to-end.
- WorkOS is **US-hosted** (identity PII transfers to the US; no EMEA data plane; only BYOK key control).
- **Conclusion:** you **cannot** route WorkOS's OTP-SMS through an African aggregator. So "wire a bespoke
  SMS-OTP route from WorkOS" means: **keep WorkOS as the identity system-of-record, and build a separate,
  first-party phone-verification capability** for African phone verification.

### 2.2 Recommended auth posture
- **MFA/second factor everywhere = TOTP (authenticator) + passkeys + email magic-auth** — WorkOS's
  first-class, non-SMS factors, which are *preferred* (no SMS-swap risk) and work in every region without
  a carrier. Use these as the default MFA for all regions incl. Africa.
- **Phone verification is an African-first-channel ADD, not a WorkOS factor.** Africa is phone-first
  (mobile-money, WhatsApp), so a "verified phone" step matters for trust/onboarding there — that's what
  the bespoke service is for. It is **not** required in US/EU/Canada, where TOTP/passkey/email suffice.

### 2.3 The first-party phone-verification service — design
A standalone Actrone capability (an internal `phoneverify` service), NOT a WorkOS factor:

- **Flow:** `challenge(tenant, phone_E164)` → generate a 6-digit code (crypto-random) → store **only a
  hash of the code + a hash of the phone + last-4 + TTL + attempt counter** (raw phone/code **never
  persisted** — a data-minimization win for POPIA/NDPA) → send via an African aggregator → return a
  `challenge_id` (never the code). `verify(challenge_id, code)` → constant-time hash compare → mark a
  `verified_phone` claim.
- **Provider seam** (`SMSProvider` interface, one impl per aggregator, country-routed by E.164 prefix) so
  a carrier can be swapped per-country without touching the verify logic — mirroring Actrone's existing
  adapter discipline (channels, voice).
- **Residency-aware store:** the (hashed) verification records live in the **tenant's regional plane**
  (`regionpool` / `PoolForTenant`), so African verification data stays in-region once af-south-1 is live.
- **Abuse controls:** per-phone rate limit + resend cooldown + attempt cap + short TTL; behind the
  existing per-IP/per-tenant `RateLimiter`.
- **Off-by-default:** no aggregator configured ⇒ a dev "log provider" (never logs the code) ⇒ inert until
  a real provider + sender IDs are configured per region.
- **Endpoints:** `POST /v1/auth/phone/challenge`, `POST /v1/auth/phone/verify` (governed, rate-limited,
  no code in logs/responses).

### 2.4 Aggregator choice (research-backed)
| Provider | ZA | NG | KE | EG | GH | Sender-ID reg handled | Note |
|---|:--:|:--:|:--:|:--:|:--:|---|---|
| **Africa's Talking** | ✅ | ✅ | ✅ | ⚠️ | ✅ | **Yes — free**, direct local routing | **Wave-1 primary: one integration = ZA+NG+KE** |
| **Termii** | ✅ | ✅✅ | ✅ | ❔ | ✅ | Yes; **NG "DND route"** for OTP | NG OTP fallback (DND-listed numbers) |
| **Infobip** | ✅ | ✅ | ✅ | ✅ | ✅ | Yes; LoA guidance; 2FA API | Enterprise + **EG (wave-2)** fallback |
| Twilio / Vonage | ✅ | ✅ | ✅ | ✅ | ✅ | Per-country pre-reg | Aggregator-routed to Africa (latency/cost); **do not lead with these for Africa** |

**Recommendation:** **Africa's Talking as the wave-1 primary** (single integration covers ZA+NG+KE on
direct routing, registers sender IDs for free), **Termii** as the NG OTP fallback, **Infobip** as the
enterprise/EG fallback — all behind the one provider seam.

### 2.5 Per-country OTP-SMS compliance (the real lead-time item is sender-ID registration)
- **Nigeria (NCC) — strictest.** Alphanumeric sender IDs must be **pre-registered on every network**
  (MTN strictest, blocks dynamic alpha IDs). OTP is transactional → sendable 24/7, **but must go on a
  transactional/DND-bypass route** or it silently fails to the 30M+ DND-registered numbers (rely on the
  aggregator's DND route; "corporate bind" is bank-only). NDPA governs the PII.
- **Kenya (CA).** Sender ID registered **per network** (Safaricom/Airtel/Telkom), ~**KES 5–10k/network**
  *(verify)*, ~**3–5 business days**, stamped authorization letter. Transactional OTP exempt from time
  windows. DPA s37 direct-marketing consent.
- **South Africa.** Lighter pre-registration; governed by **WASPA Code** (membership usually via the
  aggregator) + **POPIA s69 opt-in** for marketing (OTP is transactional, generally fine).
- **Egypt (EG, wave-2) — plan early.** NTRA sender-ID **whitelisting generally expects a local entity**;
  needs an aggregator with an Egypt presence (Infobip/Clickatell/Orange). Long lead time. *(NTRA consent
  specifics unverified.)*
- **Ghana (GH, wave-2).** NCA sender-ID registration + **time-window rules (~08:00–19:00, not Sundays)** +
  explicit consent + DND; well covered by Arkesel / Termii / Africa's Talking.

---

## 3. Per-country data-protection & sector-compliance matrix

*(Verified against official sources where cited; **confirm with local counsel** — flagged items are the
soft spots.)*

| | **South Africa** | **Nigeria** | **Kenya** | **Egypt** (wave 2) | **Ghana** (wave 2) |
|---|---|---|---|---|---|
| **Law / regulator** | POPIA 2013 / Information Regulator | NDPA 2023 + **GAID 2025** / NDPC | DPA 2019 / ODPC | **PDPL 151/2020 + Exec Regs (Nov 2025)** / PDPC | Act 843 (2012; **Bill 2025 pending**) / DPC |
| **Must Actrone register before processing?** | **IO registration** (portal); no general processing licence | **Yes — DCPMI** (>200 subjects/6mo); annual CAR via licensed **DPCO** at EHL/UHL | **Yes — mandatory** ODPC registration (small-entity exemption fails at scale / regulated sectors) | **Yes — LICENCE/PERMIT** (prior authorization); qualified **registered DPO** | **Yes — DPC registration** (foreign entities explicitly in scope) |
| **Cross-border transfer** | s72: adequacy/binding agreement, or consent/contract-necessity | §§41–43: SCC-type safeguards / adequacy / derogations; no whitelist | Part VI (s48–50): safeguards + consent for sensitive | **Per-transfer PERMIT from PDPC** (no SCC shortcut; PDPC assesses) | Ambiguous in Act 843 (get an opinion) |
| **Hard localization?** | **No general** (sector/state only) | **No general**; **CBN payments data → in-Nigeria from 1 Jan 2027** (fintech) | **No general**; Reg 26 "strategic-interest" data only (health/civil-reg/public-finance) | Soft (permit gate); **CBE fintech data must stay in Egypt** | **No general**; **BoG CISD 2026: sensitive financial data in Ghana** (fintech) |
| **Does af-south-1 satisfy it?** | **✅ Yes** — SA PI stays in-Republic ⇒ no s72 transfer | **No relief** — SA is a third country; still needs §41–43 safeguards | **No relief** for localization; reframes as a transfer question | **No** — SA ≠ Egypt; still needs a permit; CBE needs *in-Egypt* | **No** — SA ≠ Ghana; BoG needs *in-Ghana* |
| **Breach notice** | s22 "as soon as reasonably possible" (**~72h operating target**); FSCA/PA **24h** for fintech | §40 **72h to NDPC** | s43 **72h** to ODPC / **48h** processor→controller | **72h** to PDPC / **3 working days** to subjects | s31 "as soon as practicable" (72h is *Bill* proposal) |
| **DPO / local rep** | IO required + registered; local-rep **legally soft** *(verify)* | DPO required (DCPMI); local-rep **unclear** *(verify)*; DPCO must be NG-licensed | DPO for large-scale; local-rep **proposed, not enacted** *(verify)* | **DPO (exam-certified, registered) + LOCAL REPRESENTATIVE via an Egypt branch — hard requirement** | Supervisor optional today; mandatory DPO + local-rep in the **2025 Bill** |
| **Sector overlay (fintech)** | FSCA/PA **Joint Standard 2 of 2024** (cyber, 24h); SARB Dir 1/2024 | **CBN** payments localization (2027); NCC DND (2442) | **CBK DCP Regs 2022** (consent-to-share); CA SMS | **CBE** (can override PDPL; **in-Egypt hosting + CBE outsourcing registration** for regulated buyers) | **BoG CISD 2026** (localization; CSA-accredited SIEM w/ GH majority) |
| **AI policy** | Draft National AI Policy (Apr 2026, consult) — not law; POPIA ADM applies | NAIS (draft) — not law; AI authority via pending Digital-Economy Bill | National AI Strategy 2025–30 + draft Code — not law; DPA s35 ADM | National AI Strategy 2025–30 ("Sovereign AI") — policy | National AI Strategy 2023–33 + **RAI Authority** forthcoming |

### Ranked "hardest compliance lift" (wave 1 → wave 2)
1. **Egypt (wave 2) — hardest.** Prior-authorization licensing + exam-certified DPO + **mandatory in-Egypt
   local representative/branch** + per-transfer permits + **CBE in-Egypt localization** for fintech. Serve
   Egyptian fintechs realistically only via **self-host inside Egypt**.
2. **Nigeria — DCPMI registration + licensed DPCO for the annual audit + CBN payments localization (Jan
   2027)** for fintech buyers. af-south-1 gives no legal relief; needs a payment-data carve-out or an
   in-NG option for regulated buyers.
3. **Kenya — mandatory ODPC registration** (extraterritorial; small-entity exemption fails at scale) +
   72h/48h breach + CBK DCP rules; localization only for narrow strategic-interest data.
4. **Ghana (wave 2) — DPC registration + BoG CISD 2026 financial-data localization** for fintech.
5. **South Africa — lightest for us:** IO registration + s72 (which **af-south-1 removes** for resident
   data) + FSCA 24h for fintech. **The anchor precisely because af-south-1 makes it clean.**

### The load-bearing cross-cutting facts
- **`af-south-1` cleanly satisfies only South Africa.** For NG/KE/GH/EG it does **not** cure localization
  or the transfer/permit gates — it's still a foreign country to them. So af-south-1 is the ZA anchor +
  an African-latency/optics win, **not** a pan-African residency solution.
- **The genuinely Africa-specific burdens** (vs US/EU/Canada) are: **mandatory controller/processor
  registration before processing** (KE/NG/GH/EG), **local-representative/in-country presence** (EG hard;
  others softer/proposed), and **sector data-localization** (NG CBN payments, GH BoG, EG CBE, KE
  strategic-interest). US/EU/Canada impose none of the first and only a narrow version of the others.
- **Fintech is the hardest buyer everywhere** — CBN/BoG/CBE localization can push a regulated buyer to
  **self-host in-country**, which is exactly Actrone's self-host offering. Lead African fintech sales with
  self-host.

---

## 4. Voice — Twilio vs an African carrier

*(From Twilio's official country pages, July 2026. Voice only; quality must be pilot-tested — no official
quality data exists.)*

| Country | Twilio outbound | Twilio local number | Requirement | Verdict |
|---|---|---|---|---|
| **South Africa** | ✅ | ✅ local/mobile/toll-free | in-locality address (no PO Box) + business reg | **Twilio sufficient** |
| **Kenya** | ✅ | ✅ local | in-locality address + commercial register | **Twilio workable** (test answer-rate; AT fallback) |
| **Nigeria** | ✅ | ⚠️ **mobile-only, business-only, LOA** | Cert. of Incorporation + NG address + LOA | **Needs a local carrier for a real NG CLI** |
| **Egypt** (w2) | ✅ termination | ❌ **toll-free only** | LOA | **Insufficient for local presence** → local carrier |
| **Ghana** (w2) | ✅ termination | ⚠️ **mobile-only, business-only, LOA** | business reg + GH address + LOA | **Needs a local carrier** |

**Also:** emergency calling **not supported** in ZA/KE (guard/block it in the governed loop); outbound CLI
must be a number Actrone actually owns/verified in-country (no spoofing).

**→ Full build plan: [`Actrone_Voice_Media_Gateway_Plan.md`](./Actrone_Voice_Media_Gateway_Plan.md)** — a
Jambonz/FreeSWITCH **media gateway that "looks like Twilio"** (terminates the carrier SIP trunk, forks μ-law
8 kHz audio to Actrone's existing `CallerAudio` bridge, so the governed loop is unchanged). Gate the whole
build on whether **African local voice presence is launch-critical** — Twilio already *terminates* outbound.

**Recommendation — a `VoiceCarrier` seam (the `CallerAudio` + `Originator` interfaces already exist):**
- **Twilio-primary for ZA + KE** (keep the existing Media-Streams/μ-law path); assemble the regulatory
  bundles now (weeks of lead time).
- **Nigeria: a local carrier** for a credible +234 CLI + local termination — **Africa's Talking voice**
  (+234 virtual numbers) or an NG **SIP trunk** (DIDWW/PBX.IM). Prefer **SIP-trunk-capable** providers
  (Infobip/DIDWW) so the raw SIP/μ-law path is preserved; use AT's REST voice API only if bridging at
  call-control is acceptable.
- **Wave 2 (EG/GH): local carriers** via the same seam.
- **Pilot-test CLI delivery + answer rate per country** (Twilio Voice Insights) before launch — the
  quality question is empirical, not documented.

---

## 5. Do we need all this for US, EU & Canada?

**Short answer: mostly no — because Actrone already models those regimes, and none of them impose the
Africa-specific burdens (registration-before-processing, local-rep, SMS sender-ID registration, or a voice
carrier gap).** Detail:

| Dimension | US | EU/EEA | Canada | vs. Africa |
|---|---|---|---|---|
| **Data-law modeling** | ✅ CCPA/US-state, HIPAA — **already in the residency catalog** | ✅ GDPR + EU-AI-Act — already modeled | ✅ PIPEDA + Quebec Law 25 — already modeled | Africa's POPIA/NDPA/Kenya/Ghana are **also already modeled** — no new category work |
| **Register before processing?** | **No** general registration | **No** (GDPR dropped it) | **No** general registration | **YES** in KE/NG/GH/EG — the biggest Africa-specific lift |
| **Local representative?** | No | **Yes — GDPR Art. 27 EU rep** if no EU establishment (a real, do-this item) | No | EG hard; NG/KE/GH softer/proposed |
| **Data localization** | No (sector: HIPAA safeguards, not residency) | No general (data must stay adequate; Schrems/SCCs) | No general (Quebec has transfer-assessment duties) | **Sector localization** (NG CBN, GH BoG, EG CBE) is stronger in Africa |
| **Physical plane** | **`us` LIVE** | `eu` **Roadmap** (prod-eu in progress) | `ca` **Roadmap** | `za` **Roadmap** |
| **Cross-border transfer** | n/a (home) | **SCCs + DPF** for US sub-processors (already the pattern we're removing SaaS exports for) | Contractual safeguards; Quebec transfer impact assessment | Africa needs SCC-type safeguards to US/ZA too |
| **SMS-OTP bespoke route?** | **No** — WorkOS SMS works (US); or TOTP/passkey/email | **No** — WorkOS SMS is US-only, but EU/CA lean on **TOTP/passkey/email** (preferred; no SMS need) | **No** — same | **YES** — phone-first + sender-ID registration ⇒ the bespoke aggregator route |
| **Voice carrier** | ✅ Twilio core market | ✅ Twilio core market | ✅ Twilio core market | NG/EG/GH need local carriers |
| **Enterprise compliance certs** | SOC 2 / ISO — **already have the certification track** | + **GDPR/DPA** — already have DPA automation | same | same certs satisfy all |

**So for US/EU/Canada the "work" is NOT re-doing the data-law layer** (it's already modeled + we have SOC
2/ISO/GDPR/DPA automation). It is the smaller set of: **(a) stand up the physical planes** (US live;
**EU/CA roadmap** — the same `apply prod-<region>` work as ZA), **(b) execute SCC/DPF transfer paperwork**
for US sub-processors, **(c) appoint an EU Art-27 representative** (the one genuine EU-specific add), and
**(d) the usual SOC 2/ISO/GDPR evidence** we're already producing. **No bespoke SMS route and no voice
carrier work** for US/EU/Canada.

**Net:** **Africa is the heaviest operational lift of all our wave regions** — it's the one region that
adds mandatory registration, local representation, sector localization, a bespoke SMS-OTP route, and a
voice-carrier seam. US/EU/Canada mostly reuse what's built + stand up planes + paper transfers.

---

## 6. Action checklist & sequencing

**→ The full staged "what to do" (hosted vs self-host) lives in
[`Actrone_Hosted_And_SelfHost_Compliance_Plan.md`](./Actrone_Hosted_And_SelfHost_Compliance_Plan.md).**
This section is the Africa-specific summary only.

**Cross-region foundation (do once):**
- [ ] Ship the **table-stakes docs** (privacy policy, ToS, signable DPA, sub-processor list, vendor SCCs) +
      a **one-session counsel posture** (controller/processor + lawful basis) + a breach runbook. *(Light;
      the machinery — DPA automation, DSR, residency catalog — is already built.)*
- [ ] **VoiceCarrier / media-gateway** (`Actrone_Voice_Media_Gateway_Plan.md`) — **only if African voice is
      launch-critical.** Off-by-default.
- [ ] **Strategic, not a gate:** stand up **af-south-1** when SA enterprise demand justifies it (flip `za`
      Roadmap→Live; same `regionpool` work as prod-eu). Launch is fine on `us`/`global` + SCCs first.
- [ ] ~~SMS provider seam / phone-verification~~ — **dropped** (email + MFA/passkeys).

**Per country (South Africa in wave 1, Kenya in wave 2, Nigeria in wave 3), buyer-gated, do NOT front-load:**
- [ ] **Register** (KE ODPC mandatory; NG NDPC/DCPMI + DPCO; ZA Information Officer) **when a local entity,
      a material customer, or procurement triggers it** — not at launch. Early operation is a *managed
      risk* (common for foreign SaaS); never *claim* registration you don't hold *(counsel)*.
- [ ] **DPA + SCC-type transfer terms** for US (and ZA if used) — mostly your sub-processors' standard
      SCCs; wire breach SLAs (72h NDPC/ODPC; 48h processor→controller; **24h FSCA** for a ZA fintech).
- [ ] **Regulated fintech → route to self-host**, don't build for it: NG CBN payments localization
      (1 Jan 2027), KE strategic-interest, ZA FSCA controls are the customer's-infra problem on self-host.
- [ ] Voice (**only if launch-critical**): Twilio bundles for ZA/KE; a **local NG carrier** via the media
      gateway; **pilot-test** CLI/answer-rate.
- [ ] Confirm **local-representative** posture with counsel (ZA/NG/KE soft/uncertain).

**Ghana (wave 3) and Egypt (later): plan now, execute later:**
- [ ] **EG:** processor **licence** + registered exam-certified DPO + **in-Egypt local representative/
      branch** + per-transfer permits; **self-host-in-Egypt** for CBE-regulated fintech. Start sender-ID
      whitelisting early (local-entity requirement).
- [ ] **GH:** DPC registration; **BoG CISD 2026** in-Ghana localization for fintech (self-host); NCA
      sender-ID + time-window rules.

---

## 7. Honest caveats

- **Not legal advice.** Every registration/local-rep/transfer point needs per-country counsel sign-off
  before a customer commitment; *(verify)* items (exact fees, local-rep mandates, s50/GAID article text,
  Egypt NTRA/enforcement dates) were not pinned to primary sources.
- **af-south-1 is not a pan-African cure** — clean only for ZA; NG/KE/GH/EG still need transfer safeguards
  and, for fintech, in-country hosting.
- **Voice quality into African networks is an empirical unknown** — pilot before launch.
- **WorkOS keeps identity PII in the US** — for a strict POPIA/NDPA posture the self-host + generic-OIDC
  path keeps identities in-region; the managed path relies on SCC/DPF papering.
- **Fintech buyers may be un-servable on shared hosting** in NG/GH/EG — self-host is the answer, and it's
  already ours.

### Sources (research 2026-07)
WorkOS docs (MFA US-only, no BYO-SMS): workos.com/docs/mfa · workos.com/blog/data-residency-for-enterprise-saas.
Aggregators: africastalking.com, developers.termii.com, infobip.com/docs. AI/adoption: Microsoft/Ecofin 2026,
Partech 2025 Africa VC, TechCabal. **ZA** POPIA (popia.co.za; inforegulator.org.za; FSCA Joint Standard 2/2024).
**NG** NDPA 2023 + GAID 2025 (ndpc.gov.ng); CBN payments-localization circular (2027). **KE** DPA 2019 (odpc.go.ke;
kenyalaw.org); CBK DCP Regs 2022. **EG** PDPL 151/2020 + Exec Regs Nov-2025 (pdpc.gov.eg; Baker McKenzie/CMS/Chambers).
**GH** Act 843 (dataprotection.org.gh); BoG CISD 2026. Twilio country guideline pages (twilio.com/en-us/guidelines).

---

Last updated: 2026-07-20 | Owner: Matt | Companion to `Actrone_Data_Residency_Plan.md`,
`Actrone_Marketing_Strategy_OSS.md`, and the `internal/residency` catalog.
