# Actrone — Ad Campaign: Creative Platform & Media Plan

> Part of the strategy set: [Distribution & GTM](./Actrone_Distribution_And_GTM_Strategy.md) (rollout
> §5b) · [Marketing — OSS](./Actrone_Marketing_Strategy_OSS.md) · [Marketing — Hosted](./Actrone_Marketing_Strategy_Hosted.md)
> · [Positioning & Moats](./Actrone_Positioning_And_Competitive_Moats.md) · brand: `docs/branding.md` +
> `docs/design prompt.md`.
>
> **Scope:** the creative platform, messaging matrix, on-brand art direction, concrete ad concepts, and
> the phased media plan across OSS (Wave 0) and hosted (Wave 1+). **Governing principle: this is a
> trust category — paid ads *amplify proof*, they do not manufacture it.** Never lead paid before the
> proof artifacts exist.
>
> _Last updated: 2026-07-12 · Owner: Matt_
>
> **2026-07-12 update (Additions wave).** Creative-relevant deltas: the **per-geo data-law frameworks**
> now back the B2 zero-egress ad's compliance line (GDPR/EU · CCPA/US · PIPEDA/Canada · POPIA→NDPA/
> Africa) — usable as a proof pointer, but **only as "mapped/ready," never "certified"** (§7 guardrail
> extended below). **Governed two-way channel chat** is a new, honest proof artifact (a governed agent
> answering in Slack/WhatsApp) if a future concept wants it. The **SEO pass** improves organic landing
> quality for paid-retargeting destinations. No new *claimable* pillar otherwise; the honesty rails are
> unchanged (no live-call voice, no "we cut your bill N%," no "certified").

---

## 0. The rule that shapes everything

Governance buyers (and skeptical developers) trust **peers and proof, not banners.** So:
- **Organic + product-led first, paid second.** Paid retargets people who touched a proof artifact
  (the interpreter demo, the benchmark, the trust center) — it doesn't cold-sell governance.
- **Every ad points to a *proof*, not a promise** — a demo, a benchmark, a reference, the trust center.
- **On-brand or it doesn't ship.** The monochrome restraint is a *differentiator* in a gradient-soaked
  AI-ad landscape. Discipline is the creative edge.

---

## 1. The campaign platform (the big idea)

> # Autonomy you can prove.

**Why this line.** It resolves the category's core tension in three words: everyone sells *capability*
("look what the agent can do"); the enterprise blocker is *accountability* ("prove it's safe"). It
evolves the shipped homepage hero ("Autonomy you can put in production"), it's true to the code (every
action clears deterministic policy + a signed audit trail **before it runs**), and it spans both
audiences — a developer *and* a CISO both want autonomy they can prove.

