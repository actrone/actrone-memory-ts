# Actrone — Honest Product Review, Positioning & Illustrative Financial Model

> **Status of this document.** The product review is grounded in what is actually in the
> repository (tiers, pricing, governance/memory/orchestration features). The financial section is an
> **illustrative, assumption-driven model — not a forecast, not a guarantee, and not advice.** Every
> number is a planning scenario; real outcomes depend on execution, market, and pricing decisions you
> have not yet locked. Treat the model as a spreadsheet to argue with, not a prediction.
>
> _Last updated: 2026-07-12 · Owner: Matt_
>
> **2026-07-12 refresh (the "Additions" wave).** A **26-item Additions Plan**
> ([`Actrone_Additions_Implementation_Plan.md`](./Actrone_Additions_Implementation_Plan.md)) shipped
> 2026-07-11→12 — complete, wired, tested, PG16-validated (build clean; all touched Go packages +
> control-tower + marketing + CLI green). **Crucially, this wave was different in *character* from the
> 2026-07 voice/translation/WAF/auth wave: it added almost no net-new product pillars and instead built
> the exact non-code / go-to-market machinery §8 said to invest in** — (1) **data-law compliance
> frameworks** for the first-wave geos (GDPR/EU · CCPA-CPRA/US · PIPEDA+Quebec-Law-25/Canada ·
> POPIA→NDPA-2023→Ghana-GPA/Africa), off one shared GDPR-shaped engine — *legal sign-off still pending
> per jurisdiction*; (2) **feature packs** — the coded env-aware enforcement primitive that makes the
> "freeze the surface, market first-important-features-only" recommendation *actually enforceable*;
> (3) **platform-wide bad/fine/good feedback + a health score** (funnel instrumentation); (4) an
> **SEO/category-vocabulary** pass; (5) **one-click flagship EMAOP templates** + an MCP catalog
> expansion (24→29 servers, 10 categories) for time-to-value; and DX/premium-craft polish (docs AI
> drawer, BYOK/Managed wizard, CLI remediation hints, agent-transparency drawer, skeleton loading).
> The one genuine new *capability* is **two-way channel chat** (agents now conversationally reachable
> via governed inbound Telegram/WhatsApp), a natural extension of the existing channels layer, not a
> new pillar. **Net effect on the thesis: unchanged and reinforced — this is the good kind of wave
> (proof/distribution/focus-enabling), but the binding constraint is still identical: turn it on,
> prove one thing in production, and battle-test it. Everything here is dormant/opt-in like the rest,
> and the data-law surface is a *legal* assertion that must clear counsel before it carries a customer
> claim.** Sections 2.2, 3.1–3.2, 7 and 8 fold it in below; the financial model (§5) is untouched and
> still illustrative.
>
> **2026-07-10 refresh.** Re-reviewed after a large second wave of build (2026-06-29 → 07-10):
> the auth layer was fully re-platformed off Clerk to **WorkOS headless (managed) + generic OIDC
> (self-host)** with custom-UI **MFA, passkeys, and Google/Microsoft/GitHub/Apple social**; the
> **voice stack went from "interfaces only" to end-to-end** (open STT/TTS/realtime registries, a
> governed **real-time audio bridge**, and a novel **governed real-time translation engine**); the
> **model layer** gained Grok 4.5, a **no-deploy managed-model DB catalog + drift check**, and open
> transcriber/synth/realtime plug-ins; an in-cluster **Coraza (OWASP CRS) WAF** landed; and the
> Cycle-9 sweep closed ~29 "built-but-unwired / partial" gaps (connector OAuth refresh, cross-org
> fabric initiation, edge-connector tunnel, TS/Node harness builds, region routing, Certification-P4
> ISMS scaffolding, Teams/Telegram/WhatsApp inbound, self-hosting P0–P2, …). **The core thesis is
> unchanged and, if anything, reinforced: engineering is not the risk — focus, proof, distribution,
> and battle-testing are — and the surface just got bigger, which makes that risk sharper, not
> softer.** Sections 2.2, 3.1–3.2, 7 and 8 are updated below; the financial model (§5) is untouched
> and still illustrative.

---

## 1. What Actrone actually is (one paragraph)

Actrone is a **self-hosted-capable, governance-first platform for production AI agents**. It bundles
four things that are usually bought separately: (1) an **open-source memory layer** (`actrone-memory`,
MIT — Redis L1 + Qdrant L2, budget-aware retrieval, framework adapters), (2) a **durable orchestrator**
(model routing, a tool-call supervisor, streaming, REST/gRPC), (3) a **governance & compliance spine**
(PII tokenisation at the model boundary, pre-execution policy blocks, human escalation, a
tamper-evident audit ledger, MediaGuard media-PII scanning, and a live certification/trust engine),
and (4) **multi-agent coordination** (intra-org mesh + cross-org agent-to-agent). The wedge is
**memory** (free, viral, developer-loved); the money is **governance + orchestration** (what
regulated and scaling teams pay to keep agents safe in production).

---

## 2. Honest product review

> **Revision note (2026-06-29).** This section was substantially corrected after a **complete sweep
> of all ~35 plan docs and every repo** (orchestrator Go core, `actrone-memory`, the Go/Python/TS
> SDKs + CLI, frontend, infra). My first pass — based only on the pricing page + entitlements — got
> two things materially wrong: it called the moats "mostly integration + switching" (false: the
> technology/data/economic moats are real **and largely built**), and it framed maturity as a
> "shipped vs enforced gap" (the platform is **near code-complete across P1–P7 + compliance + the
> cost/quality flywheels**, dormant/opt-in by default). The honest picture is stronger on product and
> the risk has shifted almost entirely to **distribution, focus, operational turn-up, and
> battle-testing** — see §7–§9.

### 2.1 What is genuinely strong

- **The bundle is the product.** Individually, memory, routing, and guardrails each have credible
  competitors. *Together, self-hosted, with one audit trail across all of them,* is rare. A buyer
  who wants "agents that are safe to run on regulated data, without sending it to a third party"
  has very few one-vendor answers.
- **Zero-egress / self-hostable governance is a real, defensible stance.** MAL tokenisation,
  in-cluster MediaGuard (no managed OCR/PII API), BYOK, and data-residency pinning are not cosmetic —
  they answer the exact objection that kills agent projects in banks, health, and the public sector.
- **Compliance is built as product, not paperwork.** A live evidence engine, signed/tamper-evident
  audit exports, per-tenant DPA/BAA automation, and a public trust centre turn "are you compliant?"
  from a sales-cycle landmine into a self-serve answer. This is a genuine differentiator versus
  framework-first competitors.
