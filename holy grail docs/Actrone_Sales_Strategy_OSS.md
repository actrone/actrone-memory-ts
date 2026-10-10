# Actrone — Sales Strategy & Plan: OSS → HOSTED (product-led conversion)

> Part of the strategy set: [Distribution & GTM](./Actrone_Distribution_And_GTM_Strategy.md) ·
> [Marketing — OSS](./Actrone_Marketing_Strategy_OSS.md) · sibling: [Sales — Hosted](./Actrone_Sales_Strategy_Hosted.md).
>
> **Scope:** the *conversion* motion — how a free open-source user becomes a paying hosted customer.
> This is **product-led sales (PLS)**: mostly self-serve, sales-assisted only at the enterprise
> signal. The heavy enterprise motion is in [Sales — Hosted](./Actrone_Sales_Strategy_Hosted.md); this
> doc owns the **land** from the OSS wedge.
>
> _Last updated: 2026-07-12 · Owner: Matt_
>
> **2026-07-12 update (Additions wave).** Two conversion-relevant deltas: (1) **one-click flagship
> agent templates** (inbox-to-ticket, revops-followup, support-triage, knowledge-answers) + a wider
> one-click integration catalog shorten *time-to-first-governed-task* — the activation moment this doc
> obsesses over; (2) the new Scale-gated **data-law compliance entitlements** (`compliance_popia`/
> `compliance_ndpa`/`compliance_pipeda`/`compliance_ccpa`) are additional **governance-feature-reach
> PQL signals** to score on. The billing-off-by-default prerequisite (below) is **unchanged** — the
> Additions wave did not turn billing on.

---

## 0. The core mechanic

The OSS libs are MIT and self-hostable forever — **lock-in is deliberately near-zero, and that's the
pitch.** So conversion is *not* coercion; it's **graduation**: the developer voluntarily upgrades when
their agent hits a wall that governance/operations solve, via a **one-import swap**:

```
# self-hosted, free
from actrone_memory import MemoryManager
# hosted + governed (PII tokenisation → policy → residency → audit ledger)
from actrone import ActroneMemoryManager as MemoryManager
```

Same API, now every read/write is governed and you stop running Redis+Qdrant yourself. **Our job is to
make the wall visible at the right moment, then make the upgrade a 60-second, self-serve step.**

> **Honest prerequisite:** billing ships **off by default** (`enabled=false`, `enforced=false`). The
> Stripe catalog + `ENABLED`→`ENFORCED` turn-up must be done **before Wave 1** or there is nothing to
> convert *to*. This is an operational gate on the whole PLS motion (Product Review §7).

---

## 1. The conversion ladder

| Stage | Who | Motion | Trigger to next |
| --- | --- | --- | --- |
| **OSS user** | dev running `actrone-memory` self-hosted | none (product does the work) | hits an ops/governance wall |
| **Hosted signup (Core/Free)** | same dev, wants managed memory / to try the platform | self-serve, no touch | value + the 1,000-run **hard cap** |
| **Pro** (PAYG) | dev/small team in production | **self-serve checkout**, 14-day trial | team growth / governance need |
| **Scale** (from $499/mo) | team needing governance, self-host, BYOK, seats | **sales-assist** (PQL routed to sales) | security review / procurement |
| **Enterprise** | regulated org | full [Sales — Hosted](./Actrone_Sales_Strategy_Hosted.md) motion | — |

The **free-tier 1,000-governed-run/month hard cap** (the coded COGS firewall) is *also* the primary
conversion trigger: a dev who hits it is, by definition, getting value in production. Instrument it as
the #1 upgrade moment.

---

## 2. Product-qualified lead (PQL) — the definition that routes to sales

A signup is a **PQL** (route to sales-assist for Scale/Enterprise) when it shows *enterprise
intent*, not just usage. Score on:

- **Governance-feature interest** — viewed/attempted a Scale-gated feature (`byok`, `audit_log`,
  `advanced_governance`, `custom_policies`, `residency_region_choice`, `voice`, `hosted_runtime`, or a
  **data-law framework** `compliance_gdpr`/`compliance_popia`/`compliance_ndpa`/`compliance_pipeda`/
  `compliance_ccpa`) → hit the entitlement 402. **This is the strongest signal** (they *reached* for
  governance) — a data-law reach in particular flags a regulated buyer in a launch geo.
- **Team signal** — multiple users on the same email domain; invited teammates.
- **Company signal** — corporate (non-personal) email domain in a target vertical/geo.
- **Volume signal** — approaching/hitting the 1,000-run hard cap; sustained weekly governed tasks.
- **Deployment signal** — attempted a self-hosted / BYOC deployment.

