# Actrone — Pitch Deck Draft (honest)

*Fundraise for the **hosted governed platform** (the revenue product). The OSS memory libraries appear only as
the go-to-market **wedge** — free, top-of-funnel developer adoption — never as the thing being funded.*

> **Stance:** grounded in what Actrone actually is **today** — a near-code-complete, production-grade platform
> that is **pre-launch and pre-revenue**. No fabricated traction, customers, revenue, or benchmark wins. Where
> only the founder holds the real figure (raise size, team, design partners), it is marked **[you fill in]** —
> a deck that invents traction is the fastest way to fail diligence.
>
> **Raise scope (read this first):** the money funds the **hosted platform** — its deployment, GTM, compliance
> audits, and team. The OSS is referenced *only* as the acquisition channel that feeds it. Every slide keeps the
> platform as the hero; OSS is the wedge, not the product being financed.
>
> **How to use:** Part A is the slide-ready deck (headline + 3–4 bullets per slide). Part B is the appendix of
> numbers you must supply before showing it. You raise on the **platform vision** (governed agent OS) and show
> the **wedge** (OSS memory) — so Problem/Solution are the platform; GTM is the OSS-first motion into it.
>
> Companion docs: `Actrone_Positioning_And_Competitive_Moats.md`, `Actrone_Governed_Action_Layer_Strategy.md`,
> `Actrone_Phased_Launch_GTM_Plan.md`, `Actrone_Marketing_Strategy_OSS.md`.

---

## Part A — Slide-ready deck

### 0. Title

**Actrone — the governed operating system for enterprise AI agents.**
Agents that take real actions in real systems, with full governance, audit, and rollback.

*[you fill in]: founder name, one line on team, contact, date.*

---

### 1. The Problem

**Enterprises want agents that *do things* — but can't trust an agent with write-access.**

- Agents that take actions have no accountability layer: no provenance, approval, audit, or rollback.
- The tooling splits into halves that don't add up: workflow tools (Zapier, n8n) aren't intelligent; agent
  frameworks (LangChain, CrewAI) have no governance; connector platforms (Merge, Finch) move data, not actions.
- So enterprise agents stay stuck in read-only / demo purgatory. **The blocker isn't intelligence — it's trust.**

*Honest note: this is a well-reasoned thesis about where the market is going, not a pain yet validated by
paying customers. Validating it is what the raise buys.*

---

### 2. The Solution

**A kernel that governs every action an agent takes.**

- Provenance + purpose-binding, simulate-then-commit, policy/approval gates, SAGA rollback, signed audit ledger.
- Around it: no-code builder, PII-aware memory, multi-region data residency, self-hosting, live SOC2/ISO
  evidence engine, voice, marketplace, TS + Python SDKs.
- **The differentiator is the *governed action layer*** — trustworthy action, not "smarter AI." **This is the
  product being funded.**
- **Top-of-funnel wedge (open source):** local-first, framework-agnostic, PII-aware memory (TS + Python) — free
  developer adoption that converts into the hosted platform (one-import upgrade). The channel, not the product.

*Honest note: the platform is ~code-complete but not yet deployed at scale or in front of a real customer —
architecturally proven, market-unproven.*

---

### 3. Market Opportunity

**Sits at the intersection of enterprise automation, RPA, and the fast-growing AI-agent-platform market.**

- Bottom-up is the honest lens: enterprises deploying agents × the value of governing those actions
  (audit, compliance, risk reduction).
