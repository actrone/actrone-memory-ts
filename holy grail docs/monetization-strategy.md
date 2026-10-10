# Actrone Monetization Strategy

> **Status:** ✅ METERING SPINE BUILT / turn-up-gated (verified by code audit 2026-07-04 — supersedes any
> "phases 2-4 pending" note). `internal/billing/` is code-complete: `recorder.go`, `usage.go`, `stripe.go`
> (8 Stripe Billing Meters incl. `MeterGovernedTaskRun`/`MeterRoutingSpendUSD`/`MeterEvalOp`, closed-hour-bucket
> idempotency), `webhook.go` (tier reconcile), `checkout.go` (`StripeCheckout` + `NoopCheckout` default),
> `entitlements.go`, `enforcement.go`, `reconcile.go`; migrations `00062`/`00063`. **Deployment-gated only:**
> live Stripe keys + webhook secret (defaults to `NoopCheckout` until configured). · **Owner:** Matt · **Last updated:** 2026-07-04
>
> **Status refreshed 2026-07-13 (code-verified):** re-confirmed **dormant-by-default and honest**.
> Defaults in `internal/config/config.go`: `billing.enabled=false`, `billing.enforced=false`,
> `billing.dividend_rate=0.0` — so a fresh deployment records nothing, enforces nothing, and charges
> **no routing dividend** until an operator deliberately sets them (the `Enforced` and `DividendRate`
> struct fields in `internal/billing/config.go` document exactly this fail-safe). The **8 meters** are
> present in `internal/billing/types.go`: `governed_task_run`, `routing_spend_usd`, `memory_gb_month`,
> `active_connection`, `eval_op`, `hosted_gb_second`, `build_minute`, `byok_governed_task`. **No
> per-token markup exists in code** — the only spend-linked fee is the routing dividend, which defaults
> to 0 and (per §6) is reconciled against measured savings; the BYOK line is explicitly a flat
> governance fee, "no token markup" (§15.2). Turn-up is Stripe-catalog + live-keys work only (nothing
> is on by default). This is app-layer and **not** blocked on the P6 cluster rollout.
> **Scope:** Platform-wide monetization, Stripe billing architecture, feature gating, team management & RBAC.
> Pricing figures are **illustrative anchors** for reasoning — validate against willingness-to-pay before launch.

---

## Table of contents

