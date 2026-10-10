# Actrone — Distribution & Go-to-Market Strategy

> **✅ Capabilities re-verified 2026-07-13 (code audit).** The product surface this GTM plan sells is
> confirmed near-total code-complete (incl. the OSS wedge — `create-actrone-app` + the memory benchmark
> harness now EXIST, correcting earlier "missing prerequisite" framing; residual is npm-publish + running
> the benchmark with a real dataset). The binding constraint remains distribution/turn-up/proof, not
> engineering. Full status: `Actrone_Master_Implementation_Plan.md` → "CONSOLIDATED REAL STATUS (2026-07-13)".
>
> **Status of this document.** A companion to
> [Actrone_Positioning_And_Competitive_Moats.md](./Actrone_Positioning_And_Competitive_Moats.md)
> (what we say and why it's defensible) and
> [Actrone_Product_Review_and_Financial_Model.md](./Actrone_Product_Review_and_Financial_Model.md)
> (what's built and the honest risks). Those two answer *"is the product real and differentiated?"*
> (yes). **This one answers the harder question the product review flagged as the actual risk: how do
> we get distribution and become *known as* the governance-first platform for production AI agents?**
>
> This is a plan to argue with and instrument, not a guarantee. Every target below is a hypothesis to
> replace with real funnel data the moment we have it.
>
> **The full strategy set (this doc is the hub):**
> - **Positioning:** [Positioning & Competitive Moats](./Actrone_Positioning_And_Competitive_Moats.md)
> - **Honest product truth:** [Product Review & Financial Model](./Actrone_Product_Review_and_Financial_Model.md)
> - **Marketing:** [Marketing — OSS](./Actrone_Marketing_Strategy_OSS.md) · [Marketing — Hosted](./Actrone_Marketing_Strategy_Hosted.md)
> - **Sales:** [Sales — OSS (product-led conversion)](./Actrone_Sales_Strategy_OSS.md) · [Sales — Hosted (Scale & Enterprise)](./Actrone_Sales_Strategy_Hosted.md)
> - **Creative:** [Ad Campaign](./Actrone_Ad_Campaign.md)
> - **Working docs:** [Lighthouse Outreach Playbook](./Actrone_Lighthouse_Outreach_Playbook.md) · [Content Calendar](./Actrone_Content_Calendar.md)
> - **Rollout backbone:** OSS Py+TS global (months 1 to 4), then the hosted launch in the wave 1 markets (the United States, Canada, the United Kingdom, Ireland, the Netherlands and South Africa) at about month 5, then waves 2 to 4 as each market passes its gates. The list lives in `Actrone_Launch_Markets.md`; see §5b.
>
> _Last updated: 2026-07-10 · Owner: Matt_

---

## 0. The uncomfortable premise

The product review's verdict is blunt: **the technology risk is low; the entire risk is focus,
proof, distribution, and battle-testing** — and the 2026-07 build wave *added* surface, making the
focus problem harder. So this GTM plan starts from three non-negotiables:

1. **The next unit of proof beats the next unit of engineering.** Feature freeze the launch surface;
   route energy to distribution + hardening. (Product Review §8, item 0.)
2. **Governance is a trust purchase, not a feature purchase.** You cannot *claim* governance-first —
   you must make it publicly, repeatedly provable. Distribution = manufacturing visible trust at scale.
3. **We will be filed under exactly one category by the market.** We choose it, or it chooses for us.
   Everything not on the front door is "and it also…".

---

## 1. The distribution thesis — a two-speed engine

Developer adopters and governance buyers are different people who move at different speeds and trust
different signals. One message for both is the sprawl trap. Run two coupled motions:

| | **Speed 1 — the wedge** | **Speed 2 — the position** |
| --- | --- | --- |
| **Asset** | `actrone-memory` (OSS, MIT, no lock-in) + TS/Python DX | governance / compliance / self-hosting / the demoable moats |
| **Audience** | individual developers, framework users | platform, security, compliance, and eng-leadership buyers |
| **Motion** | bottoms-up, product-led, viral-ish | trust-led — proof, references, category ownership |
| **Trust signal** | "it's fast, free, framework-agnostic, no lock-in" | "prove what every agent did; it never left our boundary" |
| **What it buys** | *installed* (top of funnel) | *known + paid* (the moat, the expansion) |
| **KPI** | installs, weekly-active repos, hosted signups | design-partner logos, security-review pass rate, expansion |

**The coupling is the strategy:** the wedge lands us *inside* the account for free; governance is why
the agent that touches real data becomes a paid, expanding relationship. Every OSS user is a future
governance conversation the day their agent hits production data.

---

## 2. Positioning discipline — one front door

**The line (use it everywhere, verbatim):**
> **The governed control plane for AI agents — self-hosted, any model.**

**Message hierarchy (never invert it):**

1. **Front door (the noun):** governance-first control plane for **production** AI agents. The word
   *production* is the whole wedge — it separates us from prototype frameworks.
2. **Proof points (the "and it also…"):** memory · orchestration · compliance · multi-agent · voice
   + governed translation · marketplace. These are *closing tools shown after interest*, never the
   opening line.
3. **The one new feature we DO lead with in launches:** the **governed real-time interpreter** — it
   demos in 60 seconds with zero production traffic (see §4), so it earns attention without the
   flywheels having spun yet.

**Category vocabulary to own** (say it until it's ours): *"production AI agents," "agent governance,"
"AgentOps," "governed action layer," "zero-egress agents."* Own the search + the conversation before
an incumbent ships "good-enough governance" for free.

---

## 3. "Show, don't claim" — the proof-artifact system

For a trust category, the distribution assets should literally **be the governance features surfaced
publicly.** Build these five once; reuse them across every channel. This is the highest-leverage GTM
work we can do.

| Proof artifact | The capability it proves | Format | Reuse |
| --- | --- | --- | --- |
| **Audit-trail demo** — "prove what every agent did in one query" | tamper-evident audit spine | 30–60s screen capture + live sandbox | landing hero, sales, docs |
| **Governed interpreter demo** — live PII-safe, glossary-locked, brand-voice translation | `translate.go` + s2s bridge | 60s video + a "try it" page | **the launch centrepiece** |
| **Savings-dividend invoice** — "Actrone saved you $X, auditable vs your own token logs" | `savings` + optimizer | one real customer invoice (anonymised ok) | least-copyable claim; PR + sales |
| **Zero-egress reference architecture** — "runs in your VPC, nothing leaves" | MAL / MediaGuard / residency | diagram + a deployable example | security review, enterprise |
| **Public trust center + SECURITY.md + a real third-party pen-test report** | the compliance engine + hardening | web page + PDF | governance buyers screenshot these |

> **Honesty rule for every artifact:** demo only what survives production. The interpreter and audit
> trail are safe to demo now; **voice-on-a-live-call and the freshly-re-platformed WorkOS auth are
> not yet proven** — demo the interpreter to win attention, but do not *promise* live-call voice or
> lead with auth as a governance claim until each is pilot-tested + pen-tested (Product Review §2.2).

---

## 4. Channels, sequenced

Do these in order — the review's #1 risk is doing them all at once.

1. **Instrument the funnel first** (§7). You cannot optimize conversion, or feed the distillation
   flywheel, on data you didn't capture. This precedes any launch push.
2. **Make OSS memory the best free option + nail TS DX.** README benchmarks vs Mem0/Zep, a 5-minute
   quickstart, `create-actrone-app`, first-class LangGraph/Vercel-AI/Mastra/CrewAI examples. This is
   the only asset with real viral potential — over-invest.
3. **Distribution-by-adjacency.** Ship *and market* the framework adapters (we're adapter-friendly,
   not a rival framework), be a first-class MCP client, and land in the integration directories of
   LangChain / LlamaIndex / Vercel. Meet developers where they already are.
4. **Product-led launch moments.** The interpreter demo + the audit-trail demo → Show HN / Product
   Hunt / X / dev newsletters. Product-led, not press-led.
5. **Content + category ownership** (§8) running continuously underneath all of the above.
6. **3–5 lighthouse design partners in ONE regulated vertical** (§9) — the reference engine that
   makes governance credible and battle-tests the surface for real.
7. **Enterprise + procurement rails, last:** AWS Marketplace private offers, the SOC 2 clock (start
   the observation window now — it's calendar time), security-questionnaire automation. Never run an
   enterprise motion before OSS density gives warm intros *inside* accounts.
8. **The long-game rails play:** position A2A-governed-interop + MCP governance as *"we govern the
   half the protocols don't."* A durable narrative moat if the category standardizes.

---

## 5. The 0–90-day plan

Three 30-day phases. Each item has a DRI placeholder `[ ]` to assign. "Done" = shipped + measurable.

### Phase 1 (Days 0–30) — **Instrument & sharpen** ("stop the leaks before pouring water in")

- [ ] **Freeze the launch surface.** Written decision: launch scope = OSS memory → governed
      connected → governance/compliance + the interpreter demo. Everything else stays dormant.
- [ ] **Wire the funnel telemetry end-to-end** (§7): OSS install → hosted signup → first governed
      task → first paid. Analytics + the trace-capture spine live *before* any push.
- [ ] **Build the 5 proof artifacts** (§3). Interpreter + audit-trail demos first.
- [ ] **Rewrite the homepage + README to the single front-door line** (§2). One message, proof below.
- [ ] **Ship OSS DX v1:** 5-minute quickstart, benchmarks vs Mem0/Zep, `create-actrone-app` scaffold.
- [ ] **Publish SECURITY.md + a public status page**, and *schedule* the third-party pen-test.
- [ ] **Draft the lighthouse ICP + outreach list** (§9); pick the ONE regulated vertical.

**Exit criteria:** funnel is fully instrumented; the front-door message is live; the interpreter demo
is shareable; 20+ named lighthouse targets identified.

### Phase 2 (Days 31–60) — **Land the wedge & seed credibility**

- [ ] **Launch moment #1: the OSS memory + interpreter** (Show HN / PH / X / newsletters).
- [ ] **Framework-adapter directory listings** live (LangChain/LlamaIndex/Vercel/MCP).
- [ ] **Content engine at cadence** (§8) — 1 pillar + 1 tactical post/week.
- [ ] **First 2–3 lighthouse conversations in motion** (§9); at least one deploying self-hosted.
- [ ] **Start the SOC 2 Type II observation window** (calendar time — start it now).
- [ ] **Turn on billing plumbing in the background** (Stripe catalog, `ENABLED`→`ENFORCED` readiness)
      so the first paid conversion isn't blocked — but do not *push* monetization yet.

**Exit criteria:** a real OSS adoption curve you can measure; ≥1 lighthouse in a live self-hosted
deployment; the content engine is producing a discoverable body of "production agents" material.

### Phase 3 (Days 61–90) — **Prove it publicly & convert**

- [ ] **Publish the first real case study with real numbers** — ideally the savings-dividend invoice
      or the zero-egress reference from a lighthouse partner. This is the single most differentiating,
      least-copyable asset (Product Review §8, item 2).
- [ ] **Pen-test complete → publish the report** (or a summary) to the trust center.
- [ ] **First hosted → paid conversions** from the OSS funnel; measure activation → paid.
- [ ] **AWS Marketplace listing live** (procurement rail for the enterprise pipeline forming behind
      the lighthouses).
- [ ] **Voice pilot (scoped, one partner)** — validate live-call reality before any voice marketing.
- [ ] **Retro against the funnel metrics; re-baseline §7 targets with real data.**

**Exit criteria:** ≥1 named reference logo; a public, provable governance claim (case study + pen-test
+ trust center); a measured OSS→paid conversion rate to optimize from.

---

## 5b. The global rollout sequence (the phased geo plan)

> **Launch markets for all of Actrone live in `Actrone_Launch_Markets.md`** (created 2026-10-09). This section keeps the reasoning; that document holds the current list, order and per-market gates.

The two-speed engine maps cleanly onto a phased *global* launch: **the wedge is global from day one
(software distributes everywhere); the hosted position is geo-phased (trust, compliance, and support
are local).** This is the committed sequence.

| Phase | Months | What launches | Geography | Why this order |
| --- | --- | --- | --- | --- |
| **W0 — OSS wedge (memory only)** | **1–4** | `actrone-memory` **Python + TS** (MIT) + the memory CLI, quickstart, an **honest reproducible benchmark vs Mem0/Zep**, `create-actrone-app`. **Memory libraries only — the client SDKs are NOT in this wave** (they're hosted-platform clients, W1). | **Global** (OSS has no border) | Software distributes everywhere for free; build the developer install base + the trace-capture funnel *before* any paid push. No compliance/support burden yet. Pure "open, free, no account" message — no SDK/platform hook. |
| **W1: hosted feature pack** | **5** | **Pack 1** (the phased GTM plan, §0.1): everything except the marketplace. Connected, hosted and native modes, Studio, **voice agents**, **all of Actronauts** (iPhone and Android apps, desktop app, browser extension, payments, households, Guardian mode), **computer use**, **cross-company actions**, governed actions, Control Tower, the model gateway and optimizers, premium memory, Teams, single sign-on and SCIM, the trust center, assurance, **data residency** and **self-hosting** | **Wave 1: US · Canada · UK · Ireland · Netherlands · South Africa** | The wave 1 markets, where the OSS funnel, the compliance story and the agents’ phone, payment and WhatsApp routes all work at launch. The SDKs debut here as the platform's low-friction entry rung. EU = GDPR + data-residency (`residency_eu` gate); US, Canada and the UK = the largest agent-dev markets + health/fintech; **South Africa = a deliberate emerging-market bet** the product already leans toward (FSCA/POPIA compliance modules, zero-egress fits leapfrog/regulated fintech). |
| **W2: hosted expansion** | **8 to 11** | Pack 1, plus pack 2 (the marketplace) when it ships | **Wave 2: Germany · France · Spain · Italy · Sweden · Denmark · Finland · Australia · New Zealand · Kenya** | Translated EU markets, English-speaking additions and Kenya, once wave 1 proves the motion and each market passes its gates (`Actrone_Launch_Markets.md`). |
| **W3: wave 3 and later** | **11 to 17, then demand-pulled** | Every pack shipped by then | **Wave 3: Nigeria · Ghana · rest of EU · Brazil · India · UAE · Saudi Arabia; later: Egypt · Japan · South Korea · Southeast Asia** | Each needs a specific piece of work first (a local phone gateway, local pricing or local data law); no speculative build-out. |

**Rules that make the phasing work:**
- **OSS is the tip of the spear in every geo, always ahead of hosted.** By the time hosted opens in a
  region (W1/W2), the OSS install base + community there is already warm — hosted lands into demand,
  not cold.
- **Pack 1 is a feature *freeze*, not a feature *cut*.** It ships what the phased GTM plan §0.1 lists, led by
  voice agents and Actronauts, which is everything except the marketplace; the marketplace and anything that
  misses its gate wait for pack 2, and every pack reaches all open markets at once.
- **Compliance is the unlock per region, and it's mostly built:** the `residency` / `regionresolve` /
  `regionpool` routing (Tier A/B/C) + the per-region compliance modules (GDPR/HIPAA/FSCA/POPIA) are
  the gate for each hosted wave — but note the **EU physical data plane is authored-not-applied**, and residency
  ships in pack 1, so the EU, Cape Town and Canada planes must be applied *before* the hosted launch.
- **Money follows the same clock.** Billing stays dormant (it ships off-by-default) through W0; the
  Stripe catalog + `ENABLED`→`ENFORCED` turn-up happens *just before* W1 so the first paid conversions
  land with the first hosted geo — not before there's anything to charge for.

**Geo-tailored proof (what leads in each W1 market):** US, Canada and the UK → the audit-trail + savings-dividend
(cost + accountability); Ireland and the Netherlands (EU) → zero-egress + GDPR (sovereignty); South Africa → zero-egress +
FSCA/POPIA + "run governed agents on regulated fintech without sending data offshore" (leapfrog +
sovereignty). Same platform, region-appropriate proof artifact on the front.

---

## 6. Funnel metrics to instrument

Instrument all of these **before** launch — you can't optimize (or distill) on data you didn't
capture. Targets are hypotheses to replace with real numbers.

### The funnel (developer/PLG path)

| Stage | Metric | Instrument | Illustrative target |
| --- | --- | --- | --- |
| **Acquire** | OSS installs / week; repo stars; adapter-directory referrals | package registry + docs analytics + UTM | growth WoW, not absolute |
| **Activate** | % of OSS users reaching "first retrieval that helped"; hosted signup → **first governed task** | product events on the trace spine | ≥40% signup→first-task |
| **Retain** | weekly-active OSS repos; hosted D7/D30 retention | usage telemetry | D30 ≥ 35% (infra-tool benchmark) |
| **Revenue** | hosted → **first paid**; free→paid conversion; expansion (governed-spend growth) | billing events | free→paid 2–5% (OSS-led) |
| **Refer** | OSS-attributed signups; case-study/referral-sourced deals | attribution UTMs | rising share of pipeline |

### Governance-specific signals (the ones that matter for *this* positioning)

| Signal | Why it's the real leading indicator | Instrument |
| --- | --- | --- |
| **Self-hosted / BYOC deployments** | proves the zero-egress positioning is *used*, not just claimed | licence + telemetry (offline-capable) |
| **Governed actions / audit queries run** | the audit trail being *used* is the "aha" that predicts retention | audit-spine event counts |
| **Security-review pass rate + time-to-pass** | governance buyers gate on this; trust center should shrink it | sales-ops tracking |
| **Demonstrated savings ($ + %)** | the savings-dividend claim needs live numbers to be marketable | `savings` reconciliation |
| **Design-partner reference count** | governance sells on references, not ads | CRM |

> **North-star candidate:** *weekly governed tasks run through Actrone* — it couples wedge adoption
> (volume) with the position (governed, in production), and it's the number that makes the flywheels
> spin. Pick one north star and make the whole team feel it.

---

## 7. Content calendar spine

Content is how we own the category vocabulary and how governance buyers self-educate before they ever
talk to us. **Pillars** (recurring, evergreen) + **tactical** (weekly, timely). Opinionated and
grounded in the product — never generic AI think-pieces. *(Working artifact — the pillar briefs, the
12-week editorial tracker, and the per-piece distribution checklist — lives in
[Actrone_Content_Calendar.md](./Actrone_Content_Calendar.md).)*

### Pillars (the evergreen backbone — each becomes a hub page + a sales artifact)

1. **"What breaks when agents hit production"** — egress, audit, cost drift, tool misuse, PII,
   multi-agent chaos. The canonical map of the problem we solve. (Ranks on "production AI agents".)
2. **The governance checklist for production agents** — a scored, self-serve checklist that doubles
   as a lead magnet and a security-review artifact.
3. **Zero-egress agents** — the reference architecture + why "send it to our cloud" fails regulated
   buyers. (Owns "zero-egress agents".)
4. **AgentOps / the governed action layer** — the category-defining thesis (own the vocabulary).
5. **Open-source memory deep-dives** — benchmarks, budget-aware retrieval, framework adapters. The
   developer wedge's content home.

### Tactical cadence (first 12 weeks — 1 pillar advance + 1 tactical/week)

| Week | Pillar work | Tactical / timely |
| --- | --- | --- |
| 1–2 | Pillar 1 hub page | interpreter demo launch post; "governed vs ungoverned agent" side-by-side |
| 3–4 | Pillar 5 (OSS benchmarks) | memory vs Mem0/Zep benchmark; 5-min quickstart walkthrough |
| 5–6 | Pillar 2 (checklist) | audit-trail demo post; post-mortem of a public *ungoverned* agent failure |
| 7–8 | Pillar 3 (zero-egress) | "why your bank won't let agents touch data" + the reference arch |
| 9–10 | Pillar 4 (AgentOps thesis) | MCP-governance + A2A-governed-interop explainer |
| 11–12 | first case study draft | savings-dividend teaser; lighthouse partner story |

**Distribution of the content itself:** own channel (blog/docs, SEO) → dev newsletters + X/LinkedIn →
communities (relevant Discords/subreddits, framework forums) → repurpose demos as short video. One
piece, many surfaces.

---

## 8. Lighthouse-partner playbook

Governance is sold on references. **3–5 named lighthouse partners in ONE regulated vertical** is worth
more than any ad spend — and it's how we battle-test the surface for real. *(Working artifact — the
ICP scorecard, target tracker, outreach templates, offer/agreement outline, and the
land→prove→publish checklist — lives in
[Actrone_Lighthouse_Outreach_Playbook.md](./Actrone_Lighthouse_Outreach_Playbook.md).)*

**ICP (ideal lighthouse):**
- Regulated or regulation-adjacent (fintech, health, or public sector — pick ONE and go deep).
- Has a *real, blocked* agent project — the objection killing it is egress / audit / compliance
  (exactly what we answer), not model quality.
- A technical champion + a security/compliance stakeholder (both must exist for governance to land).
- Willing to be a **named reference** in exchange for hands-on partnership + influence on roadmap.

**Sourcing:** warm intros from the OSS community first (developers already inside these orgs) →
founder network → targeted outreach to the *blocked-project* pattern. Avoid cold enterprise
prospecting before OSS gives you a warm path in.

**The offer (deliberately generous — this is a proof investment, not a revenue line yet):**
- White-glove deployment (self-hosted / BYOC), direct-to-engineering support channel.
- Roadmap influence + early access to the demoable moats.
- Discounted / deferred pricing in exchange for a **named case study with real numbers** and a
  reference call right.

**Success criteria (what "lighthouse succeeded" means):**
- Deployed and running **governed, production** agents (not a POC that stalled).
- A published artifact: the zero-egress reference *or* the savings-dividend invoice *or* a security
  review passed with Actrone as the answer.
- A reference logo + a quotable outcome.
- Battle-testing feedback that hardens the launch surface.

**The motion:** land 1 → prove 1 → publish 1 → use it to warm the next 2. Do not scale the sales
motion until you have one repeatable, referenceable win.

---

## 9. What NOT to do (the guardrails)

- **Don't lead with breadth.** "Memory + orchestration + governance + multi-agent + compliance +
  voice + translation + marketplace" is a category-confusion machine. One front door; the rest is
  proof shown after interest.
- **Don't launch the marketplace or no-code before demand density.** A marketplace with no demand
  side is a liability; no-code dilutes the developer-trust message you're building.
- **Don't sell voice as shipped.** Most *demoable* (the interpreter), least *proven* on a live call.
  Demo to win attention; pilot before you promise.
- **Don't lead with the freshly-re-platformed auth as a governance claim** until it's pen-tested.
- **Don't buy paid ads for a trust product first.** Governance buyers trust peers + proof, not
  banners. Content + references + OSS + design partners are the ROI; paid amplifies *after* proof.
- **Don't run enterprise sales before OSS density.** Warm intros from inside accounts beat cold
  6–9-month cycles every time at seed stage.

---

## 10. The one-sentence strategy

> **Land with free, framework-agnostic memory; get *known* by making governance publicly provable
> (the audit trail, the interpreter, the savings invoice, the pen-test, the zero-egress reference);
> expand through one regulated-vertical reference and OSS-warm intros inside accounts — and say
> "governance-first for production AI agents" so consistently, with so much visible proof, that the
> market files us under it before the surface area can confuse them.**

Sequencing, one line: **instrument → OSS + DX → adjacency → product-led launch → content/category →
lighthouse reference → procurement rails → governed-interop rails.** We built the platform in roughly
this order; now we *reveal and distribute* it in this order too.

---

_Companion docs: [Positioning & Competitive Moats](./Actrone_Positioning_And_Competitive_Moats.md) ·
[Product Review & Financial Model](./Actrone_Product_Review_and_Financial_Model.md). Re-baseline
every target in §6 against real funnel data the moment launch numbers exist._
