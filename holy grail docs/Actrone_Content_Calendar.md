# Actrone — Content Calendar (working doc)

> A **working, fill-in-and-execute** companion to
> [Actrone_Distribution_And_GTM_Strategy.md](./Actrone_Distribution_And_GTM_Strategy.md) §7. That doc
> has the *spine*; this one has the *editorial artifacts* — the pillar briefs, a 12-week tracker you
> update, a per-piece distribution checklist, and a repeatable weekly template.
>
> **Purpose:** own the category vocabulary (*production AI agents · AgentOps · governed action layer ·
> zero-egress agents*) and let governance buyers self-educate before they ever talk to us. Every piece
> is opinionated and grounded in a *built* capability + a proof artifact — never a generic AI think-piece.
>
> _Last updated: 2026-07-12 · Owner: Matt_
>
> **2026-07-12 update (Additions wave).** Two content-relevant deltas: (1) an **SEO / category-
> vocabulary + structured-data pass** shipped — the pillar keywords below now have on-page support, so
> lean into the category vocabulary harder; (2) **per-geo data-law frameworks** (GDPR/CCPA/PIPEDA/
> POPIA/NDPA/GPA) unlock a **regional compliance-explainer content angle** per launch market (added to
> P2/P3 + the tracker below) — **but every such piece must say "mapped + enforced," not "certified,"**
> until legal signs off (honesty gate, rule 4). Governed two-way channel chat is a valid new demo
> artifact. **Correction (verified 2026-07-13): `create-actrone-app` (`v0.1.0`) and the Mem0/Zep
> benchmark harness referenced in P5 now EXIST in-repo** — the residual is publishing `create-actrone-app`
> to npm and *running + publishing* the benchmark with real numbers, not building them. Cite benchmark
> figures only once they've actually been run and published.

---

## 1. The rules (so the calendar stays on-message)

1. **Every piece maps to the front door** ("governance-first control plane for production AI agents")
   and advances **one pillar**. If it doesn't, it doesn't ship.
2. **Every piece carries one proof artifact** (GTM §3: audit-trail demo · interpreter demo ·
   savings invoice · zero-egress reference · trust center) and **one CTA** (usually: try the OSS memory
   quickstart, or watch the interpreter demo).
3. **Cadence: 1 pillar advance + 1 tactical piece per week.** Consistency beats volume.
4. **Honesty gate:** demo/claim only what survives production. Interpreter + audit trail are safe now;
   **do not publish "voice on live calls" or lead with the new auth as a governance claim** until each
   is piloted / pen-tested (Product Review §2.2). **Data-law content says "mapped + enforced," never
   "certified/compliant"** until counsel clears that jurisdiction.
5. **One piece, many surfaces** (see §4 distribution checklist). Write once, distribute five ways.

---

## 2. Pillar briefs (the evergreen backbone — each becomes a hub page + a sales artifact)

### P1 — "What breaks when agents hit production"
- **Angle:** the canonical map of the problem we solve — egress, audit, cost drift, tool misuse, PII,
  multi-agent chaos. Not fear-mongering; a practitioner's checklist of failure modes.
- **Primary keyword:** *production AI agents* · **Secondary:** *AI agent failures / AgentOps*
- **Proof artifact:** audit-trail demo · **CTA:** the governance checklist (P2 lead magnet)
- **Sales use:** the discovery-call framing doc.

### P2 — The governance checklist for production agents
- **Angle:** a scored, self-serve checklist ("is your agent safe to run on real data?") that doubles
  as a lead magnet and a security-review artifact.
- **Keyword:** *AI agent governance checklist* · **Proof:** trust center · **CTA:** gated download / signup
- **Sales use:** hand to a prospect's security team.

