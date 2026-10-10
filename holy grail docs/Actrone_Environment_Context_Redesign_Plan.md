# Actrone: Environment Context Redesign Plan

> **Status:** Design plan, not yet built. Grounded in a direct read of the current implementation
> (`stores/environment.ts`, `TopBar.tsx`, `useEnvironmentPipeline.ts`, `internal/domain/orgenvironment.go`,
> `internal/domain/envpromotion.go`, `internal/domain/api_key.go`, `internal/envledger/`,
> `internal/handler/http/org_environments.go`), not a description of shipped behaviour.
> **Scope:** replaces the single global TopBar environment switcher with environment context that lives
> inside each feature surface, and separates two concerns the current design conflates under one header.
> **Owner:** Matt.
> **Precedence:** inherits `../CLAUDE.md` (workspace) and `CLAUDE.md` (Actrone). Brand is LOCKED (Black &
> Apple-Silver); every new UI element below uses `@actrone/ui` tokens, no hardcoded colour/spacing.
> **Related:** `internal/domain/orgenvironment.go`, `internal/domain/envpromotion.go`,
> `internal/domain/api_key.go`, `internal/envledger/`, `frontend/apps/control-tower/src/stores/environment.ts`,
> `frontend/apps/control-tower/src/components/layout/TopBar.tsx`,
> `frontend/apps/control-tower/src/hooks/useEnvironmentPipeline.ts`.

---

## 0. TL;DR

The current design puts one environment control in the TopBar and has it do three unrelated jobs at
once: (1) which environment Agent Studio builds/tests/promotes against, (2) which environment's
traces/tasks/agents/connectors a user is currently viewing, and (3) the org's shared, audited "current
operating environment" server-side state. Conflating these is the direct cause of the friction this
plan resolves: a developer who flips to production to check traces silently drags Studio into
production too; a developer who defaults to development to build safely can't see their production
traces without remembering to flip back; and (the finding that sharpened this plan) **promoting one
agent currently changes what environment every other user in the org sees by default on their next page
load**, because `SwitchActive`/`Promote` mutate one shared ledger row, not a personal preference.

The fix is not a switcher in every feature. It is recognising that "environment" plays four genuinely
different roles across the product, giving each its own narrow, purpose-fit UI local to the feature that
needs it, and splitting the one overloaded `X-Actrone-Env` header into two independent mechanisms with
different scope, different defaults, and different audiences:

1. **Build & promote context (Studio only).** The existing, real, audited org-ledger promotion pipeline
   (`envledger`, `internal/domain/envpromotion.go`), relocated from global chrome into Studio itself,
   always opening at development, with a visible promotion-ladder widget so a promote action is seen
   without silently moving what you're actively editing.
2. **Browse context (agents, connectors, capabilities lists).** Defaults to showing every environment at
   once, clearly labelled per row; a create/edit flow for one specific item still requires an explicit,
   single environment (you cannot have one connector config that is simultaneously dev and prod).
3. **Stream context (traces, tasks, audit log).** Defaults to all environments, labelled per row, with an
   explicit, per-view, per-user **"Set as default"** action (not silent auto-remember) so a user whose
   real work is mostly production doesn't have to re-filter every session.
4. **No context.** Org settings, billing, user profile: untouched, no environment UI, because none of
   these are environment-scoped today.

---

## 1. Motivation

### 1.1 The friction this resolves (established across the design discussion this plan documents)

- A developer using Studio, having just checked production traces, has Studio silently inherit that
  context and can build/test against production connectors without any warning.
- A developer working entirely in code (native SDK, BYOF-connected, or BYOF-hosted) never touches
  Studio, but still has to fight a global switcher defaulted away from where their real traffic lands to
  see their own traces.
- **The sharper finding from reading the actual code:** `useEnvironmentPipeline.ts`'s `promote`/
  `switchEnv` call `internal/envledger.Service.Promote`/`SwitchActive`, which mutate `OrgEnvironment`'s
  single `active` rung, an **org-wide, shared, audited row**, not a per-browser preference. Every other
  session in that org adopts the new active environment on its next ledger fetch
  (`useEnvironmentPipeline`'s `hasBoundActive` binds the local store to the server's `active` value on
  load). So today, one developer promoting their agent can silently change what environment a
  *completely different teammate's* Control Tower session defaults to. This is the same "one toggle,
  too many jobs" problem already diagnosed, just occurring at the org level instead of the browser-tab
  level, and it needs to be designed out explicitly, not just moved.