- **Open-source memory is the right wedge.** It is the piece developers adopt for *their own_
  reasons (cost, latency, framework-agnostic), with no switching cost — which is exactly what makes
  it a top-of-funnel engine rather than a feature.
- **Engineering discipline is visibly high.** Fail-closed defaults, deterministic verdicts,
  GetVersion-gated workflow changes, honest CI/GPU-gated verification boundaries. This shows up as
  reliability, which is the thing infra buyers actually renew on.

### 2.2 What is weak or unproven (the honest part — corrected)

The weaknesses are now almost entirely **go-to-market and operational**, not product:

- **Positioning sprawl is the #1 risk.** This is a genuinely large platform (60+ orchestrator
  packages: memory, gateway, governance, eval, optimizer, distill, semcache, a2a/macp, build/vcs,
  compliance, billing…). All of it real — but "memory + orchestration + governance + multi-agent +
  compliance + cost-flywheel + marketplace" cannot be said in one breath. **The market will file you
  under one category; you must pick the front door** and let the rest be "and it also…".
- **Battle-testing vs. breadth (the meta-risk of a fast-built platform).** An enormous surface was
  built quickly and much of it is **dormant/opt-in and not yet exercised under real production load
  or adversarial security testing.** "It compiles and unit-tests pass" ≠ "it survives a hostile
  tenant at scale." Breadth without depth is a real risk; the fix is to harden the wedge, not ship
  all 60 packages' worth of surface on day one.
- **The surface grew *again* — voice, translation, and a whole auth re-platform (2026-07 wave).**
  This is the sharpest form of the breadth risk. The newest work is genuinely strong (governed
  real-time translation is arguably the most *demoable* differentiator in the whole platform), but it
  widens the "what is this product?" problem the doc already names as the #1 risk. Every impressive
  new pillar — a speech-to-speech voice stack, an interpreter engine, an in-cluster WAF, a full
  identity swap — is another thing the market has to file you under. **The discipline to build was
  never in question; the discipline to *stop building and start proving* is now the binding
  constraint.**
- **The 2026-07-12 "Additions" wave is the *right kind* of wave — but the freeze still hasn't
  happened.** Unlike the voice/translation/auth wave, this 26-item wave added almost no net-new
  pillars and instead built the go-to-market machinery §8 asks for: **feature packs** (the coded
  primitive that finally lets you *enforce* the freeze — market a launch surface, keep the rest
  dormant), **data-law frameworks** for the exact launch geos, **funnel feedback instrumentation**,
  an **SEO** pass, **one-click templates** + a wider integration catalog for time-to-value, and DX
  polish. That is genuinely closer to "prove + distribute" than "build more surface." The honest
  read, though, is that it is *still building* — the team keeps shipping instead of freezing and
  running a production pilot. Some of this wave directly *serves* the go-to-market (good); none of it
  changes the fact that **the next unit of proof is worth more than the next unit of code, and no
  production pilot has yet been run.** Treat the Additions wave as having *sharpened the tools for the
  freeze* — not as the freeze itself.
- **Real-time voice + translation are unproven where it's hardest to fake: production.** The code is
  built, seam-tested, and governance-correct (allowlisted tools, tool-calls through the supervisor,
  PII-tokenised translation, barge-in). But "survives a real phone call at carrier scale — jitter,
  packet loss, DTMF, latency budgets, echo, accented STT, TTS prosody, a hostile caller" is
  **entirely unvalidated.** Voice is the surface where the gap between "unit tests pass" and "it
  works on a live call" is widest, and the deploy notes honestly flag the LiveKit adapter + the
  Twilio WS-upgrade route + carrier turn-up as remaining. Treat voice as a *strategic bet needing a
  real-world pilot*, not a shipped feature.
- **Auth was re-platformed recently — a maturity win, but security-critical and fresh.** Moving off
  Clerk to WorkOS-managed + self-host OIDC (with custom-UI MFA/passkeys/social) removes a lock-in,
  makes the identity story vendor-neutral and enterprise-credible, and is the *right* call. But it is
  a large, recent rip-and-replace of the single most security-sensitive layer; it deserves the same
  pen-test + battle-testing rigour before it carries regulated-tenant traffic. (Passkeys also depend
  on WorkOS AuthKit for the WebAuthn ceremony — one honest seam that isn't fully custom-UI.)
- **Operational turn-up, not engineering, is the gate.** P7 billing is code-complete but
  **dormant** (needs `00062`/`00063` applied + Stripe catalog + `ENABLED`→`ENFORCED`); P6-A/C
  infra is built as charts/Terraform but **the cluster apply hasn't been run**; SOC 2 needs the
  org/auditor observation window. None of this is "build more" — it's "turn it on and prove it."
- **COGS is not pure-SaaS — but the monetization model already answers this.** Token pass-through
  caps blended GM ~55–68% *on the usage line*, but the strategy prices a **routing dividend** (margin
  on governed spend you provably reduce), a **marketplace take-rate (~95% GM)**, BYOK governance
  fees, and ≥60% subscription mix — which lifts blended margin well above what I first modeled.
- **Enterprise sales is still an unrun motion.** The *product* for enterprise exists (BYOC/self-host,
  SOC2/HIPAA, signed-ledger exports); the *sales machine* (CSMs, security questionnaires, 6–9-month
  cycles) is the unproven part. Mitigated by OSS-led bottoms-up landing inside accounts first.
- **Category is hot and crowded** (LangChain/LangSmith, CrewAI, Temporal, Mem0/Zep, Portkey/LiteLLM,
  Lakera/Credal, OpenAI AgentKit). Your defense is the parts they *structurally* can't copy (zero-
  egress, model-neutral, the outcome-gated flywheels) — but you still have to out-distribute them.

### 2.3 The one-line verdict (revised)

**An unusually complete, well-engineered governed control plane for AI agents — with real,
already-built technology and data moats (the distillation + governance-correction flywheels, the
outcome-gated optimizer, and now a genuinely novel governed real-time interpreter) that most
seed-stage companies only have on a slide.** The technology risk is low; **the entire risk is
distribution, focus, turn-up, and battle-testing** — and the 2026-07 wave (voice, translation, auth
re-platform, WAF) *added* capability while making the focus problem harder. That is still a much
better problem than most companies have — but the update to the verdict is a warning, not a
celebration: **the next unit of engineering has lower marginal value than the next unit of proof.
The right move is to freeze the surface and go prove one thing in production.**

