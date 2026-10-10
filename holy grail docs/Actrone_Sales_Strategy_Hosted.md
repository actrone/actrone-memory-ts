# Actrone — Sales Strategy & Plan: HOSTED PLATFORM (Scale & Enterprise)

> Part of the strategy set: [Distribution & GTM](./Actrone_Distribution_And_GTM_Strategy.md) (geo
> rollout §5b) · [Marketing — Hosted](./Actrone_Marketing_Strategy_Hosted.md) · [Positioning & Moats](./Actrone_Positioning_And_Competitive_Moats.md)
> · [Lighthouse Outreach Playbook](./Actrone_Lighthouse_Outreach_Playbook.md) · sibling: [Sales — OSS](./Actrone_Sales_Strategy_OSS.md).
>
> **Scope:** the repeatable sales motion for the paid hosted tiers — **Scale (sales-assist, from
> $499/mo) and Enterprise (annual, custom)** — geo-phased from month 5. The OSS→Pro self-serve
> conversion is in [Sales — OSS](./Actrone_Sales_Strategy_OSS.md); this doc takes the PQL and closes it.
>
> _Last updated: 2026-07-12 · Owner: Matt_
>
> **2026-07-12 update (Additions wave).** Two deltas matter to this motion: (1) **data-law frameworks
> now map to the exact launch geos** — GDPR (EU), CCPA/CPRA (US-California), PIPEDA + Quebec Law 25
> (Canada), POPIA → NDPA 2023 → Ghana GPA (Africa) — off one shared engine, surfaced in the trust
> center with per-framework entitlements. This *strengthens* the compliance answer in the security
> review, **but they are legal assertions of controls we enforce, not certifications — do not quote a
> framework as "compliant/certified" before counsel signs off for that jurisdiction** (same honesty
> bar as "SOC 2 in progress"). (2) **Governed two-way channel chat** (inbound Telegram/WhatsApp → a
> full MAL→policy→audit agent turn under the linked user's permissions) is a new, demoable proof of
> "governed everywhere the team already works." Everything else in the wave is DX/onboarding polish
> (feature packs, one-click templates, feedback) — helps the pilot, not the pitch.

---

## 0. The sales thesis

**We are not selling a way to build agents — we are selling permission to deploy them.** No CISO, CFO,
or regulator lets an autonomous agent touch a system of record without proof, reversibility, and hard
bounds. **Governance is the *enabler* of autonomy, not the tax on it.** Every deal is won on the same
line: *"They make agents possible; Actrone makes them deployable on the systems that matter — governed
at the data, the action, and the decision; durable, reversible, provable."*

The differentiator that closes: the **empty cell** — *not one competitor governs the agent's action on
an enterprise system, field-by-field, end-to-end.* Sell into that gap.

---

## 1. ICP & where deals come from

**Two motions, one engine:**
- **Scale (sales-assist):** mid-market/scale-up teams putting agents into production, arriving as
  **PQLs from the OSS funnel** (governance-feature-reach — see [Sales — OSS](./Actrone_Sales_Strategy_OSS.md) §2).
- **Enterprise (full cycle):** regulated orgs, arriving via **lighthouse design partners** (see the
  [Lighthouse Playbook](./Actrone_Lighthouse_Outreach_Playbook.md)) + OSS-warm intros *inside* accounts.

**ICP (both):** a team with a *real, blocked* agent project where the blocker is **egress / audit /
compliance** (exactly what we answer) — not model quality. Priority verticals in W1: **fintech, health,
public sector**, in the launch geos.

> **Golden rule:** never run a cold enterprise motion before OSS density gives a warm path in. Warm
> intros from inside the account beat 6–9-month cold cycles every time at this stage.

---

## 2. The buying committee & what each needs

| Role | Their question | The proof that closes them |
| --- | --- | --- |
| **Champion** (platform/eng lead) | "will this actually run in prod?" | the runtime + audit trail + "run your existing framework governed" |
| **Security / CISO** (the gate) | "does data leave? can I audit every action?" | **zero-egress**, tamper-evident audit, simulate-then-commit, the trust center + **pen-test report** |
| **Compliance / DPO / risk** | "GDPR/HIPAA/POPIA/NDPA/PIPEDA/CCPA exposure?" | residency routing, per-tenant DPA/BAA, signed regulator exports, **per-jurisdiction data-law frameworks in the trust center** (legal sign-off pending — present it as "mapped + enforced," not "certified") |
| **Economic buyer** (VP Eng/CTO) | "why not build it / use 5 tools?" | "replace five vendors, pass the security review, ship in three lines" + the savings-dividend |

**A deal without an engaged security stakeholder is a POC that will stall.** Qualify them in early.

---

## 3. The sales stages (with exit criteria)

1. **Qualify** — real blocked project · security stakeholder engaged · one of our launch geos ·
   reference-willing. *(Disqualify politely if no security stakeholder or no real project.)*
2. **Discover & frame** — map their blocked project to the empty cell; identify the systems of record
   the agent must touch; agree the "safe to deploy" bar with security. *Exit: agreed success criteria.*
3. **Prove** — the demo sequence (§4) + a scoped pilot / self-hosted deploy. *Exit: governed agents
   running on their data in a sandbox/pilot.*
4. **Security review** — the make-or-break enterprise gate (§5). *Exit: security sign-off.*
5. **Procure & close** — pricing, DPA/BAA, contract; for Enterprise, procurement + Marketplace private
   offer. *Exit: signed.*
6. **Expand** — land a use case, grow via usage (governed task runs), seats, and the Enterprise gates
   (SSO/SIEM/single-tenant/regulator-export). *Exit: NRR >100% + a reference.*

---

## 4. The demo sequence (proof, not slides)

Run in this order — each answers the next stakeholder:
1. **The interpreter demo** (60s, opens the room — PII-safe, glossary-locked, brand-voice; no
   competitor can show it).
2. **The audit-trail demo** — "prove what every agent did, in one query," tamper-evident. (Security.)
3. **Simulate-then-commit** — a governed connector write shown as a diff → approval gate → signed
   receipt → one-click undo. (Security + compliance — this is the "governed *action*, not governed
   chat" moment.)
4. **Zero-egress reference architecture** — "runs in your VPC, nothing leaves." (Security + DPO.)
5. **The Cost Monitor / savings framing** — *positioned honestly* as "built, proving out": the
   dividend only bills against provable, capped savings. (Economic buyer.)

> **Honesty discipline (deep code sweep):** demo the **shipped governance spine** (MAL/DPE/audit/GAL) —
> it's real and load-bearing. Position flywheel cost-savings and voice-on-live-calls as **"built,
> proving out,"** and say **"SOC 2 Type II in progress."** Overclaiming here loses the security review
> and the account. Radical honesty is a *selling* advantage with this buyer.

---

## 5. The security-review playbook (the enterprise unlock)

The security review is where most agent vendors die — and where we win, because the product is built
for it. Make it a **self-serve shortcut**, not a bottleneck:
- **Lead with the trust center + SECURITY.md + the third-party pen-test report** — hand it over *before*
  they ask. Shrinks time-to-pass dramatically.
- **Zero-egress + self-host** answers the biggest objection structurally (data never leaves the
  boundary — MAL tokenises at the model edge; BYOK; residency routing).
- **The tamper-evident audit + signed regulator export** answers "prove it to our auditor."
- **Per-tenant DPA/BAA automation** (Enterprise `dpa` gate) collapses the legal step.
- **Per-jurisdiction data-law frameworks in the trust center** (GDPR/CCPA/PIPEDA/POPIA/NDPA/GPA) let
  the DPO self-answer "how do you handle *our* law?" — mapped to the controls we actually enforce.
  **Honesty rule: label them "mapped + enforced," never "certified," until legal signs off for that
  jurisdiction.** Overstating here loses the exact buyer they're meant to win.
- **Track security-review pass rate + time-to-pass as a first-class metric** — it's the leading
  indicator of enterprise velocity.

---

## 6. Packaging, pricing & the close

| Tier | Price (public) | Sells on | Motion |
| --- | --- | --- | --- |
| **Scale** | from **$499/mo** (self-host from here up; BYOK, audit log, custom policies, seats, residency choice, voice, hosted runtime) | governance you can put through a security review | sales-assist |
| **Enterprise** | annual, custom (SSO, SIEM, single-tenant, `residency_eu`, regulator export, executed DPA/BAA, 99.9–99.99% SLA) | regulated-scale governance + procurement fit | full cycle |

- **Value frame, not cost frame:** price against *the cost of not having a control plane* (a breach, a
  failed audit, a blocked project) — the value metric is **governed task runs**, decoupled from tokens.
- **The savings-dividend as a close weapon** (honestly): *"BYOK with no token markup, and where we
  route you cheaper we bill only a share of the savings we can prove — capped, excess credited."*
  Incentive-aligned; disarms the "another vendor bill" objection.
- **"Replace five vendors"** — the consolidation math (memory + gateway + guardrails + audit +
  orchestration) is a hard ROI story for the economic buyer.
- **Honest pricing note:** subscription dollar figures live in the Stripe catalog, not code — confirm
  the catalog before quoting; billing must be turned on (Wave 1 gate) before the first close.

---

## 7. The reference flywheel (governance sells on references)

Land 1 → prove 1 → **publish 1** (case study with real numbers / zero-egress reference / passed
security review) → use it to warm the next 2. One named reference logo in a regulated vertical is worth
more than any amount of outbound. This is why the [Lighthouse Playbook](./Actrone_Lighthouse_Outreach_Playbook.md)
is the seed of the whole enterprise motion — **do not scale the sales team before one repeatable,
referenceable win.**

---

## 8. Geo-phased sales rollout (mirrors GTM §5b)

- **W1 (month 5): the United States, Canada, the United Kingdom, Ireland, the Netherlands and South Africa** (`Actrone_Launch_Markets.md`). Each now has a matching **shipped data-law
  framework** (legal sign-off pending): **US** = SOC 2 + DPA already, plus **CCPA/CPRA**; **Canada** = **PIPEDA + Quebec Law 25**, with French for Quebec; **UK** = UK GDPR;
  **Ireland and the Netherlands** = **GDPR** (sequence the EU data-plane apply *before* selling `residency_eu`);
  **South Africa** = **POPIA**, the differentiated bet: "governed agents on regulated fintech without offshore
  data," less competition, real pain. Kenya follows in wave 2, Nigeria
  (**NDPA 2023**) and Ghana (**GPA**) in wave 3. The US, Canada and the UK lead on cost + accountability (health/fintech); the EU
  and South Africa lead on sovereignty.
  *No framework is quoted as "certified" until counsel clears that jurisdiction.*
- **W2 (month 11) — Australia · Asia** once the W1 motion + compliance modules are battle-tested.
- **W3 (post-Y1) — RoW**, demand-pulled from the OSS funnel.

Staffing follows proof: found-led selling + 1–2 sales-assist reps through W1's first references, *then*
hire against a proven, referenceable motion — not ahead of it.

---

## 9. Metrics

| Metric | Why | Illustrative target |
| --- | --- | --- |
| PQL → SQL → opportunity | funnel quality from the wedge | measured |
| **Security-review pass rate + time-to-pass** | the enterprise unlock | improving |
| Win rate; sales-cycle length | motion health | shorten with references |
| ACV (Scale vs Enterprise); pipeline coverage | revenue | 3–4× coverage |
| Reference logos in-vertical | governance sells on references | ≥1 (W1) → compounding |
| Net revenue retention | usage + seat + gate expansion | >110% |

---

## 10. Guardrails

- **Qualify the security stakeholder early** — no champion-only deals.
- **Sell the shipped spine; position flywheels/voice as "proving out"; "SOC 2 in progress."** Never
  overrun the code — the security review punishes it.
- **Don't scale sales before one referenceable win.**
- **Don't cold-prospect before OSS gives a warm path.**
- **Confirm the Stripe catalog + billing turn-up before quoting/closing** (Wave 1 gate).

---

## 11. The one line

> **Sell permission-to-deploy, not another agent builder: walk the champion, the CISO, and the CFO
> through irrefutable proof (interpreter → audit trail → simulate-then-commit → zero-egress → savings),
> win the security review with the trust center + pen-test you hand over unprompted, and turn every
> close into a published reference that warms the next — geo by geo, honestly, never outrunning the
> code.**