### 1.2 What "environment" actually means, precisely, today (so the redesign doesn't guess)

Four real mechanisms exist and this plan must account for every one of them without breaking what
already works:

- **`OrgEnvironment` / `OrgLedger`** (`internal/domain/orgenvironment.go`): per-tenant, per-rung status
  (`locked | unlocked | active`), a readiness score, and promotion audit fields (`promoted_at`,
  `promoted_by`, `promoted_from`). `DefaultLedger` starts a new org with development active, everything
  else locked. This is real, audited, org-wide state, not UI state.
- **`EnvPromotion`** (`internal/domain/envpromotion.go`): the append-only record of promoting *one
  logical agent* (keyed by `AgentName`, stable across environments) from one rung to the next, gated by
  the same governance diff as an in-environment version promote. This is the per-agent granularity that
  already exists and that this plan's Studio redesign should be built on.
- **API-key environment binding** (`internal/domain/api_key.go`): every key is minted bound to exactly
  one environment, with an authoritative prefix (`act_live_` / `act_staging_` / `act_dev_`) that auth
  rejects on mismatch. This is what actually determines which environment a piece of code-driven work
  (native SDK, BYOF-connected, BYOF-hosted) lands in, entirely independent of anything in Control Tower's
  UI.
- **`X-Actrone-Env`** (`stores/environment.ts`, stamped by `lib/api/client.ts` on every browser request):
  today this single header is read for two unrelated purposes at once, scoping *both* which environment
  a write/build action targets (Studio) *and* which environment's data a read (traces, agents list,
  connectors) returns. That conflation is the root architectural problem this plan fixes.

---

## 2. The new model

### 2.1 Category A: Build & promote (Studio only)

Studio keeps using the real, existing `envledger`/`envpromotion` machinery, no new backend concept, but:

- **Studio opens at development, always**, regardless of any other page's state, because there is no
  longer any other page whose state it could inherit from (§2.2/§2.3 don't touch the org ledger at all,
  see §3).
- **Promotion becomes per-agent, not org-wide.** Studio's "Promote to staging" action calls the
  per-agent `EnvPromotion` path (`ValidatePromotionPath` + the governance-diff-gated promote already
  modelled in `envpromotion.go`), not `envledger.Service.SwitchActive`. This is the load-bearing change
  that removes the cross-user surprise in §1.1: promoting Priya's agent updates *that agent's* ladder
  status and audit trail; it does not flip any shared "active" pointer another teammate's session reads.
- **A promotion-ladder widget, always visible while editing an agent in Studio:** development (active,
  what you're editing) → staging (promoted or not, click to view) → production (promoted or not, click to
  view). Promoting updates this immediately. Viewing a promoted rung opens it read-only (or as a distinct,
  separately-confirmed edit session, §9 open decision); it never silently retargets the live editing
  canvas.
- **`OrgEnvironment`'s role narrows** to what it is actually needed for once promotion is per-agent: the
  **readiness gate** (can this org promote *anything* into staging/production at all, the unlock status
  and readiness score), not "which environment is currently being viewed or edited by anyone." This is a
  real, scoped backend semantic change; see §5.

### 2.2 Category B: Browse (agents, connectors, capabilities lists)

- List views (`/agents`, `/connectors`, `/capabilities`) default to **all environments**, one list,
  each row carrying a small environment badge (dev/staging/prod), consistent with how `EnvironmentPill`'s
  visual language already works today, just rendered per-row instead of as a single global pill.
  Optional in-page filter, not global.
