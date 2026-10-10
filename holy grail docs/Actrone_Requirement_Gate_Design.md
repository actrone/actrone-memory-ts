# Actrone Requirement Gate — platform-wide just-in-time provisioning

> **Status refreshed 2026-07-13 (code-verified):** this design is fully **BUILT — 16/16 requirement
> kinds wired**, correcting a prior "14/16, `a2a_trust`+`billing` deferred" status. All 16 `Kind` values
> in `internal/requirements/requirements.go:23-40` (`model, connector, credential, tier, channel,
> approver, environment, region, dpa, api_key, memory, governed_action, purpose_binding, commit_policy,
> a2a_trust, billing`) have a real checker registered in `requirements.BuildCheckers`
> (`internal/requirements/checkers.go:173-282`) and a non-nil dependency wired at
> `cmd/orchestrator/main.go:2786-2915` (`reqDeps`) — including `A2ATrust` (`main.go:2903`, backed by the
> A2A repository) and `Billing` (`main.go:2907`, backed by the billing customer lookup). `Service.Report`
> fail-closes any kind whose checker errors or is missing — a lookup failure never falsely satisfies a
> gate. The frontend `RequirementGate`/resolver-registry generalisation described in §3.2 is **not**
> independently verified by this pass (backend-only audit) — treat that half as unverified
> (unverified 2026-07-13).
>
> A reusable primitive that resolves a **missing prerequisite inline, at the point of need**, with
> transparent options/cost, then persists it and lets the flow continue. Not builder-specific — a
> platform primitive. This design **generalises two things that already exist** rather than inventing
> a new pattern. Distinct from first-run onboarding (persona/goal).
>
> Grounded in: `frontend/src/components/features/EntitlementDenialGate.tsx`,
> `frontend/src/components/features/environments/ReadinessChecklist.tsx`,
> `frontend/src/lib/api/environments.ts` (`ReadinessGate`/`ReadinessReport`),
> `backend/orchestrator/internal/repository/readiness.go`, `internal/envledger`, `internal/entitlements`.

---

## 1. The two existing halves we generalise

1. **`EntitlementDenialGate`** — mounted once in the Control Tower layout, it registers a single
   handler for the API client's `ERR_ENTITLEMENT_REQUIRED` (402) denials and opens the rich
   `UpgradeModal` for that feature. So *any* gated action, from *any* page, fails into "here's what
   you'd get + how to upgrade" instead of a raw error. **This is already the JIT-resolve-on-denial
   architecture — but hardcoded to one requirement kind (tier).**
2. **`ReadinessGate` / `ReadinessReport`** (env promotion) — a typed prerequisite model:
   `ReadinessGate { key, label, required, passed, detail, fix_href }`, rendered by `ReadinessChecklist`
   with a "Fix" deep-link, computed server-side (`repository/readiness.go` + `envledger`). **This is
   already the prerequisite abstraction — but scoped to one flow (promotion).**

**The Requirement Gate = (1)'s single-listener inline-resolve architecture + (2)'s typed gate model,
generalised to every requirement kind, with a resolver registry.** The server stays the real boundary
(it checks + blocks); the gate makes the block legible **and resolvable in place**.

---

## 2. Where it's needed (platform-wide inventory)

Every "you need X before you can proceed" moment. Grouped by **resolution archetype** (which drives the
resolver component), with the requirement kind, where it triggers, and the existing machinery to reuse.

### A. Provision + pay (choice + transparent cost, possibly payment)
| Kind | Triggers at | Reuse |
| --- | --- | --- |
| `model` | builder persona/model step, chat, playground, a task run needing inference | `ModelPicker`, `models/CostTransparency.tsx`, `models/AddSourceSections.tsx` (BYOK sources) — today managed-only in the builder; the resolver offers **BYOK vs managed with per-token cost** |
| `tier` | any entitlement-gated feature | `UpgradeModal` + `EntitlementDenialGate` (already the JIT pattern) |
| `billing` | deploy/run that will incur cost, or over budget/kill-switch | `/cost`, `ConnectPayoutsButton`, budget controls |

### B. Connect + authorise (external auth flow + vaulting)
| Kind | Triggers at | Reuse |
| --- | --- | --- |
| `connector` | builder Actions step, a task calling an unconnected system, installing a capability pack that needs a connection | `IntegrationHub`, `CustomConnectorBuilder`, `/mcp` connect |
| `credential` | connector/tool setup missing a secret | vault seal path |
| `channel` | deploy/escalation needing Slack/Teams delivery | `settings/channels` |
| `a2a_trust` | an agent action targeting a peer org with no trust grant (cross-org fabric) | `actionfabric` trust grants |

### C. Author + govern (config authoring)
| Kind | Triggers at | Reuse |
| --- | --- | --- |
| `governed_action` | builder Actions step references an action not yet governed | enhanced `CustomConnectorBuilder` (Studio WS1) / install a pack |
| `purpose_binding` | agent declares a `Purpose` with no matching `purpose_policy` binding | `/rules` / purpose policy authoring |
| `commit_policy` | first money action with no tenant `gal_commit_policy` | commit-policy authoring |

### D. Configure + execute (select/execute config)
| Kind | Triggers at | Reuse |
| --- | --- | --- |
| `environment` | promoting to an unconfigured env | **env readiness already exists** (`ReadinessChecklist`) |
| `approver` | deploy referencing an unset escalation approver | escalation config |
| `region` | a data-residency-gated action with no region set | `ResidencyPanel` |
| `dpa` / `baa` | an enterprise action requiring an executed agreement | `internal/agreements`, `/compliance` |
| `api_key` | a developer starting with the SDK / docs "try it" | token generation |
| `memory` | an agent needing a memory/vector store not provisioned | memory provisioning |