1. [Strategic foundation — why people pay](#1-strategic-foundation--why-people-pay)
2. [Pricing architecture — hybrid, value-metered](#2-pricing-architecture--hybrid-value-metered)
3. [Tier design](#3-tier-design)
4. [Add-ons & marketplace monetization](#4-add-ons--marketplace-monetization)
5. [Unit economics & profitability](#5-unit-economics--profitability)
6. [Cost-savings mechanics & honest framing](#6-cost-savings-mechanics--honest-framing)
7. [Why users will *enjoy* paying](#7-why-users-will-enjoy-paying)
8. [Stripe implementation blueprint](#8-stripe-implementation-blueprint)
9. [Feature gating — entitlement-driven](#9-feature-gating--entitlement-driven)
10. [Team management & RBAC](#10-team-management--rbac)
11. [Billing lifecycle & edge cases](#11-billing-lifecycle--edge-cases)
12. [Phased rollout plan](#12-phased-rollout-plan)
13. [Open decisions](#13-open-decisions)
14. [Cost-leadership & quality roadmap](#14-cost-leadership--quality-roadmap)
15. [EMAOP & extensibility revenue lines (complete revenue map)](#15-emaop--extensibility-revenue-lines)

---

## 1. Strategic foundation — why people pay

### The core objection

> *"Why pay Actrone if I already pay for my agent framework (LangChain / CrewAI / AutoGen / LlamaIndex)?"*

This objection dies the moment positioning is correct. **Actrone is not a framework — it is the governed control plane underneath the framework.**

| What the user already has | What it does **not** give them | What Actrone is |
|---|---|---|
| LangChain / CrewAI / AutoGen / LlamaIndex | Durability, governed tool-calling, persistent memory infra, multi-agent coordination, compliance/audit, cost control, an observability backplane | The runtime + governance + memory + observability layer that keeps those agents alive, safe, cheap, and auditable **in production** |

The framework writes the agent. Actrone is **the thing a CTO and an auditor require before that agent touches a real customer.** Frameworks are a dev-time concern; Actrone is a production + risk + cost concern — a different buyer, a different budget.

### The one-sentence pitch that justifies the bill

> *"You'd otherwise assemble Temporal + a vector DB + Redis + a model gateway + a guardrails system + an observability vendor and pay 5–6 bills to run agents in prod. Actrone is that stack as one governed platform, one bill — and the model-routing alone usually pays for it."*

This is the existing homepage "five bills become one" thesis; pricing must make it **literal**.

### What we actually price against

Never price *against* the framework (a free dev library). Price against **the cost of NOT having a control plane**:

- Outages from non-durable agents
- Runaway model spend
- A tool-call that exfiltrates data
- A failed SOC2 / HIPAA / EU AI Act audit

That is the value frame, and it maps to a budget line the framework never touches.

---

## 2. Pricing architecture — hybrid, value-metered

Pure seat-based pricing is dead for AI infra (seats don't track value when one agent does the work of 100 people). Pure usage-based pricing scares procurement and makes revenue unforecastable. **The 2026 winner is hybrid:**

```
Revenue = Platform subscription (seats + entitlements + included usage)
        + Metered consumption above the included bucket (overage)
        + À-la-carte add-ons (capacity you opt into)
        + Marketplace take-rate (Stripe Connect)
        + A transparent margin on governed model spend (the "routing dividend")
```

### The primary value metric: the "governed task run"

One durable, governed task through the orchestrator — the atomic unit of value Actrone delivers.

- **Meaningful** to the customer ("an agent did a thing for me").
- **Scales** with their success, not their headcount.
- **Cheap** to meter.

Secondary meters layer on top for the heavy resources.

### The meters (what we actually count)

| Meter | What it captures | Role |
|---|---|---|
| **Governed task runs** | One durable, governed orchestrator task | Primary; included bucket per tier, overage per-run |
| **Retained memory** | GB-months of Qdrant L2 vectors + Redis L1 footprint | Real storage cost |
| **Active connections** | Governed MCP servers + A2A remotes | Each is supervised infra |
| **Governed model spend** | Transparent platform margin (~5–8%) on spend routed through the gateway | Most scalable line; only ever shown net-of-savings |

**Why this mix wins:** subscription gives forecastable MRR + procurement comfort; usage captures upside from power users without punishing small ones; the routing margin scales with the customer's *biggest* cost (model spend) while we **provably reduce it** via routing + caching (see the Cost Calculator / Cost Monitor).

---

## 3. Tier design

Five tiers — a PLG free tier to drive bottoms-up adoption, three self-serve paid tiers, and a sales-led enterprise tier. **Each tier is an entitlement bundle, not just a price.**

### Free — "Developer" (PLG loss-leader, hard-capped)

- 1 seat, 1 environment, community support.
- ~1–2k task runs/mo, capped memory retention (e.g. 7-day TTL), 1 MCP + 1 A2A connection, single governance policy preset.
- **Hard caps** (not overage) — the margin firewall: a free user physically *cannot* run up a bill. Kill-switch + spend cap enforced server-side.
- Goal: time-to-first-governed-agent in < 10 min. This is the funnel.

### Pro — "Team" (self-serve, the volume tier) — *~$99–199/seat-tier or flat platform fee + seats*

- Up to ~10 seats, 3 environments (dev/staging/prod), email + Slack alerts, full governance presets, schema healing, retries / circuit breaking.
- Generous included task-run bucket + overage; 30-day memory retention; 10 connections.
- RBAC (Owner / Admin / Member), audit log, standard support, 99.9% SLA-lite.

### Business — "Scale" (self-serve → assisted) — *~custom platform + seats + usage*

- SSO / SCIM, custom governance policies (the policy-YAML engine), data-residency selection, higher rate limits, priority support, advanced RBAC + custom roles, longer retention, more environments.
- Larger included buckets, volume-discounted overage, multi-burn-rate SLO alerting.

### Enterprise — "Sovereign" (sales-led, land-and-expand)

- **BYOC / self-host** — the entire control plane in the customer's VPC via the Helm chart (mTLS, KMS-encrypted secrets, configurable residency). Licensed per-capacity, not metered through us.
- SOC2 / HIPAA / DPA, dedicated support + TAM, custom SLAs, invoicing / ACH / wire / PO, volume usage pricing, audit-grade signed-ledger exports.
- Where the real ACVs live; everything below is the funnel to it.

### Design principle

Every tier boundary is a **capacity or governance** wall — never an artificial feature lock that breaks trust. People upgrade because they outgrew a limit they can see, or need a control their compliance demands — not because we hid a checkbox.

---

## 4. Add-ons & marketplace monetization

### Add-ons (expansion without forced upgrades)

Add-ons let a Pro customer buy **exactly** the one thing they outgrew instead of jumping a whole tier:

- Extra seats
- Extra environments
- Extra memory GB-months
- Higher rate-limit ceiling
- Additional MCP / A2A connections
- Premium support
- Advanced-compliance pack (HIPAA / residency) without going full Enterprise
- Dedicated / reserved infra

### Marketplace (Stripe Connect)

- Publishers sell paid agents; Actrone takes a platform fee (~20%, application-fee on Connect) per install / subscription.
- Publishers paid via Connect Express accounts (Connect handles global payouts, KYC, 1099 / tax forms).
- Surfaces the existing Earnings / Rewards experience — a second revenue engine **and** a moat (more agents → more reason to be on Actrone).

### 4.1 Revenue-point coverage — every monetizable surface

The audit rule: **no capability that carries real marginal cost or differentiated value ships without a
revenue point.** This matrix maps every surface in the codebase to how it earns, so nothing runs
"free-on-us" by omission. (Meters marked *new* extend §2's core four as the corresponding capability
turns up.)

| Surface (codebase) | Marginal cost driver | Revenue mechanism |
|---|---|---|
| Governed task runs (`internal/billing`) | orchestrator compute + judge model | Primary meter (included bucket + overage) |
| Governed model spend (gateway) | provider spend | ~5–8% routing margin, shown net-of-savings |
| Retained memory (Qdrant L2 / Redis L1) | storage | GB-months meter + add-on |
| Active connections (MCP + A2A) | supervised infra | per-connection meter + add-on |
| **Voice minutes** (`internal/voiceoutbound`, telephony/meeting-bots/LiveKit) *new* | Twilio + LiveKit + STT/TTS per minute | **per-minute voice meter** (Scale+ add-on; Enterprise pooled) |
| **Governed browser sessions** (browser pool) *new* | GPU/browser-pod time | **per-session / per-minute meter** (Scale+ entitlement `browser_*`) |
| **BYOK routing** (`modelkeys`) *new* | governance + observability over the customer's own key | **BYOK platform fee** (flat per-key or small per-request govern fee) — mirrors billing `FeatureBYOK` |
| Connector calls / vendor write-packs (GAL) | connector infra + assurance | usage add-on; **Assurance = insurance-as-substrate** premium (coverage-as-governance) |
| A2A cross-org hops | mesh + provenance | per-hop meter (folds into Active connections / Enterprise) |
| Marketplace installs / subscriptions | Connect payouts | ~20% platform application-fee |
| Data residency (EU/regional plane) | dedicated regional infra | Scale (`residency_region_choice`) / Enterprise (`residency_eu`) entitlement |
| Compliance packs (DPA/BAA, frameworks) | audit + legal surface | Enterprise entitlement (`dpa`, `compliance_*`); advanced-compliance add-on |
| Self-hosted / air-gapped control plane (`internal/licensing`) | support + license | per-capacity Enterprise license (Ed25519), not metered through us |

**EMAOP integration monetization** (from `docs/Actrone_EMAOP_Models_Extensibility_Channels_Plan.md`,
folded in here): channels (Slack/Teams/Telegram/WhatsApp) and the expanding integration/template
catalog are **entitlement-gated by tier** (basic channels in Pro, enterprise connectors + custom
connectors in Scale/Enterprise per `FEATURE_MATRIX`) rather than separately metered — they drive
tier upgrades and stickiness, which is their monetization role. Premium first-party integrations
(SAP/Workday/Oracle/ADP class) sit behind the `enterprise_connectors` wall.

**Frontend alignment:** these map 1:1 onto the `FEATURE_MATRIX` entitlements the Control Tower already
enforces (§9), the in-app Stripe Checkout/Portal billing surface (F1), and the pricing page tiers — so
the pricing story the customer sees and the meters we bill on are the same list.

---

## 5. Unit economics & profitability

We carry real COGS: EKS compute, Temporal, Redis, Qdrant, egress, plus 3rd-party (Clerk, Resend, model providers) and opex. The model must price **above** COGS with healthy gross margin.

### Per governed task run, COGS ≈

```
COGS/run ≈ model tokens (pass-through + our margin)
         + orchestrator + worker compute (Temporal execution)
         + memory ops (Redis L1 hit + Qdrant L2 search/write)
         + egress + thin amortised platform overhead
```

### Margin design

| Revenue line | Target gross margin | Why |
|---|---|---|
| Subscription + add-ons | **75–85%** | Capacity sold ahead of consumption; classic SaaS economics |
| Usage overage | **55–70%** | Compute/memory are real, but overage priced as a multiple of marginal COGS |
| Routing margin | **near-pure** | % on spend already flowing through; our cost is gateway compute we already run |
| Marketplace take-rate | **~95%** | We provide the rails, not the agent (Connect fee minus Stripe's cut) |

### The three guardrails that protect margin (and double as customer-love features)

1. **Hard caps on Free** — the firewall; a free tenant's max COGS is bounded by entitlements enforced server-side.
2. **Kill-switch + spend caps** (already in the Cost Monitor) — stop runaway spend before it becomes a runaway bill, on *every* tier.
3. **The alert system** — `spend.cap_reached`, `ratelimit.exceeded`, `task.failed` notifications warn the customer *before* a surprise bill. Simultaneously a margin guard and the single biggest driver of "I trust this vendor."

### Forecastability

Blended, subscription should be **≥ 60%** of revenue so MRR is predictable; usage is the expansion upside on top.

---

## 6. Cost-savings mechanics & honest framing

The "routing dividend" (the platform margin on governed model spend, §2) and the "provable savings" promise (§7) only hold if the savings are **real and measured**. This section documents exactly which levers exist in the platform today, which are automatic, and the honest-pricing rule that keeps the fee from feeling like a tax.

### The four cost levers (grounded in the codebase)

| Lever | Automatic? | How it saves | Source |
|---|---|---|---|
| **Query cache** | ✅ Automatic (temperature ≤ 0.1) | Deterministic completions are hashed (`sha256(model + messages + temp + max_tokens)`) and cached in Redis for 24h. A cache hit **skips the LLM call entirely → 100% saving** on that call. | `internal/model/query_cache.go` |
| **Cost-optimized routing** | ⚙️ Opt-in per agent (`routing_strategy: cost`) | Simple tasks (complexity < 0.4, optionally via a pre-call `BudgetPredictor` estimate) route to the **cheapest capable model**; complex tasks still get the primary. Saves the delta between a frontier and a cheap model on easy work. | `internal/model/router.go` (`routeCost`) |
| **Batch mode** | ⚙️ Opt-in per task (`batch_mode=true`) | Tasks run through the OpenAI Batch API at **~50% lower cost**. Trade-off: async latency (up to a 24h window) — ideal for non-interactive workloads. | `internal/model/batch_provider.go`, `internal/service/batch_service.go` |
| **Memory budgeting** | ✅ Automatic | Two-tier retrieval is budget-capped and auto-summarises on overflow, so **fewer input tokens** are sent per call — lowering per-call cost on every task. | Memory retrieval (budget-aware 4-phase) |

### The honest-framing risk

Savings are **conditional, not guaranteed**. A customer who pins a single frontier model, runs high-temperature prompts, and never uses batch mode gets little automatic saving — and to them a flat margin on model spend would feel like a **pure tax**. Overclaiming "we always cut your bill" is the fastest way to lose the trust the whole strategy depends on.

### The rule: a savings-backed fee

To keep the routing margin honest and lovable:

1. **Measure, never assume.** Charge the routing margin only against **demonstrated** savings, surfaced line-by-line in the Cost Monitor.
2. **Cap at net-neutral-or-better for the customer.** When measured savings in a period are **less** than the routing fee, **credit the difference** so the customer is never worse off for the fee existing. The fee becomes a *share of value created*, not a levy on spend.
3. **Make opt-in savings discoverable.** Because routing and batch are opt-in, the product should *nudge* eligible workloads ("this agent pins GPT-4o on simple tasks — enable cost routing to save ~$X/mo"), turning the savings story into an in-product growth loop.

### 6.1 Savings-attribution telemetry (making the claim provable)

The Cost Monitor can only show *"Actrone saved you $X, fee $Y, net −$Z"* if every saving is attributed at the moment it happens. The pipeline:

**Per-call attribution.** On every governed LLM call, compute a **baseline cost** — what the call *would* have cost on the tenant's default/primary model for the same token counts — and the **actual cost**, then attribute the delta to a source:

```
saved_usd = baseline_usd − actual_usd
source ∈ { cache_hit, cost_route, batch, memory_budget }
```

- `cache_hit` → `actual_usd = 0`, `saved_usd = baseline_usd` (100%).
- `cost_route` → `baseline = primary_price(tokens)`, `actual = cheap_price(tokens)`. The `BudgetPredictor` already prices the primary, so the baseline is free to compute.
- `batch` → `saved_usd = baseline_usd × 0.5`.
- `memory_budget` → baseline uses pre-trim token count; actual uses post-trim — the delta is the trimmed-token cost.

**Emit a structured savings event** per call/task (idempotent, same discipline as the existing usage/idempotency keys):

```jsonc
{
  "tenant_id": "…", "task_id": "…", "agent_id": "…",
  "source": "cost_route",
  "baseline_usd": 0.0142, "actual_usd": 0.0031, "saved_usd": 0.0111,
  "model_baseline": "gpt-4o", "model_actual": "gpt-4o-mini",
  "ts": "2026-06-03T…Z"
}
```

**Data model.** A `savings_events` append-only table (or a Stripe-side meter) keyed by tenant + period, aggregated to `monthly_saved_by_source`. Append-only matches the financial-data rule (never `UPDATE`/`DELETE` audit rows).

**Surface in the Cost Monitor.** Roll up per period into the headline the strategy depends on:

> Actrone saved you **$248** this month — cache **$120**, routing **$96**, batch **$24**, memory **$8**. Platform fee **$60**. **Net −$188.**

**Billing tie-in.** The routing margin is computed on governed spend, then **reconciled against `monthly_saved_by_source`**: if `fee > total_saved`, issue a credit for the difference (rule #2 above). This makes the line on the invoice self-justifying — the customer can audit it against their own token logs.

**What needs building** (small, additive): (1) baseline-cost computation wired into the router/cache/batch paths (the predictor already exists); (2) the `savings_events` emit + table; (3) the Cost Monitor aggregation + headline; (4) the fee↔savings reconciliation in the billing job. None of it requires new infra — it instruments paths that already run.

---

## 7. Why users will *enjoy* paying

People resent bills they don't understand. They *enjoy* paying when value and cost are visible and they're never surprised.

- **Provable savings, in-product.** The Cost Calculator + Cost Monitor show net spend *after* routing/caching savings vs. their old stack. When the dashboard shows *"Actrone saved you $X this month, fee was $Y, net −$Z,"* the bill becomes a profit line, not a cost.
- **No surprise bills, ever.** Hard caps on Free; soft caps + overage *with pre-emptive alerts* on paid; real-time usage meters; a customer-controlled kill-switch. The alerts system is a **retention** feature, not just ops.
- **You buy exactly what you need.** Add-ons, not forced tier jumps. Transparent metering. Usage dashboard ties every dollar to a task / agent.
- **Consolidation relief.** One bill replacing 5–6 vendors is *less* billing pain, not more — and we show that explicitly.
- **Fast, generous, honest free tier** → genuine value before any card is asked for. PLG trust compounds.

**Emotional target:** the bill should feel like **insurance + a cost-saver**, not a tax.

---

## 8. Stripe implementation blueprint

Stripe is the right choice. Everything is server-side and webhook-reconciled.

### Objects & catalog

- **Products + Prices** per tier; **recurring** prices for subscriptions/seats, **metered** prices backed by **Stripe Billing Meters** (the current meter-events API — *not* the deprecated usage-records API) for each meter (task runs, memory GB, connections, routing spend).
- **Stripe Entitlements** as the canonical feature map: each Product grants Features; query a customer's active entitlements as the **source of truth for gating** (§9), mirrored into our DB for fast checks.

### Self-serve flows

- **Stripe Checkout** (hosted) for signup → paid and add-on purchase — PCI scope stays at Stripe, SCA/3DS automatic, multi-currency presentment, Apple/Google Pay.
- **Customer Portal** for plan change, payment methods, cancellation, invoices — zero custom billing UI to maintain.
- **Stripe Tax** for automatic global VAT / GST / sales tax — essential for a global platform.

### Usage pipeline (efficient + idempotent)

- Orchestrator emits usage events → a buffered aggregator → **meter events** to Stripe in **batches**, each with an **idempotency key** (reuse the same key on retries — the idempotency discipline already in the codebase).
- Aggregate locally first so we send rollups, not per-run calls (cost + rate-limit efficiency).

### Enterprise & marketplace

- **Invoicing** + ACH / wire / PO + manual collection for Enterprise.
- **Stripe Connect (Express)** for marketplace payouts; platform **application fees** for the take-rate; Connect handles KYC, global payouts, tax forms.

### Security (global platform)

- Card data never touches us (Stripe-hosted surfaces only).
- **Webhook signature verification** on every event; **idempotent** handlers; subscription/entitlement state reconciled from webhooks → our DB (Stripe is the billing source of truth, we cache for speed).
- **Restricted API keys**; secrets via the existing vault / secret-manager (never in source — per CLAUDE.md §5.3); **Radar** for fraud; **3DS** enforced.
- Treat `customer_id` / `subscription_id` as tenant-linked identifiers; all provisioning is webhook-driven and replay-safe.

---

## 9. Feature gating — entitlement-driven

Users must "get exactly what they paid for." The clean model:

### Entitlement = the contract

Tier (+ add-ons) → a bundle of `{ boolean features, numeric quotas/limits }`. **Stripe Entitlements is canonical; mirrored to a `tenant_entitlements` table for sub-ms checks.**

### Enforce at three layers (defense in depth)

Per CLAUDE.md — *authorisation in the service, not just the gateway*:

1. **Frontend proxy boundary** (`src/proxy.ts`, already our gating line from the feature-flag work) — gates routes/UI, shows upgrade prompts. **UX only, never the security boundary.**
2. **Backend middleware** — the real enforcement: feature checks + quota / rate-limit checks on every API/gRPC call, returning a structured `ERR_ENTITLEMENT_*` with an upgrade hint.
3. **Orchestrator** — meters usage and enforces hard caps / soft-cap overage at execution time (ties into kill-switch + the spend / ratelimit alerts).

### Soft vs hard

- **Free** = hard caps (block).
- **Paid** = soft caps → overage billed → pre-emptive alert fired (the notify system).
- **Add-ons** mutate entitlements live via webhook, so "buy more" is instant.

### Migration

Evolve the current env-var feature flags into this entitlement layer — flags become *defaults*, entitlements become *per-tenant overrides*. Same `proxy.ts` boundary, richer source.

---

## 10. Team management & RBAC

Maps cleanly onto the **Clerk Organizations** already in use (`useOrganization`).

### Tenancy

`Organization = Tenant = billing account`. **The signup user is the Owner / Super Admin.**

### Roles (built-in; custom roles at Business+)

| Role | Billing | Members / settings | Build & run agents | Governance / policy | Observability |
|---|---|---|---|---|---|
| **Owner** (1, the signer) | Full (incl. delete org) | Full | Full | Full | Full |
| **Billing Admin** | Full (no org delete) | — | — | — | View |
| **Admin** | View | Invite / manage, settings | Full | Manage | Full |
| **Member** | — | — | Per-permission | Per-permission | Full |
| **Viewer** | — | — | — | — | Read-only |

### RBAC mechanics

Role → permission set across resources (agents, tools, MCP/A2A, governance, cost, marketplace-publish, settings, billing). Checks live in the **service layer** (not just the gateway). Custom roles + fine-grained permissions unlock at Business / Enterprise.

### Seats ↔ billing

- Each active member = a seat; invites consume seats; tier sets the seat ceiling; buying seats is an add-on.
- **Clerk org membership changes → webhook → Stripe subscription quantity** (and back), kept in sync idempotently.
- Seat over-limit blocks new invites with an upgrade prompt.

### Invite flow

Owner / Admin invites by email → Clerk invitation → role assigned on accept → seat counted → Stripe quantity updated.

**Enterprise:** SSO + **SCIM** auto-provisioning maps IdP groups → roles.

---

## 11. Billing lifecycle & edge cases

Design these up front:

- Free trial of Pro (card-optional, 14 days)
- Proration on upgrade / downgrade
- Dunning + smart retries (Stripe)
- Cancellation → end-of-period grace, then downgrade to Free (**not** data-delete)
- Failed payment → degrade to read-only before suspend
- Annual vs monthly (annual discount for MRR stability)
- Usage credits / committed-use discounts for Enterprise
- Entitlement reconciliation job (Stripe ↔ DB drift guard)

---

## 12. Phased rollout plan

1. **Foundations** — entitlement table + service-layer checks; convert feature flags to entitlement defaults; Stripe products/prices/meters; Checkout + Portal + Tax.
2. **Metering** — orchestrator usage events → aggregator → meter events (idempotent); usage dashboard wired to the Cost Monitor; soft/hard caps + alert hooks.
3. **Teams / RBAC** — Clerk-org seat sync, roles, invites, seat billing.
4. **Marketplace monetization** — Connect onboarding + take-rate + payouts.
5. **Enterprise** — BYOC licensing, SSO / SCIM, invoicing, residency packs.

---

## 13. Open decisions

1. **Primary value metric** — confirm "governed task run" (recommended) vs. seats-led vs. model-spend-led.
2. **Routing margin (% on governed model spend)** — include it? Most scalable line but needs the savings story airtight. *Recommendation: yes, 5–8%, only ever shown net-of-savings.*
3. **Free-tier generosity** — aggressive (PLG land-grab, higher COGS) vs. conservative.
4. **Marketplace take-rate** — 20% default?
5. **Anchor prices** for Pro / Business — needed to model real unit economics against infra costs.

### Suggested next step

Turn this into an **implementation plan**: schema for `tenant_entitlements` / `roles` / `usage_events`, the Stripe webhook + meter pipeline, the RBAC service layer, and the proxy/entitlement gating.

---

## 14. Cost-leadership & quality roadmap

The "routing dividend" (§2) and "provable savings" (§7) only hold if Actrone is *genuinely* cheaper while quality, factuality, and security are guaranteed. The full technical roadmap lives in **[cost-leadership-and-quality-waves.md](cost-leadership-and-quality-waves.md)**; this is the strategy-altitude summary.

**Governing principle:** a closed-loop optimizer that **captures cost only as the residual — after quality, groundedness, and security floors are provably met on governed traces.** We never trade quality, factuality, or safety for cost; we measure the result on every call so the bill is auditable.

**The four waves:**

| Wave | What it adds | Guarantees advanced | Moat |
|---|---|---|---|
| **1 — Parity foundation + measurement spine** | Semantic cache, provider-native prompt caching, prompt compression, durable batch arbitrage, **savings + quality attribution telemetry** | Efficiency (zero-risk), measurability | Table-stakes capability with a control-plane execution edge (governed caching, verified hits). **Not the moat** — cost of entry |
| **2 — Quality & groundedness gate** | Continuous eval harness, per-agent quality/groundedness/cost floors, groundedness verifier, abstain-over-fabricate, quality circuit-breaker | Quality, hallucination control | Outcome-driven gate fed by *governed* results — gateways have no outcome signal |
| **3 — Control-plane-only optimizers** | Model cascades, trace-driven predictive routing, multi-agent budget allocation, memory-as-cache | Efficiency (deepest wins), quality (gated) | Workflow-level optimization impossible for a stateless gateway |
| **4 — Distillation flywheel** | Per-tenant distillation of governed traffic into a cheap specialized model; eval-gated promotion; auto-rollback | Efficiency (compounding), all guarantees gated | The bet: agents get cheaper the more they're used; proprietary, structurally un-copyable |

**Why it ties to monetization:**

- The **savings-backed routing dividend** (§6) is only honest if savings are real and measured — Wave 1's attribution spine + the eval gate make that auditable.
- **Wave 4 economics:** running a tenant's flywheel costs us ~tens–low-hundreds $/mo (fine-tune + eval; serving outsourced per-use) against customer savings that can be far larger → **~70–85%+ gross margin** on the dividend, customer still nets ahead. Full worked example in the companion doc.
- **Ownership stance (Wave 4):** the customer owns their data and their distilled model (downloadable on the open-weight/self-host path; access + dataset on the closed-provider path); strict tenant isolation; the **open-weight, exportable** path is a Business/Enterprise selling point. Portability is a feature, not a hostage — the moat is the compounding curve, not holding their weights.

**Honest framing:** Wave 1 alone = parity ("just like everyone else"). Actrone *with Waves 2–4* = better than every competitor, because cost optimization sits inside a governed agent runtime instead of a gateway. Lead the pitch with the gated optimizer + flywheel, never with "we have a cache."

> **Bound, not zero:** hallucinations are inherent to LLMs — the platform *measurably reduces and bounds* them to a customer-set tolerance via grounding + verification + governance + continuous eval. It does not eliminate them; claiming otherwise would be overselling.

### Monetizing eval & memory depth

The eval and memory deep-dives (waves doc §8–§9) aren't *cost-savers* — they're **quality/assurance and capability** levers, and they monetize differently: as **tier gates, an assurance add-on, and two usage meters.** This is expansion revenue that doesn't depend on the savings story.

**As tier gates (capability walls, not artificial locks):**

| Capability | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| Eval (sampled, offline datasets) | basic | full | full | full |
| **100%-of-production online eval** | — | — | ✅ | ✅ |
| **Eval-as-governance** (block-on-floor, signed record) | — | — | ✅ | ✅ |
| Memory (two-tier, budget-aware) | capped | ✅ | ✅ | ✅ |
| **Structured memory** (extraction, graph, consolidation) | — | ✅ | ✅ | ✅ |
| **Governed memory** (PII redaction, residency, right-to-erasure) | — | — | ✅ | ✅ |
| **Portable / sovereign memory** (own + export + self-host) | — | — | — | ✅ |

**As an add-on — the "Assurance pack":** actionable evals + provenance ("cited") memory + groundedness gating + the hallucination-rate SLA, sold to regulated buyers who need *provable* factuality without going full Enterprise. This is the highest-willingness-to-pay bundle because it maps to audit/compliance risk, not convenience.

**As meters (two new, both reflecting real COGS):**

- **Evaluation / judge operations** — LLM-as-judge + online-eval calls cost us model spend; meter them (included bucket per tier, overage above). Naturally caps free-tier eval compute.
- **Retained memory (GB-months) + memory operations** — already in the §2 meter set; the structured/graph tiers increase storage + compute, so this meter scales correctly with depth.

**The framing:** eval and memory don't sell on "cheaper." They sell on **"provably better and compliant"** — actionable, governed, verifiable, self-improving. That's a different buyer (risk/compliance, not FinOps) and a second expansion axis alongside the savings-backed dividend. The two **flywheels** (model, §7 + memory, waves §9.3) compound the lock-in underneath both.

---

## 15. EMAOP & extensibility revenue lines

> This section completes the revenue map: it folds the EMAOP capability gates (from
> [EMAOP_Actrone_Integration_Plan.md §9](./EMAOP_Actrone_Integration_Plan.md)) and the new
> surfaces from [Actrone_EMAOP_Models_Extensibility_Channels_Plan.md](./Actrone_EMAOP_Models_Extensibility_Channels_Plan.md)
> into one place, so **every** point where Actrone captures value is accounted for. Pricing
> figures remain illustrative anchors — validate against willingness-to-pay.

### 15.1 The complete revenue map (every line Actrone earns on)

| # | Revenue line | Structure | §ref |
|---|---|---|---|
| 1 | **Platform subscription** (seats + entitlements + included usage) | Recurring per tier | §2–§3 |
| 2 | **Governed task-run meter** (primary value metric) | Included bucket + overage | §2 |
| 3 | **Retained memory** (GB-months) + memory ops | Metered | §2, §14 |
| 4 | **Active connections** (MCP + A2A + enterprise connectors) | Metered / per-connection | §2 |
| 5 | **Routing dividend** (margin on *managed* model spend, net-of-savings) | % on governed spend | §2, §6 |
| 6 | **Marketplace take-rate** (Stripe Connect) | ~20% application fee | §4 |
| 7 | **Eval / judge operations** meter | Included + overage | §14 |
| 8 | **Assurance pack** add-on (groundedness + hallucination SLA) | Flat add-on | §14 |
| 9 | **BYOK governance fee** (per governed task on customer keys) | Per-task platform fee, **no token markup** | §15.2 |
| 10 | **Vertical agent packs** (HR/Finance/IT/Procurement) | ~$299/vertical/mo | EMAOP §9 |
| 11 | **Compliance packs** (GDPR/POPIA/SOC2/HIPAA) | ~$199/pack/mo | EMAOP §9 |
| 12 | **Browser capability** upsell (read-only → authenticated → form-submit → autonomous) | Drives tier migration | EMAOP §9 |
| 13 | **Enterprise connectors** (SAP/Workday/Oracle/ADP) | Business+ gate | EMAOP §9 |
| 14 | **Custom connectors** (no-code REST included; code/SDK + connector-webhook hosting) | Tier gate + hosting | Models plan §2 |
| 15 | **Multi-channel comms** (Telegram/Slack included; **WhatsApp metered add-on**) | Per-conversation passthrough + margin | Models plan §4 |
| 16 | **Framework-adapter routing** (BYOF agents routing through the gateway) | Routing dividend on others' agents | Models plan §3 |
| 17 | **Governed deployments** (canary/rolling + instant rollback + audited promote) | Business/Enterprise capability gate | Models plan §7 |
| 18 | **SIEM integration** (Splunk/Datadog/Sentinel) | Enterprise gate | EMAOP §9 |
| 19 | **Regulator audit export** (read-only shareable) | Enterprise gate | EMAOP §9 |
| 20 | **Single-tenant / self-hosted / on-prem license** | 2–3× premium / one-time + support | EMAOP §9 |
| 21 | **Professional services** (custom connectors, SSO, compliance, training) | $20k–$200k/engagement | EMAOP §9 |
| 22 | **Distillation flywheel dividend** (cheaper-the-more-used, gated) | Margin on Wave-4 savings | §14 |
| 23 | **Hosted-runtime worker compute** (BYOF-hosted agents — dedicated pod execution) | Metered **GB-second / vCPU-second**, included bucket + overage | §15.8 |
| 24 | **Build minutes** (BYOF image verify/scan; `code`-bundle build when shipped) | Included bucket + metered overage | §15.8 |
| 25 | **Reserved warm pool** (per-tenant zero-cold-start hosted capacity) | Base fee per provisioned pool | §15.8 |

Lines 1–8 + 22 are the *core* platform economics; 9–21 are the EMAOP/extensibility expansion that lifts ARPU 10–50× into regulated-enterprise territory; **23–25 are the BYOF-hosted-runtime compute economics (§15.8) — the only lines whose COGS is dedicated per-tenant infra rather than shared platform capacity.**

### 15.2 BYOK vs Actrone-managed — the two model-payment modes

The single most important new pricing decision. Both are first-class; the org picks per environment.

| | **Actrone-managed** (default) | **BYOK** (bring your own key) |
|---|---|---|
| Who pays the provider | Actrone (we hold keys) | **Customer, billed directly by OpenAI/Anthropic/…** |
| Actrone earns | Subscription + governed-task meter + **routing dividend** (line 5) | Subscription + governed-task meter + **BYOK governance fee** (line 9) — *no token markup* |
| Savings flywheel | Full (cache/route/batch, credited) | Caching still cuts *their* provider bill; routing limited to their keys |
| Gross margin | Routing dividend ~near-pure on spend we already run | Governance fee is ~pure SaaS margin (no COGS pass-through) |
| Why the customer chooses it | Zero setup, provable net-negative bill | Direct provider contracts, data-residency/compliance sign-off, cost control |

**Why BYOK is good for revenue, not a leak:** it converts deals procurement would otherwise **block** (enterprises that contractually must use their own provider agreements). We trade the token markup we'd never have won anyway for a **clean, COGS-free governance fee** on a customer we'd otherwise lose. BYOK is a *door-opener for the high-ACV Business/Enterprise tiers*, not a discount. Surface the mode choice transparently at checkout (the comparison block in Models plan §1.5) so the customer feels in control — which itself drives conversion.

**Honest framing rule (extends §6):** never imply BYOK customers get the routing dividend savings — they get caching savings on their own bill + governance value. Show it accurately in the Cost Monitor (managed = "net −$Z"; BYOK = "your provider spend $P, our fee $Q, caching saved you $R").

### 15.3 Framework-adapter routing — a TAM-expansion revenue line

The OpenAI-compatible gateway (Models plan §3) lets agents built in **LangGraph, CrewAI, AutoGen, OpenAI Agents SDK, Cursor SDK, OpenClaw**, etc. route their inference through Actrone. Each such call earns the **routing dividend + governance fee** *without the customer having built their agent on Actrone*. This is a structural TAM expansion: we monetize **governance + routing for the entire agent-framework ecosystem**, not just agents authored on our SDK. Positioning: *"Keep your framework. Add Actrone's governance, audit, routing, and savings underneath."* Particularly potent as an **OpenClaw migration funnel** (68k-star install base → governed Actrone tenants).

### 15.4 Multi-channel comms — included vs metered

- **Telegram + Slack + email approvals:** *included* on paid tiers — they're free/cheap to operate (Telegram Bot API is free) and they are a **retention + addiction driver** (approve from your phone), so give them away to deepen daily engagement.
- **WhatsApp Business:** **metered add-on** — the Business Cloud API charges per conversation and needs template approval; pass the per-conversation cost through with margin and gate it to Business+. Enterprises with customer-facing WhatsApp will pay for it.

### 15.5 Governed deployments — a capability gate, not a meter

Canary/rolling rollout, instant rollback, and **governed/audited promotion** (Models plan §7) are a **Business/Enterprise capability wall** (Free/Pro get basic deploy + previous-version rollback only — mirroring Vercel's Hobby-vs-Pro rollback split). The value: safe autonomous-agent change management with a regulator-grade deploy history. This is a trust gate worth a tier jump, not a usage meter.

### 15.6 Frontend alignment required (so pricing and product agree)

To keep the product aligned with this revenue map (the "update the frontend so everything is aligned" requirement — *plan only, no code here*):

- **Pricing page**: add the **"How you pay for models" (managed vs BYOK)** comparison block (§15.2) and reflect lines 9–17 in the tier matrix. Reconcile to the **standardized tier names** (Free / Pro / **Scale** / Enterprise — per EMAOP §0.3, not "Business").
- **Checkout**: surface the managed-vs-BYOK choice + the model-cost estimator transparently *before* purchase.
- **Settings → Models** (new): BYOK key entry + validation + per-env model picker (Models plan §1).
- **Settings → Usage / Cost Monitor**: split savings/spend by key ownership (managed vs BYOK) and by provider/model (Models plan §1.5).
- **Settings → Channels** (new): connect Telegram/Slack/WhatsApp/email; WhatsApp shows its metered-add-on pricing.
- **`FEATURE_MATRIX`** (entitlements): add ids for `byok`, `channels_whatsapp`, `custom_connector_code`, `framework_adapters`, `governed_deploys`, wired through the existing `FeatureGate`/`UpgradeModal` so every gate has an upgrade CTA.
- **Marketplace + deployments**: ensure take-rate (line 6) and governed-deploy gate (line 17) are visible where the actions live.

### 15.7 Updated open decision

Add to §13: **BYOK governance-fee level** — what per-governed-task fee replaces the token markup for BYOK tenants, such that BYOK is margin-positive yet visibly cheaper-to-the-customer than managed-with-markup for high-volume frontier usage. *Recommendation: a flat per-governed-task governance fee + the standard subscription, modeled to land ≥ 70% gross margin while beating the customer's all-in managed cost at scale.*

### 15.8 BYOF-hosted runtime — base fee + pay-per-compute (the new infra meters)

When a customer **deploys their framework agent to Actrone** ([BYOF Worker Harness Design](./Actrone_BYOF_Worker_Harness_Design.md)) — vs merely routing inference through the gateway (line 16, *connected*) — we run their loop as a durable Temporal execution on a **dedicated per-tenant worker pool**. That pool is real EKS compute, billed to us whether or not it is busy. This is the **one place** in the platform where COGS is dedicated per-tenant infra, so it gets its own meter set rather than hiding inside the governed-task-run meter. **Pricing = capability-gate base fee + pay-per-compute**, mirroring the Lambda/Fargate/Vercel-Functions shape the market already understands:

| Meter | Shape | What it covers | Maps to |
|---|---|---|---|
| **Hosted capability gate** | the tier (Scale/Enterprise) | the right to deploy a hosted agent at all — *the base fee* | extends §15.5 (governed deploys gate) |
| **Worker compute (active)** | metered **GB-second + vCPU-second** of harness-pod runtime while a hosted task executes, at the agent's **named pod size** | the durable run itself — the real marginal COGS | line 23 |
| **Build minutes** | included bucket + overage | image digest verify + Trivy/SBOM scan now; `code`-bundle build (install/SBOM/seal) when shipped | line 24 |
| **Reserved warm pool** | base fee per provisioned pool | tenants who want zero cold-start pay for idle warm capacity (provisioned-concurrency model, P6-C) | line 25 |

**Compute is metered at a fixed named pod size, not free-form cpu/memory.** A hosted agent runs at one of four presets — `small` (0.5 vCPU / 1 GiB), `medium` (1 / 2), `large` (2 / 4), `xl` (4 / 8) — each a **valid EKS-on-Fargate task configuration** so it provisions exactly one microVM and the GB-s/vCPU-s attribution is clean (Infra Plan §4.2). The catalogue, its tier ceiling, and the Fargate per-pod overhead constant are the single source of truth in `internal/domain/podsize.go` ([BYOF Design §5.5](./Actrone_BYOF_Worker_Harness_Design.md)). **Hosting is itself a Scale/Enterprise capability** (the base-fee gate above): Free and Pro tenants get **no** pod-size entitlement — they run connected + manifest agents, which provision no pod and so incur no compute line. `scale` tops out at `large`, `enterprise` at `xl`; bigger/dedicated needs move to a single-tenant Karpenter pool billed as reserved capacity (line 25), never the per-task GB-s meter.

**What does *not* change:** a hosted agent's inner model calls, memory ops, tool calls, and routing **still meter exactly as today** (lines 2/3/4/5/9) — hosted adds the *compute* lines on top, it doesn't replace the governed-run economics. Every governed call runs MAL/DPE/routing/audit/cache regardless of execution locus.

**What incurs the per-pod meter is *hosted code*, not "BYOF" (important):** the active-compute lines (23–24) apply to **any hosted agent that runs code in the harness pod** — that is **both** third-party-framework agents **and** agents authored on the **Actrone SDK** (`framework: actrone_sdk`) when they are *hosted*. They are mechanically identical (a harness pod loading an entrypoint), so they bill identically ([BYOF Design §6.4](./Actrone_BYOF_Worker_Harness_Design.md)). Two cases carry **no** per-pod meter: (a) a **declarative-manifest** agent — it runs on the shared Go kernel, no pod, so it is covered entirely by the existing task-run + inference + memory meters; (b) any **connected** agent (SDK-code or framework running in the *developer's own* process) — nothing executes on our compute, billed only on inference/memory/tool/routing. So the rule is: **hosted + code ⇒ GB-second meter; manifest or connected ⇒ no compute meter.** All styles share the *deployment UX* (CLI `actrone deploy` → build/validate → promote/rollback/canary → audited). The pricing page must keep this honest so a manifest-agent or connected-SDK customer is never charged a worker-pool line they don't incur.

**Dedicated worker pools for native/EMAOP — a separate Enterprise line (not the GB-s meter).** Native/EMAOP default to the shared kernel, but an Enterprise can opt into a **dedicated per-tenant worker pool** (single-tenant isolation, residency, noisy-neighbour) on the **same P6-C pool machinery** ([BYOF Design §6.4](./Actrone_BYOF_Worker_Harness_Design.md)). Because native agents have **no per-task pod spin-up** (the shared kernel just runs their activities on a tenant-bound queue), this is priced as **reserved capacity / single-tenant** (line 20 / line 25 economics, 75–85% margin), **not** the per-task active GB-second meter. So the axis is: *active per-pod compute (BYOF) = metered GB-s (lines 23–24)*; *dedicated isolation (native or BYOF) = reserved base fee (line 25 / single-tenant line 20)*. Don't fold dedicated-native into the active-compute meter — native incurs no per-task pod cost, only the reserved-pool cost.

**Margin design (extends the §2 table):** worker compute is **usage-overage economics (55–70% gross margin)** — priced as a multiple of marginal GB-s COGS, protected by the same three guardrails (hard caps on Free, spend kill-switch, pre-bill alerts) so a runaway hosted loop is bounded server-side by entitlements before it becomes a surprise bill. The reserved warm pool is **subscription economics (75–85%)** — capacity sold ahead of consumption.

**Open decisions (add to §13):** (a) GB-s + vCPU-s unit prices and the per-tier included compute bucket; (b) whether reserved warm pools are Enterprise-only or a Scale add-on; (c) build-minute bucket sizes; (d) whether to bill `code`-bundle builds at a premium over `image` verify (we own more COGS on the build).