### P3 — Zero-egress agents
- **Angle:** the reference architecture + why "send it to our cloud" structurally fails regulated
  buyers (Innovator's Dilemma for incumbents).
- **Keyword:** *zero-egress agents / self-hosted AI agents* · **Proof:** zero-egress reference arch
- **CTA:** the reference architecture + self-host quickstart · **Sales use:** enterprise security review.
- **Regional data-law sub-series (one per launch geo, high-intent SEO):** *"Governed AI agents under
  GDPR / CCPA / PIPEDA + Quebec Law 25 / POPIA / NDPA 2023"* — each maps the law to the controls we
  enforce (residency, DPA automation, right-to-erasure, audit). Africa (POPIA/NDPA) is the
  least-contested keyword and the differentiated bet. **Honesty: "mapped + enforced," not "certified."**

### P4 — AgentOps / the governed action layer (the category thesis)
- **Angle:** name the category. Everyone helps you *build/connect/route* agents; the missing layer is
  *governed action* — provenance, purpose-binding, simulate-then-commit, reversible writes, signed ledger.
- **Keyword:** *AgentOps / governed action layer* · **Proof:** audit trail + governed-connector sim
- **CTA:** the positioning explainer · **Sales use:** the "why us vs a gateway/guardrail" doc.

### P5 — Open-source memory deep-dives (the developer wedge's home)
- **Angle:** benchmarks vs Mem0/Zep, budget-aware retrieval internals, framework adapters, the 5-min
  quickstart. Pure developer value, no lock-in.
- **Keyword:** *open source AI agent memory / LangGraph memory* · **Proof:** benchmark numbers
- **CTA:** `create-actrone-app` / quickstart · **Sales use:** top-of-funnel, developer trust.

---

## 3. 12-week editorial tracker (update weekly)

Status: 🔲 idea → ✍️ drafting → 👀 review → ✅ published. Fill owner + date.

| Wk | Pillar piece (advances a pillar) | Tactical / timely piece | Proof artifact | Owner | Target date | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | P1 hub page — "What breaks when agents hit production" | Interpreter demo launch post | interpreter demo | | | 🔲 |
| 2 | P1 — deep-dive: the egress + audit failure modes | "Governed vs ungoverned agent" side-by-side | audit-trail demo | | | 🔲 |
| 3 | P5 — memory vs Mem0/Zep benchmark | 5-minute quickstart walkthrough | benchmark numbers | | | 🔲 |
| 4 | P5 — budget-aware retrieval internals | `create-actrone-app` announcement | quickstart | | | 🔲 |
| 5 | P2 — the governance checklist (lead magnet) | Audit-trail demo post | trust center | | | 🔲 |
| 6 | P2 — how to pass an AI security review | Post-mortem of a public *ungoverned* agent failure | audit-trail demo | | | 🔲 |
| 7 | P3 — zero-egress reference architecture | "Why your bank won't let agents touch data" | zero-egress arch | | | 🔲 |
| 8 | P3 — self-hosting deep-dive (BYOC) | Regional data-law explainer series (GDPR/CCPA/PIPEDA/POPIA/NDPA — "mapped, not certified") | zero-egress arch + trust center | | | 🔲 |
| 9 | P4 — the governed action layer thesis | MCP-governance explainer | governed-connector sim | | | 🔲 |
| 10 | P4 — A2A governed interop ("govern the other half") | "Guardrails are a feature, not a product" | audit trail | | | 🔲 |
| 11 | Case study draft (lighthouse #1) | Savings-dividend teaser | savings invoice | | | 🔲 |
| 12 | Case study published — real numbers | Recap + "what we learned in prod" | case study + pen-test | | | 🔲 |

> **Sequencing logic:** wedge/dev value early (P5) to feed the funnel → checklist/zero-egress (P2/P3)
> to arm the governance buyer → category thesis (P4) to own the vocabulary → **capstone: a real case
> study with real numbers** (the least-copyable asset, Product Review §8 item 2).

---

## 4. Per-piece distribution checklist (one piece, five surfaces)

For every piece, don't stop at "published on the blog":

- [ ] **Own channel** — blog/docs page, SEO-optimised for the pillar keyword, internal links to the hub.
- [ ] **Newsletters** — dev/infra newsletters + our own list.
- [ ] **Social** — X + LinkedIn thread with the proof GIF/video; founder voice, not brand voice.
- [ ] **Communities** — the relevant Discord/subreddit/framework forum (value-first, not a drop-and-run).
- [ ] **Repurpose** — the demo as a <60s video/GIF; the checklist as a gated PDF; the benchmark as a chart.
- [ ] **Sales enablement** — tag which sales moment this piece serves (discovery / security / closing).
- [ ] **Instrument** — UTM + a tracked CTA so it feeds the funnel metrics (GTM §6).

---

## 5. Repeatable weekly template (copy per week)

```
Week of: ____
North-star check (weekly governed tasks run): ____  (Δ vs last week: ____)

Pillar piece:
  Title:
  Pillar / keyword:
  Proof artifact + CTA:
  Owner / status / publish date:

Tactical piece:
  Title / angle (timely hook):
  Proof artifact + CTA:
  Owner / status / publish date:

Distribution done? [own] [newsletter] [social] [community] [repurpose] [UTM]
Result (after 2 wks): views ___ · signups attributed ___ · notable replies ___
```

---

## 6. Content → funnel loop (why this isn't just "blogging")

Content is the top of the two-speed engine (GTM §1): pillar pieces rank on the category vocabulary →
developers hit the OSS quickstart → the checklist/zero-egress pieces arm the governance buyer inside
the account → the case study closes trust. **Instrument every CTA** so you can see which pillar
actually drives installs → signups → first governed task → paid, and double down on it. You can't
optimize content you didn't attribute.

---

_Companion: [Distribution & GTM Strategy](./Actrone_Distribution_And_GTM_Strategy.md) ·
[Lighthouse Outreach Playbook](./Actrone_Lighthouse_Outreach_Playbook.md) ·
[Positioning & Moats](./Actrone_Positioning_And_Competitive_Moats.md)._
