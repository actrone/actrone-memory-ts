# Actrone — Phased Launch, Feature-Pack & GTM Plan

> **Status:** STRATEGY. The definitive release/GTM sequence for taking Actrone to market: **open-source
> first for adoption**, then a **hosted-platform feature pack ~4 months later**, then enterprise + ecosystem.
> Every feature pack is tagged with the **build mode(s)** it turns on — **[Connected]** (BYOF-connected),
> **[Hosted]** (BYOF-hosted), **[Native]**, **[All]**, or **[Lib]** (OSS library, no build mode).
>
> **Wave 1 markets:** the United States, Canada, the United Kingdom, Ireland, the Netherlands and South Africa. Every wave is in `Actrone_Launch_Markets.md`, the single list for all of Actrone.
>
> Owner: Matt · Companion docs: `Actrone_Positioning_And_Competitive_Moats.md`,
> `Actrone_Governed_Action_Layer_Strategy.md`, `Actrone_Product_Review_And_Moats.md`,
> `Actrone_Memory_Depth_Competitive_Plan.md`, `Actrone_Self_Hosting_Plan.md`.

---

## 0. TL;DR — the one-paragraph thesis

The platform is **~99% code-complete**; the binding constraint is **distribution, not engineering**. So this is a
**release-and-GTM sequencing plan, not a build plan** — what to *expose, market, and monetize when*. We win by
running an **open-core adoption ladder**: **Phase 1 gives away *only* the free, no-lock-in memory layer every agent
framework is missing** (pure OSS, zero platform dependency, no monetization, no hosted surface) to win developer
mindshare — competing on **DX, framework-agnosticism, local-first, and governance-adjacency (not "smarter memory")**; then at
**Month 4 the *entire* hosted platform lands together** — the client SDKs + their free connected tier, hosted
execution, and the native builder — which pulls teams up the commitment ladder; then **enterprises** land on
residency + compliance + self-host. **The client SDKs are hosted-platform clients, not part of the OSS launch** —
they ship with the platform at Month 4. Ship **memory-only OSS in Phase 1 (Month 0–4)** for pure awareness; ship
the **hosted platform feature pack (SDKs + connected tier + hosted + native) in Phase 2 (Month 4)**; layer
**enterprise/residency (Phase 3)** and **ecosystem/moat (Phase 4)** after.

> **Updated 2026-10-09:** the hosted launch is planned for about Q1 2027 and carries pack 1 (section 0.1), which now includes everything except the marketplace: voice agents, all of Actronauts, computer use, cross-company actions, the optimizers, data residency and self-hosting. The marketplace follows in pack 2. Launch markets are in `Actrone_Launch_Markets.md`.

---

## 0.1 Feature packs (owner decision, 2026-10-09)

This table is the authoritative list of what each pack carries. The phase sections below give the detail and the gates.

| Pack | When | Contents | Markets |
| --- | --- | --- | --- |
| **Open source** | Live since September 2026 | Memory libraries (TypeScript, Python), framework adapters, the memory CLI, `create-actrone-app` | Everywhere |
| **Pack 1** | The hosted launch, about Q1 2027 | Connected, hosted and native build modes; the Studio no-code builder with governed tools; **voice agents**; **Actronauts**, the whole Actronauts plan except its marketplaces: the **native iPhone and Android apps**, the **desktop app and browser extension**, **governed computer use**, **Actronaut payments**, **households, Guardian mode and the crew network**; governed writes (simulate, approve, signed receipts, undo); **cross-company actions** (the action fabric) and A2A; Control Tower with environments and promotion; the model gateway with BYOK and the **cost and model optimizers**; **MediaGuard image and screen redaction**; **assurance and attested autonomy**; premium memory for Pro; Teams, single sign-on and SCIM; the trust center; **data residency** (EU, Cape Town and Canada planes); **self-hosting** for enterprise; billing, including the Actronauts plans | Every wave 1 market |
| **Pack 2** | About 2 to 3 months after launch | The marketplace (agents, connectors, signed skills and Actronaut characters, with revenue share), plus anything from pack 1 that missed its gate | Every open market |

