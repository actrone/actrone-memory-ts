# Actrone — Lighthouse-Partner Outreach Playbook (working doc)

> A **working, fill-in-and-execute** companion to
> [Actrone_Distribution_And_GTM_Strategy.md](./Actrone_Distribution_And_GTM_Strategy.md) §8. That doc
> has the *framework*; this one has the *artifacts you use tomorrow* — the ICP scorecard, the target
> tracker, the actual outreach copy, the offer/agreement outline, and the land→prove→publish checklist.
>
> Governance is sold on references. The goal is **3–5 named lighthouse partners in ONE regulated
> vertical**, deployed and running *governed production* agents, each yielding a publishable proof
> artifact. Land 1 → prove 1 → publish 1 → warm the next 2. Do **not** scale a sales motion before
> one repeatable, referenceable win.
>
> _Last updated: 2026-07-10 · Owner: Matt_

---

## 1. Pick the ONE vertical first

Do not spread across verticals. Choose one where the *blocked-project* pattern is strongest and you
have the warmest path in. Decide and write it here:

- **Chosen vertical:** `[ fintech | health | public sector | ______ ]`
- **Why (the specific regulation/objection that kills their agent projects):** `__________`
- **Our sharpest proof for it (zero-egress arch / audit trail / DPA-BAA / residency):** `__________`

---

## 2. ICP scorecard (qualify before you spend time)

Score each candidate 0–2 per row. **≥8/10 and no zero on a "must" row = pursue.**

| Criterion | 0 | 1 | 2 | Must? |
| --- | --- | --- | --- | --- |
| **Blocked agent project** — a real initiative stalled on egress/audit/compliance | no project | exploring | live, blocked on *our* objection | ✅ must |
| **Technical champion** — an engineer who will deploy + advocate | none | interested | identified + engaged | ✅ must |
| **Security/compliance stakeholder** — the buyer governance actually lands with | none | exists | engaged | ✅ must |
| **Regulated / regulation-adjacent** | no | somewhat | core to their business | |
| **Reference-willing** — will be named + do a reference call | refuses | maybe | yes, in writing | |
| **Warm path in** (OSS user inside / network intro) | cold | loose | strong warm intro | |

> A candidate that's excited but has **no security stakeholder** is a POC that will stall — governance
> only lands when the compliance buyer is in the room. Disqualify politely.

---

## 3. Target tracker (fill in — aim for 20+ sourced to land 3–5)

| # | Org | Vertical fit | Champion (role) | Sec/compliance contact | Blocked project | Warm path | ICP score | Stage | Next action + date |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | | /10 | Sourced | |
| 2 | | | | | | | /10 | Sourced | |
| 3 | | | | | | | /10 | Sourced | |
| … | | | | | | | | | |

**Stages:** Sourced → Contacted → Discovery → Deploying (self-host) → Governed-in-prod → Published → Reference.

**Sourcing order (warmest first):**
1. **OSS-community warm intros** — developers already using `actrone-memory` *inside* target orgs
   (query your install telemetry + GitHub stargazers/issues for company domains).
2. **Founder + investor network** — direct intros to a champion or a security leader.
3. **Targeted outreach to the blocked-project pattern** — only after 1–2 are exhausted. Never cold
   enterprise prospecting at this stage.

---

## 4. Outreach copy (steal + tailor)

Keep it short, specific, and proof-led. Lead with *their* objection, not our features. Always attach
one proof artifact (the interpreter demo or the zero-egress reference — see GTM §3).

### 4a. Warm intro request (to a mutual connection)

> Subject: quick intro to `[name]` at `[org]`?
>
> Hi `[connector]` — we built Actrone, a governance-first control plane for running AI agents in
> production (self-hosted, zero third-party egress, one audit trail across everything an agent does).
> It's aimed exactly at teams whose agent projects stall on compliance/data-egress. I think `[org]`
> hits that wall — would you be open to intro'ing me to `[champion]`? Happy to send a 60-second demo
> you can forward. No hard sell; we're looking for a small number of design partners to go deep with.

### 4b. Cold / direct to a technical champion