---

## 3. USPs, moats & competitive advantages

### 3.1 Unique selling propositions (what only Actrone says cleanly)

| USP | Why it matters | Who else says it |
| --- | --- | --- |
| **Governed agents with zero third-party egress** | Run agents on regulated/sensitive data without it ever leaving the tenant boundary | Few; most agent frameworks assume managed APIs |
| **One audit trail across memory + tools + models + agents** | "Prove what every agent did and what we did about it" in one queryable, tamper-evident ledger | Guardrail point-tools cover slices, not the whole path |
| **Compliance as a live product** | Self-serve evidence, signed exports, per-tenant DPA/BAA, public trust centre — plus **data-law frameworks mapped to the exact launch geos** (GDPR/EU · CCPA-CPRA/US · PIPEDA+Quebec-Law-25/Canada · POPIA→NDPA-2023→Ghana-GPA/Africa) off one shared engine | Most competitors hand you a PDF and a promise; none ship an Africa-first (POPIA/NDPA) data-law surface |
| **Governed agents reachable where your team already works** | Two-way conversational chat over Telegram/WhatsApp where every inbound turn still runs the full MAL→policy→audit pipeline under the linked user's permissions | Channel bots exist everywhere; a *governed* one (RBAC-scoped, PII-tokenised, audited, idempotent) does not |
| **Free, framework-agnostic memory that you can self-host forever** | Adopt with zero lock-in; works with LangChain/LangGraph/CrewAI | Mem0/Zep (but tied to their stack/cloud) |
| **No-code governance + multi-agent for non-experts** | Policy/coordination without writing a framework | Frameworks assume you are an engineer |
| **Governed real-time interpreter (PII-safe, glossary-enforced, brand-voice, sovereign)** | Live phone/meeting translation where sensitive data is tokenised before it reaches any translator, brand/product terms are locked, the agent keeps its own voice in every language, and it can run self-hosted for regulated buyers | gpt-realtime-translate / Gemini / Seamless mimic the caller and offer no glossary/PII governance and are SaaS-only |
| **Bring-your-own-everything, including identity** | Any model (BYOK/BYOM), any STT/TTS/realtime engine (open registries), any IdP (WorkOS-managed or self-host OIDC) — no forced vendor at any layer | Most stacks lock you to their model, their voice vendor, and their auth |

### 3.2 Moats (corrected — these are technology/data/economic moats, and they are *built*)

My first pass said "moats are mostly integration + switching." That was wrong. Verified in code:

1. **The distillation flywheel — a per-tenant data + cost moat (BUILT: `internal/distill/`).**
   `dataset.go · eligibility.go · distill.go · promotion.go · serving.go · resolver.go · failover.go`.
   Accepted governed traces → a tenant-scoped, PII-scrubbed training set → a distilled small model →
   eval-gated → shadow → promoted → served cheap with frontier fallback → re-distilled on drift. It
   **compounds with usage**, is **per-tenant and proprietary**, and a stateless gateway has no
   governed-outcome stream to copy it. *This is the keystone tech moat I earlier said you lacked —
   and it dissolves the zero-egress-vs-data tension because it never pools across tenants.*
2. **The governance-correction flywheel (BUILT: `internal/governance/feedback_loop.go` +
   `finetune_validator.go` + `ab_router.go`).** Every correction grows a per-tenant dataset →
   models better at *their* policy → a competitor would rebuild it from scratch. Compounds with tenure.
3. **The outcome-gated closed-loop optimizer (BUILT: `internal/eval/` {groundedness, judge, gate,
   breaker} + `internal/optimizer/` {cascade, predictive, budgeter} + `internal/floors/` +
   `internal/savings/`).** Cost is captured **only as the residual after quality/groundedness/
   security floors are provably met on governed traces.** A stateless cost gateway (Portkey/LiteLLM/
   OpenRouter) optimizes one call with no outcome signal — **structurally unable to replicate this.**
4. **Supply-chain / builder-of-record provenance (BUILT: `internal/build`, `buildflow`, `bundle`,
   `codeintake`, `registry`, `vcs*`).** Every hosted agent image carries SLSA provenance + cosign
   signing; VCS-connected deploy can **cryptographically prove which commit is running and that it
   passed governance.** Hard to fake, valuable to auditors.