**Rollout rules:** a pack ships only when it passes its quality gates; it reaches every open market at the same time; a new market opens on the current pack, never an older one; and a pack release and a market opening are kept two to four weeks apart so a problem can be traced to one change. Anything that misses its gate moves to the next pack rather than delaying the launch.

**Why pack 1 carries almost everything (owner decision, 2026-10-09, revised the same day):** every feature is built before launch as one plan, so it launches together. Only the marketplace waits, because it needs agents and skills from customers before it has anything to sell. Three limits still apply inside pack 1:

- **Timing:** the Actronauts plan estimates its phases at about 69 to 85 weeks for one team, and about 37 to 45 weeks along its longest chain (phase 0, the desktop app, computer use, then enterprise machine management) if the other phases run in parallel. The end of Q1 2027 is about 25 weeks from this decision, so holding the date means building the phases in parallel and letting the slip rule apply to whatever is not through its gates
- **Outside approvals the build cannot speed up:** Cloudflare’s verified agent listing (the extension and the cloud browser), browser store review for the extension, desktop code signing, Stripe’s agent card issuing preview and the EU passkey payment partner (decision D14)
- **Country and age switches:** payments switch on only in markets where decision D14’s partners are confirmed, and households launch with adult members only, because launch is 18+ (decision D16); child accounts need their own decision

---

## 1. The strategic spine — the 4-rung adoption ladder

Actrone's three build modes are not parallel products; they are **rungs of increasing commitment and value**.
GTM is the act of walking a user up them. Sequencing the *modes* is the sequencing of the *funnel*.

| Rung | Build mode | What the user does | Friction | Lock-in | Funnel stage |
|---|---|---|---|---|---|
| 1 | **[Lib]** OSS memory | `npm/pip install`, a library in their code | ~0 | none | **Awareness** |
| 2 | **[Connected]** | Keep their framework; SDK calls the hosted governed gateway/memory/tools | low | low | **Activation** |
| 3 | **[Hosted]** | Deploy their framework agent to Actrone for durable governed execution | medium | medium | **Expansion** |
| 4 | **[Native]** | Build on Actrone's governed loop + no-code EMAOP + Control Tower + marketplace | higher | high | **Enterprise / standardize** |

**Timing (decided):** only **rung 1 (OSS memory)** ships in the Phase-1 OSS window. **Rungs 2–4 — connected,
hosted, native — all debut *together* at the hosted launch (pack 1, about Q1 2027).** The connected SDK is the platform's
low-friction *entry tier*, **not** a separate earlier launch (and not OSS — it only exists to call the hosted
platform). This keeps the Phase-1 message pure: *free, open, yours — no account, no platform, no strings.*

**Why this order (non-negotiable):**
- **Memory-only OSS first, then the whole platform.** Phase 1 is a pure adoption play on the library we're best
  at — no SDK, no hosted hook — so the "open and free" story isn't muddied by a signup wall. When the platform
  lands at Month 4, **Connected is its entry rung**: meeting developers *inside their existing framework*
  (LangGraph, CrewAI, Vercel AI, …) is the lowest-friction path onto it — no migration, no rewrite.
- **Connected → Hosted → Native is the funnel *within* the platform.** Trust is earned on governance + memory
  first (Connected); only then will a team hand over *execution* (Hosted), and only teams starting fresh or
  standardizing adopt *Native* wholesale.
- **The wedge is memory, the moat is governed action.** We lead with memory (OSS, benchmark-proven) because
  it is a universal pain and our clearest lead; we monetize and defend on the **Governed Action Layer**
  (simulate-then-commit, SAGA rollback, signed ledger, purpose-binding) — the thing no framework ships.

---

## 2. Phase 0 — Runway (Weeks −8 → 0) `[Lib] prep`

*Not a public phase — the launch is only as good as this.* No new engineering; packaging + proof + seeding.
This runway preps the **memory libraries only** (the Phase-1 launch). The client SDKs get their own hardening
runway *before Phase 2*, not here.