**The proof-line underneath it (the brand's existing, sharpest weapon):**
> **Most frameworks build a demo. None of them pass a security review. Yours will.**

**Supporting owned phrases (already established — reuse verbatim):** *"Proofs, not logs." · "Everyone
else helps you build, connect, or route agents. Actrone is where they run." · "Zero-egress agents." ·
"Prototype in CrewAI, deploy on Actrone."*

**Category noun — lock it:** *"the governed control plane for AI agents — self-hosted, any
model."* (Fix the homepage's "governed runtime" to match before spend — one noun everywhere.)

---

## 2. Two tracks, one platform

Same big idea, split creative for the two-speed engine (never blend them in a single unit):

| | **Track A — Developer (Wave 0, global)** | **Track B — Buyer (Wave 1+, geo-phased)** |
| --- | --- | --- |
| **Audience** | framework devs, agent builders | platform / security / compliance / eng-leadership |
| **Tagline** | **"Memory in three lines. Governance in one more."** | **"The agent runtime that passes the security review."** |
| **Hook** | free, fast, framework-agnostic, no lock-in | zero-egress, tamper-evident audit, governed action |
| **Hero proof** | 3-line zero-service quickstart + Mem0/Zep benchmark | the interpreter demo · the audit-trail demo · the trust center |
| **CTA** | `npm i actrone-memory` / `create-actrone-app` | "watch the 60-second demo" / "read the trust center" |
| **Channels** | dev communities, X/HN/newsletters, YouTube, GitHub | LinkedIn, retargeting, ABM, webinars, Marketplace |

---

## 3. Art direction (locked brand — brief the creative team on this exactly)

**Palette — Black & Apple-Silver, monochrome. Colour is a status vector, never decoration.**
- Canvas: pure black `#000000` (marketing), near-black surfaces `#111111` / `#0a0a0a` for section
  alternation. Depth = **1px borders `#262629`**, never shadows or gradients (shadows only on true
  floating overlays).
- Text/accent ramp: primary `#F5F5F7` (Alabaster White), body `#A1A1AA`, meta `#71717A`. **The "accent"
  is silver/white, not a chroma colour** — the highlighted word in a headline is silver-on-black.
- **Chroma is reserved for status only:** `#EF4444` red = **errors/danger ONLY** (great for the
  "ungoverned" side of a before/after), `#22C55E` success/pass, `#3B82F6` info/links. **No red CTAs,
  no gradients, no chroma brand accents.**

**Typography:** **Geist** (sans + mono) exclusively. Weights **400 / 500 / 600 only** (never 700/800).
**Sentence case everywhere — no ALL CAPS, no Title Case.** Big claim = Geist 600; body = Geist 400;
code/terminal = Geist Mono.

**Iconography:** `lucide-react`, `strokeWidth 1.5`, monochrome. Provider marks via monochrome
simple-icons paths in the silver ramp. **No emoji.**

**Motion & signature effects (the ownable visual system — already built in the marketing app):** reuse
the **Cognitive Grid** (hero mouse-grid), **Beam Scan** (one-shot init sweep), **Terminal Typewriter**
(cycling mono line), **Agent Trace Visualiser** (reasoning chain), **Governance Score Ring** (drawing
compliance dial), **Magnetic CTA** — as the recognizable identity across OG images, paid social, and
video. **Data never animates** (instant, "production-real"); everything honours `prefers-reduced-motion`.
2–3% SVG noise on marketing canvas only.

**The look in one line:** *premium, restrained, monochrome, terminal-adjacent — Vercel/Linear/Apple
seriousness, not a gradient-blob AI ad.* The restraint is the differentiation.

---

## 4. Concrete ad concepts (ready to produce)

**A1 · Developer — the quickstart flex** *(Track A)*
- **Visual:** black canvas, a Geist-Mono terminal, Terminal-Typewriter types 3 lines → an audit trail
  materializes below.
- **Headline:** *Memory in three lines. Governance in one more.*
- **Sub:** *Free, framework-agnostic, no lock-in. `npm i actrone-memory`.*
- **Format/where:** short video / GIF — X, dev newsletters, YouTube pre-roll.

**A2 · Developer — the honest benchmark** *(Track A)*
- **Visual:** a clean monochrome bar chart (silver bars), one bar where we *lose* left visible.
- **Headline:** *We benchmarked our memory against Mem0 and Zep. Here's where we win — and where we
  don't.*
- **Sub:** *Reproducible. Open. Because you'd check anyway.* → benchmark repo.
- **Why it works:** radical honesty = shareable + credible; no competitor runs this ad.

**B1 · Buyer — the villain/proof** *(Track B)*
- **Visual:** split panel. Left (red `#EF4444` hairline, "ungoverned"): a raw agent action. Right
  (silver, "governed"): the same action as a signed audit entry + a Governance Score Ring drawing to 98.
- **Headline:** *Most frameworks build a demo. None of them pass a security review.*
- **Sub:** *Autonomy you can prove. Every action clears policy and a signed audit trail before it runs.*
- **Format/where:** LinkedIn, retargeting, OG image.

**B2 · Buyer — zero-egress** *(Track B, EU/Africa lead)*
- **Visual:** a boundary line; data tokens (`PII_HIGH_…`) stop at the border; nothing crosses.
- **Headline:** *Run agents on regulated data. Without it ever leaving your boundary.*
- **Sub:** *Zero-egress. Self-hosted. GDPR · POPIA · NDPA · CCPA ready.* → zero-egress reference
  architecture. *("Ready," never "certified" — §7.)*

**B3 · Buyer — the interpreter (the 60-second hero)** *(Track B, all geos)*
- **Visual:** a live call; names/account numbers tokenize before translation, brand terms stay locked,
  the agent answers in its own voice in another language — all on one governed trace.
- **Headline:** *A real-time interpreter that never sends a name to a third party.*
- **Sub:** *PII-safe, glossary-locked, in your agent's own voice. No one else can do this.*
- **Format:** the flagship 60s film — the single most shareable asset; anchor of the hosted launch.

**B4 · Buyer — consolidation ROI** *(Track B, economic buyer)*
- **Visual:** five faded competitor-category boxes collapsing into one silver Actrone box.
- **Headline:** *Replace five vendors. Pass the security review. Ship in three lines.*
- **Sub:** *Memory, gateway, guardrails, audit, orchestration — one governed control plane.*

> **Do NOT produce (yet):** any ad claiming live-call voice at scale, "we cut your bill N%," or
> "SOC 2 certified." Honesty guardrails, §7.

---

## 5. Media plan & budget logic (proof-gated)

| Wave | Months | Emphasis | Paid role | Spend posture |
| --- | --- | --- | --- | --- |
| **W0 — OSS** | 1–4 | organic: HN/PH/Reddit/X/newsletters/DevRel; the benchmark + quickstart | minimal — retarget benchmark/quickstart visitors only | **mostly $0 paid**; invest in content + DevRel |
| **W1 — Hosted** | 5+ | proof artifacts + webinars + ABM into the wave 1 markets (US, Canada, UK, Ireland, Netherlands, South Africa) | LinkedIn + retargeting *after* the interpreter demo + trust center are live | modest, proof-gated; ABM to lighthouse look-alikes |
| **W2** | 8 to 11 | extend to the wave 2 markets (Germany, France, Spain, Italy, Nordics, Australia, New Zealand, Kenya) once W1 proves | same, region-tuned | scale only where W1 CAC/quality proved out |
| **W3** | 11 to 17 | the wave 3 markets (Nigeria, Ghana, rest of EU, Brazil, India, UAE, Saudi Arabia), then demand-pulled | follow the OSS funnel | no speculative geo spend |

**Budget rule:** paid spend is unlocked *per artifact*, not per calendar — no paid push behind a claim
that has no proof asset. Reallocate to whatever the funnel (GTM §6) shows converting.

---

## 6. Launch-moment calendar (tied to the rollout)

- **Month 1:** build the assets (benchmark, `create-actrone-app`, the 5 proof artifacts, the interpreter
  film). No ads yet.
- **Month 2 (OSS launch moment #1):** Show HN / Product Hunt / X — A1 + A2 organic, tiny retargeting.
- **Months 3–4:** DevRel + content cadence; grow the warm base in every geo.
- **Month 5 (hosted launch in the wave 1 markets):** B3 interpreter film as the hero + B1/B2/B4 by geo;
  webinars; ABM; Marketplace listing; first case study if a lighthouse is ready.
- **Months 8 to 11 (wave 2 markets):** re-run the proven W1 creative, region-tuned and translated.
- **Ongoing:** each new proof artifact (a published reference, the pen-test, a savings invoice) is a
  paid-amplification moment.

---

## 7. Honesty guardrails for creative (non-negotiable)

- **Demo only what survives production.** The interpreter *demo* is fine; a *live-call-at-scale promise*
  is not. Voice is deploy-gated; the WorkOS auth is freshly re-platformed — neither is an ad claim yet.
- **Cost/savings language:** *"we bill only a share of savings we can prove — capped, excess credited,"*
  never *"we'll cut your bill N%."* The flywheels idle until traffic; the dividend defaults to 0.
- **Compliance:** *"SOC 2 Type II in progress,"* *"GDPR/HIPAA/POPIA/NDPA/PIPEDA/CCPA ready,"* never
  *"certified"* or *"compliant"* as a bare claim. The data-law frameworks are **mapped + enforced**
  controls pending legal sign-off per jurisdiction — an ad may say "ready," not "compliant."
- **No fabricated testimonials or logos** (already a coded brand rule) — proof strip shows only
  verifiable signals until real references exist.
- **One category noun; sentence case; monochrome; no gradients.** Off-brand creative is off-message.

---

## 8. Measurement

- **Track A:** ad → quickstart/benchmark visit → install (retargeting audience quality, not vanity CTR).
- **Track B:** ad → proof-artifact view (interpreter/trust center) → demo request / MQL → security-review
  entry. Optimize to **proof-artifact engagement + MQL quality**, not impressions.
- **The only ad metric that matters:** does it move someone *toward a proof*? If an ad doesn't route to
  a demo, benchmark, reference, or the trust center, kill it.

---

## 9. The one line

> **"Autonomy you can prove." — a monochrome, restraint-as-differentiation campaign that never sells a
> promise, only routes to proof: the developer sees memory in three lines and an honest benchmark; the
> buyer sees the interpreter, the audit trail, and the security review they'll actually pass — launched
> organically with the OSS wedge, then amplified with paid, geo by geo, exactly as fast as the proof
> accumulates.**