5. **The zero-egress governance spine (BUILT: `mal`, `dpe`, `trust`, `audit`, `mediaguard`,
   `netguard`, `residency`, `regionresolve`).** MAL tokenisation, 3-tier DPE pre-execution blocks,
   Ed25519 inter-agent trust, Merkle-anchored tamper-evident audit, in-cluster media-PII scanning,
   no-direct-China data-residency posture. **Incumbents can't follow without breaking their
   send-it-to-our-cloud model** (Innovator's Dilemma).
6. **A2A governed control plane (BUILT: `internal/a2a/` incl. `provenance.go` + `macp/`).** The open
   A2A protocol standardizes *how* agents delegate but says nothing about security/tenancy/cost/
   provenance — "Actrone governs the other half." The **same control plane pointed at agents instead
   of tools.** Owning the *governed* interop layer is a protocol-moat opportunity.
7. **The savings-backed routing dividend (BUILT: `internal/savings/` + billing reconciliation
   `00063`).** You charge a share of **demonstrated, auditable** net savings, capped at measured
   savings, excess auto-credited. "We only make money when we provably save you money" — an
   incentive-aligned pricing moat and a trust weapon.
8. **Governed real-time translation — a product moat that is demoable on day one (BUILT:
   `internal/voice/translate.go` + the s2s bridge `bridge.go`).** The order is the moat: glossary
   pre-mask → PII tokenise → translate → detokenise → glossary restore, so the translation model
   sees **neither the brand terms nor the sensitive data**, numbers survive byte-exact, and the
   agent keeps its own multilingual voice. Pluggable (governed text-pipeline *or* low-latency s2s)
   and self-hostable (Seamless/vLLM) for sovereign buyers. **Unlike the flywheel moats, this one does
   NOT need production traffic to be impressive — it demos in 60 seconds**, which makes it the single
   most *marketable* moat in the platform even while the compounding moats are still latent.
9. **Switching cost + certification posture + OSS community** (my original three) — still real, still
   compounding with tenure; now a layer on top of the technology + product moats above, not the
   whole story.

> **Honest caveat (unchanged):** these moats are *built* but **latent** — the flywheels need
> production traffic to spin and the optimizer needs governed outcomes to gate on. So the work is
> *usage + proof*, not invention. You already did the hard engineering; the moats switch on with
> adoption.

### 3.3 Competitive map (where you win / lose)

- **vs. LangChain/LangGraph + LangSmith:** you win on governance, compliance, and self-hosting;
  you lose on ecosystem size and mindshare. *Strategy: be adapter-friendly, not a rival framework.*
- **vs. CrewAI/AutoGen:** you win on production durability + governance; they win on quick
  multi-agent prototyping. *Strategy: "graduate your prototype to production."*
- **vs. Mem0/Zep (memory):** you win on framework-agnostic + self-host + no lock-in + it being a
  funnel into a bigger platform; they win on focus/maturity. *Strategy: make memory the best
  free option, full stop.*
- **vs. Portkey/LiteLLM (gateway/routing):** you win on the governance/audit wrap; they win on
  breadth of model coverage and simplicity. *Strategy: routing is table-stakes, governance is the
  reason.*
- **vs. Lakera/Guardrails/Credal (governance):** you win on being the *whole* runtime, not a filter;
  they win on focus. *Strategy: "guardrails are a feature of a platform, not a product."*
- **vs. OpenAI AgentKit / hyperscaler agents:** you win on neutrality (any model), self-hosting,
  and zero-egress; you lose on default distribution. *Strategy: the independent, governed, BYO-model
  choice for teams who can't or won't be single-vendor.*

---

## 4. Why each tier earns its money

### 4.1 Core — Open Source (MIT, free, self-hosted)

**Not monetised directly — it is the funnel and the credibility.**

- **Who:** individual developers, OSS projects, teams evaluating, cost/latency-sensitive builders.
- **Why they use it:** best-in-class two-tier memory (Redis L1 + Qdrant L2), budget-aware 4-phase
  retrieval, auto-summarisation, drop-in LangChain/LangGraph/CrewAI adapters, Python + Go SDKs, MIT
  with no usage restrictions. **Zero lock-in is the feature.**
- **Business role:** top-of-funnel, developer trust, ecosystem standardisation, hiring magnet.
  Conversion to hosted happens when "I need this in production, governed, without operating it."

### 4.2 Pro — Hosted, pay-as-you-go (per task + per token)

**The "graduate to production" tier. Convenience + reliability.**

- **Who:** solo devs and small teams shipping a real product who don't want to run a durable
  orchestrator, Redis, and Qdrant themselves.
- **Why they pay:** managed durable orchestrator, model routing (5 strategies), tool-call
  supervisor, spend caps + per-tool rate limits, WebSocket streaming, Control Tower UI, REST/gRPC,
  managed memory (5 GB vectors), email support. Plus `cost_budgets`, `coordination_graph`,
  `api_high_rate`, `data_export`, `mal` (basic tokenisation), `dpe_tier1` (hard blocks).
- **The pay trigger:** "I don't want to operate this, and I want spend control + basic safety."
  Pay-as-you-go removes the commitment objection; usage grows the bill naturally.

### 4.3 Scale — From $499/mo (the revenue centre of gravity)

**The "we're a real team with real risk" tier. Governance + multi-agent + cost control.**

- **Who:** growing teams, scale-ups, mid-market — anyone whose agents now touch customer data or
  spend real money.
- **Why they pay:** the full **AI Governance Engine** (all rule types, advanced DPE with threshold +
  human escalation, rules workbench), **GDPR/HIPAA/FSCA policy packs**, PII scanner + hallucination
  scorer, **tamper-evident violation ledger + signed PDF export**, **MACP multi-agent coordination**
  (3 patterns) + shared memory namespaces + provenance graph, **A2A gateway + MCP Hub**, team seats
  (25), unlimited agents, 90-day retention, BYOK, region pinning, staging environment, enterprise +
  custom connectors, dedicated Slack, 99.9% SLA.
- **The pay trigger:** *fear and scale.* One PII leak, one runaway spend, or one "prove this to our
  auditor" makes $499–$1,500/mo trivially worth it. This is where price < cost-of-an-incident.

### 4.4 Enterprise — Annual contract, custom

**The "regulated, at scale, on our terms" tier. Trust, deployment, and support.**

- **Who:** banks, insurers, health systems, the public sector, large enterprises with security &
  procurement.
- **Why they pay:** private cloud / on-prem / air-gapped (`single_tenant`), **SOC 2 Type II report**,
  HIPAA, **SSO**, custom governance policy packs, SIEM forwarding (Splunk/Datadog/Sentinel),
  scoped regulator/auditor export, EU/restricted region pinning, executed DPA/BAA on file, extended
  retention (365d+), private MCP/A2A catalog, dedicated CSM, 99.99% SLA, priority roadmap.
- **The pay trigger:** *they literally cannot deploy agents without these controls.* Procurement,
  security, and legal are the buyers; the platform is the only way to get to "yes." ACV is
  5–6 figures because the alternative is "no agents at all."

### 4.5 Why developers adopt the open-source memory (the funnel engine)

Developers don't adopt OSS because it ladders to your paid tiers — they adopt it because it solves
*their_ problem better than the alternative. Make these true and adoption follows:

1. **It's genuinely the best free memory.** Two-tier (hot Redis + vector Qdrant), budget-aware
   retrieval that respects token windows, auto-summarisation on overflow — better defaults than
   rolling your own.
2. **Zero lock-in, MIT, self-host forever.** No "open core that's useless without the cloud." This
   is what earns trust and GitHub stars.
3. **Framework-agnostic adapters.** Works with LangChain, LangGraph, CrewAI today; the more
   adapters, the more "just use actrone-memory" becomes the default line in tutorials.
4. **Python, Go, AND TypeScript (`@actrone/sdk`) — three first-class SDKs, real docs.**
   Five-minute install to working memory. TS matters disproportionately: the largest share of
   agent developers live in the JS/TS ecosystem (Vercel AI SDK, Mastra, Next.js), so the TS SDK
   roughly _doubles your addressable top-of-funnel_ versus a Python-only release.
5. **A clean upgrade path that is never coercive.** "When you need it governed and managed in
   production, the same memory is one of the hosted tiers." Adoption first, monetisation never
   forced.
6. **Community surface:** GitHub Discussions, responsive maintainers, public roadmap. Developers
   reward projects that treat them as the product, not the lead.

> **The growth flywheel:** OSS memory adoption → developers hit production governance needs →
> hosted Pro → team risk/scale → Scale → regulated scale → Enterprise. Every paid tier is the same
> users, later, with more at stake.

---

## 5. Illustrative financial model (base case)

> **Read this first.** These are **planning scenarios, not forecasts.** They assume a near-term
> launch (billing flipped on), an OSS-led funnel, and disciplined spend. Inputs are explicit so you
> can change them. Currency: USD.

### 5.1 Core assumptions

| Driver | Assumption (base case) | Note |
| --- | --- | --- |
| Pro ARPA | **$90 / mo** blended (pay-as-you-go) | grows with usage; small teams |
| Scale ARPA | **$900 / mo** blended | $499 entry + usage/larger teams |
| Enterprise ARPA | **$5,000 / mo** ($60k ACV) | modest early enterprise deals |
| Monthly logo churn | Pro 6% · Scale 3% · Enterprise 1.5% | customer counts below are **net** |
| Blended gross margin | **~60%** (Y1) → **~63%** (Y2) | token pass-through + vector/compute COGS |
| Usage/metered revenue | ~25–30% on top of subscription | tokens + memory storage, thin margin |
| Headcount | 2–3 (Y1) → 8–10 (Y2) | founder-led, lean |

### 5.2 Year 1 — monthly (base case)

Net paying customers at month end, and end-of-month MRR = Pro·$90 + Scale·$900 + Ent·$5,000.

| Month | Pro | Scale | Ent | MRR ($) | Monthly subs rev ($) |
| ---: | ---: | ---: | ---: | ---: | ---: |
| M1 | 5 | 0 | 0 | 450 | 450 |
| M2 | 9 | 1 | 0 | 1,710 | 1,710 |
| M3 | 14 | 2 | 0 | 3,060 | 3,060 |
| M4 | 20 | 3 | 0 | 4,500 | 4,500 |
| M5 | 27 | 5 | 1 | 11,930 | 11,930 |
| M6 | 35 | 7 | 1 | 14,450 | 14,450 |
| M7 | 45 | 10 | 1 | 18,050 | 18,050 |
| M8 | 56 | 13 | 2 | 26,740 | 26,740 |
| M9 | 68 | 16 | 2 | 30,520 | 30,520 |
| M10 | 82 | 20 | 3 | 40,380 | 40,380 |
| M11 | 96 | 25 | 3 | 46,140 | 46,140 |
| M12 | 112 | 30 | 4 | 57,080 | 57,080 |

- **Exit MRR (M12): ~$57k → ARR ~$685k.**
- **Y1 subscription revenue (sum): ~$255k.** Add ~$95k usage/metered ⇒ **~$350k total Y1 revenue.**

### 5.3 Year 1 — quarterly (base case)

| Quarter | Exit MRR ($) | Subs revenue ($) | + Usage ($) | Total revenue ($) |
| --- | ---: | ---: | ---: | ---: |
| Q1 (M1–3) | 3,060 | 5,220 | 1,500 | 6,720 |
| Q2 (M4–6) | 14,450 | 30,880 | 9,000 | 39,880 |
| Q3 (M7–9) | 30,520 | 75,310 | 22,000 | 97,310 |
| Q4 (M10–12) | 57,080 | 143,600 | 62,500 | 206,100 |
| **Y1 total** | **57,080** | **255,010** | **95,000** | **~350,010** |

### 5.4 Two-year annual P&L (base case)

| Line | Year 1 | Year 2 |
| --- | ---: | ---: |
| **Revenue — subscription** | 255,000 | 1,380,000 |
| **Revenue — usage/metered** | 95,000 | 420,000 |
| **Total revenue** | **350,000** | **1,800,000** |
| COGS (infra + token pass-through + support) | (140,000) | (666,000) |
| **Gross profit** | **210,000** | **1,134,000** |
| _Gross margin_ | _60%_ | _63%_ |
| OpEx — Engineering & product | (260,000) | (700,000) |
| OpEx — Sales & marketing / DevRel | (70,000) | (350,000) |
| OpEx — G&A (legal, SOC 2 audit, tooling) | (90,000) | (200,000) |
| **Total OpEx** | **(420,000)** | **(1,250,000)** |
| **EBITDA / operating result** | **(210,000)** | **(116,000)** |
| Exit ARR | ~685,000 | ~2,240,000 |

- **Year 2 exit:** Pro ~350, Scale ~95, Enterprise ~14 customers → **M24 MRR ~$187k → ARR ~$2.24M.**
- **Cumulative 2-year burn (base): ~$325k** before any financing — i.e. a **$0.75M–$1.5M
  pre-seed/seed** comfortably funds the path to a near-breakeven Year-2 exit with buffer.

### 5.5 Scenario bookends (Year-2 exit ARR)

| Scenario | What changes | Y2 exit ARR | 2-yr cumulative result |
| --- | --- | ---: | --- |
| **Conservative** | slower conversion, higher churn, ~half the enterprise logos | ~$1.0–1.2M | burn ~$0.5–0.7M |
| **Base** | the model above | ~$2.2M | burn ~$0.3M, near-breakeven exit |
| **Optimistic** | OSS funnel compounds, 2× enterprise, NRR >115% | ~$4–5M | EBITDA-positive in H2 Y2 |

### 5.6 Unit economics (base case, sanity check)

| Tier | ARPA | Gross profit/mo | Monthly churn | ~LTV | ~CAC | LTV/CAC | Payback |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pro | $90 | ~$54 | 6% | ~$900 | $150–300 | 3–6× | 3–5 mo |
| Scale | $900 | ~$585 | 3% | ~$19k | $3–5k | 4–6× | 6–9 mo |
| Enterprise | $5,000 | ~$3,500 | 1.5% | ~$230k | $15–25k | 9–15× | 5–7 mo |

- **Target net revenue retention:** 105–120% (usage + tier upgrades expand existing accounts).
- **The economics work** if and only if (a) OSS keeps CAC low for Pro, and (b) Scale/Enterprise
  retention holds — both are the things to instrument from day one.

### 5.7 What would break the model (watch these)

1. **OSS funnel doesn't convert** → CAC rises, Pro stalls, the whole flywheel slows. *Mitigation:
   relentless OSS quality + a frictionless hosted upgrade.*
2. **Gross margin compression from token pass-through** → if Pro skews token-heavy with thin margin,
   gross profit lags revenue. *Mitigation: push managed memory + Scale subscription mix; price usage
   with a real margin.*
3. **Enterprise cycle length** → 6–9 month sales delay cash that the model books earlier.
   *Mitigation: don't fund OpEx on un-closed enterprise pipeline.*
4. **Churn underestimate on Pro** → self-serve dev tools often churn >6%. *Mitigation: activation +
   "aha" within the first session; spend-cap value visible immediately.*
5. **Category consolidation** → an incumbent ships "good enough" governance free. *Mitigation:
   compound the moats (audit history, certifications, community) faster than they can copy surface.*

---

## 6. Bottom line

- **Product:** real, well-engineered, and differentiated on the one axis that matters most for
  *production* agents — **governance + self-hosting + compliance, with a free memory wedge.** The
  weakness is focus and the time it takes for moats to compound.
- **Tiers:** logically laddered — free adoption → managed convenience → governance/scale →
  regulated enterprise. Each tier's pay-trigger is distinct and credible (convenience → risk →
  procurement-mandate).