- Opening one specific item shows a read-only badge for the environment that item belongs to. No
  switcher on a detail page, because you navigated to a specific row; if you want the other environment's
  version, you navigate to that row (or, for agents, use Studio's ladder, §2.1).
- **Create/edit requires an explicit environment**, defaulted to development, because an item's config
  (a connector's credentials, a capability's scopes) cannot itself be "all environments." This mirrors
  how API keys already work (§1.2): the create form is the one place a deliberate, single choice is
  unavoidable, and defaulting it low is the same safety posture as Studio.

### 2.3 Category C: Streams (traces, tasks, audit log)

- Defaults to **all environments**, newest-first, per-row badge, same principle as §2.2 but for
  time-ordered event data rather than owned entities. This is where blending environments together is
  actually *useful*, not just tolerable: a developer watching both a local dev run and live production
  traffic in one glance is a real, common need, not a compromise.
- **Explicit, per-view, per-user "Set as default"** (not implicit auto-remember): a user who is mostly
  watching production can pin that as their default for *this view specifically*. First-ever visit
  (nothing pinned) always shows all-environments, so a new user is never confused about where their data
  went before they've had a chance to set anything. Implicit auto-remember was considered and rejected,
  §9 explains why.

### 2.4 Category D: No environment context

Org settings, billing, member management, user profile: no change, no environment UI, because none of
this data is environment-scoped today and this plan does not make it so.

---

## 3. The technical split: two independent mechanisms, not one shared header

This is the core engineering change, and it is what actually fixes §1.1's problems rather than just
hiding them behind different UI.

- **`X-Actrone-Env` narrows to mean exactly one thing: "the org's build/promotion context," read only by
  calls Studio makes.** Nothing else sends it. The org-ledger's `active` rung (§2.1) is what this header
  reflects, and it changes only through Studio's own promote/switch actions, scoped as described in §2.1
  (promotion is per-agent; the ledger's `active`/`SwitchActive` semantics are revisited in §5, not simply
  left as today's org-wide toggle).
- **A new, separate, explicit `env` query parameter on every list/stream GET endpoint** (`/v1/tasks`,
  `/v1/agents`, `/v1/connectors`, `/v1/capabilities`, the audit log endpoint), supplied by each page's own
  local filter state, defaulting server-side to **no filter (all environments)** when omitted. A query
  parameter, not a header, because these are idempotent reads where the scope is a visible, bookmarkable,
  shareable part of the request, exactly the REST-idiomatic shape, unlike `X-Actrone-Env`'s role as
  ambient write-context.
- **Create/edit requests for Category B/C-adjacent entities (connectors, capabilities, API keys) carry
  their target environment as an explicit body field**, not a header, since it's a one-time, deliberate
  choice made in a form, not an ambient default (§2.2).
- Net effect: a browser tab can be looking at all-environments traces, a specific development connector,
  and (in a separate tab) building in Studio against development, all simultaneously, with zero shared
  ambient state to leak between them, because there is no longer one value all of them read.

---

## 4. Persistence model

- Category C's "Set as default" persists **per view, per user, per org**, reusing the exact mechanism
  already proven in `stores/environment.ts` (localStorage keyed by org, narrowed to also key by view
  name; a cookie mirror only where a view needs SSR-consistent scoping). Not new infrastructure, a
  narrower application of what already exists.
- Category A (Studio) persists nothing across sessions by design: it always opens at development. There
  is deliberately no "remember my last Studio environment" setting, because the entire point is that
  Studio's starting state must never depend on anything that happened earlier, in that session or a prior
  one.
- Category B's list-view "all environments" default is not user-overridable as a persisted default in
  v1 (unlike streams, browsing an entity list benefits less from a sticky filter and more from always
  seeing the full picture); revisit only if usage data says otherwise (§7).

---

## 5. Backend changes

- **`internal/envledger.Service`:** `Promote` gains a per-agent path (reusing `internal/domain/envpromotion.go`'s
  `EnvPromotion`/`ValidatePromotionPath`/governance-diff gate) as the mechanism Studio calls, instead of
  mutating the org-wide `active` rung as a side effect of one agent's promotion. `SwitchActive` is
  re-scoped to mean "advance the org's unlock/readiness ladder" (still real, still audited, still gates
  whether staging/production are reachable at all), not "set what everyone's session defaults to."
  **This is the one genuinely load-bearing backend semantic change in this plan** and needs its own
  focused implementation + migration-of-meaning review before Studio is rewired to it (§9 open decision:
  confirm this narrowing doesn't remove a readiness/compliance signal something else depends on).
- **List/stream handlers** (`tasks.go`, `agents.go`, `connectors.go`, capabilities, the audit log
  handler): add an optional `env` query parameter, validated against the same `Environment` enum
  everything else uses; omitted or `env=all` returns every environment's rows, each already carrying its
  `env` column (every table in this codebase is already `(tenant_id, env, ...)`-scoped, so this is a
  `WHERE` clause relaxation, not a data-model change, no new migration required).
- **Create/edit endpoints** for connectors/capabilities/API keys: confirm each already accepts (or add)
  an explicit `env` body field rather than relying on the `X-Actrone-Env` header, since §3 removes that
  header from these call paths entirely.
- No new tables, no new migration. This is an API-contract and handler-logic change over existing,
  already-env-scoped data.

---

## 6. Frontend changes (Control Tower)

All FE reuses `@actrone/ui` primitives and the locked Black & Apple-Silver tokens, lucide icons at
`strokeWidth={1.5}`, sentence case. Every async surface keeps its existing loading/error/empty states.

- **Remove `TopBar.tsx`'s `EnvironmentPill`/switcher entirely.** The `NonProdIndicator` concept (a subtle
  "you are not in production" reminder) is not deleted outright, it relocates into Studio as part of the
  promotion-ladder widget (§2.1), since that is the one remaining place a non-prod context genuinely
  needs an ambient reminder.
- **`useEnvironmentPipeline.ts`** is rewired to Studio-local scope: no longer binds a global store on
  mount, no longer fires `actrone:env-changed` for the whole app, only drives the ladder widget local to
  whichever agent is open in Studio.
- **New shared component: `<EnvFilterBar>`**, reused across `/agents`, `/connectors`, `/capabilities`,
  `/traces`, `/tasks`, and the audit log: renders the per-row badge legend, the in-page filter, and (only
  on stream views) the "Set as default" action. One component, one visual language, rendered locally on
  each page, never in global chrome, so it stays consistent without being centralised in state.
- **New shared component: `<EnvBadge>`**, the small per-row/per-item label used everywhere in §2.2/§2.3,
  reusing `EnvironmentPill`'s existing tone tokens (neutral/warning/red) so the visual language doesn't
  fork from what already exists.
- **`lib/api/client.ts`:** stop stamping `X-Actrone-Env` from a global store on every request. Studio's
  calls pass it explicitly from the Studio-local pipeline hook; list/stream calls pass `env` as a query
  param from each page's local filter state; create/edit calls pass `env` in the request body. `lib/api/server.ts`
  loses its cookie-based env read for the same reason, Server Component data fetches for list/stream pages
  pass `env` from the URL's own query state instead.
- **`stores/environment.ts`** is deleted as a global store. `lib/deployment-env.ts`'s pure `EnvId`/
  `ENVIRONMENTS`/`coerceEnv` types are kept (still needed by every local filter and by Studio), just no
  longer backing one shared instance.

---

## 7. Testing strategy (CLAUDE.md §7/§8)

| Layer | Coverage |
| --- | --- |
| **Unit** | `envledger` per-agent promote path vs. the (narrowed) org-wide `SwitchActive`, table-driven over every ladder position; `env` query-param parsing on list/stream handlers (omitted → all, invalid → rejected, valid → filtered); the frontend `<EnvFilterBar>`/`<EnvBadge>` components' pure logic (default state, "Set as default" persistence key derivation). |
| **Integration** | List/stream endpoints return correctly `env`-partitioned rows for a multi-environment fixture tenant; Studio's per-agent promote does **not** change another session's read of the org ledger's readiness/unlock state for an unrelated agent. |
| **Regression (the headline test)** | A scripted two-session test: session A promotes an agent in Studio; session B, already viewing the traces stream with "all environments" set, observes **no change** to its own filter/default. This is the direct regression test for §1.1's core finding. |
| **E2E** (Playwright) | Studio opens at development on load regardless of prior TopBar state (which no longer exists, confirming its removal didn't leave a dangling default); traces page loads all-environments by default, "Set as default" persists across a reload; a connector create form requires an explicit environment before submit is enabled. |
| **CI gates** | lint 0-warnings, race/`-forked`, coverage threshold, contract breaking-change check (the `env` query-param additions are additive, not breaking, verified against the OpenAPI spec). |

---

## 8. Phased delivery

- **Phase 0: Backend seam.** Add the per-agent promote path to `envledger`/`envpromotion` alongside
  (not replacing yet) the existing org-wide `SwitchActive`; add `env` query-param support to list/stream
  handlers, defaulting to all-environments; add explicit `env` body fields to create/edit endpoints where
  missing. Fully backwards-compatible: the old TopBar switcher keeps working unchanged against the old
  paths during this phase. *Exit:* new endpoints exist and are tested, nothing user-facing has changed
  yet.
- **Phase 1: Streams + Browse (Category B/C).** Ship `<EnvFilterBar>`/`<EnvBadge>`, wire `/traces`,
  `/tasks`, the audit log, `/agents`, `/connectors`, `/capabilities` to the new `env` query param and
  all-environments default, ship "Set as default" on stream views. *Exit:* every list/stream page in
  Control Tower shows all-environments by default with a working per-view filter; the old TopBar switcher
  still exists and still works for Studio (not yet migrated).
- **Phase 2: Studio (Category A) + TopBar removal.** Relocate `useEnvironmentPipeline` into Studio,
  build the promotion-ladder widget, rewire Studio's promote action to the per-agent path, remove
  `TopBar.tsx`'s switcher and the global `stores/environment.ts`. *Exit:* the regression test in §7 passes;
  no global environment state remains anywhere in the app.
- **Phase 3: `OrgEnvironment` semantic narrowing, confirmed safe.** Audit every remaining reader of
  `OrgEnvironment.Status`/`active` beyond what Phase 2 already rewired (the readiness-gate use in §5),
  confirm nothing else depended on "active" meaning "currently viewed," and close out the `SwitchActive`
  narrowing. This is sequenced last deliberately: it's the one change with a real blast radius if
  something else was quietly relying on the old shared-active semantics, and Phases 1-2 already deliver
  the user-facing value without needing it done first.

---

## 9. Risks & mitigations, and open decisions

| Risk | Mitigation |
| --- | --- |
| **Narrowing `OrgEnvironment.active`'s meaning breaks something that reads it for a different purpose today** | Phase 3 sequenced last, explicitly gated on an audit of every current reader, not assumed safe. |
| **Removing the TopBar switcher removes a discoverable "where am I" cue some users relied on globally** | Every page that now carries its own `<EnvBadge>`/`<EnvFilterBar>` is *more* explicit about environment than a single ambient pill was, not less; validate with real usage before considering this a regression. |
| **Implicit auto-remember would have been less work than explicit "Set as default"** | Deliberately rejected (§2.3): production visibility is high-stakes enough that a sticky default should be a decision a user made, not a side effect of their last click. |
| **Viewing a promoted rung inside Studio's ladder widget could still tempt users into editing it directly, reintroducing the original hazard** | Open decision below; default posture is read-only unless a separate, explicitly-confirmed edit session is started. |

**Open decisions:**

1. **Does clicking a promoted rung in Studio's ladder widget open it read-only, or as a separately
   confirmed edit session?** Recommend read-only by default (view the staging config, see its own
   promotion history) with an explicit "Edit this environment directly" action gated behind a confirm
   step, so casual clicking never accidentally opens a live production edit.
2. **Does `OrgEnvironment`'s readiness/unlock gate (post-narrowing, §5) still block promotion the same
   way, or does per-agent promotion need its own, possibly lighter, readiness check?** Needs resolution
   before Phase 3, informed by whatever the Phase 3 audit finds.
3. **Should Category B (agents/connectors/capabilities lists) eventually get the same persisted "Set as
   default" filter Category C has?** Deferred deliberately (§4): ship the simpler always-all-environments
   default first, add persistence only if real usage shows list views suffer the same friction streams
   did.

---

## 10. Definition of done

- No global environment switcher or global environment store exists anywhere in the frontend.
- Studio always opens at development; promoting an agent updates only that agent's ladder and never
  changes another session's default anywhere in the app (the §7 regression test is the proof).
- Every list/stream page defaults to all-environments, per-row labelled, with stream views offering an
  explicit, persisted-per-user "Set as default."
- Every create/edit flow for an environment-owned entity requires an explicit environment choice,
  defaulted to development.
- `OrgEnvironment`'s narrowed meaning (readiness/unlock gate, not "currently viewed") is documented and
  every remaining reader confirmed compatible with it.
- CI gates green (lint, race, coverage, contract check); the regression test in §7 is part of the
  permanent suite, not a one-time manual check.

---

*Last updated: 2026-08-07 | Owner: Matt | Scope: Control Tower frontend + orchestrator `envledger`/list
handler changes. No new database migration required.*