- **Memory repos launch-ready:** `actrone-memory` (TS, `actrone-memory-ts`) + `actrone-memory` (Python,
  `actrone-memory-py`). READMEs + visuals, quickstarts (<5 min to first recall), license, CONTRIBUTING, semver,
  CI badges, security policy. *(The `@actrone/sdk` + `actrone` client SDKs are Phase-2 surface — polish them on
  the pre-Phase-2 runway.)*
- **Proof asset (the weapon):** publish the **memory-depth eval** (LOCOMO + LongMemEval) with reproducible
  scripts — *"beats Mem0 / Zep / Letta / Cognee on recall + latency"*. **This must be defensible and re-runnable
  by a skeptic** (a contested benchmark is worse than none). *(Gate E from the memory-depth plan — run it before
  any "beats X" claim ships.)*
- **Docs + site:** the docs tree (dual-language TS+Python), marketing site on the locked Black & Apple-Silver
  identity, an **explainer video**, and the **framework adapter matrix** page.
- **Design partners:** 10–20 hand-picked teams (skew to the wave 1 markets), private Discord/Slack, weekly office
  hours. **Private hosted-platform preview** invitations start here.
- **Waitlist + telemetry:** opt-in anonymous usage counters in the OSS libs (installs, recall calls) so we can
  *see* adoption, and a hosted-platform waitlist.

**Exit gate:** eval published + reproducible · quickstarts <5 min · 15+ design partners committed · site + docs live.

---

## 3. Phase 1 — Open Source & Awareness (Month 0 → 4) 🌍 global

> **Thesis:** *"The best open memory for **any** agent."* Win developer mindshare with free, best-in-class OSS —
> the **memory libraries only**. **No SDK, no hosted surface, no signup, no monetization.** This phase buys *pure
> distribution*; the platform (and the accounts it captures) is Month 4.