- **OSS memory:** the right growth engine *if_ it stays genuinely best-in-class and lock-in-free.
- **Financially:** a lean, OSS-led seed-stage path to **~$0.7M ARR by end of Y1 and ~$2.2M ARR by
  end of Y2 (base case)**, fundable with a **~$1M raise**, near-breakeven at Y2 exit — *contingent on
  OSS conversion and Scale/Enterprise retention, which are the two metrics to obsess over.*

> Reminder: §5 is an **illustrative model**, not a forecast. Re-run it with your own conversion,
> churn, and pricing data the moment you have real launch numbers.

---

## 7. Capability inventory — what's actually built (verified deep sweep, refreshed 2026-07-10)

Verified against the codebase, not the marketing copy. Authoritative status: [Platform Evolution
Master Plan §0a](./Actrone_Platform_Evolution_Master_Plan.md) + [progress.md](../progress.md). The
headline: **P1–P7 + the model layer + compliance + the cost/quality flywheels are code-complete, and
the 2026-07 wave closed the last big "partial" rows — voice is now end-to-end, MediaGuard ML is
built, the SDKs consolidated to TS+Python, auth re-platformed to WorkOS, residency routing is wired,
and governed translation + an in-cluster WAF are new.** The open work remains *cluster rollout +
Stripe turn-up + carrier/voice pilot + market validation + battle-testing* — not core engineering.