**Observation:** 16+ trigger points across builder, integrations, tasks, deploy, promotion, compliance,
and developer onboarding. This is unambiguously a **platform primitive**, not a builder feature — which
is exactly why it must be built once and invoked everywhere.

---

## 3. Design of the generalised primitive

### 3.1 Backend — a Requirement service (generalise `readiness.go`)
- A typed **catalog of requirement kinds** (§2). Each kind implements
  `Check(ctx, org, params) → Status{ satisfied bool, detail, fix_href, cost?, resolvable_inline bool }`.
  This is the env-promotion `ReadinessGate` shape, lifted out of promotion into a platform
  `internal/requirements` service (env readiness becomes one *provider* of it).
- `GET /v1/requirements?needs=model,connector:erp:netsuite,...` → a `ReadinessReport` (reuse the exact
  shape) so the frontend can pre-check a set of prerequisites for a flow.
- **Generalise the denial signal:** today the API emits `ERR_ENTITLEMENT_REQUIRED` (402) for tier. Add
  `ERR_REQUIREMENT_UNMET { kind, params, detail }` for any action blocked by a missing prerequisite, so
  a raw API call also fails into inline resolution — not just tier. The server remains the boundary.
- Provisioning a requirement (a credential, connection, policy) is a **governed/audited act** — logged;
  BYOK keys vault-sealed; never returned.

### 3.2 Frontend — `RequirementGate` (generalise `EntitlementDenialGate`)
- **Resolver registry:** `RESOLVERS: Record<RequirementKind, ResolverComponent>` — `model` → a
  BYOK/managed+cost resolver (ModelPicker + CostTransparency + AddSource), `tier` → `UpgradeModal`,
  `connector` → connect flow, `environment` → the existing readiness checklist, etc. New kinds register
  a resolver; the shell is shared.
- **Three ways to invoke** (all backed by the same registry + report):
  - *Imperative* (point of need): `await ensure(['model', 'connector:erp:netsuite'])` — opens a
    **sequenced inline resolver** (sheet), resolves each in order, persists, resolves the promise →
    the caller continues exactly where it paused.
  - *Declarative* (wrap a surface): `<RequireGate needs={[...]}>{children}</RequireGate>` — renders
    children only when satisfied; otherwise the inline resolver. (A general `FeatureGate`.)
  - *Global listener* (safety net): generalise `EntitlementDenialGate` to catch
    `ERR_REQUIREMENT_UNMET` for **any** kind and open the matching resolver — so even an unanticipated
    server block fails into inline resolution instead of a raw error.
- **Presentation contract:** an inline sheet/modal with the resolver, transparent **options + cost/
  tradeoffs** (mandatory for the provision+pay kinds), designed loading/error/empty states, brand
  tokens, `prefers-reduced-motion`, full a11y — CLAUDE.md §8/§9.
- **Persist + resume:** resolve → persist to org (backend / Clerk metadata) → re-`Check` → continue.
  Idempotent: **check-first, never re-ask** a satisfied requirement.
- **Deep-linkable:** every resolver also works as a standalone settings destination via `fix_href`
  (already in `ReadinessGate`), so the same resolution is reachable inline *or* from settings.

### 3.3 Key principles
- **Server is the boundary; the gate makes it legible + resolvable** (the `EntitlementDenialGate`
  philosophy, generalised).
- **Composable** — a flow declares *all* its prerequisites; the gate sequences them ("3 things needed
  to deploy this agent").
- **Transparent** — cost + tradeoffs shown before the user commits (BYOK vs managed, plan price).
- **Entitlement-aware** — a resolver may itself be gated (e.g. BYOK is a paid feature) → the gate nests
  (resolve `tier` before `model:byok`).
- **Auditable** — provisioning is logged; secrets vaulted.
- **Distinct from onboarding** — first-run onboarding sets persona/goal once; the Requirement Gate fires
  *any time, anywhere* a prerequisite is missing.

---

## 4. Build sequencing
1. **Extract the primitive from what exists:** lift `ReadinessGate`/`ReadinessReport` +
   `repository/readiness.go` into a platform `internal/requirements` service; generalise
   `EntitlementDenialGate` → `RequirementGate` shell + resolver registry (tier resolver = today's
   `UpgradeModal`, env resolver = today's checklist). *No new UX yet — just the framework, proving
   parity with the two existing cases.*
2. **Add the `model` resolver** (BYOK-vs-managed + transparent cost) — the highest-frequency gate and
   the one the builder most needs; wires `AddSourceSections`/`CostTransparency` into the shell.
3. **Add `ERR_REQUIREMENT_UNMET`** + the global listener → any blocked action resolves inline.
4. **Add the `connector` + `governed_action` resolvers** — these are exactly what the unified builder's
   "Actions & Connections" step (`docs/Actrone_Unified_Governed_Builder.md` §4) depends on.
5. **Backfill the remaining kinds** (channel, approver, region, dpa, billing, a2a_trust, …) as their
   surfaces adopt the gate.

---

## 5. Relationship to the unified builder
The unified builder (`docs/Actrone_Unified_Governed_Builder.md`) is the **first heavy consumer**: its
"Actions & Connections" step needs the `connector` + `governed_action` resolvers, and its persona/model
step needs the `model` resolver. Build the Requirement Gate as the shared substrate **before/with** the
builder rework so the builder composes it instead of hardcoding one-off setup detours. Every other
surface (tasks, deploy, promotion, compliance, SDK onboarding) then inherits the same seamless UX for
free.