> Subject: running agents on `[regulated data]` without it leaving your VPC
>
> Hi `[name]` — saw `[trigger: their OSS use / a talk / a job post for agent work]`. Most teams trying
> to put AI agents into production on regulated data hit the same wall: you can't send it to a
> third-party model, and you can't prove what the agent did. Actrone is built for exactly that —
> self-hosted, zero-egress, with a tamper-evident audit trail across memory, tools, models, and
> agents. Here's a 60-second demo: `[link]`.
>
> We're taking on a few design partners in `[vertical]` — white-glove deployment, direct line to our
> eng, roadmap influence — in exchange for candid feedback and (if it works) a reference. Worth a
> 20-minute call to see if your `[blocked project]` is a fit?

### 4c. To the security / compliance stakeholder (after the champion is warm)

> Subject: the audit + data-residency story for `[org]`'s agent project
>
> Hi `[name]` — `[champion]` and I are exploring running agents for `[use case]`. Because it touches
> `[regulated data]`, I wanted to get you the governance details early rather than late: Actrone runs
> in your boundary (nothing egresses to a third-party model), tokenises PII at the model edge, and
> produces a signed, tamper-evident audit trail + self-serve compliance evidence (DPA/BAA per tenant,
> SOC 2 in progress). Reference architecture + our SECURITY.md + trust center here: `[links]`. Happy
> to walk your team through a security review whenever suits.

### 4d. Follow-up (no reply, 1 nudge only)

> Subject: re: `[thread]`
>
> Quick nudge, `[name]` — no worries if the timing's off. If it's useful, this 2-page reference shows
> exactly how `[peer-type org]` would run this self-hosted with zero egress: `[link]`. I'll leave it
> there unless you'd like to dig in.

---

## 5. The offer (what a lighthouse gets — deliberately generous; this is a proof investment)

| We give | They give |
| --- | --- |
| White-glove deployment (self-host / BYOC) + a direct-to-eng support channel | Hands-on partnership + candid feedback that hardens the surface |
| Roadmap influence + early access to the demoable moats (interpreter, savings) | A **named case study with real numbers** |
| Discounted / deferred pricing for the partnership term | A **reference-call right** + logo use |
| A joint publishable artifact (zero-egress reference *or* savings invoice) | A security review passed with Actrone as the answer |

**Design-partner agreement — outline the terms up front (keep it 1–2 pages):**
- Scope + success criteria (see §6) and the partnership term (e.g. 3–6 months).
- Pricing for the term + what it converts to after.
- **Reference + logo + case-study rights** (the whole point — get this in writing early).
- Data handling: reaffirm zero-egress / self-host; who touches what; the audit posture.
- Support SLA for the term + the direct channel.
- Mutual out clause. *(Route the actual contract through legal — this is the business outline, not the paper.)*

---

## 6. Land → prove → publish checklist (per partner)

- [ ] **Qualified** — ICP ≥8/10, security stakeholder engaged, reference intent confirmed verbally.
- [ ] **Agreement signed** — success criteria + reference/case-study rights in writing.
- [ ] **Deployed** — running self-hosted / BYOC (not a stalled POC).
- [ ] **Governed in production** — real agents doing real work, audit trail + governance *in use*.
- [ ] **A proof artifact produced** — one of: zero-egress reference · savings-dividend invoice ·
      passed security review with Actrone as the answer.
- [ ] **Published** — case study with real numbers + a reference logo + a quotable outcome.
- [ ] **Fed back** — battle-testing findings logged and used to harden the launch surface.
- [ ] **Leveraged** — used this win to warm the next 2 targets.

**"Lighthouse succeeded" = deployed + governed-in-prod + one published artifact + a reference logo.**
Anything short of a published, referenceable outcome is a POC, not a lighthouse.

---

_Companion: [Distribution & GTM Strategy](./Actrone_Distribution_And_GTM_Strategy.md) ·
[Content Calendar](./Actrone_Content_Calendar.md) ·
[Positioning & Moats](./Actrone_Positioning_And_Competitive_Moats.md)._