> **Precision corrections from the 2026-07-10 deep code sweep (four-agent, code-grounded).** These
> sharpen the honest picture — read them before quoting any capability to a customer or investor:
>
> - **The cost/quality flywheels are BUILT but IDLING — this is the single biggest optimism-vs-code
>   gap.** `semcache` runs shadow/measure-only, the optimizer `cascade` is behind `cfg.CostOpt.Cascade`
>   (flag-off), and `distill` is *inert* without a fine-tune-provider key (`TOGETHER_API_KEY`) — it
>   literally logs `distillation_flywheel.inert`. So any *"we cut your costs N%"* claim is
>   **architecturally supported but not yet empirically demonstrated in-product.** Position the cost
>   moat as "built, proving out," never "delivering today."
> - **Billing ships OFF by default** (`billing.enabled=false`, `enforced=false`, `dividend_rate=0`).
>   Usage is recorded to a local ledger (feeds the dashboard) but nothing hits Stripe; entitlements
>   are visible but non-blocking. There is **no per-token markup in code** — managed tokens bill at
>   true provider rates, so *all* managed margin comes from the **savings-capped routing dividend**,
>   which defaults to 0. Honest consequence: if a customer pins a frontier model, runs hot prompts,
>   and skips cache/batch/cascade, demonstrated savings ≈ 0 → dividend ≈ 0 → **that revenue line
>   collapses.** The margin math is a plan, not an enforced floor. Subscription dollar figures
>   ($499/mo Scale, etc.) live only in the Stripe catalog + marketing page — not in code.
> - **Tiers = four in code** (`Core/Pro/Scale/Enterprise`, server-authoritative gates via the
>   entitlements `Enforcer`), not five. Free tier is a **1,000-governed-run/month HARD cap** (the
>   deliberate COGS firewall); Pro/Scale caps are soft (overage billed).
> - **OSS memory parity is nominal, not real.** Python `actrone-memory` (MIT) has **7 deep adapters**
>   (real LangChain/LangGraph/CrewAI/… integrations); TS `actrone-memory` (MIT) has 7 *structural*
>   adapters (prompt-formatting helpers, framework-as-types-only) — broad but shallow. TS's win is a
>   **zero-service default** (no Redis/Qdrant needed); Python needs both running (first-run friction).
>   And the **OSS lib** stores/retrieves *turns* — it lacks the extraction/consolidation/graph depth of
>   Mem0/Zep. **BUT the *hosted* engine does not:** `internal/memorydepth` already implements
>   Mem0/Zep-class extraction + temporal consolidation + conflict-resolution + provenance + governed
>   right-to-erasure — it's just **off by default (`cfg.CostOpt.MemoryDepth`) with an unclosed retrieval
>   loop** (`Ingest`/`Erase` exist, no `Retrieve`), i.e. a dormant write-only store, not an absent
>   capability. **Lead OSS marketing on governance + framework-agnostic + DX, not on "smarter memory";
>   the hosted "smarter memory" is a near-term turn-on, not a build** — full plan in
>   [Memory Strategy & Roadmap](./Actrone_Memory_Strategy_And_Roadmap.md).
> - **Two launch assets flagged as missing in earlier reviews now EXIST in-repo (verified 2026-07-13):**
>   `create-actrone-app` (a working `v0.1.0` scaffold CLI — "local-first agent-memory app, zero services,
>   no API key") and the **Mem0/Zep benchmark harness** (`actrone-memory-py/.../benchmark/`:
>   `compare.py · competitors.py · dataset.py · harness.py` + README). So the remaining work is
>   **publish + run + polish (npm publish, a public benchmark repo with real numbers), not build.** Don't
>   quote benchmark numbers until the harness has actually been run and published.
> - **The category noun is now LOCKED** (was in flux): _the governed control plane for AI agents —
>   governed, self-hosted, any model._ Applied across the live surfaces — homepage hero + `<title>`/
>   metadata + OG images (all three apps), positioning doc §0/§7, and docs/READMEs. "Governed OS /
>   runtime" is retained only as descriptive color, never the label. This closes the "category-confusion"
>   risk §2.2 named.
> - **What IS genuinely shipped + load-bearing (the truthful story):** the governance spine — MAL
>   tokenisation, 3-tier DPE, HMAC-chained audit, Ed25519 trust, and the Governed Action Layer
>   (simulate→commit→signed receipt→compensating rollback) — all run on the live runtime loop. *That*
>   is the defensible, demoable claim; sell it, and treat the flywheels/insurance/voice as "built,
>   proving out."
> - **The 2026-07-12 Additions wave (26 items) — what it did and did NOT change.** *Added, code-complete
>   + wired + tested:* **data-law frameworks** (GDPR/CCPA/PIPEDA/POPIA/NDPA/GPA off one shared
>   `compliance/catalog.go` engine, with `compliance_popia|ndpa|pipeda|ccpa` entitlements) — but these
>   are **legal assertions of controls we enforce, NOT certifications, and are unshipped until counsel
>   signs off per jurisdiction**; **feature packs** (env-aware `NEXT_PUBLIC_PACK_*` + a backend
>   `packguard` middleware, fail-safe-dark in prod) — the enforcement primitive for the freeze;
>   **two-way channel chat** (governed inbound Telegram/WhatsApp → agent turn, migration `00127`);
>   **platform feedback + health score** (migration `00126`); **Postgres LISTEN/NOTIFY** fleet refresh;
>   an **SEO/structured-data** pass; an **MCP catalog expansion** (24→29 servers, 7→10 categories:
>   +Asana/Confluence/Shopify/Zendesk/Intercom) with a `verified|first_party|community` trust tier; and
>   **4 one-click flagship EMAOP templates** (inbox-to-ticket, revops-followup, support-triage,
>   knowledge-answers). *Did NOT change:* billing is **still off by default**, the flywheels **still
>   idle**, voice **still needs a carrier pilot**, and the D1/D2 chat-strictness directive is
>   **native-agent scoped** (BYOF pods are still governed via harness + MAL + audit, not the in-kernel
>   loop). **Nothing here is proven in production; it is the same dormant-until-turned-on posture as the
>   rest of the platform.** OAuth-refresh for the OAuth2 MCP connectors is real (`mcphub/oauth.go`
>   `ExchangeRefresh`, RFC 6749 §6, refreshes 60s before expiry) — so the template connectors don't die
>   after ~1h.

