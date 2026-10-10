# Actrone — Additions Implementation Plan

> Source: `docs/additions.txt`. This plan maps every one of the 26 asks to what **already exists** in
> the codebase, what is **partial**, and what is **net-new**, then specifies exactly where each change
> wires in. **No code has been written** — this is the analysis + build plan you asked for.
>
> Honesty rule applied throughout: where something is already built or redundant, it is marked ✅ and the
> "work" is reduced to the true residual. Direct questions are answered inline under **Answer**.
>
> Owner: Matt · Drafted: 2026-07-12 · Status: PLAN ONLY (awaiting go-ahead + sequencing)

---

## Status legend

| Badge | Meaning |
| --- | --- |
| ✅ **BUILT** | Already exists and satisfies the ask (residual is minor or nil) |
| 🟡 **PARTIAL** | Real foundation exists; a specific, bounded gap remains |
| 🔴 **NET-NEW** | Must be built from scratch |
| ❓ **ANSWER** | A question — answered directly; may or may not carry follow-on work |
| ⚠️ **CAUTION** | Conflicts with a standard (usually CLAUDE.md §5 security) — read before doing |

---

## Executive summary — the honest scorecard

| # | Ask | Verdict |
| --- | --- | --- |
| 1 | Dev full-tier by default / change tier via env | 🟡 Enforcement already OFF in dev (effectively full-tier); add a `DEV_TIER` override |
| 2 | Feature-flag revamp → **feature packs** (UI + routes + docs) | 🟡 6-flag system + edge gate exist; expand to packs + backend + docs filtering — **taxonomy + env model confirmed (A2.1)** |
| 3 | Docs AI assistant as a resizable right **drawer** | 🟡 "Ask Assistant" button + inline input exist; drawer/resize is the build |
| 4 | Platform-wide **bad/fine/good feedback** + analytics | 🔴 Only per-doc feedback exists; platform-wide system is net-new |
| 5 | Requirements-gate **BYOK/Managed stepped wizard** | 🟡 Chooser + `/settings/models` (add-key, validate, cost) exist; inline stepper is the build |
| 6 | SEO top-notch + own category vocabulary | 🟡 Metadata exists; category-vocabulary + structured-data pass needed |
| 7 | EMAOP agents message via **Telegram/WhatsApp/Slack/email** | ✅ Approvals+alerts BUILT; only free-form two-way **chat** is net-new |
| 8 | EMAOP **enterprise-premium** look/feel (beat "openclaw") | 🟡 Surfaces exist; a focused craft pass + the transparency drawer (#17) carry it |
| 9 | Is EMAOP still leveraging SDK/orchestrator (memory, governance)? | ❓ **Yes** — answered below with the exact wiring |
| 10 | CLI **actionable** failure steps + aesthetic UX | 🟡 CLI + styled output exist; per-error remediation hints are net-new |
| 11 | Every repo gets a real `.env` with values | ✅ **Scope confirmed: `.env.example` files ONLY** (no committed `.env`) |
| 12 | Trivy **CVE-2026-33634** hardening | ✅ **Already mitigated** in infra CI; residual is a one-repo sweep |
| 13 | "Most Popular" text on Scale card → black | 🔴 Trivial one-liner |
| 14 | Tier-4 cosmetic: retired brand hex only in aura/icon/tests | ✅ Matches the known residual; verify + optionally purge |
| 15 | Monetization for 10× revenue + complete the strategy doc | 🟡 `monetization-strategy.md` + billing spine exist; expand + align FE |
| 16 | Which data laws? GDPR/PIPEDA/AU-Privacy/POPIA/NDPR/GPA | ❓ Answered below; **most are net-new as frameworks** |
| 17 | Control Tower **agent transparency** (activities/failures/drawer) | 🟡 Trace viewer + control-tower feature exist; the rich per-agent drawer is the build |
| 18 | EMAOP chat **strictness** (single-agent, RBAC-scoped, on-topic) | 🟡 Chat exists; RBAC-scoping + topic-guard is net-new |
| 19 | **LISTEN/NOTIFY** fleet-wide instant refresh | 🔴 Net-new upgrade to the existing TTL-refresh (my prior note) |
| 20 | MCP servers categorized? custom MCP? pre-populate more? | ❓ **Categorized ✅ + custom ✅**; catalog expansion is the build |
| 21 | Other integrations categorized by functionality? | 🟡 Partly; unify the taxonomy |
| 22 | Smart, aware **loading**/skeleton system | 🟡 One route-level `loading.tsx`; a real skeleton system is net-new |
| 23 | Header env-switcher **blocking buttons** + content gap bug | 🔴 Layout bugfix |
| 24 | Widen Control Tower **settings** pages | 🔴 Layout change |
| 25 | **Billing inside** Control Tower (not marketing pricing) | ✅ **Already in-app** (Stripe Checkout + Portal); residual is upgrade-context polish |
| 26 | Expand EMAOP **integrations + templates** (beat LangChain) | 🟡 Rich base exists; research-driven expansion |

**Bottom line:** ~7 items are already built (7, 12, 25) or trivial (13, 14) or pure answers (9, 20); the
real engineering concentrates in **feature-packs (2)**, **EMAOP transparency + premium (8/17/18)**,
**data-law frameworks (16)**, **feedback (4)**, and the **BYOK/Managed wizard (5)**.

---

## Answers to the direct questions (read first)

### Q9 — Is everything EMAOP still leveraging the Actrone SDK + orchestrator (memory, governance, …)?
**Yes, for no-code (manifest) EMAOP agents — they run *inside* the orchestrator kernel, not beside it.**
A manifest agent's turn goes through `runAgenticLoop` in the orchestrator; on that path it gets:
- **Memory** — `memorydepth` retrieval/ingest via [`memorydepth_hook.go`](backend/orchestrator/internal/service/memorydepth_hook.go) (facts, bitemporal graph, blocks, the new A5 rerank), gated by `EnableMemoryDepth`.
- **Governance** — DPE pre/post checks, the rules engine, MAL PII tokenisation, and the HMAC audit spine, all in the activity path.
- **Cost/model governance** — the managed router, reasoning-effort ceilings, eval gate, cost optimizer.

**The one honest caveat:** *BYOF* (bring-your-own-framework) agents that run **custom code in a pod** execute their own loop; they leverage Actrone through the **harness + governed egress + MAL boundary + audit**, not the in-kernel memory loop. So "governance/audit/MAL = always; in-kernel memory/loop tools = the no-code manifest path." This is by design (the "pod principle"). No gap to close — but worth stating in the EMAOP UI so users know which powers apply to which build mode.

### Q16 — Which data laws do we have, and do we have GDPR / PIPEDA / Australian Privacy Act / POPIA / NDPR / GPA?
Honest current state (two different layers — don't conflate them):
- **Certification frameworks** (trust center, sealed evidence) in [`compliance/catalog.go`](backend/orchestrator/internal/compliance/catalog.go): **SOC 2, ISO 27001, ISO 27701, ISO 27018 only.**
- **GDPR** — present as *capability*, not a certification: executed **DPA automation** (`internal/agreements`), right-to-erasure + provable forgetting (memory Moat F), data-residency EU pinning, and the `compliance_gdpr` entitlement. So GDPR obligations are largely **operationalised**, just not surfaced as a "framework."
- **POPIA** — exists only as a **governance policy pack** (`popia-baseline`, `financial-services-za` in the system-design doc), i.e. runtime guardrails, **not** a data-law compliance surface.
- **PIPEDA (Canada), NDPA 2023 (Nigeria), Ghana GPA, Australian Privacy Act** — **not implemented** at any layer today.
- ⚠️ **Correction to the ask's wording:** Nigeria's current law is the **Nigeria Data Protection Act (NDPA) 2023** (regulator: NDPC); the **NDPR 2019** it replaced ceased to be law on **19 Sept 2025**. We build against NDPA, not NDPR. (The NDPC is also actively reviewing the NDPA for AI — worth tracking.)

**Implication for the launch markets** (wave 1: the United States, Canada, the United Kingdom, Ireland, the Netherlands and South Africa; Australia and Kenya in wave 2; the full list is in `Actrone_Launch_Markets.md`):
the compliance work is **phased to match**, built off **one shared GDPR-shaped engine** (see WS-G). Each
first-wave market's delta: **EU** = formalise GDPR (mostly re-mapping what we have); **UK** = UK GDPR, close to the EU work; **Africa** =
POPIA → NDPA → GPA; **Canada** = PIPEDA (+ Quebec Law 25); **US** = surface SOC 2 + DPA we already have,
plus **CCPA/CPRA** (California). **Australia** (Privacy Act / APPs) comes in a later wave. See **WS-G**.

### Q20 — Are MCP servers categorized? Can users connect custom/other MCP servers? Should we pre-populate more?
- **Categorized: ✅ yes.** [`mcphub/catalog.go`](backend/orchestrator/internal/mcphub/catalog.go) carries a `Category` per server ("First-party", "Developer", …).
- **Custom/other servers: ✅ yes.** `privatecatalog.go` is the per-tenant private/custom MCP registry — users are **not** limited to the curated set.
- **Pre-populate more: recommended, with a caveat.** We are an MCP **client** with a ~24-server curated catalog. We should *not* try to mirror "all servers from all providers" (unbounded, and each is a trust/security surface we'd implicitly endorse). Better: **expand the curated catalog along the category axis** the user named (Messaging, E-commerce, Productivity, Payments, Data, DevOps) with vetted, widely-used servers, and lean on the custom-connect path for the long tail. Candidate additions in **WS-H**.

### Q21 — Are other integrations categorized by functionality?
🟡 Partly. The MCP catalog is categorized; the broader capability/integration registry uses category-ish tags but not a single unified functional taxonomy across MCP + native connectors + channels. **WS-H** unifies them onto one taxonomy so the UI can group everything consistently.

### Q10 (part) — Does the CLI have an aesthetically pleasing UI/UX?
🟡 Yes, baseline: `actrone-cli` has styled/structured output. It does **not** yet emit **actionable remediation steps per failure** — that's the net-new part of the ask (**WS-I**).

### Q22 (part) — Do we already have loading pages / skeletons / spinners?
🟡 Minimal: exactly one route-level [`loading.tsx`](frontend/apps/control-tower/src/app/%28app%29/loading.tsx) and ad-hoc spinners. There is **no** shared skeleton system and nothing "aware of what's loading." That's the build (**WS-B**).

---

## Workstream A — Feature-pack gating & dev tiers (asks #1, #2)

### A1 · Dev full-tier by default + env-var tier override — 🟡 PARTIAL
**Current:** [`entitlements.ts`](frontend/apps/control-tower/src/lib/entitlements.ts) resolves tier from IdP
`publicMetadata.tier`, defaulting to `free`, and `ENTITLEMENTS_ENFORCED` is **OFF** by default. With
enforcement off, `FeatureGate` never locks — so in local dev you effectively already see everything.
What's missing is the ability to **simulate a specific tier** (to test gating) and a guaranteed
"everything unlocked" dev default.

**Build:**
- Add `NEXT_PUBLIC_DEV_TIER` (dev-only) read in `tierFromMetadata()` / the resolver: when set and
  `NODE_ENV !== 'production'`, it overrides the resolved tier (`scale`/`enterprise` to unlock all).
- Guard it so it is **inert in production** (ignored regardless of value) — least privilege preserved.
- Document in the control-tower `.env` (WS-J) with `NEXT_PUBLIC_DEV_TIER=enterprise` as the dev default.

**Wires:** `entitlements.ts`, `entitlements.server.ts`, `useEntitlements.ts`. ~0.5 day.

### A2 · Feature-flag revamp → **feature packs** across UI + routes + docs — 🟡 PARTIAL → big
**Current:** two parallel `flags.ts` ([control-tower](frontend/apps/control-tower/src/lib/flags.ts) +
[marketing](frontend/apps/marketing/src/lib/flags.ts)) expose 6 coarse flags (`hosted`, `marketplace`,
`pricing`, `docs`, `signin`, `signup`), enforced at the edge in
[`proxy.ts`](frontend/apps/control-tower/src/proxy.ts) (disabled pages → `/coming-soon`, disabled APIs →
404) and in `GatedLink`. This is **frontend-only** and **feature-grained**, not **pack-grained**, and the
**backend does not read it**.

**Build — introduce a Feature Pack layer:**
1. **Shared pack definition** (single source, consumed by all apps): `FEATURE_PACKS` mapping a pack →
   its member features, routes, nav/footer links, API-route prefixes, and **docs sections**. Packs model
   your phased rollout (e.g. `core`, `emaop`, `marketplace`, `voice`, `governance`, `compliance`,
   `self_host`). Driven by `NEXT_PUBLIC_PACK_*` env vars, default **OFF** (fail-safe dark, matching the
   existing flag philosophy).
2. **UI enforcement:** a pack-off hides every nav/header/footer link and page for that pack (extend
   `gatedFeatureForHref` → `gatedPackForHref`; `proxy.ts` rewrites/404s by pack).
3. **Backend enforcement (net-new):** a lightweight `packguard` middleware in the orchestrator (chi) that
   404s/403s API-route prefixes belonging to a disabled pack. Pack config comes from an env var mirrored
   server-side (`ORCHESTRATOR_PACKS_ENABLED`). This is the security boundary the ask requires ("all
   backend routes and everything also disabled/inaccessible").
4. **Docs filtering:** the docs nav in [`DocsLayoutClient.tsx`](frontend/apps/marketing/src/app/%28marketing%29/docs/DocsLayoutClient.tsx)
   and the docs route tree render **only** sections whose pack is enabled; disabled docs routes 404 via
   the marketing edge gate.
5. **Consolidate** the two `flags.ts` into one shared module (packages/ui or a shared lib) to kill drift.

#### A2.1 · Pack taxonomy, enablement & composition (your confirmed answers)

**Taxonomy — LOCKED (per your confirmation):** `core`, `emaop`, `marketplace`, `voice`, `governance`,
`compliance`, `self_host`. **`core` is the base pack** (platform shell, auth, Control Tower home) that
every other pack depends on.

**How each pack is enabled (env):** one boolean var per pack, per runtime — enabling several = set several
to `true` (`true`/`1` = on):
- **Frontend** (Next.js inlines these at build, so they must be static `process.env.NEXT_PUBLIC_*`):
  `NEXT_PUBLIC_PACK_CORE`, `NEXT_PUBLIC_PACK_EMAOP`, `NEXT_PUBLIC_PACK_MARKETPLACE`,
  `NEXT_PUBLIC_PACK_VOICE`, `NEXT_PUBLIC_PACK_GOVERNANCE`, `NEXT_PUBLIC_PACK_COMPLIANCE`,
  `NEXT_PUBLIC_PACK_SELF_HOST`.
- **Backend** (orchestrator — the real security boundary): mirrored `ORCHESTRATOR_PACK_CORE` …
  `ORCHESTRATOR_PACK_SELF_HOST`.

**"Does default-OFF mean everything is enabled?" — No. The default is environment-aware**, because prod and
dev want opposite defaults:
- **Production → default OFF (fail-safe dark).** An unset or typo'd var = pack **dark**. This is the entire
  point of launch gating: a pack stays hidden (UI + routes + docs) until you explicitly flip
  `…_PACK_EMAOP=true` on launch day. This matches the existing flag philosophy (default OFF = disabled).
- **Development → default ON (everything visible).** So `npm run dev` shows the whole platform without
  setting 7 vars. Implemented as "unset ⇒ ON when `NODE_ENV !== 'production'`", plus a single master
  `NEXT_PUBLIC_PACKS_ALL=true` escape hatch. This pairs with `NEXT_PUBLIC_DEV_TIER=enterprise` (A1) so dev
  sees everything, unlocked.
- So "default-off = everything enabled" is **only true in dev**; in **prod, default-off = everything
  disabled** — which is what you want for a staged rollout. (If you'd rather have ONE rule everywhere —
  default OFF in every environment — we ship a committed `.env.example` that turns all packs on for local
  dev instead; say the word.)

**"Enable EMAOP while keeping core enabled?" — packs are independent booleans + a dependency graph:**
Setting `PACK_EMAOP=true` does **not** touch `PACK_CORE`. To run both, set both:

```bash
NEXT_PUBLIC_PACK_CORE=true
NEXT_PUBLIC_PACK_EMAOP=true
```

On top of that, each pack declares its dependencies (`emaop.dependsOn=[core]`, `voice.dependsOn=[core,emaop]`,
`compliance.dependsOn=[core,governance]`, …). The resolver **auto-enables dependencies** — turning on EMAOP
implies `core`, so **core can never be silently dropped** when a dependent pack is on. (Alternative: fail
fast at startup with `"pack emaop requires core"` — I recommend auto-enable as the more ergonomic default:
you enable the leaf pack you care about and its base packs come along.)

**Migration note:** keep the 6 existing feature flags working (map them into packs) so nothing regresses.
**Wires:** new `packs.ts` (shared), both `proxy.ts`/middleware, `DocsLayoutClient.tsx`, new orchestrator
`packguard` middleware + `main.go` route registration. **Effort: 3–4 days** (the backend guard + docs
filtering are the new surface).

---

## Workstream B — Control Tower UX & transparency (asks #17, #22, #23, #24)

### B1 · Agent transparency — activities/tasks/failures/retries drawer — 🟡 PARTIAL
**Current:** there is a `components/features/control-tower` surface and a **Trace Viewer** (docs +
route exist), plus `escalations`, `evals`, `governance` features. The data exists (tasks, tool audit,
governance events, audit spine, retries). What's missing is the **unified per-agent activity drawer** the
ask describes — click an agent/log → a right drawer with the full timeline (every task, tool call,
failure, retry, governance decision, memory retrieval, and **what Actrone did for the agent**: blocks,
redactions, escalations caught, cost saved).

**Build:**
- A `AgentActivityDrawer` (reuse the drawer primitive from B/#3) fed by a consolidated read model:
  task runs + tool_audit + governance decisions + memory-retrieval audit + retry counts, joined per
  agent/run. Visual timeline + counters ("3 policy blocks, 2 retries auto-recovered, $0.12 saved by
  cascade").
- Likely one new **read endpoint** aggregating these per agent (server owns the join; UI renders).
- Emphasise the "Actrone's power working for you" framing (turns transparency into a trust/retention moat
  — ties to WS-D premium and WS-F monetization).

**Wires:** new drawer component + `lib/api` read; backend aggregation handler. **Effort: 3–4 days.**

### B2 · Smart, aware loading / skeleton system — 🟡 PARTIAL → mostly net-new
**Current:** one route-level `loading.tsx`; ad-hoc spinners. **Build:** a skeleton primitive set in
`packages/ui` (card/table/list/drawer skeletons using existing tokens), per-route `loading.tsx` files for
the heavy Control Tower routes, and a "what's loading" affordance driven by the actual in-flight queries
(label the skeleton with the resource being fetched). **Effort: 2–3 days.**

### B3 · Header env-switcher blocking buttons + content-gap bug — 🔴 BUGFIX
**Current:** [`TopBar.tsx`](frontend/apps/control-tower/src/components/layout/TopBar.tsx) +
[`EnvironmentPill.tsx`](frontend/apps/control-tower/src/components/layout/EnvironmentPill.tsx) +
[`OrgBar.tsx`](frontend/apps/control-tower/src/components/layout/OrgBar.tsx). The env/apikey selectors sit
in a bar that (a) overlaps page action buttons and (b) has no gap to content (team-settings scroller
rides into the selectors). **Build:** fix stacking/`z-index` + reserve vertical space (padding/sticky
offset) so page content clears the bar; ensure page-level action buttons aren't occluded. **Effort: ~1 day.**

### B4 · Widen Control Tower settings pages — 🔴 LAYOUT
Increase the settings content max-width (the settings pages currently constrain narrow), keep responsive
at 375/768/1280/1920. One shared settings layout container change. **Effort: ~0.5 day** (verify each
settings page after).

---

## Workstream C — Requirements gate: BYOK/Managed stepped wizard (ask #5)

### C1 · Inline stepped BYOK/Managed resolver — 🟡 PARTIAL
**Current:** [`ModelRequirementResolver.tsx`](frontend/apps/control-tower/src/components/features/requirements/ModelRequirementResolver.tsx)
is a **two-card chooser** that routes to `/settings/models`. The richer pieces already exist on the
settings page: [`AddSourceSections.tsx`](frontend/apps/control-tower/src/components/features/models/AddSourceSections.tsx)
(add BYOK key + **validate/test connection**), [`CostTransparency.tsx`](frontend/apps/control-tower/src/components/features/models/CostTransparency.tsx)
(managed cost display), [`ModelPicker.tsx`](frontend/apps/control-tower/src/components/features/models/ModelPicker.tsx).
The gap is the **inline, in-flow stepped wizard** the ask specifies — it currently *bounces the user out*
to settings instead of resolving in place and auto-advancing.

**Build (reusing existing logic, not rewriting it):**
- **BYOK branch:** step → provider grid with **official SVG icons** (already have `IntegrationIcon`);
  multi-select; each selected provider reveals an inline key field; "next" runs the **existing**
  validate + test-connection; on success show the success state and **auto-advance** to the original flow.
- **Managed branch:** step → managed-model list with per-model **input/output/cache** costs (reuse
  `CostTransparency`); the *prior* view shows only "pay as you go"; **single**-select → proceed.
- Keep the actual persistence + validation calls the settings page already uses (`lib/api` + the
  requirements resolver contract). This is a **UX assembly** task over built primitives, not new backend.

**Wires:** `ModelRequirementResolver.tsx` (becomes a multi-step), reuse `AddSourceSections`/`CostTransparency`/
`ModelPicker`, `requirement-resolvers.tsx`. **Effort: 3–4 days** (polish-heavy; "aesthetically pleasing
and seamless" is the bar).

---

## Workstream D — EMAOP: channels, chat strictness, premium, integrations (asks #7, #8, #9, #18, #26)

### D1 · Telegram/WhatsApp/Slack/email agent messaging — ✅ BUILT (residual: two-way chat)
**Current — already built** in [`internal/channels`](backend/orchestrator/internal/channels): Telegram,
WhatsApp, Slack (+ OAuth), Teams adapters delivering **approval cards** (Approve/Deny buttons),
signature-verified **inbound webhooks**, escalation-id mapping with **RBAC re-check on every action**,
MAL-safe content, plus **informational Notices** (alerts/notifications). So "agent sends a message; user
approves/declines/gets alerts via those channels, per RBAC" = **done**.

**Residual (net-new):** free-form **two-way chat** ("then user can chat") over those channels — today the
inbound path handles structured approval taps + a link handshake, not arbitrary conversational turns
routed back into the agent loop. **Build:** an inbound-message → agent-turn bridge (still RBAC- and
MAL-gated, still audited) for Telegram/WhatsApp/Slack. Email two-way already partially exists via the
email approver seam. **Effort: 3–5 days** (the governance/replay-safety is the careful part).

### D2 · EMAOP chat strictness — single-agent, RBAC-scoped, on-topic — 🟡 PARTIAL
**Current:** `components/features/chat` exists (agent chat). **Build three guarantees:**
1. **Single-agent binding + switch:** the chat session is pinned to one selected agent; switching agents is
   an explicit action in the chat UI (no cross-agent bleed).
2. **RBAC-scoped capabilities (backend-enforced):** the agent must **not offer** actions the user's role
   can't perform (e.g. approvals) — filter the tool/option set by the caller's RBAC **server-side**, and
   if asked, politely decline with what they *can* do. This reuses the existing RBAC + escalation role
   checks; the new part is scoping the **offered** options, not just blocking execution.
3. **Topic guard:** off-scope requests (politics, etc.) are politely, professionally refused with a
   redirect to what the agent *can* help with — a governed system-prompt policy + a lightweight
   classifier on the input (reuse the injection-validator seam pattern).

**Wires:** chat feature + a server-side option-scoping filter + a topic policy. **Effort: 3–4 days.**

### D3 · EMAOP enterprise-premium look/feel (beat "openclaw") — 🟡 PARTIAL
Not a single feature — a **craft pass** anchored by the brand system (Black & Apple-Silver, LOCKED) plus
the concrete trust-builders in this plan: the **transparency drawer (B1)**, **strict trustworthy chat
(D2)**, **seamless requirement wizard (C1)**, **premium loading (B2)**. Recommend a dedicated design pass
over the EMAOP builder + run surfaces (motion discipline, empty/loading/error states, density). **Effort:
scoped separately** — treat as a review-driven epic, not a checkbox.

### D4 · Expand EMAOP integrations + built-in templates (beat LangChain) — 🟡 PARTIAL
**Current:** a rich integration/capability base + framework adapters + MCP catalog. **Build (research-led):**
- **Integrations:** add high-demand categories the ask names — email providers (Gmail/Outlook/SendGrid/
  Resend), project management (Jira/Linear/Asana/ClickUp/Monday), plus CRM/support/data. Prioritise by the
  gap vs. LangChain's toolkit and by connector depth (OAuth-refresh — see the known connector gap).
- **Templates:** expand the built-in EMAOP agent templates (support triage, RevOps, data-ops, compliance
  monitor, etc.), all editable. Deliver as a curated template catalog surfaced in the builder.
- Sequence behind the categorization unification (WS-H) so everything lands into one taxonomy.
**Effort: research + iterative — size after the research spike.** (Cross-reference the existing
`Actrone_Connector_Integration_Depth_Plan.md` + `Actrone_Integrations_and_Capabilities_Plan.md`.)

---

## Workstream E — Feedback & docs assistant (asks #3, #4)

### E1 · Docs AI assistant as a resizable right drawer — 🟡 PARTIAL
**Current:** [`DocsLayoutClient.tsx`](frontend/apps/marketing/src/app/%28marketing%29/docs/DocsLayoutClient.tsx)
already has an **"Ask Assistant"** button + an inline chat input. **Build:** on trigger (button *or*
focusing the inline input), open the chat as a **right-side drawer** that is responsive, **drag-resizable**
(width), and has an **expand** control for a wider view. Keep the inline input as the entry point. Reuse a
single drawer primitive (shared with B1's agent drawer). **Effort: 2 days.**

### E2 · Platform-wide bad/fine/good feedback + analytics — 🔴 NET-NEW
**Current:** only **per-doc** [`DocFeedback.tsx`](frontend/apps/marketing/src/components/docs/DocFeedback.tsx)
exists — no platform-wide system, no backend store, no view. **Build:**
- A tiny **feedback widget** (bad / fine / good, **no free-text** per the ask) mountable on any surface,
  carrying context (route, feature, agent/session id where relevant).
- Backend: a `feedback` table + append-only ingest endpoint (idempotent, RBAC-scoped, PII-free by
  construction since there's no text field) + structured logging.
- A **health view**: aggregate score over time / by surface (a simple sentiment index), shown to admins in
  Control Tower ("how are we doing"). Consider wiring the signal into the observability stack.
**Effort: 3–4 days** (widget + store + admin view).

---

## Workstream F — Monetization & billing (asks #15, #25, #13)

### F1 · In-app billing in Control Tower — ✅ BUILT (residual: upgrade context)
**Current:** [`settings/billing/page.tsx`](frontend/apps/control-tower/src/app/%28app%29/settings/billing/page.tsx)
already does **Stripe Checkout + Customer Portal in-app** (no bounce to marketing pricing), with webhook-
driven tier updates. So the core ask ("upgrade directly from Control Tower, not the marketing pricing
page") is **done**. **Residual:** make the upgrade view state *exactly what the org has today* and *all
options available to them* (current plan card + diff vs. each higher tier + what each unlocks). **Effort:
1–2 days** of polish.

### F2 · Monetization for 10× revenue + complete the strategy doc — 🟡 PARTIAL
**Current:** [`docs/monetization-strategy.md`](docs/monetization-strategy.md) + a real billing spine
(metering → Stripe, entitlements, BYOK fee). **Build (doc + FE alignment):**
- Audit the codebase for **every meterable event** (task runs, routing spend, memory ops, voice minutes,
  browser sessions, A2A hops, connector calls, marketplace installs, BYOK markup, self-host licenses) and
  ensure each has a **revenue point** in the strategy doc.
- Fold in the monetization content from the **EMAOP integration plan** (the ask flags it) into one complete
  strategy: pricing surfaces, expansion levers (usage tiers, governance/assurance as premium, marketplace
  rev-share, insurance-as-substrate), and realistic market-anchored numbers.
- **Align the frontend** to the finalised model (pricing cards, in-app upgrade options, usage meters).
**Effort: doc = 1–2 days; FE alignment folds into F1.** (Analysis task — no new billing backend implied
beyond what metering already emits.)

### F3 · "Most Popular" text on Scale card → black — 🔴 TRIVIAL
One style change on the pricing card badge (token-correct, not a hardcoded hex). **Effort: 15 min.**

---

## Workstream G — Compliance & data-law frameworks (ask #16) — ✅ APPROACH LOCKED

**Launch markets: wave 1 is the United States, Canada, the United Kingdom, Ireland, the Netherlands and South Africa; Australia and Kenya come in wave 2** (`Actrone_Launch_Markets.md`). Recommended and
approved approach: **build ONE shared, GDPR-shaped compliance engine first, then ship each market as a
delta off it** — this is *faster* for Africa (and every market), not "EU before Africa," because POPIA,
NDPA, PIPEDA, CCPA and the rest are all rights-based laws modelled closely enough on GDPR that they become
configuration deltas rather than ground-up builds.

**Build order:**
1. **Shared engine first (cheapest, highest-leverage):** formalise **GDPR** into
   [`compliance/catalog.go`](backend/orchestrator/internal/compliance/catalog.go) by re-mapping the
   controls we already have (DPA automation `internal/agreements`, right-to-erasure/provable-forgetting,
   EU residency pinning, `compliance_gdpr`). This delivers the reusable machinery every other market
   reuses: the **per-jurisdiction DPA template engine** + the **data-subject-rights flows**
   (access / erasure / portability — erasure already exists via memory Moat F).
2. **First-wave market deltas off the engine:**
   - **US** — mostly *surface* what we already have (SOC 2 + DPA + ISO); add **CCPA/CPRA** (California) as
     the notable state-law delta. Lightest of the four.
   - **EU** — GDPR, delivered by step 1.
   - **Africa** — **POPIA** first (South Africa — most mature enforcement, the Information Regulator),
     then **NDPA 2023** (Nigeria — regulator NDPC; **not** the superseded NDPR), then **Ghana GPA**.
   - **Canada** — **PIPEDA** (federal) + **Quebec Law 25**.
3. **Later wave:** **Australia** (Privacy Act / **APPs**).

- **Trust center + entitlements:** expose each new framework in the trust center and add
  `compliance_popia` / `compliance_ndpa` / `compliance_pipeda` / `compliance_ccpa` / … entitlements
  alongside the existing `compliance_gdpr`.
**Effort:** shared engine ~3–4 days; each market delta ~1–2 days on top (much less than the earlier
per-framework ~2–3 day estimate, precisely because of the shared engine). ⚠️ **Legal review required** —
these are legal assertions, not just code; nothing goes live without sign-off per jurisdiction.

---

## Workstream H — MCP & integration categorization (asks #20, #21) — ✅ SCOPE LOCKED

**Decision: "curated expansion + custom-connect," NOT "mirror everything."** Mirroring every provider's
server is the wrong model — unbounded maintenance, and every pre-listed server is an implicit security
endorsement (MCP servers are a real injection/exfil surface). **Build:**
- **Add a trust tier to the catalog:** `verified` (we tested it) / `community` (listed, caveated) /
  `custom` (the tenant's own via `privatecatalog.go`). This lets the catalog grow reputationally without us
  personally vetting every entry, and lets the UI badge trust honestly.
- **Unify the taxonomy:** one functional category set (Messaging, E-commerce, Productivity/PM, Payments,
  Data, DevOps, CRM, Support, …) shared by the MCP catalog, native connectors, and channels, so the UI
  groups everything consistently. Re-tag [`mcphub/catalog.go`](backend/orchestrator/internal/mcphub/catalog.go)
  (currently role-ish categories) + the capability registry onto it.
- **Expand the `verified` catalog** along those categories with vetted servers (do a current-2026 search
  for widely-used, actively-maintained servers per category). **Keep custom-connect** as the long-tail path.
- ⚠️ **Sequence after/with the OAuth-refresh connector depth work** (the known "#1 connector gap": pasted
  bearer tokens die after ~1h). Adding OAuth-needing servers before that lands would ship broken
  integrations. Shares the sequencing prerequisite with **D4**.
**Effort: 2–3 days** (trust tier + taxonomy + re-tag + curated additions), after the OAuth prerequisite.

---

## Workstream I — CLI actionable failures + UX (ask #10)

**Current:** `actrone-cli` has styled output + a self-contained client; **no per-error remediation.**
**Build:** a remediation map keyed by error kind (auth/config/network/validation/server) that, on failure,
prints **specific next steps** ("run `actrone auth login`", "check `ACTRONE_API_URL`", "your key lacks
scope X — …"). Return actionable text alongside the styled error result. **Effort: 1–2 days.** (Aesthetic
UX is already decent; this is the substantive part.)

---

## Workstream J — Platform infra & polish (asks #6, #11, #12, #13→F3, #14, #19)

### J1 · LISTEN/NOTIFY fleet-wide instant refresh — 🔴 NET-NEW
**Context:** this is my own prior note. The managed-catalog (and similar) reload uses a **TTL refresh**
(`ManagedCatalogRefreshInterval`), so a write is instant on the writing instance and peers lag by the
interval. **Build:** a Postgres `LISTEN/NOTIFY` (or Redis pub/sub) push so an admin write fans out
instantly fleet-wide; keep the TTL refresh as the fallback (belt-and-braces). Scope: the managed-catalog
reload first, then reuse the primitive for other TTL-refreshed caches. **Effort: 2–3 days** (a small
`pglisten` helper + wire the reload trigger; must be resilient to reconnects).

### J2 · Trivy CVE-2026-33634 — ✅ ALREADY MITIGATED (residual: sweep)
**Finding:** [`infra/.github/workflows/terraform-checks.yml`](infra/.github/workflows/terraform-checks.yml)
**already** installs the Trivy **binary pinned + checksum-verified** (v0.55.0, pre-compromise) and
explicitly **avoids the compromised `trivy-action`/`setup-trivy` marketplace actions** — with a comment
citing the tag force-push. That is exactly the correct mitigation for CVE-2026-33634 (the malicious
v0.69.4 + force-pushed action tags, CVSS 9.4). **Residual:**
- **Sweep** every workflow in every repo to confirm **none** use `aquasecurity/trivy-action@…` or
  `setup-trivy@…` by tag, and none pull `trivy:0.69.4`.
- Rotate any CI token that could have been exposed if a compromised action ever ran (belt-and-braces;
  likely N/A given the binary approach was used from the start).
**Effort: ~0.5 day audit.** No app-code change.

### J3 · `.env.example` for every repo — ✅ CONFIRMED SCOPE (examples only, no committed `.env`)
**Decision (your call):** **`.env.example` files ONLY.** No committed `.env` with values — not even
non-secret dev defaults. This keeps us fully aligned with CLAUDE.md §5.3 and avoids the exact class of
exposure CVE-2026-33634 exploited (secrets reachable from the repo/CI).
**Current:** only `backend/.env.example` + `actrone-memory-py/.env.example`; most repos have neither.
**Build:**
- Give **every** repo a complete, well-commented **`.env.example`** documenting **all** vars — including the
  new ones from this plan (`NEXT_PUBLIC_DEV_TIER`, the `*_PACK_*` feature-pack toggles, `RERANK_*`, etc.)
  — with **placeholders** for secrets and **safe non-secret example values** for local config (URLs, ports,
  flags) shown *inside the example file only*.
- Confirm every repo's `.gitignore` excludes the real `.env` (developers copy `.env.example` → `.env`
  locally; that copy is never committed).
- **No live keys, no committed `.env`.**
**Effort: ~1 day.**

### J4 · SEO top-notch + own the category vocabulary — 🟡 PARTIAL
**Current:** marketing has Next metadata. **Build:** a metadata/SEO pass — per-page titles/descriptions
using the **category vocabulary** we want to own (governed agent OS / governed action layer / etc.),
Open Graph + Twitter cards, JSON-LD structured data (Organization/Product/FAQ), sitemap/robots, canonical
URLs, and consistent category phrasing across marketing + docs. **Effort: 2–3 days.**

### J5 · Tier-4 cosmetic — retired brand hex only in aura/icon/tests — ✅ VERIFY
Matches the known residual (the monochrome rebrand is fully applied; retired hex like `#ADA8A2` survives
only in non-UI aura/icon internals + tests). **Build:** verify with a grep sweep; optionally purge the
last references from `lib/aura/state.ts`, `app/icon.svg`, and tests. **Effort: ~0.5 day.**

---

## Suggested sequencing

**Phase 0 — quick wins & safety (≈1 wk):** F3 (Most Popular black), J5 (cosmetic verify), J2 (Trivy
sweep), B3 (header bug), B4 (settings width), A1 (dev tier), J3 (`.env`, after you confirm the secret
boundary).

**Phase 1 — rollout enablers (≈2 wks):** A2 (feature packs — unblocks phased launch), E2 (feedback),
E1 (docs drawer), C1 (BYOK/Managed wizard).

**Phase 2 — trust & premium (≈2–3 wks):** B1 (transparency drawer), B2 (loading system), D2 (chat
strictness), D3 (premium craft pass).

**Phase 3 — reach & revenue (≈3 wks+):** G (data-law frameworks, Africa-first), F1/F2 (billing context +
monetization doc), H (categorization + MCP expansion), D4 (EMAOP integrations/templates), D1 (two-way
channel chat), J1 (LISTEN/NOTIFY), J4 (SEO), I (CLI remediation).

**Cross-cutting:** every UI item must meet CLAUDE.md §8 (tokens, a11y, loading/error/empty states, SVG
icons, brand LOCKED). Every backend item: parameterised queries, RBAC in the service, structured errors,
idempotent writes, audit where governed.

---

## Open decisions for you

1. ~~**`.env` secret boundary (J3):**~~ ✅ **RESOLVED — `.env.example` files ONLY, no committed `.env`.**
   See J3.
2. ~~**Feature-pack taxonomy (A2):**~~ ✅ **RESOLVED — pack list confirmed** (`core / emaop / marketplace /
   voice / governance / compliance / self_host`); enablement + default semantics + composition specified in
   **A2.1** (per-pack env booleans; prod default OFF / dev default ON; deps auto-enable so `core` stays on
   under EMAOP).
3. **Data-law priority (G):** confirm Africa-first order (POPIA → NDPR → GPA) before GDPR formalisation.
4. **MCP catalog scope (H):** confirm "curated expansion + custom-connect" over "mirror everything."
5. **EMAOP integration targets (D4):** which categories/tools first (email + PM named; CRM/support next?).