- The *"governed agent action layer"* category doesn't fully exist yet — the opportunity (first-mover,
  category creation) **and** the risk (educating a market on a need it hasn't named).

*[you fill in]: a properly sourced 2026 TAM/SAM/SOM. Precise-but-fake numbers are worse than honest ranges.*

---

### 4. Traction — *the honest slide*

**No revenue, no users, no customers yet. Pre-launch. Here's what's actually real:**

- An unusually complete, production-grade platform for the stage: governance kernel, multi-region residency,
  compliance evidence engine, memory, voice, marketplace, two SDKs, a CLI.
- OSS memory libraries **ready to ship** as the adoption wedge.
- Most pre-seed decks show a prototype; Actrone has a near-complete system — that de-risks **execution**.
- Positioning: *"We have product, not proof — and a credible plan to get proof."*

*[you fill in]: any design partners, waitlist, alpha users, advisors, inbound. If none yet, say so plainly.*

---

### 5. Business Model

**Free OSS wedge → usage-based hosted platform → enterprise license.**

- OSS memory libs: free (adoption, not revenue).
- Hosted platform: subscription tiers + usage (task runs, routing spend) + BYOK fee — metering/billing spine
  is built (Stripe-integrated).
- Enterprise: self-hosting license + DPA/BAA automation + support.

*Honest note: pricing is designed but unvalidated — no customer has confirmed willingness-to-pay; zero revenue
has flowed through the (working) billing plumbing.*

---

### 6. Competitors

**No single incumbent owns the governed-action layer — that's the bet.**

| Lane | Players | Why they're not this |
|---|---|---|
| Workflow / iPaaS | Zapier, n8n, Make | Not agentic, not governed |
| Connectors | Merge, Finch | Move data, don't govern actions |
| Agent frameworks | LangChain, CrewAI, LlamaIndex | Dev tools; no governance/ops/compliance |
| Memory (OSS lane) | Mem0, Zep, Letta, Cognee | We differ on local-first + PII-awareness + framework-agnostic, **not** "best recall" |
| Gateways | Portkey | Routing, not action governance |
| Voice agents | Vapi, Retell | Vertical, not a governed platform |

*Honest note: a small/solo team vs funded specialists in every lane. The moat is that none own governance-of-
action — but any could move toward it, and "no one does this" also means demand is unproven.*

---

### 7. GTM Strategy

**OSS-first, developer-led, bottoms-up → governed platform → enterprise.**

- Now: launch OSS memory libs (X, LinkedIn, Show HN, Product Hunt, Discord). Local-first / no-API-key is the
  differentiator — and specifically the **Africa** unlock.
- Land: developers adopt free memory → convert to hosted governed memory (one-import upgrade).
- About Q1 2027: the hosted launch with pack 1 (voice agents, Actronauts on phone, desktop and browser, computer use, governed actions, cross-company actions, data residency and self-hosting), then the marketplace in pack 2.
- Wave 1 markets: the United States, Canada, the United Kingdom, Ireland, the Netherlands and South Africa; Germany, France, Spain, Italy, the Nordics, Australia and Kenya follow in wave 2.

*Honest note — say it out loud: distribution is the whole risk. Engineering is largely done; adoption is
unproven and solo-founder distribution is hard. This raise is a bet on fixing distribution, not the product.*

---

### 8. Use of Funds

**Because the core is built, the money is for the actual gaps — not to build the platform.**

- Go-to-market / distribution (the real risk): dev-rel, content, community, early sales.
- Deployment + SRE: coded but not yet run at production scale.
- Compliance: the evidence engine is built; the actual SOC2/ISO **audits** cost real money.
- Team: first GTM + infra/eng hires.
- Security: independent pen-test + audit before enterprise deals.

*[you fill in]: the percentage split and the runway it buys.*

---

### 9. The Ask

**[you fill in the number] — raising $X (pre-seed/seed) for N months of runway to hit adoption milestones.**

Because revenue is unproven, tie the ask to milestones, not a revenue projection:

- OSS launched + **[N]** developer adopters / installs / stars,
- **[M]** paying design partners on the hosted platform,
- SOC2 Type I underway,
- first **$[Y]** committed revenue.

*Honest note: milestones should be adoption-based at this stage; don't anchor to a revenue forecast you can't
yet defend.*

---

## Part B — Numbers you must supply before showing this

| Slide | What only you can provide |
|---|---|
| 0 · Title | Founder name, team one-liner, contact |
| 3 · Market | Sourced 2026 TAM/SAM/SOM (top-down + bottom-up) |
| 4 · Traction | Design partners / waitlist / alpha users / advisors (even if zero) |
| 5 · Model | Real target pricing per tier |
| 8 · Use of funds | Allocation % + runway |
| 9 · The Ask | Raise amount, stage, milestone targets (N, M, $Y) |

**Do-not-say list (keeps diligence clean):** no invented customers/revenue/LOIs; no "beats Mem0/Zep/Letta" on
recall (no published head-to-head); no claiming the platform is live/at-scale (it is coded, not deployed); no
precise market figures without a real source.

---

## Part C — Delivery & format (how VCs actually consume a deck)

**The deliverable is a PDF. PowerPoint is how you *build* it, not how you *send* it. A web artifact is not the
deck.** Getting this wrong reads as inexperience to an investor.

- **Deliver as PDF.** "Send me your deck" almost always means a PDF: it renders identically on any device,
  forwards cleanly to partners, reads offline, and can be marked up. A raw `.pptx` breaks on a different
  machine (missing fonts, wrong version); a PDF never does. Target **16:9, ~10–12 slides, a few MB**.
- **Author in whatever you're fastest in** — PowerPoint, Google Slides, Keynote, Pitch, or Figma. The VC never
  sees the source file, only the exported PDF, so the tool choice is purely about your editing speed + design
  control. (Slides = collaboration; Pitch/Figma = design polish; all export clean PDF.)
- **Send via DocSend** (or Papermark / a Pitch link), not a raw email attachment — standard VC practice. You
  get view analytics (who opened it, which slides they lingered on), version control, and revocable access.
  The underlying file is still a PDF.
- **The web artifact ≠ the deck.** It's fine as a *supplement* — a "living" one-pager on the site, or the
  Actrone OSS **product demo** link — but investors don't review a fundraising deck as an interactive webpage.
- **Keep the editable master** for live meetings (screen-share) and quick updates; outbound is always the PDF.

**The one-line rule:** Build in PowerPoint / Slides / Pitch ✅ · Deliver as PDF via DocSend ✅ · Artifact ❌ for
the deck (✅ only for the product demo).

### Production options for this deck

1. **Real editable `.pptx`** *(recommended for a fundraise)* — a `python-pptx` script generates a brand-locked
   (Black & Apple-Silver, Geist, sentence-case) PowerPoint from Part A, with the **[you fill in]** numbers as
   clearly-marked placeholders. You get an editable master **and** a clean PDF export.
2. **Premium HTML slide deck** (16:9, print-to-PDF) — most on-brand visually, but less editable; good for a
   polished static PDF, weaker for ongoing edits.

Recommendation: **#1** — a fundraise needs editability + a reliable PDF export, and the `.pptx` gives both.

---

*Draft v1.2 — honest by construction; raises for the **hosted platform**, OSS is the wedge. Fill Part B, build
per Part C (→ PDF, delivered via DocSend), then this is show-ready. A brand-locked product-demo artifact is a
supplement, not the deck.*