| Layer | Built (repo / package) | Status |
| --- | --- | --- |
| **OSS memory wedge** | `actrone-memory` (L1 Redis + L2 Qdrant, budget-aware retrieval, 7 adapters: langchain/langgraph/crewai/autogen/llamaindex/dspy/haystack), MIT, 95% cov | ✅ shipped |
| **SDKs + CLI** | `@actrone/sdk` TS (`actrone-ts/`) + `actrone` Python (`actrone-py/`, extracted from backend) — full parity (gateway, model-endpoints/BYOK, deployments, env-promotion, reasoning-effort, tools D2/D3, channels, webhooks). **Go SDK deliberately removed** (CLI is now self-contained `actrone-cli/`, Go). Client parity = TS + Python only | ✅ shipped (consolidated) |
| **Orchestrator core** | `backend/orchestrator` — 60+ Go packages | ✅ shipped (mostly) |
| **Governance spine** | `mal`, `dpe` (3-tier), `trust` (Ed25519), `audit` (Merkle), `governance` (rules/ledger/feedback-loop/finetune-validator), `floors` | ✅ shipped |
| **Cost/quality flywheels** | `distill`, `eval` (groundedness/judge/gate/breaker), `optimizer` (cascade/predictive/budgeter), `semcache`, `savings`, `memorydepth` | ✅ shipped |
| **Model layer V2** | `model` (OpenAI/Anthropic/Bedrock/Gemini/Mistral + OpenAI-compatible), `modelkeys` (BYOK + **xAI/Grok 4.5** + no-direct-China + presets), governed `gateway`, `thinking_dialect`, split-rate pricing, structured outputs. **New: no-deploy managed-model DB catalog** (`managed_models` table + overlay + admin CRUD) **+ catalog-drift check** (flags newly-released provider models) | ✅ shipped |
| **Voice + translation** | Open **STT registry** (Deepgram/Whisper/AssemblyAI/Gladia), **TTS registry** (ElevenLabs/Cartesia/OpenAI/PlayHT/Rime/Grok), **s2s realtime** (OpenAI/Grok), the **governed real-time audio bridge** (`bridge.go` — tool-calls via supervisor, barge-in), **governed translation** (`translate.go` — PII-safe + glossary + multilingual + sovereign), plus V2.1 telephony (Twilio)/meeting-bots/browser(LiveKit)/artifacts | ✅ code-complete; **live carrier/voice pilot pending** |
| **Identity / auth** | **WorkOS headless** (managed) + **generic OIDC** (self-host) — Clerk fully removed from all 3 frontends + both Go backends + Python SDK. Custom-UI **MFA (TOTP)**, **passkeys** (via AuthKit ceremony), **social** (Google/Microsoft/GitHub/Apple), org-selection, sealed sessions | ✅ shipped (recent; needs pen-test) |
| **Multi-agent** | `macp` (intra-org crew), `a2a` (cross-org + provenance + Agent Cards), `mcp`/`mcphub` (governed tool vault) | ✅ shipped |
| **Execution tiers** | native durable governed loop; BYOF-hosted harness P1 (encapsulated) + P2 (stepwise crash-resumable); `byof` worker harness | ✅ P1/P2 shipped; P3 (more drivers + TS harness) pending |
| **Build / deploy** | `build`+`buildflow`+`bundle`+`codeintake` (BuildKit, SLSA, cosign), `vcs*` (GitHub/GitLab/Bitbucket), `previewdeploy`, `promotion`, `envledger`, environments | ✅ code shipped; cluster apply pending |
| **Compliance suite** | `compliance` (multi-framework catalog + evidence engine + trust center + **P4 ISMS review-cadence scaffolding** + **data-law frameworks: GDPR/CCPA-CPRA/PIPEDA+Quebec-Law-25/POPIA/NDPA-2023/Ghana-GPA off one shared engine**, with `compliance_popia\|ndpa\|pipeda\|ccpa` entitlements), `agreements` (DPA/BAA + Documenso + subprocessor registry), `residency`/`regionresolve`/`dataplane` — **Tier A/B/C data-plane routing now wired end-to-end** (region pool router + cutover) | ✅ shipped — **data-law surface needs legal sign-off per jurisdiction**; external auditor + physical EU plane pending |
| **Self-hosting** | `licensing` (Ed25519 signed licences) + off-cloud metering (offline-capable ledger) + generic-OIDC auth + `values-selfhost*.yaml` + Replicated/KOTS packaging; portable Helm | ✅ P0–P2 built; air-gap turn-up pending |
| **Edge WAF** | Coraza (OWASP CRS) as an in-cluster `EnvoyExtensionPolicy` (Wasm) on the API route + thickened CloudFront WAF on the CDN surfaces | ✅ built (opt-in); pin wasm + on-cluster CRS tuning pending |
| **Monetization** | `billing` (8 meters → Stripe, entitlements enforcer, webhooks, Checkout/Portal, BYOK fee, savings reconciliation) | ✅ code-complete, **dormant** |
| **Channels / approvals** | `channels` (Telegram/WhatsApp/Slack/email), escalation queue, durable Tier-3 pause, SSO step-up — **plus governed two-way chat** (inbound Telegram/WhatsApp → default-agent interactive turn, RBAC via linked identity, full MAL→policy→audit, idempotent) | ✅ shipped |
| **Frontend** | Next.js — 40+ Control-Tower routes, governed chat, playground, marketplace UI, full docs, trust center, billing — **plus (Additions wave) feature packs (env-aware gating), platform bad/fine/good feedback + health score, resizable docs-AI drawer, BYOK/Managed stepped model wizard, agent-transparency drawer, skeleton loading system, 4 one-click flagship EMAOP templates** | ✅ shipped |
| **Infra** | `infra` — Helm charts (gateway/ext-authz/linkerd/harness-pool), Terraform (EKS/Karpenter/ESO/ArgoCD), observability | 🟡 built; **cluster rollout pending** |
| **Not built / deploy-gated (genuinely remaining)** | Physical regional data planes (terraform authored, not applied); external SOC 2 auditor + observation window; **legal sign-off on the data-law frameworks per jurisdiction** (Additions wave — code done, counsel not); **Stripe operator turn-up**; the **live voice/carrier pilot** (LiveKit adapter + Twilio WS route + real-call hardening); pinning the Coraza wasm + on-cluster CRS tuning; MediaGuard ML model weights + VLM endpoint (engines built); a handful of framework-adapter expansions | ⏳ deploy/validate/sign-off, not build |