**PQL routing:** personal-email + solo + low-volume → keep fully self-serve (Pro). Corporate + team +
governance-feature-reach → **route to a human** with the usage context pre-loaded (they've already
shown the intent; don't make them repeat it).

---

## 3. Activation → habit → conversion (the funnel to obsess over)

1. **Activate:** signup → **first governed task** (the "aha": same memory call, now with a signed audit
   trail + PII tokenisation the dev can *see*). Target ≥40% signup→first-task. The audit-trail view is
   the activation surface — make it the thing they screenshot.
2. **Habit:** weekly governed tasks; the audit trail + Cost Monitor become part of their loop.
3. **Convert:** the cap / a governance need / team growth triggers the upgrade. Self-serve checkout
   for Pro; sales-assist for Scale.

**You cannot optimize this on data you didn't capture** — the trace-capture + product-event
instrumentation (GTM §6) must be live before Wave 1.

---

## 4. Self-serve motion (Pro — no human touch)

- **In-product upgrade prompts at the wall**, not spray: when a dev hits the 1,000-run cap or a
  Pro-gated feature (`cost_budgets`, `coordination_graph`, `data_export`), show a contextual "upgrade
  to keep going" with the *specific* value they just reached for.
- **14-day Pro trial**, transparent PAYG (per governed task + per token at true provider rates — **no
  hidden markup**; this is a trust asset, say it).
- **Frictionless checkout** (Stripe Checkout/Portal, already coded) — the dev never talks to anyone.
- **Lifecycle email** keyed to product events (first task, approaching cap, first governed tool call),
  not calendar blasts.

---

## 5. Sales-assist motion (Scale — light human touch)

When a PQL shows enterprise signals, a human enters — but PLS-style (help them buy, don't pitch):
- **Reach out with context** ("saw your team hit BYOK / the run cap — want a hand wiring self-host +
  governance?"), not a generic demo request.
- **The value frame:** *"you're already getting value; Scale unlocks governance you can put through a
  security review — BYOK with no token markup, audit log, custom policies, self-hosting,
  data-residency choice."*
- **Hand off cleanly** to the [Sales — Hosted](./Actrone_Sales_Strategy_Hosted.md) motion for the
  security review + procurement.

---

## 6. Expansion (land small, grow with usage)

- **Usage-based expansion** — the value metric is *governed task runs*, so revenue grows with the
  customer's own success (aligned incentive).
- **The savings-dividend as a retention weapon** — *"we only bill the margin against savings we can
  prove, capped at what we saved you, excess credited."* Once real savings show in the Cost Monitor,
  it's a reason to *expand*, not churn. *(Honest: the dividend defaults to 0 and only pays off when the
  optimizer levers are on + the customer uses them — see Product Review §7.)*
- **Seat + feature expansion** — team seats (Scale), then the Enterprise gates (SSO, SIEM,
  single-tenant, regulator export).

---

## 7. Metrics

| Metric | Why | Illustrative target |
| --- | --- | --- |
| OSS → hosted-signup rate | the wedge→position handoff | measured, then optimized |
| Signup → first-governed-task (activation) | the "aha" | ≥40% |
| Free → paid conversion | PLS health | 2–5% (OSS-led benchmark) |
| PQL → SQL (governance-feature-reach → sales) | intent routing quality | measured |
| Net revenue retention (expansion − churn) | usage-based growth | >100% target |
| Churn (Pro) | self-serve dev tools churn fast | <6% (activation is the fix) |

---

## 8. Guardrails

- **Never coerce — graduate.** The no-lock-in promise is the trust that makes the funnel work; don't
  betray it with dark patterns or crippled OSS.
- **Don't sell savings as guaranteed** — the dividend is real but defaults to 0 and depends on the
  optimizer being on + used. Say "provable, capped, credited," not "we'll cut your bill N%."
- **Don't route every signup to sales** — self-serve is the point at Pro; humans only at the enterprise
  signal, with context.
- **Turn billing on before you push** — no live conversion path until the Stripe turn-up (Wave 1 gate).

---

## 9. The one line

> **Make the OSS→hosted upgrade a voluntary graduation, not a trap: instrument the moment a developer
> hits the governance/ops wall (the run cap, the BYOK/audit reach), let them self-serve into Pro in 60
> seconds with honest no-markup pricing, and route only the enterprise-intent signals to a human — so
> the free wedge converts itself.**