### 3.1 Feature pack — memory libraries only
| Feature | Build mode | Notes |
|---|---|---|
| **OSS memory library** — `actrone-memory` (TS) + `actrone-memory` (Python) (dense recall + RRF, bitemporal graph, self-editing blocks, policy-ontology, local embedder + local/injectable stores) | **[Lib]** | The wedge. Framework-agnostic, works fully **standalone** (no platform dependency). |
| **Memory framework adapters** (Python per-framework memory extras; TS `adapters.ts` recall/remember helpers + LangChain/LlamaIndex message-history contracts) | **[Lib]** | Drop the lib into the framework devs already use. *(Honest depth: not full TS↔Python parity — see §3.4 note.)* |
| **Memory CLI** (the memory lib's own `add`/`list` CLI) | **[Lib]** | Inspect + seed memory from the shell. |
| **The benchmark** (LOCOMO + LongMemEval, reproducible) published alongside | **[Lib]** | The awareness weapon — *"beats Mem0/Zep/Letta/Cognee."* |
| **Robust docs + visuals** (quickstart, concepts, API ref, adapter guide, recall-pipeline diagram) | **[Lib]** | First impression = the README. |

> **Explicitly NOT in Phase 1 (moved to Phase 2):** the client SDKs (`@actrone/sdk`, `actrone`), BYOF *governed-tool*
> adapters, the free connected tier (memory cloud + gateway), and `governLocalTool`. They are **hosted-platform
> clients** — shipping them now would put a signup/platform hook on a launch whose whole power is *"open, free, no
> account."*

### 3.2 MVP cut vs delight
- **MVP (must):** the two memory libs (green, publish-ready), 4–5 flagship framework adapters, the reproducible
  benchmark, and README/docs with the recall-pipeline visual — all provably accurate.
- **Delight (should):** a 60-second "give your LangChain/CrewAI agent long-term memory in 3 lines" video, a live
  benchmark page, memory-CLI scaffolds.
- **Hold back (deliberate):** **everything platform** — SDKs, connected tier, Hosted/Native, Control Tower,
  billing — reserved for Phase 2 so the message stays *"free, open, yours — no account."*

### 3.3 GTM & distribution
- **Launch surface:** Show HN / Product Hunt / Hacker News, the benchmark blog, r/LocalLLaMA + framework
  Discords, a launch-week explainer series.
- **Community-led:** upstream integration PRs into the frameworks; "works with Actrone memory" examples; a public
  Discord; weekly office hours; **hackathons in each region** (esp. African dev hubs — see §8).
- **Content engine:** memory-depth teardown, "long-term memory for agents 101," per-framework quickstarts.
- **Motion:** pure **PLG**. No sales, no signup wall. Optimize for **installs, stars, and platform-waitlist
  signups** (the waitlist is the only capture surface in Phase 1).

### 3.4 Success gates (advance to Phase 2 only when)
- ≥ **8–10k** combined weekly npm+pip installs, ≥ **3k** GitHub stars, ≥ **25** activated design partners,
  ≥ **1** contested-and-survived benchmark, and a **deep platform waitlist** — the raw demand Phase 2 converts.
- **Parity/honesty note:** TS and Python memory adapters are **not at full feature parity** (TS ships recall/remember
  helpers + 2 message-history contracts; Python ships richer per-framework memory subclasses). The docs must state
  this truthfully — **never claim parity the code doesn't have.** (This is a launch-blocking accuracy item.)

---

## 4. Phase 2: the hosted launch with pack 1 (about Q1 2027) in the wave 1 markets

> **Thesis:** *"Agents that act for you, by voice, with proof and undo."* Pack 1 leads with what the market wants now, voice agents and personal and work agents (Actronauts), and makes the governed platform the reason to trust them. All three build modes, Control Tower, computer use, cross-company actions, enterprise data residency and self-hosting ship together; only the marketplace waits for pack 2. Convert the OSS memory base and the waitlist into platform accounts, starting with the free connected tier.

### 4.1 Feature pack
| Feature | Build mode | Notes |
|---|---|---|
| **Client SDKs** (`@actrone/sdk`, `actrone`) and the **free connected tier**: governed gateway inference, managed memory, `callTool`/`actroneTool` | **[Connected]** | The platform’s entry rung: govern your existing agent without moving it |
| **BYOF governed-tool adapters** for the frameworks in the live test suite | **[Connected]** | Governed tools in the framework developers already use |
| **`governLocalTool` supervise-only** | **[Connected]** | Govern your own tools, free |
| **BYOF-Hosted harness**: durable, supervised, governed execution | **[Hosted]** | Encapsulated and stepwise drivers, per the framework matrix |
| **Native governed loop and the Studio no-code builder**, with governed tools | **[Native]** | Where voice agents and Actronauts are built; Studio already compiles each agent’s governed tool list |
| **Voice agents**: governed inbound and outbound calls | **[Native]/[Hosted]** | The headline; launches only after live latency is measured and a blocked sentence is proven never to be spoken |
| **Actronauts**: the whole Actronauts plan except its marketplaces. Work and Personal editions, the charter and approvals, Rewind, mission preview, the native iPhone and Android apps (decision D25) and the web app, the desktop app with the Control Tower window, the browser extension, the character, the Actronaut’s own number for calls, payments, households, Guardian mode, the crew network, and managed machines for enterprises | **[Native]** | Decision D24 in `Actrone_Personal_Agents_Implementation_Plan.md`; payments only where decision D14’s partners are confirmed; households with adult members only (decision D16) |
| **Governed computer use** on the device, in the browser and in the cloud browser | **[Hosted]/[Native]** | The governed computer use plan’s phases 0 and 1 come first; the extension and the cloud browser need Cloudflare’s verified agent listing |
| **Cross-company actions** (the action fabric) and A2A | **[All]** | Built; it works between any two Actrone customers, hosted or self-hosted, and grows with each one |
| **Control Tower** with environments and promotion | **[All]** | One pane over every build mode |
| **Governed Action Layer**: governed connectors, simulate then commit, approvals, signed receipts, undo | **[All]** | The moat, visible from day one |
| **DPE, the tool-call supervisor and MediaGuard**, including image and screen redaction | **[All]** | Governance on by default; image and screen redaction needs its model weights and vision endpoint deployed and its screenshot recall measured |
| **Assurance and attested autonomy**: signed run records and the deterministic risk engine | **[All]** | Described as attested and audit-grade, not as insurance; risk scores stay uncalibrated until real outcomes exist |
| **Governed model gateway**: BYOK, model catalog, cost routing, and the cost and model optimizers | **[All]** | Metered; the optimizers learn from customer traffic, so their savings grow after launch |
| **Premium memory** for Pro | **[All]** | No “beats Mem0” claim until the benchmark runs |
| **Teams, single sign-on and SCIM** | **[All]** | Team and enterprise access |
| **Trust center and DPA/BAA automation** | **[All]** | Claims only what is proven; SOC 2 Type II shown as in progress until done |
| **Data residency**: EU, Cape Town and Canada planes | **[All]** | A switch in the product; each plane is applied and tested before launch |
| **Self-hosting**: Ed25519 licensing, air-gapped install, Helm, generic OIDC | **[All]** | For enterprise; the installer release is published and guided and air-gapped installs are tested before launch |
| **Billing**: Free, Pro, Team and Enterprise, plus the Actronauts plans | **[All]** | First revenue |

### 4.2 Launch gates
- Load tests on hosted execution, the native loop and voice, and a penetration test across the platform
- Live voice tests: latency measured and published internally, and a blocked sentence never spoken
- The EU, Cape Town and Canada data planes applied and tested
- The self-hosting release published, with guided and air-gapped installs tested and support bundles ready
- Trust center claims limited to what is proven
- Actronauts pass their own gates (Actronauts plan, section 14): rehearsal, the prompt injection suite, the desktop performance budgets, the verified agent listing and the intelligence evals
- Computer use passes its gates: MediaGuard screenshot recall measured, and the injection suite with zero exfiltrations or unapproved sends
- Payments: a purchase over the threshold cannot complete without a passkey, and every purchase has a receipt, in each market where payments switch on
- Outside approvals in hand: Cloudflare’s verified agent listing, browser store review, desktop code signing, and the card issuing and EU payment partners
- Anything that misses its gate moves to pack 2 rather than delaying the launch

### 4.3 GTM & distribution
- **Conversion motion:** the Month-4 launch converts the **OSS-memory base + waitlist** onto the **free connected
  tier** (the entry rung), then upsells **connected → hosted → paid** (each step is ~one flag). Design partners →
  paid first.
- **First sales touch:** founder-led / light sales-assist on Team tier; case studies from design partners.
- **Positioning:** *govern + run the agents you already built* — not "rip and replace."
- **Markets:** wave 1, the United States, Canada, the United Kingdom, Ireland, the Netherlands and South Africa (`Actrone_Launch_Markets.md`), with data residency on the EU, Cape Town and Canada planes from launch.

### 4.4 Success gates
- **Free→paid conversion ≥ 3–5%** of the connected cohort · first **$XXk MRR** · **N hosted agents** in prod ·
  measurable **GAL governed-write volume** (the moat metric) · logo'd case studies in ≥ 2 regions.

---

## 5. Phase 3: enterprise expansion (from launch)

> **Thesis:** *"Agents that use your computer, safely, and work across companies."* No new pack: pack 1 already carries residency, the trust center, self-hosting, computer use, cross-company actions and managed machines, so enterprise sales run from launch and this phase is about selling them.

### 5.1 Feature pack
Nothing new ships in this phase. Anything from pack 1 that missed its gate ships in pack 2 (section 6).

### 5.2 GTM & distribution
- **Motion:** **compliance-led enterprise sales** (trust center + DPA/BAA shorten the security review) + partner /
  SI channel + regional partnerships. Land-and-expand from the Phase-2 paid base.
- **EU angle — the AI Act tailwind:** the EU AI Act makes *human oversight, transparency, and logging* a **legal
  requirement** for higher-risk AI systems. Actrone's audit spine + DPE + Control Tower are **AI-Act
  compliance infrastructure** — position governance as a *requirement*, not a nice-to-have. This is the single
  strongest EU wedge.
- **Africa angle:** residency (POPIA/NDPA/Kenya-DPA) + **self-host/edge** for connectivity- and sovereignty-
  sensitive buyers + local payment rails + community-to-enterprise pipeline (see §6).
- **Residency:** shipped in pack 1; this phase deepens enterprise features on top of it. Markets open by wave (`Actrone_Launch_Markets.md`).

### 5.3 Success gates
- ≥ **N enterprise logos**, first **self-host / air-gap** deals, EU + Africa revenue > 0, ACV step-up, a
  completed SOC 2 Type II (or a credible in-progress attestation) driving deals.

---

## 6. Phase 4: pack 2, the marketplace (about 2 to 3 months after launch)

> **Thesis:** *"The agent network."* Turn on the marketplace once customers have built agents and skills worth selling.

### 6.1 Feature pack
| Feature | Build mode | Notes |
|---|---|---|
| **Marketplace**: agents, connectors, signed skills and Actronaut characters, with revenue share | **[All]** | The network-effect flywheel; needs supply from pack 1 customers first |
| **Anything from pack 1 that missed its gate** | Varies | The slip rule in section 0.1 |

### 6.2 GTM & distribution
- **Motion:** marketplace-led PLG + expansion selling; ecosystem partners publish; the flywheel (more agents →
  more connectors → more buyers) compounds. Assurance, live since pack 1, becomes a category-defining wedge once
  an underwriter partner signs on.

---

## 7. Build-mode rollout matrix (when each turns on, and why)

| Build mode | Open source (live) | Pack 1 (hosted launch) | Pack 2 |
|---|---|---|---|
| **[Lib]** OSS memory | Live | Premium memory for Pro | |
| **[Connected]** | Waitlist only | Launch: SDKs, free tier, governed tools, residency, cross-company actions, A2A | Marketplace |
| **[Hosted]** | Private preview | Launch: durable governed runs, environments, residency, self-hosting, optimizers, computer use | Marketplace |
| **[Native]** | Private preview | Launch: native loop, Studio with governed tools, voice agents, all of Actronauts (iPhone and Android apps, desktop app, extension, payments, households, Guardian mode) | Marketplace, including Actronaut characters |

**Rationale:** the open-source libraries launched alone, so the “open and free” message carried no signup wall. **All three platform modes launch together in pack 1**, because the client SDKs are hosted-platform clients and the native builder and hosted execution share the same kernel and Control Tower; shipping one without the others splits the story. Voice agents and Actronauts lead pack 1 because that is where the market is in early 2027, and everything else built in the same plan launches with them. Only the marketplace waits, because it needs supply first.

---

## 8. Region strategy

> **Launch markets for all of Actrone live in `Actrone_Launch_Markets.md`** (created 2026-10-09). This section keeps the reasoning; that document holds the current list, order and per-market gates.

OSS (Phase 1) is **borderless** — seed community everywhere at once. The *hosted* rollout opens by market wave
(`Actrone_Launch_Markets.md`); data residency ships in pack 1, so each region’s data plane is applied before launch.

| Region | Data plane | Key regulation | Enters (hosted) | Distribution motion | Pricing/payment |
|---|---|---|---|---|---|
| 🇺🇸 **US** | us-east-1 | SOC 2 as the gate; sector rules (HIPAA via BAA) | **Wave 1** | PLG + founder-led sales; the dev-community heartland | USD; Stripe |
| **UK** | us-east-1, or the EU plane by choice | UK GDPR; ICO data protection fee | **Wave 1** | Rides the US motion; English | GBP; Stripe |
| 🇨🇦 **Canada** | Canada plane in pack 1 (US-east otherwise) | PIPEDA, **Quebec Law 25** | **Wave 1** (French for Quebec) | Rides US motion; residency for health/gov/finance | USD/CAD; Stripe |
| 🇪🇺 **EU** | eu-central/eu-west | **GDPR + EU AI Act** | **Wave 1** through Ireland and the Netherlands; Germany, France, Spain, Italy and the Nordics in wave 2; the rest of the EU in wave 3 | **AI-Act-compliance-led**; DPA/BAA automation; SI partners | EUR; Stripe; SCCs for transfer |
| 🌍 **Africa** | **af-south-1 (Cape Town)** | **POPIA** (ZA), **NDPA 2023** (NG), Kenya DPA 2019, Ghana DPA | South Africa in **wave 1**; Kenya in wave 2; Nigeria and Ghana in wave 3; Egypt later | **Community→enterprise** + local SI/fintech/telco partners; **self-host/edge** for sovereignty + connectivity | USD + local (Paystack / Flutterwave); local-currency option |

### 8.1 Why Africa is a first-wave bet (not an afterthought)
- **Underserved by US-centric SaaS**, one of the **fastest-growing developer populations**, mobile-first, and
  **regulated sectors modernizing fast** (fintech, telco, BPO/customer-ops, government) — exactly the
  agent-automation demand curve.
- **Our differentiators map to African constraints:** **self-host + air-gap** answer data-sovereignty and
  connectivity; **residency (af-south-1)** answers POPIA/NDPA; **governance + audit** answer the regulated
  sectors; **OSS + community** answer developer trust and price sensitivity.
- **Motion:** Phase-1 hackathons + university/bootcamp partnerships + Discord → Phase-3 enterprise via local SI
  and fintech/telco partnerships → local billing rails. Treat it as **community-led land, partner-led expand**.

### 8.2 EU is a compliance *sale*, not just a residency checkbox
The **EU AI Act** turns Actrone's core (audit spine, DPE human-in-the-loop, Control Tower logging, MediaGuard) into
**compliance tooling for high-risk AI**. Lead EU messaging with *"deploy agents that are AI-Act-ready by
construction."* This is the strongest non-US wedge and should shape EU content from Phase 1.

---

## 9. Pricing & packaging evolution

| Tier | Turns on | Modes | Pack |
|---|---|---|---|
| **OSS memory (open)** | Memory lib, framework adapters and the memory CLI; free forever, standalone | [Lib] | Open source (live) |
| **Free (connected)** | Client SDKs, managed memory and the governed gateway, usage-capped; `governLocalTool` | [Connected] | 1 |
| **Pro** | Higher limits, hosted execution, Control Tower, governed actions, BYOK, premium memory | [Connected]/[Hosted]/[Native] | 1 |
| **Team** | Collaboration, RBAC, environments and promotion, Teams and single sign-on | [All] | 1 |
| **Enterprise** | Data residency, the trust center, DPA/BAA, self-hosting, SCIM, SLA | [All] | 1 |
| **Actronauts plans** | Personal Free, Plus and Pro; Work Team and Business (Actronauts plan, decision D13) | [Native] | 1 |
| **Marketplace** | Revenue share | [All] | 3 |

**Metering:** per-task-run + routing spend (token) + a BYOK platform fee — the metering spine is already built
(usage_events → Stripe Billing Meters). Keep the **free tier generous** (adoption > early revenue) through Phase 2.

---

## 10. Metrics, gates & the funnel

| Stage | Primary metric | Phase-gate to advance |
|---|---|---|
| Awareness (Phase 1) | weekly installs, stars, site traffic, **waitlist depth** | Phase 1 → 2: installs/stars/waitlist/design-partner thresholds (§3.4) |
| Activation (Phase 2) | free-connected-tier accounts, connected `callTool`/gateway WAU | the OSS base + waitlist convert onto the free connected tier |
| Expansion | free→paid %, hosted-agent count, **GAL write volume** (moat) | Phase 2 → 3: conversion % + MRR + logos (§4.4) |
| Enterprise | logos, ACV, self-host deals, region revenue | Phase 3 → 4: enterprise + EU/Africa revenue (§5.3) |
| Ecosystem | marketplace listings + GMV, expansion revenue | ongoing |

**North-star:** **governed actions executed** (per week) — it captures adoption *and* the moat in one number,
across all three modes.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **OSS adoption without conversion** (free-rider) | Give away *memory*, monetize *governed action + hosted execution*. Phase 1 captures demand via **OSS telemetry + the platform waitlist**; from Month 4 the **free connected tier is instrumented** so every account is a conversion target. |
| **Benchmark contested** | Publish reproducible scripts; invite re-runs; never claim "beats X" without Gate-E survival. |
| **"Framework, not platform" perception** | Lead with *govern your existing agent* (Connected); the platform is the upgrade, not the ask. |
| **Enterprise sales too early** | Founder-led at launch. Residency, the trust center and self-hosting ship in pack 1, so compliance-led sales can start at launch, but only with claims the trust center can prove. |
| **Region sprawl dilutes focus** | OSS is global, but hosted opens by market wave (`Actrone_Launch_Markets.md`); a market opens only when its gates pass, including its data plane. |
| **Africa go-to-market underestimated** | Treat as community-led land + partner-led expand; lean on self-host + local payment rails; don't force the US playbook. |
| **A large pack 1 delays the launch** | Pack 1 now carries everything except the marketplace (owner decision, 2026-10-09). Most of Actronauts, computer use and payments are not built yet: the Actronauts plan estimates about 37 to 45 weeks along its longest chain with the phases built in parallel, against about 25 weeks to the end of Q1 2027. Load tests, a penetration test, live voice tests and each feature’s own gates still decide what ships; anything that misses its gate moves to pack 2 rather than holding the launch. If the owner would rather hold the launch until everything passes, the date moves instead, to about July or August 2027 at the earliest. |

---

## 12. Timeline at a glance

```
Weeks -8 to 0     Runway ........... memory repos, eval, docs, site, design partners, platform waitlist
Sep 2026 onward   Open source ...... memory libraries live everywhere; no signup; PLG
About Q1 2027     Pack 1 ........... hosted launch in the wave 1 markets: connected, hosted and native modes,
                                     Studio, voice agents, all of Actronauts (phone, desktop, extension, payments,
                                     households, Guardian mode, crew network), computer use, cross-company actions,
                                     governed actions, optimizers, image and screen redaction, assurance,
                                     Control Tower, residency (EU, Cape Town, Canada), self-hosting, billing
About +2 to 3 mo  Pack 2 ........... marketplace, plus anything from pack 1 that missed its gate
Waves 2 to 4      By market gates .. see Actrone_Launch_Markets.md
```

---

## 13. Appendix — master matrix (feature → build mode → phase)

| Feature | [Lib] | [Connected] | [Hosted] | [Native] | Pack |
|---|:--:|:--:|:--:|:--:|:--:|
| OSS memory lib, framework adapters, memory CLI | ● | | | | Open source |
| Reproducible benchmark, docs and visuals | ● | | | | Open source |
| Client SDKs and BYOF governed-tool adapters | | ● | | | 1 |
| Free connected tier (memory cloud and gateway) | | ● | | | 1 |
| `governLocalTool` supervise-only | | ● | | | 1 |
| Hosted harness (durable execution) | | | ● | | 1 |
| Native governed loop and Studio | | | | ● | 1 |
| Voice agents | | | ● | ● | 1 |
| Actronauts (the whole plan except its marketplaces) | | | | ● | 1 |
| Control Tower, environments and promotion | | ● | ● | ● | 1 |
| Governed Action Layer | | ● | ● | ● | 1 |
| DPE, supervisor, MediaGuard first stage | | ● | ● | ● | 1 |
| Monetization (metering, tiers, Actronauts plans) | | ● | ● | ● | 1 |
| Data residency (EU, Cape Town, Canada planes) | | ● | ● | ● | 1 |
| Trust center and DPA/BAA | | ● | ● | ● | 1 |
| Teams, single sign-on and SCIM | | ● | ● | ● | 1 |
| Self-hosting | | ● | ● | ● | 1 |
| Memory depth premium | ● | ● | ● | ● | 1 |
| Actronauts desktop app and browser extension | | | | ● | 1 |
| Governed computer use | | | ● | ● | 1 |
| Action fabric and A2A | | ● | ● | ● | 1 |
| Optimizer and distillation flywheels | | | ● | ● | 1 |
| MediaGuard image and screen redaction | | ● | ● | ● | 1 |
| Studio governed tools | | | | ● | 1 |
| Actronaut payments | | | | ● | 1 |
| Households, Guardian mode, crew network | | | | ● | 1 |
| Assurance and attested autonomy | | ● | ● | ● | 1 |
| Marketplace | | ● | ● | ● | 2 |

---

*Plan v1.0 — Actrone GTM. The engineering is largely done; this document is about **sequencing exposure,
monetization, and regions** to convert a code-complete platform into adoption, revenue, and a defensible moat.
Update per-phase status as waves ship.*