**Hygiene note (resolved):** the previously-flagged stray `backend/mediaguard;C` shell artifact is
gone, `actrone-go` (the removed Go SDK) is absent, and the SDKs are cleanly consolidated to
`actrone-ts/` + `actrone-py/` (+ `actrone-cli/`, `actrone-memory-py/`). The repo is tidier than at
the last review.

---

## 8. What to enhance / improve — to actually win

The product is built — arguably *over*-built. **Success now depends on the non-code 20% most
founders under-invest in, and the first move is to stop adding surface.** Ranked by leverage. *(The
full distribution playbook — 0–90-day plan, funnel metrics, content calendar, lighthouse-partner
motion — lives in [Actrone_Distribution_And_GTM_Strategy.md](./Actrone_Distribution_And_GTM_Strategy.md);
the items below are the executive summary.)*

0. **Declare a feature freeze and defend it.** The 2026-07 wave (voice, translation, WAF, auth
   re-platform) proves the team can build almost anything — which is now the trap. Each new pillar
   pushes the launch further out and makes positioning harder. **Pick the launch surface, freeze
   everything else as "dormant/available," and route all energy to proof + distribution + hardening.**
   The governed real-time interpreter is the *one* new thing worth featuring in marketing on day one
   (it demos without production traffic); the rest waits for pull. Treat "build a new capability" as
   the expensive default it has become, not the reflex. **Update (2026-07-12): the freeze is now a
   config decision, not an engineering project** — the Additions wave shipped **feature packs**
   (env-aware, fail-safe-dark in prod, dependency-closed, enforced on both the frontend edge and a
   backend `packguard` middleware). Pick the launch pack, set the env, and the rest of the surface is
   dormant-by-default across the whole stack. The primitive exists; the only remaining act is the
   *decision* to use it and hold the line.
1. **Pick ONE front door and ruthlessly subordinate the rest.** Lead with *"the production control
   plane for AI agents — self-hosted, any model"* (the monetization doc's own framing).
   Everything else is "and it also…". The breadth is a closing tool, not the opening line.
2. **Turn the flywheels into a public, provable claim.** The `savings` + attribution telemetry exist
   — wire them end-to-end so the invoice literally shows *"Actrone saved you $X this month,
   auditable against your own token logs,"* and publish **one real case study with real numbers.**
   This is your single most differentiating, least-copyable marketing asset.
3. **Harden the wedge instead of shipping all 60 packages.** Choose the launch surface (OSS memory →
   connected/gateway → governance), then **load-test + security-audit + chaos-test exactly that
   path.** A third-party pen-test + a public SECURITY.md + a status page buy more enterprise trust
   than ten more features. Keep the rest dormant until demand pulls it.
4. **Do the operational turn-up that unlocks revenue.** Apply `00062`/`00063`, stand up the Stripe
   catalog, flip `ENABLED`→`ENFORCED`, run the P6-A/C cluster bootstrap. This is "turn on what you
   built," and it's the gate between a great repo and a business.
5. **Make the OSS memory undeniably the best free option + nail TS DX.** Benchmarks vs Mem0/Zep in
   the README, a 5-minute quickstart, `create-actrone-app`, and first-class Vercel-AI/Mastra
   examples. The OSS + TS funnel is your only realistic shot at virality; over-invest in its DX.
6. **Instrument the funnel from day one.** OSS install → hosted signup → first governed task →
   first paid. You can't optimize conversion (or distill) on data you didn't capture. Wire analytics
   and the trace-capture spine *before* launch. *(Partial credit, 2026-07-12: the Additions wave added
   a platform-wide **bad/fine/good feedback widget + a health score** — an in-product quality signal
   and a first activation surface. That is one input, not the funnel: the OSS-install → signup →
   first-governed-task → paid product-event analytics still needs wiring.)*
7. **Resist marketplace + no-code until you have density.** Correct call already — keep them dormant;
   a marketplace with no demand-side is a liability, and no-code dilutes the developer-trust message.
8. **Earn the certifications on a clock.** SOC 2 Type II observation window is calendar time — start
   it now so it's done when enterprise pipeline matures; the evidence engine already does the heavy
   lifting.
9. **Sequence the moat activation:** capture (telemetry) → usage (OSS + connected) → eval/groundedness
   gate (already built — make it the visible "quality guarantee") → optimizers/distillation as the
   headline differentiator + savings-dividend pricing → hosted durable runtime (Enterprise) → A2A
   governed-interop standard (own the rails). You built it in roughly this order; *reveal* it in this
   order too.

> **The single sentence:** you don't have a product problem — you have a **focus + proof +
> distribution** problem, which is the good kind. Win by making one moat *visible and provable* to
> the market faster than the surface area can confuse it.
